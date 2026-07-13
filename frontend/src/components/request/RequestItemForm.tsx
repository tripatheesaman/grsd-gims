'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Image from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RequestCartItem } from '@/types/request';
import { SearchResult } from '@/types/search';
import { PartNumberSelect } from './PartNumberSelect';
import { RequestEquipmentSelect } from './RequestEquipmentSelect';
import { collapseEquipmentSelectionValue } from '@/utils/equipmentNumbers';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    AlertCircle,
    Hash,
    Loader2,
    Package,
    Scale,
    User,
    FileText,
    ImageIcon,
} from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { processItemName } from '@/utils/utils';
import { useAuthContext } from '@/context/AuthContext';
import { API } from '@/lib/api';
import { resolveImageUrl } from '@/lib/urls';
import { useRequestingAuthorities } from '@/app/request/useRequestingAuthorities';
import {
    getRequestPartNumberValidationError,
    sanitizeRequestPartNumberInput,
} from '@/utils/partNumberUtils';

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
    const [resolvedNacCode, setResolvedNacCode] = useState<string>('');
    const [unit, setUnit] = useState<string>('');
    const [availableUnits, setAvailableUnits] = useState<string[]>([]);
    const [isLoadingUnits, setIsLoadingUnits] = useState(false);
    const [isResolvingPart, setIsResolvingPart] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [requestedById, setRequestedById] = useState<number | null>(null);
    const [requestedByEmail, setRequestedByEmail] = useState<string | null>(null);

    const prevNacRef = useRef<string>('');

    const partNumberList = useMemo(() => {
        if (item?.variants?.length) {
            return item.variants.map((v) => v.partNumber).filter(Boolean).join(',');
        }
        return item?.partNumber || '';
    }, [item]);

    const nacCodeForUnits = resolvedNacCode || item?.nacCode || '';
    const nacCodeForEquipment = isManualEntry ? 'N/A' : (resolvedNacCode || item?.nacCode || 'N/A');
    const displayNacCode = isManualEntry ? 'N/A' : (resolvedNacCode || item?.nacCode || '');

    useEffect(() => {
        const fetchAvailableUnits = async () => {
            if (!nacCodeForUnits || nacCodeForUnits === 'N/A') {
                setAvailableUnits([]);
                return;
            }
            setIsLoadingUnits(true);
            try {
                const response = await API.get(`/api/nac-units/nac/${encodeURIComponent(nacCodeForUnits)}`);
                if (response.status === 200 && response.data.units) {
                    setAvailableUnits(response.data.units);
                    if (response.data.defaultUnit) {
                        setUnit(response.data.defaultUnit);
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
        if (isOpen) {
            void fetchAvailableUnits();
        }
    }, [nacCodeForUnits, isOpen]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        if (item && !isManualEntry) {
            setItemName(processItemName(item.itemName));
            setResolvedNacCode(item.nacCode);
            prevNacRef.current = item.nacCode;
        } else if (isManualEntry) {
            setItemName('');
            setResolvedNacCode('N/A');
            prevNacRef.current = 'N/A';
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
    }, [item, isManualEntry, isOpen]);

    useEffect(() => {
        if (prevNacRef.current && prevNacRef.current !== nacCodeForEquipment) {
            setEquipmentNumber('');
        }
        prevNacRef.current = nacCodeForEquipment;
    }, [nacCodeForEquipment]);

    const resolvePartSelection = useCallback(async (pn: string) => {
        if (!item || isManualEntry || !pn.trim()) {
            return;
        }

        const variant = item.variants?.find((v) => v.partNumber?.trim() === pn.trim());
        if (variant) {
            setResolvedNacCode(variant.nacCode);
            setItemName(processItemName(item.itemName));
            return;
        }

        setIsResolvingPart(true);
        try {
            const response = await API.get('/api/request/resolve-target', {
                params: { nacCode: item.nacCode, partNumber: pn },
            });
            if (response.status === 200 && response.data) {
                setResolvedNacCode(response.data.nacCode || item.nacCode);
                if (response.data.itemName) {
                    setItemName(processItemName(response.data.itemName));
                }
                if (response.data.defaultUnit) {
                    setUnit(response.data.defaultUnit);
                }
                if (Array.isArray(response.data.units)) {
                    setAvailableUnits(response.data.units);
                }
            }
        } catch {
            setResolvedNacCode(item.nacCode);
        } finally {
            setIsResolvingPart(false);
        }
    }, [item, isManualEntry]);

    const handlePartNumberChange = (value: string) => {
        setPartNumber(value);
        void resolvePartSelection(value);
    };

    const validateForm = () => {
        const newErrors: Record<string, string> = {};
        if (isManualEntry && !itemName.trim()) {
            newErrors.itemName = 'Item name is required';
        }
        if (isManualEntry) {
            const partNumberError = getRequestPartNumberValidationError(partNumber);
            if (partNumberError) {
                newErrors.partNumber = partNumberError;
            }
        }
        if (!isManualEntry && partNumberList && !partNumber.trim()) {
            newErrors.partNumber = 'Part number is required';
        }
        if (!equipmentNumber.trim()) {
            newErrors.equipmentNumber = 'Select at least one asset or section';
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
        if (!isManualEntry && !item) {
            return;
        }
        setIsSubmitting(true);
        try {
            const cartItem: RequestCartItem = {
                id: isManualEntry ? 'N/A' : (item?.id?.toString() || 'N/A'),
                nacCode: isManualEntry ? 'N/A' : (resolvedNacCode || item?.nacCode || 'N/A'),
                itemName: isManualEntry ? itemName : processItemName(itemName || item?.itemName || ''),
                requestQuantity,
                partNumber: isManualEntry
                    ? (sanitizeRequestPartNumberInput(partNumber) || 'N/A')
                    : (partNumber || 'N/A'),
                equipmentNumber: collapseEquipmentSelectionValue(equipmentNumber.trim()),
                specifications: specifications || '',
                image: image || undefined,
                unit,
                requestedById,
                requestedByEmail,
            };
            await onSubmit(cartItem);
            resetForm();
        } finally {
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
            setResolvedNacCode(item.nacCode);
        } else if (isManualEntry) {
            setItemName('');
            setResolvedNacCode('N/A');
            setUnit('');
        }
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] || null;
        if (!file) {
            setImage(null);
            return;
        }
        try {
            const compressedFile = await imageCompression(file, {
                maxWidthOrHeight: 1200,
                maxSizeMB: 1,
                useWebWorker: true,
                initialQuality: 0.7,
            });
            setImage(compressedFile);
        } catch {
            setImage(file);
        }
    };

    const stockImageUrl = item?.imageUrl ? resolveImageUrl(item.imageUrl, '/images/nepal_airlines_logo.png') : null;
    const virtualBalance = item?.virtualBalance ?? item?.currentBalance;
    const trueBalance = item?.trueBalance;

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="w-full max-w-[95vw] sm:max-w-2xl lg:max-w-3xl max-h-[92vh] overflow-y-auto bg-white rounded-xl shadow-lg border border-[#002a6e]/10 p-0 gap-0">
                <DialogHeader className="px-6 pt-6 pb-4 border-b border-[#002a6e]/10 bg-gradient-to-r from-[#003594]/5 to-transparent">
                    <DialogTitle className="text-xl font-bold text-[#003594]">
                        {isManualEntry ? 'Add New Item' : 'Add to Request Slip'}
                    </DialogTitle>
                    <DialogDescription className="text-gray-600 text-sm">
                        {isManualEntry
                            ? 'Enter details for a new item not yet in stock.'
                            : 'Choose part number and compatible equipment. Name and NAC code come from stock records.'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
                    {!isManualEntry && item && (
                        <div className="flex gap-4 p-4 rounded-lg border border-[#002a6e]/10 bg-[#003594]/[0.03]">
                            <div className="relative w-20 h-20 shrink-0 rounded-md overflow-hidden border border-[#002a6e]/10 bg-white">
                                {stockImageUrl ? (
                                    <Image src={stockImageUrl} alt={itemName} fill className="object-cover" unoptimized />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-gray-400">
                                        <Package className="h-8 w-8" />
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0 flex-1 space-y-1">
                                <p className="font-semibold text-[#003594] truncate">{itemName || processItemName(item.itemName)}</p>
                                <p className="text-sm text-gray-600">
                                    NAC: <span className="font-mono font-medium">{displayNacCode}</span>
                                    {isResolvingPart && (
                                        <span className="ml-2 text-xs text-gray-400 inline-flex items-center gap-1">
                                            <Loader2 className="h-3 w-3 animate-spin" /> updating…
                                        </span>
                                    )}
                                </p>
                                <div className="flex flex-wrap gap-3 text-xs text-gray-600 pt-1">
                                    {virtualBalance != null && (
                                        <span>Virtual balance: <strong>{virtualBalance}</strong></span>
                                    )}
                                    {trueBalance != null && (
                                        <span>True balance: <strong>{trueBalance}</strong></span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {isManualEntry && (
                        <div className="space-y-2">
                            <Label className="text-sm font-medium text-[#003594] flex items-center gap-2">
                                <Package className="h-4 w-4" /> Item Name *
                            </Label>
                            <Input
                                value={itemName}
                                onChange={(e) => setItemName(e.target.value)}
                                placeholder="Enter item name"
                                className={errors.itemName ? 'border-red-500' : 'border-[#002a6e]/15'}
                            />
                            {errors.itemName && (
                                <p className="text-sm text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.itemName}</p>
                            )}
                        </div>
                    )}

                    <div className="rounded-lg border border-[#002a6e]/10 overflow-hidden">
                        <div className="px-4 py-2 bg-gray-50 border-b border-[#002a6e]/10">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Quantity & Part</h3>
                        </div>
                        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {!isManualEntry && (
                                <div className="space-y-2 sm:col-span-1">
                                    <Label className="text-sm font-medium text-[#003594]">Part Number *</Label>
                                    <PartNumberSelect
                                        partNumberList={partNumberList}
                                        value={partNumber}
                                        onChange={handlePartNumberChange}
                                        error={errors.partNumber}
                                        disabled={isResolvingPart}
                                    />
                                </div>
                            )}
                            {isManualEntry && (
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium text-[#003594]">Part Number</Label>
                                    <Input
                                        value={partNumber}
                                        onChange={(e) => setPartNumber(sanitizeRequestPartNumberInput(e.target.value))}
                                        placeholder="Letters/numbers, or N/A"
                                        className={errors.partNumber ? 'border-red-500' : 'border-[#002a6e]/15'}
                                    />
                                    {errors.partNumber && (
                                        <p className="text-sm text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.partNumber}</p>
                                    )}
                                </div>
                            )}
                            <div className="space-y-2">
                                <Label className="text-sm font-medium text-[#003594] flex items-center gap-1">
                                    <Scale className="h-3.5 w-3.5" /> Quantity *
                                </Label>
                                <Input
                                    type="number"
                                    min={1}
                                    value={requestQuantity}
                                    onChange={(e) => setRequestQuantity(Number(e.target.value))}
                                    className="border-[#002a6e]/15"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm font-medium text-[#003594]">
                                    Unit *
                                    {!canEditUnit && !isManualEntry && (
                                        <span className="text-xs text-gray-400 font-normal ml-1">(from settings)</span>
                                    )}
                                </Label>
                                {isManualEntry || nacCodeForUnits === 'N/A' ? (
                                    <Input
                                        value={unit}
                                        onChange={(e) => setUnit(e.target.value)}
                                        placeholder="e.g. pcs, kg"
                                        className={errors.unit ? 'border-red-500' : 'border-[#002a6e]/15'}
                                        required
                                    />
                                ) : canEditUnit ? (
                                    <Select value={unit || undefined} onValueChange={setUnit}>
                                        <SelectTrigger className="bg-white border-[#002a6e]/15">
                                            <SelectValue placeholder={isLoadingUnits ? 'Loading…' : 'Select unit'} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableUnits.map((u) => (
                                                <SelectItem key={u} value={u}>{u}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <Input value={unit} disabled className="bg-gray-50 border-[#002a6e]/15" required />
                                )}
                                {errors.unit && <p className="text-sm text-red-500">{errors.unit}</p>}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-lg border border-[#002a6e]/10 overflow-hidden">
                        <div className="px-4 py-2 bg-gray-50 border-b border-[#002a6e]/10">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-2">
                                <Hash className="h-3.5 w-3.5" /> Equipment / Section *
                            </h3>
                        </div>
                        <div className="p-4">
                            <RequestEquipmentSelect
                                nacCode={nacCodeForEquipment}
                                value={equipmentNumber}
                                onChange={setEquipmentNumber}
                                error={errors.equipmentNumber}
                                multiple
                            />
                        </div>
                    </div>

                    <div className="rounded-lg border border-[#002a6e]/10 overflow-hidden">
                        <div className="px-4 py-2 bg-gray-50 border-b border-[#002a6e]/10">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Additional details</h3>
                        </div>
                        <div className="p-4 space-y-4">
                            <div className="space-y-2">
                                <Label className="text-sm font-medium text-[#003594] flex items-center gap-2">
                                    <User className="h-4 w-4" /> Requested By *
                                </Label>
                                <Select
                                    value={requestedById?.toString() || ''}
                                    onValueChange={(value) => {
                                        const selected = authorityOptions?.find((a) => a.id.toString() === value);
                                        if (selected) {
                                            setRequestedById(selected.id);
                                            setRequestedByEmail(selected.email || null);
                                            setErrors((prev) => {
                                                const next = { ...prev };
                                                delete next.requestedBy;
                                                return next;
                                            });
                                        } else {
                                            setRequestedById(null);
                                            setRequestedByEmail(null);
                                        }
                                    }}
                                >
                                    <SelectTrigger className={`bg-white ${errors.requestedBy ? 'border-red-500' : 'border-[#002a6e]/15'}`}>
                                        <SelectValue placeholder="Select requesting authority" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {isLoadingAuthorities ? (
                                            <div className="p-2 text-sm text-gray-500">Loading…</div>
                                        ) : authorityOptions?.length ? (
                                            authorityOptions.map((authority) => (
                                                <SelectItem key={authority.id} value={authority.id.toString()}>
                                                    {authority.name} — {authority.designation}
                                                    {authority.section_name ? ` (${authority.section_name})` : ''}
                                                </SelectItem>
                                            ))
                                        ) : (
                                            <div className="p-2 text-sm text-gray-500">No authorities configured</div>
                                        )}
                                    </SelectContent>
                                </Select>
                                {errors.requestedBy && <p className="text-sm text-red-500">{errors.requestedBy}</p>}
                                {authoritiesError && <p className="text-sm text-red-500">{authoritiesError}</p>}
                            </div>

                            <div className="space-y-2">
                                <Label className="text-sm font-medium text-[#003594] flex items-center gap-2">
                                    <FileText className="h-4 w-4" /> Specifications
                                </Label>
                                <Textarea
                                    value={specifications}
                                    onChange={(e) => setSpecifications(e.target.value)}
                                    placeholder="Optional notes or specifications"
                                    className="min-h-[80px] border-[#002a6e]/15 resize-none"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-sm font-medium text-[#003594] flex items-center gap-2">
                                    <ImageIcon className="h-4 w-4" /> Reference Photo (optional)
                                </Label>
                                <Input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageChange}
                                    className="border-[#002a6e]/15 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-[#003594] file:text-white"
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="flex justify-end gap-3 pt-2 border-t border-[#002a6e]/10">
                        <Button type="button" variant="outline" onClick={handleClose} className="border-[#002a6e]/15">
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={isSubmitting || isResolvingPart}
                            className="bg-[#003594] hover:bg-[#d2293b] text-white min-w-[140px]"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Adding…
                                </>
                            ) : (
                                'Add to Slip'
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
