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

export interface AssetsReportResponse {
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
