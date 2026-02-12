import { useState, useCallback, useMemo, SetStateAction } from 'react';
import { useDebounce } from './useDebounce';
import { useApiQuery } from '@/hooks/api/useApiQuery';
import { queryKeys } from '@/lib/queryKeys';
import { RRPSearchResult, RRPSearchParams } from '../types/rrp';
import { useQueryClient } from '@tanstack/react-query';
import { getErrorMessage } from '@/lib/errorHandling';

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
    const queryClient = useQueryClient();
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
    const queryParams = useMemo(() => ({
        page: currentPage,
        pageSize,
        universal: debouncedUniversal || undefined,
        equipmentNumber: debouncedEquipmentNumber || undefined,
        partNumber: debouncedPartNumber || undefined,
    }), [currentPage, pageSize, debouncedUniversal, debouncedEquipmentNumber, debouncedPartNumber]);
    const queryKey = useMemo(() => queryKeys.rrp.search(queryParams), [queryParams]);
    
    const { data: response, isLoading, error } = useApiQuery<BackendResponse>(
        queryKey,
        '/api/rrp/search',
        queryParams,
        {
            staleTime: 1000 * 30,
        }
    );
    
    const responseData = response?.data;
    const results = useMemo(
        () => responseData?.data || (Array.isArray(responseData) ? responseData : []),
        [responseData]
    );
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

    const setResults = useCallback((nextResults: SetStateAction<RRPSearchResult[] | null>) => {
        const currentResults = results ?? null;
        const resolvedResults = typeof nextResults === 'function'
            ? (nextResults as (prev: RRPSearchResult[] | null) => RRPSearchResult[] | null)(currentResults)
            : nextResults;

        if (response) {
            queryClient.setQueryData(queryKey, {
                ...response,
                data: {
                    data: resolvedResults || [],
                    pagination: {
                        currentPage,
                        pageSize,
                        totalCount: resolvedResults?.length || 0,
                        totalPages: Math.ceil((resolvedResults?.length || 0) / pageSize),
                    },
                },
            });
        }
    }, [response, results, queryClient, queryKey, currentPage, pageSize]);
    
    return {
        results,
        isLoading,
        error: error ? getErrorMessage(error, 'An error occurred while searching') : null,
        currentPage,
        pageSize,
        totalCount,
        totalPages,
        searchParams,
        handleSearch,
        handlePageChange,
        handlePageSizeChange,
        setResults,
    };
}
