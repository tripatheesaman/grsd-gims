'use client';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RequestCartItem } from '@/types/request';
import { SearchResult } from '@/types/search';
import { PartNumberSelect } from './PartNumberSelect';
import { EquipmentMultiSelect } from './EquipmentMultiSelect';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { expandEquipmentNumbers } from '@/utils/equipmentNumbers';
import imageCompression from 'browser-image-compression';
import { processItemName } from '@/utils/utils';
import { useAuthContext } from '@/context/AuthContext';
import { API } from '@/lib/api';
import { useRequestingAuthorities } from '@/app/request/useRequestingAuthorities';
interface RequestItemFormProps {
    isOpen: boolean;
    onClose: () => void;
    item: SearchResult | null;
    onSubmit: (item: RequestCartItem) => void;
    isManualEntry?: boolean;
}
export function RequestItemForm({ isOpen, onClose, item, onSubmit, isManualEntry = false }: RequestItemFormProps) {
    const { permissions } = useAuthContext();
    const canEditUnit = permissions?.includes('can_edit_unit_during_request');
    const { data: authorityOptions, isLoading: isLoadingAuthorities, error: authoritiesError } = useRequestingAuthorities();
    const [requestQuantity, setRequestQuantity] = useState<number>(1);
    const [partNumber, setPartNumber] = useState<string>('');
    const [equipmentNumber, setEquipmentNumber] = useState<string>('');
    const [specifications, setSpecifications] = useState<string>('');
    const [image, setImage] = useState<File | null>(null);
    const [itemName, setItemName] = useState<string>('');
    const [unit, setUnit] = useState<string>('');
    const [availableUnits, setAvailableUnits] = useState<string[]>([]);
    const [isLoadingUnits, setIsLoadingUnits] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [requestedById, setRequestedById] = useState<number | null>(null);
    const [requestedByEmail, setRequestedByEmail] = useState<string | null>(null);
    useEffect(() => {
        const fetchAvailableUnits = async () => {
            if (!item?.nacCode || item.nacCode === 'N/A') {
                setAvailableUnits([]);
                return;
            }
            setIsLoadingUnits(true);
            try {
                const response = await API.get(`/api/nac-units/nac/${encodeURIComponent(item.nacCode)}`);
                if (response.status === 200 && response.data.units) {
                    setAvailableUnits(response.data.units);
                    if (!unit && response.data.defaultUnit) {
                        setUnit(response.data.defaultUnit);
                    }
                }
                else {
                    setAvailableUnits([]);
                }
            }
            catch {
                setAvailableUnits([]);
            }
            finally {
                setIsLoadingUnits(false);
            }
        };
        fetchAvailableUnits();
    }, [item?.nacCode, unit]);
    useEffect(() => {
        if (item) {
            setItemName(processItemName(item.itemName));
            if (item.nacCode === 'N/A') {
                setUnit('');
            }
        }
        else if (isManualEntry) {
            setItemName('');
            setRequestQuantity(1);
            setPartNumber('');
            setEquipmentNumber('');
            setSpecifications('');
            setImage(null);
            setUnit('');
            setErrors({});
            setRequestedById(null);
            setRequestedByEmail(null);
        }
    }, [item, isManualEntry]);
    const validateForm = () => {
        const newErrors: Record<string, string> = {};
        if (!itemName.trim()) {
            newErrors.itemName = 'Item name is required';
        }
        if (!equipmentNumber.trim()) {
            newErrors.equipmentNumber = 'Equipment number is required';
        }
        if (!unit.trim()) {
            newErrors.unit = 'Unit is required';
        }
        if (!requestedById) {
            newErrors.requestedBy = 'Requested by authority is required';
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm()) {
            return;
        }
        if (!isManualEntry && !item)
            return;
        setIsSubmitting(true);
        try {
            const finalEquipmentNumber = isManualEntry
                ? Array.from(expandEquipmentNumbers(equipmentNumber)).join(',')
                : equipmentNumber;
            const cartItem: RequestCartItem = {
                id: isManualEntry ? 'N/A' : (item?.id?.toString() || 'N/A'),
                nacCode: isManualEntry ? 'N/A' : (item?.nacCode || 'N/A'),
                itemName: itemName,
                requestQuantity,
                partNumber: partNumber || 'N/A',
                equipmentNumber: finalEquipmentNumber,
                specifications: specifications || '',
                image: image || undefined,
                unit: unit,
                requestedById: requestedById,
                requestedByEmail: requestedByEmail,
            };
            await onSubmit(cartItem);
            resetForm();
        }
        finally {
            setIsSubmitting(false);
        }
    };
    const resetForm = () => {
        setRequestQuantity(1);
        setPartNumber('');
        setEquipmentNumber('');
        setSpecifications('');
        setImage(null);
        setErrors({});
        setRequestedById(null);
        setRequestedByEmail(null);
        if (item) {
            setItemName(processItemName(item.itemName));
            setUnit(item.unit || '');
        }
        else if (isManualEntry) {
            setItemName('');
            setUnit('');
        }
    };
    const handleClose = () => {
        resetForm();
        onClose();
    };
    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] || null;
        if (file) {
            try {
                const options = {
                    maxWidthOrHeight: 1200,
                    maxSizeMB: 1,
                    useWebWorker: true,
                    initialQuality: 0.7,
                };
                const compressedFile = await imageCompression(file, options);
                setImage(compressedFile);
            }
            catch {
                setImage(file);
            }
        }
        else {
            setImage(null);
        }
    };
    return (<Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-full max-w-[95vw] sm:max-w-lg md:max-w-xl lg:max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-sm border border-[#002a6e]/10 p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
            {isManualEntry ? 'Add New Item' : 'Add Item to Request'}
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            {isManualEntry ? 'Enter the details for the new item' : 'Review and modify item details before adding to request'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#003594]">Item Name</Label>
              <Input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Enter item name" className={`mt-1 ${errors.itemName ? "border-red-500" : "border-[#002a6e]/10 focus:border-[#003594]"}`}/>
              {errors.itemName && <p className="text-sm text-red-500">{errors.itemName}</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#003594]">NAC Code</Label>
              <Input value={isManualEntry ? 'N/A' : item?.nacCode || ''} disabled className="mt-1 bg-gray-50 border-[#002a6e]/10"/>
            </div>
            <div className="space-y-2">
              <Label htmlFor="requestQuantity" className="text-sm font-medium text-[#003594]">Request Quantity</Label>
              <Input id="requestQuantity" type="number" min="1" value={requestQuantity} onChange={(e) => setRequestQuantity(Number(e.target.value))} required className="mt-1 border-[#002a6e]/10 focus:border-[#003594]"/>
            </div>
              <div className="space-y-2">
              <Label htmlFor="unit" className="text-sm font-medium text-[#003594]">
                Unit *
                {!canEditUnit && !isManualEntry && <span className="text-xs text-gray-500 ml-1">(read-only)</span>}
              </Label>
              
              {isManualEntry || (item?.nacCode === 'N/A') ? (<Input id="unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Enter unit (e.g., pcs, kg, etc.)" className={`mt-1 ${errors.unit ? "border-red-500" : "border-[#002a6e]/10 focus:border-[#003594]"}`} required/>) : canEditUnit ? (<Select value={unit || undefined} onValueChange={setUnit}>
                  <SelectTrigger id="unit" className="mt-1 bg-white border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20">
                    <SelectValue placeholder="Select unit"/>
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#002a6e]/10 max-h-[200px] overflow-y-auto">
                    {isLoadingUnits ? (<div className="p-2 text-sm text-gray-500">Loading units...</div>) : availableUnits.length > 0 ? (availableUnits.map((u) => (<SelectItem key={u} value={u} className="focus:bg-[#003594]/5">
                          {u}
                        </SelectItem>))) : (<div className="p-2 text-sm text-gray-500">No units available</div>)}
                  </SelectContent>
                </Select>) : (<Input id="unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit" disabled className={`mt-1 ${errors.unit ? "border-red-500" : "border-[#002a6e]/10 focus:border-[#003594]"} bg-gray-50 cursor-not-allowed`} required/>)}
                {errors.unit && <p className="text-sm text-red-500">{errors.unit}</p>}
              </div>
            <div className="space-y-2">
              <Label htmlFor="partNumber" className="text-sm font-medium text-[#003594]">Part Number</Label>
              {isManualEntry ? (<Input id="partNumber" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} placeholder="Enter part number" className="mt-1 border-[#002a6e]/10 focus:border-[#003594]"/>) : (<PartNumberSelect partNumberList={item?.partNumber || ""} value={partNumber} onChange={(value) => setPartNumber(value)} error={errors.partNumber}/>)}
            </div>
            <div className="space-y-2">
              <Label htmlFor="equipmentNumber" className="text-sm font-medium text-[#003594]">Equipment Number</Label>
              {isManualEntry ? (<Input id="equipmentNumber" value={equipmentNumber} onChange={(e) => setEquipmentNumber(e.target.value)} placeholder="Enter equipment number (e.g., 1000-1024 or 1000,1001,1002)" className={`mt-1 ${errors.equipmentNumber ? "border-red-500" : "border-[#002a6e]/10 focus:border-[#003594]"}`}/>) : (<EquipmentMultiSelect equipmentList={item?.equipmentNumber
                ? item.equipmentNumber.split(',').map(s => s.trim())
                : []} value={equipmentNumber} onChange={(value) => setEquipmentNumber(value)} error={errors.equipmentNumber}/>)}
              {errors.equipmentNumber && <p className="text-sm text-red-500">{errors.equipmentNumber}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="specifications" className="text-sm font-medium text-[#003594]">Specifications</Label>
            <Textarea id="specifications" value={specifications} onChange={(e) => setSpecifications(e.target.value)} placeholder="Enter any specifications or additional details" className="mt-1 border-[#002a6e]/10 focus:border-[#003594] min-h-[100px]"/>
          </div>

          <div className="space-y-2">
            <Label htmlFor="requestedBy" className="text-sm font-medium text-[#003594]">Requested By *</Label>
            <Select value={requestedById?.toString() || ''} onValueChange={(value) => {
            const selected = authorityOptions?.find(a => a.id.toString() === value);
            if (selected) {
                setRequestedById(selected.id);
                setRequestedByEmail(selected.email || null);
                if (errors.requestedBy) {
                    setErrors(prev => {
                        const newErrors = { ...prev };
                        delete newErrors.requestedBy;
                        return newErrors;
                    });
                }
            }
            else {
                setRequestedById(null);
                setRequestedByEmail(null);
            }
        }}>
              <SelectTrigger id="requestedBy" className={`mt-1 bg-white focus:border-[#003594] focus:ring-[#003594]/20 ${errors.requestedBy ? "border-red-500" : "border-[#002a6e]/10"}`}>
                <SelectValue placeholder="Select requesting authority"/>
              </SelectTrigger>
              <SelectContent className="bg-white border-[#002a6e]/10 max-h-[200px] overflow-y-auto">
                {isLoadingAuthorities ? (<div className="p-2 text-sm text-gray-500">Loading authorities...</div>) : authoritiesError ? (<div className="p-2 text-sm text-red-500">Error loading authorities: {authoritiesError}</div>) : authorityOptions && authorityOptions.length > 0 ? (authorityOptions.map((authority) => (<SelectItem key={authority.id} value={authority.id.toString()} className="focus:bg-[#003594]/5">
                      {authority.name} - {authority.designation}
                      {authority.section_name && ` (${authority.section_name})`}
                    </SelectItem>))) : (<div className="p-2 text-sm text-gray-500">No authorities available. Please add authorities in Settings.</div>)}
              </SelectContent>
            </Select>
            {errors.requestedBy && <p className="text-sm text-red-500">{errors.requestedBy}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="image" className="text-sm font-medium text-[#003594]">Image (Optional)</Label>
            <Input id="image" type="file" accept="image/*" onChange={handleImageChange} className="mt-1 border-[#002a6e]/10 focus:border-[#003594] file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-[#003594] file:text-white hover:file:bg-[#d2293b] file:transition-colors"/>
          </div>

          <DialogFooter className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={handleClose} className="border-[#002a6e]/10 hover:bg-gray-50">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-[#003594] hover:bg-[#d2293b] text-white transition-colors">
              {isSubmitting ? (<>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                  Adding...
                </>) : ('Add to Request')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>);
}
