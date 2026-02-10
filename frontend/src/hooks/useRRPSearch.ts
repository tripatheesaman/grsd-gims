import { useState, useCallback } from 'react';
import { useDebounce } from './useDebounce';
import { useApiQuery } from '@/hooks/api/useApiQuery';
import { queryKeys } from '@/lib/queryKeys';
import { RRPSearchResult, RRPSearchParams } from '../types/rrp';

interface BackendResponse {
    data: RRPSearchResult[];
    pagination: {
        currentPage: number;
        pageSize: number;
        totalCount: number;
        totalPages: number;
    };
}

export function useRRPSearch() {
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchParams, setSearchParams] = useState<RRPSearchParams>({
        universal: '',
        equipmentNumber: '',
        partNumber: ''
    });
    
    const debouncedUniversal = useDebounce(searchParams.universal, 500);
    const debouncedEquipmentNumber = useDebounce(searchParams.equipmentNumber, 500);
    const debouncedPartNumber = useDebounce(searchParams.partNumber, 500);
    
    const { data: response, isLoading, error } = useApiQuery<BackendResponse>(
        queryKeys.rrp.all,
        '/api/rrp/search',
        {
            page: currentPage,
                pageSize,
            universal: debouncedUniversal || undefined,
            equipmentNumber: debouncedEquipmentNumber || undefined,
            partNumber: debouncedPartNumber || undefined,
        },
        {
            staleTime: 1000 * 30,
        }
    );
    
    const responseData = response?.data;
    const results = responseData?.data || (Array.isArray(responseData) ? responseData : []);
    const pagination = responseData?.pagination;
    const totalCount = pagination?.totalCount || (Array.isArray(responseData) ? responseData.length : 0);
    const totalPages = pagination?.totalPages || (Array.isArray(responseData) ? Math.ceil((responseData?.length || 0) / pageSize) : 0);
    
    const handleSearch = useCallback((type: keyof RRPSearchParams) => (value: string) => {
        setSearchParams(prev => ({ ...prev, [type]: value }));
        setCurrentPage(1);
    }, []);
    
    const handlePageChange = useCallback((page: number) => {
        setCurrentPage(page);
    }, []);
    
    const handlePageSizeChange = useCallback((newPageSize: number) => {
        setPageSize(newPageSize);
        setCurrentPage(1);
    }, []);
    
    return {
        results,
        isLoading,
        error: error ? 'An error occurred while searching' : null,
        currentPage,
        pageSize,
        totalCount,
        totalPages,
        searchParams,
        handleSearch,
        handlePageChange,
        handlePageSizeChange,
        setResults: () => {},
    };
}
