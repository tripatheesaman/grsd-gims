import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';
import { Asset, AssetPropertyValue, AssetTypeProperty, CreateAssetDTO, UpdateAssetDTO, VALID_PROPERTY_NAMES } from '../types/asset';
import { ensureAssetSpareSchema } from '../services/assetSpareSchema';
import ExcelJS from 'exceljs';
import { backfillSpareCompatibilityFromStockDetails } from '../services/spareCompatibilityMigration';
export const getAllAssets = async (req: Request, res: Response): Promise<void> => {
    try {
        await ensureAssetSpareSchema();
        const { asset_type_id, search, page = '1', pageSize = '20', rrp_status, location, servicability_status, equipment_code } = req.query;
        const pageNum = parseInt(page as string, 10) || 1;
        const pageSizeNum = Math.min(parseInt(pageSize as string, 10) || 20, 2000);
        const offset = (pageNum - 1) * pageSizeNum;
        let query = `
      SELECT a.id, a.asset_type_id, a.name,
             a.equipment_code, a.location, a.rrp_status, a.current_value, a.insurance_amount, a.servicability_status, a.purchase_currency, a.purchase_fx_rate, a.purchase_amount_base,
             a.created_by, a.created_at, a.updated_at,
             at.name as asset_type_name, at.description as asset_type_description
      FROM assets a
      LEFT JOIN asset_types at ON a.asset_type_id = at.id
      WHERE 1=1
    `;
        const params: any[] = [];
        if (asset_type_id) {
            query += ' AND a.asset_type_id = ?';
            params.push(asset_type_id);
        }
        if (search) {
            query += ' AND (a.name LIKE ? OR at.name LIKE ? OR a.equipment_code LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }
        if (rrp_status !== undefined && rrp_status !== null && String(rrp_status).trim() !== '' && String(rrp_status) !== 'all') {
            query += ' AND a.rrp_status = ?';
            params.push(String(rrp_status).trim());
        }
        if (location) {
            query += ' AND a.location LIKE ?';
            params.push(`%${String(location).trim()}%`);
        }
        if (servicability_status) {
            query += ' AND a.servicability_status LIKE ?';
            params.push(`%${String(servicability_status).trim()}%`);
        }
        if (equipment_code) {
            query += ' AND a.equipment_code LIKE ?';
            params.push(`%${String(equipment_code).trim()}%`);
        }
        query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
        params.push(pageSizeNum, offset);
        const [rows] = await pool.query<Asset[]>(query, params);
        let countQuery = `
      SELECT COUNT(*) as total
      FROM assets a
      LEFT JOIN asset_types at ON a.asset_type_id = at.id
      WHERE 1=1
    `;
        const countParams: any[] = [];
        if (asset_type_id) {
            countQuery += ' AND a.asset_type_id = ?';
            countParams.push(asset_type_id);
        }
        if (search) {
            countQuery += ' AND (a.name LIKE ? OR at.name LIKE ? OR a.equipment_code LIKE ?)';
            const searchTerm = `%${search}%`;
            countParams.push(searchTerm, searchTerm, searchTerm);
        }
        if (rrp_status !== undefined && rrp_status !== null && String(rrp_status).trim() !== '' && String(rrp_status) !== 'all') {
            countQuery += ' AND a.rrp_status = ?';
            countParams.push(String(rrp_status).trim());
        }
        if (location) {
            countQuery += ' AND a.location LIKE ?';
            countParams.push(`%${String(location).trim()}%`);
        }
        if (servicability_status) {
            countQuery += ' AND a.servicability_status LIKE ?';
            countParams.push(`%${String(servicability_status).trim()}%`);
        }
        if (equipment_code) {
            countQuery += ' AND a.equipment_code LIKE ?';
            countParams.push(`%${String(equipment_code).trim()}%`);
        }
        const [countResult] = await pool.query<RowDataPacket[]>(countQuery, countParams);
        const total = (countResult[0] as any)?.total || 0;
        logEvents(`Successfully fetched ${rows.length} assets`, 'assetLog.log');
        res.status(200).json({
            data: rows,
            pagination: {
                page: pageNum,
                pageSize: pageSizeNum,
                total,
                totalPages: Math.ceil(total / pageSizeNum)
            }
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching assets: ${errorMessage}`, 'assetLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch assets'
        });
    }
};
export const getAssetById = async (req: Request, res: Response): Promise<void> => {
    try {
        await ensureAssetSpareSchema();
        const { id } = req.params;
        const [assets] = await pool.query<Asset[]>(`SELECT a.id, a.asset_type_id, a.name,
             a.equipment_code, a.location, a.rrp_status, a.current_value, a.insurance_amount, a.servicability_status, a.purchase_currency, a.purchase_fx_rate, a.purchase_amount_base,
              a.created_by, a.created_at, a.updated_at,
              at.id as asset_type_id_full, at.name as asset_type_name, at.description as asset_type_description
       FROM assets a
       LEFT JOIN asset_types at ON a.asset_type_id = at.id
       WHERE a.id = ?`, [id]);
        if (assets.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Asset not found'
            });
            return;
        }
        const [propertyValues] = await pool.query<AssetPropertyValue[]>(`SELECT id, asset_id, property_name, property_value, created_at, updated_at 
       FROM asset_property_values 
       WHERE asset_id = ?`, [id]);
        const [typeProperties] = await pool.query<AssetTypeProperty[]>(`SELECT id, asset_type_id, property_name, is_required, display_order, created_at 
       FROM asset_type_properties 
       WHERE asset_type_id = ? 
       ORDER BY display_order ASC, property_name ASC`, [assets[0].asset_type_id]);
        const asset = {
            ...assets[0],
            asset_type: {
                id: assets[0].asset_type_id,
                name: (assets[0] as any).asset_type_name,
                description: (assets[0] as any).asset_type_description,
                properties: typeProperties
            },
            property_values: propertyValues
        };
        logEvents(`Successfully fetched asset: ${id}`, 'assetLog.log');
        res.status(200).json(asset);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching asset: ${errorMessage}`, 'assetLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch asset'
        });
    }
};
export const createAsset = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await ensureAssetSpareSchema();
        await connection.beginTransaction();
        const { asset_type_id, name, equipment_code, location, rrp_status, current_value, insurance_amount, servicability_status, purchase_currency, purchase_fx_rate, purchase_amount_base, property_values = [] }: CreateAssetDTO = req.body;
        const userId = req.userId;
        if (!asset_type_id || !name || !name.trim()) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Asset type ID and name are required'
            });
            await connection.rollback();
            return;
        }
        if (!equipment_code || !String(equipment_code).trim()) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'equipment_code is required'
            });
            await connection.rollback();
            return;
        }

        const equipmentCodeTrimmed = String(equipment_code).trim();
        if (!purchase_currency || !String(purchase_currency).trim() || purchase_fx_rate === undefined || purchase_amount_base === undefined) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'purchase_currency, purchase_fx_rate, and purchase_amount_base are required'
            });
            await connection.rollback();
            return;
        }

        const purchaseCurrencyTrimmed = String(purchase_currency).trim();
        const purchaseFxRateNum = Number(purchase_fx_rate);
        const purchaseAmountBaseNum = Number(purchase_amount_base);
        const locationTrimmed = String(location || '').trim();
        const rrpStatusTrimmed = String(rrp_status || '').trim();
        const servicabilityStatusTrimmed = String(servicability_status || '').trim();
        const currentValueNum = Number(current_value);
        const insuranceAmountNum = Number(insurance_amount);
        if (!locationTrimmed) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'location is required'
            });
            await connection.rollback();
            return;
        }
        if (!rrpStatusTrimmed) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'rrp_status is required'
            });
            await connection.rollback();
            return;
        }
        if (!['0', '1'].includes(rrpStatusTrimmed)) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'rrp_status must be 0 or 1'
            });
            await connection.rollback();
            return;
        }
        if (!servicabilityStatusTrimmed) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'servicability_status is required'
            });
            await connection.rollback();
            return;
        }
        if (!Number.isFinite(currentValueNum) || currentValueNum < 0) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'current_value must be a non-negative number'
            });
            await connection.rollback();
            return;
        }
        if (!Number.isFinite(insuranceAmountNum) || insuranceAmountNum < 0) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'insurance_amount must be a non-negative number'
            });
            await connection.rollback();
            return;
        }
        if (!Number.isFinite(purchaseFxRateNum) || purchaseFxRateNum <= 0 || !Number.isFinite(purchaseAmountBaseNum) || purchaseAmountBaseNum < 0) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Invalid purchase finance values'
            });
            await connection.rollback();
            return;
        }

        const [existingEquipment] = await connection.query<RowDataPacket[]>(`SELECT id FROM assets WHERE equipment_code = ?`, [equipmentCodeTrimmed]);
        if (existingEquipment.length > 0) {
            res.status(409).json({
                error: 'Conflict',
                message: 'An asset already exists for this equipment_code'
            });
            await connection.rollback();
            return;
        }
        const [assetTypes] = await connection.query<RowDataPacket[]>(`SELECT id FROM asset_types WHERE id = ?`, [asset_type_id]);
        if (assetTypes.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Asset type not found'
            });
            await connection.rollback();
            return;
        }
        const [requiredProperties] = await connection.query<RowDataPacket[]>(`SELECT property_name FROM asset_type_properties 
       WHERE asset_type_id = ? AND is_required = TRUE`, [asset_type_id]);
        const normalizedPropertyValues = Array.isArray(property_values) ? property_values.slice() : [];
        const requiredPropertyNames = new Set(requiredProperties.map(p => (p as any).property_name));
        if (requiredPropertyNames.has('purchase_amount') && !normalizedPropertyValues.some(pv => pv.property_name === 'purchase_amount')) {
            normalizedPropertyValues.push({
                property_name: 'purchase_amount',
                property_value: String(purchaseAmountBaseNum)
            });
        }
        const providedPropertyNames = new Set(normalizedPropertyValues.map(pv => pv.property_name));
        for (const reqProp of requiredProperties) {
            const propName = (reqProp as any).property_name;
            if (!providedPropertyNames.has(propName)) {
                res.status(400).json({
                    error: 'Bad Request',
                    message: `Required property '${propName}' is missing`
                });
                await connection.rollback();
                return;
            }
        }
        const [result] = await connection.query<any>(`INSERT INTO assets (asset_type_id, name, equipment_code, location, rrp_status, current_value, insurance_amount, servicability_status, purchase_currency, purchase_fx_rate, purchase_amount_base, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            asset_type_id,
            name.trim(),
            equipmentCodeTrimmed,
            locationTrimmed,
            rrpStatusTrimmed,
            currentValueNum,
            insuranceAmountNum,
            servicabilityStatusTrimmed,
            purchaseCurrencyTrimmed,
            purchaseFxRateNum,
            purchaseAmountBaseNum,
            userId || null
        ]);
        const assetId = result.insertId;
        if (normalizedPropertyValues.length > 0) {
            const propertyValueRows = normalizedPropertyValues.map(pv => [
                assetId,
                pv.property_name,
                pv.property_value || null
            ]);
            await connection.query(`INSERT INTO asset_property_values (asset_id, property_name, property_value) 
         VALUES ?`, [propertyValueRows]);
        }
        await connection.commit();
        const [assets] = await connection.query<Asset[]>(`SELECT a.id, a.asset_type_id, a.name,
              a.equipment_code, a.location, a.rrp_status, a.current_value, a.insurance_amount, a.servicability_status, a.purchase_currency, a.purchase_fx_rate, a.purchase_amount_base,
              a.created_by, a.created_at, a.updated_at,
              at.name as asset_type_name, at.description as asset_type_description
       FROM assets a
       LEFT JOIN asset_types at ON a.asset_type_id = at.id
       WHERE a.id = ?`, [assetId]);
        const [propertyValues] = await connection.query<AssetPropertyValue[]>(`SELECT id, asset_id, property_name, property_value, created_at, updated_at 
       FROM asset_property_values 
       WHERE asset_id = ?`, [assetId]);
        const [typeProperties] = await connection.query<AssetTypeProperty[]>(`SELECT id, asset_type_id, property_name, is_required, display_order, created_at 
       FROM asset_type_properties 
       WHERE asset_type_id = ? 
       ORDER BY display_order ASC, property_name ASC`, [asset_type_id]);
        const createdAsset = {
            ...assets[0],
            asset_type: {
                id: asset_type_id,
                name: (assets[0] as any).asset_type_name,
                description: (assets[0] as any).asset_type_description,
                properties: typeProperties
            },
            property_values: propertyValues
        };
        logEvents(`Successfully created asset: ${name} (ID: ${assetId})`, 'assetLog.log');
        res.status(201).json(createdAsset);
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error creating asset: ${errorMessage}`, 'assetLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to create asset'
        });
    }
    finally {
        connection.release();
    }
};
export const updateAsset = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await ensureAssetSpareSchema();
        await connection.beginTransaction();
        const { id } = req.params;
        const { name, location, rrp_status, current_value, insurance_amount, servicability_status, property_values, equipment_code, purchase_currency, purchase_fx_rate, purchase_amount_base }: UpdateAssetDTO = req.body;
        const [existing] = await connection.query<Asset[]>(`SELECT asset_type_id, purchase_amount_base FROM assets WHERE id = ?`, [id]);
        if (existing.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Asset not found'
            });
            await connection.rollback();
            return;
        }
        const assetTypeId = existing[0].asset_type_id;

        if (equipment_code !== undefined || purchase_currency !== undefined || purchase_fx_rate !== undefined || purchase_amount_base !== undefined) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'equipment_code and purchase finance fields are immutable after creation'
            });
            await connection.rollback();
            return;
        }
        if (name !== undefined) {
            if (!name.trim()) {
                res.status(400).json({
                    error: 'Bad Request',
                    message: 'Asset name cannot be empty'
                });
                await connection.rollback();
                return;
            }
            await connection.query(`UPDATE assets SET name = ? WHERE id = ?`, [name.trim(), id]);
        }
        if (location !== undefined || rrp_status !== undefined || current_value !== undefined || insurance_amount !== undefined || servicability_status !== undefined) {
            const locationTrimmed = location !== undefined ? String(location || '').trim() : null;
            const rrpStatusTrimmed = rrp_status !== undefined ? String(rrp_status || '').trim() : null;
            const servicabilityStatusTrimmed = servicability_status !== undefined ? String(servicability_status || '').trim() : null;
            const currentValueNum = current_value !== undefined ? Number(current_value) : null;
            const insuranceAmountNum = insurance_amount !== undefined ? Number(insurance_amount) : null;
            if (location !== undefined && !locationTrimmed) {
                res.status(400).json({
                    error: 'Bad Request',
                    message: 'location cannot be empty'
                });
                await connection.rollback();
                return;
            }
            if (rrp_status !== undefined && !rrpStatusTrimmed) {
                res.status(400).json({
                    error: 'Bad Request',
                    message: 'rrp_status cannot be empty'
                });
                await connection.rollback();
                return;
            }
            if (rrp_status !== undefined && !['0', '1'].includes(String(rrpStatusTrimmed))) {
                res.status(400).json({
                    error: 'Bad Request',
                    message: 'rrp_status must be 0 or 1'
                });
                await connection.rollback();
                return;
            }
            if (servicability_status !== undefined && !servicabilityStatusTrimmed) {
                res.status(400).json({
                    error: 'Bad Request',
                    message: 'servicability_status cannot be empty'
                });
                await connection.rollback();
                return;
            }
            if (current_value !== undefined && (!Number.isFinite(Number(currentValueNum)) || Number(currentValueNum) < 0)) {
                res.status(400).json({
                    error: 'Bad Request',
                    message: 'current_value must be a non-negative number'
                });
                await connection.rollback();
                return;
            }
            if (insurance_amount !== undefined && (!Number.isFinite(Number(insuranceAmountNum)) || Number(insuranceAmountNum) < 0)) {
                res.status(400).json({
                    error: 'Bad Request',
                    message: 'insurance_amount must be a non-negative number'
                });
                await connection.rollback();
                return;
            }
            await connection.query(
                `UPDATE assets SET
                    location = COALESCE(?, location),
                    rrp_status = COALESCE(?, rrp_status),
                    current_value = COALESCE(?, current_value),
                    insurance_amount = COALESCE(?, insurance_amount),
                    servicability_status = COALESCE(?, servicability_status)
                 WHERE id = ?`,
                [
                    location !== undefined ? locationTrimmed : null,
                    rrp_status !== undefined ? rrpStatusTrimmed : null,
                    current_value !== undefined ? currentValueNum : null,
                    insurance_amount !== undefined ? insuranceAmountNum : null,
                    servicability_status !== undefined ? servicabilityStatusTrimmed : null,
                    id
                ]
            );
        }
        if (property_values !== undefined) {
            const [requiredProperties] = await connection.query<RowDataPacket[]>(`SELECT property_name FROM asset_type_properties 
         WHERE asset_type_id = ? AND is_required = TRUE`, [assetTypeId]);
            const normalizedPropertyValues = Array.isArray(property_values) ? property_values.slice() : [];
            const [hasPurchaseAmountProperty] = await connection.query<RowDataPacket[]>(`SELECT property_name FROM asset_type_properties WHERE asset_type_id = ? AND property_name = ? LIMIT 1`, [assetTypeId, 'purchase_amount']);
            const existingPurchaseAmountBase = existing[0].purchase_amount_base;

            const purchaseAmountBaseStr = existingPurchaseAmountBase !== null && existingPurchaseAmountBase !== undefined ? String(existingPurchaseAmountBase) : '';
            if (hasPurchaseAmountProperty.length > 0 && purchaseAmountBaseStr && !normalizedPropertyValues.some(pv => pv.property_name === 'purchase_amount')) {
                normalizedPropertyValues.push({
                    property_name: 'purchase_amount',
                    property_value: purchaseAmountBaseStr
                });
            }

            if (normalizedPropertyValues.some(pv => pv.property_name === 'purchase_amount')) {
                const providedPurchaseAmount = normalizedPropertyValues.find(pv => pv.property_name === 'purchase_amount')?.property_value;
                if (purchaseAmountBaseStr && String(providedPurchaseAmount || '').trim() !== purchaseAmountBaseStr) {
                    res.status(400).json({
                        error: 'Bad Request',
                        message: 'purchase_amount cannot be modified after creation'
                    });
                    await connection.rollback();
                    return;
                }
            }

            const providedPropertyNames = new Set(normalizedPropertyValues.map(pv => pv.property_name));
            for (const reqProp of requiredProperties) {
                if (!providedPropertyNames.has((reqProp as any).property_name)) {
                    const [existingValue] = await connection.query<RowDataPacket[]>(`SELECT property_name FROM asset_property_values 
             WHERE asset_id = ? AND property_name = ?`, [id, (reqProp as any).property_name]);
                    if (existingValue.length === 0) {
                        res.status(400).json({
                            error: 'Bad Request',
                            message: `Required property '${(reqProp as any).property_name}' is missing`
                        });
                        await connection.rollback();
                        return;
                    }
                }
            }
            await connection.query(`DELETE FROM asset_property_values WHERE asset_id = ?`, [id]);
            if (normalizedPropertyValues.length > 0) {
                const propertyValueRows = normalizedPropertyValues.map(pv => [
                    id,
                    pv.property_name,
                    pv.property_value || null
                ]);
                await connection.query(`INSERT INTO asset_property_values (asset_id, property_name, property_value) 
           VALUES ?`, [propertyValueRows]);
            }
        }
        await connection.commit();
        const [assets] = await connection.query<Asset[]>(`SELECT a.id, a.asset_type_id, a.name,
              a.equipment_code, a.location, a.rrp_status, a.current_value, a.insurance_amount, a.servicability_status, a.purchase_currency, a.purchase_fx_rate, a.purchase_amount_base,
              a.created_by, a.created_at, a.updated_at,
              at.name as asset_type_name, at.description as asset_type_description
       FROM assets a
       LEFT JOIN asset_types at ON a.asset_type_id = at.id
       WHERE a.id = ?`, [id]);
        const [propertyValues] = await connection.query<AssetPropertyValue[]>(`SELECT id, asset_id, property_name, property_value, created_at, updated_at 
       FROM asset_property_values 
       WHERE asset_id = ?`, [id]);
        const [typeProperties] = await connection.query<AssetTypeProperty[]>(`SELECT id, asset_type_id, property_name, is_required, display_order, created_at 
       FROM asset_type_properties 
       WHERE asset_type_id = ? 
       ORDER BY display_order ASC, property_name ASC`, [assetTypeId]);
        const updatedAsset = {
            ...assets[0],
            asset_type: {
                id: assetTypeId,
                name: (assets[0] as any).asset_type_name,
                description: (assets[0] as any).asset_type_description,
                properties: typeProperties
            },
            property_values: propertyValues
        };
        logEvents(`Successfully updated asset: ${id}`, 'assetLog.log');
        res.status(200).json(updatedAsset);
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error updating asset: ${errorMessage}`, 'assetLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to update asset'
        });
    }
    finally {
        connection.release();
    }
};
export const deleteAsset = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await ensureAssetSpareSchema();
        await connection.beginTransaction();
        const { id } = req.params;
        const [existing] = await connection.query<Asset[]>(`SELECT id FROM assets WHERE id = ?`, [id]);
        if (existing.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Asset not found'
            });
            await connection.rollback();
            return;
        }
        await connection.query(`DELETE FROM asset_property_values WHERE asset_id = ?`, [id]);
        await connection.query(`DELETE FROM assets WHERE id = ?`, [id]);
        await connection.commit();
        logEvents(`Successfully deleted asset: ${id}`, 'assetLog.log');
        res.status(200).json({
            message: 'Asset deleted successfully'
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error deleting asset: ${errorMessage}`, 'assetLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to delete asset'
        });
    }
    finally {
        connection.release();
    }
};

