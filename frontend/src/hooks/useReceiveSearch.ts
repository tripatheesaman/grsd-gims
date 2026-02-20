import { useState, useCallback, useEffect } from 'react';
import { useDebounce } from './useDebounce';
import { API } from '@/lib/api';
import { ReceiveSearchResult } from '@/types/search';
interface SearchParams {
    universal: string;
    equipmentNumber: string;
    partNumber: string;
}
export function useReceiveSearch() {
    const [results, setResults] = useState<ReceiveSearchResult[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [searchParams, setSearchParams] = useState<SearchParams>({
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
        setIsLoading(true);
        setError(null);
        setCurrentPage(page);
        try {
            const apiParams: {
                universal?: string;
                equipmentNumber?: string;
                partNumber?: string;
            } = {};
            if (currentParams.universal && currentParams.universal.trim() !== '') {
                apiParams.universal = currentParams.universal;
            }
            if (currentParams.equipmentNumber && currentParams.equipmentNumber.trim() !== '') {
                apiParams.equipmentNumber = currentParams.equipmentNumber;
            }
            if (currentParams.partNumber && currentParams.partNumber.trim() !== '') {
                apiParams.partNumber = currentParams.partNumber;
            }
            const response = await API.get('/api/receive/search/receivables', {
                params: { ...apiParams, page, pageSize }
            });
            if (response.status === 200) {
                if (response.data && response.data.data && response.data.pagination) {
                    const transformedResults = response.data.data.flatMap((request: {
                        items: ReceiveSearchResult[];
                        requestNumber: string;
                        requestDate: string;
                        requestedBy: string;
                        approvalStatus: string;
                    }) => request.items.map((item: ReceiveSearchResult) => ({
                        ...item,
                        requestNumber: request.requestNumber,
                        requestDate: request.requestDate,
                        requestedBy: request.requestedBy,
                        approvalStatus: request.approvalStatus
                    })));
                    setResults(transformedResults);
                    setTotalCount(response.data.pagination.totalCount);
                    setTotalPages(response.data.pagination.totalPages);
                    setCurrentPage(response.data.pagination.currentPage);
                }
                else {
                    const transformedResults = response.data.flatMap((request: {
                        items: ReceiveSearchResult[];
                        requestNumber: string;
                        requestDate: string;
                        requestedBy: string;
                        approvalStatus: string;
                    }) => request.items.map((item: ReceiveSearchResult) => ({
                        ...item,
                        requestNumber: request.requestNumber,
                        requestDate: request.requestDate,
                        requestedBy: request.requestedBy,
                        approvalStatus: request.approvalStatus
                    })));
                    setResults(transformedResults);
                    setTotalCount(transformedResults.length);
                    setTotalPages(Math.ceil(transformedResults.length / pageSize));
                }
            }
            else {
                setError('Failed to fetch results');
                setResults(null);
            }
        }
        catch {
            setError('An error occurred while searching');
            setResults(null);
        }
        finally {
            setIsLoading(false);
        }
    }, [debouncedUniversal, debouncedEquipmentNumber, debouncedPartNumber, pageSize]);
    useEffect(() => {
        const loadInitialData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const response = await API.get('/api/receive/search/receivables', {
                    params: { page: 1, pageSize }
                });
                if (response.status === 200) {
                    if (response.data && response.data.data && response.data.pagination) {
                        const transformedResults = response.data.data.flatMap((request: {
                            items: ReceiveSearchResult[];
                            requestNumber: string;
                            requestDate: string;
                            requestedBy: string;
                            approvalStatus: string;
                        }) => request.items.map((item: ReceiveSearchResult) => ({
                            ...item,
                            requestNumber: request.requestNumber,
                            requestDate: request.requestDate,
                            requestedBy: request.requestedBy,
                            approvalStatus: request.approvalStatus
                        })));
                        setResults(transformedResults);
                        setTotalCount(response.data.pagination.totalCount);
                        setTotalPages(response.data.pagination.totalPages);
                        setCurrentPage(response.data.pagination.currentPage);
                    }
                    else {
                        const transformedResults = response.data.flatMap((request: {
                            items: ReceiveSearchResult[];
                            requestNumber: string;
                            requestDate: string;
                            requestedBy: string;
                            approvalStatus: string;
                        }) => request.items.map((item: ReceiveSearchResult) => ({
                            ...item,
                            requestNumber: request.requestNumber,
                            requestDate: request.requestDate,
                            requestedBy: request.requestedBy,
                            approvalStatus: request.approvalStatus
                        })));
                        setResults(transformedResults);
                        setTotalCount(transformedResults.length);
                        setTotalPages(Math.ceil(transformedResults.length / pageSize));
                    }
                }
                else {
                    setError('Failed to fetch initial data');
                    setResults(null);
                }
            }
            catch (error: unknown) {
                if (error && typeof error === 'object' && 'response' in error && error.response && typeof error.response === 'object' && 'status' in error.response && error.response.status === 401) {
                    setError('Unauthorized: Please log in again');
                }
                else {
                    setError('An error occurred while loading initial data');
                }
                setResults(null);
            }
            finally {
                setIsLoading(false);
            }
        };
        loadInitialData();
    }, [pageSize]);
    useEffect(() => {
        if (debouncedUniversal || debouncedEquipmentNumber || debouncedPartNumber) {
            fetchSearchResults(1);
        }
        else {
            const loadAllPendingItems = async () => {
                setIsLoading(true);
                setError(null);
                try {
                    const response = await API.get('/api/receive/search/receivables', {
                        params: { page: 1, pageSize }
                    });
                    if (response.status === 200) {
                        if (response.data && response.data.data && response.data.pagination) {
                            const transformedResults = response.data.data.flatMap((request: {
                                items: ReceiveSearchResult[];
                                requestNumber: string;
                                requestDate: string;
                                requestedBy: string;
                                approvalStatus: string;
                            }) => request.items.map((item: ReceiveSearchResult) => ({
                                ...item,
                                requestNumber: request.requestNumber,
                                requestDate: request.requestDate,
                                requestedBy: request.requestedBy,
                                approvalStatus: request.approvalStatus
                            })));
                            setResults(transformedResults);
                            setTotalCount(response.data.pagination.totalCount);
                            setTotalPages(response.data.pagination.totalPages);
                            setCurrentPage(response.data.pagination.currentPage);
                        }
                        else {
                            const transformedResults = response.data.flatMap((request: {
                                items: ReceiveSearchResult[];
                                requestNumber: string;
                                requestDate: string;
                                requestedBy: string;
                                approvalStatus: string;
                            }) => request.items.map((item: ReceiveSearchResult) => ({
                                ...item,
                                requestNumber: request.requestNumber,
                                requestDate: request.requestDate,
                                requestedBy: request.requestedBy,
                                approvalStatus: request.approvalStatus
                            })));
                            setResults(transformedResults);
                            setTotalCount(transformedResults.length);
                            setTotalPages(Math.ceil(transformedResults.length / pageSize));
                        }
                    }
                    else {
                        setError('Failed to fetch pending items');
                        setResults(null);
                    }
                }
                catch {
                    setError('An error occurred while fetching pending items');
                    setResults(null);
                }
                finally {
                    setIsLoading(false);
                }
            };
            loadAllPendingItems();
        }
    }, [debouncedUniversal, debouncedEquipmentNumber, debouncedPartNumber, fetchSearchResults, pageSize]);
    const handleSearch = useCallback((type: keyof SearchParams) => (value: string) => {
        setSearchParams(prev => ({ ...prev, [type]: value }));
    }, []);
    const handlePageChange = useCallback((page: number) => {
        setCurrentPage(page);
        if (debouncedUniversal || debouncedEquipmentNumber || debouncedPartNumber) {
            fetchSearchResults(page);
        }
        else {
            const loadAllPendingItems = async () => {
                setIsLoading(true);
                setError(null);
                try {
                    const response = await API.get('/api/receive/search/receivables', {
                        params: { page, pageSize }
                    });
                    if (response.status === 200) {
                        if (response.data && response.data.data && response.data.pagination) {
                            const transformedResults = response.data.data.flatMap((request: {
                                items: ReceiveSearchResult[];
                                requestNumber: string;
                                requestDate: string;
                                requestedBy: string;
                                approvalStatus: string;
                            }) => request.items.map((item: ReceiveSearchResult) => ({
                                ...item,
                                requestNumber: request.requestNumber,
                                requestDate: request.requestDate,
                                requestedBy: request.requestedBy,
                                approvalStatus: request.approvalStatus
                            })));
                            setResults(transformedResults);
                            setTotalCount(response.data.pagination.totalCount);
                            setTotalPages(response.data.pagination.totalPages);
                            setCurrentPage(response.data.pagination.currentPage);
                        }
                    }
                    else {
                        setError('Failed to fetch pending items');
                        setResults(null);
                    }
                }
                catch {
                    setError('An error occurred while fetching pending items');
                    setResults(null);
                }
                finally {
                    setIsLoading(false);
                }
            };
            loadAllPendingItems();
        }
    }, [debouncedUniversal, debouncedEquipmentNumber, debouncedPartNumber, fetchSearchResults, pageSize]);
    const handlePageSizeChange = useCallback((newPageSize: number) => {
        setPageSize(newPageSize);
        setCurrentPage(1);
        if (debouncedUniversal || debouncedEquipmentNumber || debouncedPartNumber) {
            fetchSearchResults(1);
        }
        else {
            const loadInitialData = async () => {
                setIsLoading(true);
                setError(null);
                try {
                    const response = await API.get('/api/receive/search/receivables', {
                        params: { page: 1, pageSize: newPageSize }
                    });
                    if (response.status === 200) {
                        if (response.data && response.data.data && response.data.pagination) {
                            const transformedResults = response.data.data.flatMap((request: {
                                items: ReceiveSearchResult[];
                                requestNumber: string;
                                requestDate: string;
                                requestedBy: string;
                                approvalStatus: string;
                            }) => request.items.map((item: ReceiveSearchResult) => ({
                                ...item,
                                requestNumber: request.requestNumber,
                                requestDate: request.requestDate,
                                requestedBy: request.requestedBy,
                                approvalStatus: request.approvalStatus
                            })));
                            setResults(transformedResults);
                            setTotalCount(response.data.pagination.totalCount);
                            setTotalPages(response.data.pagination.totalPages);
                            setCurrentPage(response.data.pagination.currentPage);
                        }
                    }
                    else {
                        setError('Failed to fetch initial data');
                        setResults(null);
                    }
                }
                catch {
                    setError('An error occurred while loading initial data');
                    setResults(null);
                }
                finally {
                    setIsLoading(false);
                }
            };
            loadInitialData();
        }
    }, [debouncedUniversal, debouncedEquipmentNumber, debouncedPartNumber, fetchSearchResults]);
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
