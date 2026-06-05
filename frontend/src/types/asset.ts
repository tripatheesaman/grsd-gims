export interface AssetType {
    id: number;
    name: string;
    description?: string;
    created_at?: string;
    updated_at?: string;
}
export interface AssetTypeProperty {
    id: number;
    asset_type_id: number;
    property_name: string;
    is_required: boolean;
    display_order: number;
    created_at?: string;
}
export interface AssetTypeWithProperties extends AssetType {
    properties: AssetTypeProperty[];
}
export interface CreateAssetTypeDTO {
    name: string;
    description?: string;
    properties?: {
        property_name: string;
        is_required: boolean;
        display_order?: number;
    }[];
}
export interface UpdateAssetTypeDTO {
    name?: string;
    description?: string;
    properties?: {
        property_name: string;
        is_required: boolean;
        display_order?: number;
    }[];
}
export interface Asset {
    id: number;
    asset_type_id: number;
    name: string;
    asset_type_name?: string | null;
    equipment_code?: string | null;
    location?: string | null;
    rrp_status?: string | null;
    current_value?: number | null;
    original_purchase_cost_npr?: number | null;
    purchase_fy?: string | null;
    last_depreciation_fy?: string | null;
    book_value_npr?: number | null;
    elapsed_fiscal_years?: number | null;
    annual_depreciation_npr?: number | null;
    original_insurance_amount_npr?: number | null;
    insurance_book_value_npr?: number | null;
    annual_insurance_depreciation_npr?: number | null;
    insurance_amount?: number | null;
    servicability_status?: string | null;
    purchase_currency?: string | null;
    purchase_fx_rate?: number | null;
    purchase_amount_base?: number | null;
    rrp_total_npr?: number | null;
    image_path?: string | null;
    created_by?: number;
    created_at?: string;
    updated_at?: string;
    asset_type?: AssetTypeWithProperties;
    property_values?: AssetPropertyValue[];
    capital_rrp_lines?: AssetCapitalRrpLine[];
}
export interface AssetPropertyValue {
    id: number;
    asset_id: number;
    property_name: string;
    property_value: string | null;
    created_at?: string;
    updated_at?: string;
}
export interface AssetCapitalRrpLine {
    id: number;
    rrp_number: string;
    rrp_date?: string | null;
    supplier_name?: string | null;
    currency?: string | null;
    forex_rate?: number | null;
    invoice_number?: string | null;
    invoice_date?: string | null;
    po_number?: string | null;
    approval_status?: string | null;
    item_price?: number | null;
    total_amount?: number | null;
    vat_percentage?: number | null;
    created_at?: string | null;
}
export interface CreateAssetDTO {
    asset_type_id: number;
    name: string;
    equipment_code: string;
    location: string;
    rrp_status: string;
    current_value: number;
    insurance_amount?: number | null;
    servicability_status: string;
    purchase_currency: string;
    purchase_fx_rate: number;
    purchase_amount_base: number;
    property_values?: {
        property_name: string;
        property_value: string;
    }[];
}
export interface UpdateAssetDTO {
    name?: string;
    location?: string | null;
    rrp_status?: string | null;
    current_value?: number | null;
    insurance_amount?: number | null;
    servicability_status?: string | null;
    property_values?: {
        property_name: string;
        property_value: string;
    }[];
    equipment_code?: string;
    purchase_currency?: string | null;
    purchase_fx_rate?: number | null;
    purchase_amount_base?: number | null;
}
export interface AssetWithTypeAndProperties extends Asset {
    asset_type: AssetTypeWithProperties;
    property_values: AssetPropertyValue[];
}
export const VALID_PROPERTY_NAMES = [
    'equipment_code',
    'location',
    'rrp_status',
    'current_value',
    'insurance_amount',
    'servicability_status',
    'purchase_currency',
    'purchase_fx_rate',
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
    'purchase_amount'
] as const;
export const PROPERTY_DISPLAY_LABELS: Record<string, string> = {
    equipment_code: 'Equipment Code',
    location: 'Location',
    rrp_status: 'RRP Status',
    current_value: 'Purchase cost',
    insurance_amount: 'Insurance Amount',
    servicability_status: 'Servicability Status',
    purchase_currency: 'Purchase Currency',
    purchase_fx_rate: 'Purchase FX Rate',
    equipment_manufacturer_name: 'Equipment Manufacturer\'s Name',
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
    purchase_amount: 'Purchase Amount'
};
export type PropertyName = typeof VALID_PROPERTY_NAMES[number];
