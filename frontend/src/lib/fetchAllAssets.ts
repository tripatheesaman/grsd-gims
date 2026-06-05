import { API } from '@/lib/api';
import type { Asset } from '@/types/asset';

export type AssetListQuery = {
    search?: string;
    asset_type_id?: string | number;
    rrp_status?: string;
    location?: string;
    equipment_code?: string;
    servicability_status?: string;
};

export async function fetchAllAssetsMatchingFilters(filters: AssetListQuery): Promise<Asset[]> {
    const pageSize = 2000;
    const params: Record<string, string | number> = { pageSize };
    if (filters.search?.trim()) params.search = filters.search.trim();
    if (filters.asset_type_id !== undefined && filters.asset_type_id !== '' && filters.asset_type_id !== 'all') {
        params.asset_type_id = filters.asset_type_id;
    }
    if (filters.rrp_status && filters.rrp_status !== 'all') params.rrp_status = filters.rrp_status;
    if (filters.location?.trim()) params.location = filters.location.trim();
    if (filters.equipment_code?.trim()) params.equipment_code = filters.equipment_code.trim();
    if (filters.servicability_status?.trim()) params.servicability_status = filters.servicability_status.trim();
    const all: Asset[] = [];
    let page = 1;
    let totalPages = 1;
    do {
        const res = await API.get<{ data: Asset[]; pagination: { totalPages: number } }>('/api/assets', {
            params: { ...params, page },
        });
        all.push(...res.data.data);
        totalPages = res.data.pagination.totalPages;
        page += 1;
    } while (page <= totalPages);
    return all;
}
