import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';
import { rebuildNacInventoryState } from './issueInventoryService';
import {
    consolidateFamilyOpeningToTarget,
    getFamilyVariants,
    remapFamilyTransactionsToLatestReceivedPart,
    StockVariantRow,
    syncFamilyEquipments,
} from './inventoryVariantService';
import {
    sqlFamilyKeyExpression,
    stripSuffixFromNac,
} from '../utils/nacCodeUtils';

const BALANCE_EPSILON = 0.001;
const FAMILY_KEY_SQL = sqlFamilyKeyExpression('sd');

export type ReconcileOptions = {
    dryRun?: boolean;
};

export type ReconcileResult = {
    startedAt: string;
    finishedAt: string;
    dryRun: boolean;
    reconciledVariants: number;
    balanceFixes: number;
    compatRowsAdded: number;
    baseNacBackfilled: number;
    transactionRemaps: number;
    orphansSkipped: number;
    errors: string[];
    details: string[];
};

type VariantRow = StockVariantRow;

const toNum = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

async function backfillBaseNacCodes(
    connection: PoolConnection,
    dryRun: boolean,
    details: string[]
): Promise<number> {
    const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT sd.id, sd.nac_code, sd.base_nac_code FROM stock_details sd
         WHERE sd.nac_code IS NOT NULL AND TRIM(sd.nac_code) != ''
           AND (sd.base_nac_code IS NULL OR sd.base_nac_code = '' OR sd.base_nac_code != ${FAMILY_KEY_SQL})`
    );
    let count = 0;
    for (const row of rows) {
        const base = stripSuffixFromNac(String(row.nac_code));
        if (!dryRun) {
            await connection.execute(
                `UPDATE stock_details SET base_nac_code = ? WHERE id = ?`,
                [base, row.id]
            );
        }
        count++;
    }
    if (count) {
        details.push(`Backfilled base_nac_code on ${count} row(s)`);
    }
    return count;
}

async function skipOrphans(connection: PoolConnection, details: string[]): Promise<number> {
    const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT id, nac_code FROM stock_details WHERE nac_code IS NULL OR TRIM(nac_code) = ''`
    );
    for (const row of rows) {
        details.push(`Orphan row skipped: id=${row.id}`);
        logEvents(`Reconcile skipped orphan stock_details id=${row.id}`, 'stockLog.log');
    }
    return rows.length;
}

async function computeExpectedBalance(connection: PoolConnection, nacCode: string): Promise<number> {
    const [stockRows] = await connection.execute<RowDataPacket[]>(
        `SELECT COALESCE(open_quantity, 0) AS open_quantity FROM stock_details WHERE nac_code = ?`,
        [nacCode]
    );
    const openQty = stockRows.length ? toNum(stockRows[0].open_quantity) : 0;
    const [recvRows] = await connection.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(received_quantity), 0) AS qty
         FROM receive_details WHERE nac_code = ? AND approval_status = 'APPROVED'`,
        [nacCode]
    );
    const [issueRows] = await connection.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(issue_quantity), 0) AS qty
         FROM issue_details WHERE nac_code = ? AND approval_status = 'APPROVED'`,
        [nacCode]
    );
    return openQty + toNum(recvRows[0]?.qty) - toNum(issueRows[0]?.qty);
}

async function remapStragglerTransactions(
    connection: PoolConnection,
    baseNac: string,
    variants: VariantRow[],
    dryRun: boolean,
    details: string[]
): Promise<number> {
    const partNumbers = variants.map(v => v.part_numbers);
    const { remaps, target } = await remapFamilyTransactionsToLatestReceivedPart(
        connection,
        baseNac,
        variants,
        dryRun,
        { fallbackPartNumbers: partNumbers, detailLog: details }
    );

    if (target && variants.length > 1) {
        await consolidateFamilyOpeningToTarget(connection, variants, target, dryRun);
        if (!dryRun) {
            details.push(
                `Family ${baseNac}: consolidated opening/balance onto ${target.nacCode} (${target.partNumber})`
            );
        }
    }

    return remaps;
}

