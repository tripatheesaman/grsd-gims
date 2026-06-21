import { useApiQuery } from './useApiQuery';
import { queryKeys } from '@/lib/queryKeys';
import { ItemDetails } from '@/types/item';

export function useItemDetailsQuery(
    id: number | null,
    partNumber?: string,
    enabled = true
) {
    const params = partNumber?.trim() ? { partNumber: partNumber.trim() } : undefined;
    return useApiQuery<ItemDetails>(
        queryKeys.search.item(id!, partNumber),
        `/api/search/item/${id}`,
        params,
        {
            enabled: enabled && id !== null,
            staleTime: 1000 * 60 * 5,
        }
    );
}
