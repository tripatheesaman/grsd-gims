'use client';
import { createContext, useContext, useMemo, ReactNode, useCallback } from 'react';
import { useApiQuery } from '@/hooks/api/useApiQuery';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthContext } from '@/context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';

interface ApprovalCounts {
    requests: number | null;
    receives: number | null;
    rrps: number | null;
    issues: number | null;
    fuelIssues: number | null;
    total: number;
    lastUpdated: number | null;
}

interface ApprovalCountsContextValue {
    counts: ApprovalCounts;
    loading: boolean;
    refresh: () => Promise<void>;
}

const defaultCounts: ApprovalCounts = {
    requests: null,
    receives: null,
    rrps: null,
    issues: null,
    fuelIssues: null,
    total: 0,
    lastUpdated: null
};

const ApprovalCountsContext = createContext<ApprovalCountsContextValue | null>(null);

const computeTotal = (counts: ApprovalCounts) => ['requests', 'receives', 'rrps', 'issues', 'fuelIssues'].reduce((sum, key) => {
    const value = counts[key as keyof ApprovalCounts];
    return typeof value === 'number' ? sum + value : sum;
}, 0);
const normalizePendingReceives = (payload: unknown): Array<{ id: number }> => {
    const rows = Array.isArray(payload)
        ? payload
        : (payload &&
            typeof payload === 'object' &&
            'items' in payload &&
            Array.isArray((payload as { items: unknown[] }).items)
            ? (payload as { items: unknown[] }).items
            : []);
    const unique = new Map<number, { id: number }>();
    rows.forEach((row) => {
        if (!row || typeof row !== 'object')
            return;
        const id = Number((row as { id?: unknown }).id);
        if (!Number.isFinite(id))
            return;
        unique.set(id, { id });
    });
    return Array.from(unique.values());
};

