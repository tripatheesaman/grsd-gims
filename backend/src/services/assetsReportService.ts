import { RowDataPacket } from 'mysql2';
import ExcelJS from 'exceljs';
import pool from '../config/db';
import { ensureAssetSpareSchema } from './assetSpareSchema';
import {
    ANNUAL_DEPRECIATION_RATE,
    AssetDepreciationRow,
    calculateDepreciatedBookValue,
    computeAssetFinancials,
    countElapsedFiscalYears,
    fiscalYearStartYear,
    resolvePurchaseFyForAsset,
    roundAssetCurrency,
} from './assetDepreciationService';
import { FISCAL_YEAR_LABEL_REGEX } from './fiscalYearService';

const ASSET_RRP_TOTAL_NPR_SQL = `(SELECT COALESCE(SUM(rd.total_amount), 0)
    FROM rrp_details rd
    WHERE rd.asset_fk = a.id
      AND rd.rrp_category = 'capital'
      AND rd.approval_status = 'APPROVED')`;

export const REPORT_PROPERTY_NAMES = [
    'equipment_manufacturer_name',
    'model_name',
    'series',
    'engine_number',
    'engine_model_number',
    'serial_number',
    'transmission_model',
    'vin_number',
    'weight',
    'size',
    'quantity',
    'purchase_year',
    'purchase_currency',
    'purchase_fx_rate',
] as const;

export const PROPERTY_DISPLAY_LABELS: Record<string, string> = {
    equipment_manufacturer_name: "Equipment Manufacturer's Name",
    model_name: 'Model Name',
    series: 'Series',
    engine_number: 'Engine Number',
    engine_model_number: 'Engine Model Number',
    serial_number: 'Serial Number',
    transmission_model: 'Transmission Model',
    vin_number: 'Chassis Number',
    weight: 'Weight',
    size: 'Size',
    quantity: 'Quantity',
    purchase_year: 'Purchase Year (AD)',
    purchase_currency: 'Purchase Currency',
    purchase_fx_rate: 'Purchase FX Rate',
};

export interface DepreciationByFy {
    fy: string;
    annualDepreciationNpr: number;
    bookValueEndOfFy: number;
}

export interface AssetsReportRow {
    id: number;
    name: string;
    equipment_code: string;
    asset_type_name: string;
    location: string;
    rrp_status: string;
    servicability_status: string;
    purchase_year: string | null;
    purchase_fy: string;
    original_purchase_cost_npr: number;
    annual_depreciation_npr: number;
    elapsed_fiscal_years: number;
    total_depreciation_npr: number;
    current_value_npr: number;
    property_values: Record<string, string>;
    depreciation_by_fy: DepreciationByFy[];
}

export type ReportSortOrder = 'ASC' | 'DESC';

export const ASSETS_REPORT_SORT_FIELDS = [
    'equipment_code',
    'name',
    'asset_type_name',
    'location',
    'purchase_fy',
    'original_purchase_cost_npr',
    'total_depreciation_npr',
    'current_value_npr',
] as const;

export interface AssetsReportFilters {
    fiscalYear: string;
    asset_type_id?: number;
    search?: string;
    equipment_code?: string;
    sortBy?: string;
    sortOrder?: ReportSortOrder;
    page?: number;
    pageSize?: number;
}

export function parseReportSortOptions(
    sortBy: string | undefined,
    sortOrder: string | undefined,
    allowedFields: readonly string[],
    defaultField: string
): { sortBy: string; sortOrder: ReportSortOrder } {
    const field = sortBy && allowedFields.includes(sortBy) ? sortBy : defaultField;
    const order = String(sortOrder || '').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    return { sortBy: field, sortOrder: order };
}

export function sortReportRows<T extends object>(
    rows: T[],
    sortBy: string,
    sortOrder: ReportSortOrder,
    fiscalYearFields: Set<string> = new Set(['purchase_fy', 'insurance_baseline_fy'])
): T[] {
    const direction = sortOrder === 'ASC' ? 1 : -1;

    return [...rows].sort((left, right) => {
        const leftRecord = left as Record<string, unknown>;
        const rightRecord = right as Record<string, unknown>;
        let a: string | number | null = (leftRecord[sortBy] as string | number | null | undefined) ?? null;
        let b: string | number | null = (rightRecord[sortBy] as string | number | null | undefined) ?? null;

        if (fiscalYearFields.has(sortBy)) {
            try {
                a = a ? fiscalYearStartYear(String(a)) : null;
                b = b ? fiscalYearStartYear(String(b)) : null;
            } catch {
                a = null;
                b = null;
            }
        }

        if (a == null && b == null) return 0;
        if (a == null) return 1;
        if (b == null) return -1;

        if (typeof a === 'number' && typeof b === 'number') {
            return (a - b) * direction;
        }

        return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }) * direction;
    });
}

export interface AssetsReportResult {
    fiscalYear: string;
    fiscalYearColumns: string[];
    data: AssetsReportRow[];
    pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
}

