import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from './useDebounce';
import { API } from '@/lib/api';
import { RRPSearchResult, RRPSearchParams } from '../types/rrp';
export function useRRPSearch() {
    const [results, setResults] = useState<RRPSearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [searchParams, setSearchParams] = useState<RRPSearchParams>({
        universal: '',
        equipmentNumber: '',
        partNumber: ''
    });
    const debouncedUniversal = useDebounce(searchParams.universal, 500);
    const debouncedEquipmentNumber = useDebounce(searchParams.equipmentNumber, 500);
    const debouncedPartNumber = useDebounce(searchParams.partNumber, 500);
    const fetchResults = useCallback(async (page: number = 1) => {
        setIsLoading(true);
        setError(null);
        setCurrentPage(page);
        try {
            const params = {
                page,
                pageSize,
                universal: debouncedUniversal,
                equipmentNumber: debouncedEquipmentNumber,
                partNumber: debouncedPartNumber
            };
            const response = await API.get('/api/rrp/search', { params });
            if (response.status === 200) {
                if (response.data && response.data.data && response.data.pagination) {
                    setResults(response.data.data);
                    setTotalCount(response.data.pagination.totalCount);
                    setTotalPages(response.data.pagination.totalPages);
                    setCurrentPage(response.data.pagination.currentPage);
                }
                else {
                    setResults(response.data);
                    setTotalCount(response.data.length);
                    setTotalPages(Math.ceil(response.data.length / pageSize));
                }
            }
            else {
                setError('Failed to fetch results');
                setResults([]);
            }
        }
        catch {
            setError('An error occurred while searching');
            setResults([]);
        }
        finally {
            setIsLoading(false);
        }
    }, [debouncedUniversal, debouncedEquipmentNumber, debouncedPartNumber, pageSize]);
    useEffect(() => {
        fetchResults(1);
    }, [fetchResults]);
    const handleSearch = useCallback((type: keyof RRPSearchParams) => (value: string) => {
        setSearchParams(prev => ({ ...prev, [type]: value }));
    }, []);
    const handlePageChange = useCallback((page: number) => {
        fetchResults(page);
    }, [fetchResults]);
    const handlePageSizeChange = useCallback((newPageSize: number) => {
        setPageSize(newPageSize);
        setCurrentPage(1);
        fetchResults(1);
    }, [fetchResults]);
    return {
        results,
        isLoading,
        error,
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
