'use client';
import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IssueCartItem } from '@/types/issue';
import { Package, Hash, Scale, AlertCircle, RotateCcw, Info } from 'lucide-react';
import { PartNumberSelect } from '@/components/request/PartNumberSelect';
import { EquipmentRangeSelect } from '@/components/request/EquipmentRangeSelect';
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
                title: "Error",
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
                    title: "Success",
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
                title: "Error",
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
    const isConsumable = item.equipmentNumber.toLowerCase().includes('consumable');
    const hasActiveBorrows = activeBorrows.length > 0;
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
        else if (quantityNum > item.currentBalance) {
            newErrors.quantity = 'Quantity cannot exceed current balance';
        }
        if (!selectedEquipment) {
            newErrors.equipment = 'Please select an equipment';
        }
        if (!selectedPartNumber) {
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
            id: item.id,
            nacCode: item.nacCode,
            itemName: item.itemName,
            quantity: item.currentBalance,
            equipmentNumber: item.equipmentNumber,
            currentBalance: item.currentBalance,
            partNumber: selectedPartNumber,
            selectedEquipment,
            issueQuantity: parseFloat(quantity),
        });
        setQuantity('');
        setSelectedEquipment('');
        setSelectedPartNumber('');
        setErrors({});
    };
    const hasPartNumber = item.partNumber && item.partNumber.trim() !== '';
    return (<Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-white">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
            Add Item to Issue Cart
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            Review and confirm item details before adding to cart
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          
          <div className="bg-gray-50 rounded-lg p-4 border border-[#002a6e]/10">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-[#003594]"/>
                <h3 className="font-semibold text-gray-900">{item.itemName}</h3>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">NAC Code:</span>
                  <span className="ml-2 font-medium text-[#003594]">{item.nacCode}</span>
                </div>
                <div>
                  <span className="text-gray-500">Current Balance:</span>
                  <span className="ml-2 font-medium text-[#003594]">{item.currentBalance}</span>
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
          </div>

          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="quantity" className="text-sm font-medium text-[#003594]">
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4"/>
                  Quantity
                </div>
              </Label>
              <div className="relative">
            <Input id="quantity" type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={`${errors.quantity ? "border-red-500 focus-visible:ring-red-500" : "border-[#002a6e]/10 focus-visible:ring-[#003594]"}`} placeholder="Enter quantity"/>
            {errors.quantity && (<div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <AlertCircle className="h-4 w-4 text-red-500"/>
                  </div>)}
          </div>
              {errors.quantity && (<p className="text-sm text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3"/>
                  {errors.quantity}
                </p>)}
          </div>

            <div className="space-y-2">
              <Label htmlFor="partNumber" className="text-sm font-medium text-[#003594]">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4"/>
                  Part Number
                </div>
              </Label>
              <div className="relative">
            {hasPartNumber ? (<PartNumberSelect partNumberList={item.partNumber} value={selectedPartNumber} onChange={setSelectedPartNumber} error={errors.partNumber}/>) : (<Input id="partNumber" value="NA" disabled className="bg-gray-100 border-[#002a6e]/10"/>)}
              </div>
              {errors.partNumber && (<p className="text-sm text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3"/>
                  {errors.partNumber}
                </p>)}
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment" className="text-sm font-medium text-[#003594]">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4"/>
                  Equipment Number
                </div>
              </Label>
              <div className="relative">
                {isConsumable ? (<Input value={selectedEquipment} onChange={(e) => setSelectedEquipment(e.target.value)} placeholder="Enter equipment number" className={`w-full ${errors.equipment ? "border-red-500" : "border-[#002a6e]/10 focus:border-[#003594]"}`}/>) : (<EquipmentRangeSelect equipmentList={item.equipmentNumber} value={selectedEquipment} onChange={setSelectedEquipment} error={errors.equipment}/>)}
              </div>
              {errors.equipment && (<p className="text-sm text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3"/>
                  {errors.equipment}
                </p>)}
            </div>
          </div>
        </div>

        <DialogFooter className="pt-4 border-t border-[#002a6e]/10">
          <Button variant="outline" onClick={onClose} className="border-[#002a6e]/10 hover:bg-gray-50">
            Cancel
          </Button>
          <Button onClick={handleSubmit} className="bg-[#003594] hover:bg-[#d2293b] text-white transition-colors">
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
