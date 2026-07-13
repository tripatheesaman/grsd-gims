import { RowDataPacket, PoolConnection } from 'mysql2/promise';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';
import {
    buildSubNacCode,
    letterForIndex,
    normalizePartNumber,
    parseNacCode,
    splitPartNumbers,
    stripSuffixFromNac,
} from '../utils/nacCodeUtils';
import { processItemName } from '../utils/utils';
import {
    remapFamilyTransactionsToLatestReceivedPart,
    StockVariantRow,
    syncFamilyEquipments,
    resolveLatestReceivedPartTarget,
} from './inventoryVariantService';

export type MigrationOptions = {
    dryRun?: boolean;
    batchSize?: number;
};

export type MigrationResult = {
    startedAt: string;
    finishedAt: string;
    dryRun: boolean;
    processed: number;
    splitFamilies: number;
    singlePartFixed: number;
    errors: string[];
    details: string[];
};

type StockRow = RowDataPacket & {
    id: number;
    nac_code: string;
    base_nac_code: string | null;
    item_name: string;
    part_numbers: string;
    applicable_equipments: string;
    current_balance: number | string;
    open_quantity: number | string | null;
    open_amount: number | string | null;
    open_remaining_quantity: number | string | null;
    location: string | null;
    unit: string | null;
    image_url: string | null;
};

const toNum = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

