'use client';
import { useState, Suspense, lazy, useEffect } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { SearchControls } from '@/components/search';
import { useSearch } from '@/hooks/useSearch';
import { useAuthContext } from '@/context/AuthContext';
import { useCustomToast } from "@/components/ui/custom-toast";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BorrowReceiveCartItem, BorrowSource } from '@/types/borrow-receive';
import { TenderReceiveCartItem } from '@/types/tender-receive';
import { Button } from '@/components/ui/button';
import { API } from '@/lib/api';
import { withBasePath } from '@/lib/urls';
import { SearchResult } from '@/types/search';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
const SearchResults = lazy(() => import('@/components/search/SearchResults').then(module => ({ default: module.SearchResults })));
const TenderReceiveCart = lazy(() => import('@/components/tender-receive/TenderReceiveCart').then(module => ({ default: module.TenderReceiveCart })));
const TenderReceiveForm = lazy(() => import('@/components/tender-receive/TenderReceiveForm').then(module => ({ default: module.TenderReceiveItemForm })));
const TenderReceivePreviewModal = lazy(() => import('@/components/tender-receive/TenderReceivePreviewModal').then(module => ({ default: module.TenderReceivePreviewModal })));
const SearchResultsSkeleton = () => (<div className="animate-pulse space-y-4">
    <div className="h-8 bg-gray-200 rounded w-1/4"></div>
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (<div key={i} className="h-16 bg-gray-200 rounded"></div>))}
    </div>
  </div>);
const TenderReceiveCartSkeleton = () => (<div className="animate-pulse space-y-4">
    <div className="h-8 bg-gray-200 rounded w-1/2"></div>
    <div className="space-y-3">
      {[1, 2].map((i) => (<div key={i} className="h-24 bg-gray-200 rounded"></div>))}
    </div>
  </div>);
