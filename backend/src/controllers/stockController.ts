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
    syncFamilyEquipments,
    compactFamilySuffixesAfterDelete,
    purgeStockNacAuxiliaryData,
    remapNacCodeReferences,
    createVariantRow,
    nextAvailableLetter,
} from '../services/inventoryVariantService';
import { rebuildNacInventoryState, reconcileAllStockBalances, readComputedVirtualBalance, syncStockCurrentBalance } from '../services/issueInventoryService';
import { buildStockSearchKey } from '../services/searchRelevanceService';
import { stripSuffixFromNac, validateNacCodeFormat, getNacCodeValidationError, NAC_CODE_VARIANT_FORMAT_MESSAGE, normalizePartNumber, buildSubNacCode, isAbsentPartNumber } from '../utils/nacCodeUtils';
import { processItemName } from '../utils/utils';
import { PoolConnection } from 'mysql2/promise';

export const reconcileStockBalances = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    let started = false;
    try {
        await ensureAssetSpareSchema();
        await connection.beginTransaction();
        started = true;
        const result = await reconcileAllStockBalances(connection);
        await connection.commit();
        started = false;
        logEvents(
            `Stock balance reconciliation: ${result.variantsProcessed} variant(s), ${result.balanceFixes} balance fix(es), ${result.duplicatesRemoved} duplicate row(s) merged`,
            'stockLog.log'
        );
        res.status(200).json({
            message: 'Stock balances reconciled successfully',
            ...result,
        });
    }
    catch (error) {
        if (started) {
            await connection.rollback();
        }
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in reconcileStockBalances: ${errorMessage}`, 'stockLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage,
        });
    }
    finally {
        connection.release();
    }
};

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

/**
 * Correct (never delete) the part number stored on every transaction that belongs to a
 * stock variant. A sub-code represents exactly one part number, so all of its issue /
 * receive / request rows must carry that part number. This keeps history intact when a
 * part number is edited and prevents family reconciliation from later remapping the rows
 * away to a different sub-code.
 */
const propagatePartNumberToTransactions = async (
    connection: PoolConnection,
    nacCode: string,
    partNumber: string
): Promise<void> => {
    const value = String(partNumber || '').trim();
    if (!nacCode) {
        return;
    }
    for (const table of ['receive_details', 'issue_details', 'request_details'] as const) {
        await connection.execute(
            `UPDATE ${table} SET part_number = ? WHERE nac_code = ?`,
            [value, nacCode]
        );
    }
};

/**
 * Persist applicable equipments for an entire NAC family.
 * Stock search reads equipment from spare_compatibility (not only stock_details.applicable_equipments),
 * so we must replace compatibility rows — INSERT IGNORE alone cannot remove codes the user deleted.
 */
const replaceFamilyEquipments = async (
    connection: PoolConnection,
    baseNacCode: string,
    equipmentNumber: string
): Promise<string> => {
    const base = stripSuffixFromNac(baseNacCode);
    const tokens = expandEquipmentTokens(equipmentNumber);
    const normalized = tokens.join(',');
    await syncFamilyEquipments(connection, base, normalized);

    const variants = await getFamilyVariants(connection, base);
    const nacCodes = variants.map((v) => v.nac_code).filter(Boolean);
    if (!nacCodes.length) {
        nacCodes.push(base);
    }

    const placeholders = nacCodes.map(() => '?').join(', ');
    await connection.execute(
        `DELETE FROM spare_compatibility WHERE nac_code IN (${placeholders})`,
        nacCodes
    );

    if (!tokens.length) {
        return normalized;
    }

    const valuePairs: Array<[string, string]> = [];
    for (const nac of nacCodes) {
        for (const token of tokens) {
            valuePairs.push([nac, token]);
        }
    }
    for (const batch of chunk(valuePairs, 10000)) {
        await connection.query(
            `INSERT IGNORE INTO spare_compatibility (nac_code, equipment_code) VALUES ?`,
            [batch]
        );
    }
    return normalized;
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
        openQuantity = 0,
        openAmount = 0,
        location,
    } = req.body;
    const connection = await pool.getConnection();
    let started = false;
    try {
        await ensureAssetSpareSchema();
        if (!nacCode || !itemName || !partNumber || !equipmentNumber || !location) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'NAC code, item name, part number, equipment number, and location are required'
            });
            return;
        }
        if (Number(openQuantity) < 0 || Number(openAmount) < 0) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Open quantity and open amount cannot be negative'
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
        const resolvedOpenQuantity = Number(openQuantity) || 0;
        const resolvedOpenAmount = Number(openAmount) || 0;
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
            0,
            location,
            resolvedOpenQuantity,
            resolvedOpenAmount,
            searchKey,
        ]);
        await replaceFamilyEquipments(connection, baseNacCode, equipmentNumber);
        await rebuildNacInventoryState(connection, nacCode);
        await syncStockCurrentBalance(connection, nacCode);
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
export const createFamilyVariant = async (req: Request, res: Response): Promise<void> => {
    const {
        baseNacCode,
        partNumber,
        openQuantity = 0,
        openAmount = 0,
        itemName,
        equipmentNumber,
        location,
    } = req.body;
    const connection = await pool.getConnection();
    let started = false;
    try {
        await ensureAssetSpareSchema();
        const base = stripSuffixFromNac(String(baseNacCode || '').trim());
        const trimmedPart = normalizePartNumber(String(partNumber || ''));
        if (!base) {
            res.status(400).json({ error: 'Bad Request', message: 'baseNacCode is required' });
            return;
        }
        if (!trimmedPart || isAbsentPartNumber(trimmedPart)) {
            res.status(400).json({ error: 'Bad Request', message: 'A valid part number is required' });
            return;
        }
        if (String(trimmedPart).includes(',')) {
            res.status(400).json({ error: 'Bad Request', message: 'Part number must be a single value (no commas)' });
            return;
        }
        if (Number(openQuantity) < 0 || Number(openAmount) < 0) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Open quantity and open amount cannot be negative',
            });
            return;
        }

        const variants = await getFamilyVariants(connection, base);
        if (!variants.length) {
            res.status(404).json({
                error: 'Not Found',
                message: `No stock family found for ${base}`,
            });
            return;
        }

        const existing = await findVariantByPartNumber(connection, base, trimmedPart);
        if (existing) {
            res.status(409).json({
                error: 'Conflict',
                message: `Part number ${trimmedPart} already exists on ${existing.nac_code}`,
            });
            return;
        }

        const template = variants[0];
        let targetNac: string;
        try {
            targetNac = buildSubNacCode(base, nextAvailableLetter(variants));
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unable to allocate a new sub-code';
            res.status(400).json({ error: 'Bad Request', message });
            return;
        }

        const [dupNac] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM stock_details WHERE nac_code = ? LIMIT 1`,
            [targetNac]
        );
        if (dupNac.length) {
            res.status(409).json({
                error: 'Conflict',
                message: `NAC code ${targetNac} already exists`,
            });
            return;
        }

        await connection.beginTransaction();
        started = true;

        const resolvedItemName = processItemName(String(itemName || template.item_name || ''));
        const resolvedEquipment = String(equipmentNumber || template.applicable_equipments || '');
        const resolvedLocation = String(location || template.location || '');
        const resolvedOpenQty = Number(openQuantity) || 0;
        const resolvedOpenAmt = Number(openAmount) || 0;

        const insertId = await createVariantRow(connection, {
            baseNacCode: base,
            nacCode: targetNac,
            partNumber: trimmedPart,
            itemName: resolvedItemName,
            applicableEquipments: resolvedEquipment,
            location: resolvedLocation,
            unit: template.unit || null,
            imageUrl: null,
            currentBalance: 0,
            openQuantity: resolvedOpenQty,
            openAmount: resolvedOpenAmt,
        });

        await syncFamilyLocation(connection, base, resolvedLocation);
        await replaceFamilyEquipments(connection, base, resolvedEquipment);

        const searchKey = buildStockSearchKey({
            nac_code: targetNac,
            part_numbers: trimmedPart,
            item_name: resolvedItemName,
            applicable_equipments: resolvedEquipment,
        });
        await connection.execute(
            `UPDATE stock_details SET search_key = ? WHERE id = ?`,
            [searchKey, insertId]
        );

        await rebuildNacInventoryState(connection, targetNac);
        await syncStockCurrentBalance(connection, targetNac);
        await connection.commit();
        started = false;

        res.status(201).json({
            message: 'Family part number created successfully',
            id: insertId,
            nacCode: targetNac,
            baseNacCode: base,
            partNumber: trimmedPart,
        });
    } catch (error) {
        if (started) {
            await connection.rollback();
        }
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in createFamilyVariant: ${errorMessage}`, 'stockLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage,
        });
    } finally {
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
        openQuantity = 0,
        openAmount = 0,
        location,
    } = req.body;
    const connection = await pool.getConnection();
    let started = false;
    try {
        await ensureAssetSpareSchema();
        if (
            !nacCode
            || !itemName
            || !partNumber
            || !equipmentNumber
            || !location
        ) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'NAC code, item name, part number, equipment number, and location are required'
            });
            return;
        }
        if (Number(openQuantity) < 0 || Number(openAmount) < 0) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Open quantity and open amount cannot be negative'
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
        const [existingItem] = await connection.execute<RowDataPacket[]>('SELECT id, nac_code, base_nac_code, part_numbers FROM stock_details WHERE id = ?', [id]);
        if (existingItem.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Stock item not found'
            });
            return;
        }
        const oldNacCode = String((existingItem as any)[0].nac_code || '');
        const oldPartNumber = normalizePartNumber(String((existingItem as any)[0].part_numbers || ''));
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
            Number(openQuantity) || 0,
            Number(openAmount) || 0,
            location,
            searchKey,
            id,
        ]);
        await syncFamilyLocation(connection, baseNacCode, location);
        if (oldNacCode !== nacCode) {
            // Move (not delete) all history — issues, receives, requests, units, compatibility —
            // from the previous NAC code onto the corrected one so nothing is orphaned.
            await remapNacCodeReferences(connection, oldNacCode, nacCode);
        }
        const newPartNumber = normalizePartNumber(trimmedPart);
        if (oldPartNumber !== newPartNumber || oldNacCode !== nacCode) {
            await propagatePartNumberToTransactions(connection, nacCode, trimmedPart);
        }
        // Family-wide replace: stock list reads spare_compatibility, so INSERT-only backfill
        // would leave removed equipment codes visible after a "successful" update.
        await replaceFamilyEquipments(connection, baseNacCode, equipmentNumber);
        await rebuildNacInventoryState(connection, nacCode);
        await syncStockCurrentBalance(connection, nacCode);
        const virtualBalance = await readComputedVirtualBalance(connection, nacCode);
        await connection.commit();
        res.status(200).json({
            message: 'Stock item updated successfully',
            virtualBalance,
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
        const deletedNacCode = String(row.nac_code || '').trim();
        await connection.execute('DELETE FROM stock_details WHERE id = ?', [id]);
        if (deletedNacCode) {
            await purgeStockNacAuxiliaryData(connection, deletedNacCode);
        }

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
