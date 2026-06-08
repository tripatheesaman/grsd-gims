import { DepreciationByFy } from '@/types/assetsReport';

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

export interface InsuranceReportResponse {
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
