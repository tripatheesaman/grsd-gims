'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Asset,
    AssetType,
    AssetTypeProperty,
    AssetTypeWithProperties,
    CreateAssetDTO,
    UpdateAssetDTO,
    PROPERTY_DISPLAY_LABELS,
} from '@/types/asset';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { API } from '@/lib/api';
import { useCustomToast } from '@/components/ui/custom-toast';
import { useAssetSettings } from '@/hooks/useAssetSettings';
import { useRRP } from '@/hooks/useRRP';
import {
    formatNprAmount,
    formatUsdAmount,
    getAssetBookValueNpr,
    getAssetInsuranceBookValueUsd,
    getAssetOriginalInsuranceAmountUsd,
    getAssetOriginalPurchaseCostNpr,
} from '@/utils/assetValue';
import { ASSET_TABLE_FIELD_PROPERTIES, combineValueWithUnit, parseValueWithUnit } from './assetFormUtils';
import { AssetPropertyField, initPropertyUnits } from './AssetPropertyField';

interface AssetFormProps {
    assetTypes: AssetType[];
    initialData?: Asset;
    onSubmit: (data: CreateAssetDTO | UpdateAssetDTO) => void | Promise<void>;
    onCancel: () => void;
}

function sectionTitle(text: string) {
    return (
        <h3 className="border-b border-slate-100 pb-2 text-sm font-semibold uppercase tracking-wide text-[#003594]">
            {text}
        </h3>
    );
}

