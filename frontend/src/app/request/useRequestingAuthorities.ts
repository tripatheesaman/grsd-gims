'use client';
import { useEffect, useState, useCallback } from 'react';
import { API } from '@/lib/api';
export interface RequestingAuthority {
    id: number;
    name: string;
    designation: string;
    staff_id?: string | null;
    section_name?: string | null;
    email?: string | null;
}
export const useRequestingAuthorities = () => {
    const [data, setData] = useState<RequestingAuthority[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fetchAuthorities = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await API.get('/api/settings/request/requesting-authorities');
            if (res.status === 200) {
                const authorities = Array.isArray(res.data) ? res.data : (res.data?.data || res.data || []);
                setData(authorities);
                if (authorities.length === 0) {
                    return;
                }
            }
        }
        catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'Failed to load authorities';
            setError(errorMessage);
        }
        finally {
            setIsLoading(false);
        }
    }, []);
    useEffect(() => {
        fetchAuthorities();
    }, [fetchAuthorities]);
    return { data, isLoading, error, refresh: fetchAuthorities };
};
