'use client';
import { createContext, useContext, useMemo, ReactNode } from 'react';
import { useApiQuery } from '@/hooks/api/useApiQuery';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthContext } from '@/context/AuthContext';

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

export const ApprovalCountsProvider = ({ children }: {
    children: ReactNode;
}) => {
    const { permissions } = useAuthContext();
    
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
            if (Array.isArray(receivesRes.data)) {
                nextCounts.receives = receivesRes.data.length;
            } else if (
                typeof receivesRes.data === 'object' &&
                receivesRes.data !== null &&
                'items' in receivesRes.data &&
                Array.isArray((receivesRes.data as { items: unknown }).items)
            ) {
                nextCounts.receives = (receivesRes.data as { items: unknown[] }).items.length;
            } else {
                nextCounts.receives = 0;
            }
        }
        
        if (permissions?.includes('can_approve_rrp') && rrpsRes?.data) {
            const pending = Array.isArray(rrpsRes.data?.pendingRRPs) ? rrpsRes.data.pendingRRPs : rrpsRes.data ?? [];
                    if (Array.isArray(pending)) {
                        const unique = new Set<string>();
                        pending.forEach((item: {
                            rrp_number?: string;
                        }) => {
                            if (item?.rrp_number)
                                unique.add(item.rrp_number);
                        });
                        nextCounts.rrps = unique.size;
            } else {
                    nextCounts.rrps = 0;
            }
            }
        
        if (permissions?.includes('can_approve_issues') && issuesRes?.data) {
            const issues = Array.isArray(issuesRes.data?.issues) ? issuesRes.data.issues : [];
                    const grouped = new Map<string, true>();
                    issues
                        .filter((issue: {
                        issue_slip_number?: string;
                        nac_code?: string;
                    }) => issue.nac_code !== 'GT 07986' && issue.nac_code !== 'GT 00000')
                        .forEach((issue: {
                        issue_slip_number?: string;
                    }) => {
                        if (issue.issue_slip_number)
                            grouped.set(issue.issue_slip_number, true);
                    });
                    nextCounts.issues = grouped.size;
        }
        
        if (permissions?.includes('can_approve_issues') && fuelIssuesRes?.data) {
            const issues = Array.isArray(fuelIssuesRes.data?.issues) ? fuelIssuesRes.data.issues : [];
                    const grouped = new Set<string>();
                    issues.forEach((issue: {
                        issue_slip_number?: string;
                    }) => {
                        if (issue.issue_slip_number)
                            grouped.add(issue.issue_slip_number);
                    });
                    nextCounts.fuelIssues = grouped.size;
        }
        
            nextCounts.total = computeTotal(nextCounts);
        return nextCounts;
    }, [hasAnyApprovalPermission, permissions, requestsRes?.data, receivesRes?.data, rrpsRes?.data, issuesRes?.data, fuelIssuesRes?.data]);
    
    const loading = requestsLoading || receivesLoading || rrpsLoading || issuesLoading || fuelIssuesLoading;
    
    const refresh = async () => {
    };
    
    const value = useMemo<ApprovalCountsContextValue>(() => ({
        counts,
        loading,
        refresh
    }), [counts, loading]);
    
    return <ApprovalCountsContext.Provider value={value}>{children}</ApprovalCountsContext.Provider>;
};

export const useApprovalCountsContext = () => {
    const context = useContext(ApprovalCountsContext);
    if (!context) {
        throw new Error('useApprovalCountsContext must be used within a ApprovalCountsProvider');
    }
    return context;
};
