import { useQuery } from '@tanstack/react-query';
import { useApiQuery } from './useApiQuery';
import { queryKeys } from '@/lib/queryKeys';
import { ItemDetails } from '@/types/item';

export function useItemDetailsQuery(id: number | null, enabled = true) {
  return useApiQuery<ItemDetails>(
    queryKeys.search.item(id!),
    `/api/search/item/${id}`,
    undefined,
    {
      enabled: enabled && id !== null,
      staleTime: 1000 * 60 * 5,
    }
  );
}
