import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';
import {
    findColumnIndex,
    formatDateField,
    normalizeHeader,
    parseExcelDate,
    parseQuantity
} from './historicalExcelUtils';

const BATCH_SIZE = 1000;

export interface HistoricalReceiveImportResult {
    imported: number;
    skipped: number;
    errors: string[];
    dateRange: { from: string | null; to: string | null };
    uniqueNacCodes: number;
}

export interface HistoricalReceiveStats {
    totalRecords: number;
    uniqueNacCodes: number;
    dateFrom: string | null;
    dateTo: string | null;
    lastImportedAt: string | null;
    lastImportedBy: string | null;
    lastSourceFile: string | null;
}

interface ParsedReceiveRow {
    receiveDate: string;
    nacCode: string;
    receivedQuantity: number;
    unit: string;
}

export const ensureHistoricalReceiveTable = async (connection?: PoolConnection): Promise<void> => {
    const db = connection ?? pool;
    await db.execute(`
        CREATE TABLE IF NOT EXISTS historical_receive_details (
            id INT AUTO_INCREMENT PRIMARY KEY,
            receive_date DATE NOT NULL,
            nac_code VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
            received_quantity DECIMAL(18, 4) NOT NULL,
            unit VARCHAR(32) NULL,
            source_file VARCHAR(255) NULL,
            imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            imported_by VARCHAR(255) NULL,
            INDEX idx_historical_receive_nac_date (nac_code, receive_date),
            INDEX idx_historical_receive_date (receive_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    try {
        await db.execute(`
            ALTER TABLE historical_receive_details
            MODIFY nac_code VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
        `);
    } catch {
        // ignore if table missing
    }
};

export const parseHistoricalReceiveWorkbook = (workbook: {
    worksheets: Array<{
        rowCount: number;
        getRow: (n: number) => { values: unknown[]; getCell: (c: number) => { value: unknown } };
    }>;
}): { rows: ParsedReceiveRow[]; errors: string[]; skipped: number } => {
    const ws = workbook.worksheets[0];
    if (!ws || ws.rowCount < 2) {
        return { rows: [], errors: ['Workbook is empty or has no data rows'], skipped: 0 };
    }

    const rawHeaders = ws.getRow(1).values.slice(1).map(normalizeHeader);
    const nacCol = findColumnIndex(rawHeaders, ['nac code', 'nac']);
    const qtyCol = findColumnIndex(rawHeaders, ['quantity', 'received quantity', 'qty']);
    const dateCol = findColumnIndex(rawHeaders, ['date', 'receive date', 'english date']);
    const unitCol = findColumnIndex(rawHeaders, ['unit']);

    if (nacCol < 0 || qtyCol < 0 || dateCol < 0) {
        return {
            rows: [],
            errors: [`Required columns not found. Expected NAC Code, Quantity, Date. Found: ${rawHeaders.join(', ')}`],
            skipped: 0
        };
    }

    const rows: ParsedReceiveRow[] = [];
    const errors: string[] = [];
    let skipped = 0;

    for (let i = 2; i <= ws.rowCount; i++) {
        const row = ws.getRow(i);
        const receiveDate = parseExcelDate(row.getCell(dateCol).value);
        const nacCode = String(row.getCell(nacCol).value ?? '').trim();
        const receivedQuantity = parseQuantity(row.getCell(qtyCol).value);
        const unit = unitCol > 0 ? String(row.getCell(unitCol).value ?? '').trim() : '';

        if (!receiveDate || !nacCode || receivedQuantity == null) {
            skipped++;
            if (errors.length < 20) {
                errors.push(`Row ${i}: invalid date, NAC code, or quantity`);
            }
            continue;
        }

        rows.push({ receiveDate, nacCode, receivedQuantity, unit });
    }

    return { rows, errors, skipped };
};

export const importHistoricalReceivesFromBuffer = async (
    buffer: Buffer,
    options: { importedBy?: string; sourceFile?: string } = {}
): Promise<HistoricalReceiveImportResult> => {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const { rows, errors, skipped } = parseHistoricalReceiveWorkbook(workbook);
    if (!rows.length) {
        return {
            imported: 0,
            skipped,
            errors: errors.length ? errors : ['No valid rows to import'],
            dateRange: { from: null, to: null },
            uniqueNacCodes: 0
        };
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await ensureHistoricalReceiveTable(connection);
        await connection.execute('TRUNCATE TABLE historical_receive_details');

        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);
            const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
            const params: (string | number)[] = [];
            for (const row of batch) {
                params.push(
                    row.receiveDate,
                    row.nacCode,
                    row.receivedQuantity,
                    row.unit || '',
                    options.sourceFile ?? 'Receive Database.xlsx',
                    options.importedBy ?? 'system'
                );
            }
            await connection.execute(
                `INSERT INTO historical_receive_details
                 (receive_date, nac_code, received_quantity, unit, source_file, imported_by)
                 VALUES ${placeholders}`,
                params
            );
        }

        await connection.commit();

        const dates = rows.map(r => r.receiveDate).sort();
        const uniqueNacCodes = new Set(rows.map(r => r.nacCode)).size;

        logEvents(
            `Historical receive import: ${rows.length} rows, ${uniqueNacCodes} NAC codes`,
            'reportLog.log'
        );

        return {
            imported: rows.length,
            skipped,
            errors: errors.slice(0, 20),
            dateRange: { from: dates[0] ?? null, to: dates[dates.length - 1] ?? null },
            uniqueNacCodes
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

export const getHistoricalReceiveStats = async (): Promise<HistoricalReceiveStats> => {
    await ensureHistoricalReceiveTable();
    const [rows] = await pool.execute<RowDataPacket[]>(`
        SELECT
            COUNT(*) AS total_records,
            COUNT(DISTINCT nac_code) AS unique_nac_codes,
            MIN(receive_date) AS date_from,
            MAX(receive_date) AS date_to,
            MAX(imported_at) AS last_imported_at,
            (SELECT imported_by FROM historical_receive_details ORDER BY imported_at DESC LIMIT 1) AS last_imported_by,
            (SELECT source_file FROM historical_receive_details ORDER BY imported_at DESC LIMIT 1) AS last_source_file
        FROM historical_receive_details
    `);

    const row = rows[0] ?? {};
    return {
        totalRecords: Number(row.total_records) || 0,
        uniqueNacCodes: Number(row.unique_nac_codes) || 0,
        dateFrom: formatDateField(row.date_from),
        dateTo: formatDateField(row.date_to),
        lastImportedAt: row.last_imported_at ? String(row.last_imported_at) : null,
        lastImportedBy: row.last_imported_by ?? null,
        lastSourceFile: row.last_source_file ?? null
    };
};

import type { HistoricalPeriodAgg } from './historicalIssueService';

export const getHistoricalReceivePeriodAggs = async (): Promise<Map<string, HistoricalPeriodAgg>> => {
    await ensureHistoricalReceiveTable();
    const [rows] = await pool.execute<HistoricalPeriodAgg[]>(`
        SELECT
            h.nac_code COLLATE utf8mb4_unicode_ci AS nac_code,
            COALESCE(SUM(h.received_quantity), 0) AS total_qty,
            COUNT(*) AS txn_count,
            COALESCE(AVG(h.received_quantity), 0) AS avg_qty,
            MIN(h.receive_date) AS min_date,
            MAX(h.receive_date) AS max_date,
            GREATEST(DATEDIFF(MAX(h.receive_date), MIN(h.receive_date)) + 1, 1) AS period_days
        FROM historical_receive_details h
        GROUP BY h.nac_code COLLATE utf8mb4_unicode_ci
    `);
    return new Map(rows.map(r => [r.nac_code, r]));
};

export const getHistoricalReceiveQtyLists = async (): Promise<Map<string, number[]>> => {
    await ensureHistoricalReceiveTable();
    const [rows] = await pool.execute<RowDataPacket[]>(`
        SELECT nac_code COLLATE utf8mb4_unicode_ci AS nac_code, received_quantity
        FROM historical_receive_details
        WHERE received_quantity > 0
        ORDER BY receive_date DESC
    `);
    const map = new Map<string, number[]>();
    for (const row of rows) {
        const qty = Number(row.received_quantity) || 0;
        if (!map.has(row.nac_code)) map.set(row.nac_code, []);
        map.get(row.nac_code)!.push(qty);
    }
    return map;
};

export const getHistoricalReceiveGapDays = async (): Promise<Map<string, number>> => {
    await ensureHistoricalReceiveTable();
    const [rows] = await pool.execute<RowDataPacket[]>(`
        SELECT nac_code, AVG(gap_days) AS avg_gap
        FROM (
            SELECT
                nac_code COLLATE utf8mb4_unicode_ci AS nac_code,
                DATEDIFF(
                    receive_date,
                    LAG(receive_date) OVER (PARTITION BY nac_code ORDER BY receive_date)
                ) AS gap_days
            FROM historical_receive_details
        ) gaps
        WHERE gap_days IS NOT NULL AND gap_days > 0
        GROUP BY nac_code
    `);
    const map = new Map<string, number>();
    for (const row of rows) {
        map.set(row.nac_code, Number(row.avg_gap) || 0);
    }
    return map;
};
