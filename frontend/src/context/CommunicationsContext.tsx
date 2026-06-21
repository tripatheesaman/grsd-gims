'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApiQuery } from '@/hooks/api/useApiQuery';
import { useAuthContext } from '@/context/AuthContext';
import { UnacknowledgedThread } from '@/types/communications';
import { useCustomToast } from '@/components/ui/custom-toast';
import { API } from '@/lib/api';

interface CommunicationsContextValue {
    unacknowledged: UnacknowledgedThread[];
    unacknowledgedCount: number;
    activeOpenCount: number;
    isLoading: boolean;
    refreshUnacknowledged: () => Promise<void>;
}

const CommunicationsContext = createContext<CommunicationsContextValue | null>(null);

export function CommunicationsProvider({ children }: { children: ReactNode }) {
    const { isAuthenticated, user } = useAuthContext();
    const queryClient = useQueryClient();
    const { showSuccessToast } = useCustomToast();
    const userId = user?.UserInfo?.id;
    const seenAlertKeysRef = useRef<Set<string>>(new Set());
    const loginMentionPingRef = useRef(false);

    const { data, isLoading } = useApiQuery<UnacknowledgedThread[]>(
        ['communications', 'unacknowledged', userId],
        '/api/communications/unacknowledged',
        undefined,
        {
            enabled: isAuthenticated && !!userId,
            refetchInterval: 5000,
            staleTime: 2000,
            refetchOnMount: 'always',
            refetchOnWindowFocus: true,
        }
    );

    const unacknowledged = useMemo(() => data?.data ?? [], [data?.data]);

    const { data: activeCountResponse } = useApiQuery<{ count: number }>(
        ['communications', 'active-count', userId],
        '/api/communications/active-count',
        undefined,
        {
            enabled: isAuthenticated && !!userId,
            refetchInterval: 5000,
            staleTime: 2000,
            refetchOnMount: 'always',
            refetchOnWindowFocus: true,
        }
    );

    const activeOpenCount = activeCountResponse?.data?.count ?? 0;

    useEffect(() => {
        if (!isAuthenticated || !userId) {
            loginMentionPingRef.current = false;
            return;
        }
        if (loginMentionPingRef.current) return;
        loginMentionPingRef.current = true;

        API.get<UnacknowledgedThread[]>('/api/communications/unacknowledged', {
            params: { sessionStart: '1' },
        })
            .then(() => {
                queryClient.invalidateQueries({ queryKey: ['communications', 'unacknowledged'] });
            })
            .catch(() => {
                // non-blocking; regular polling will still load pending alerts
            });
    }, [isAuthenticated, userId, queryClient]);

    useEffect(() => {
        if (!userId || !unacknowledged.length) return;

        for (const item of unacknowledged) {
            const key = `${item.id}-${item.alertType ?? 'initial'}-${item.alertId ?? 0}`;
            if (seenAlertKeysRef.current.has(key)) continue;
            seenAlertKeysRef.current.add(key);

            if (item.alertType === 'reply' && item.latestReply) {
                showSuccessToast({
                    title: 'New reply',
                    message: `${item.latestReply.authorName} replied to "${item.title}"`,
                    duration: 8000,
                });
            } else if (item.alertType === 'mention' && item.latestReply) {
                showSuccessToast({
                    title: 'You were mentioned',
                    message: `${item.latestReply.authorName} mentioned you in "${item.title}"`,
                    duration: 8000,
                });
            }
        }
    }, [unacknowledged, userId, showSuccessToast]);

    const refreshUnacknowledged = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: ['communications', 'unacknowledged'] });
        await queryClient.invalidateQueries({ queryKey: ['communications', 'active-count'] });
        await queryClient.invalidateQueries({ queryKey: ['communications', 'threads'] });
        await queryClient.invalidateQueries({ queryKey: ['notifications', 'me'] });
    }, [queryClient]);

    const value = useMemo<CommunicationsContextValue>(() => ({
        unacknowledged,
        unacknowledgedCount: unacknowledged.length,
        activeOpenCount,
        isLoading,
        refreshUnacknowledged,
    }), [unacknowledged, activeOpenCount, isLoading, refreshUnacknowledged]);

    return (
        <CommunicationsContext.Provider value={value}>
            {children}
        </CommunicationsContext.Provider>
    );
}

export function useCommunicationsContext() {
    const context = useContext(CommunicationsContext);
    if (!context) {
        throw new Error('useCommunicationsContext must be used within CommunicationsProvider');
    }
    return context;
}

export function useCommunicationsContextOptional() {
    return useContext(CommunicationsContext);
}
