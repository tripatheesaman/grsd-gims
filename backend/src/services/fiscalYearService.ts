import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { adToBs, bsToAd, formatBsDate, getBsMonthDays } from '../utils/dateConverter';
import { logEvents } from '../middlewares/logger';

export const FISCAL_YEAR_LABEL_REGEX = /^\d{4}\/\d{2}$/;

export interface FiscalYearBounds {
    label: string;
    startBs: string;
    endBs: string;
    startAd: string;
    endAd: string;
}

/** Nepali FY: month 4 day 1 through last day of month 3 in the following BS year (e.g. 2081/82 → 2081-04-01 … 2082-03-{last}). */
export function fiscalYearFromBsDate(bsDate: string): string {
    const [yearStr, monthStr] = bsDate.split('-');
    const bsYear = parseInt(yearStr, 10);
    const bsMonth = parseInt(monthStr, 10);
    if (bsMonth >= 4) {
        const endShort = ((bsYear + 1) % 100).toString().padStart(2, '0');
        return `${bsYear}/${endShort}`;
    }
    const startYear = bsYear - 1;
    const endShort = (bsYear % 100).toString().padStart(2, '0');
    return `${startYear}/${endShort}`;
}

export function fiscalYearFromAdDate(adDate: string): string {
    return fiscalYearFromBsDate(adToBs(adDate));
}

export function getTodayAdDate(): string {
    return new Date().toISOString().slice(0, 10);
}

export function getCurrentFiscalYearFromToday(): string {
    return fiscalYearFromAdDate(getTodayAdDate());
}

export function parseFiscalYearStartBsYear(label: string): number {
    if (!FISCAL_YEAR_LABEL_REGEX.test(label)) {
        throw new Error(`Invalid fiscal year label: ${label}`);
    }
    return parseInt(label.split('/')[0], 10);
}

export function getFiscalYearBounds(label: string): FiscalYearBounds {
    const startBsYear = parseFiscalYearStartBsYear(label);
    const endBsYear = startBsYear + 1;
    const endMonth = 3;
    const endDay = getBsMonthDays(endBsYear, endMonth);
    const startBs = formatBsDate(startBsYear, 4, 1);
    const endBs = formatBsDate(endBsYear, endMonth, endDay);
    return {
        label,
        startBs,
        endBs,
        startAd: bsToAd(startBs),
        endAd: bsToAd(endBs),
    };
}

export function isAdDateWithinFiscalYear(adDate: string, label: string): boolean {
    const bounds = getFiscalYearBounds(label);
    return adDate >= bounds.startAd && adDate <= bounds.endAd;
}

export function isBsDateWithinFiscalYear(bsDate: string, label: string): boolean {
    return fiscalYearFromBsDate(bsDate) === label;
}

async function readStoredFiscalYear(connection: PoolConnection): Promise<string | null> {
    const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT config_value FROM app_config
         WHERE config_name = 'current_fy'
         ORDER BY (config_type = 'rrp') DESC
         LIMIT 1`,
        []
    );
    const value = rows[0]?.config_value;
    return typeof value === 'string' && FISCAL_YEAR_LABEL_REGEX.test(value) ? value : null;
}

async function writeStoredFiscalYear(connection: PoolConnection, fiscalYear: string): Promise<void> {
    const [result] = await connection.execute(
        `UPDATE app_config SET config_value = ?
         WHERE config_name = 'current_fy'`,
        [fiscalYear]
    );
    if ((result as { affectedRows?: number }).affectedRows === 0) {
        await connection.execute(
            `INSERT INTO app_config (config_name, config_value, config_type) VALUES ('current_fy', ?, 'rrp')`,
            [fiscalYear]
        );
    }
}

/**
 * Returns the fiscal year for today (Nepali calendar rules) and keeps app_config in sync.
 */
export async function resolveCurrentFiscalYear(connection: PoolConnection): Promise<string> {
    const computed = getCurrentFiscalYearFromToday();
    const stored = await readStoredFiscalYear(connection);
    if (stored !== computed) {
        await writeStoredFiscalYear(connection, computed);
        logEvents(
            `Fiscal year auto-updated: ${stored ?? '(none)'} → ${computed}`,
            'settingsLog.log'
        );
        const { onFiscalYearRollover } = await import('./assetDepreciationService');
        await onFiscalYearRollover(connection, stored, computed);
    }
    return computed;
}

export async function listKnownFiscalYears(connection: PoolConnection): Promise<string[]> {
    const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT DISTINCT fy_label FROM (
            SELECT current_fy AS fy_label FROM issue_details WHERE current_fy IS NOT NULL AND current_fy <> ''
            UNION SELECT current_fy AS fy_label FROM rrp_details WHERE current_fy IS NOT NULL AND current_fy <> ''
            UNION SELECT fy AS fy_label FROM fuel_records WHERE fy IS NOT NULL AND fy <> ''
        ) AS combined
        WHERE fy_label REGEXP '^[0-9]{4}/[0-9]{2}$'
        ORDER BY fy_label DESC`
    );
    return rows.map((r) => String(r.fy_label));
}

export async function getFiscalYearInfo(connection: PoolConnection): Promise<{
    fiscalYear: string;
    bounds: FiscalYearBounds;
    autoManaged: true;
    availableFiscalYears: string[];
}> {
    const fiscalYear = await resolveCurrentFiscalYear(connection);
    const known = await listKnownFiscalYears(connection);
    const availableFiscalYears = Array.from(new Set([fiscalYear, ...known])).sort((a, b) =>
        b.localeCompare(a)
    );
    return {
        fiscalYear,
        bounds: getFiscalYearBounds(fiscalYear),
        autoManaged: true,
        availableFiscalYears,
    };
}

/**
 * Resolve FY for list/report filters.
 * - `all` → no FY filter (null)
 * - valid label → that FY
 * - omitted → current running FY
 */
export function resolveFilterFiscalYear(
    queryFy: string | undefined,
    currentFy: string
): string | null {
    const trimmed = (queryFy || '').trim();
    if (trimmed.toLowerCase() === 'all') {
        return null;
    }
    if (trimmed && FISCAL_YEAR_LABEL_REGEX.test(trimmed)) {
        return trimmed;
    }
    return currentFy;
}

export function appendFyDateRangeSql(
    column: string,
    fyLabel: string,
    params: (string | number)[]
): string {
    const { startAd, endAd } = getFiscalYearBounds(fyLabel);
    params.push(startAd, endAd);
    return ` AND DATE(${column}) >= ? AND DATE(${column}) <= ?`;
}