export const deleteAllAssets = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await ensureAssetSpareSchema();
        await connection.beginTransaction();
        await connection.query(`DELETE FROM asset_property_values`);
        const [result] = await connection.query<any>(`DELETE FROM assets`);
        await connection.commit();
        logEvents(`Successfully deleted all assets`, 'assetLog.log');
        res.status(200).json({
            message: 'All assets deleted successfully',
            deletedCount: result?.affectedRows || 0
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error deleting all assets: ${errorMessage}`, 'assetLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to delete all assets'
        });
    }
    finally {
        connection.release();
    }
};

const expandEquipmentCodesForAssetImport = (input: string): string[] => {
    const normalized = String(input || '')
        .replace(/\b(ge|GE)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalized) {
        return ['N/A'];
    }
    const parts = normalized.split(',').map(p => p.trim()).filter(Boolean);
    const out: string[] = [];
    const seen = new Set<string>();

    const addToken = (t: string) => {
        const token = t.trim();
        if (!token) return;
        if (seen.has(token)) return;
        seen.add(token);
        out.push(token);
    };

    for (const part of parts) {
        const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
        if (rangeMatch) {
            const start = parseInt(rangeMatch[1], 10);
            const end = parseInt(rangeMatch[2], 10);
            const step = start <= end ? 1 : -1;
            for (let n = start; step === 1 ? n <= end : n >= end; n += step) {
                addToken(String(n));
            }
            continue;
        }

        const tRangeMatch = part.match(/^(\d+)\s*T\s*-\s*(\d+)\s*T$/i);
        if (tRangeMatch) {
            const start = parseInt(tRangeMatch[1], 10);
            const end = parseInt(tRangeMatch[2], 10);
            const step = start <= end ? 1 : -1;
            for (let n = start; step === 1 ? n <= end : n >= end; n += step) {
                addToken(`${n}T`);
            }
            continue;
        }

        const tSuffixMatch = part.match(/^(\d+)\s*T$/i);
        if (tSuffixMatch) {
            addToken(`${parseInt(tSuffixMatch[1], 10)}T`);
            continue;
        }

        const tCompactRangeMatch = part.match(/^(\d+)\s*T\s*(\d+)$/i);
        if (tCompactRangeMatch) {
            const start = parseInt(tCompactRangeMatch[1], 10);
            const end = parseInt(tCompactRangeMatch[2], 10);
            const step = start <= end ? 1 : -1;
            for (let n = start; step === 1 ? n <= end : n >= end; n += step) {
                addToken(`${n}T`);
            }
            continue;
        }

        const numberMatch = part.match(/^(\d+)$/);
        if (numberMatch) {
            addToken(numberMatch[1]);
            continue;
        }

        addToken(part);
    }

    return out.length ? out : ['N/A'];
};

export const getAssetsImportTemplate = async (req: Request, res: Response): Promise<void> => {
    try {
        await ensureAssetSpareSchema();

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Assets Import Template');

        const templateBaseHeaders = new Set([
            'equipment_code',
            'location',
            'rrp_status',
            'current_value',
            'insurance_amount',
            'servicability_status',
            'purchase_currency',
            'purchase_fx_rate'
        ]);
        const propertyHeaders = VALID_PROPERTY_NAMES.filter(p => p !== 'purchase_amount' && !templateBaseHeaders.has(p));
        const headers = [
            'equipment_code',
            'asset_type_name',
            'name',
            'location',
            'rrp_status',
            'current_value',
            'insurance_amount',
            'servicability_status',
            ...propertyHeaders,
            'purchase_currency',
            'purchase_fx_rate',
            'purchase_amount'
        ];

        worksheet.addRow(headers);
        worksheet.getRow(1).font = { bold: true };
        worksheet.columns = headers.map(() => ({ width: 20 }));

        const buffer = await workbook.xlsx.writeBuffer();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=assets_import_template.xlsx');
        res.status(200).send(buffer);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error generating assets import template: ${errorMessage}`, 'assetLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to generate assets import template'
        });
    }
};

