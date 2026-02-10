import { useApiQuery } from './useApiQuery';
import { queryKeys } from '@/lib/queryKeys';

export function usePendingRequestsQuery(enabled = true) {
  return useApiQuery(
    queryKeys.request.pending(),
    '/api/request/pending',
    undefined,
    {
      enabled,
      refetchInterval: 30000,
      staleTime: 1000 * 15,
    }
  );
}

export function useRequestItemsQuery(requestNumber: string | null, enabled = true) {
  return useApiQuery(
    queryKeys.request.items(requestNumber!),
    `/api/request/items/${requestNumber}`,
    undefined,
    {
      enabled: enabled && requestNumber !== null,
      staleTime: 1000 * 60,
    }
  );
}
