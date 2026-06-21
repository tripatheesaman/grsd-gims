import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

export type ApprovalScope =
    | 'request'
    | 'receive'
    | 'assetReceive'
    | 'rrp'
    | 'capitalRrp'
    | 'issue'
    | 'fuel';

export function invalidatePendingApprovals(
    queryClient: QueryClient,
    scopes?: ApprovalScope[]
): Promise<unknown[]> {
    const all = !scopes || scopes.length === 0;
    const tasks: Promise<unknown>[] = [];

    if (all || scopes.includes('request')) {
        tasks.push(queryClient.invalidateQueries({ queryKey: queryKeys.request.pending() }));
    }
    if (all || scopes.includes('receive')) {
        tasks.push(queryClient.invalidateQueries({ queryKey: queryKeys.receive.pending() }));
    }
    if (all || scopes.includes('assetReceive')) {
        tasks.push(queryClient.invalidateQueries({ queryKey: queryKeys.assetReceive.pending() }));
    }
    if (all || scopes.includes('rrp')) {
        tasks.push(queryClient.invalidateQueries({ queryKey: queryKeys.rrp.pending() }));
    }
    if (all || scopes.includes('capitalRrp')) {
        tasks.push(queryClient.invalidateQueries({ queryKey: ['capital-rrp', 'pending'] }));
    }
    if (all || scopes.includes('issue')) {
        tasks.push(queryClient.invalidateQueries({ queryKey: queryKeys.issue.pending() }));
    }
    if (all || scopes.includes('fuel')) {
        tasks.push(queryClient.invalidateQueries({ queryKey: queryKeys.issue.pendingFuel() }));
    }

    return Promise.all(tasks);
}
