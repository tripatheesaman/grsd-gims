'use client';
import { useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { SearchControls, SearchResults } from '@/components/search';
import { useSearch } from '@/hooks/useSearch';
import { IssueCartItem, IssueRequest } from '@/types/issue';
import { IssueCart } from '@/components/issue/IssueCart';
import { IssueItemForm } from '@/components/issue/IssueItemForm';
import { IssuePreviewModal } from '@/components/issue/IssuePreviewModal';
import { API } from '@/lib/api';
import { SearchResult } from '@/types/search';
import { useAuthContext } from '@/context/AuthContext';
import { useCustomToast } from "@/components/ui/custom-toast";
import { startOfDay, format } from 'date-fns';
export default function IssuePage() {
    const { user } = useAuthContext();
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const [date, setDate] = useState<Date | undefined>(undefined);
    const [selectedItem, setSelectedItem] = useState<IssueCartItem | null>(null);
    const [isItemFormOpen, setIsItemFormOpen] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [cart, setCart] = useState<IssueCartItem[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [validationErrors, setValidationErrors] = useState<{
        nacCode: string;
        message: string;
        originalIndex: number;
    }[]>([]);
    const { results, isLoading, error, handleSearch, } = useSearch();
    const adjustCurrentBalance = (searchResults: SearchResult[] | null) => {
        if (!searchResults)
            return null;
        return searchResults.map(result => {
            const cartItems = cart.filter(item => item.nacCode === result.nacCode);
            const totalCartQuantity = cartItems.reduce((sum, item) => sum + item.issueQuantity, 0);
            if (cartItems.length > 0) {
                return {
                    ...result,
                    currentBalance: (parseFloat(result.currentBalance) - totalCartQuantity).toString()
                };
            }
            return result;
        });
    };
    const adjustedResults = results ? adjustCurrentBalance(results) : null;
    const handleRowDoubleClick = (item: SearchResult) => {
        const issueCartItem: IssueCartItem = {
            ...item,
            id: String(item.id),
            currentBalance: Number(item.currentBalance),
            selectedEquipment: item.equipmentNumber,
            issueQuantity: 1,
            quantity: 1,
        };
        setSelectedItem(issueCartItem);
        setIsItemFormOpen(true);
    };
    const handleAddToCart = (item: IssueCartItem) => {
        const cartItem: IssueCartItem = {
            ...item,
            id: `${item.id}-${Date.now()}`
        };
        setCart(prev => [...prev, cartItem]);
        setIsItemFormOpen(false);
        setSelectedItem(null);
    };
    const handlePreviewSubmit = () => {
        setIsPreviewOpen(true);
    };
    const handleUpdateCartItem = (itemId: string, updates: Partial<IssueCartItem>) => {
        setCart(prev => prev.map(item => item.id === itemId ? { ...item, ...updates } : item));
    };
    const handleDeleteCartItem = (itemId: string) => {
        setCart(prev => prev.filter(item => item.id !== itemId));
    };
    const handleConfirmSubmit = async () => {
        if (!user) {
            showErrorToast({
                title: 'Error',
                message: "You must be logged in to submit an issue request.",
                duration: 3000,
            });
            return;
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
            const selectedDate = date || new Date();
            const formattedDate = format(startOfDay(selectedDate), 'yyyy-MM-dd');
            const request: IssueRequest = {
                issueDate: formattedDate,
                items: cart.map(item => ({
                    nacCode: item.nacCode,
                    quantity: item.issueQuantity,
                    equipmentNumber: item.selectedEquipment,
                    partNumber: item.partNumber || 'NA'
                })),
                issuedBy: {
                    name: user.UserInfo.name,
                    staffId: user.UserInfo.username
                }
            };
            const response = await API.post('/api/issue/create', request);
            if (response.status === 201) {
                showSuccessToast({
                    title: 'Success',
                    message: "Issue request submitted successfully.",
                    duration: 3000,
                });
                setCart([]);
                setDate(undefined);
                setIsPreviewOpen(false);
                setValidationErrors([]);
            }
            else {
                throw new Error(response.data?.message || 'Failed to submit issue request');
            }
        }
        catch (error: unknown) {
            let errorMessage = "Failed to submit issue request";
            let validationErrs: {
                nacCode: string;
                message: string;
                originalIndex: number;
            }[] = [];
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
                    if (typeof data === 'object' &&
                        data !== null &&
                        'validationErrors' in data &&
                        Array.isArray((data as {
                            validationErrors?: string[];
                        }).validationErrors)) {
                        const stringErrors = (data as {
                            validationErrors?: string[];
                        }).validationErrors || [];
                        validationErrs = stringErrors.map((error, index) => ({
                            nacCode: '',
                            message: error,
                            originalIndex: index
                        }));
                        setValidationErrors(validationErrs);
                    }
                }
            }
            if (validationErrs.length > 0) {
                showErrorToast({
                    title: 'Error',
                    message: `${validationErrs.length} item(s) have insufficient stock or are not found. Check the cart for details.`,
                    duration: 5000,
                });
            }
            else {
                showErrorToast({
                    title: 'Error',
                    message: errorMessage,
                    duration: 5000,
                });
            }
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
              <h1 className="text-3xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">Issue Items</h1>
              <p className="text-gray-600 mt-1">Issue items from inventory</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[#d2293b] animate-pulse"></div>
              <span className="text-sm text-gray-600">Live Issue</span>
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
                  </div>) : (<SearchResults results={adjustedResults} isLoading={isLoading} error={error} onRowDoubleClick={handleRowDoubleClick} canViewFullDetails={true}/>)}
              </div>
            </div>

            
            <div className="space-y-8">
              <div className="bg-white rounded-xl shadow-sm border border-[#002a6e]/10 p-6 hover:border-[#d2293b]/20 transition-colors">
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-[#003594]">Issue Date</h2>
                    <div className="mt-2">
                      <Calendar value={date} onChange={(newDate) => newDate && setDate(startOfDay(newDate))} className="rounded-md border"/>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-[#002a6e]/10 p-6 hover:border-[#d2293b]/20 transition-colors">
                <IssueCart items={cart} onUpdateItem={handleUpdateCartItem} onDeleteItem={handleDeleteCartItem} onSubmit={handlePreviewSubmit} isSubmitDisabled={!date || cart.length === 0} isSubmitting={isSubmitting} validationErrors={validationErrors}/>
              </div>
            </div>
          </div>
        </div>
      </div>

      <IssueItemForm isOpen={isItemFormOpen} onClose={() => setIsItemFormOpen(false)} item={selectedItem} onSubmit={handleAddToCart}/>

      <IssuePreviewModal isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} onConfirm={handleConfirmSubmit} onUpdateItem={handleUpdateCartItem} onDeleteItem={handleDeleteCartItem} items={cart} date={date || new Date()} isSubmitting={isSubmitting}/>
    </div>);
}
