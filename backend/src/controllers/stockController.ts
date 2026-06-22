import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';
import { ensureAssetSpareSchema } from '../services/assetSpareSchema';
import { migrateInventoryPartVariants } from '../services/inventoryPartSplitMigration';
import { reconcileInventoryFamilies } from '../services/inventoryFamilyReconcileService';
import {
    VARIANT_VIRTUAL_BALANCE_SQL,
    VARIANT_TRUE_BALANCE_SQL,
} from '../services/spareEquipmentDisplay';
import {
    findVariantByPartNumber,
    getFamilyVariants,
    previewReceiveTarget,
    syncFamilyLocation,
    compactFamilySuffixesAfterDelete,
} from '../services/inventoryVariantService';
import { rebuildNacInventoryState } from '../services/issueInventoryService';
import { buildStockSearchKey } from '../services/searchRelevanceService';
import { stripSuffixFromNac, validateNacCodeFormat, getNacCodeValidationError, NAC_CODE_VARIANT_FORMAT_MESSAGE } from '../utils/nacCodeUtils';
import { processItemName } from '../utils/utils';

const expandEquipmentTokens = (input: string): string[] => {
    const normalized = String(input || '')
        .replace(/\b(ge|GE)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalized) {
        return [];
    }
    const parts = normalized.split(',').map(p => p.trim()).filter(Boolean);
    const out: string[] = [];
    const seen = new Set<string>();
    for (const part of parts) {
        const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
        if (rangeMatch) {
            const start = parseInt(rangeMatch[1], 10);
            const end = parseInt(rangeMatch[2], 10);
            const step = start <= end ? 1 : -1;
            for (let n = start; step === 1 ? n <= end : n >= end; n += step) {
                const token = String(n);
                if (!seen.has(token)) {
                    seen.add(token);
                    out.push(token);
                }
            }
            continue;
        }
        if (/^\d+$/.test(part)) {
            if (!seen.has(part)) {
                seen.add(part);
                out.push(part);
            }
            continue;
        }
        if (/^[A-Za-z\s]+$/.test(part)) {
            const token = part.replace(/\s+/g, ' ').trim();
            if (!seen.has(token)) {
                seen.add(token);
                out.push(token);
            }
            continue;
        }
        const token = part;
        if (!seen.has(token)) {
            seen.add(token);
            out.push(token);
        }
    }
    return out;
};

const chunk = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        out.push(arr.slice(i, i + size));
    }
    return out;
};

