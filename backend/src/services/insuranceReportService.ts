import { RowDataPacket } from 'mysql2';
import ExcelJS from 'exceljs';
import {
    AssetDepreciationRow,
    calculateDepreciatedBookValue,
    computeAssetFinancials,
    countElapsedFiscalYears,
    HISTORICAL_INSURANCE_BASELINE_FY,
    INSURANCE_ANNUAL_DEPRECIATION_RATE,
    MIN_INSURANCE_BOOK_VALUE_USD,
    resolveInsuranceBaselineFy,
    resolveOriginalInsuranceAmountUsd,
    roundAssetCurrency,
} from './assetDepreciationService';
import { FISCAL_YEAR_LABEL_REGEX } from './fiscalYearService';
import {
    AssetsReportFilters,
    DepreciationByFy,
    fetchAssetRows,
    isAssetIncludedForFiscalYear,
    listFiscalYearLabels,
    parseReportSortOptions,
    PROPERTY_DISPLAY_LABELS,
    REPORT_PROPERTY_NAMES,
    sortReportRows,
} from './assetsReportService';

export const INSURANCE_REPORT_SORT_FIELDS = [
    'equipment_code',
    'name',
    'asset_type_name',
    'location',
    'insurance_baseline_fy',
    'original_insurance_amount_usd',
    'total_insurance_depreciation_usd',
    'current_insurance_value_usd',
] as const;

export interface InsuranceReportRow {
    id: number;
    name: string;
    equipment_code: string;
    asset_type_name: string;
    location: string;
    rrp_status: string;
    servicability_status: string;
    purchase_year: string | null;
    purchase_fy: string;
    insurance_baseline_fy: string;
    original_insurance_amount_usd: number;
    annual_insurance_depreciation_usd: number;
    elapsed_insurance_fiscal_years: number;
    total_insurance_depreciation_usd: number;
    current_insurance_value_usd: number;
    property_values: Record<string, string>;
    depreciation_by_fy: DepreciationByFy[];
}

export interface InsuranceReportResult {
    fiscalYear: string;
    insuranceBaselineFy: string;
    fiscalYearColumns: string[];
    data: InsuranceReportRow[];
    pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
}

export function buildInsuranceDepreciationSchedule(
    originalInsuranceUsd: number,
    baselineFy: string,
    selectedFy: string
): DepreciationByFy[] {
    if (fiscalYearStartYearSafe(selectedFy) < fiscalYearStartYearSafe(baselineFy)) {
        return [];
    }
    return listFiscalYearLabels(baselineFy, selectedFy).map((fy) => {
        const elapsed = countElapsedFiscalYears(baselineFy, fy);
        const previousBookValue = calculateDepreciatedBookValue(
            originalInsuranceUsd,
            Math.max(0, elapsed - 1),
            INSURANCE_ANNUAL_DEPRECIATION_RATE,
            MIN_INSURANCE_BOOK_VALUE_USD
        );
        const annualDepreciationNpr =
            elapsed > 0
                ? roundAssetCurrency(previousBookValue * INSURANCE_ANNUAL_DEPRECIATION_RATE)
                : 0;
        const bookValueEndOfFy = calculateDepreciatedBookValue(
            originalInsuranceUsd,
            elapsed,
            INSURANCE_ANNUAL_DEPRECIATION_RATE,
            MIN_INSURANCE_BOOK_VALUE_USD
        );
        return { fy, annualDepreciationNpr, bookValueEndOfFy };
    });
}

function fiscalYearStartYearSafe(label: string): number {
    return parseInt(label.split('/')[0], 10);
}

export function isInsuranceReportRowIncluded(
    asset: AssetDepreciationRow,
    selectedFy: string
): boolean {
    const originalInsurance = resolveOriginalInsuranceAmountUsd(asset);
    if (!originalInsurance || originalInsurance <= 0) {
        return false;
    }
    return isAssetIncludedForFiscalYear(asset, selectedFy);
}

function enrichInsuranceRow(raw: RowDataPacket, selectedFy: string): InsuranceReportRow {
    const asset = raw as AssetDepreciationRow & RowDataPacket;
    const meta = computeAssetFinancials(asset, selectedFy);
    const baselineFy = resolveInsuranceBaselineFy(asset);
    const insuranceElapsed = countElapsedFiscalYears(baselineFy, selectedFy);
    const depreciationByFy = buildInsuranceDepreciationSchedule(
        meta.original_insurance_amount_usd,
        baselineFy,
        selectedFy
    );
    const totalDepreciation = roundAssetCurrency(
        Math.max(0, meta.original_insurance_amount_usd - meta.insurance_book_value_usd)
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
        insurance_baseline_fy: baselineFy,
        original_insurance_amount_usd: meta.original_insurance_amount_usd,
        annual_insurance_depreciation_usd: meta.annual_insurance_depreciation_usd,
        elapsed_insurance_fiscal_years: insuranceElapsed,
        total_insurance_depreciation_usd: totalDepreciation,
        current_insurance_value_usd: meta.insurance_book_value_usd,
        property_values: propertyValues,
        depreciation_by_fy: depreciationByFy,
    };
}