export default function BorrowReceivePage() {
    const { user, permissions } = useAuthContext();
    const canViewFullDetails = permissions.includes('can_view_full_item_details_in_search');
    const canBorrowStocks = permissions.includes('can_borrow_stocks');
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const [date, setDate] = useState<Date | undefined>(undefined);
    const [borrowSourceId, setBorrowSourceId] = useState<string>('');
    const [borrowReferenceNumber, setBorrowReferenceNumber] = useState('');
    const [borrowSources, setBorrowSources] = useState<BorrowSource[]>([]);
    const [selectedItem, setSelectedItem] = useState<SearchResult | null>(null);
    const [isItemFormOpen, setIsItemFormOpen] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isManualEntry, setIsManualEntry] = useState(false);
    const [cart, setCart] = useState<BorrowReceiveCartItem[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [dateError] = useState<string>('');
    const [sourceError, setSourceError] = useState<string>('');
    const { results, isLoading, error, handleSearch, setResults, } = useSearch();
    useEffect(() => {
        if (!canBorrowStocks) {
            return;
        }
        let isMounted = true;
        const fetchBorrowSources = async () => {
            try {
                const response = await API.get('/api/borrow-sources?activeOnly=true');
                if (response.status === 200 && isMounted) {
                    setBorrowSources(response.data.data || []);
                }
            }
            catch {
                if (isMounted) {
                    showErrorToast({
                        title: "Error",
                        message: "Failed to load borrow sources",
                        duration: 3000,
                    });
                }
            }
        };
        fetchBorrowSources();
        return () => {
            isMounted = false;
        };
    }, [canBorrowStocks]);
    if (!canBorrowStocks) {
        return (<div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
          <p className="text-gray-600 mt-2">You don&apos;t have permission to borrow stocks.</p>
        </div>
      </div>);
    }
    const handleDateChange = (newDate: Date | null) => {
        setDate(newDate ?? undefined);
    };
    const handleSourceChange = (value: string) => {
        setBorrowSourceId(value);
        if (sourceError) {
            setSourceError('');
        }
    };
    const handleRowDoubleClick = (item: SearchResult) => {
        setSelectedItem(item);
        setIsItemFormOpen(true);
    };
    const handleManualEntry = () => {
        setSelectedItem(null);
        setIsManualEntry(true);
        setIsItemFormOpen(true);
    };
    const handleAddToCart = async (item: BorrowReceiveCartItem) => {
        const cartItem: BorrowReceiveCartItem = {
            ...item,
            id: `${item.id}-${Date.now()}`
        };
        setResults((prevResults: SearchResult[] | null) => prevResults?.map(result => result.id === Number(item.id)
            ? { ...result, currentBalance: (Number(result.currentBalance) - item.receiveQuantity).toString() }
            : result) ?? null);
        setCart(prev => [...prev, cartItem]);
        setIsItemFormOpen(false);
        setSelectedItem(null);
        setIsManualEntry(false);
    };
    const handlePreviewSubmit = () => {
        setIsPreviewOpen(true);
    };
    const handleUpdateCartItem = (itemId: string, updates: Partial<BorrowReceiveCartItem>) => {
        setCart(prev => prev.map(item => item.id === itemId ? { ...item, ...updates } : item));
    };
    const handleDeleteCartItem = (itemId: string) => {
        const deletedItem = cart.find(item => item.id === itemId);
        if (deletedItem) {
            setResults((prevResults: SearchResult[] | null) => prevResults?.map(result => result.id === Number(deletedItem.id)
                ? { ...result, currentBalance: (Number(result.currentBalance) + deletedItem.receiveQuantity).toString() }
                : result) ?? null);
        }
        setCart(prev => prev.filter(item => item.id !== itemId));
    };
    const handleConfirmSubmit = async () => {
        if (!user) {
            showErrorToast({
                title: "Error",
                message: "You must be logged in to submit a borrow receive.",
                duration: 3000,
            });
            return;
        }
        if (!borrowSourceId) {
            setSourceError('Please select a borrow source');
            showErrorToast({
                title: "Error",
                message: "Please select a borrow source.",
                duration: 3000,
            });
            return;
        }
        if (!date) {
            showErrorToast({
                title: "Error",
                message: "Please select a borrow date.",
                duration: 3000,
            });
            return;
        }
        if (cart.length === 0) {
            showErrorToast({
                title: "Error",
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
                            title: "Image Upload Error",
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
            const receiveDateLocal = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            const receiveData = {
                receiveDate: receiveDateLocal,
                borrowSourceId: parseInt(borrowSourceId),
                borrowReferenceNumber: borrowReferenceNumber.trim() || undefined,
                receivedBy: user.UserInfo.username,
                items: cart.map((item, index) => ({
                    nacCode: item.nacCode,
                    partNumber: item.partNumber || 'NA',
                    itemName: item.itemName,
                    receiveQuantity: item.receiveQuantity,
                    equipmentNumber: item.equipmentNumber,
                    imagePath: imagePaths[index],
                    unit: item.unit || '',
                    location: item.location,
                    cardNumber: item.cardNumber,
                    isNewItem: item.isNewItem === true
                }))
            };
            try {
                const response = await API.post('/api/borrow-receive/create', receiveData);
                if (response.status === 200 || response.status === 201) {
                    showSuccessToast({
                        title: "Success",
                        message: "Successfully Borrowed, Awaiting Approval!",
                        duration: 3000,
                    });
                    setCart([]);
                    setDate(undefined);
                    setBorrowSourceId('');
                    setBorrowReferenceNumber('');
                    setIsPreviewOpen(false);
                }
                else {
                    throw new Error(response.data?.message || 'Failed to borrow items!');
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
                            throw new Error('This borrow has already been recorded. Please use a different reference number.');
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
                                throw new Error('Invalid borrow receive data. Please check your input.');
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
                    throw new Error('An unknown error occurred while submitting the borrow receive');
                }
            }
        }
        catch (error: unknown) {
            let errorMessage = "Failed to submit borrow receive";
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
                title: "Error",
                message: errorMessage,
                duration: 5000,
            });
        }
        finally {
            setIsSubmitting(false);
        }
    };
    return (<div className="bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">Borrow Stocks</h1>
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
                    Borrow New Item
                  </Button>
                </div>
                <SearchControls onUniversalSearch={handleSearch('universal')} onEquipmentSearch={handleSearch('equipmentNumber')} onPartSearch={handleSearch('partNumber')}/>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-[#002a6e]/10 p-6 hover:border-[#d2293b]/20 transition-colors">
                <Suspense fallback={<SearchResultsSkeleton />}>
                  {isLoading ? (<SearchResultsSkeleton />) : (<SearchResults results={results} isLoading={isLoading} error={error} onRowDoubleClick={handleRowDoubleClick} canViewFullDetails={canViewFullDetails}/>)}
                </Suspense>
              </div>
            </div>

            
            <div className="space-y-8">
              <div className="bg-white rounded-xl shadow-sm border border-[#002a6e]/10 p-6 hover:border-[#d2293b]/20 transition-colors">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="borrowSource" className="text-sm font-medium text-[#003594]">Borrow Source *</Label>
                    <Select value={borrowSourceId} onValueChange={handleSourceChange}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select borrow source"/>
                      </SelectTrigger>
                      <SelectContent className="bg-white">
                        {borrowSources.map((source) => (<SelectItem key={source.id} value={String(source.id)}>
                            {source.source_name} {source.source_code ? `(${source.source_code})` : ''}
                          </SelectItem>))}
                      </SelectContent>
                    </Select>
                    {sourceError && <p className="text-red-500 text-xs mt-1">{sourceError}</p>}
                    {borrowSources.length === 0 && (<p className="text-xs text-gray-500 mt-1">No active borrow sources available. Please add sources in Settings.</p>)}
                  </div>
                  <div>
                    <Label htmlFor="borrowReferenceNumber" className="text-sm font-medium text-[#003594]">Borrow Reference Number (Optional)</Label>
                    <Input id="borrowReferenceNumber" value={borrowReferenceNumber} onChange={(e) => setBorrowReferenceNumber(e.target.value)} className="mt-1" placeholder="Enter reference number (optional)"/>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-[#003594]">Borrow Date *</Label>
                    <div className="mt-1">
                      <Calendar value={date} onChange={handleDateChange} className="rounded-md border"/>
                      {dateError && <p className="text-red-500 text-xs mt-1">{dateError}</p>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-[#002a6e]/10 p-6 hover:border-[#d2293b]/20 transition-colors">
                <Suspense fallback={<TenderReceiveCartSkeleton />}>
                  <TenderReceiveCart items={cart as unknown as TenderReceiveCartItem[]} onUpdateItem={handleUpdateCartItem as unknown as (itemId: string, updates: Partial<TenderReceiveCartItem>) => void} onDeleteItem={handleDeleteCartItem} onSubmit={handlePreviewSubmit} isSubmitDisabled={!date || !borrowSourceId || cart.length === 0 || !!dateError || !!sourceError} isSubmitting={isSubmitting}/>
                </Suspense>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <TenderReceiveForm isOpen={isItemFormOpen} onClose={() => {
            setIsItemFormOpen(false);
            setSelectedItem(null);
            setIsManualEntry(false);
        }} item={selectedItem} isManualEntry={isManualEntry} isBorrowReceive={true} onSubmit={handleAddToCart as unknown as (item: TenderReceiveCartItem) => void}/>
      </Suspense>

      <Suspense fallback={null}>
        <TenderReceivePreviewModal isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} onConfirm={handleConfirmSubmit} onUpdateItem={handleUpdateCartItem as unknown as (itemId: string, updates: Partial<TenderReceiveCartItem>) => void} onDeleteItem={handleDeleteCartItem} items={cart as unknown as TenderReceiveCartItem[]} date={date || new Date()} tenderNumber={borrowReferenceNumber || `Source: ${borrowSources.find(s => String(s.id) === borrowSourceId)?.source_name || 'N/A'}`} isSubmitting={isSubmitting}/>
      </Suspense>
    </div>);
}