export const ApprovalCountsProvider = ({ children }: {
    children: ReactNode;
}) => {
    const { permissions } = useAuthContext();
    const queryClient = useQueryClient();
    
    const hasAnyApprovalPermission = useMemo(() => {
        if (!permissions)
            return false;
        return [
            'can_approve_request',
            'can_approve_receive',
            'can_approve_rrp',
            'can_approve_issues'
        ].some((perm) => permissions.includes(perm));
    }, [permissions]);
    
    const { data: requestsRes, isLoading: requestsLoading } = useApiQuery(
        queryKeys.request.pending(),
        '/api/request/pending',
        undefined,
        {
            enabled: hasAnyApprovalPermission && permissions?.includes('can_approve_request'),
            refetchInterval: 60000,
            staleTime: 1000 * 30,
        }
    );
    
    const { data: receivesRes, isLoading: receivesLoading } = useApiQuery(
        queryKeys.receive.pending(),
        '/api/receive/pending',
        undefined,
        {
            enabled: hasAnyApprovalPermission && permissions?.includes('can_approve_receive'),
            refetchInterval: 60000,
            staleTime: 1000 * 30,
        }
    );
    
    const { data: rrpsRes, isLoading: rrpsLoading } = useApiQuery(
        queryKeys.rrp.pending(),
        '/api/rrp/pending',
        undefined,
        {
            enabled: hasAnyApprovalPermission && permissions?.includes('can_approve_rrp'),
            refetchInterval: 60000,
            staleTime: 1000 * 30,
        }
    );
    
    const { data: issuesRes, isLoading: issuesLoading } = useApiQuery(
        queryKeys.issue.pending(),
        '/api/issue/pending',
        undefined,
        {
            enabled: hasAnyApprovalPermission && permissions?.includes('can_approve_issues'),
            refetchInterval: 60000,
            staleTime: 1000 * 30,
        }
    );
    
    const { data: fuelIssuesRes, isLoading: fuelIssuesLoading } = useApiQuery(
        queryKeys.issue.pendingFuel(),
        '/api/issue/pending/fuel',
        undefined,
        {
            enabled: hasAnyApprovalPermission && permissions?.includes('can_approve_issues'),
            refetchInterval: 60000,
            staleTime: 1000 * 30,
        }
    );
    
    const counts: ApprovalCounts = useMemo(() => {
        if (!hasAnyApprovalPermission) {
            return defaultCounts;
        }
        
        const nextCounts: ApprovalCounts = {
            requests: null,
            receives: null,
            rrps: null,
            issues: null,
            fuelIssues: null,
            total: 0,
            lastUpdated: Date.now()
        };
        
        if (permissions?.includes('can_approve_request') && requestsRes?.data) {
            if (Array.isArray(requestsRes.data)) {
                        const unique = new Set<string>();
                requestsRes.data.forEach((item: {
                            requestNumber?: string;
                            request_number?: string;
                        }) => {
                            const id = item.requestNumber ?? item.request_number;
                            if (id)
                                unique.add(id);
                        });
                        nextCounts.requests = unique.size;
            } else {
                    nextCounts.requests = 0;
            }
            }
        
        if (permissions?.includes('can_approve_receive') && receivesRes?.data) {
            nextCounts.receives = normalizePendingReceives(receivesRes.data).length;
        }
        
        if (permissions?.includes('can_approve_rrp') && rrpsRes?.data) {
            const pending = (
                typeof rrpsRes.data === 'object' &&
                rrpsRes.data !== null &&
                'pendingRRPs' in rrpsRes.data &&
                Array.isArray((rrpsRes.data as { pendingRRPs: unknown }).pendingRRPs)
            )
                ? (rrpsRes.data as { pendingRRPs: unknown[] }).pendingRRPs
                : rrpsRes.data;
            if (Array.isArray(pending)) {
                const unique = new Set<string>();
                pending.forEach((item: { rrp_number?: string }) => {
                    if (item?.rrp_number) {
                        unique.add(item.rrp_number);
                    }
                });
                nextCounts.rrps = unique.size;
            } else {
                nextCounts.rrps = 0;
            }
        }
        
        if (permissions?.includes('can_approve_issues') && issuesRes?.data) {
            const issues = (
                typeof issuesRes.data === 'object' &&
                issuesRes.data !== null &&
                'issues' in issuesRes.data &&
                Array.isArray((issuesRes.data as { issues: unknown }).issues)
            )
                ? (issuesRes.data as { issues: { issue_slip_number?: string; nac_code?: string }[] }).issues
                : [];
            const grouped = new Map<string, true>();
            issues
                .filter((issue) => issue.nac_code !== 'GT 07986' && issue.nac_code !== 'GT 00000')
                .forEach((issue) => {
                    if (issue.issue_slip_number) {
                        grouped.set(issue.issue_slip_number, true);
                    }
                });
            nextCounts.issues = grouped.size;
        }
        
        if (permissions?.includes('can_approve_issues') && fuelIssuesRes?.data) {
            const issues = (
                typeof fuelIssuesRes.data === 'object' &&
                fuelIssuesRes.data !== null &&
                'issues' in fuelIssuesRes.data &&
                Array.isArray((fuelIssuesRes.data as { issues: unknown }).issues)
            )
                ? (fuelIssuesRes.data as { issues: { issue_slip_number?: string }[] }).issues
                : [];
            const grouped = new Set<string>();
            issues.forEach((issue) => {
                if (issue.issue_slip_number) {
                    grouped.add(issue.issue_slip_number);
                }
            });
            nextCounts.fuelIssues = grouped.size;
        }
        
            nextCounts.total = computeTotal(nextCounts);
        return nextCounts;
    }, [hasAnyApprovalPermission, permissions, requestsRes?.data, receivesRes?.data, rrpsRes?.data, issuesRes?.data, fuelIssuesRes?.data]);
    
    const loading = requestsLoading || receivesLoading || rrpsLoading || issuesLoading || fuelIssuesLoading;
    
    const refresh = useCallback(async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.request.pending() }),
            queryClient.invalidateQueries({ queryKey: queryKeys.receive.pending() }),
            queryClient.invalidateQueries({ queryKey: queryKeys.rrp.pending() }),
            queryClient.invalidateQueries({ queryKey: queryKeys.issue.pending() }),
            queryClient.invalidateQueries({ queryKey: queryKeys.issue.pendingFuel() })
        ]);
    }, [queryClient]);
    
    const value = useMemo<ApprovalCountsContextValue>(() => ({
        counts,
        loading,
        refresh
    }), [counts, loading, refresh]);
    
    return <ApprovalCountsContext.Provider value={value}>{children}</ApprovalCountsContext.Provider>;
};

export const useApprovalCountsContext = () => {
    const context = useContext(ApprovalCountsContext);
    if (!context) {
        throw new Error('useApprovalCountsContext must be used within a ApprovalCountsProvider');
    }
    return context;
};
