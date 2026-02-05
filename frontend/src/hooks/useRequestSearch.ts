'use client';
import { useState, useEffect, useCallback } from 'react';
import { RequestSearchResult } from '@/types/request';
import { API } from '@/lib/api';
import { useDebounce } from './useDebounce';
interface RequestSearchParams {
    universal: string;
    equipmentNumber: string;
    partNumber: string;
}
export function useRequestSearch() {
    const [results, setResults] = useState<RequestSearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [searchParams, setSearchParams] = useState<RequestSearchParams>({
        universal: '',
        equipmentNumber: '',
        partNumber: '',
    });
    const debouncedUniversal = useDebounce(searchParams.universal, 500);
    const debouncedEquipmentNumber = useDebounce(searchParams.equipmentNumber, 500);
    const debouncedPartNumber = useDebounce(searchParams.partNumber, 500);
    const fetchSearchResults = useCallback(async (page: number = 1) => {
        const currentParams = {
            universal: debouncedUniversal,
            equipmentNumber: debouncedEquipmentNumber,
            partNumber: debouncedPartNumber,
        };
        if (currentParams.universal === '' &&
            currentParams.equipmentNumber === '' &&
            currentParams.partNumber === '') {
            setResults([]);
            setTotalCount(0);
            setTotalPages(0);
            setCurrentPage(1);
            return;
        }
        setIsLoading(true);
        setError(null);
        setCurrentPage(page);
        try {
            const apiParams: {
                universal?: string;
                equipmentNumber?: string;
                partNumber?: string;
            } = {};
            if (currentParams.universal) {
                apiParams.universal = currentParams.universal;
            }
            if (currentParams.equipmentNumber) {
                apiParams.equipmentNumber = currentParams.equipmentNumber;
            }
            if (currentParams.partNumber) {
                apiParams.partNumber = currentParams.partNumber;
            }
            const response = await API.get('/api/request/search', {
                params: { ...apiParams, page, pageSize }
            });
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
    const fetchAllRequests = useCallback(async (page: number = 1) => {
        setIsLoading(true);
        setError(null);
        setCurrentPage(page);
        try {
            const response = await API.get('/api/request/search', {
                params: { page, pageSize }
            });
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
            setError('An error occurred while fetching requests');
            setResults([]);
        }
        finally {
            setIsLoading(false);
        }
    }, [pageSize]);
    useEffect(() => {
        if (debouncedUniversal || debouncedEquipmentNumber || debouncedPartNumber) {
            fetchSearchResults(1);
        }
        else {
            fetchAllRequests(1);
        }
    }, [debouncedUniversal, debouncedEquipmentNumber, debouncedPartNumber, fetchSearchResults, fetchAllRequests]);
    useEffect(() => {
        fetchAllRequests(1);
    }, [fetchAllRequests]);
    const handleSearch = useCallback((type: keyof RequestSearchParams) => (value: string) => {
        setSearchParams(prev => ({ ...prev, [type]: value }));
    }, []);
    const handlePageChange = useCallback((page: number) => {
        setCurrentPage(page);
        if (debouncedUniversal || debouncedEquipmentNumber || debouncedPartNumber) {
            fetchSearchResults(page);
        }
        else {
            fetchAllRequests(page);
        }
    }, [debouncedUniversal, debouncedEquipmentNumber, debouncedPartNumber, fetchSearchResults, fetchAllRequests]);
    const handlePageSizeChange = useCallback((newPageSize: number) => {
        setPageSize(newPageSize);
        setCurrentPage(1);
        if (debouncedUniversal || debouncedEquipmentNumber || debouncedPartNumber) {
            fetchSearchResults(1);
        }
        else {
            fetchAllRequests(1);
        }
    }, [debouncedUniversal, debouncedEquipmentNumber, debouncedPartNumber, fetchSearchResults, fetchAllRequests]);
    return {
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
    };
}
