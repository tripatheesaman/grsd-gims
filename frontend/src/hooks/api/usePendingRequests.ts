import { useApiQuery } from './useApiQuery';
import { queryKeys } from '@/lib/queryKeys';
import { PENDING_APPROVAL_QUERY_OPTIONS } from './usePendingApprovals';

export function usePendingRequestsQuery(enabled = true) {
  return useApiQuery(
    queryKeys.request.pending(),
    '/api/request/pending',
    undefined,
    {
      enabled,
      ...PENDING_APPROVAL_QUERY_OPTIONS,
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
