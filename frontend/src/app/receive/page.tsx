'use client';
import { useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { SearchControls } from '@/components/search';
import { useReceiveSearch } from '@/hooks/useReceiveSearch';
import { ReceiveCartItem, ReceiveData } from '@/types/receive';
import { ReceiveCart } from '@/components/receive/ReceiveCart';
import { ReceiveItemForm } from '@/components/receive/ReceiveItemForm';
import { ReceivePreviewModal } from '@/components/receive/ReceivePreviewModal';
import { API } from '@/lib/api';
import { withBasePath } from '@/lib/urls';
import { ReceiveSearchResult } from '@/types/search';
import { useAuthContext } from '@/context/AuthContext';
import { useCustomToast } from "@/components/ui/custom-toast";
import { Label } from '@/components/ui/label';
import { SearchResult } from '@/types/search';
import { ReceiveSearchResults } from '@/components/receive/ReceiveSearchResults';
export default function ReceivePage() {
    const { user, permissions } = useAuthContext();
    const canViewFullDetails = permissions.includes('can_view_full_item_details_in_search');
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const [date, setDate] = useState<Date | undefined>(undefined);
    const [selectedItem, setSelectedItem] = useState<ReceiveSearchResult | null>(null);
    const [isItemFormOpen, setIsItemFormOpen] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [cart, setCart] = useState<ReceiveCartItem[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [remarks, setRemarks] = useState<string>('');
    const { results, isLoading, error, currentPage, totalCount, totalPages, handleSearch, handlePageChange, setResults, } = useReceiveSearch();
    const handleRowDoubleClick = (item: SearchResult | ReceiveSearchResult) => {
        if ('requestedQuantity' in item) {
            setSelectedItem(item);
            setIsItemFormOpen(true);
        }
    };
    const handleAddToCart = (item: ReceiveCartItem) => {
        if (cart.length >= 3) {
            showErrorToast({
                title: "Error",
                message: "Maximum of 3 items can be received at once.",
                duration: 3000,
            });
            return;
        }
        const originalRequestId = item.id.split('-')[0];
        const isDuplicate = cart.some(cartItem => cartItem.id.split('-')[0] === originalRequestId);
        if (isDuplicate) {
            showErrorToast({
                title: "Error",
                message: "This item is already in your receive cart.",
                duration: 3000,
            });
            return;
        }
        const cartItem: ReceiveCartItem = {
            ...item,
            id: `${item.id}-${Date.now()}`
        };
        setResults((prevResults: ReceiveSearchResult[] | null) => prevResults?.map(result => result.id === Number(item.id)
            ? { ...result, currentBalance: String(Number(result.currentBalance) + item.receiveQuantity) }
            : result) ?? null);
        setCart(prev => [...prev, cartItem]);
        setIsItemFormOpen(false);
        setSelectedItem(null);
    };
    const handlePreviewSubmit = () => {
        setIsPreviewOpen(true);
    };
    const handleUpdateCartItem = (itemId: string, updates: Partial<ReceiveCartItem>) => {
        setCart(prev => prev.map(item => item.id === itemId ? { ...item, ...updates } : item));
    };
    const handleDeleteCartItem = (itemId: string) => {
        const deletedItem = cart.find(item => item.id === itemId);
        if (deletedItem) {
            setResults((prevResults: ReceiveSearchResult[] | null) => prevResults?.map(result => result.id === Number(deletedItem.id)
                ? { ...result, currentBalance: String(Number(result.currentBalance) - deletedItem.receiveQuantity) }
                : result) ?? null);
        }
        setCart(prev => prev.filter(item => item.id !== itemId));
    };
    const handleConfirmSubmit = async () => {
        if (!user) {
            showErrorToast({
                title: "Error",
                message: "You must be logged in to submit a receive.",
                duration: 3000,
            });
            return;
        }
        if (!date) {
            showErrorToast({
                title: "Error",
                message: "Please select a receive date.",
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
                if (item.imagePath && !item.image) {
                    imagePaths.push(item.imagePath);
                }
                else if (item.image) {
                    try {
                        const formData = new FormData();
                        formData.append('file', item.image);
                        formData.append('folder', 'receive');
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
            const receiveData: ReceiveData = {
                receiveDate: receiveDateLocal,
                remarks: remarks,
                receivedBy: user.UserInfo.username,
                items: cart.map((item, index) => ({
                    nacCode: item.nacCode,
                    partNumber: item.partNumber || 'NA',
                    itemName: item.itemName,
                    receiveQuantity: item.receiveQuantity,
                    equipmentNumber: item.equipmentNumber,
                    imagePath: imagePaths[index],
                    unit: item.unit || '',
                    requestId: Number(item.id.split('-')[0]),
                    location: item.isLocationChanged ? item.location : undefined,
                    cardNumber: item.isCardNumberChanged ? item.cardNumber : undefined
                }))
            };
            const response = await API.post('/api/receive', receiveData);
            if (response.status === 201) {
                showSuccessToast({
                    title: "Success",
                    message: "Items received successfully",
                    duration: 3000,
                });
                setCart([]);
                setDate(undefined);
                setResults(null);
            }
        }
        catch (error: unknown) {
            const axiosError = error as {
                response?: {
                    data?: {
                        message?: string;
                    };
                };
                message?: string;
            };
            const backendMessage = axiosError?.response?.data?.message || axiosError?.message || 'Failed to submit receive. Please try again.';
            showErrorToast({
                title: "Error",
                message: backendMessage,
                duration: 5000,
            });
        }
        finally {
            setIsSubmitting(false);
            setIsPreviewOpen(false);
        }
    };
    return (<div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">Receive Items</h1>
              <p className="text-gray-600 mt-1">Receive items into inventory</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[#d2293b] animate-pulse"></div>
              <span className="text-sm text-gray-600">Live Receive</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            <div className="lg:col-span-2 space-y-8">
              <div className="bg-white rounded-xl shadow-sm border border-[#002a6e]/10 p-6 hover:border-[#d2293b]/20 transition-colors">
                <SearchControls onUniversalSearch={handleSearch('universal')} onEquipmentSearch={handleSearch('equipmentNumber')} onPartSearch={handleSearch('partNumber')}/>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-[#002a6e]/10 p-6 hover:border-[#d2293b]/20 transition-colors">
                {isLoading ? (<div className="flex items-center justify-center h-24">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#003594] border-t-transparent"></div>
                  </div>) : (<ReceiveSearchResults results={results} isLoading={isLoading} error={error} onRowDoubleClick={handleRowDoubleClick} canViewFullDetails={canViewFullDetails} currentPage={currentPage} totalCount={totalCount} totalPages={totalPages} onPageChange={handlePageChange}/>)}
              </div>
            </div>

            
            <div className="space-y-8">
              <div className="bg-white rounded-xl shadow-sm border border-[#002a6e]/10 p-6 hover:border-[#d2293b]/20 transition-colors">
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-[#003594]">Receive Date</Label>
                    <div className="mt-1">
                      <Calendar value={date} onChange={(newDate) => setDate(newDate ?? undefined)} className="rounded-md border"/>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="remarks" className="text-sm font-medium text-[#003594]">Remarks</Label>
                    <textarea id="remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" rows={3} placeholder="Enter any remarks"/>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-[#002a6e]/10 p-6 hover:border-[#d2293b]/20 transition-colors">
                <ReceiveCart items={cart} onUpdateItem={handleUpdateCartItem} onDeleteItem={handleDeleteCartItem} onSubmit={handlePreviewSubmit} isSubmitDisabled={!date || cart.length === 0} isSubmitting={isSubmitting}/>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ReceiveItemForm isOpen={isItemFormOpen} onClose={() => {
            setIsItemFormOpen(false);
            setSelectedItem(null);
        }} item={selectedItem} onSubmit={handleAddToCart}/>

      <ReceivePreviewModal isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} onConfirm={handleConfirmSubmit} onUpdateItem={handleUpdateCartItem} onDeleteItem={handleDeleteCartItem} items={cart} date={date || new Date()} remarks={remarks} isSubmitting={isSubmitting}/>
    </div>);
}
