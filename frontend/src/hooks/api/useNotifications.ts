import { useApiQuery } from './useApiQuery';
import { useApiPut } from './useApiMutation';
import { useQueryClient } from '@tanstack/react-query';

export function useNotificationsQuery(enabled = true) {
  return useApiQuery(
    ['notifications'],
    '/api/notification',
    undefined,
    {
      enabled,
      refetchInterval: 30000,
      staleTime: 1000 * 15,
    }
  );
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useApiPut({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
