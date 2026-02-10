'use client';
import { useState, useEffect, Suspense, lazy, useCallback } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { SearchControls } from '@/components/search';
import { useSearch } from '@/hooks/useSearch';
import { RequestCartItem } from '@/types/request';
import { useAuthContext } from '@/context/AuthContext';
import { useCustomToast } from "@/components/ui/custom-toast";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { API } from '@/lib/api';
import { withBasePath } from '@/lib/urls';
import { SearchResult } from '@/types/search';
import { usePrediction } from '@/hooks/usePrediction';
import { PredictionSummaryCard } from '@/components/prediction/PredictionSummaryCard';
import { Spinner } from '@/components/ui/spinner';
const SearchResults = lazy(() => import('@/components/search/SearchResults').then(module => ({ default: module.SearchResults })));
const RequestCart = lazy(() => import('@/components/request/RequestCart').then(module => ({ default: module.RequestCart })));
const RequestItemForm = lazy(() => import('@/components/request/RequestItemForm').then(module => ({ default: module.RequestItemForm })));
const RequestPreviewModal = lazy(() => import('@/components/request/RequestPreviewModal').then(module => ({ default: module.RequestPreviewModal })));
const SearchResultsSkeleton = () => (<div className="animate-pulse space-y-4">
    <div className="h-8 bg-gray-200 rounded w-1/4"></div>
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (<div key={i} className="h-16 bg-gray-200 rounded"></div>))}
    </div>
  </div>);
const RequestCartSkeleton = () => (<div className="animate-pulse space-y-4">
    <div className="h-8 bg-gray-200 rounded w-1/2"></div>
    <div className="space-y-3">
      {[1, 2].map((i) => (<div key={i} className="h-24 bg-gray-200 rounded"></div>))}
    </div>
  </div>);
