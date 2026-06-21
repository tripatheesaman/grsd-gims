'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/context/AuthContext';

export function useRecordsPageAuth(permission: string) {
    const { user, permissions } = useAuthContext();
    const router = useRouter();

    useEffect(() => {
        if (!user) {
            router.push('/login');
            return;
        }
        if (!permissions.includes(permission)) {
            router.push('/unauthorized');
        }
    }, [user, permissions, permission, router]);

    return {
        canAccess: !!user && permissions.includes(permission),
        permissions,
    };
}
