import { RowDataPacket } from 'mysql2';
export interface AssetType extends RowDataPacket {
    id: number;
    name: string;
    description?: string;
    created_at?: string;
    updated_at?: string;
}
export interface AssetTypeProperty extends RowDataPacket {
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
export interface Asset extends RowDataPacket {
    id: number;
    asset_type_id: number;
    name: string;
    equipment_code?: string | null;
    location?: string | null;
    rrp_status?: string | null;
    current_value?: number | null;
    insurance_amount?: number | null;
    servicability_status?: string | null;
    purchase_currency?: string | null;
    purchase_fx_rate?: number | null;
    purchase_amount_base?: number | null;
    created_by?: number;
    created_at?: string;
    updated_at?: string;
    asset_type?: AssetType;
    property_values?: AssetPropertyValue[];
}
export interface AssetPropertyValue extends RowDataPacket {
    id: number;
    asset_id: number;
    property_name: string;
    property_value: string | null;
    created_at?: string;
    updated_at?: string;
}
export interface CreateAssetDTO {
    asset_type_id: number;
    name: string;
    equipment_code: string;
    location?: string | null;
    rrp_status?: string | null;
    current_value?: number | null;
    insurance_amount?: number | null;
    servicability_status?: string | null;
    purchase_currency?: string | null;
    purchase_fx_rate?: number | null;
    purchase_amount_base?: number | null;
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
export type PropertyName = typeof VALID_PROPERTY_NAMES[number];
