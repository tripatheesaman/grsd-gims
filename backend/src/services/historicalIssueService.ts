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

export interface HistoricalPeriodAgg extends RowDataPacket {
    nac_code: string;
    total_qty: number;
    txn_count: number;
    avg_qty: number;
    min_date: string;
    max_date: string;
    period_days: number;
}

const BATCH_SIZE = 1000;

export interface HistoricalIssueImportResult {
    imported: number;
    skipped: number;
    errors: string[];
    dateRange: { from: string | null; to: string | null };
    uniqueNacCodes: number;
}

export interface HistoricalIssueStats {
    totalRecords: number;
    uniqueNacCodes: number;
    dateFrom: string | null;
    dateTo: string | null;
    lastImportedAt: string | null;
    lastImportedBy: string | null;
    lastSourceFile: string | null;
}

interface ParsedRow {
    issueDate: string;
    nacCode: string;
    issueQuantity: number;
}

export const ensureHistoricalIssueTable = async (connection?: PoolConnection): Promise<void> => {
    const db = connection ?? pool;
    await db.execute(`
        CREATE TABLE IF NOT EXISTS historical_issue_details (
            id INT AUTO_INCREMENT PRIMARY KEY,
            issue_date DATE NOT NULL,
            nac_code VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
            issue_quantity DECIMAL(18, 4) NOT NULL,
            source_file VARCHAR(255) NULL,
            imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            imported_by VARCHAR(255) NULL,
            INDEX idx_historical_issue_nac_date (nac_code, issue_date),
            INDEX idx_historical_issue_date (issue_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    try {
        await db.execute(`
            ALTER TABLE historical_issue_details
            MODIFY nac_code VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
        `);
    } catch {
        // Table may not exist yet on first deploy; ignore if alter fails
    }
};

export const parseHistoricalIssueWorkbook = (workbook: {
    worksheets: Array<{
        rowCount: number;
        getRow: (n: number) => { values: unknown[]; getCell: (c: number) => { value: unknown } };
    }>;
}): { rows: ParsedRow[]; errors: string[]; skipped: number } => {
    const ws = workbook.worksheets[0];
    if (!ws || ws.rowCount < 2) {
        return { rows: [], errors: ['Workbook is empty or has no data rows'], skipped: 0 };
    }

    const headerRow = ws.getRow(1);
    const rawHeaders = headerRow.values.slice(1).map(normalizeHeader);
    const dateCol = findColumnIndex(rawHeaders, ['english date', 'date', 'issue date']);
    const nacCol = findColumnIndex(rawHeaders, ['nac code', 'nac']);
    const qtyCol = findColumnIndex(rawHeaders, ['quantity', 'issue quantity', 'qty']);

    if (dateCol < 0 || nacCol < 0 || qtyCol < 0) {
        return {
            rows: [],
            errors: [`Required columns not found. Expected Date, NAC Code, and Quantity. Found: ${rawHeaders.join(', ')}`],
            skipped: 0
        };
    }

    const rows: ParsedRow[] = [];
    const errors: string[] = [];
    let skipped = 0;

    for (let i = 2; i <= ws.rowCount; i++) {
        const row = ws.getRow(i);
        const issueDate = parseExcelDate(row.getCell(dateCol).value);
        const nacCode = String(row.getCell(nacCol).value ?? '').trim();
        const issueQuantity = parseQuantity(row.getCell(qtyCol).value);

        if (!issueDate || !nacCode || issueQuantity == null) {
            skipped++;
            if (errors.length < 20 && (!nacCode || issueQuantity == null || !issueDate)) {
                errors.push(`Row ${i}: invalid date, NAC code, or quantity`);
            }
            continue;
        }

        rows.push({ issueDate, nacCode, issueQuantity });
    }

    return { rows, errors, skipped };
};

export const importHistoricalIssuesFromBuffer = async (
    buffer: Buffer,
    options: { importedBy?: string; sourceFile?: string } = {}
): Promise<HistoricalIssueImportResult> => {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const { rows, errors, skipped } = parseHistoricalIssueWorkbook(workbook);
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
        await ensureHistoricalIssueTable(connection);
        await connection.execute('TRUNCATE TABLE historical_issue_details');

        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);
            const placeholders = batch.map(() => '(?, ?, ?, ?, ?)').join(', ');
            const params: (string | number)[] = [];
            for (const row of batch) {
                params.push(
                    row.issueDate,
                    row.nacCode,
                    row.issueQuantity,
                    options.sourceFile ?? 'Issue Database.xlsx',
                    options.importedBy ?? 'system'
                );
            }
            await connection.execute(
                `INSERT INTO historical_issue_details (issue_date, nac_code, issue_quantity, source_file, imported_by)
                 VALUES ${placeholders}`,
                params
            );
        }

        await connection.commit();

        const dates = rows.map(r => r.issueDate).sort();
        const uniqueNacCodes = new Set(rows.map(r => r.nacCode)).size;

        logEvents(
            `Historical issue import: ${rows.length} rows, ${uniqueNacCodes} NAC codes, by ${options.importedBy ?? 'unknown'}`,
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

export const getHistoricalIssueStats = async (): Promise<HistoricalIssueStats> => {
    await ensureHistoricalIssueTable();
    const [rows] = await pool.execute<RowDataPacket[]>(`
        SELECT
            COUNT(*) AS total_records,
            COUNT(DISTINCT nac_code) AS unique_nac_codes,
            MIN(issue_date) AS date_from,
            MAX(issue_date) AS date_to,
            MAX(imported_at) AS last_imported_at,
            (SELECT imported_by FROM historical_issue_details ORDER BY imported_at DESC LIMIT 1) AS last_imported_by,
            (SELECT source_file FROM historical_issue_details ORDER BY imported_at DESC LIMIT 1) AS last_source_file
        FROM historical_issue_details
    `);

    const row = rows[0] ?? {};
    const total = Number(row.total_records) || 0;

    return {
        totalRecords: total,
        uniqueNacCodes: Number(row.unique_nac_codes) || 0,
        dateFrom: formatDateField(row.date_from),
        dateTo: formatDateField(row.date_to),
        lastImportedAt: row.last_imported_at ? String(row.last_imported_at) : null,
        lastImportedBy: row.last_imported_by ?? null,
        lastSourceFile: row.last_source_file ?? null
    };
};

export const getHistoricalIssuePeriodAggs = async (): Promise<Map<string, HistoricalPeriodAgg>> => {
    await ensureHistoricalIssueTable();
    const [rows] = await pool.execute<HistoricalPeriodAgg[]>(`
        SELECT
            h.nac_code COLLATE utf8mb4_unicode_ci AS nac_code,
            COALESCE(SUM(h.issue_quantity), 0) AS total_qty,
            COUNT(*) AS txn_count,
            COALESCE(AVG(h.issue_quantity), 0) AS avg_qty,
            MIN(h.issue_date) AS min_date,
            MAX(h.issue_date) AS max_date,
            GREATEST(DATEDIFF(MAX(h.issue_date), MIN(h.issue_date)) + 1, 1) AS period_days
        FROM historical_issue_details h
        GROUP BY h.nac_code COLLATE utf8mb4_unicode_ci
    `);
    return new Map(rows.map(r => [r.nac_code, r]));
};

export const getHistoricalIssueQtyLists = async (): Promise<Map<string, number[]>> => {
    await ensureHistoricalIssueTable();
    const [rows] = await pool.execute<RowDataPacket[]>(`
        SELECT nac_code COLLATE utf8mb4_unicode_ci AS nac_code, issue_quantity
        FROM historical_issue_details
        WHERE issue_quantity > 0
        ORDER BY issue_date DESC
    `);
    const map = new Map<string, number[]>();
    for (const row of rows) {
        const qty = Number(row.issue_quantity) || 0;
        if (!map.has(row.nac_code)) map.set(row.nac_code, []);
        map.get(row.nac_code)!.push(qty);
    }
    return map;
};

/** SQL fragment: combined approved live + all imported historical issues */
export const COMBINED_ISSUES_SUBQUERY = `
    SELECT
        i.nac_code COLLATE utf8mb4_unicode_ci AS nac_code,
        i.issue_date,
        i.issue_quantity
    FROM issue_details i
    WHERE i.approval_status = 'APPROVED'
    UNION ALL
    SELECT
        h.nac_code COLLATE utf8mb4_unicode_ci AS nac_code,
        h.issue_date,
        h.issue_quantity
    FROM historical_issue_details h
`;
