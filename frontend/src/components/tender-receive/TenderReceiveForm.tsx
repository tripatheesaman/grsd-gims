'use client';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { API } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TenderReceiveCartItem } from '@/types/tender-receive';
import { SearchResult } from '@/types/search';
import { Loader2 } from 'lucide-react';
import { PartNumberSelect } from '@/components/request/PartNumberSelect';
import { useCustomToast } from '@/components/ui/custom-toast';
import { processItemName } from '@/utils/utils';
interface TenderReceiveItemFormProps {
    isOpen: boolean;
    onClose: () => void;
    item: SearchResult | null;
    onSubmit: (item: TenderReceiveCartItem) => void;
    isManualEntry: boolean;
    isBorrowReceive?: boolean;
}
export const TenderReceiveItemForm = ({ isOpen, onClose, item, onSubmit, isManualEntry = false, isBorrowReceive = false }: TenderReceiveItemFormProps) => {
    const { showErrorToast } = useCustomToast();
    const [formData, setFormData] = useState<TenderReceiveCartItem>({
        id: '',
        nacCode: '',
        partNumber: '',
        itemName: '',
        receiveQuantity: 0,
        equipmentNumber: '',
        image: undefined,
        unit: '',
        location: '',
        cardNumber: '',
        isNewItem: false,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCustomPartNumber, setIsCustomPartNumber] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [initialLocation, setInitialLocation] = useState('');
    const [initialCardNumber, setInitialCardNumber] = useState('');
    const [equipmentNumber, setEquipmentNumber] = useState<string>('');
    useEffect(() => {
        if (item) {
            setFormData({
                id: item.id.toString(),
                nacCode: item.nacCode,
                partNumber: item.partNumber || '',
                itemName: processItemName(item.itemName),
                equipmentNumber: item.equipmentNumber || '',
                receiveQuantity: 0,
                image: undefined,
                unit: item.unit || '',
                location: item.location || '',
                cardNumber: item.cardNumber || '',
            });
            setEquipmentNumber(item.equipmentNumber || '');
            setIsCustomPartNumber(!item.partNumber);
            setInitialLocation(item.location);
            setInitialCardNumber(item.cardNumber);
        }
        if (!item && isManualEntry) {
            setFormData(prev => ({
                ...prev,
                isNewItem: true,
                nacCode: '',
                partNumber: '',
                itemName: '',
                unit: ''
            }));
            setIsCustomPartNumber(true);
        }
    }, [item, isManualEntry]);
    const validateForm = () => {
        const newErrors: Record<string, string> = {};
        if (isBorrowReceive) {
            if (!formData.receiveQuantity || formData.receiveQuantity <= 0) {
                newErrors.receiveQuantity = 'Valid receive quantity is required';
            }
            setErrors(newErrors);
            return Object.keys(newErrors).length === 0;
        }
        if (!formData.partNumber.trim()) {
            newErrors.partNumber = 'Part number is required';
        }
        if (!formData.location.trim()) {
            newErrors.location = 'Location is required';
        }
        if (!formData.cardNumber.trim()) {
            newErrors.cardNumber = 'Card number is required';
        }
        if (!formData.image) {
            newErrors.image = 'Item image is required';
        }
        if (!formData.receiveQuantity || formData.receiveQuantity <= 0) {
            newErrors.receiveQuantity = 'Valid receive quantity is required';
        }
        if (!formData.nacCode || !/^(GT|TW|GS) \d{5}$/.test(formData.nacCode)) {
            newErrors.nacCode = 'NAC code must be in format: GT/TW/GS followed by 5 digits (e.g., GT 12345)';
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm()) {
            showErrorToast({
                title: "Validation Error",
                message: "Please fill in all required fields",
                duration: 3000,
            });
            return;
        }
        setIsSubmitting(true);
        try {
            if (isManualEntry && formData.nacCode.trim()) {
                try {
                    const res = await API.get('/api/search/stock', {
                        params: { universal: formData.nacCode.trim(), page: 1, pageSize: 5 }
                    });
                    const results: {
                        nacCode?: string;
                    }[] = Array.isArray(res?.data?.data) ? res.data.data : [];
                    const exists = results.some((it) => (it.nacCode || '').toLowerCase() === formData.nacCode.trim().toLowerCase());
                    if (exists) {
                        showErrorToast({
                            title: 'Duplicate NAC Code',
                            message: `NAC Code ${formData.nacCode.trim()} already exists. Please choose a new NAC Code.`,
                            duration: 4000,
                        });
                        setIsSubmitting(false);
                        return;
                    }
                }
                catch {
                    showErrorToast({
                        title: 'Validation Error',
                        message: 'Could not verify NAC Code uniqueness. Please try again.',
                        duration: 4000,
                    });
                    setIsSubmitting(false);
                    return;
                }
            }
            const submitData = {
                ...formData,
                equipmentNumber: equipmentNumber,
                ...(isBorrowReceive && item ? {
                    nacCode: item.nacCode || formData.nacCode,
                    partNumber: item.partNumber || formData.partNumber,
                    itemName: processItemName(item.itemName) || formData.itemName,
                    unit: item.unit || formData.unit,
                    location: item.location || formData.location,
                    cardNumber: item.cardNumber || formData.cardNumber,
                } : {})
            };
            await onSubmit(submitData);
            onClose();
        }
        catch {
        }
        finally {
            setIsSubmitting(false);
        }
    };
    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setFormData(prev => ({ ...prev, image: file }));
        }
    };
    return (<Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl w-[95vw] bg-white">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
            Receive Item Details
          </DialogTitle>
          <p className="text-sm text-gray-500 mt-1">
            Review and confirm the item details before receiving
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {isBorrowReceive ? (<div className="space-y-4">
              <div>
                <Label htmlFor="receiveQuantity" className="text-sm font-medium text-[#003594]">Receive Quantity *</Label>
                <Input id="receiveQuantity" type="number" value={formData.receiveQuantity} onChange={(e) => setFormData(prev => ({ ...prev, receiveQuantity: Number(e.target.value) }))} className={`mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20 ${errors.receiveQuantity ? 'border-red-500' : ''}`} min="1" required/>
                {errors.receiveQuantity && (<p className="text-sm text-red-500 mt-1">{errors.receiveQuantity}</p>)}
              </div>
            </div>) : (<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="nacCode" className="text-sm font-medium text-[#003594]">NAC Code *</Label>
                  <Input id="nacCode" value={formData.nacCode} onChange={(e) => setFormData(prev => ({ ...prev, nacCode: e.target.value }))} className={`mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20 ${errors.nacCode ? 'border-red-500' : ''}`} placeholder="e.g., GT 12345" required disabled={!isManualEntry}/>
                  {errors.nacCode && (<p className="text-sm text-red-500 mt-1">{errors.nacCode}</p>)}
                </div>

                <div>
                  <Label htmlFor="partNumber" className="text-sm font-medium text-[#003594]">Part Number *</Label>
                  <div className="flex gap-2">
                    {(!isCustomPartNumber && !isManualEntry) ? (<PartNumberSelect partNumberList={item?.partNumber || ""} value={formData.partNumber} onChange={(value) => setFormData(prev => ({ ...prev, partNumber: value }))} error={errors.partNumber} disabled={item?.partNumber !== 'N/A'}/>) : (<Input id="partNumber" value={formData.partNumber} onChange={(e) => setFormData(prev => ({ ...prev, partNumber: e.target.value }))} className={`mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20 ${errors.partNumber ? 'border-red-500' : ''}`} placeholder="Enter part number" required/>)}
                    <Button type="button" variant="outline" onClick={() => setIsCustomPartNumber(!isCustomPartNumber)} className="whitespace-nowrap">
                      {isCustomPartNumber ? "Select Existing" : "Enter New"}
                    </Button>
                  </div>
                  {errors.partNumber && (<p className="text-sm text-red-500 mt-1">{errors.partNumber}</p>)}
                </div>

                <div>
                  <Label htmlFor="itemName" className="text-sm font-medium text-[#003594]">Item Name</Label>
                  <Input id="itemName" value={formData.itemName} onChange={(e) => setFormData(prev => ({ ...prev, itemName: e.target.value }))} className="mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20" readOnly={!isManualEntry} required/>
                </div>

                <div>
                  <Label htmlFor="equipmentNumber" className="text-sm font-medium text-[#003594]">Equipment Number</Label>
                
                    <Input id="equipmentNumber" value={equipmentNumber} onChange={(e) => setEquipmentNumber(e.target.value)} placeholder="Enter equipment number (e.g., 1000-1024 or 1000,1001,1002)" className={`mt-1 ${errors.equipmentNumber ? "border-red-500" : "border-[#002a6e]/10 focus:border-[#003594]"}`}/>


                  {errors.equipmentNumber && <p className="text-sm text-red-500">{errors.equipmentNumber}</p>}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="receiveQuantity" className="text-sm font-medium text-[#003594]">Receive Quantity *</Label>
                  <Input id="receiveQuantity" type="number" value={formData.receiveQuantity} onChange={(e) => setFormData(prev => ({ ...prev, receiveQuantity: Number(e.target.value) }))} className={`mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20 ${errors.receiveQuantity ? 'border-red-500' : ''}`} min="1" required/>
                  {errors.receiveQuantity && (<p className="text-sm text-red-500 mt-1">{errors.receiveQuantity}</p>)}
                </div>

                <div>
                  <Label htmlFor="unit" className="text-sm font-medium text-[#003594]">Unit</Label>
                  <Input id="unit" value={formData.unit} onChange={(e) => setFormData(prev => ({ ...prev, unit: e.target.value }))} className={`mt-1 border-[#002a6e]/10 ${isManualEntry ? '' : 'bg-gray-50'}`} readOnly={!isManualEntry} required/>
                </div>

                <div>
                  <Label htmlFor="location" className="text-sm font-medium text-[#003594]">Location *</Label>
                  <Input id="location" value={formData.location} onChange={(e) => {
                setFormData(prev => ({
                    ...prev,
                    location: e.target.value,
                    isLocationChanged: true
                }));
            }} className={`mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20 ${errors.location ? 'border-red-500' : ''}`} placeholder="Enter location" required disabled={!(!initialLocation || initialLocation.trim() === '' || initialLocation === '0')}/>
                  {errors.location && (<p className="text-sm text-red-500 mt-1">{errors.location}</p>)}
                </div>

                <div>
                  <Label htmlFor="cardNumber" className="text-sm font-medium text-[#003594]">Card Number *</Label>
                  <Input id="cardNumber" value={formData.cardNumber} onChange={(e) => {
                setFormData(prev => ({
                    ...prev,
                    cardNumber: e.target.value,
                    isCardNumberChanged: true
                }));
            }} className={`mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20 ${errors.cardNumber ? 'border-red-500' : ''}`} placeholder="Enter card number" required disabled={!(!initialCardNumber || initialCardNumber.trim() === '' || initialCardNumber === '0')}/>
                  {errors.cardNumber && (<p className="text-sm text-red-500 mt-1">{errors.cardNumber}</p>)}
                </div>

                <div>
                  <Label htmlFor="image" className="text-sm font-medium text-[#003594]">Item Image *</Label>
                  <div className="mt-1">
                    <Input id="image" type="file" accept="image/*" onChange={handleImageChange} className={`border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-[#003594] file:text-white hover:file:bg-[#d2293b] transition-colors ${errors.image ? 'border-red-500' : ''}`} required/>
                  </div>
                  {errors.image && (<p className="text-sm text-red-500 mt-1">{errors.image}</p>)}
                </div>
              </div>
            </div>)}

          <div className="flex justify-end gap-4 pt-4 border-t border-[#002a6e]/10">
            <Button type="button" variant="outline" onClick={onClose} className="border-[#002a6e]/10 hover:bg-[#003594]/5 hover:text-[#003594] transition-colors">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-[#003594] hover:bg-[#d2293b] text-white transition-colors">
              {isSubmitting ? (<>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                  Receiving...
                </>) : ('Receive Item')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>);
};
