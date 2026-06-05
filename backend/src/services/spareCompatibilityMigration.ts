import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';

type BackfillOptions = {
    batchSize?: number;
    maxStockRows?: number;
    force?: boolean;
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

export const backfillSpareCompatibilityFromStockDetails = async (opts: BackfillOptions): Promise<{
    startedAt: string;
    processedStockRows: number;
    insertedCompatibilityRows: number;
    skippedBecauseAlreadyBackfilled: boolean;
}> => {
    const startedAt = new Date().toISOString();
    const batchSize = opts.batchSize && opts.batchSize > 0 ? opts.batchSize : 500;
    const maxStockRows = opts.maxStockRows && opts.maxStockRows > 0 ? opts.maxStockRows : null;
    const force = !!opts.force;

    const [countRows] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) as total FROM spare_compatibility`);
    const alreadyBackfilled = (countRows[0] as any)?.total > 0;
    if (alreadyBackfilled && !force) {
        return {
            startedAt,
            processedStockRows: 0,
            insertedCompatibilityRows: 0,
            skippedBecauseAlreadyBackfilled: true
        };
    }

    let lastId = 0;
    let processedStockRows = 0;
    let insertedCompatibilityRows = 0;

    while (true) {
        if (maxStockRows !== null && processedStockRows >= maxStockRows) {
            break;
        }
        const remaining = maxStockRows !== null ? maxStockRows - processedStockRows : batchSize;
        const take = Math.min(batchSize, remaining);
        const [stockRows] = await pool.query<RowDataPacket[]>(`
            SELECT id, nac_code, applicable_equipments
            FROM stock_details
            WHERE id > ?
            ORDER BY id ASC
            LIMIT ?
        `, [lastId, take]);

        if (!stockRows.length) {
            break;
        }

        const valuePairs: Array<[string, string]> = [];
        for (const row of stockRows as any[]) {
            const nacCode = String(row.nac_code || '').trim();
            const applicableEquipments = String(row.applicable_equipments || '');
            if (!nacCode) continue;
            const equipmentTokens = expandEquipmentTokens(applicableEquipments);
            for (const equipmentCode of equipmentTokens) {
                const token = String(equipmentCode || '').trim();
                if (!token) continue;
                valuePairs.push([nacCode, token]);
            }
        }

        if (valuePairs.length > 0) {
            const tupleChunks = chunk(valuePairs, 10000);
            for (const c of tupleChunks) {
                const [result] = await pool.query<any>(
                    `INSERT IGNORE INTO spare_compatibility (nac_code, equipment_code) VALUES ?`,
                    [c]
                );
                insertedCompatibilityRows += (result as any)?.affectedRows || 0;
            }
        }

        const lastRow = stockRows[stockRows.length - 1] as any;
        lastId = lastRow.id;
        processedStockRows += stockRows.length;

        logEvents(`Spare compatibility backfill progress: processedStockRows=${processedStockRows}, insertedCompatibilityRows=${insertedCompatibilityRows}`, 'assetLog.log');
    }

    return {
        startedAt,
        processedStockRows,
        insertedCompatibilityRows,
        skippedBecauseAlreadyBackfilled: false
    };
};

