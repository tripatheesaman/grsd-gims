import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

export function invalidatePendingApprovals(queryClient: QueryClient): Promise<unknown[]> {
    return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.request.pending() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.receive.pending() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.assetReceive.pending() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.rrp.pending() }),
        queryClient.invalidateQueries({ queryKey: ['capital-rrp', 'pending'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.issue.pending() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.issue.pendingFuel() }),
    ]);
}
