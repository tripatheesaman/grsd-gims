'use client';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { CalendarIcon, Loader2, ArrowRight, RefreshCw, Search, X, ChevronsUpDown, Check } from 'lucide-react';
import { useAuthContext } from '@/context/AuthContext';
import { API } from '@/lib/api';
import { cn } from '@/lib/utils';
interface TransferrableItem {
    id: number;
    nac_code: string;
    item_name: string;
    part_number: string;
    received_quantity: number;
    transferred_quantity: number;
    transferrable_quantity: number;
    total_amount: number;
    rrp_number: string;
    rrp_date: string;
    supplier_name: string;
}
interface TransferFormData {
    fromNacCode: string;
    toNacCode: string;
    transferQuantity: number;
    transferDate: Date | null;
}
export default function BalanceTransferPage() {
    const { user } = useAuthContext();
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const showErrorToastRef = useRef(showErrorToast);
    useEffect(() => { showErrorToastRef.current = showErrorToast; }, [showErrorToast]);
    const [isLoading, setIsLoading] = useState(true);
    const [transferrableItems, setTransferrableItems] = useState<TransferrableItem[]>([]);
    const [filteredItems, setFilteredItems] = useState<TransferrableItem[]>([]);
    const [existingNacCodes, setExistingNacCodes] = useState<string[]>([]);
    const [selectedItem, setSelectedItem] = useState<TransferrableItem | null>(null);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isTransferring, setIsTransferring] = useState(false);
    const [searchQueries, setSearchQueries] = useState({
        nacCode: '',
        itemName: '',
        partNumber: '',
        rrpNumber: '',
        supplier: ''
    });
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [formData, setFormData] = useState<TransferFormData>({
        fromNacCode: '',
        toNacCode: '',
        transferQuantity: 0,
        transferDate: null
    });
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [nacCodeDropdownOpen, setNacCodeDropdownOpen] = useState(false);
    const [nacCodeSearchValue, setNacCodeSearchValue] = useState('');
    const [filteredNacCodes, setFilteredNacCodes] = useState<string[]>([]);
    const fetchingRef = useRef<boolean>(false);
    useEffect(() => {
        return () => {
            setIsTransferring(false);
            setIsTransferModalOpen(false);
            setSelectedItem(null);
            setFormData({
                fromNacCode: '',
                toNacCode: '',
                transferQuantity: 0,
                transferDate: null
            });
            setFormErrors({});
            setNacCodeDropdownOpen(false);
            setNacCodeSearchValue('');
            setFilteredNacCodes([]);
        };
    }, []);
    const fetchData = useCallback(async () => {
        if (fetchingRef.current)
            return;
        fetchingRef.current = true;
        try {
            setIsLoading(true);
            const [transferrableResponse, nacCodesResponse] = await Promise.all([
                API.get('/api/balance-transfer/transferrable-items'),
                API.get('/api/balance-transfer/existing-nac-codes')
            ]);
            if (transferrableResponse.status === 200) {
                setTransferrableItems(transferrableResponse.data);
            }
            if (nacCodesResponse.status === 200) {
                setExistingNacCodes(nacCodesResponse.data);
            }
        }
        catch {
            showErrorToastRef.current({
                title: "Error",
                message: "Failed to fetch data",
                duration: 3000,
            });
        }
        finally {
            setIsLoading(false);
            fetchingRef.current = false;
        }
    }, []);
    useEffect(() => {
        fetchData();
    }, [fetchData]);
    const filterAndPaginateItems = useCallback(() => {
        const filtered = transferrableItems.filter(item => {
            const nacCodeMatch = !searchQueries.nacCode ||
                item.nac_code.toLowerCase().includes(searchQueries.nacCode.toLowerCase());
            const itemNameMatch = !searchQueries.itemName ||
                item.item_name.toLowerCase().includes(searchQueries.itemName.toLowerCase());
            const partNumberMatch = !searchQueries.partNumber ||
                item.part_number.toLowerCase().includes(searchQueries.partNumber.toLowerCase());
            const rrpNumberMatch = !searchQueries.rrpNumber ||
                item.rrp_number.toLowerCase().includes(searchQueries.rrpNumber.toLowerCase());
            const supplierMatch = !searchQueries.supplier ||
                item.supplier_name.toLowerCase().includes(searchQueries.supplier.toLowerCase());
            return nacCodeMatch && itemNameMatch && partNumberMatch && rrpNumberMatch && supplierMatch;
        });
        setFilteredItems(filtered);
        setCurrentPage(1);
    }, [transferrableItems, searchQueries]);
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            filterAndPaginateItems();
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [searchQueries, transferrableItems, filterAndPaginateItems]);
    useEffect(() => {
        if (transferrableItems.length > 0) {
            filterAndPaginateItems();
        }
    }, [transferrableItems, currentPage, filterAndPaginateItems]);
    const handleSearchChange = useCallback((field: keyof typeof searchQueries, value: string) => {
        setSearchQueries(prev => ({ ...prev, [field]: value }));
    }, []);
    const clearSearch = useCallback(() => {
        setSearchQueries({
            nacCode: '',
            itemName: '',
            partNumber: '',
            rrpNumber: '',
            supplier: ''
        });
    }, []);
    const handleTransferClick = useCallback((item: TransferrableItem) => {
        setSelectedItem(item);
        setFormData({
            fromNacCode: item.nac_code,
            toNacCode: '',
            transferQuantity: 0,
            transferDate: null
        });
        setFormErrors({});
        setIsTransferModalOpen(true);
    }, []);
    const handleModalClose = useCallback(() => {
        setIsTransferModalOpen(false);
        setSelectedItem(null);
        setFormData({
            fromNacCode: '',
            toNacCode: '',
            transferQuantity: 0,
            transferDate: null
        });
        setFormErrors({});
    }, []);
    const handleFormChange = useCallback((field: keyof TransferFormData, value: string | number | Date | null) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (formErrors[field]) {
            setFormErrors(prev => ({ ...prev, [field]: '' }));
        }
    }, [formErrors]);
    const availableNacCodes = useMemo(() => {
        return existingNacCodes.filter(code => code !== formData.fromNacCode);
    }, [existingNacCodes, formData.fromNacCode]);
    const validateForm = useCallback((): boolean => {
        const errors: Record<string, string> = {};
        if (!formData.toNacCode) {
            errors.toNacCode = 'Destination NAC code is required';
        }
        if (formData.toNacCode === formData.fromNacCode) {
            errors.toNacCode = 'Cannot transfer to the same NAC code';
        }
        if (!formData.transferQuantity || formData.transferQuantity <= 0) {
            errors.transferQuantity = 'Transfer quantity must be greater than 0';
        }
        if (selectedItem && formData.transferQuantity > selectedItem.transferrable_quantity) {
            errors.transferQuantity = `Transfer quantity cannot exceed transferrable quantity (${selectedItem.transferrable_quantity})`;
        }
        if (!formData.transferDate) {
            errors.transferDate = 'Transfer date is required';
        }
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    }, [formData, selectedItem]);
    const handleTransfer = useCallback(async () => {
        if (!validateForm()) {
            return;
        }
        try {
            setIsTransferring(true);
            const response = await API.post('/api/balance-transfer/transfer', {
                fromNacCode: formData.fromNacCode,
                toNacCode: formData.toNacCode,
                transferQuantity: formData.transferQuantity,
                transferDate: formData.transferDate?.toISOString(),
                transferredBy: user?.UserInfo?.username || 'Unknown User'
            });
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: "Balance transferred successfully",
                    duration: 3000,
                });
                handleModalClose();
                setTimeout(() => {
                    fetchData();
                }, 100);
            }
        }
        catch (error: unknown) {
            const errorMessage = error && typeof error === 'object' && 'response' in error && error.response && typeof error.response === 'object' && 'data' in error.response && error.response.data && typeof error.response.data === 'object' && 'message' in error.response.data ? String(error.response.data.message) : 'Failed to transfer balance';
            showErrorToast({
                title: 'Error',
                message: errorMessage,
                duration: 3000,
            });
        }
        finally {
            setIsTransferring(false);
        }
    }, [formData, validateForm, user?.UserInfo?.username, showSuccessToast, showErrorToast, handleModalClose, fetchData]);
    const handleRefresh = useCallback(() => {
        fetchData();
    }, [fetchData]);
    const paginationData = useMemo(() => {
        const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const currentItems = filteredItems.slice(startIndex, endIndex);
        return { totalPages, startIndex, endIndex, currentItems };
    }, [filteredItems, currentPage, itemsPerPage]);
    const handlePageChange = useCallback((page: number) => {
        setCurrentPage(page);
    }, []);
    const filterNacCodes = useCallback((search: string) => {
        setNacCodeSearchValue(search);
        if (!search.trim()) {
            setFilteredNacCodes(availableNacCodes);
        }
        else {
            setFilteredNacCodes(availableNacCodes.filter(code => code.toLowerCase().includes(search.toLowerCase())));
        }
    }, [availableNacCodes]);
    useEffect(() => {
        if (availableNacCodes.length > 0) {
            setFilteredNacCodes(availableNacCodes);
        }
    }, [availableNacCodes]);
    const handleNacCodeSelect = useCallback((code: string) => {
        setFormData(prev => ({ ...prev, toNacCode: code }));
        setNacCodeDropdownOpen(false);
        setNacCodeSearchValue('');
        setFilteredNacCodes(availableNacCodes);
    }, [availableNacCodes]);
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Element;
            if (!target.closest('.nac-code-dropdown')) {
                setNacCodeDropdownOpen(false);
                setNacCodeSearchValue('');
                setFilteredNacCodes(availableNacCodes);
            }
        };
        if (nacCodeDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [nacCodeDropdownOpen, availableNacCodes]);
    if (isLoading) {
        return (<div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#003594] mx-auto mb-4"/>
          <p className="text-[#003594] font-medium">Loading Balance Transfer data...</p>
          <p className="text-sm text-gray-600 mt-2">Loading transferrable items and NAC codes</p>
        </div>
      </div>);
    }
    if (existingNacCodes.length === 0) {
        return (<div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-500 mb-4">
            <X className="h-12 w-12 mx-auto"/>
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Failed to load NAC codes</h2>
          <p className="text-gray-600 mb-4">Unable to load the list of available NAC codes.</p>
          <Button onClick={fetchData} className="bg-[#003594] hover:bg-[#002a6e] text-white">
            <RefreshCw className="h-4 w-4 mr-2"/>
            Retry
          </Button>
        </div>
      </div>);
    }
    return (<div className="container mx-auto p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
            Balance Transfer
          </h1>
          <Button onClick={handleRefresh} variant="outline" className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4"/>
            Refresh
          </Button>
        </div>

        <Card className="border-[#002a6e]/10 hover:border-[#d2293b]/20 transition-all duration-300 shadow-sm">
          <CardHeader className="bg-[#003594]/5 border-b border-[#002a6e]/10">
            <CardTitle className="text-lg font-semibold text-[#003594]">
              Transferrable Items
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            
            <div className="mb-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[#003594]">NAC Code</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400"/>
                    <Input value={searchQueries.nacCode} onChange={(e) => handleSearchChange('nacCode', e.target.value)} placeholder="Search by NAC code" className="pl-10 border-[#002a6e]/10 focus:ring-[#003594]"/>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[#003594]">Item Name</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400"/>
                    <Input value={searchQueries.itemName} onChange={(e) => handleSearchChange('itemName', e.target.value)} placeholder="Search by item name" className="pl-10 border-[#002a6e]/10 focus:ring-[#003594]"/>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[#003594]">Part Number</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400"/>
                    <Input value={searchQueries.partNumber} onChange={(e) => handleSearchChange('partNumber', e.target.value)} placeholder="Search by part number" className="pl-10 border-[#002a6e]/10 focus:ring-[#003594]"/>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[#003594]">RRP Number</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400"/>
                    <Input value={searchQueries.rrpNumber} onChange={(e) => handleSearchChange('rrpNumber', e.target.value)} placeholder="Search by RRP number" className="pl-10 border-[#002a6e]/10 focus:ring-[#003594]"/>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[#003594]">Supplier</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400"/>
                    <Input value={searchQueries.supplier} onChange={(e) => handleSearchChange('supplier', e.target.value)} placeholder="Search by supplier" className="pl-10 border-[#002a6e]/10 focus:ring-[#003594]"/>
                  </div>
                </div>
              </div>
              
              
              <div className="flex justify-end">
                <Button onClick={clearSearch} variant="outline" size="sm" className="flex items-center gap-2 text-gray-600 hover:text-gray-800">
                  <X className="h-4 w-4"/>
                  Clear Search
                </Button>
              </div>
            </div>

            
            <div className="mb-4 text-sm text-gray-600">
              Showing {paginationData.startIndex + 1}-{Math.min(paginationData.endIndex, filteredItems.length)} of {filteredItems.length} items
              {Object.values(searchQueries).some(q => q) && (<span className="ml-2 text-[#003594] font-medium">
                  (filtered from {transferrableItems.length} total)
                </span>)}
            </div>

            {filteredItems.length === 0 ? (<div className="text-center py-8 text-gray-500">
                {Object.values(searchQueries).some(q => q)
                ? 'No items match your search criteria'
                : 'No transferrable items found'}
              </div>) : (<>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[#003594]/5 border-b border-[#002a6e]/10">
                        <th className="text-left p-3 font-semibold text-[#003594]">NAC Code</th>
                        <th className="text-left p-3 font-semibold text-[#003594]">Item Name</th>
                        <th className="text-left p-3 font-semibold text-[#003594]">Part Number</th>
                        <th className="text-left p-3 font-semibold text-[#003594]">Received Qty</th>
                        <th className="text-left p-3 font-semibold text-[#003594]">Transferred Qty</th>
                        <th className="text-left p-3 font-semibold text-[#003594]">Transferrable Qty</th>
                        <th className="text-left p-3 font-semibold text-[#003594]">Total Amount</th>
                        <th className="text-left p-3 font-semibold text-[#003594]">RRP Number</th>
                        <th className="text-left p-3 font-semibold text-[#003594]">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginationData.currentItems.map((item) => (<tr key={item.id} className="border-b border-[#002a6e]/10 hover:bg-[#003594]/5">
                          <td className="p-3 font-medium">{item.nac_code}</td>
                          <td className="p-3">{item.item_name}</td>
                          <td className="p-3">{item.part_number}</td>
                          <td className="p-3">{item.received_quantity}</td>
                          <td className="p-3">{item.transferred_quantity}</td>
                          <td className="p-3 font-semibold text-green-600">{item.transferrable_quantity}</td>
                          <td className="p-3">Rs. {item.total_amount.toLocaleString()}</td>
                          <td className="p-3">{item.rrp_number}</td>
                          <td className="p-3">
                            <Button onClick={() => handleTransferClick(item)} size="sm" className="bg-[#003594] hover:bg-[#002a6e] text-white">
                              Transfer
                            </Button>
                          </td>
                        </tr>))}
                    </tbody>
                  </table>
                </div>

                
                {paginationData.totalPages > 1 && (<div className="flex items-center justify-between mt-6">
                    <div className="text-sm text-gray-600">
                      Page {currentPage} of {paginationData.totalPages}
                    </div>
                    <div className="flex items-center space-x-2">
                      <select value={itemsPerPage} onChange={(e) => {
                        setItemsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }} className="px-2 py-1 border border-[#002a6e]/10 rounded text-sm bg-white">
                        <option value={10}>10 / page</option>
                        <option value={20}>20 / page</option>
                        <option value={50}>50 / page</option>
                        <option value={100}>100 / page</option>
                      </select>
                      <Button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} variant="outline" size="sm" className="border-[#002a6e]/10 hover:border-[#003594] hover:bg-[#003594]/5">
                        Previous
                      </Button>
                      
                      {Array.from({ length: paginationData.totalPages }, (_, i) => i + 1).map((page) => (<Button key={page} onClick={() => handlePageChange(page)} variant={currentPage === page ? "default" : "outline"} size="sm" className={cn(currentPage === page
                        ? "bg-[#003594] text-white"
                        : "border-[#002a6e]/10 hover:border-[#003594] hover:bg-[#003594]/5")}>
                          {page}
                        </Button>))}
                      
                      <Button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === paginationData.totalPages} variant="outline" size="sm" className="border-[#002a6e]/10 hover:border-[#003594] hover:bg-[#003594]/5">
                        Next
                      </Button>
                    </div>
                  </div>)}
              </>)}
          </CardContent>
        </Card>

        
        {isTransferModalOpen && selectedItem && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={(e) => {
                if (e.target === e.currentTarget && !isTransferring) {
                    handleModalClose();
                }
            }}>
            <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto relative">
              
              {isTransferring && (<div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center rounded-lg z-10">
                  <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-[#003594]"/>
                    <p className="text-[#003594] font-medium">Processing transfer...</p>
                  </div>
                </div>)}
              
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[#003594]">
                  Transfer Balance
                </h3>
                <Button variant="ghost" size="sm" onClick={handleModalClose} disabled={isTransferring} className="h-6 w-6 p-0 hover:bg-gray-100 disabled:opacity-50">
                  <X className="h-4 w-4"/>
                </Button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">From NAC Code</Label>
                  <Input value={selectedItem.nac_code} disabled className="bg-gray-100"/>
                </div>

                <div>
                  <Label className="text-sm font-medium">To NAC Code *</Label>
                  <div className="relative nac-code-dropdown">
                    <Button type="button" variant="outline" role="combobox" aria-expanded={false} className="w-full justify-between border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20 disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => setNacCodeDropdownOpen(!nacCodeDropdownOpen)} disabled={isTransferring}>
                      {formData.toNacCode || "Select destination NAC code..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>
                    </Button>
                    {nacCodeDropdownOpen && (<div className="absolute w-full z-[9999] bg-white rounded-md border shadow-md mt-1">
                        <div className="w-full">
                          <div className="flex w-full items-center border-b px-3">
                            <Search className="h-4 w-4 text-gray-400 mr-2"/>
                            <input className="flex h-9 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50" placeholder="Search NAC codes..." value={nacCodeSearchValue} onChange={(e) => filterNacCodes(e.target.value)}/>
                          </div>
                          {filteredNacCodes.length === 0 ? (<p className="p-4 text-sm text-center text-muted-foreground">
                              No NAC codes found.
                            </p>) : (<div className="max-h-[200px] overflow-y-auto">
                              {filteredNacCodes.map((code) => (<div key={code} onClick={() => handleNacCodeSelect(code)} className={cn("relative flex w-full cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none", "hover:bg-accent hover:text-accent-foreground", formData.toNacCode === code && "bg-accent text-accent-foreground")}>
                                  <Check className={cn("mr-2 h-4 w-4 flex-shrink-0", formData.toNacCode === code ? "opacity-100" : "opacity-0")}/>
                                  {code}
                                </div>))}
                            </div>)}
                        </div>
                      </div>)}
                  </div>
                  {formErrors.toNacCode && (<p className="text-red-500 text-sm mt-1">{formErrors.toNacCode}</p>)}
                </div>

                <div>
                  <Label className="text-sm font-medium">Transfer Quantity *</Label>
                  <Input type="number" value={formData.transferQuantity || ''} onChange={(e) => handleFormChange('transferQuantity', parseInt(e.target.value) || 0)} min="1" max={selectedItem.transferrable_quantity} disabled={isTransferring} className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20 disabled:opacity-50 disabled:cursor-not-allowed"/>
                  <p className="text-sm text-gray-500 mt-1">
                    Max: {selectedItem.transferrable_quantity}
                  </p>
                  {formErrors.transferQuantity && (<p className="text-red-500 text-sm mt-1">{formErrors.transferQuantity}</p>)}
                </div>

                <div>
                  <Label className="text-sm font-medium">Transfer Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" disabled={isTransferring} className={cn("w-full justify-start text-left font-normal border-[#002a6e]/10 hover:border-[#003594] hover:bg-[#003594]/5 disabled:opacity-50 disabled:cursor-not-allowed", !formData.transferDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4"/>
                        {formData.transferDate ? format(formData.transferDate, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-white">
                      <Calendar value={formData.transferDate || undefined} onChange={(date: Date | null) => handleFormChange('transferDate', date)} className="rounded-md border border-[#002a6e]/10"/>
                    </PopoverContent>
                  </Popover>
                  {formErrors.transferDate && (<p className="text-red-500 text-sm mt-1">{formErrors.transferDate}</p>)}
                </div>

                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Transfer Cost:</strong> Rs. {formData.transferQuantity
                ? ((selectedItem.total_amount / selectedItem.received_quantity) * formData.transferQuantity).toLocaleString()
                : '0'}
                  </p>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <Button variant="outline" onClick={handleModalClose} className="border-[#d2293b]/20 hover:border-[#d2293b] hover:bg-[#d2293b]/5">
                  Cancel
                </Button>
                <Button onClick={handleTransfer} disabled={isTransferring} className="bg-[#003594] hover:bg-[#003594] text-white disabled:opacity-50 disabled:cursor-not-allowed">
                  {isTransferring ? (<>
                      <Loader2 className="h-4 w-4 animate-spin mr-2"/>
                      Transferring...
                    </>) : (<>
                      <ArrowRight className="h-4 w-4 mr-2"/>
                      Transfer
                    </>)}
                </Button>
              </div>
            </div>
          </div>)}
      </div>
    </div>);
}
