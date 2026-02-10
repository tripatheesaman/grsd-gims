'use client';
import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ReceiveCartItem } from '@/types/receive';
import { ReceiveSearchResult } from '@/types/search';
import { Loader2 } from 'lucide-react';
import { PartNumberSelect } from '@/components/request/PartNumberSelect';
import { useCustomToast } from '@/components/ui/custom-toast';
import { API } from '@/lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Image from 'next/image';
import { resolveImageUrl } from '@/lib/urls';
interface ReceiveItemFormProps {
    isOpen: boolean;
    onClose: () => void;
    item: ReceiveSearchResult | null;
    onSubmit: (item: ReceiveCartItem) => void;
}
export const ReceiveItemForm = ({ isOpen, onClose, item, onSubmit }: ReceiveItemFormProps) => {
    const { showErrorToast } = useCustomToast();
    const [formData, setFormData] = useState<ReceiveCartItem>({
        id: '',
        nacCode: '',
        partNumber: '',
        itemName: '',
        receiveQuantity: 0,
        requestedQuantity: 0,
        equipmentNumber: '',
        image: undefined,
        unit: '',
        location: '',
        cardNumber: '',
        isLocationChanged: false,
        isCardNumberChanged: false
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCustomPartNumber, setIsCustomPartNumber] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [initialLocation, setInitialLocation] = useState('');
    const [initialCardNumber, setInitialCardNumber] = useState('');
    const [requestedUnit, setRequestedUnit] = useState<string>('');
    const [previousImagePath, setPreviousImagePath] = useState<string | null>(null);
    const [isLoadingImage, setIsLoadingImage] = useState(false);
    const [isLoadingConversion, setIsLoadingConversion] = useState(false);
    const [availableUnits, setAvailableUnits] = useState<string[]>([]);
    const [isLoadingUnits, setIsLoadingUnits] = useState(false);
    const [allowedLocationPhrases, setAllowedLocationPhrases] = useState<string[]>([]);
    useEffect(() => {
        const fetchPhrases = async () => {
            try {
                const response = await API.get('/api/location-phrases/active');
                if (response.status === 200 && Array.isArray(response.data.phrases)) {
                    setAllowedLocationPhrases(response.data.phrases.map((p: string) => p.trim().toLowerCase()).filter(Boolean));
                }
            }
            catch {
            }
        };
        fetchPhrases();
    }, []);
    const isValidLocation = (value: string | undefined | null): boolean => {
        if (!value)
            return false;
        const trimmed = value.trim();
        if (!trimmed)
            return false;
        const lower = trimmed.toLowerCase();
        if (allowedLocationPhrases.includes(lower)) {
            return true;
        }
        const pattern = /^[A-Za-z0-9]+(-[A-Za-z0-9]+)+$/;
        return pattern.test(trimmed);
    };
    const isValidCardNumber = (value: string | undefined | null): boolean => {
        if (!value)
            return false;
        const trimmed = value.trim();
        if (!trimmed)
            return false;
        if (!/^\d+$/.test(trimmed))
            return false;
        const num = Number(trimmed);
        return Number.isInteger(num) && num > 0;
    };
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
                    if (!formData.unit && response.data.defaultUnit) {
                        setFormData(prev => ({ ...prev, unit: response.data.defaultUnit }));
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
        if (item) {
            fetchAvailableUnits();
        }
    }, [item, formData.unit]);
    const fetchPreviousImage = useCallback(async (nacCode: string) => {
        setIsLoadingImage(true);
        try {
            const response = await API.get(`/api/receive/previous-image?nacCode=${encodeURIComponent(nacCode)}`);
            if (response.status === 200 && response.data.imagePath) {
                setPreviousImagePath(response.data.imagePath);
                setFormData(prev => ({ ...prev, imagePath: response.data.imagePath }));
            }
            else {
                setPreviousImagePath(null);
            }
        }
        catch {
            setPreviousImagePath(null);
        }
        finally {
            setIsLoadingImage(false);
        }
    }, []);
    useEffect(() => {
        if (item) {
            const unit = item.unit || '';
            setRequestedUnit(unit);
            setFormData({
                id: item.id.toString(),
                nacCode: item.nacCode,
                partNumber: item.partNumber || '',
                itemName: item.itemName,
                receiveQuantity: item.requestedQuantity,
                requestedQuantity: item.requestedQuantity,
                equipmentNumber: item.equipmentNumber,
                image: undefined,
                imagePath: undefined,
                unit: '',
                requestedUnit: unit,
                conversionBase: undefined,
                location: item.location || '',
                cardNumber: item.cardNumber || '',
                isLocationChanged: false,
                isCardNumberChanged: false
            });
            setIsCustomPartNumber(!item.partNumber);
            setInitialLocation(item.location);
            setInitialCardNumber(item.cardNumber);
            if (item.nacCode && item.nacCode !== 'N/A') {
                fetchPreviousImage(item.nacCode);
            }
        }
    }, [item, fetchPreviousImage]);
    const fetchConversionBase = async (nacCode: string, reqUnit: string, recUnit: string) => {
        if (!nacCode || nacCode === 'N/A' || !reqUnit || !recUnit || reqUnit === recUnit) {
            setFormData(prev => ({ ...prev, conversionBase: undefined }));
            return;
        }
        setIsLoadingConversion(true);
        try {
            const response = await API.get(`/api/receive/unit-conversion?nacCode=${encodeURIComponent(nacCode)}&requestedUnit=${encodeURIComponent(reqUnit)}&receivedUnit=${encodeURIComponent(recUnit)}`);
            if (response.status === 200 && response.data.conversionBase) {
                setFormData(prev => ({ ...prev, conversionBase: response.data.conversionBase }));
            }
            else {
                setFormData(prev => ({ ...prev, conversionBase: undefined }));
            }
        }
        catch {
            setFormData(prev => ({ ...prev, conversionBase: undefined }));
        }
        finally {
            setIsLoadingConversion(false);
        }
    };
    const handleUnitChange = (newUnit: string) => {
        setFormData(prev => ({ ...prev, unit: newUnit }));
        if (item && item.nacCode && item.nacCode !== 'N/A' && requestedUnit && newUnit !== requestedUnit) {
            fetchConversionBase(item.nacCode, requestedUnit, newUnit);
        }
        else {
            setFormData(prev => ({ ...prev, conversionBase: undefined }));
        }
    };
    const validateForm = () => {
        const newErrors: Record<string, string> = {};
        if (!formData.partNumber.trim()) {
            newErrors.partNumber = 'Part number is required';
        }
        if (!formData.location.trim()) {
            newErrors.location = 'Location is required';
        }
        else if (!isValidLocation(formData.location)) {
            newErrors.location = 'Location must be like AAA-BB-CC-11 or be an approved descriptive location.';
        }
        if (!formData.cardNumber.trim()) {
            newErrors.cardNumber = 'Card number is required';
        }
        else if (!isValidCardNumber(formData.cardNumber)) {
            newErrors.cardNumber = 'Card number must be a positive whole number (not 0).';
        }
        if (!formData.image && !formData.imagePath) {
            newErrors.image = 'Item image is required';
        }
        if (!formData.unit || formData.unit.trim() === '') {
            newErrors.unit = 'Unit is required';
        }
        if (formData.unit && requestedUnit && formData.unit !== requestedUnit && !formData.conversionBase) {
            newErrors.conversionBase = 'Conversion base is required when unit differs from requested unit';
        }
        if (!formData.receiveQuantity || formData.receiveQuantity <= 0) {
            newErrors.receiveQuantity = 'Valid receive quantity is required';
        }
        else if (formData.receiveQuantity > formData.requestedQuantity) {
            newErrors.receiveQuantity = `Receive quantity cannot be greater than requested quantity (${formData.requestedQuantity})`;
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
                title: 'Error',
                message: "Please fill in all required fields",
                duration: 3000,
            });
            return;
        }
        setIsSubmitting(true);
        try {
            if (item && item.nacCode && item.nacCode !== 'N/A' && requestedUnit && formData.unit !== requestedUnit && formData.conversionBase) {
                try {
                    await API.post('/api/receive/unit-conversion', {
                        nacCode: item.nacCode,
                        requestedUnit: requestedUnit,
                        receivedUnit: formData.unit,
                        conversionBase: formData.conversionBase
                    });
                }
                catch {
                }
            }
            if (item?.nacCode === 'N/A' && formData.nacCode && formData.unit) {
                try {
                    await API.post('/api/nac-units', {
                        nacCode: formData.nacCode,
                        unit: formData.unit.trim(),
                        isDefault: true
                    });
                }
                catch {
                }
            }
            await onSubmit(formData);
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
            setFormData(prev => ({ ...prev, image: file, imagePath: undefined }));
        }
    };
    return (<Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto bg-white">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
            Receive Item Details
          </DialogTitle>
          <p className="text-sm text-gray-500 mt-1">
            Review and confirm the item details before receiving
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            
            <div className="space-y-3">
              <div>
                <Label htmlFor="nacCode" className="text-sm font-medium text-[#003594]">NAC Code *</Label>
                <Input id="nacCode" value={formData.nacCode} onChange={(e) => setFormData(prev => ({ ...prev, nacCode: e.target.value }))} className={`mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20 ${errors.nacCode ? 'border-red-500' : ''}`} placeholder="e.g., GT 12345" required disabled={item?.nacCode !== 'N/A'}/>
                {errors.nacCode && (<p className="text-sm text-red-500 mt-1">{errors.nacCode}</p>)}
              </div>

              <div>
                <Label htmlFor="partNumber" className="text-sm font-medium text-[#003594]">Part Number *</Label>
                <div className="flex gap-2">
                  {!isCustomPartNumber ? (<PartNumberSelect partNumberList={item?.partNumber || ""} value={formData.partNumber} onChange={(value) => setFormData(prev => ({ ...prev, partNumber: value }))} error={errors.partNumber} disabled={item?.partNumber !== 'N/A'}/>) : (<Input id="partNumber" value={formData.partNumber} onChange={(e) => setFormData(prev => ({ ...prev, partNumber: e.target.value }))} className={`mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20 ${errors.partNumber ? 'border-red-500' : ''}`} placeholder="Enter part number" required/>)}
                  <Button type="button" variant="outline" onClick={() => setIsCustomPartNumber(!isCustomPartNumber)} className="whitespace-nowrap">
                    {isCustomPartNumber ? "Select Existing" : "Enter New"}
                  </Button>
                </div>
                {errors.partNumber && (<p className="text-sm text-red-500 mt-1">{errors.partNumber}</p>)}
              </div>

              <div>
                <Label htmlFor="itemName" className="text-sm font-medium text-[#003594]">Item Name</Label>
            <Input id="itemName" value={formData.itemName} onChange={(e) => setFormData(prev => ({ ...prev, itemName: e.target.value }))} className="mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20" readOnly required/>
          </div>

              <div>
                <Label htmlFor="equipmentNumber" className="text-sm font-medium text-[#003594]">Equipment Number</Label>
            <Input id="equipmentNumber" value={formData.equipmentNumber} onChange={(e) => setFormData(prev => ({ ...prev, equipmentNumber: e.target.value }))} className="mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20" readOnly required/>
          </div>
            </div>

            
            <div className="space-y-3">
              <div>
                <Label htmlFor="receiveQuantity" className="text-sm font-medium text-[#003594]">Receive Quantity *</Label>
            <Input id="receiveQuantity" type="number" value={formData.receiveQuantity} onChange={(e) => setFormData(prev => ({ ...prev, receiveQuantity: Number(e.target.value) }))} className={`mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20 ${errors.receiveQuantity ? 'border-red-500' : ''}`} min="1" max={formData.requestedQuantity} required/>
                <div className="text-xs text-gray-500 mt-1">
                  Max: {formData.requestedQuantity}
                </div>
                {errors.receiveQuantity && (<p className="text-sm text-red-500 mt-1">{errors.receiveQuantity}</p>)}
          </div>

              <div>
                <Label htmlFor="unit" className="text-sm font-medium text-[#003594]">
                  Unit *
                  {requestedUnit && formData.unit !== requestedUnit && (<span className="text-xs text-gray-500 ml-1">(Requested: {requestedUnit})</span>)}
                </Label>
                {item?.nacCode === 'N/A' ? (<Input id="unit" value={formData.unit} onChange={(e) => handleUnitChange(e.target.value)} className={`mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20 ${errors.unit ? 'border-red-500' : ''}`} placeholder="Enter unit" required/>) : (<Select value={formData.unit || undefined} onValueChange={handleUnitChange}>
                    <SelectTrigger id="unit" className="mt-1 bg-white border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20">
                      <SelectValue placeholder="Select unit"/>
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#002a6e]/10 max-h-[200px] overflow-y-auto">
                      {isLoadingUnits ? (<div className="p-2 text-sm text-gray-500">Loading units...</div>) : availableUnits.length > 0 ? (availableUnits.map((unit) => (<SelectItem key={unit} value={unit} className="focus:bg-[#003594]/5">
                            {unit}
                          </SelectItem>))) : (<div className="p-2 text-sm text-gray-500">No units available</div>)}
                    </SelectContent>
                  </Select>)}
                {formData.unit && requestedUnit && formData.unit !== requestedUnit && (<div className="mt-2 space-y-2">
                    <Label className="text-sm font-medium text-[#003594]">
                      Conversion Rate *
                    </Label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Label className="text-xs text-gray-500 block mb-1">From ({requestedUnit})</Label>
                        <Input value="1" readOnly className="border-[#002a6e]/10 bg-gray-50 text-gray-700 cursor-not-allowed"/>
                      </div>
                      <span className="mt-6 text-sm text-gray-600">=</span>
                      <div className="flex-1">
                        <Label className="text-xs text-gray-500 block mb-1">
                          To ({formData.unit})
                        </Label>
                        <Input id="conversionBase" type="number" step="0.0001" value={formData.conversionBase ?? ''} onChange={(e) => setFormData(prev => ({
                ...prev,
                conversionBase: e.target.value === '' ? undefined : parseFloat(e.target.value) || undefined
            }))} className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20" placeholder="e.g., 1.5" required disabled={isLoadingConversion}/>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      1 {requestedUnit} = {formData.conversionBase || '___'} {formData.unit}
                    </p>
                    {isLoadingConversion && (<p className="text-xs text-gray-500">Loading saved conversion...</p>)}
                  </div>)}
          </div>

              <div>
                <Label htmlFor="location" className="text-sm font-medium text-[#003594]">Location *</Label>
                <Input id="location" value={formData.location} onChange={(e) => {
            setFormData(prev => ({
                ...prev,
                location: e.target.value,
                isLocationChanged: true
            }));
        }} className={`mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20 ${errors.location ? 'border-red-500' : ''}`} placeholder="Enter location'" required disabled={initialLocation
            ? isValidLocation(initialLocation)
            : false}/>
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
        }} className={`mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20 ${errors.cardNumber ? 'border-red-500' : ''}`} placeholder="Enter card number (positive integer)" required disabled={initialCardNumber
            ? isValidCardNumber(initialCardNumber)
            : false} inputMode="numeric"/>
                {errors.cardNumber && (<p className="text-sm text-red-500 mt-1">{errors.cardNumber}</p>)}
              </div>
            </div>
          </div>

          
          <div className="mt-2 rounded-lg border border-[#002a6e]/10 bg-gray-50 p-3 space-y-3">
            <Label htmlFor="image" className="text-sm font-medium text-[#003594]">
              Item Image *
            </Label>

            {isLoadingImage && (<p className="text-xs text-gray-500">Checking for previous image...</p>)}

            
            {(formData.imagePath || formData.image) && (<div className="relative w-full h-40 rounded-md bg-white border border-dashed border-[#002a6e]/20 flex items-center justify-center overflow-hidden">
                <Image src={formData.image
                ? URL.createObjectURL(formData.image)
                : resolveImageUrl(formData.imagePath, '/images/nepal_airlines_logo.jpeg')} alt="Item image" fill className="object-contain" unoptimized onError={() => {
                setPreviousImagePath(null);
                setFormData(prev => ({ ...prev, imagePath: undefined }));
            }}/>
              </div>)}

            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <Input id="image" type="file" accept="image/*" onChange={handleImageChange} className={`border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-[#003594] file:text-white hover:file:bg-[#d2293b] transition-colors ${errors.image ? 'border-red-500' : ''}`} required={!formData.imagePath}/>
              {previousImagePath && !formData.image && (<span className="text-xs text-gray-600 md:ml-2">
                  Previous image is selected by default. Upload a new one to change it.
                </span>)}
            </div>

            {errors.image && (<p className="text-sm text-red-500">{errors.image}</p>)}
          </div>

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