export function listFiscalYearLabels(fromFy: string, toFy: string): string[] {
    const start = fiscalYearStartYear(fromFy);
    const end = fiscalYearStartYear(toFy);
    const labels: string[] = [];
    for (let year = start; year <= end; year++) {
        const endShort = ((year + 1) % 100).toString().padStart(2, '0');
        labels.push(`${year}/${endShort}`);
    }
    return labels;
}

export function buildDepreciationSchedule(
    originalCostNpr: number,
    purchaseFy: string,
    selectedFy: string
): DepreciationByFy[] {
    return listFiscalYearLabels(purchaseFy, selectedFy).map((fy) => {
        const elapsed = countElapsedFiscalYears(purchaseFy, fy);
        const previousBookValue = calculateDepreciatedBookValue(
            originalCostNpr,
            Math.max(0, elapsed - 1)
        );
        const annualDepreciationNpr =
            elapsed > 0 ? roundAssetCurrency(previousBookValue * ANNUAL_DEPRECIATION_RATE) : 0;
        const bookValueEndOfFy = calculateDepreciatedBookValue(originalCostNpr, elapsed);
        return { fy, annualDepreciationNpr, bookValueEndOfFy };
    });
}

export function isAssetIncludedForFiscalYear(asset: AssetDepreciationRow, selectedFy: string): boolean {
    const purchaseFy = resolvePurchaseFyForAsset(asset);
    return fiscalYearStartYear(purchaseFy) <= fiscalYearStartYear(selectedFy);
}

function enrichAssetRow(raw: RowDataPacket, selectedFy: string): AssetsReportRow {
    const asset = raw as AssetDepreciationRow & RowDataPacket;
    const meta = computeAssetFinancials(asset, selectedFy);
    const depreciationByFy = buildDepreciationSchedule(
        meta.original_purchase_cost_npr,
        meta.purchase_fy,
        selectedFy
    );
    const totalDepreciation = roundAssetCurrency(
        Math.max(0, meta.original_purchase_cost_npr - meta.book_value_npr)
    );
    const propertyValues: Record<string, string> = {};
    for (const name of REPORT_PROPERTY_NAMES) {
        const value = raw[`prop_${name}`];
        if (value != null && String(value).trim() !== '') {
            propertyValues[name] = String(value).trim();
        }
    }
    if (asset.purchase_year && !propertyValues.purchase_year) {
        propertyValues.purchase_year = String(asset.purchase_year).trim();
    }

    return {
        id: Number(asset.id),
        name: String(raw.name || ''),
        equipment_code: String(raw.equipment_code || ''),
        asset_type_name: String(raw.asset_type_name || 'Unclassified'),
        location: String(raw.location || ''),
        rrp_status: String(raw.rrp_status || ''),
        servicability_status: String(raw.servicability_status || ''),
        purchase_year: propertyValues.purchase_year ?? (asset.purchase_year ? String(asset.purchase_year) : null),
        purchase_fy: meta.purchase_fy,
        original_purchase_cost_npr: meta.original_purchase_cost_npr,
        annual_depreciation_npr: meta.annual_depreciation_npr,
        elapsed_fiscal_years: meta.elapsed_fiscal_years,
        total_depreciation_npr: totalDepreciation,
        current_value_npr: meta.book_value_npr,
        property_values: propertyValues,
        depreciation_by_fy: depreciationByFy,
    };
}

