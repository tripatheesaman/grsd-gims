import { useState, useEffect, useRef, useCallback } from 'react';
import { API } from '@/lib/api';
interface InspectionUser {
    name: string;
    designation: string;
    staff_id?: string | null;
    section_name?: string | null;
    email?: string | null;
}
interface RRPConfig {
    supplier_list_local: string[] | string;
    supplier_list_foreign: string[] | string;
    currency_list: string[] | string;
    inspection_user_details: InspectionUser[];
    requesting_and_receiving_authority?: InspectionUser[];
    vat_rate: number;
    customServiceCharge: number;
}
export function useRRP() {
    const [config, setConfig] = useState<RRPConfig | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const configLoadedRef = useRef(false);
    const fetchConfig = useCallback(async () => {
        if (!configLoadedRef.current) {
            try {
                const response = await API.get('/api/rrp/config');
                setConfig(response.data);
                configLoadedRef.current = true;
            }
            catch {
            }
            finally {
                setIsLoading(false);
            }
        }
    }, []);
    const refreshConfig = async () => {
        configLoadedRef.current = false;
        setIsLoading(true);
        await fetchConfig();
    };
    useEffect(() => {
        fetchConfig();
    }, [fetchConfig]);
    const normalizeList = (value?: string[] | string) => {
        if (!value)
            return [];
        if (Array.isArray(value))
            return value;
        return value.split(',').map((entry) => entry.trim()).filter(Boolean);
    };
    const getLocalSuppliers = () => normalizeList(config?.supplier_list_local);
    const getForeignSuppliers = () => normalizeList(config?.supplier_list_foreign);
    const getCurrencies = () => normalizeList(config?.currency_list);
    const getInspectionUsers = () => config?.requesting_and_receiving_authority || config?.inspection_user_details || [];
    return {
        config,
        isLoading,
        refreshConfig,
        getLocalSuppliers,
        getForeignSuppliers,
        getCurrencies,
        getInspectionUsers,
    };
}