const backfillCompatForNac = async (connection: any, nacCode: string, equipmentNumber: string): Promise<void> => {
    const equipmentTokens = expandEquipmentTokens(equipmentNumber);
    if (equipmentTokens.length === 0) {
        return;
    }
    const valuePairs: Array<[string, string]> = equipmentTokens.map(eq => [nacCode, eq]);
    const tupleChunks = chunk(valuePairs, 10000);
    for (const c of tupleChunks) {
        await connection.query(
            `INSERT IGNORE INTO spare_compatibility (nac_code, equipment_code) VALUES ?`,
            [c]
        );
    }
};
export const migratePartVariants = async (req: Request, res: Response): Promise<void> => {
    try {
        await ensureAssetSpareSchema();
        const dryRun = !!req.body?.dryRun;
        const split = await migrateInventoryPartVariants({ dryRun });
        const reconcile = await reconcileInventoryFamilies({ dryRun });
        const result = { ...split, reconcile };
        logEvents(`Inventory family migration ${dryRun ? '(dry run)' : ''} completed: ${JSON.stringify(result)}`, 'stockLog.log');
        res.status(200).json(result);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in migratePartVariants: ${errorMessage}`, 'stockLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
};

export const resolveVariant = async (req: Request, res: Response): Promise<void> => {
    const baseNac = String(req.query.baseNac || req.query.nacCode || '').trim();
    const partNumber = String(req.query.partNumber || '').trim();
    if (!baseNac || !partNumber) {
        res.status(400).json({
            error: 'Bad Request',
            message: 'baseNac and partNumber are required'
        });
        return;
    }
    const connection = await pool.getConnection();
    try {
        await ensureAssetSpareSchema();
        const base = stripSuffixFromNac(baseNac);
        const existing = await findVariantByPartNumber(connection, base, partNumber);
        if (existing) {
            res.json({
                nacCode: existing.nac_code,
                baseNacCode: base,
                isNewVariant: false,
                requiresNewPhoto: false,
            });
            return;
        }
        const resolved = await previewReceiveTarget(connection, { baseNacCode: base, partNumber });
        res.json(resolved);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        res.status(400).json({
            error: 'Bad Request',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};

export const getFamilyVariantsHandler = async (req: Request, res: Response): Promise<void> => {
    const baseNac = String(req.params.baseNac || '').trim();
    if (!baseNac) {
        res.status(400).json({ error: 'Bad Request', message: 'baseNac is required' });
        return;
    }
    const connection = await pool.getConnection();
    try {
        const variants = await getFamilyVariants(connection, baseNac);
        const nacCodes = variants.map(v => v.nac_code);
        const balanceByNac = new Map<string, { virtualBalance: number; trueBalance: number }>();
        if (nacCodes.length) {
            const placeholders = nacCodes.map(() => '?').join(', ');
            const [balanceRows] = await connection.execute<RowDataPacket[]>(
                `SELECT sd.nac_code as nacCode,
                    ${VARIANT_VIRTUAL_BALANCE_SQL} as virtualBalance,
                    ${VARIANT_TRUE_BALANCE_SQL} as trueBalance
                 FROM stock_details sd WHERE sd.nac_code IN (${placeholders})`,
                nacCodes
            );
            for (const row of balanceRows) {
                balanceByNac.set(String(row.nacCode), {
                    virtualBalance: Number(row.virtualBalance),
                    trueBalance: Number(row.trueBalance),
                });
            }
        }
        res.json({
            baseNacCode: stripSuffixFromNac(baseNac),
            variants: variants.map(v => ({
                id: v.id,
                nacCode: v.nac_code,
                partNumber: v.part_numbers,
                virtualBalance: balanceByNac.get(v.nac_code)?.virtualBalance ?? 0,
                trueBalance: balanceByNac.get(v.nac_code)?.trueBalance ?? 0,
                location: v.location,
                imageUrl: v.image_url,
                unit: v.unit,
            })),
        });
    }
    finally {
        connection.release();
    }
};

export const createStockItem = async (req: Request, res: Response): Promise<void> => {
    const {
        nacCode,
        itemName,
        partNumber,
        equipmentNumber,
        currentBalance,
        openQuantity = 0,
        openAmount = 0,
        location,
    } = req.body;
    const connection = await pool.getConnection();
    let started = false;
    try {
        await ensureAssetSpareSchema();
        if (!nacCode || !itemName || !partNumber || !equipmentNumber || currentBalance === undefined || !location) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'All fields are required'
            });
            return;
        }
        if (String(itemName).includes(',') || String(partNumber).includes(',')) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Item name and part number must be single values (no commas)'
            });
            return;
        }
        if (!validateNacCodeFormat(nacCode)) {
            res.status(400).json({
                error: 'Bad Request',
                message: NAC_CODE_VARIANT_FORMAT_MESSAGE
            });
            return;
        }
        const baseNacCode = stripSuffixFromNac(nacCode);
        const [existingItem] = await connection.execute<RowDataPacket[]>('SELECT id FROM stock_details WHERE nac_code = ?', [nacCode]);
        if (existingItem.length > 0) {
            res.status(409).json({
                error: 'Conflict',
                message: 'NAC Code already exists'
            });
            return;
        }
        await connection.beginTransaction();
        started = true;
        const processedName = processItemName(itemName);
        const searchKey = buildStockSearchKey({
            nac_code: nacCode,
            part_numbers: partNumber.trim(),
            item_name: processedName,
            applicable_equipments: equipmentNumber,
        });
        const [result] = await connection.execute(`INSERT INTO stock_details (
        nac_code,
        base_nac_code,
        item_name, 
        part_numbers, 
        applicable_equipments, 
        current_balance, 
        location, 
        open_quantity,
        open_amount,
        search_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            nacCode,
            baseNacCode,
            processedName,
            partNumber.trim(),
            equipmentNumber,
            currentBalance,
            location,
            Number(openQuantity) || 0,
            Number(openAmount) || 0,
            searchKey,
        ]);
        await backfillCompatForNac(connection, nacCode, equipmentNumber);
        await connection.commit();
        res.status(201).json({
            message: 'Stock item created successfully',
            id: (result as any).insertId
        });
    }
    catch (error) {
        if (started) {
            await connection.rollback();
        }
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in createStockItem: ${errorMessage}`, "stockLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const updateStockItem = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const {
        nacCode,
        itemName,
        partNumber,
        equipmentNumber,
        currentBalance,
        openQuantity = 0,
        openAmount = 0,
        location,
    } = req.body;
    const connection = await pool.getConnection();
    let started = false;
    try {
        await ensureAssetSpareSchema();
        if (!nacCode || !itemName || !partNumber || !equipmentNumber || currentBalance === undefined || !location) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'All fields are required'
            });
            return;
        }
        if (String(itemName).includes(',') || String(partNumber).includes(',')) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Item name and part number must be single values (no commas)'
            });
            return;
        }
        const nacFormatError = getNacCodeValidationError(String(nacCode), { allowSuffix: true });
        if (nacFormatError) {
            res.status(400).json({
                error: 'Bad Request',
                message: nacFormatError
            });
            return;
        }
        const [existingItem] = await connection.execute<RowDataPacket[]>('SELECT id, nac_code, base_nac_code FROM stock_details WHERE id = ?', [id]);
        if (existingItem.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Stock item not found'
            });
            return;
        }
        const oldNacCode = String((existingItem as any)[0].nac_code || '');
        const [duplicateNac] = await connection.execute<RowDataPacket[]>('SELECT id FROM stock_details WHERE nac_code = ? AND id != ?', [nacCode, id]);
        if (duplicateNac.length > 0) {
            res.status(409).json({
                error: 'Conflict',
                message: 'NAC Code already exists'
            });
            return;
        }
        await connection.beginTransaction();
        started = true;
        const baseNacCode = stripSuffixFromNac(nacCode);
        const processedName = processItemName(itemName);
        const trimmedPart = partNumber.trim();
        const searchKey = buildStockSearchKey({
            nac_code: nacCode,
            part_numbers: trimmedPart,
            item_name: processedName,
            applicable_equipments: equipmentNumber,
        });
        await connection.execute(`UPDATE stock_details SET 
        nac_code = ?, 
        base_nac_code = ?,
        item_name = ?, 
        part_numbers = ?, 
        applicable_equipments = ?, 
        current_balance = ?, 
        open_quantity = ?,
        open_amount = ?,
        location = ?,
        search_key = ?
      WHERE id = ?`, [
            nacCode,
            baseNacCode,
            processedName,
            trimmedPart,
            equipmentNumber,
            currentBalance,
            Number(openQuantity) || 0,
            Number(openAmount) || 0,
            location,
            searchKey,
            id,
        ]);
        await syncFamilyLocation(connection, baseNacCode, location);
        await connection.execute(`DELETE FROM spare_compatibility WHERE nac_code = ?`, [oldNacCode]);
        await backfillCompatForNac(connection, nacCode, equipmentNumber);
        await connection.commit();
        res.status(200).json({
            message: 'Stock item updated successfully'
        });
    }
    catch (error) {
        if (started) {
            await connection.rollback();
        }
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in updateStockItem: ${errorMessage}`, "stockLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const deleteStockItem = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const connection = await pool.getConnection();
    let started = false;
    try {
        await connection.beginTransaction();
        started = true;
        await ensureAssetSpareSchema();

        const [existingItem] = await connection.execute<RowDataPacket[]>(
            'SELECT id, nac_code FROM stock_details WHERE id = ? FOR UPDATE',
            [id]
        );
        if (existingItem.length === 0) {
            await connection.rollback();
            started = false;
            res.status(404).json({
                error: 'Not Found',
                message: 'Stock item not found',
            });
            return;
        }

        const row = existingItem[0];
        await connection.execute('DELETE FROM stock_details WHERE id = ?', [id]);

        const affectedNacs = await compactFamilySuffixesAfterDelete(connection, {
            id: Number(row.id),
            nac_code: String(row.nac_code),
        });

        for (const nacCode of affectedNacs) {
            await rebuildNacInventoryState(connection, nacCode);
        }

        await connection.commit();
        started = false;
        res.status(200).json({
            message: 'Stock item deleted successfully',
            renumberedNacCodes: affectedNacs,
        });
    }
    catch (error) {
        if (started) {
            await connection.rollback();
        }
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in deleteStockItem: ${errorMessage}`, "stockLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage,
        });
    }
    finally {
        connection.release();
    }
};