export const importAssetsFromExcel = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await ensureAssetSpareSchema();
        await connection.beginTransaction();

        const { fileBase64 } = req.body as { fileBase64?: string };
        const userId = req.userId;

        if (!fileBase64 || !String(fileBase64).trim()) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'fileBase64 is required'
            });
            await connection.rollback();
            return;
        }

        const buffer = Buffer.from(String(fileBase64), 'base64');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer as any);

        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Excel worksheet not found'
            });
            await connection.rollback();
            return;
        }

        const headerRow = worksheet.getRow(1);
        const headerValues = headerRow.values as any[];
        const headers: string[] = [];
        for (let i = 1; i < headerValues.length; i++) {
            const raw = headerValues[i];
            headers.push(raw ? String(raw).trim() : '');
        }

        const headerIndex = new Map<string, number>();
        headers.forEach((h, idx) => {
            if (h) {
                headerIndex.set(h, idx);
            }
        });

        const requiredHeaders = [
            'equipment_code',
            'asset_type_name',
            'name',
            'location',
            'rrp_status',
            'current_value',
            'insurance_amount',
            'servicability_status',
            'purchase_currency',
            'purchase_fx_rate',
            'purchase_amount'
        ];

        const missingHeaders = requiredHeaders.filter(h => !headerIndex.has(h));
        if (missingHeaders.length > 0) {
            res.status(400).json({
                error: 'Bad Request',
                message: `Missing required columns: ${missingHeaders.join(', ')}`
            });
            await connection.rollback();
            return;
        }

        const failures: Array<{ rowNumber: number; equipmentCode?: string; errors: string[] }> = [];
        const validRows: Array<{
            rowNumber: number;
            equipmentCode: string;
            assetTypeName: string;
            assetName: string;
            location: string;
            rrpStatus: string;
            servicabilityStatus: string;
            currentValue: number;
            insuranceAmount: number;
            purchaseCurrency: string;
            purchaseFxRate: number;
            purchaseAmountBase: number;
            propertyValues: Record<string, string>;
        }> = [];
        const equipmentCodeSetInFile = new Set<string>();

        const maxRow = worksheet.actualRowCount || worksheet.rowCount;
        for (let rowNumber = 2; rowNumber <= maxRow; rowNumber++) {
            const row = worksheet.getRow(rowNumber);
            const rawEquipmentCode = row.getCell((headerIndex.get('equipment_code') || 0) + 1).value;
            const rawAssetTypeName = row.getCell((headerIndex.get('asset_type_name') || 0) + 1).value;
            const rawAssetName = row.getCell((headerIndex.get('name') || 0) + 1).value;

            const equipmentCodeInput = rawEquipmentCode ? String(rawEquipmentCode).trim() : '';
            const expandedEquipmentCodes = expandEquipmentCodesForAssetImport(equipmentCodeInput);
            const equipmentQuantity = expandedEquipmentCodes.length || 1;
            const assetTypeName = rawAssetTypeName ? String(rawAssetTypeName).trim() : '';
            const assetName = rawAssetName ? String(rawAssetName).trim() : 'N/A';

            if (!equipmentCodeInput && !assetTypeName && !assetName) {
                continue;
            }

            const errors: string[] = [];
            if (!assetTypeName) errors.push('asset_type_name is required');

            if (expandedEquipmentCodes.some(code => equipmentCodeSetInFile.has(code))) {
                errors.push('Duplicate equipment_code in import file');
            }

            const rawPurchaseCurrency = row.getCell((headerIndex.get('purchase_currency') || 0) + 1).value;
            const rawPurchaseFxRate = row.getCell((headerIndex.get('purchase_fx_rate') || 0) + 1).value;
            const rawPurchaseAmount = row.getCell((headerIndex.get('purchase_amount') || 0) + 1).value;
            const rawLocation = row.getCell((headerIndex.get('location') || 0) + 1).value;
            const rawRrpStatus = row.getCell((headerIndex.get('rrp_status') || 0) + 1).value;
            const rawCurrentValue = row.getCell((headerIndex.get('current_value') || 0) + 1).value;
            const rawInsuranceAmount = row.getCell((headerIndex.get('insurance_amount') || 0) + 1).value;
            const rawServicabilityStatus = row.getCell((headerIndex.get('servicability_status') || 0) + 1).value;

            const purchaseCurrency = rawPurchaseCurrency ? String(rawPurchaseCurrency).trim() : 'N/A';
            const parsedPurchaseFxRate = rawPurchaseFxRate !== null && rawPurchaseFxRate !== undefined && rawPurchaseFxRate !== '' ? Number(rawPurchaseFxRate) : 0;
            const purchaseFxRate = Number.isFinite(parsedPurchaseFxRate) && parsedPurchaseFxRate > 0 ? parsedPurchaseFxRate : 0;
            const parsedPurchaseAmountBase = rawPurchaseAmount !== null && rawPurchaseAmount !== undefined && rawPurchaseAmount !== '' ? Number(rawPurchaseAmount) : 0;
            const purchaseAmountBase = Number.isFinite(parsedPurchaseAmountBase) && parsedPurchaseAmountBase >= 0 ? parsedPurchaseAmountBase : 0;
            const purchaseAmountBasePerEquipment = purchaseAmountBase / equipmentQuantity;
            const location = rawLocation ? String(rawLocation).trim() : 'N/A';
            const rawRrpStatusString = rawRrpStatus ? String(rawRrpStatus).trim() : '';
            const rrpStatus = rawRrpStatusString === '0' || rawRrpStatusString === '1' ? rawRrpStatusString : '0';
            const parsedCurrentValue = rawCurrentValue !== null && rawCurrentValue !== undefined && rawCurrentValue !== '' ? Number(rawCurrentValue) : 0;
            const currentValue = Number.isFinite(parsedCurrentValue) && parsedCurrentValue >= 0 ? parsedCurrentValue : 0;
            const parsedInsuranceAmount = rawInsuranceAmount !== null && rawInsuranceAmount !== undefined && rawInsuranceAmount !== '' ? Number(rawInsuranceAmount) : 0;
            const insuranceAmount = Number.isFinite(parsedInsuranceAmount) && parsedInsuranceAmount >= 0 ? parsedInsuranceAmount : 0;
            const servicabilityStatus = rawServicabilityStatus ? String(rawServicabilityStatus).trim() : 'N/A';

            const propertyValues: Record<string, string> = {};
            for (const propertyName of VALID_PROPERTY_NAMES) {
                if (propertyName === 'purchase_amount') {
                    continue;
                }
                const cellIndex = headerIndex.get(propertyName);
                if (cellIndex === undefined) {
                    continue;
                }
                const value = row.getCell(cellIndex + 1).value;
                const str = value !== null && value !== undefined ? String(value).trim() : '';
                if (str) {
                    propertyValues[propertyName] = str;
                }
            }

            if (errors.length > 0) {
                failures.push({ rowNumber, equipmentCode: equipmentCodeInput || undefined, errors });
                continue;
            }

            const [assetTypeRows] = await connection.query<RowDataPacket[]>(`SELECT id FROM asset_types WHERE LOWER(name) = LOWER(?) LIMIT 1`, [assetTypeName]);
            if (!assetTypeRows.length) {
                failures.push({ rowNumber, equipmentCode: equipmentCodeInput || undefined, errors: ['Unknown asset_type_name'] });
                continue;
            }
            const assetTypeId = (assetTypeRows[0] as any).id as number;

            const [requiredProperties] = await connection.query<RowDataPacket[]>(`SELECT property_name FROM asset_type_properties WHERE asset_type_id = ? AND is_required = TRUE`, [assetTypeId]);
            const requiredPropertyNames = new Set(requiredProperties.map(p => (p as any).property_name));
            for (const propName of requiredPropertyNames) {
                if (propName === 'purchase_amount') {
                    continue;
                }
                if (!propertyValues[propName] || !propertyValues[propName].trim()) {
                    errors.push(`Missing required property: ${propName}`);
                }
            }

            if (errors.length > 0) {
                failures.push({ rowNumber, equipmentCode: equipmentCodeInput || undefined, errors });
                continue;
            }

            if (requiredPropertyNames.has('purchase_amount') && !propertyValues.purchase_amount) {
                propertyValues.purchase_amount = String(purchaseAmountBasePerEquipment);
            }

            for (const eqCode of expandedEquipmentCodes) {
                validRows.push({
                    rowNumber,
                    equipmentCode: eqCode,
                    assetTypeName,
                    assetName,
                    location,
                    rrpStatus,
                    servicabilityStatus,
                    currentValue,
                    insuranceAmount,
                    purchaseCurrency,
                    purchaseFxRate,
                    purchaseAmountBase: purchaseAmountBasePerEquipment,
                    propertyValues: { ...propertyValues }
                });
            }

            for (const eqCode of expandedEquipmentCodes) {
                equipmentCodeSetInFile.add(eqCode);
            }
        }

        if (validRows.length === 0) {
            await connection.rollback();
            res.status(200).json({
                insertedCount: 0,
                failedCount: failures.length,
                failures
            });
            return;
        }

        const equipmentCodes = validRows.map(v => v.equipmentCode);
        const [existingAssets] = await connection.query<RowDataPacket[]>(`SELECT equipment_code FROM assets WHERE equipment_code IN (?)`, [equipmentCodes]);
        const existingSet = new Set<string>((existingAssets as any[]).map(r => r.equipment_code));
        const toInsert = validRows.filter(v => !existingSet.has(v.equipmentCode));
        const skipped = validRows.length - toInsert.length;
        if (skipped > 0) {
            for (const row of validRows) {
                if (existingSet.has(row.equipmentCode)) {
                    failures.push({ rowNumber: row.rowNumber, equipmentCode: row.equipmentCode, errors: ['equipment_code already exists in DB'] });
                }
            }
        }

        if (toInsert.length === 0) {
            await connection.rollback();
            res.status(200).json({
                insertedCount: 0,
                failedCount: failures.length,
                failures
            });
            return;
        }

        const assetRowsValues = toInsert.map(v => [
            v.assetTypeName,
            v.assetName,
            v.equipmentCode,
            v.location,
            v.rrpStatus,
            v.servicabilityStatus,
            v.currentValue,
            v.insuranceAmount,
            v.purchaseCurrency,
            v.purchaseFxRate,
            v.purchaseAmountBase,
            userId || null
        ]);

        const assetTypeIdsByName = new Map<string, number>();
        for (const uniqueTypeName of Array.from(new Set(toInsert.map(v => v.assetTypeName)))) {
            const [typeRows] = await connection.query<RowDataPacket[]>(`SELECT id FROM asset_types WHERE LOWER(name) = LOWER(?) LIMIT 1`, [uniqueTypeName]);
            if (typeRows.length) {
                assetTypeIdsByName.set(uniqueTypeName, (typeRows[0] as any).id as number);
            }
        }

        const assetValues = toInsert.map(v => [
            assetTypeIdsByName.get(v.assetTypeName) || null,
            v.assetName,
            v.equipmentCode,
            v.location,
            v.rrpStatus,
            v.servicabilityStatus,
            v.currentValue,
            v.insuranceAmount,
            v.purchaseCurrency,
            v.purchaseFxRate,
            v.purchaseAmountBase,
            userId || null
        ]);

        await connection.query(
            `INSERT INTO assets (asset_type_id, name, equipment_code, location, rrp_status, servicability_status, current_value, insurance_amount, purchase_currency, purchase_fx_rate, purchase_amount_base, created_by) VALUES ?`,
            [assetValues]
        );

        const insertedEquipmentCodes = toInsert.map(v => v.equipmentCode);
        const [insertedAssets] = await connection.query<RowDataPacket[]>(
            `SELECT id, equipment_code FROM assets WHERE equipment_code IN (?)`,
            [insertedEquipmentCodes]
        );
        const assetIdByEquipmentCode = new Map<string, number>((insertedAssets as any[]).map(r => [r.equipment_code, r.id]));

        const propertyValueRows: Array<[number, string, string | null]> = [];
        for (const v of toInsert) {
            const assetId = assetIdByEquipmentCode.get(v.equipmentCode);
            if (!assetId) continue;
            for (const [property_name, property_value] of Object.entries(v.propertyValues)) {
                if (!property_value || !String(property_value).trim()) continue;
                propertyValueRows.push([assetId, property_name, property_value]);
            }
        }

        if (propertyValueRows.length > 0) {
            await connection.query(
                `INSERT INTO asset_property_values (asset_id, property_name, property_value) VALUES ?`,
                [propertyValueRows]
            );
        }

        await connection.commit();
        res.status(200).json({
            insertedCount: toInsert.length,
            failedCount: failures.length,
            failures
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error importing assets: ${errorMessage}`, 'assetLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to import assets'
        });
    }
    finally {
        connection.release();
    }
};

export const backfillSpareCompatibility = async (req: Request, res: Response): Promise<void> => {
    try {
        await ensureAssetSpareSchema();
        const { batchSize, maxStockRows, force } = req.body as {
            batchSize?: number;
            maxStockRows?: number;
            force?: boolean;
        };

        const result = await backfillSpareCompatibilityFromStockDetails({
            batchSize: typeof batchSize === 'number' ? batchSize : undefined,
            maxStockRows: typeof maxStockRows === 'number' ? maxStockRows : undefined,
            force: !!force
        });

        res.status(200).json(result);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error backfilling spare_compatibility: ${errorMessage}`, 'assetLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to backfill spare_compatibility'
        });
    }
};