function buildInsuranceFiscalYearColumns(selectedFy: string): string[] {
    if (fiscalYearStartYearSafe(selectedFy) < fiscalYearStartYearSafe(HISTORICAL_INSURANCE_BASELINE_FY)) {
        return [];
    }
    return listFiscalYearLabels(HISTORICAL_INSURANCE_BASELINE_FY, selectedFy);
}

export async function buildInsuranceReport(filters: AssetsReportFilters): Promise<InsuranceReportResult> {
    const selectedFy = String(filters.fiscalYear || '').trim();
    if (!FISCAL_YEAR_LABEL_REGEX.test(selectedFy)) {
        throw new Error('A valid fiscal year (YYYY/YY) is required');
    }

    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(Math.max(1, filters.pageSize || 20), 500);

    const rawRows = await fetchAssetRows(filters);
    const filtered = rawRows.filter((row) =>
        isInsuranceReportRowIncluded(row as AssetDepreciationRow, selectedFy)
    );
    const enriched = filtered.map((row) => enrichInsuranceRow(row, selectedFy));
    const { sortBy, sortOrder } = parseReportSortOptions(
        filters.sortBy,
        filters.sortOrder,
        INSURANCE_REPORT_SORT_FIELDS,
        'equipment_code'
    );
    const sorted = sortReportRows(enriched, sortBy, sortOrder);

    const fiscalYearColumns = buildInsuranceFiscalYearColumns(selectedFy);
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const offset = (page - 1) * pageSize;
    const data = sorted.slice(offset, offset + pageSize);

    return {
        fiscalYear: selectedFy,
        insuranceBaselineFy: HISTORICAL_INSURANCE_BASELINE_FY,
        fiscalYearColumns,
        data,
        pagination: { page, pageSize, total, totalPages },
    };
}

export async function fetchInsuranceReportForExport(
    filters: Omit<AssetsReportFilters, 'page' | 'pageSize'>,
    exportType: 'all' | 'currentPage',
    page?: number,
    pageSize?: number
): Promise<InsuranceReportResult> {
    return buildInsuranceReport({
        ...filters,
        page: exportType === 'currentPage' ? page || 1 : 1,
        pageSize: exportType === 'currentPage' ? pageSize || 20 : 1_000_000,
    });
}

export async function writeInsuranceReportExcel(
    report: InsuranceReportResult,
    res: import('express').Response
): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Insurance ${report.fiscalYear}`.replace(/\//g, '-'));

    const baseHeaders = [
        'Equipment Code',
        'Equipment Name',
        'Asset Type',
        'Location',
        'RRP Status',
        'Servicability Status',
        ...REPORT_PROPERTY_NAMES.map((name) => PROPERTY_DISPLAY_LABELS[name] || name),
        'Purchase FY',
        'Insurance Baseline FY',
        'Original Insurance Amount (USD)',
        'Annual Insurance Depreciation (USD)',
        'Elapsed Insurance FYs',
        'Total Insurance Depreciation (USD)',
        ...report.fiscalYearColumns.map((fy) => `Insurance Depreciation ${fy} (USD)`),
        `Insurance Value @ ${report.fiscalYear} (USD)`,
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
            'Insurance Baseline FY': row.insurance_baseline_fy,
            'Original Insurance Amount (USD)': row.original_insurance_amount_usd,
            'Annual Insurance Depreciation (USD)': row.annual_insurance_depreciation_usd,
            'Elapsed Insurance FYs': row.elapsed_insurance_fiscal_years,
            'Total Insurance Depreciation (USD)': row.total_insurance_depreciation_usd,
            [`Insurance Value @ ${report.fiscalYear} (USD)`]: row.current_insurance_value_usd,
        };
        for (const name of REPORT_PROPERTY_NAMES) {
            const label = PROPERTY_DISPLAY_LABELS[name] || name;
            excelRow[label] = row.property_values[name] || '';
        }
        for (const fy of report.fiscalYearColumns) {
            excelRow[`Insurance Depreciation ${fy} (USD)`] = depByFy.get(fy) ?? '';
        }
        worksheet.addRow(excelRow);
    }

    if (report.data.length === 0) {
        worksheet.addRow(['No insurance records found for the selected fiscal year']);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
        'Content-Disposition',
        `attachment; filename="Insurance_Report_${report.fiscalYear.replace('/', '-')}_${new Date().toISOString().split('T')[0]}.xlsx"`
    );
    await workbook.xlsx.write(res);
}
