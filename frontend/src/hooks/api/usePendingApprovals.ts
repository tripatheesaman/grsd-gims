import { useApiQuery } from './useApiQuery';
import { queryKeys } from '@/lib/queryKeys';

export const PENDING_APPROVAL_QUERY_OPTIONS = {
    staleTime: 0,
    refetchOnMount: 'always' as const,
    refetchInterval: 30000,
};

export function usePendingReceivesQuery(enabled = true) {
    return useApiQuery(
        queryKeys.receive.pending(),
        '/api/receive/pending',
        undefined,
        { enabled, ...PENDING_APPROVAL_QUERY_OPTIONS }
    );
}

export function usePendingIssuesQuery(enabled = true) {
    return useApiQuery(
        queryKeys.issue.pending(),
        '/api/issue/pending',
        undefined,
        { enabled, ...PENDING_APPROVAL_QUERY_OPTIONS }
    );
}

export function usePendingFuelIssuesQuery(enabled = true) {
    return useApiQuery(
        queryKeys.issue.pendingFuel(),
        '/api/issue/pending/fuel',
        undefined,
        { enabled, ...PENDING_APPROVAL_QUERY_OPTIONS }
    );
}

export function usePendingAssetReceivesQuery(enabled = true) {
    return useApiQuery(
        queryKeys.assetReceive.pending(),
        '/api/asset-receive/pending',
        undefined,
        { enabled, ...PENDING_APPROVAL_QUERY_OPTIONS }
    );
}
