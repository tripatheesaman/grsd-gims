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
    created_by?: number;
    created_at?: string;
    updated_at?: string;
    asset_type?: AssetTypeWithProperties;
    property_values?: AssetPropertyValue[];
}
export interface AssetPropertyValue {
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
    property_values?: {
        property_name: string;
        property_value: string;
    }[];
}
export interface UpdateAssetDTO {
    name?: string;
    property_values?: {
        property_name: string;
        property_value: string;
    }[];
}
export interface AssetWithTypeAndProperties extends Asset {
    asset_type: AssetTypeWithProperties;
    property_values: AssetPropertyValue[];
}
export const VALID_PROPERTY_NAMES = [
    'equipment_manufacturer_name',
    'model_name',
    'series',
    'engine_number',
    'engine_model_number',
    'serial_number',
    'transmission_model',
    'chassis_number',
    'weight',
    'name',
    'size',
    'quantity',
    'purchase_year',
    'purchase_amount'
] as const;
export const PROPERTY_DISPLAY_LABELS: Record<string, string> = {
    equipment_manufacturer_name: 'Equipment Manufacturer\'s Name',
    model_name: 'Model Name',
    series: 'Series',
    engine_number: 'Engine Number',
    engine_model_number: 'Engine Model Number',
    serial_number: 'Serial Number',
    transmission_model: 'Transmission Model',
    chassis_number: 'Chassis Number',
    weight: 'Weight',
    name: 'Name',
    size: 'Size',
    quantity: 'Quantity',
    purchase_year: 'Purchase Year',
    purchase_amount: 'Purchase Amount'
};
export type PropertyName = typeof VALID_PROPERTY_NAMES[number];