export function AssetForm({ assetTypes, initialData, onSubmit, onCancel }: AssetFormProps) {
    const { showErrorToast } = useCustomToast();
    const { data: assetSettings } = useAssetSettings();
    const { getCurrencies } = useRRP();

    const [assetTypeId, setAssetTypeId] = useState('');
    const [name, setName] = useState('');
    const [equipmentCode, setEquipmentCode] = useState('');
    const [location, setLocation] = useState('');
    const [rrpStatus, setRrpStatus] = useState('0');
    const [currentValue, setCurrentValue] = useState('');
    const [servicabilityStatus, setServicabilityStatus] = useState('');
    const [purchaseCurrency, setPurchaseCurrency] = useState('NPR');
    const [purchaseFxRate, setPurchaseFxRate] = useState('1');
    const [purchaseAmountBase, setPurchaseAmountBase] = useState('');
    const [propertyValues, setPropertyValues] = useState<Record<string, string>>({});
    const [propertyUnits, setPropertyUnits] = useState<Record<string, string>>({});
    const [selectedAssetType, setSelectedAssetType] = useState<AssetTypeWithProperties | null>(null);
    const [isLoadingType, setIsLoadingType] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isCreate = !initialData;
    const currencies = useMemo(() => {
        const fromRrp = getCurrencies();
        const merged = new Set([...(fromRrp.length ? fromRrp : ['NPR', 'USD']), 'NPR', 'USD']);
        return [...merged];
    }, [getCurrencies]);

    const locations = useMemo(() => assetSettings?.locations ?? [], [assetSettings?.locations]);
    const servicabilityOptions = useMemo(
        () => assetSettings?.servicability_statuses ?? [],
        [assetSettings?.servicability_statuses]
    );
    const weightUnits = useMemo(() => assetSettings?.weight_units ?? ['KG'], [assetSettings?.weight_units]);
    const sizeUnits = useMemo(() => assetSettings?.size_units ?? ['M'], [assetSettings?.size_units]);
    const quantityUnits = useMemo(() => assetSettings?.quantity_units ?? ['EA'], [assetSettings?.quantity_units]);

    const derivedInsuranceUsd = useMemo(() => {
        const base = Number(purchaseAmountBase);
        return Number.isFinite(base) && base > 0 ? base : null;
    }, [purchaseAmountBase]);

    const suggestedNprCost = useMemo(() => {
        const base = Number(purchaseAmountBase);
        const fx = Number(purchaseFxRate);
        if (!Number.isFinite(base) || !Number.isFinite(fx) || base < 0 || fx <= 0) return null;
        return base * fx;
    }, [purchaseAmountBase, purchaseFxRate]);

    const loadAssetType = useCallback(async (typeId: number) => {
        try {
            setIsLoadingType(true);
            const response = await API.get<AssetTypeWithProperties>(`/api/asset-types/${typeId}`);
            setSelectedAssetType(response.data);
        } catch {
            showErrorToast({ title: 'Error', message: 'Failed to load asset type properties', duration: 3000 });
        } finally {
            setIsLoadingType(false);
        }
    }, [showErrorToast]);

    useEffect(() => {
        if (!initialData && assetSettings?.default_asset_type_id && !assetTypeId) {
            const defaultId = String(assetSettings.default_asset_type_id);
            setAssetTypeId(defaultId);
            void loadAssetType(assetSettings.default_asset_type_id);
        }
    }, [assetSettings?.default_asset_type_id, initialData, assetTypeId, loadAssetType]);

    useEffect(() => {
        if (initialData) {
            setName(initialData.name);
            setAssetTypeId(initialData.asset_type_id.toString());
            if (initialData.asset_type) {
                setSelectedAssetType(initialData.asset_type);
            } else {
                void loadAssetType(initialData.asset_type_id);
            }
            const values: Record<string, string> = {};
            initialData.property_values?.forEach((pv) => {
                if (pv.property_name === 'weight' || pv.property_name === 'size') {
                    const parsed = parseValueWithUnit(pv.property_value || '');
                    values[pv.property_name] = parsed.value;
                } else {
                    values[pv.property_name] = pv.property_value || '';
                }
            });
            setPropertyValues(values);
            setPropertyUnits(initPropertyUnits(
                Object.fromEntries(
                    (initialData.property_values || []).map((pv) => [pv.property_name, pv.property_value || ''])
                ),
                weightUnits,
                sizeUnits,
                quantityUnits
            ));
            setEquipmentCode(initialData.equipment_code ? String(initialData.equipment_code) : '');
            setLocation(initialData.location ? String(initialData.location) : '');
            setRrpStatus(initialData.rrp_status != null && String(initialData.rrp_status) !== '' ? String(initialData.rrp_status) : '0');
            setCurrentValue(
                initialData.current_value !== null && initialData.current_value !== undefined
                    ? String(initialData.current_value)
                    : ''
            );
            setServicabilityStatus(initialData.servicability_status ? String(initialData.servicability_status) : '');
            setPurchaseCurrency(initialData.purchase_currency ? String(initialData.purchase_currency) : 'NPR');
            setPurchaseFxRate(
                initialData.purchase_fx_rate !== null && initialData.purchase_fx_rate !== undefined
                    ? String(initialData.purchase_fx_rate)
                    : '1'
            );
            setPurchaseAmountBase(
                initialData.purchase_amount_base !== null && initialData.purchase_amount_base !== undefined
                    ? String(initialData.purchase_amount_base)
                    : ''
            );
        }
    }, [initialData, loadAssetType, weightUnits, sizeUnits, quantityUnits]);

    useEffect(() => {
        if (isCreate && servicabilityOptions.length && !servicabilityStatus) {
            setServicabilityStatus(servicabilityOptions[0]);
        }
        if (isCreate && locations.length && !location) {
            setLocation(locations[0]);
        }
    }, [isCreate, servicabilityOptions, locations, servicabilityStatus, location]);

    useEffect(() => {
        if (isCreate && purchaseCurrency === 'NPR') {
            setPurchaseFxRate('1');
        }
    }, [isCreate, purchaseCurrency]);

    useEffect(() => {
        if (!isCreate || !selectedAssetType?.properties?.length) return;
        setPropertyUnits((prev) => {
            const next = { ...prev };
            for (const prop of selectedAssetType.properties) {
                if ((prop.property_name === 'weight' || prop.property_name === 'size') && !next[prop.property_name]) {
                    next[prop.property_name] =
                        prop.property_name === 'weight' ? weightUnits[0] || 'KG' : sizeUnits[0] || 'M';
                }
                if (prop.property_name === 'quantity' && !next.quantity) {
                    next.quantity = quantityUnits[0] || 'EA';
                }
            }
            return next;
        });
    }, [isCreate, selectedAssetType, weightUnits, sizeUnits, quantityUnits]);

    const handleAssetTypeChange = async (value: string) => {
        setAssetTypeId(value);
        setPropertyValues({});
        setPropertyUnits({});
        if (value) {
            await loadAssetType(parseInt(value, 10));
        } else {
            setSelectedAssetType(null);
        }
    };

    const typeProperties = useMemo(() => {
        if (!selectedAssetType?.properties?.length) return [];
        return [...selectedAssetType.properties]
            .filter((p) => !ASSET_TABLE_FIELD_PROPERTIES.has(p.property_name))
            .filter((p) => !(isCreate && p.property_name === 'purchase_amount'))
            .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.property_name.localeCompare(b.property_name));
    }, [selectedAssetType, isCreate]);

    const handlePropertyValueChange = (propertyName: string, value: string) => {
        setPropertyValues((prev) => ({ ...prev, [propertyName]: value }));
    };

    const handlePropertyUnitChange = (propertyName: string, unit: string) => {
        setPropertyUnits((prev) => ({ ...prev, [propertyName]: unit }));
    };

    const buildPropertyPayload = (): Array<{ property_name: string; property_value: string }> => {
        const entries: Array<{ property_name: string; property_value: string }> = [];

        for (const prop of typeProperties) {
            let value = propertyValues[prop.property_name]?.trim() || '';
            const unitKey = prop.property_name;
            if (prop.property_name === 'weight' || prop.property_name === 'size') {
                const defaultUnit =
                    prop.property_name === 'weight' ? weightUnits[0] || 'KG' : sizeUnits[0] || 'M';
                value = combineValueWithUnit(value, propertyUnits[unitKey] || defaultUnit);
            }
            if (prop.property_name === 'quantity' && value) {
                entries.push({
                    property_name: 'unit',
                    property_value: propertyUnits.quantity || quantityUnits[0] || 'EA',
                });
            }
            if (value) {
                entries.push({ property_name: prop.property_name, property_value: value });
            }
        }

        if (isCreate && purchaseAmountBase.trim()) {
            const hasPurchaseAmount = entries.some((e) => e.property_name === 'purchase_amount');
            if (!hasPurchaseAmount) {
                entries.push({ property_name: 'purchase_amount', property_value: purchaseAmountBase.trim() });
            }
        }

        return entries;
    };

    const validate = (): boolean => {
        if (!name.trim()) {
            showErrorToast({ title: 'Validation', message: 'Asset name is required', duration: 3000 });
            return false;
        }
        if (isCreate && !assetTypeId) {
            showErrorToast({ title: 'Validation', message: 'Please select an asset type', duration: 3000 });
            return false;
        }
        if (isCreate && !equipmentCode.trim()) {
            showErrorToast({ title: 'Validation', message: 'Equipment code (GE number) is required', duration: 3000 });
            return false;
        }
        if (!location.trim()) {
            showErrorToast({ title: 'Validation', message: 'Location is required', duration: 3000 });
            return false;
        }
        if (!['0', '1'].includes(rrpStatus.trim())) {
            showErrorToast({ title: 'Validation', message: 'RRP status must be 0 or 1', duration: 3000 });
            return false;
        }
        if (!servicabilityStatus.trim()) {
            showErrorToast({ title: 'Validation', message: 'Servicability status is required', duration: 3000 });
            return false;
        }
        if (isCreate) {
            if (!purchaseCurrency.trim()) {
                showErrorToast({ title: 'Validation', message: 'Purchase currency is required', duration: 3000 });
                return false;
            }
            const fx = Number(purchaseFxRate);
            if (!Number.isFinite(fx) || fx <= 0) {
                showErrorToast({ title: 'Validation', message: 'Enter a valid FX rate greater than zero', duration: 3000 });
                return false;
            }
            const base = Number(purchaseAmountBase);
            if (!Number.isFinite(base) || base < 0) {
                showErrorToast({ title: 'Validation', message: 'Enter a valid purchase amount (base)', duration: 3000 });
                return false;
            }
            const npr = Number(currentValue);
            if (!Number.isFinite(npr) || npr < 0) {
                showErrorToast({ title: 'Validation', message: 'Enter a valid purchase cost in NPR', duration: 3000 });
                return false;
            }
        }

        for (const prop of typeProperties) {
            if (!prop.is_required) continue;
            if (prop.property_name === 'purchase_amount' && isCreate && purchaseAmountBase.trim()) continue;

            let value = propertyValues[prop.property_name]?.trim() || '';
            if (prop.property_name === 'weight' || prop.property_name === 'size') {
                const defaultUnit =
                    prop.property_name === 'weight' ? weightUnits[0] || 'KG' : sizeUnits[0] || 'M';
                value = combineValueWithUnit(value, propertyUnits[prop.property_name] || defaultUnit);
            }
            if (!value) {
                const label = PROPERTY_DISPLAY_LABELS[prop.property_name] || prop.property_name;
                showErrorToast({ title: 'Validation', message: `Required field missing: ${label}`, duration: 4000 });
                return false;
            }
        }
        return true;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;

        setIsSubmitting(true);
        try {
            const property_values = buildPropertyPayload();
            const formData: CreateAssetDTO | UpdateAssetDTO = {
                ...(isCreate
                    ? {
                          asset_type_id: parseInt(assetTypeId, 10),
                          equipment_code: equipmentCode.trim(),
                          location: location.trim(),
                          rrp_status: rrpStatus.trim(),
                          current_value: Number(currentValue),
                          servicability_status: servicabilityStatus.trim(),
                          purchase_currency: purchaseCurrency.trim(),
                          purchase_fx_rate: Number(purchaseFxRate),
                          purchase_amount_base: Number(purchaseAmountBase),
                      }
                    : {
                          location: location.trim(),
                          rrp_status: rrpStatus.trim(),
                          servicability_status: servicabilityStatus.trim(),
                      }),
                name: name.trim(),
                property_values,
            };
            await onSubmit(formData);
        } finally {
            setIsSubmitting(false);
        }
    };

    const applySuggestedNpr = () => {
        if (suggestedNprCost != null) {
            setCurrentValue(String(Math.round(suggestedNprCost * 100) / 100));
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-8">
            <section className="space-y-4">
                {sectionTitle('Identity')}
                <div className="grid gap-4 md:grid-cols-2">
                    {isCreate ? (
                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="assetType">Asset type *</Label>
                            <Select value={assetTypeId} onValueChange={handleAssetTypeChange} required>
                                <SelectTrigger id="assetType" className="border-[#002a6e]/10">
                                    <SelectValue placeholder="Select configured asset type" />
                                </SelectTrigger>
                                <SelectContent>
                                    {assetTypes.map((type) => (
                                        <SelectItem key={type.id} value={type.id.toString()}>
                                            {type.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {selectedAssetType?.description && (
                                <p className="text-xs text-slate-500">{selectedAssetType.description}</p>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-2 md:col-span-2">
                            <Label>Asset type</Label>
                            <p className="text-sm font-medium text-slate-800">
                                {selectedAssetType?.name || 'Loading…'}
                            </p>
                        </div>
                    )}

                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="name">Asset name *</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Equipment / asset display name"
                            required
                            className="border-[#002a6e]/10"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="equipmentCode">Equipment code (GE no.) *</Label>
                        <Input
                            id="equipmentCode"
                            value={equipmentCode}
                            onChange={(e) => setEquipmentCode(e.target.value)}
                            placeholder="e.g. 312"
                            required
                            disabled={!isCreate}
                            className="border-[#002a6e]/10"
                        />
                    </div>
                </div>
            </section>

            <section className="space-y-4">
                {sectionTitle('Location & status')}
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="location">Location *</Label>
                        {locations.length > 0 ? (
                            <Select value={location} onValueChange={setLocation} required>
                                <SelectTrigger id="location" className="border-[#002a6e]/10">
                                    <SelectValue placeholder="Select location" />
                                </SelectTrigger>
                                <SelectContent>
                                    {locations.map((loc) => (
                                        <SelectItem key={loc} value={loc}>
                                            {loc}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <Input
                                id="location"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                placeholder="Configure locations in Asset Settings"
                                required
                                className="border-[#002a6e]/10"
                            />
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="rrpStatus">RRP status *</Label>
                        <Select value={rrpStatus} onValueChange={setRrpStatus} required>
                            <SelectTrigger id="rrpStatus" className="border-[#002a6e]/10">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="0">0 — RRP not yet made</SelectItem>
                                <SelectItem value="1">1 — RRP already made</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="servicabilityStatus">Servicability *</Label>
                        {servicabilityOptions.length > 0 ? (
                            <Select value={servicabilityStatus} onValueChange={setServicabilityStatus} required>
                                <SelectTrigger id="servicabilityStatus" className="border-[#002a6e]/10">
                                    <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent>
                                    {servicabilityOptions.map((opt) => (
                                        <SelectItem key={opt} value={opt}>
                                            {opt}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <Input
                                id="servicabilityStatus"
                                value={servicabilityStatus}
                                onChange={(e) => setServicabilityStatus(e.target.value)}
                                placeholder="Configure in Asset Settings"
                                required
                                className="border-[#002a6e]/10"
                            />
                        )}
                    </div>
                </div>
            </section>

            <section className="space-y-4">
                {sectionTitle('Financial (maps to assets table)')}
                <div className="grid gap-4 md:grid-cols-2">
                    {isCreate ? (
                        <>
                            <div className="space-y-2">
                                <Label htmlFor="purchaseCurrency">Purchase currency *</Label>
                                <Select value={purchaseCurrency} onValueChange={setPurchaseCurrency} required>
                                    <SelectTrigger id="purchaseCurrency" className="border-[#002a6e]/10">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {currencies.map((c) => (
                                            <SelectItem key={c} value={c}>
                                                {c}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="purchaseFxRate">FX rate to NPR *</Label>
                                <Input
                                    id="purchaseFxRate"
                                    type="number"
                                    step="0.0001"
                                    min="0"
                                    value={purchaseFxRate}
                                    onChange={(e) => setPurchaseFxRate(e.target.value)}
                                    disabled={purchaseCurrency === 'NPR'}
                                    required
                                    className="border-[#002a6e]/10"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="purchaseAmountBase">Purchase amount (base currency) *</Label>
                                <Input
                                    id="purchaseAmountBase"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={purchaseAmountBase}
                                    onChange={(e) => setPurchaseAmountBase(e.target.value)}
                                    required
                                    className="border-[#002a6e]/10"
                                />
                                <p className="text-xs text-slate-500">Stored as purchase_amount_base; also used for insurance baseline (USD).</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="currentValue">Purchase cost (NPR) * — current_value</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="currentValue"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={currentValue}
                                        onChange={(e) => setCurrentValue(e.target.value)}
                                        required
                                        className="border-[#002a6e]/10"
                                    />
                                    {suggestedNprCost != null && (
                                        <Button type="button" variant="outline" size="sm" onClick={applySuggestedNpr} className="shrink-0">
                                            Use {formatNprAmount(suggestedNprCost)}
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-2 md:col-span-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3 text-sm">
                                <p className="text-slate-600">
                                    Initial insurance (USD):{' '}
                                    <span className="font-medium text-slate-900 tabular-nums">
                                        {formatUsdAmount(derivedInsuranceUsd)}
                                    </span>
                                    {' · '}Depreciates 10% per fiscal year
                                </p>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <Label>Purchase cost (NPR)</Label>
                                <p className="text-sm font-medium tabular-nums text-slate-800">
                                    {formatNprAmount(getAssetOriginalPurchaseCostNpr(initialData!))}
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>Current book value (NPR)</Label>
                                <p className="text-sm font-medium tabular-nums text-[#003594]">
                                    {formatNprAmount(getAssetBookValueNpr(initialData!))}
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>Insurance base (USD)</Label>
                                <p className="text-sm font-medium tabular-nums text-slate-800">
                                    {formatUsdAmount(getAssetOriginalInsuranceAmountUsd(initialData!))}
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>Insurance book value (USD)</Label>
                                <p className="text-sm font-medium tabular-nums text-[#003594]">
                                    {formatUsdAmount(getAssetInsuranceBookValueUsd(initialData!))}
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </section>

            {isLoadingType ? (
                <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-[#003594]" />
                </div>
            ) : typeProperties.length > 0 ? (
                <section className="space-y-4">
                    {sectionTitle(`Type properties — ${selectedAssetType?.name || 'Asset'}`)}
                    <p className="text-sm text-slate-500">
                        Fields configured for this asset type. Required properties are marked with *.
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                        {typeProperties.map((property: AssetTypeProperty) => (
                            <AssetPropertyField
                                key={property.property_name}
                                property={property}
                                value={propertyValues[property.property_name] || ''}
                                unit={propertyUnits[property.property_name] || ''}
                                onValueChange={(v) => handlePropertyValueChange(property.property_name, v)}
                                onUnitChange={(u) => handlePropertyUnitChange(property.property_name, u)}
                                weightUnits={weightUnits}
                                sizeUnits={sizeUnits}
                                quantityUnits={quantityUnits}
                                disabled={!isCreate && property.property_name === 'purchase_amount'}
                            />
                        ))}
                    </div>
                </section>
            ) : selectedAssetType ? (
                <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500">
                    No extra properties for this type. Add properties under Asset Types if needed.
                </div>
            ) : isCreate ? (
                <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/50 py-4 text-center text-sm text-amber-900">
                    Select an asset type to see its configured property fields.
                </div>
            ) : null}

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button
                    type="submit"
                    disabled={isSubmitting || !name.trim() || (isCreate && !assetTypeId)}
                    className="bg-[#003594] hover:bg-[#003594]/90"
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {isCreate ? 'Creating…' : 'Saving…'}
                        </>
                    ) : isCreate ? (
                        'Create asset'
                    ) : (
                        'Save changes'
                    )}
                </Button>
            </div>
        </form>
    );
}