async function propagateCompatAndUnits(
    connection: PoolConnection,
    baseNac: string,
    variants: VariantRow[],
    dryRun: boolean,
    details: string[]
): Promise<number> {
    let added = 0;
    const equipmentCodes = new Set<string>();

    for (const v of variants) {
        String(v.applicable_equipments || '')
            .split(',')
            .map(t => t.trim())
            .filter(Boolean)
            .forEach(code => equipmentCodes.add(code));
    }

    const nacCodes = variants.map(v => v.nac_code);
    if (nacCodes.length) {
        const placeholders = nacCodes.map(() => '?').join(', ');
        const [compatRows] = await connection.execute<RowDataPacket[]>(
            `SELECT DISTINCT equipment_code FROM spare_compatibility WHERE nac_code IN (${placeholders})`,
            nacCodes
        );
        for (const row of compatRows) {
            equipmentCodes.add(String(row.equipment_code));
        }
    }

    const mergedEquipments = Array.from(equipmentCodes).sort().join(',');
    if (mergedEquipments && !dryRun) {
        await syncFamilyEquipments(connection, baseNac, mergedEquipments);
    }

    for (const v of variants) {
        for (const eq of equipmentCodes) {
            if (!dryRun) {
                const [result] = await connection.execute(
                    `INSERT IGNORE INTO spare_compatibility (nac_code, equipment_code) VALUES (?, ?)`,
                    [v.nac_code, eq]
                );
                if ((result as { affectedRows?: number }).affectedRows) {
                    added++;
                }
            } else {
                const [existing] = await connection.execute<RowDataPacket[]>(
                    `SELECT 1 FROM spare_compatibility WHERE nac_code = ? AND equipment_code = ? LIMIT 1`,
                    [v.nac_code, eq]
                );
                if (!existing.length) {
                    added++;
                }
            }
        }
    }

    const baseVariant = variants.find(v => stripSuffixFromNac(v.nac_code) === v.nac_code) ?? variants[0];
    for (const v of variants) {
        if (v.nac_code === baseVariant.nac_code) {
            continue;
        }
        for (const table of ['nac_units', 'unit_conversions'] as const) {
            const [baseRows] = await connection.execute<RowDataPacket[]>(
                `SELECT * FROM ${table} WHERE nac_code = ?`,
                [baseVariant.nac_code]
            );
            for (const unitRow of baseRows) {
                const { nac_code: _old, ...rest } = unitRow as Record<string, unknown>;
                if (!dryRun) {
                    const cols = Object.keys(rest);
                    if (!cols.length) {
                        continue;
                    }
                    const placeholders = cols.map(() => '?').join(', ');
                    const colNames = cols.join(', ');
                    await connection.execute(
                        `INSERT IGNORE INTO ${table} (nac_code, ${colNames}) VALUES (?, ${placeholders})`,
                        [v.nac_code, ...cols.map(c => rest[c])]
                    );
                }
            }
        }
    }

    if (added) {
        details.push(`Family ${baseNac}: ${added} spare_compatibility row(s) ${dryRun ? 'would be ' : ''}added`);
    }
    return added;
}

async function reconcileVariantBalances(
    connection: PoolConnection,
    nacCode: string,
    dryRun: boolean,
    details: string[]
): Promise<boolean> {
    if (!dryRun) {
        await rebuildNacInventoryState(connection, nacCode);
    }

    const [stockRows] = await connection.execute<RowDataPacket[]>(
        `SELECT current_balance FROM stock_details WHERE nac_code = ?`,
        [nacCode]
    );
    if (!stockRows.length) {
        return false;
    }

    const stored = toNum(stockRows[0].current_balance);
    const expected = await computeExpectedBalance(connection, nacCode);
    if (Math.abs(stored - expected) <= BALANCE_EPSILON) {
        return false;
    }

    if (!dryRun) {
        await connection.execute(
            `UPDATE stock_details SET current_balance = ? WHERE nac_code = ?`,
            [expected, nacCode]
        );
    }
    details.push(
        `Balance fix ${nacCode}: ${stored} → ${expected}${dryRun ? ' (dry run)' : ''}`
    );
    return true;
}

export async function reconcileInventoryFamilies(
    opts: ReconcileOptions = {}
): Promise<ReconcileResult> {
    const startedAt = new Date().toISOString();
    const dryRun = !!opts.dryRun;
    const errors: string[] = [];
    const details: string[] = [];
    let reconciledVariants = 0;
    let balanceFixes = 0;
    let compatRowsAdded = 0;
    let baseNacBackfilled = 0;
    let transactionRemaps = 0;
    let orphansSkipped = 0;

    const connection = await pool.getConnection();
    try {
        if (!dryRun) {
            await connection.beginTransaction();
        }

        orphansSkipped = await skipOrphans(connection, details);
        baseNacBackfilled = await backfillBaseNacCodes(connection, dryRun, details);

        const [families] = await connection.execute<RowDataPacket[]>(
            `SELECT DISTINCT ${FAMILY_KEY_SQL} AS familyKey
             FROM stock_details sd
             WHERE sd.nac_code IS NOT NULL AND TRIM(sd.nac_code) != ''
             ORDER BY familyKey ASC`
        );

        for (const fam of families) {
            const baseNac = String(fam.familyKey);
            try {
                const variants = await getFamilyVariants(connection, baseNac) as VariantRow[];
                if (!variants.length) {
                    continue;
                }

                transactionRemaps += await remapStragglerTransactions(
                    connection,
                    baseNac,
                    variants,
                    dryRun,
                    details
                );

                compatRowsAdded += await propagateCompatAndUnits(
                    connection,
                    baseNac,
                    variants,
                    dryRun,
                    details
                );

                for (const v of variants) {
                    reconciledVariants++;
                    const fixed = await reconcileVariantBalances(
                        connection,
                        v.nac_code,
                        dryRun,
                        details
                    );
                    if (fixed) {
                        balanceFixes++;
                    }
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                errors.push(`Family ${baseNac}: ${msg}`);
                logEvents(`Reconcile error for ${baseNac}: ${msg}`, 'stockLog.log');
            }
        }

        if (!dryRun) {
            await connection.commit();
        }
    } catch (err) {
        try {
            await connection.rollback();
        } catch {
            // ignore
        }
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(msg);
        logEvents(`Reconcile failed: ${msg}`, 'stockLog.log');
    } finally {
        connection.release();
    }

    return {
        startedAt,
        finishedAt: new Date().toISOString(),
        dryRun,
        reconciledVariants,
        balanceFixes,
        compatRowsAdded,
        baseNacBackfilled,
        transactionRemaps,
        orphansSkipped,
        errors,
        details: details.slice(0, 500),
    };
}