export default function RequestPage() {
    const { user, permissions } = useAuthContext();
    const canViewFullDetails = permissions.includes('can_view_full_item_details_in_search');
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const [date, setDate] = useState<Date | undefined>(() => new Date());
    const [requestNumber, setRequestNumber] = useState<string>('');
    const [isRequestNumberEditable, setIsRequestNumberEditable] = useState<boolean>(false);
    const [selectedItem, setSelectedItem] = useState<SearchResult | null>(null);
    const [selectedSearchResult, setSelectedSearchResult] = useState<SearchResult | null>(null);
    const [isItemFormOpen, setIsItemFormOpen] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isManualEntry, setIsManualEntry] = useState(false);
    const [cart, setCart] = useState<RequestCartItem[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [remarks, setRemarks] = useState<string>('');
    const [isLoadingLastRequest, setIsLoadingLastRequest] = useState(true);
    const [dateError, setDateError] = useState<string>('');
    const [requestNumberError, setRequestNumberError] = useState<string>('');
    const { results, isLoading, error, handleSearch, setResults, } = useSearch();
    const [lastRequestCache, setLastRequestCache] = useState<{
        requestNumber: string;
        requestDate: string;
        timestamp: number;
    } | null>(null);
    const activeNacCode = selectedSearchResult?.nacCode || (cart.length === 1 ? cart[0].nacCode : undefined);
    const { prediction, isLoading: isPredictionLoading, error: predictionError, refresh: refreshPrediction } = usePrediction(activeNacCode);
    const setDateWithDefault = useCallback((value?: string | Date | null) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let candidate: Date | undefined;
        if (value instanceof Date) {
            candidate = new Date(value);
        }
        else if (typeof value === 'string' && value.trim() !== '') {
            const parsed = new Date(value);
            candidate = Number.isNaN(parsed.getTime()) ? undefined : parsed;
        }
        if (!candidate) {
            candidate = new Date();
        }
        const candidateStart = new Date(candidate);
        candidateStart.setHours(0, 0, 0, 0);
        let minAllowedTime = today.getTime();
        if (lastRequestCache?.requestDate) {
            const previous = new Date(lastRequestCache.requestDate);
            if (!Number.isNaN(previous.getTime())) {
                previous.setHours(0, 0, 0, 0);
                minAllowedTime = Math.max(minAllowedTime, previous.getTime());
            }
        }
        if (candidateStart.getTime() < minAllowedTime) {
            candidate = new Date(minAllowedTime);
        }
        setDate(candidate);
    }, [lastRequestCache]);
    const fetchLastRequestInfo = useCallback(async () => {
        if (lastRequestCache && Date.now() - lastRequestCache.timestamp < 5 * 60 * 1000) {
            if (lastRequestCache.requestDate) {
                setDateWithDefault(lastRequestCache.requestDate);
            }
            else {
                setDateWithDefault();
            }
            setIsLoadingLastRequest(false);
            return;
        }
        try {
            try {
                const nextResp = await API.get('/api/request/next-request-number');
                if (nextResp.status === 200 && nextResp.data?.requestNumber) {
                    setRequestNumber(nextResp.data.requestNumber || '');
                    setIsRequestNumberEditable(false);
                }
            }
            catch {
            }
            const response = await API.get('/api/request/getlastrequestinfo');
            if (response.status === 200 && response.data) {
                const { requestDate } = response.data;
                setDateWithDefault(requestDate);
                setLastRequestCache({
                    requestNumber: requestNumber || '',
                    requestDate: requestDate || '',
                    timestamp: Date.now()
                });
            }
        }
        catch (error: unknown) {
            if (error && typeof error === 'object' && 'response' in error && error.response && typeof error.response === 'object' && 'status' in error.response && error.response.status === 404) {
                setRequestNumber('');
                setDate(undefined);
                setLastRequestCache({
                    requestNumber: '',
                    requestDate: '',
                    timestamp: Date.now()
                });
            }
            else {
            }
        }
        finally {
            setIsLoadingLastRequest(false);
        }
    }, [setDateWithDefault, lastRequestCache, requestNumber]);
    useEffect(() => {
        if (permissions && Array.isArray(permissions)) {
            setIsRequestNumberEditable(permissions.includes('can_create_new_request_number'));
        }
    }, [permissions]);
    const validateDate = useCallback((selectedDate: Date | undefined) => {
        if (!selectedDate) {
            setDateError('');
            return true;
        }
        if (lastRequestCache && lastRequestCache.requestDate) {
            const previousRequestDate = new Date(lastRequestCache.requestDate);
            if (selectedDate < previousRequestDate) {
                setDateError(`Date cannot be before ${previousRequestDate.toLocaleDateString()}`);
                return false;
            }
        }
        setDateError('');
        return true;
    }, [lastRequestCache]);
    const handleDateChange = (newDate: Date | null) => {
        setDate(newDate ?? undefined);
        validateDate(newDate ?? undefined);
    };
    const checkDuplicateRequestNumber = async (requestNumber: string): Promise<boolean> => {
        if (!requestNumber.trim())
            return false;
        try {
            const response = await API.get('/api/request/search', {
                params: { universal: requestNumber }
            });
            if (response.status === 200 && response.data) {
                return response.data.some((request: {
                    requestNumber: string;
                    approvalStatus: string;
                }) => request.requestNumber === requestNumber &&
                    request.approvalStatus !== 'REJECTED');
            }
            return false;
        }
        catch {
            return false;
        }
    };
    const validateRequestNumber = async (value: string) => {
        if (!value.trim()) {
            setRequestNumberError('');
            return true;
        }
        const isDuplicate = await checkDuplicateRequestNumber(value);
        if (isDuplicate) {
            setRequestNumberError('This request number has already been used. Please use a different request number.');
            return false;
        }
        setRequestNumberError('');
        return true;
    };
    const handleRequestNumberChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setRequestNumber(value);
        if (requestNumberError) {
            setRequestNumberError('');
        }
        if (value.trim()) {
            setTimeout(() => validateRequestNumber(value), 500);
        }
    };
    useEffect(() => {
        fetchLastRequestInfo();
    }, [fetchLastRequestInfo]);
    const handleRowSelect = (item: SearchResult) => {
        setSelectedSearchResult(item);
    };
    const handleRowDoubleClick = (item: SearchResult) => {
        setSelectedSearchResult(item);
        setSelectedItem(item);
        setIsManualEntry(false);
        setIsItemFormOpen(true);
    };
    const handleManualEntry = () => {
        setSelectedItem(null);
        setSelectedSearchResult(null);
        setIsManualEntry(true);
        setIsItemFormOpen(true);
    };
    const handleAddToCart = async (item: RequestCartItem) => {
        if (cart.length >= 3) {
            showErrorToast({
                title: 'Error',
                message: "Maximum of 3 items can be requested at once.",
                duration: 3000,
            });
            return;
        }
        if (item.nacCode && item.nacCode !== 'N/A') {
            try {
                const response = await API.get('/api/request/duplicate', {
                    params: { nacCode: item.nacCode }
                });
                if (response.status === 200 && response.data.isDuplicate) {
                    showErrorToast({
                        title: 'Error',
                        message: "This item is already requested and pending receive. Please wait for the current request to be processed.",
                        duration: 5000,
                    });
                    return;
                }
            }
            catch {
                showErrorToast({
                    title: 'Error',
                    message: "Failed to check for duplicate requests. Please try again.",
                    duration: 3000,
                });
                return;
            }
        }
        const cartItem: RequestCartItem = {
            ...item,
            id: `${item.id}-${Date.now()}`
        };
        setResults((prevResults: SearchResult[] | null) => prevResults?.map(result => result.id === Number(item.id)
            ? { ...result, currentBalance: (Number(result.currentBalance) - item.requestQuantity).toString() }
            : result) ?? null);
        setCart(prev => [...prev, cartItem]);
        setIsItemFormOpen(false);
        setSelectedItem(null);
        setIsManualEntry(false);
    };
    const handlePreviewSubmit = () => {
        setIsPreviewOpen(true);
    };
    const handleUpdateCartItem = (itemId: string, updates: Partial<RequestCartItem>) => {
        setCart(prev => prev.map(item => item.id === itemId ? { ...item, ...updates } : item));
    };
    const handleDeleteCartItem = (itemId: string) => {
        const deletedItem = cart.find(item => item.id === itemId);
        if (deletedItem) {
            setResults((prevResults: SearchResult[] | null) => prevResults?.map(result => result.id === Number(deletedItem.id)
                ? { ...result, currentBalance: (Number(result.currentBalance) + deletedItem.requestQuantity).toString() }
                : result) ?? null);
        }
        setCart(prev => prev.filter(item => item.id !== itemId));
    };
    const handleConfirmSubmit = async () => {
        if (!user) {
            showErrorToast({
                title: 'Error',
                message: "You must be logged in to submit a request.",
                duration: 3000,
            });
            return;
        }
        if (!requestNumber.trim()) {
            showErrorToast({
                title: 'Error',
                message: "Please enter a request number.",
                duration: 3000,
            });
            return;
        }
        const isDuplicate = await checkDuplicateRequestNumber(requestNumber);
        if (isDuplicate) {
            showErrorToast({
                title: 'Error',
                message: "This request number has already been used. Please use a different request number.",
                duration: 5000,
            });
            return;
        }
        if (!date) {
            showErrorToast({
                title: 'Error',
                message: "Please select a request date.",
                duration: 3000,
            });
            return;
        }
        if (lastRequestCache && lastRequestCache.requestDate) {
            const previousRequestDate = new Date(lastRequestCache.requestDate);
            if (date < previousRequestDate) {
                showErrorToast({
                    title: 'Error',
                    message: `Request date cannot be before the previous request date (${previousRequestDate.toLocaleDateString()}).`,
                    duration: 5000,
                });
                return;
            }
        }
        if (cart.length === 0) {
            showErrorToast({
                title: 'Error',
                message: "Your cart is empty. Please add items before submitting.",
                duration: 3000,
            });
            return;
        }
        setIsSubmitting(true);
        try {
            const imagePaths: string[] = [];
            for (const item of cart) {
                if (item.image) {
                    try {
                        const formData = new FormData();
                        formData.append('file', item.image);
                        formData.append('folder', 'request');
                        const uploadResponse = await fetch(withBasePath('/api/upload'), {
                            method: 'POST',
                            body: formData,
                        });
                        if (!uploadResponse.ok) {
                            const errorData = await uploadResponse.json();
                            throw new Error(errorData.error || 'Failed to upload image');
                        }
                        const uploadResult = await uploadResponse.json();
                        imagePaths.push(uploadResult.path);
                    }
                    catch {
                        showErrorToast({
                            title: 'Error',
                            message: `Failed to upload image for ${item.itemName}. Please try again.`,
                            duration: 5000,
                        });
                        setIsSubmitting(false);
                        return;
                    }
                }
                else {
                    imagePaths.push('');
                }
            }
            const formatDateForAPI = (date: Date): string => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };
            const requestData = {
                requestDate: formatDateForAPI(date),
                requestNumber,
                remarks,
                requestedBy: user.UserInfo.username,
                items: cart.map((item, index) => ({
                    nacCode: item.nacCode,
                    partNumber: item.partNumber || 'NA',
                    itemName: item.itemName,
                    requestQuantity: item.requestQuantity,
                    equipmentNumber: item.equipmentNumber,
                    specifications: item.specifications || '',
                    imagePath: imagePaths[index],
                    unit: item.unit || '',
                    requestedById: item.requestedById ?? null,
                    requestedByEmail: item.requestedByEmail ?? null
                }))
            };
            try {
                const response = await API.post('/api/request/create', requestData);
                if (response.status === 200 || response.status === 201) {
                    showSuccessToast({
                        title: 'Success',
                        message: "Request submitted successfully.",
                        duration: 3000,
                    });
                    setCart([]);
                    setDate(undefined);
                    setRequestNumber('');
                    setRemarks('');
                    setIsPreviewOpen(false);
                }
                else {
                    throw new Error(response.data?.message || 'Failed to submit request');
                }
            }
            catch (apiError: unknown) {
                if (typeof apiError === 'object' &&
                    apiError !== null &&
                    'response' in apiError &&
                    typeof (apiError as {
                        response?: unknown;
                    }).response === 'object' &&
                    (apiError as {
                        response?: unknown;
                    }).response !== null) {
                    const response = (apiError as {
                        response?: unknown;
                    }).response;
                    if (typeof response === 'object' &&
                        response !== null &&
                        'status' in response &&
                        'data' in response) {
                        const status = (response as {
                            status: number;
                        }).status;
                        const data = (response as {
                            data?: unknown;
                        }).data;
                        if (status === 409) {
                            throw new Error('This request number has already been used. Please use a different request number.');
                        }
                        else if (status === 400) {
                            if (typeof data === 'object' &&
                                data !== null &&
                                'message' in data &&
                                typeof (data as {
                                    message?: unknown;
                                }).message === 'string') {
                                throw new Error((data as {
                                    message: string;
                                }).message);
                            }
                            else {
                                throw new Error('Invalid request data. Please check your input.');
                            }
                        }
                        else if (typeof data === 'object' &&
                            data !== null &&
                            'message' in data &&
                            typeof (data as {
                                message?: unknown;
                            }).message === 'string') {
                            throw new Error((data as {
                                message: string;
                            }).message);
                        }
                    }
                }
                if (apiError instanceof Error) {
                    throw apiError;
                }
                else {
                    throw new Error('An unknown error occurred while submitting the request');
                }
            }
        }
        catch (error: unknown) {
            let errorMessage = "Failed to submit request";
            if (error instanceof Error) {
                errorMessage = error.message;
            }
            else if (typeof error === 'object' &&
                error !== null &&
                'response' in error &&
                typeof (error as {
                    response?: unknown;
                }).response === 'object' &&
                (error as {
                    response?: unknown;
                }).response !== null) {
                const response = (error as {
                    response?: unknown;
                }).response;
                if (typeof response === 'object' &&
                    response !== null &&
                    'data' in response &&
                    typeof (response as {
                        data?: unknown;
                    }).data === 'object' &&
                    (response as {
                        data?: unknown;
                    }).data !== null) {
                    const data = (response as {
                        data?: unknown;
                    }).data;
                    if (typeof data === 'object' &&
                        data !== null &&
                        'message' in data &&
                        typeof (data as {
                            message?: unknown;
                        }).message === 'string') {
                        errorMessage = (data as {
                            message: string;
                        }).message;
                    }
                }
            }
            showErrorToast({
                title: 'Error',
                message: errorMessage,
                duration: 5000,
            });
        }
        finally {
            setIsSubmitting(false);
        }
    };
    return (<div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">Create Request</h1>
              <p className="text-gray-600 mt-1">Request items from inventory</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[#d2293b] animate-pulse"></div>
              <span className="text-sm text-gray-600">Live Request</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            <div className="lg:col-span-2 space-y-8">
              <div className="bg-white rounded-xl shadow-sm border border-[#002a6e]/10 p-6 hover:border-[#d2293b]/20 transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-lg font-semibold text-[#003594]">Search Inventory</span>
                  <Button variant="outline" onClick={handleManualEntry} className="flex items-center gap-2 border-[#d2293b] text-[#d2293b] bg-[#ffeaea] hover:bg-[#d2293b]/10">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                    </svg>
                    Request New Item
                  </Button>
                </div>
                <SearchControls onUniversalSearch={handleSearch('universal')} onEquipmentSearch={handleSearch('equipmentNumber')} onPartSearch={handleSearch('partNumber')}/>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-[#002a6e]/10 p-6 hover:border-[#d2293b]/20 transition-colors">
                <Suspense fallback={<SearchResultsSkeleton />}>
                  {isLoading ? (<SearchResultsSkeleton />) : (<SearchResults results={results} isLoading={isLoading} error={error} onRowClick={handleRowSelect} onRowDoubleClick={handleRowDoubleClick} canViewFullDetails={canViewFullDetails} selectedItemId={selectedSearchResult?.id ?? null}/>)}
                </Suspense>
              </div>
            </div>

            
            <div className="space-y-8">
              <div className="bg-white rounded-xl shadow-sm border border-[#002a6e]/10 p-6 hover:border-[#d2293b]/20 transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-semibold text-[#003594] uppercase tracking-wide">
                      Predictive Arrival
                    </p>
                    <p className="text-xs text-gray-500">
                      {activeNacCode
            ? `NAC ${activeNacCode}`
            : 'Select an item to see estimated lead time'}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={refreshPrediction} disabled={!activeNacCode || isPredictionLoading} className="text-[#003594] hover:bg-[#003594]/10">
                    Refresh
                  </Button>
                </div>
                {isPredictionLoading && (<div className="flex items-center justify-center py-6">
                    <Spinner />
                  </div>)}
                {!isPredictionLoading && prediction && (<PredictionSummaryCard prediction={prediction} baseDate={date ?? new Date()} compact accentColor="#d2293b"/>)}
                {!isPredictionLoading && !prediction && (<div className="rounded-lg border border-dashed border-[#003594]/20 bg-slate-50 p-4 text-sm text-slate-600">
                    {predictionError
                ? predictionError
                : 'No historical receive data yet for this NAC code. Once approved receives are recorded, predictions will appear here.'}
                  </div>)}
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-[#002a6e]/10 p-6 hover:border-[#d2293b]/20 transition-colors">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="requestNumber" className="text-sm font-medium text-[#003594]">Request Number</Label>
                    <div className="flex items-center gap-2">
                      <Input id="requestNumber" value={requestNumber} onChange={handleRequestNumberChange} className="mt-1" placeholder="Request number" disabled={!isRequestNumberEditable || isLoadingLastRequest}/>
                      <label className="inline-flex items-center text-sm text-gray-600">
                        <input type="checkbox" checked={isRequestNumberEditable} onChange={(e) => setIsRequestNumberEditable(e.target.checked)} disabled={!permissions.includes('can_create_new_request_number')} className="mr-2"/>
                        Edit
                      </label>
                    </div>
                    {requestNumberError && <p className="text-red-500 text-xs mt-1">{requestNumberError}</p>}
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-[#003594]">Request Date</Label>
                    {lastRequestCache && lastRequestCache.requestDate && (<p className="text-xs text-gray-500 mt-1 mb-2">
                        Previous request date: {new Date(lastRequestCache.requestDate).toLocaleDateString()}
                      </p>)}
                    <div className="mt-1">
                      <Calendar value={date} onChange={handleDateChange} className="rounded-md border"/>
                      {dateError && <p className="text-red-500 text-xs mt-1">{dateError}</p>}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="remarks" className="text-sm font-medium text-[#003594]">Remarks</Label>
                    <textarea id="remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" rows={3} placeholder="Enter any remarks"/>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-[#002a6e]/10 p-6 hover:border-[#d2293b]/20 transition-colors">
                <Suspense fallback={<RequestCartSkeleton />}>
                  <RequestCart items={cart} onUpdateItem={handleUpdateCartItem} onDeleteItem={handleDeleteCartItem} onSubmit={handlePreviewSubmit} isSubmitDisabled={!date || !requestNumber.trim() || cart.length === 0 || !!dateError || !!requestNumberError} isSubmitting={isSubmitting} remarks={remarks} onRemarksChange={setRemarks}/>
                </Suspense>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <RequestItemForm isOpen={isItemFormOpen} onClose={() => {
            setIsItemFormOpen(false);
            setSelectedItem(null);
            setIsManualEntry(false);
        }} item={selectedItem} onSubmit={handleAddToCart} isManualEntry={isManualEntry}/>
      </Suspense>

      <Suspense fallback={null}>
        <RequestPreviewModal isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} onConfirm={handleConfirmSubmit} onUpdateItem={handleUpdateCartItem} onDeleteItem={handleDeleteCartItem} items={cart} date={date || new Date()} requestNumber={requestNumber} remarks={remarks} isSubmitting={isSubmitting}/>
      </Suspense>
    </div>);
}
