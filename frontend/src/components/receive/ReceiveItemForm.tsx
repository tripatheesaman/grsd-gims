'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ReceiveCartItem } from '@/types/receive';
import { ReceiveSearchResult, StockVariant } from '@/types/search';
import { Loader2, Package, Hash, MapPin, Scale, ImageIcon, AlertCircle, ClipboardList } from 'lucide-react';
import { PartNumberSelect } from '@/components/request/PartNumberSelect';
import { useCustomToast } from '@/components/ui/custom-toast';
import { API } from '@/lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { resolveImageUrl } from '@/lib/urls';
import { getNacCodeValidationError, stripSuffixFromNac } from '@/utils/nacCodeUtils';
import { isAbsentPartNumber, resolveReceivePartNumber } from '@/utils/partNumberUtils';
import { processItemName } from '@/utils/utils';
import imageCompression from 'browser-image-compression';

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
        isLocationChanged: false,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCustomPartNumber, setIsCustomPartNumber] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [initialLocation, setInitialLocation] = useState('');
    const [requestedUnit, setRequestedUnit] = useState('');
    const [previousImagePath, setPreviousImagePath] = useState<string | null>(null);
    const [isLoadingImage, setIsLoadingImage] = useState(false);
    const [isLoadingConversion, setIsLoadingConversion] = useState(false);
    const [availableUnits, setAvailableUnits] = useState<string[]>([]);
    const [isLoadingUnits, setIsLoadingUnits] = useState(false);
    const [allowedLocationPhrases, setAllowedLocationPhrases] = useState<string[]>([]);
    const [requiresNewPhoto, setRequiresNewPhoto] = useState(false);
    const [resolvedNacCode, setResolvedNacCode] = useState<string | null>(null);
    const [familyVariants, setFamilyVariants] = useState<StockVariant[]>([]);
    const [isResolvingVariant, setIsResolvingVariant] = useState(false);

    const remainingQuantity = item?.remainingQuantity ?? item?.requestedQuantity ?? formData.requestedQuantity;
    const isNewNacItem = item?.nacCode === 'N/A';

    const partNumberList = useMemo(() => {
        if (familyVariants.length) {
            return familyVariants.map((v) => v.partNumber).filter(Boolean).join(',');
        }
        return item?.partNumber || '';
    }, [familyVariants, item?.partNumber]);

    const nacForUnits = useMemo(() => {
        if (isNewNacItem) {
            return formData.nacCode;
        }
        return resolvedNacCode || item?.nacCode || formData.nacCode;
    }, [isNewNacItem, resolvedNacCode, item?.nacCode, formData.nacCode]);

    useEffect(() => {
        const fetchPhrases = async () => {
            try {
                const response = await API.get('/api/location-phrases/active');
                if (response.status === 200 && Array.isArray(response.data.phrases)) {
                    setAllowedLocationPhrases(
                        response.data.phrases.map((p: string) => p.trim().toLowerCase()).filter(Boolean)
                    );
                }
            } catch {
                /* optional config */
            }
        };
        void fetchPhrases();
    }, []);

    const isValidLocation = (value: string | undefined | null): boolean => {
        if (!value) return false;
        const trimmed = value.trim();
        if (!trimmed) return false;
        if (allowedLocationPhrases.includes(trimmed.toLowerCase())) return true;
        return /^[A-Za-z0-9]+(-[A-Za-z0-9]+)+$/.test(trimmed);
    };

    const fetchPreviousImage = useCallback(async (nacCode: string, partNumber: string) => {
        setIsLoadingImage(true);
        try {
            const params = new URLSearchParams({ nacCode });
            if (partNumber.trim()) params.set('partNumber', partNumber.trim());
            const response = await API.get(`/api/receive/previous-image?${params.toString()}`);
            const needsNew = !!response.data?.requiresNewPhoto;
            setRequiresNewPhoto(needsNew);
            if (needsNew) {
                setPreviousImagePath(null);
                setFormData((prev) => ({ ...prev, imagePath: undefined, image: undefined }));
                return;
            }
            if (response.status === 200 && response.data.imagePath) {
                setPreviousImagePath(response.data.imagePath);
                setFormData((prev) => ({ ...prev, imagePath: response.data.imagePath }));
            } else {
                setPreviousImagePath(null);
            }
        } catch {
            setPreviousImagePath(null);
        } finally {
            setIsLoadingImage(false);
        }
    }, []);

    const resolveVariantPreview = useCallback(async (nacCode: string, partNumber: string) => {
        if (!nacCode || nacCode === 'N/A') {
            setResolvedNacCode(null);
            return;
        }
        if (isAbsentPartNumber(partNumber)) {
            setResolvedNacCode(stripSuffixFromNac(nacCode));
            setRequiresNewPhoto(false);
            return;
        }
        if (!partNumber.trim()) {
            setResolvedNacCode(null);
            return;
        }
        setIsResolvingVariant(true);
        try {
            const variant = familyVariants.find((v) => v.partNumber?.trim() === partNumber.trim());
            if (variant) {
                setResolvedNacCode(variant.nacCode);
                setRequiresNewPhoto(false);
                return;
            }
            const response = await API.get('/api/stock/resolve-variant', {
                params: { baseNac: stripSuffixFromNac(nacCode), partNumber: partNumber.trim() },
            });
            setResolvedNacCode(response.data?.nacCode || null);
            setRequiresNewPhoto(!!response.data?.requiresNewPhoto);
        } catch {
            setResolvedNacCode(null);
        } finally {
            setIsResolvingVariant(false);
        }
    }, [familyVariants]);

    const loadFamilyVariants = useCallback(async (nacCode: string) => {
        if (!nacCode || nacCode === 'N/A') {
            setFamilyVariants([]);
            return;
        }
        try {
            const base = stripSuffixFromNac(nacCode);
            const response = await API.get(`/api/stock/family/${encodeURIComponent(base)}`);
            setFamilyVariants(Array.isArray(response.data?.variants) ? response.data.variants : []);
        } catch {
            setFamilyVariants([]);
        }
    }, []);

    useEffect(() => {
        if (!item || !isOpen) return;

        const remaining = item.remainingQuantity ?? item.requestedQuantity;
        const unit = item.unit || '';
        setRequestedUnit(unit);
        setFormData({
            id: item.id.toString(),
            nacCode: item.nacCode,
            partNumber: isAbsentPartNumber(item.partNumber) ? 'N/A' : (item.partNumber || ''),
            itemName: item.itemName,
            receiveQuantity: remaining,
            requestedQuantity: item.requestedQuantity,
            remainingQuantity: remaining,
            equipmentNumber: item.equipmentNumber,
            image: undefined,
            imagePath: undefined,
            unit: '',
            requestedUnit: unit,
            conversionBase: undefined,
            location: item.location || '',
            isLocationChanged: false,
            requestNumber: item.requestNumber,
        });
        setIsCustomPartNumber(isAbsentPartNumber(item.partNumber));
        setInitialLocation(item.location || '');
        setResolvedNacCode(null);
        setRequiresNewPhoto(false);
        setErrors({});
    }, [item?.id, isOpen, item]);

    useEffect(() => {
        if (!item?.nacCode || item.nacCode === 'N/A' || !isOpen) {
            setFamilyVariants([]);
            return;
        }
        void loadFamilyVariants(item.nacCode);
    }, [item?.nacCode, isOpen, loadFamilyVariants]);

    useEffect(() => {
        if (!formData.nacCode || formData.nacCode === 'N/A') {
            return;
        }
        if (isAbsentPartNumber(formData.partNumber)) {
            const baseNac = stripSuffixFromNac(formData.nacCode);
            setResolvedNacCode(baseNac);
            setRequiresNewPhoto(false);
            void fetchPreviousImage(baseNac, 'N/A');
            return;
        }
        if (!formData.partNumber.trim()) {
            return;
        }
        void resolveVariantPreview(formData.nacCode, formData.partNumber);
        void fetchPreviousImage(resolvedNacCode || formData.nacCode, formData.partNumber);
    }, [formData.partNumber, formData.nacCode, familyVariants, resolveVariantPreview, fetchPreviousImage, resolvedNacCode]);

    useEffect(() => {
        const fetchAvailableUnits = async () => {
            if (!nacForUnits || nacForUnits === 'N/A') {
                setAvailableUnits([]);
                return;
            }
            setIsLoadingUnits(true);
            try {
                const response = await API.get(`/api/nac-units/nac/${encodeURIComponent(nacForUnits)}`);
                if (response.status === 200 && response.data.units) {
                    setAvailableUnits(response.data.units);
                    if (response.data.defaultUnit) {
                        setFormData((prev) =>
                            prev.unit ? prev : { ...prev, unit: response.data.defaultUnit }
                        );
                    }
                } else {
                    setAvailableUnits([]);
                }
            } catch {
                setAvailableUnits([]);
            } finally {
                setIsLoadingUnits(false);
            }
        };
        if (isOpen) void fetchAvailableUnits();
    }, [nacForUnits, isOpen]);

    const fetchConversionBase = async (nacCode: string, reqUnit: string, recUnit: string) => {
        if (!nacCode || nacCode === 'N/A' || !reqUnit || !recUnit || reqUnit === recUnit) {
            setFormData((prev) => ({ ...prev, conversionBase: undefined }));
            return;
        }
        setIsLoadingConversion(true);
        try {
            const response = await API.get(
                `/api/receive/unit-conversion?nacCode=${encodeURIComponent(nacCode)}&requestedUnit=${encodeURIComponent(reqUnit)}&receivedUnit=${encodeURIComponent(recUnit)}`
            );
            setFormData((prev) => ({
                ...prev,
                conversionBase: response.status === 200 && response.data.conversionBase
                    ? response.data.conversionBase
                    : undefined,
            }));
        } catch {
            setFormData((prev) => ({ ...prev, conversionBase: undefined }));
        } finally {
            setIsLoadingConversion(false);
        }
    };

    const handleUnitChange = (newUnit: string) => {
        setFormData((prev) => ({ ...prev, unit: newUnit }));
        const nac = item?.nacCode && item.nacCode !== 'N/A' ? item.nacCode : formData.nacCode;
        if (nac && requestedUnit && newUnit !== requestedUnit) {
            void fetchConversionBase(nac, requestedUnit, newUnit);
        } else {
            setFormData((prev) => ({ ...prev, conversionBase: undefined }));
        }
    };

    const selectablePartNumbers = useMemo(
        () =>
            partNumberList
                .split(',')
                .map((part) => part.trim())
                .filter((part) => part && !isAbsentPartNumber(part)),
        [partNumberList]
    );

    const validateForm = () => {
        const newErrors: Record<string, string> = {};
        const maxQty = remainingQuantity || formData.requestedQuantity;

        if (selectablePartNumbers.length > 0 && !formData.partNumber.trim()) {
            newErrors.partNumber = 'Part number is required';
        } else if (!isAbsentPartNumber(formData.partNumber) && !formData.partNumber.trim()) {
            newErrors.partNumber = 'Part number is required';
        }
        if (!formData.location.trim()) {
            newErrors.location = 'Location is required';
        } else if (!isValidLocation(formData.location)) {
            newErrors.location = 'Location must be like AAA-BB-CC-11 or an approved descriptive location.';
        }
        if (!formData.image && !formData.imagePath) newErrors.image = 'Item image is required';
        if (!formData.unit?.trim()) newErrors.unit = 'Unit is required';
        if (formData.unit && requestedUnit && formData.unit !== requestedUnit && !formData.conversionBase) {
            newErrors.conversionBase = 'Conversion rate is required when unit differs from request';
        }
        if (!formData.receiveQuantity || formData.receiveQuantity <= 0) {
            newErrors.receiveQuantity = 'Valid receive quantity is required';
        } else if (formData.receiveQuantity > maxQty) {
            newErrors.receiveQuantity = `Cannot exceed remaining quantity (${maxQty})`;
        }
        const nacFormatError = getNacCodeValidationError(formData.nacCode, { allowSuffix: true });
        if (nacFormatError) newErrors.nacCode = nacFormatError;
        if (requiresNewPhoto && !formData.image) {
            newErrors.image = 'A new photo upload is required for this part number';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm()) {
            showErrorToast({ title: 'Missing fields', message: 'Please correct the highlighted fields.', duration: 3000 });
            return;
        }
        setIsSubmitting(true);
        try {
            const nac = item?.nacCode && item.nacCode !== 'N/A' ? item.nacCode : formData.nacCode;
            if (item && nac && nac !== 'N/A' && requestedUnit && formData.unit !== requestedUnit && formData.conversionBase) {
                try {
                    await API.post('/api/receive/unit-conversion', {
                        nacCode: nac,
                        requestedUnit,
                        receivedUnit: formData.unit,
                        conversionBase: formData.conversionBase,
                    });
                } catch {
                    /* saved on submit is best-effort */
                }
            }
            if (isNewNacItem && formData.nacCode && formData.unit) {
                try {
                    await API.post('/api/nac-units', {
                        nacCode: formData.nacCode,
                        unit: formData.unit.trim(),
                        isDefault: true,
                    });
                } catch {
                    /* optional */
                }
            }
            await onSubmit({
                ...formData,
                partNumber: resolveReceivePartNumber(formData.partNumber),
                resolvedNacCode: resolvedNacCode || undefined,
                requiresNewPhoto,
                remainingQuantity,
            });
            onClose();
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const compressed = await imageCompression(file, {
                maxWidthOrHeight: 1200,
                maxSizeMB: 1,
                useWebWorker: true,
                initialQuality: 0.7,
            });
            setFormData((prev) => ({ ...prev, image: compressed, imagePath: undefined }));
        } catch {
            setFormData((prev) => ({ ...prev, image: file, imagePath: undefined }));
        }
    };

    const stockImageUrl = item?.imageUrl ? resolveImageUrl(item.imageUrl, '/images/nepal_airlines_logo.png') : null;
    const locationLocked = Boolean(initialLocation && isValidLocation(initialLocation));

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="w-full max-w-[95vw] sm:max-w-2xl lg:max-w-3xl max-h-[92vh] overflow-y-auto bg-white rounded-xl border border-[#002a6e]/10 p-0 gap-0">
                <DialogHeader className="px-6 pt-6 pb-4 border-b border-[#002a6e]/10 bg-gradient-to-r from-[#003594]/5 to-transparent">
                    <DialogTitle className="text-xl font-bold text-[#003594]">Receive Item</DialogTitle>
                    <DialogDescription className="text-sm text-gray-600">
                        Confirm part number, quantity, and photo before adding to the receive cart.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
                    {item && (
                        <div className="rounded-lg border border-[#002a6e]/10 bg-[#003594]/[0.03] p-4 space-y-3">
                            <div className="flex gap-4">
                                <div className="relative w-16 h-16 shrink-0 rounded-md overflow-hidden border border-[#002a6e]/10 bg-white">
                                    {stockImageUrl ? (
                                        <Image src={stockImageUrl} alt={item.itemName} fill className="object-cover" unoptimized />
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-gray-400">
                                            <Package className="h-7 w-7" />
                                        </div>
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-[#003594] truncate">{processItemName(item.itemName)}</p>
                                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                                        {item.requestNumber && (
                                            <Badge variant="outline" className="font-mono">
                                                <ClipboardList className="h-3 w-3 mr-1" />
                                                {item.requestNumber}
                                            </Badge>
                                        )}
                                        <Badge variant="secondary" className="font-mono">
                                            {formData.nacCode || 'N/A'}
                                        </Badge>
                                        {resolvedNacCode && resolvedNacCode !== stripSuffixFromNac(formData.nacCode) && (
                                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                                                → {resolvedNacCode}
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-600 mt-2">
                                        Requested: <strong>{item.requestedQuantity}</strong> {item.unit || ''}
                                        {' · '}
                                        Remaining: <strong className="text-[#003594]">{remainingQuantity}</strong>
                                        {item.equipmentNumber && (
                                            <> · Equipment: <span className="font-medium">{item.equipmentNumber}</span></>
                                        )}
                                    </p>
                                </div>
                            </div>
                            {isNewNacItem && (
                                <p className="text-xs text-amber-700 flex items-start gap-1.5">
                                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                    New item — enter a valid NAC code. Stock record is created on approval.
                                </p>
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="nacCode" className="text-sm font-medium text-[#003594] flex items-center gap-1.5">
                                    <Hash className="h-3.5 w-3.5" /> NAC Code *
                                </Label>
                                <Input
                                    id="nacCode"
                                    value={formData.nacCode}
                                    onChange={(e) => setFormData((prev) => ({ ...prev, nacCode: e.target.value }))}
                                    className={`mt-1 ${errors.nacCode ? 'border-red-500' : 'border-[#002a6e]/15'}`}
                                    placeholder="e.g., GT 12345"
                                    disabled={!isNewNacItem}
                                />
                                {errors.nacCode && <p className="text-sm text-red-500 mt-1">{errors.nacCode}</p>}
                            </div>

                            <div>
                                <Label className="text-sm font-medium text-[#003594]">Part Number *</Label>
                                <div className="flex gap-2 mt-1">
                                    {!isCustomPartNumber ? (
                                        <PartNumberSelect
                                            partNumberList={partNumberList}
                                            value={formData.partNumber}
                                            onChange={(value) =>
                                                setFormData((prev) => ({ ...prev, partNumber: value, imagePath: undefined, image: undefined }))
                                            }
                                            error={errors.partNumber}
                                            disabled={Boolean(item?.partNumber && item.partNumber !== 'N/A' && !familyVariants.length)}
                                        />
                                    ) : (
                                        <Input
                                            value={formData.partNumber}
                                            onChange={(e) =>
                                                setFormData((prev) => ({
                                                    ...prev,
                                                    partNumber: e.target.value,
                                                    imagePath: undefined,
                                                    image: undefined,
                                                }))
                                            }
                                            className={errors.partNumber ? 'border-red-500' : 'border-[#002a6e]/15'}
                                            placeholder="N/A if not applicable"
                                        />
                                    )}
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="shrink-0"
                                        onClick={() => {
                                            const next = !isCustomPartNumber;
                                            setIsCustomPartNumber(next);
                                            if (next) {
                                                setFormData((prev) => ({ ...prev, imagePath: undefined, image: undefined }));
                                                setPreviousImagePath(null);
                                                setRequiresNewPhoto(true);
                                            }
                                        }}
                                    >
                                        {isCustomPartNumber ? 'Select' : 'New part'}
                                    </Button>
                                </div>
                                {errors.partNumber && <p className="text-sm text-red-500 mt-1">{errors.partNumber}</p>}
                                {isResolvingVariant && (
                                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                        <Loader2 className="h-3 w-3 animate-spin" /> Resolving stock variant…
                                    </p>
                                )}
                            </div>

                            <div>
                                <Label className="text-sm font-medium text-gray-600">Equipment</Label>
                                <Input value={formData.equipmentNumber} readOnly className="mt-1 bg-gray-50 border-[#002a6e]/10" />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="receiveQuantity" className="text-sm font-medium text-[#003594] flex items-center gap-1.5">
                                    <Scale className="h-3.5 w-3.5" /> Receive Quantity *
                                </Label>
                                <Input
                                    id="receiveQuantity"
                                    type="number"
                                    value={formData.receiveQuantity}
                                    onChange={(e) =>
                                        setFormData((prev) => ({ ...prev, receiveQuantity: Number(e.target.value) }))
                                    }
                                    className={`mt-1 ${errors.receiveQuantity ? 'border-red-500' : 'border-[#002a6e]/15'}`}
                                    min={1}
                                    max={remainingQuantity || formData.requestedQuantity}
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Remaining to receive: <strong>{remainingQuantity}</strong> of {formData.requestedQuantity} requested
                                </p>
                                {errors.receiveQuantity && <p className="text-sm text-red-500 mt-1">{errors.receiveQuantity}</p>}
                            </div>

                            <div>
                                <Label htmlFor="unit" className="text-sm font-medium text-[#003594]">
                                    Unit *
                                    {requestedUnit && formData.unit !== requestedUnit && (
                                        <span className="text-xs text-gray-500 ml-1">(requested: {requestedUnit})</span>
                                    )}
                                </Label>
                                {isNewNacItem ? (
                                    <Input
                                        id="unit"
                                        value={formData.unit}
                                        onChange={(e) => handleUnitChange(e.target.value)}
                                        className={`mt-1 ${errors.unit ? 'border-red-500' : 'border-[#002a6e]/15'}`}
                                        placeholder="e.g., PCS, LTR"
                                    />
                                ) : (
                                    <Select value={formData.unit || undefined} onValueChange={handleUnitChange}>
                                        <SelectTrigger id="unit" className="mt-1 border-[#002a6e]/15">
                                            <SelectValue placeholder={isLoadingUnits ? 'Loading…' : 'Select unit'} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableUnits.length ? (
                                                availableUnits.map((u) => (
                                                    <SelectItem key={u} value={u}>{u}</SelectItem>
                                                ))
                                            ) : (
                                                <SelectItem value={requestedUnit || 'PCS'}>{requestedUnit || 'PCS'}</SelectItem>
                                            )}
                                        </SelectContent>
                                    </Select>
                                )}
                                {errors.unit && <p className="text-sm text-red-500 mt-1">{errors.unit}</p>}

                                {formData.unit && requestedUnit && formData.unit !== requestedUnit && (
                                    <div className="mt-3 p-3 rounded-md border border-[#002a6e]/10 bg-gray-50 space-y-2">
                                        <Label className="text-xs font-medium text-[#003594]">Unit conversion *</Label>
                                        <div className="flex items-center gap-2 text-sm">
                                            <span className="text-gray-600">1 {requestedUnit} =</span>
                                            <Input
                                                type="number"
                                                step="0.0001"
                                                value={formData.conversionBase ?? ''}
                                                onChange={(e) =>
                                                    setFormData((prev) => ({
                                                        ...prev,
                                                        conversionBase:
                                                            e.target.value === '' ? undefined : parseFloat(e.target.value) || undefined,
                                                    }))
                                                }
                                                className="h-8 w-24"
                                                disabled={isLoadingConversion}
                                            />
                                            <span className="text-gray-600">{formData.unit}</span>
                                        </div>
                                        {errors.conversionBase && (
                                            <p className="text-sm text-red-500">{errors.conversionBase}</p>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div>
                                <Label htmlFor="location" className="text-sm font-medium text-[#003594] flex items-center gap-1.5">
                                    <MapPin className="h-3.5 w-3.5" /> Location *
                                </Label>
                                <Input
                                    id="location"
                                    value={formData.location}
                                    onChange={(e) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            location: e.target.value,
                                            isLocationChanged: true,
                                        }))
                                    }
                                    className={`mt-1 ${errors.location ? 'border-red-500' : 'border-[#002a6e]/15'}`}
                                    placeholder="e.g., WH-A-01-02"
                                    disabled={locationLocked}
                                />
                                {locationLocked && (
                                    <p className="text-xs text-gray-500 mt-1">Location from stock record (fixed).</p>
                                )}
                                {errors.location && <p className="text-sm text-red-500 mt-1">{errors.location}</p>}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-lg border border-[#002a6e]/10 p-4 space-y-3">
                        <Label className="text-sm font-medium text-[#003594] flex items-center gap-1.5">
                            <ImageIcon className="h-4 w-4" /> Item Photo *
                        </Label>
                        {isLoadingImage && (
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" /> Checking previous image…
                            </p>
                        )}
                        {(formData.imagePath || formData.image) && (
                            <div className="relative w-full h-36 rounded-md bg-white border border-dashed border-[#002a6e]/20 overflow-hidden">
                                <Image
                                    src={
                                        formData.image
                                            ? URL.createObjectURL(formData.image)
                                            : resolveImageUrl(formData.imagePath, '/images/nepal_airlines_logo.jpeg')
                                    }
                                    alt="Item"
                                    fill
                                    className="object-contain"
                                    unoptimized
                                />
                            </div>
                        )}
                        <Input
                            type="file"
                            accept="image/*"
                            onChange={handleImageChange}
                            className={`border-[#002a6e]/15 file:bg-[#003594] file:text-white file:border-0 file:rounded file:px-3 file:py-1.5 ${errors.image ? 'border-red-500' : ''}`}
                        />
                        {requiresNewPhoto ? (
                            <p className="text-xs text-amber-700">New part number — upload a fresh photo (reuse not allowed).</p>
                        ) : previousImagePath && !formData.image ? (
                            <p className="text-xs text-gray-600">Previous image pre-selected. Upload to replace.</p>
                        ) : null}
                        {errors.image && <p className="text-sm text-red-500">{errors.image}</p>}
                    </div>

                    <div className="flex justify-end gap-3 pt-2 border-t border-[#002a6e]/10">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting} className="bg-[#003594] hover:bg-[#d2293b]">
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Adding…
                                </>
                            ) : (
                                'Add to Cart'
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
