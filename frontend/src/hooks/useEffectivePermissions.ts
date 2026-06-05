'use client';

import { useMemo } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { useApiQuery } from '@/hooks/api/useApiQuery';

/** Permissions from DB (authoritative), merged with JWT/context fallbacks. */
export function useEffectivePermissions() {
    const { permissions: contextPermissions, user, isAuthenticated } = useAuthContext();

    const { data: liveResponse, isLoading, refetch } = useApiQuery<string[]>(
        ['auth', 'permissions'],
        '/api/auth/permissions',
        undefined,
        {
            enabled: isAuthenticated,
            staleTime: 1000 * 30,
            retry: 1,
        }
    );

    const permissions = useMemo(() => {
        const live = liveResponse?.data;
        const fromContext = contextPermissions ?? [];
        const fromUser = user?.UserInfo?.permissions ?? [];
        const merged = [
            ...(Array.isArray(live) ? live : []),
            ...fromContext,
            ...fromUser,
        ].filter((p): p is string => typeof p === 'string' && p.length > 0);
        return [...new Set(merged)];
    }, [liveResponse?.data, contextPermissions, user?.UserInfo?.permissions]);

    return { permissions, isLoading, refetch };
}
