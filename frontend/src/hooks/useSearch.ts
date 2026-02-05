import { useState, useCallback, useEffect } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { API } from '@/lib/api';
import { SearchResult } from '@/types/search';
import { expandEquipmentNumbers } from '@/utils/equipmentNumbers';
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
    const [searchParams, setSearchParams] = useState<SearchParams>({
        universal: '',
        equipmentNumber: '',
        partNumber: '',
    });
    const [results, setResults] = useState<SearchResult[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const debouncedUniversal = useDebounce(searchParams.universal, 500);
    const debouncedEquipmentNumber = useDebounce(searchParams.equipmentNumber, 500);
    const debouncedPartNumber = useDebounce(searchParams.partNumber, 500);
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
    }, []);
    const fetchSearchResults = useCallback(async (page: number = 1) => {
        const currentParams = {
            universal: debouncedUniversal,
            equipmentNumber: debouncedEquipmentNumber,
            partNumber: debouncedPartNumber,
        };
        setIsLoading(true);
        setError(null);
        setCurrentPage(page);
        try {
            const response = await API.get('/api/search/stock', {
                params: {
                    ...currentParams,
                    page,
                    pageSize,
                },
            });
            const responseData = response.data as BackendResponse;
            if (responseData && responseData.data && responseData.pagination) {
                setResults(responseData.data);
                setTotalCount(responseData.pagination.totalCount);
                setTotalPages(responseData.pagination.totalPages);
                setCurrentPage(responseData.pagination.currentPage);
            }
            else if (Array.isArray(responseData)) {
                setResults(responseData);
                setTotalCount(responseData.length);
                setTotalPages(Math.ceil(responseData.length / pageSize));
            }
            else {
                setResults([]);
                setTotalCount(0);
                setTotalPages(0);
            }
        }
        catch {
            setError('Failed to perform search. Please try again.');
            setResults([]);
            setTotalCount(0);
            setTotalPages(0);
        }
        finally {
            setIsLoading(false);
        }
    }, [debouncedUniversal, debouncedEquipmentNumber, debouncedPartNumber, pageSize]);
    useEffect(() => {
        if (debouncedUniversal || debouncedEquipmentNumber || debouncedPartNumber) {
            fetchSearchResults(1);
        }
    }, [debouncedUniversal, debouncedEquipmentNumber, debouncedPartNumber, fetchSearchResults]);
    useEffect(() => {
        setIsLoading(true);
        setError(null);
        API.get('/api/search/stock', {
            params: {
                page: 1,
                pageSize,
            },
        }).then(response => {
            const responseData = response.data as BackendResponse;
            if (responseData && responseData.data && responseData.pagination) {
                setResults(responseData.data);
                setTotalCount(responseData.pagination.totalCount);
                setTotalPages(responseData.pagination.totalPages);
                setCurrentPage(responseData.pagination.currentPage);
            }
            else if (Array.isArray(responseData)) {
                setResults(responseData);
                setTotalCount(responseData.length);
                setTotalPages(Math.ceil(responseData.length / pageSize));
            }
            else {
                setResults([]);
                setTotalCount(0);
                setTotalPages(0);
            }
        }).catch(() => {
            setError('Failed to load initial data. Please try again.');
            setResults([]);
            setTotalCount(0);
            setTotalPages(0);
        }).finally(() => {
            setIsLoading(false);
        });
    }, [pageSize]);
    const handlePageChange = useCallback((page: number) => {
        setCurrentPage(page);
        const currentParams = {
            universal: debouncedUniversal,
            equipmentNumber: debouncedEquipmentNumber,
            partNumber: debouncedPartNumber,
        };
        setIsLoading(true);
        setError(null);
        API.get('/api/search/stock', {
            params: {
                ...currentParams,
                page,
                pageSize,
            },
        }).then(response => {
            const responseData = response.data as BackendResponse;
            if (responseData && responseData.data && responseData.pagination) {
                setResults(responseData.data);
                setTotalCount(responseData.pagination.totalCount);
                setTotalPages(responseData.pagination.totalPages);
                setCurrentPage(responseData.pagination.currentPage);
            }
            else if (Array.isArray(responseData)) {
                setResults(responseData);
                setTotalCount(responseData.length);
                setTotalPages(Math.ceil(responseData.length / pageSize));
            }
            else {
                setResults([]);
                setTotalCount(0);
                setTotalPages(0);
            }
        }).catch(() => {
            setError('Failed to perform search. Please try again.');
            setResults([]);
            setTotalCount(0);
            setTotalPages(0);
        }).finally(() => {
            setIsLoading(false);
        });
    }, [debouncedUniversal, debouncedEquipmentNumber, debouncedPartNumber, pageSize]);
    const handlePageSizeChange = useCallback((newPageSize: number) => {
        setPageSize(newPageSize);
        setCurrentPage(1);
        fetchSearchResults(1);
    }, [fetchSearchResults]);
    return {
        searchParams,
        results,
        isLoading,
        error,
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
