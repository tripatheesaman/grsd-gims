'use client';

import { useQuery } from '@tanstack/react-query';
import { API } from '@/lib/api';

export interface AssetSettings {
    locations: string[];
    servicability_statuses: string[];
    weight_units: string[];
    size_units: string[];
    quantity_units: string[];
    default_asset_type_id: number | null;
}

const DEFAULTS: AssetSettings = {
    locations: [],
    servicability_statuses: ['Serviceable', 'Unserviceable'],
    weight_units: ['KG', 'TON'],
    size_units: ['M', 'FT', 'CM'],
    quantity_units: ['EA', 'SET', 'UNIT'],
    default_asset_type_id: null,
};

export function useAssetSettings(enabled = true) {
    return useQuery({
        queryKey: ['asset-settings'],
        queryFn: async (): Promise<AssetSettings> => {
            const res = await API.get<AssetSettings>('/api/settings/assets');
            return {
                locations: res.data.locations?.length ? res.data.locations : DEFAULTS.locations,
                servicability_statuses: res.data.servicability_statuses?.length
                    ? res.data.servicability_statuses
                    : DEFAULTS.servicability_statuses,
                weight_units: res.data.weight_units?.length ? res.data.weight_units : DEFAULTS.weight_units,
                size_units: res.data.size_units?.length ? res.data.size_units : DEFAULTS.size_units,
                quantity_units: res.data.quantity_units?.length ? res.data.quantity_units : DEFAULTS.quantity_units,
                default_asset_type_id: res.data.default_asset_type_id ?? null,
            };
        },
        enabled,
        staleTime: 60_000,
    });
}