export async function fetchAssetRows(filters: Omit<AssetsReportFilters, 'page' | 'pageSize'>): Promise<RowDataPacket[]> {
    await ensureAssetSpareSchema();

    const propertySelects = REPORT_PROPERTY_NAMES.map(
        (name) =>
            `(SELECT apv.property_value FROM asset_property_values apv
              WHERE apv.asset_id = a.id AND apv.property_name = '${name}' LIMIT 1) AS prop_${name}`
    ).join(',\n             ');

    let query = `
        SELECT a.id, a.asset_type_id, a.name,
               a.equipment_code, a.location, a.rrp_status, a.current_value,
               a.original_purchase_cost_npr, a.purchase_fy, a.last_depreciation_fy,
               a.insurance_amount, a.original_insurance_amount_npr, a.servicability_status,
               a.purchase_currency, a.purchase_fx_rate, a.purchase_amount_base,
               ${ASSET_RRP_TOTAL_NPR_SQL} AS rrp_total_npr,
               (SELECT apv.property_value FROM asset_property_values apv
                WHERE apv.asset_id = a.id AND apv.property_name = 'purchase_year' LIMIT 1) AS purchase_year,
               a.created_at,
               at.name AS asset_type_name,
               ${propertySelects}
        FROM assets a
        LEFT JOIN asset_types at ON a.asset_type_id = at.id
        WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (filters.asset_type_id) {
        query += ' AND a.asset_type_id = ?';
        params.push(filters.asset_type_id);
    }
    if (filters.search?.trim()) {
        query += ` AND (
            a.name LIKE ? OR at.name LIKE ? OR a.equipment_code LIKE ?
            OR EXISTS (
                SELECT 1 FROM asset_property_values apv
                WHERE apv.asset_id = a.id AND apv.property_value LIKE ?
            )
        )`;
        const term = `%${filters.search.trim()}%`;
        params.push(term, term, term, term);
    }
    if (filters.equipment_code?.trim()) {
        query += ' AND a.equipment_code LIKE ?';
        params.push(`%${filters.equipment_code.trim()}%`);
    }

    query += ' ORDER BY a.equipment_code ASC, a.name ASC';

    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    return rows;
}

export async function buildAssetsReport(filters: AssetsReportFilters): Promise<AssetsReportResult> {
    const selectedFy = String(filters.fiscalYear || '').trim();
    if (!FISCAL_YEAR_LABEL_REGEX.test(selectedFy)) {
        throw new Error('A valid fiscal year (YYYY/YY) is required');
    }

    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(Math.max(1, filters.pageSize || 20), 500);

    const rawRows = await fetchAssetRows(filters);
    const filtered = rawRows.filter((row) => isAssetIncludedForFiscalYear(row as AssetDepreciationRow, selectedFy));
    const enriched = filtered.map((row) => enrichAssetRow(row, selectedFy));
    const { sortBy, sortOrder } = parseReportSortOptions(
        filters.sortBy,
        filters.sortOrder,
        ASSETS_REPORT_SORT_FIELDS,
        'equipment_code'
    );
    const sorted = sortReportRows(enriched, sortBy, sortOrder);

    const minPurchaseFy =
        sorted.length > 0
            ? sorted.reduce((min, row) =>
                  fiscalYearStartYear(row.purchase_fy) < fiscalYearStartYear(min) ? row.purchase_fy : min,
              sorted[0].purchase_fy)
            : selectedFy;

    const fiscalYearColumns = listFiscalYearLabels(minPurchaseFy, selectedFy);
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const offset = (page - 1) * pageSize;
    const data = sorted.slice(offset, offset + pageSize);

    return {
        fiscalYear: selectedFy,
        fiscalYearColumns,
        data,
        pagination: { page, pageSize, total, totalPages },
    };
}

export async function fetchAssetsReportForExport(
    filters: Omit<AssetsReportFilters, 'page' | 'pageSize'>,
    exportType: 'all' | 'currentPage',
    page?: number,
    pageSize?: number
): Promise<AssetsReportResult> {
    return buildAssetsReport({
        ...filters,
        page: exportType === 'currentPage' ? page || 1 : 1,
        pageSize: exportType === 'currentPage' ? pageSize || 20 : 1_000_000,
    });
}

export async function writeAssetsReportExcel(
    report: AssetsReportResult,
    res: import('express').Response
): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Assets ${report.fiscalYear}`.replace(/\//g, '-'));

    const baseHeaders = [
        'Equipment Code',
        'Equipment Name',
        'Asset Type',
        'Location',
        'RRP Status',
        'Servicability Status',
        ...REPORT_PROPERTY_NAMES.map((name) => PROPERTY_DISPLAY_LABELS[name] || name),
        'Purchase FY',
        'Original Purchase Cost (NPR)',
        'Annual Depreciation (NPR)',
        'Elapsed FYs',
        'Total Depreciation (NPR)',
        ...report.fiscalYearColumns.map((fy) => `Depreciation ${fy} (NPR)`),
        `Current Value @ ${report.fiscalYear} (NPR)`,
    ];

    worksheet.columns = baseHeaders.map((header) => ({ header, key: header, width: 18 }));
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF003594' },
    };

    for (const row of report.data) {
        const depByFy = new Map(row.depreciation_by_fy.map((d) => [d.fy, d.annualDepreciationNpr]));
        const excelRow: Record<string, string | number> = {
            'Equipment Code': row.equipment_code,
            'Equipment Name': row.name,
            'Asset Type': row.asset_type_name,
            'Location': row.location,
            'RRP Status': row.rrp_status,
            'Servicability Status': row.servicability_status,
            'Purchase FY': row.purchase_fy,
            'Original Purchase Cost (NPR)': row.original_purchase_cost_npr,
            'Annual Depreciation (NPR)': row.annual_depreciation_npr,
            'Elapsed FYs': row.elapsed_fiscal_years,
            'Total Depreciation (NPR)': row.total_depreciation_npr,
            [`Current Value @ ${report.fiscalYear} (NPR)`]: row.current_value_npr,
        };
        for (const name of REPORT_PROPERTY_NAMES) {
            const label = PROPERTY_DISPLAY_LABELS[name] || name;
            excelRow[label] = row.property_values[name] || '';
        }
        for (const fy of report.fiscalYearColumns) {
            excelRow[`Depreciation ${fy} (NPR)`] = depByFy.get(fy) ?? '';
        }
        worksheet.addRow(excelRow);
    }

    if (report.data.length === 0) {
        worksheet.addRow(['No assets found for the selected fiscal year']);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
        'Content-Disposition',
        `attachment; filename="Assets_Report_${report.fiscalYear.replace('/', '-')}_${new Date().toISOString().split('T')[0]}.xlsx"`
    );
    await workbook.xlsx.write(res);
}
