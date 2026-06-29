'use client';
import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IssueCartItem } from '@/types/issue';
import { StockVariant } from '@/types/search';
import { Package, Hash, Scale, AlertCircle, RotateCcw, Info, Layers } from 'lucide-react';
import { PartNumberSelect } from '@/components/request/PartNumberSelect';
import { IssueEquipmentSelect } from '@/components/issue/IssueEquipmentSelect';
import { findVariantByPartHint } from '@/utils/partNumberUtils';
import { isEquipmentOutsideApplicable } from '@/utils/issueEquipmentUtils';
import { stripSuffixFromNac } from '@/utils/nacCodeUtils';
import { Badge } from '@/components/ui/badge';
import { API } from '@/lib/api';
import { useAuthContext } from '@/context/AuthContext';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/utils/utils';
import { format } from 'date-fns';
interface IssueItemFormProps {
    isOpen: boolean;
    onClose: () => void;
    item: IssueCartItem | null;
    onSubmit: (item: IssueCartItem) => void;
}
interface ActiveBorrow {
    receiveId: number;
    receiveDate: string;
    borrowDate: string;
    receivedQuantity: number;
    unit: string;
    approvalStatus: string;
    borrowStatus: string;
    borrowReferenceNumber: string | null;
    borrowSourceName: string | null;
    borrowSourceCode: string | null;
    createdAt: string;
}
export function IssueItemForm({ isOpen, onClose, item, onSubmit }: IssueItemFormProps) {
    const { user, permissions } = useAuthContext();
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const canBorrowStocks = permissions?.includes('can_borrow_stocks');
    const [quantity, setQuantity] = useState<string>('');
    const [selectedEquipment, setSelectedEquipment] = useState('');
    const [selectedPartNumber, setSelectedPartNumber] = useState('');
    const [errors, setErrors] = useState<{
        quantity?: string;
        equipment?: string;
        partNumber?: string;
    }>({});
    const [activeBorrows, setActiveBorrows] = useState<ActiveBorrow[]>([]);
    const [loadingBorrows, setLoadingBorrows] = useState(false);
    const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
    const [selectedBorrow, setSelectedBorrow] = useState<ActiveBorrow | null>(null);
    const [returnDate, setReturnDate] = useState<Date | undefined>(undefined);
    const [isReturning, setIsReturning] = useState(false);
    const [isReturnDateOpen, setIsReturnDateOpen] = useState(false);
    const [sections, setSections] = useState<{ id: number; name: string; code: string }[]>([]);
    const [variants, setVariants] = useState<StockVariant[]>([]);
    const [selectedVariantId, setSelectedVariantId] = useState<string>('');
    const [loadingVariants, setLoadingVariants] = useState(false);
    const fetchActiveSections = useCallback(async () => {
        try {
            const res = await API.get('/api/settings/issue/sections/active');
            setSections(res.data || []);
        } catch {
            setSections([]);
        }
    }, []);
    useEffect(() => { fetchActiveSections(); }, [fetchActiveSections]);

    useEffect(() => {
        if (isOpen && item) {
            setSelectedEquipment(item.selectedEquipment || '');
            setQuantity('');
            setErrors({});
        }
    }, [isOpen, item]);

    useEffect(() => {
        const loadVariants = async () => {
            if (!isOpen || !item?.nacCode) {
                setVariants([]);
                return;
            }
            setLoadingVariants(true);
            try {
                const res = await API.get(`/api/stock/family/${encodeURIComponent(item.nacCode)}`);
                const loaded: StockVariant[] = res.data?.variants || [];
                setVariants(loaded);
                const preferred = findVariantByPartHint(
                    loaded,
                    item?.preferredPartNumber || item?.partNumber,
                    item?.id ? Number(item.id) : null
                );
                if (preferred) {
                    setSelectedVariantId(String(preferred.id));
                    setSelectedPartNumber(preferred.partNumber);
                } else if (loaded.length === 1) {
                    setSelectedVariantId(String(loaded[0].id));
                    setSelectedPartNumber(loaded[0].partNumber);
                } else {
                    setSelectedVariantId('');
                    setSelectedPartNumber('');
                }
            } catch {
                setVariants([]);
            } finally {
                setLoadingVariants(false);
            }
        };
        loadVariants();
    }, [isOpen, item?.nacCode, item?.id, item?.preferredPartNumber, item?.partNumber]);

    const fetchActiveBorrows = useCallback(async () => {
        if (!item?.nacCode)
            return;
        setLoadingBorrows(true);
        try {
            const response = await API.get(`/api/borrow-receive/active/${item.nacCode}`);
            if (response.status === 200) {
                setActiveBorrows(response.data.data || []);
            }
        }
        catch {
            setActiveBorrows([]);
        }
        finally {
            setLoadingBorrows(false);
        }
    }, [item?.nacCode]);
    useEffect(() => {
        if (isOpen && item && canBorrowStocks) {
            fetchActiveBorrows();
        }
        else {
            setActiveBorrows([]);
        }
    }, [isOpen, item?.nacCode, canBorrowStocks, fetchActiveBorrows, item]);
    const handleReturnClick = (borrow: ActiveBorrow) => {
        setSelectedBorrow(borrow);
        setReturnDate(undefined);
        setIsReturnModalOpen(true);
    };
    const handleReturnItem = async () => {
        if (!selectedBorrow || !returnDate || !user) {
            showErrorToast({
                title: 'Error',
                message: "Please select a return date",
                duration: 3000,
            });
            return;
        }
        setIsReturning(true);
        try {
            const response = await API.post('/api/borrow-receive/return', {
                borrowReceiveId: selectedBorrow.receiveId,
                returnDate: format(returnDate, 'yyyy-MM-dd'),
                receivedBy: user.UserInfo.username
            });
            if (response.status === 201) {
                showSuccessToast({
                    title: 'Success',
                    message: "Item return submitted successfully. Awaiting approval.",
                    duration: 3000,
                });
                setIsReturnModalOpen(false);
                setSelectedBorrow(null);
                setReturnDate(undefined);
                fetchActiveBorrows();
            }
        }
        catch (error: unknown) {
            const err = error as {
                response?: {
                    data?: {
                        message?: string;
                    };
                };
            };
            showErrorToast({
                title: 'Error',
                message: err?.response?.data?.message || 'Failed to return item',
                duration: 3000,
            });
        }
        finally {
            setIsReturning(false);
        }
    };
    if (!item)
        return null;
    const hasActiveBorrows = activeBorrows.length > 0;
    const selectedVariant = variants.find(v => String(v.id) === selectedVariantId);
    const validateForm = (): boolean => {
        const newErrors: {
            quantity?: string;
            equipment?: string;
            partNumber?: string;
        } = {};
        const quantityNum = parseFloat(quantity);
        if (!quantity || isNaN(quantityNum)) {
            newErrors.quantity = 'Please enter a valid quantity';
        }
        else if (quantityNum <= 0) {
            newErrors.quantity = 'Quantity must be greater than 0';
        }
        const variantBalance = selectedVariant
            ? Number(selectedVariant.virtualBalance)
            : Number(item.virtualBalance ?? 0);
        if (quantityNum > variantBalance) {
            newErrors.quantity = 'Quantity cannot exceed available virtual balance';
        }
        if (!selectedEquipment) {
            newErrors.equipment = 'Please select an equipment';
        }
        if (variants.length > 1 && !selectedVariantId) {
            newErrors.partNumber = 'Please select a part variant';
        }
        else if (!selectedPartNumber) {
            newErrors.partNumber = 'Please select a part number';
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };
    const handleSubmit = () => {
        if (!validateForm()) {
            return;
        }
        onSubmit({
            id: selectedVariant ? String(selectedVariant.id) : item.id,
            nacCode: selectedVariant?.nacCode || item.nacCode,
            itemName: item.itemName,
            quantity: parseFloat(quantity),
            equipmentNumber: item.equipmentNumber,
            currentBalance: selectedVariant ? Number(selectedVariant.virtualBalance) : Number(item.virtualBalance ?? 0),
            partNumber: selectedPartNumber,
            selectedEquipment,
            issueQuantity: parseFloat(quantity),
            virtualBalance: selectedVariant?.virtualBalance ?? item.virtualBalance,
            trueBalance: selectedVariant?.trueBalance ?? item.trueBalance,
        });
        setQuantity('');
        setSelectedEquipment('');
        setSelectedPartNumber('');
        setErrors({});
    };
    const hasPartNumber = variants.length > 0 || (item.partNumber && item.partNumber.trim() !== '');
    const equipmentOutsideApplicable = isEquipmentOutsideApplicable(
        selectedEquipment,
        item.equipmentNumber,
        sections.map((s) => s.code)
    );
    return (<Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-white">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
            Add to Issue Cart
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            Confirm quantity, part variant, and equipment before issuing
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="rounded-xl border border-[#002a6e]/10 bg-gradient-to-br from-slate-50 to-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-[#003594] shrink-0"/>
                  <h3 className="font-semibold text-gray-900 truncate">{item.itemName}</h3>
                </div>
                <p className="text-sm text-gray-600">
                  Family: <span className="font-mono font-medium text-[#003594]">{stripSuffixFromNac(item.nacCode)}</span>
                  {selectedVariant && selectedVariant.nacCode !== stripSuffixFromNac(item.nacCode) && (
                    <> · Sub-code: <span className="font-mono font-medium">{selectedVariant.nacCode}</span></>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-800">
                  Virtual: {selectedVariant?.virtualBalance ?? item.virtualBalance ?? '—'}
                </Badge>
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                  True: {selectedVariant?.trueBalance ?? item.trueBalance ?? '—'}
                </Badge>
              </div>
            </div>
              
              {canBorrowStocks && (<div className="mt-3 pt-3 border-t border-gray-200">
                  {loadingBorrows ? (<div className="text-xs text-gray-500">Checking borrow status...</div>) : hasActiveBorrows ? (<div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Info className="h-4 w-4 text-blue-600"/>
                        <span className="text-xs font-medium text-blue-600">This item is currently borrowed</span>
                      </div>
                      {activeBorrows.map((borrow) => (<div key={borrow.receiveId} className="bg-blue-50 rounded p-2 text-xs">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-gray-900">
                                {borrow.borrowSourceName || 'Unknown Source'}
                                {borrow.borrowSourceCode && ` (${borrow.borrowSourceCode})`}
                              </p>
                              <p className="text-gray-600">
                                Borrowed: {borrow.borrowDate && new Date(borrow.borrowDate).toLocaleDateString()} | 
                                Qty: {borrow.receivedQuantity} {borrow.unit}
                              </p>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => handleReturnClick(borrow)} className="flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-100 text-xs h-7">
                              <RotateCcw className="h-3 w-3"/>
                              Return
                            </Button>
                          </div>
                        </div>))}
                    </div>) : (<div className="text-xs text-gray-500">No active borrows for this item</div>)}
                </div>)}
          </div>

          {variants.length > 1 && (
            <div className="rounded-xl border border-[#002a6e]/10 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-[#002a6e]/10 flex items-center gap-2">
                <Layers className="h-4 w-4 text-[#003594]"/>
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">Part variant *</span>
              </div>
              <div className="p-3 space-y-2 max-h-[200px] overflow-y-auto">
                {loadingVariants ? (
                  <p className="text-sm text-gray-500 px-1">Loading variants…</p>
                ) : (
                  variants.map((v) => {
                    const isSelected = selectedVariantId === String(v.id);
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          setSelectedVariantId(String(v.id));
                          setSelectedPartNumber(v.partNumber);
                        }}
                        className={cn(
                          'w-full flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                          isSelected
                            ? 'border-[#003594] bg-[#003594]/5 ring-1 ring-[#003594]/20'
                            : 'border-slate-200 hover:border-[#003594]/30 bg-white'
                        )}
                      >
                        <div>
                          <p className="font-mono font-semibold text-[#003594]">{v.nacCode}</p>
                          <p className="text-gray-700">{v.partNumber}</p>
                        </div>
                        <div className="text-right text-xs text-gray-500">
                          <p>True: <span className="font-semibold text-emerald-700">{v.trueBalance}</span></p>
                          <p>Virtual: <span className="font-semibold text-sky-700">{v.virtualBalance}</span></p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
              {errors.partNumber && (
                <p className="px-4 pb-3 text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3"/>{errors.partNumber}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity" className="text-sm font-medium text-[#003594] flex items-center gap-2">
                <Scale className="h-4 w-4"/> Issue quantity *
              </Label>
              <Input
                id="quantity"
                type="number"
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={cn(errors.quantity ? 'border-red-500' : 'border-[#002a6e]/10')}
                placeholder="Enter quantity"
                max={selectedVariant ? selectedVariant.virtualBalance : item.virtualBalance}
              />
              <p className="text-xs text-gray-500">
                Max (virtual balance): {selectedVariant?.virtualBalance ?? item.virtualBalance ?? '—'}
              </p>
              {errors.quantity && (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3"/>{errors.quantity}
                </p>
              )}
            </div>

            {variants.length <= 1 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-[#003594] flex items-center gap-2">
                  <Hash className="h-4 w-4"/> Part number
                </Label>
                {hasPartNumber ? (
                  <PartNumberSelect
                    partNumberList={variants.length === 1 ? variants[0].partNumber : item.partNumber}
                    value={selectedPartNumber}
                    onChange={setSelectedPartNumber}
                    error={errors.partNumber}
                  />
                ) : (
                  <Input value="NA" disabled className="bg-gray-100"/>
                )}
                {errors.partNumber && variants.length <= 1 && (
                  <p className="text-sm text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3"/>{errors.partNumber}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-[#003594] flex items-center gap-2">
              <Hash className="h-4 w-4"/> Equipment / Section *
            </Label>
            <IssueEquipmentSelect
              value={selectedEquipment}
              onChange={setSelectedEquipment}
              sections={sections}
              error={errors.equipment}
            />
            <p className="text-xs text-gray-500">
              Search any registered asset or issue section. Equipment not on this item&apos;s applicable list will be flagged for approver review.
            </p>
            {equipmentOutsideApplicable && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5"/>
                <span>
                  <strong>{selectedEquipment}</strong> is not on this item&apos;s applicable equipment list.
                  If approved, it will be added automatically.
                </span>
              </div>
            )}
            {errors.equipment && (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <AlertCircle className="h-3 w-3"/>{errors.equipment}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="pt-4 border-t border-[#002a6e]/10 gap-2">
          <Button variant="outline" onClick={onClose} className="border-[#002a6e]/10">
            Cancel
          </Button>
          <Button onClick={handleSubmit} className="bg-[#003594] hover:bg-[#002a6e] text-white">
            Add to Cart
          </Button>
        </DialogFooter>
      </DialogContent>

      
      <Dialog open={isReturnModalOpen} onOpenChange={setIsReturnModalOpen}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>Return Borrowed Item</DialogTitle>
            <DialogDescription>
              Return the borrowed item: {item?.itemName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Item Details</p>
              <div className="bg-gray-50 p-3 rounded-lg space-y-1">
                <p className="text-sm"><span className="font-medium">Item:</span> {item?.itemName}</p>
                <p className="text-sm"><span className="font-medium">NAC Code:</span> {item?.nacCode}</p>
                {selectedBorrow && (<>
                    <p className="text-sm"><span className="font-medium">Quantity:</span> {selectedBorrow.receivedQuantity} {selectedBorrow.unit}</p>
                    <p className="text-sm"><span className="font-medium">Source:</span> {selectedBorrow.borrowSourceName}</p>
                    <p className="text-sm"><span className="font-medium">Borrow Date:</span> {selectedBorrow.borrowDate && new Date(selectedBorrow.borrowDate).toLocaleDateString()}</p>
                  </>)}
              </div>
            </div>
            <div>
              <Label>Return Date *</Label>
              <Popover open={isReturnDateOpen} onOpenChange={setIsReturnDateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full mt-1 justify-start text-left font-normal bg-white", !returnDate && "text-muted-foreground")}>
                    {returnDate ? format(returnDate, 'PPP') : 'Select return date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-white" align="start">
                  <Calendar value={returnDate} onChange={(date) => {
            setReturnDate(date || undefined);
            setIsReturnDateOpen(false);
        }}/>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReturnModalOpen(false)} disabled={isReturning}>
              Cancel
            </Button>
            <Button onClick={handleReturnItem} disabled={!returnDate || isReturning} className="bg-[#003594] text-white hover:bg-[#002a6e]">
              {isReturning ? 'Returning...' : 'Submit Return'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>);
}