async function getImageForPart(
    connection: PoolConnection,
    nacCode: string,
    partNumber: string,
    fallback: string | null
): Promise<string | null> {
    const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT image_path FROM receive_details
         WHERE nac_code = ? AND UPPER(TRIM(part_number)) = ? AND approval_status = 'APPROVED'
           AND image_path IS NOT NULL AND TRIM(image_path) != ''
         ORDER BY created_at DESC LIMIT 1`,
        [nacCode, normalizePartNumber(partNumber)]
    );
    if (rows.length && rows[0].image_path) {
        return String(rows[0].image_path);
    }
    return fallback;
}

async function computeFamilyBalanceOnLatestPart(
    connection: PoolConnection,
    nacCode: string,
    partNumbers: string[]
): Promise<{ latestPartNumber: string; totalBalance: number }> {
    const target = await resolveLatestReceivedPartTarget(connection, stripSuffixFromNac(nacCode), {
        legacyNacCode: nacCode,
        fallbackPartNumbers: partNumbers,
        variants: [],
    });
    const latestPartNumber = target?.partNumber
        ?? normalizePartNumber(partNumbers[partNumbers.length - 1] || '');

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
    const [stockRows] = await connection.execute<StockRow[]>(
        `SELECT current_balance, open_quantity FROM stock_details WHERE nac_code = ?`,
        [nacCode]
    );
    const openQty = stockRows.length ? toNum(stockRows[0].open_quantity) : 0;
    const fromTx = openQty + toNum(recvRows[0]?.qty) - toNum(issueRows[0]?.qty);
    const stockBalance = stockRows.length ? toNum(stockRows[0].current_balance) : 0;
    const totalBalance = Math.abs(fromTx) > 0.001 ? fromTx : stockBalance;

    return { latestPartNumber, totalBalance };
}

async function processStockRow(
    connection: PoolConnection,
    row: StockRow,
    dryRun: boolean,
    details: string[],
    errors: string[]
): Promise<{ split: boolean; singleFixed: boolean }> {
    const baseNac = stripSuffixFromNac(String(row.nac_code || ''));
    const itemName = processItemName(String(row.item_name || ''));
    const partNumbers = splitPartNumbers(String(row.part_numbers || ''));

    if (partNumbers.length <= 1) {
        const singlePn = partNumbers[0] || normalizePartNumber(row.part_numbers) || '';
        if (!dryRun) {
            await connection.execute(
                `UPDATE stock_details SET
                   item_name = ?,
                   part_numbers = ?,
                   base_nac_code = ?,
                   nac_code = CASE
                     WHEN nac_code REGEXP '^(GT|TW|GS) [0-9]{5}[A-Z]$' AND ? = ''
                       THEN LEFT(nac_code, 8)
                     ELSE nac_code
                   END
                 WHERE id = ?`,
                [itemName, singlePn, baseNac, singlePn, row.id]
            );
        }
        details.push(`Single-part fix: ${row.nac_code} → name trimmed, base_nac_code=${baseNac}`);
        return { split: false, singleFixed: true };
    }

    const { latestPartNumber, totalBalance } = await computeFamilyBalanceOnLatestPart(
        connection,
        row.nac_code,
        partNumbers
    );
    const openQty = toNum(row.open_quantity);
    const openAmt = toNum(row.open_amount);
    const latestPnNorm = normalizePartNumber(latestPartNumber);

    const variants: Array<{
        letter: string;
        partNumber: string;
        nacCode: string;
        balance: number;
        openQuantity: number;
        openAmount: number;
        isPrimary: boolean;
    }> = partNumbers.map((pn, idx) => {
        const letter = letterForIndex(idx);
        const nacCode = buildSubNacCode(baseNac, letter);
        const isLatest = normalizePartNumber(pn) === latestPnNorm;
        return {
            letter,
            partNumber: pn,
            nacCode,
            balance: isLatest ? totalBalance : 0,
            openQuantity: isLatest ? openQty : 0,
            openAmount: isLatest ? openAmt : 0,
            isPrimary: isLatest,
        };
    });

    const primary = variants.find(v => v.isPrimary) ?? variants[0];

    details.push(
        `Split family ${baseNac}: ${partNumbers.length} parts → ${variants.map(v => v.nacCode).join(', ')}; ` +
        `history on latest part ${primary.partNumber}`
    );

    if (dryRun) {
        return { split: true, singleFixed: false };
    }

    // Guard: never rename the primary onto a NAC code another row already owns — that would
    // create a duplicate sub-code that double-counts in family totals.
    if (primary.nacCode !== row.nac_code) {
        const [primaryDup] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM stock_details WHERE nac_code = ? AND id <> ?`,
            [primary.nacCode, row.id]
        );
        if (primaryDup.length) {
            errors.push(`Primary variant ${primary.nacCode} already exists; skipping split for row ${row.id} (${row.nac_code})`);
            return { split: false, singleFixed: false };
        }
    }

    const primaryImage = await getImageForPart(connection, row.nac_code, primary.partNumber, row.image_url);

    await connection.execute(
        `UPDATE stock_details SET
           nac_code = ?,
           base_nac_code = ?,
           item_name = ?,
           part_numbers = ?,
           current_balance = ?,
           open_quantity = ?,
           open_amount = ?,
           image_url = ?
         WHERE id = ?`,
        [
            primary.nacCode,
            baseNac,
            itemName,
            primary.partNumber,
            primary.balance,
            primary.openQuantity,
            primary.openAmount,
            primaryImage,
            row.id,
        ]
    );

    const createdVariants: StockVariantRow[] = [{
        ...row,
        id: row.id,
        nac_code: primary.nacCode,
        part_numbers: primary.partNumber,
        current_balance: primary.balance,
        open_quantity: primary.openQuantity,
        open_amount: primary.openAmount,
    } as StockVariantRow];

    for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        if (v.isPrimary) {
            continue;
        }
        const [dup] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM stock_details WHERE nac_code = ?`,
            [v.nacCode]
        );
        if (dup.length) {
            errors.push(`Variant ${v.nacCode} already exists, skipping insert`);
            continue;
        }

        const image = await getImageForPart(connection, row.nac_code, v.partNumber, row.image_url);
        await connection.execute(
            `INSERT INTO stock_details (
                nac_code, base_nac_code, item_name, part_numbers, applicable_equipments,
                current_balance, open_quantity, open_amount, open_remaining_quantity,
                location, unit, image_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                v.nacCode,
                baseNac,
                itemName,
                v.partNumber,
                row.applicable_equipments || '',
                v.balance,
                v.openQuantity,
                v.openAmount,
                0,
                row.location || '',
                row.unit || '',
                image,
            ]
        );

        createdVariants.push({
            ...row,
            nac_code: v.nacCode,
            part_numbers: v.partNumber,
            current_balance: v.balance,
            open_quantity: v.openQuantity,
            open_amount: v.openAmount,
        } as StockVariantRow);

        const equipmentTokens = String(row.applicable_equipments || '')
            .split(',')
            .map(t => t.trim())
            .filter(Boolean);
        for (const eq of equipmentTokens) {
            await connection.execute(
                `INSERT IGNORE INTO spare_compatibility (nac_code, equipment_code) VALUES (?, ?)`,
                [v.nacCode, eq]
            );
        }
    }

    await remapFamilyTransactionsToLatestReceivedPart(
        connection,
        baseNac,
        createdVariants,
        false,
        {
            legacyNacCode: row.nac_code,
            fallbackPartNumbers: partNumbers,
            detailLog: details,
        }
    );

    await syncFamilyEquipments(connection, baseNac, row.applicable_equipments || '');
    return { split: true, singleFixed: false };
}

