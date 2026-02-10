import { useApiQuery } from './useApiQuery';
import { queryKeys } from '@/lib/queryKeys';

export function usePendingReceivesQuery(enabled = true) {
  return useApiQuery(
    queryKeys.receive.pending(),
    '/api/receive/pending',
    undefined,
    {
      enabled,
      refetchInterval: 30000,
      staleTime: 1000 * 15,
    }
  );
}

export function useReceiveDetailsQuery(receiveId: number | null, enabled = true) {
  return useApiQuery(
    queryKeys.receive.details(receiveId!),
    `/api/receive/${receiveId}/details`,
    undefined,
    {
      enabled: enabled && receiveId !== null,
      staleTime: 1000 * 60,
    }
  );
}
