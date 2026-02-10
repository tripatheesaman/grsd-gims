import { useCallback } from 'react';
import { useApiQuery } from '@/hooks/api/useApiQuery';
import { queryKeys } from '@/lib/queryKeys';
import { useQueryClient } from '@tanstack/react-query';

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
    const queryClient = useQueryClient();
    const { data: response, isLoading } = useApiQuery<RRPConfig>(
        queryKeys.rrp.config(),
        '/api/rrp/config',
        undefined,
        {
            staleTime: 1000 * 60 * 10,
        }
    );
    
    const config = response?.data || null;
    
    const refreshConfig = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.rrp.config() });
    }, [queryClient]);
    
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
