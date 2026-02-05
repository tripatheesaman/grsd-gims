'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { API } from '@/lib/api';
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
    const [counts, setCounts] = useState<ApprovalCounts>(defaultCounts);
    const [loading, setLoading] = useState(false);
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
    const fetchCounts = useCallback(async () => {
        if (!permissions || !hasAnyApprovalPermission) {
            setCounts(defaultCounts);
            return;
        }
        setLoading(true);
        const nextCounts: ApprovalCounts = {
            requests: null,
            receives: null,
            rrps: null,
            issues: null,
            fuelIssues: null,
            total: 0,
            lastUpdated: Date.now()
        };
        try {
            const tasks: Promise<void>[] = [];
            if (permissions.includes('can_approve_request')) {
                tasks.push(API.get('/api/request/pending')
                    .then((res) => {
                    if (Array.isArray(res.data)) {
                        const unique = new Set<string>();
                        res.data.forEach((item: {
                            requestNumber?: string;
                            request_number?: string;
                        }) => {
                            const id = item.requestNumber ?? item.request_number;
                            if (id)
                                unique.add(id);
                        });
                        nextCounts.requests = unique.size;
                    }
                    else {
                        nextCounts.requests = 0;
                    }
                })
                    .catch(() => {
                    nextCounts.requests = 0;
                }));
            }
            if (permissions.includes('can_approve_receive')) {
                tasks.push(API.get('/api/receive/pending')
                    .then((res) => {
                    if (Array.isArray(res.data)) {
                        nextCounts.receives = res.data.length;
                    }
                    else if (Array.isArray(res.data?.items)) {
                        nextCounts.receives = res.data.items.length;
                    }
                    else {
                        nextCounts.receives = 0;
                    }
                })
                    .catch(() => {
                    nextCounts.receives = 0;
                }));
            }
            if (permissions.includes('can_approve_rrp')) {
                tasks.push(API.get('/api/rrp/pending')
                    .then((res) => {
                    const pending = Array.isArray(res.data?.pendingRRPs) ? res.data.pendingRRPs : res.data ?? [];
                    if (Array.isArray(pending)) {
                        const unique = new Set<string>();
                        pending.forEach((item: {
                            rrp_number?: string;
                        }) => {
                            if (item?.rrp_number)
                                unique.add(item.rrp_number);
                        });
                        nextCounts.rrps = unique.size;
                    }
                    else {
                        nextCounts.rrps = 0;
                    }
                })
                    .catch(() => {
                    nextCounts.rrps = 0;
                }));
            }
            if (permissions.includes('can_approve_issues')) {
                tasks.push(API.get('/api/issue/pending')
                    .then((res) => {
                    const issues = Array.isArray(res.data?.issues) ? res.data.issues : [];
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
                })
                    .catch(() => {
                    nextCounts.issues = 0;
                }));
                tasks.push(API.get('/api/issue/pending/fuel')
                    .then((res) => {
                    const issues = Array.isArray(res.data?.issues) ? res.data.issues : [];
                    const grouped = new Set<string>();
                    issues.forEach((issue: {
                        issue_slip_number?: string;
                    }) => {
                        if (issue.issue_slip_number)
                            grouped.add(issue.issue_slip_number);
                    });
                    nextCounts.fuelIssues = grouped.size;
                })
                    .catch(() => {
                    nextCounts.fuelIssues = 0;
                }));
            }
            await Promise.all(tasks);
        }
        finally {
            nextCounts.total = computeTotal(nextCounts);
            setCounts(nextCounts);
            setLoading(false);
        }
    }, [permissions, hasAnyApprovalPermission]);
    useEffect(() => {
        if (!hasAnyApprovalPermission)
            return;
        fetchCounts();
    }, [fetchCounts, hasAnyApprovalPermission]);
    useEffect(() => {
        if (!hasAnyApprovalPermission)
            return;
        const interval = setInterval(() => {
            fetchCounts();
        }, 60000);
        return () => clearInterval(interval);
    }, [fetchCounts, hasAnyApprovalPermission]);
    const value = useMemo<ApprovalCountsContextValue>(() => ({
        counts,
        loading,
        refresh: fetchCounts
    }), [counts, loading, fetchCounts]);
    return <ApprovalCountsContext.Provider value={value}>{children}</ApprovalCountsContext.Provider>;
};
export const useApprovalCountsContext = () => {
    const context = useContext(ApprovalCountsContext);
    if (!context) {
        throw new Error('useApprovalCountsContext must be used within an ApprovalCountsProvider');
    }
    return context;
};