export async function migrateInventoryPartVariants(opts: MigrationOptions = {}): Promise<MigrationResult> {
    const startedAt = new Date().toISOString();
    const dryRun = !!opts.dryRun;
    const batchSize = opts.batchSize && opts.batchSize > 0 ? opts.batchSize : 100;
    const errors: string[] = [];
    const details: string[] = [];
    let processed = 0;
    let splitFamilies = 0;
    let singlePartFixed = 0;

    const connection = await pool.getConnection();
    try {
        let lastId = 0;

        while (true) {
            // LIMIT/OFFSET placeholders are unreliable in mysql2 prepared statements — use id cursor + inline limit.
            const [rows] = await connection.query<StockRow[]>(
                `SELECT * FROM stock_details
                 WHERE id > ?
                   AND (
                     item_name LIKE '%,%'
                     OR part_numbers LIKE '%,%'
                     OR base_nac_code IS NULL
                     OR base_nac_code = ''
                   )
                 ORDER BY id ASC
                 LIMIT ${batchSize}`,
                [lastId]
            );

            if (!rows.length) {
                break;
            }

            if (!dryRun) {
                await connection.beginTransaction();
            }

            for (const row of rows) {
                lastId = row.id;
                try {
                    if (!row.nac_code || !String(row.nac_code).trim()) {
                        errors.push(`Row ${row.id}: skipped — missing nac_code`);
                        continue;
                    }
                    const itemNameRaw = String(row.item_name || '');
                    const partNumbers = splitPartNumbers(String(row.part_numbers || ''));
                    const needsWork =
                        itemNameRaw.includes(',') ||
                        partNumbers.length > 1 ||
                        !row.base_nac_code;

                    if (!needsWork) {
                        continue;
                    }

                    const result = await processStockRow(connection, row, dryRun, details, errors);
                    processed++;
                    if (result.split) {
                        splitFamilies++;
                    }
                    if (result.singleFixed) {
                        singlePartFixed++;
                    }
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    errors.push(`Row ${row.id} (${row.nac_code}): ${msg}`);
                    logEvents(`Migration error row ${row.id}: ${msg}`, 'stockLog.log');
                }
            }

            if (!dryRun) {
                await connection.commit();
            }

            if (rows.length < batchSize) {
                break;
            }
        }
    } catch (err) {
        try {
            await connection.rollback();
        } catch {
            // ignore
        }
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(msg);
        logEvents(`Migration failed: ${msg}`, 'stockLog.log');
    } finally {
        connection.release();
    }

    return {
        startedAt,
        finishedAt: new Date().toISOString(),
        dryRun,
        processed,
        splitFamilies,
        singlePartFixed,
        errors,
        details: details.slice(0, 500),
    };
}
