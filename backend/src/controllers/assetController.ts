import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';
import { Asset, AssetPropertyValue, AssetTypeProperty, CreateAssetDTO, UpdateAssetDTO } from '../types/asset';
export const getAllAssets = async (req: Request, res: Response): Promise<void> => {
    try {
        const { asset_type_id, search, page = '1', pageSize = '20' } = req.query;
        const pageNum = parseInt(page as string, 10) || 1;
        const pageSizeNum = Math.min(parseInt(pageSize as string, 10) || 20, 100);
        const offset = (pageNum - 1) * pageSizeNum;
        let query = `
      SELECT a.id, a.asset_type_id, a.name, a.created_by, a.created_at, a.updated_at,
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
            query += ' AND (a.name LIKE ? OR at.name LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm);
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
            countQuery += ' AND (a.name LIKE ? OR at.name LIKE ?)';
            const searchTerm = `%${search}%`;
            countParams.push(searchTerm, searchTerm);
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
        const { id } = req.params;
        const [assets] = await pool.query<Asset[]>(`SELECT a.id, a.asset_type_id, a.name, a.created_by, a.created_at, a.updated_at,
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
        await connection.beginTransaction();
        const { asset_type_id, name, property_values = [] }: CreateAssetDTO = req.body;
        const userId = req.userId;
        if (!asset_type_id || !name || !name.trim()) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Asset type ID and name are required'
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
        const providedPropertyNames = new Set(property_values.map(pv => pv.property_name));
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
        const [result] = await connection.query<any>(`INSERT INTO assets (asset_type_id, name, created_by) 
       VALUES (?, ?, ?)`, [asset_type_id, name.trim(), userId || null]);
        const assetId = result.insertId;
        if (property_values.length > 0) {
            const propertyValueRows = property_values.map(pv => [
                assetId,
                pv.property_name,
                pv.property_value || null
            ]);
            await connection.query(`INSERT INTO asset_property_values (asset_id, property_name, property_value) 
         VALUES ?`, [propertyValueRows]);
        }
        await connection.commit();
        const [assets] = await connection.query<Asset[]>(`SELECT a.id, a.asset_type_id, a.name, a.created_by, a.created_at, a.updated_at,
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
        await connection.beginTransaction();
        const { id } = req.params;
        const { name, property_values }: UpdateAssetDTO = req.body;
        const [existing] = await connection.query<Asset[]>(`SELECT asset_type_id FROM assets WHERE id = ?`, [id]);
        if (existing.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Asset not found'
            });
            await connection.rollback();
            return;
        }
        const assetTypeId = existing[0].asset_type_id;
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
        if (property_values !== undefined) {
            const [requiredProperties] = await connection.query<RowDataPacket[]>(`SELECT property_name FROM asset_type_properties 
         WHERE asset_type_id = ? AND is_required = TRUE`, [assetTypeId]);
            const providedPropertyNames = new Set(property_values.map(pv => pv.property_name));
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
            if (property_values.length > 0) {
                const propertyValueRows = property_values.map(pv => [
                    id,
                    pv.property_name,
                    pv.property_value || null
                ]);
                await connection.query(`INSERT INTO asset_property_values (asset_id, property_name, property_value) 
           VALUES ?`, [propertyValueRows]);
            }
        }
        await connection.commit();
        const [assets] = await connection.query<Asset[]>(`SELECT a.id, a.asset_type_id, a.name, a.created_by, a.created_at, a.updated_at,
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
