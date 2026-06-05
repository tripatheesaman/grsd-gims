'use client';

import { useCallback, useEffect, useState } from 'react';
import { API } from '@/lib/api';

export interface FiscalYearInfo {
    fiscalYear: string;
    autoManaged: boolean;
    startBs: string;
    endBs: string;
    startAd: string;
    endAd: string;
    availableFiscalYears: string[];
}

const defaultInfo: FiscalYearInfo = {
    fiscalYear: '',
    autoManaged: true,
    startBs: '',
    endBs: '',
    startAd: '',
    endAd: '',
    availableFiscalYears: [],
};

export function useFiscalYear() {
    const [info, setInfo] = useState<FiscalYearInfo>(defaultInfo);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await API.get<FiscalYearInfo>('/api/settings/fiscal-year');
            setInfo({
                fiscalYear: res.data.fiscalYear,
                autoManaged: res.data.autoManaged ?? true,
                startBs: res.data.startBs,
                endBs: res.data.endBs,
                startAd: res.data.startAd,
                endAd: res.data.endAd,
                availableFiscalYears: res.data.availableFiscalYears ?? [res.data.fiscalYear],
            });
        } catch {
            setError('Could not load fiscal year');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { ...info, loading, error, refresh };
}
