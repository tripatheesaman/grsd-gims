import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';
import { ensureAssetSpareSchema } from '../services/assetSpareSchema';

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
export const createStockItem = async (req: Request, res: Response): Promise<void> => {
    const { nacCode, itemName, partNumber, equipmentNumber, currentBalance, location } = req.body;
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
        const [result] = await connection.execute(`INSERT INTO stock_details (
        nac_code, 
        item_name, 
        part_numbers, 
        applicable_equipments, 
        current_balance, 
        location, 
        open_amount
      ) VALUES (?, ?, ?, ?, ?, ?, 0)`, [nacCode, itemName, partNumber, equipmentNumber, currentBalance, location]);
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
    const { nacCode, itemName, partNumber, equipmentNumber, currentBalance, location } = req.body;
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
        const [existingItem] = await connection.execute<RowDataPacket[]>('SELECT id, nac_code FROM stock_details WHERE id = ?', [id]);
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
        await connection.execute(`UPDATE stock_details SET 
        nac_code = ?, 
        item_name = ?, 
        part_numbers = ?, 
        applicable_equipments = ?, 
        current_balance = ?, 
        location = ?
      WHERE id = ?`, [nacCode, itemName, partNumber, equipmentNumber, currentBalance, location, id]);
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
    try {
        const [existingItem] = await connection.execute<RowDataPacket[]>('SELECT id FROM stock_details WHERE id = ?', [id]);
        if (existingItem.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Stock item not found'
            });
            return;
        }
        await connection.execute('DELETE FROM stock_details WHERE id = ?', [id]);
        res.status(200).json({
            message: 'Stock item deleted successfully'
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in deleteStockItem: ${errorMessage}`, "stockLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
