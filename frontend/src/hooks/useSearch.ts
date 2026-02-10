import { useState, useCallback, useEffect, SetStateAction } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { useSearchQuery } from '@/hooks/api/useSearch';
import { SearchResult } from '@/types/search';
import { expandEquipmentNumbers } from '@/utils/equipmentNumbers';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { getErrorMessage } from '@/lib/errorHandling';

interface SearchParams {
    universal: string;
    equipmentNumber: string;
    partNumber: string;
}

interface BackendResponse {
    data: SearchResult[];
    pagination: {
        currentPage: number;
        pageSize: number;
        totalCount: number;
        totalPages: number;
    };
}

export const useSearch = () => {
    const queryClient = useQueryClient();
    const [searchParams, setSearchParams] = useState<SearchParams>({
        universal: '',
        equipmentNumber: '',
        partNumber: '',
    });
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    
    const debouncedUniversal = useDebounce(searchParams.universal, 500);
    const debouncedEquipmentNumber = useDebounce(searchParams.equipmentNumber, 500);
    const debouncedPartNumber = useDebounce(searchParams.partNumber, 500);
    
    const { data: response, isLoading, error } = useSearchQuery(
        {
            universal: debouncedUniversal || undefined,
            equipmentNumber: debouncedEquipmentNumber || undefined,
            partNumber: debouncedPartNumber || undefined,
            page: currentPage,
            pageSize,
        },
        true
    );

    const responseData = response?.data as BackendResponse | undefined;
    const results = responseData?.data || (Array.isArray(responseData) ? responseData : null);
    const pagination = responseData?.pagination;
    const totalCount = pagination?.totalCount || (Array.isArray(responseData) ? responseData.length : 0);
    const totalPages = pagination?.totalPages || (Array.isArray(responseData) ? Math.ceil((responseData?.length || 0) / pageSize) : 0);
    
    useEffect(() => {
        if (pagination?.currentPage && pagination.currentPage !== currentPage) {
            setCurrentPage(pagination.currentPage);
        }
    }, [pagination?.currentPage, currentPage]);

    const handleSearch = useCallback((type: keyof SearchParams) => (value: string) => {
        if (type === 'equipmentNumber') {
            const expandedEquipmentNumbers = value
                ? Array.from(expandEquipmentNumbers(value)).join(',')
                : '';
            setSearchParams(prev => ({ ...prev, [type]: expandedEquipmentNumbers }));
        }
        else {
            setSearchParams(prev => ({ ...prev, [type]: value }));
        }
        setCurrentPage(1);
    }, []);

    const handlePageChange = useCallback((page: number) => {
        setCurrentPage(page);
    }, []);

    const handlePageSizeChange = useCallback((newPageSize: number) => {
        setPageSize(newPageSize);
        setCurrentPage(1);
    }, []);

    const setResults = useCallback((nextResults: SetStateAction<SearchResult[] | null>) => {
        const queryKey = queryKeys.search.stock({
            universal: debouncedUniversal || undefined,
            equipmentNumber: debouncedEquipmentNumber || undefined,
            partNumber: debouncedPartNumber || undefined,
            page: currentPage,
            pageSize,
        });

        const currentResults = results;
        const resolvedResults = typeof nextResults === 'function'
            ? (nextResults as (prev: SearchResult[] | null) => SearchResult[] | null)(currentResults)
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
    }, [response, results, queryClient, debouncedUniversal, debouncedEquipmentNumber, debouncedPartNumber, currentPage, pageSize]);

    return {
        searchParams,
        results,
        isLoading,
        error: error ? getErrorMessage(error, 'Failed to perform search. Please try again.') : null,
        currentPage,
        pageSize,
        totalCount,
        totalPages,
        handleSearch,
        handlePageChange,
        handlePageSizeChange,
        setResults,
        setSearchParams,
    };
};
