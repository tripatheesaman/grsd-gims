'use client';
import { useState, useEffect } from 'react';
import { Asset, AssetType, AssetTypeProperty, AssetTypeWithProperties, CreateAssetDTO, UpdateAssetDTO, PROPERTY_DISPLAY_LABELS, } from '@/types/asset';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { API } from '@/lib/api';
interface AssetFormProps {
    assetTypes: AssetType[];
    initialData?: Asset;
    onSubmit: (data: CreateAssetDTO | UpdateAssetDTO) => void;
    onCancel: () => void;
}
export function AssetForm({ assetTypes, initialData, onSubmit, onCancel }: AssetFormProps) {
    const [assetTypeId, setAssetTypeId] = useState<string>('');
    const [name, setName] = useState('');
    const [equipmentCode, setEquipmentCode] = useState<string>('');
    const [location, setLocation] = useState<string>('');
    const [rrpStatus, setRrpStatus] = useState<string>('0');
    const [currentValue, setCurrentValue] = useState<string>('');
    const [insuranceAmount, setInsuranceAmount] = useState<string>('');
    const [servicabilityStatus, setServicabilityStatus] = useState<string>('');
    const [purchaseCurrency, setPurchaseCurrency] = useState<string>('');
    const [purchaseFxRate, setPurchaseFxRate] = useState<string>('');
    const [purchaseAmountBase, setPurchaseAmountBase] = useState<string>('');
    const [propertyValues, setPropertyValues] = useState<Record<string, string>>({});
    const [selectedAssetType, setSelectedAssetType] = useState<AssetTypeWithProperties | null>(null);
    const [isLoadingType, setIsLoadingType] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    useEffect(() => {
        if (initialData) {
            setName(initialData.name);
            setAssetTypeId(initialData.asset_type_id.toString());
            if (initialData.asset_type) {
                setSelectedAssetType(initialData.asset_type);
            }
            else {
                loadAssetType(initialData.asset_type_id);
            }
            const values: Record<string, string> = {};
            if (initialData.property_values) {
                initialData.property_values.forEach((pv) => {
                    values[pv.property_name] = pv.property_value || '';
                });
            }
            setPropertyValues(values);
            setEquipmentCode(initialData.equipment_code ? String(initialData.equipment_code) : '');
            setLocation(initialData.location ? String(initialData.location) : '');
            setRrpStatus(initialData.rrp_status != null && String(initialData.rrp_status) !== '' ? String(initialData.rrp_status) : '0');
            setCurrentValue(initialData.current_value !== null && initialData.current_value !== undefined ? String(initialData.current_value) : '');
            setInsuranceAmount(initialData.insurance_amount !== null && initialData.insurance_amount !== undefined ? String(initialData.insurance_amount) : '');
            setServicabilityStatus(initialData.servicability_status ? String(initialData.servicability_status) : '');
            setPurchaseCurrency(initialData.purchase_currency ? String(initialData.purchase_currency) : '');
            setPurchaseFxRate(initialData.purchase_fx_rate !== null && initialData.purchase_fx_rate !== undefined ? String(initialData.purchase_fx_rate) : '');
            setPurchaseAmountBase(initialData.purchase_amount_base !== null && initialData.purchase_amount_base !== undefined ? String(initialData.purchase_amount_base) : '');
        }
    }, [initialData]);
    const loadAssetType = async (typeId: number) => {
        try {
            setIsLoadingType(true);
            const response = await API.get<AssetTypeWithProperties>(`/api/asset-types/${typeId}`);
            setSelectedAssetType(response.data);
        }
        catch {
        }
        finally {
            setIsLoadingType(false);
        }
    };
    const handleAssetTypeChange = async (value: string) => {
        setAssetTypeId(value);
        setPropertyValues({});
        if (value) {
            await loadAssetType(parseInt(value, 10));
        }
        else {
            setSelectedAssetType(null);
        }
    };
    const handlePropertyChange = (propertyName: string, value: string) => {
        setPropertyValues((prev) => ({
            ...prev,
            [propertyName]: value,
        }));
    };
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const isCreate = !initialData;
        if (!name.trim() || !assetTypeId) {
            return;
        }
        if (isCreate) {
            if (!equipmentCode.trim()) {
                alert('Please enter equipment code');
                return;
            }
            if (!purchaseCurrency.trim()) {
                alert('Please enter purchase currency');
                return;
            }
            if (!purchaseFxRate.trim() || !Number.isFinite(Number(purchaseFxRate)) || Number(purchaseFxRate) <= 0) {
                alert('Please enter a valid purchase FX rate');
                return;
            }
            if (!purchaseAmountBase.trim() || !Number.isFinite(Number(purchaseAmountBase)) || Number(purchaseAmountBase) < 0) {
                alert('Please enter a valid purchase amount');
                return;
            }
            if (!location.trim()) {
                alert('Please enter location');
                return;
            }
            if (!rrpStatus.trim()) {
                alert('Please enter RRP status');
                return;
            }
            if (!['0', '1'].includes(rrpStatus.trim())) {
                alert('RRP status must be 0 or 1');
                return;
            }
            if (!currentValue.trim() || !Number.isFinite(Number(currentValue)) || Number(currentValue) < 0) {
                alert('Please enter a valid current value');
                return;
            }
            if (!insuranceAmount.trim() || !Number.isFinite(Number(insuranceAmount)) || Number(insuranceAmount) < 0) {
                alert('Please enter a valid insurance amount');
                return;
            }
            if (!servicabilityStatus.trim()) {
                alert('Please enter a valid servicability status');
                return;
            }
            setPropertyValues(prev => ({
                ...prev,
                purchase_amount: purchaseAmountBase.trim()
            }));
        }
        if (!isCreate) {
            if (!location.trim()) {
                alert('Please enter location');
                return;
            }
            if (!rrpStatus.trim()) {
                alert('Please enter RRP status');
                return;
            }
            if (!['0', '1'].includes(rrpStatus.trim())) {
                alert('RRP status must be 0 or 1');
                return;
            }
            if (!currentValue.trim() || !Number.isFinite(Number(currentValue)) || Number(currentValue) < 0) {
                alert('Please enter a valid current value');
                return;
            }
            if (!insuranceAmount.trim() || !Number.isFinite(Number(insuranceAmount)) || Number(insuranceAmount) < 0) {
                alert('Please enter a valid insurance amount');
                return;
            }
            if (!servicabilityStatus.trim()) {
                alert('Please enter a valid servicability status');
                return;
            }
        }
        if (selectedAssetType?.properties) {
            const requiredProperties = selectedAssetType.properties.filter((p) => p.is_required);
            for (const prop of requiredProperties) {
                if (prop.property_name === 'purchase_amount' && isCreate && purchaseAmountBase.trim()) {
                    continue;
                }
                if (!propertyValues[prop.property_name]?.trim()) {
                    alert(`Please fill in the required field: ${PROPERTY_DISPLAY_LABELS[prop.property_name] || prop.property_name}`);
                    return;
                }
            }
        }
        setIsSubmitting(true);
        try {
            const formData: CreateAssetDTO | UpdateAssetDTO = {
                ...(initialData
                    ? {
                        location: location.trim(),
                        rrp_status: rrpStatus.trim(),
                        current_value: Number(currentValue),
                        insurance_amount: Number(insuranceAmount),
                        servicability_status: servicabilityStatus.trim(),
                    }
                    : {
                        asset_type_id: parseInt(assetTypeId, 10),
                        equipment_code: equipmentCode.trim(),
                        location: location.trim(),
                        rrp_status: rrpStatus.trim(),
                        current_value: Number(currentValue),
                        insurance_amount: Number(insuranceAmount),
                        servicability_status: servicabilityStatus.trim(),
                        purchase_currency: purchaseCurrency.trim(),
                        purchase_fx_rate: Number(purchaseFxRate),
                        purchase_amount_base: Number(purchaseAmountBase),
                    }),
                name: name.trim(),
                property_values: Object.entries(propertyValues)
                    .filter((entry) => entry[1].trim())
                    .map(([property_name, property_value]) => ({
                    property_name,
                    property_value: property_value.trim(),
                })),
            };
            await onSubmit(formData);
        }
        finally {
            setIsSubmitting(false);
        }
    };
    return (<form onSubmit={handleSubmit} className="space-y-6">
      {!initialData && (<div className="space-y-2">
          <Label htmlFor="assetType">Asset Type *</Label>
          <Select value={assetTypeId} onValueChange={handleAssetTypeChange} required>
            <SelectTrigger className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20">
              <SelectValue placeholder="Select an asset type"/>
            </SelectTrigger>
            <SelectContent>
              {assetTypes.map((type) => (<SelectItem key={type.id} value={type.id.toString()}>
                  {type.name}
                </SelectItem>))}
            </SelectContent>
          </Select>
        </div>)}

      {initialData && (<div className="space-y-2">
          <Label>Asset Type</Label>
          <p className="text-sm text-gray-600">
            {selectedAssetType?.name || 'Loading...'}
          </p>
        </div>)}

      <div className="space-y-2">
        <Label htmlFor="name">Asset Name *</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter asset name" required className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20"/>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="equipmentCode">Equipment Code *</Label>
          <Input id="equipmentCode" value={equipmentCode} onChange={(e) => setEquipmentCode(e.target.value)} placeholder="Enter equipment code" required disabled={!!initialData} className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20"/>
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">Location *</Label>
          <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Enter location" required className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20"/>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rrpStatus">RRP Status *</Label>
          <Select value={rrpStatus} onValueChange={setRrpStatus} required>
            <SelectTrigger className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20">
              <SelectValue placeholder="Select RRP status"/>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">0 — RRP yet to be made</SelectItem>
              <SelectItem value="1">1 — RRP already made</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="currentValue">Current Value *</Label>
          <Input id="currentValue" type="number" step="0.01" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} placeholder="Enter current value" required className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20"/>
        </div>
        <div className="space-y-2">
          <Label htmlFor="insuranceAmount">Insurance Amount *</Label>
          <Input id="insuranceAmount" type="number" step="0.01" value={insuranceAmount} onChange={(e) => setInsuranceAmount(e.target.value)} placeholder="Enter insurance amount" required className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20"/>
        </div>
        <div className="space-y-2">
          <Label htmlFor="servicabilityStatus">Servicability Status *</Label>
          <Input id="servicabilityStatus" value={servicabilityStatus} onChange={(e) => setServicabilityStatus(e.target.value)} placeholder="e.g., serviceable / unserviceable" required className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20"/>
        </div>
        <div className="space-y-2">
          <Label htmlFor="purchaseCurrency">Purchase Currency *</Label>
          <Input id="purchaseCurrency" value={purchaseCurrency} onChange={(e) => setPurchaseCurrency(e.target.value)} placeholder="e.g., NPR" required disabled={!!initialData} className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20"/>
        </div>
        <div className="space-y-2">
          <Label htmlFor="purchaseFxRate">Purchase FX Rate *</Label>
          <Input id="purchaseFxRate" type="number" step="0.0001" value={purchaseFxRate} onChange={(e) => setPurchaseFxRate(e.target.value)} placeholder="e.g., 1" required disabled={!!initialData} className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20"/>
        </div>
        <div className="space-y-2">
          <Label htmlFor="purchaseAmountBase">Purchase Amount Base *</Label>
          <Input id="purchaseAmountBase" type="number" step="0.01" value={purchaseAmountBase} onChange={(e) => setPurchaseAmountBase(e.target.value)} placeholder="Enter base amount" required disabled={!!initialData} className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20"/>
        </div>
      </div>

      {isLoadingType ? (<div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-[#003594]"/>
        </div>) : selectedAssetType?.properties && selectedAssetType.properties.length > 0 ? (<div className="space-y-4">
          <div>
            <Label className="text-base font-semibold">Asset Properties</Label>
            <p className="text-sm text-gray-600 mt-1">
              Fill in the properties for this asset. Required fields are marked with *.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {selectedAssetType.properties.map((property: AssetTypeProperty) => {
                const displayLabel = PROPERTY_DISPLAY_LABELS[property.property_name] || property.property_name;
                const value = propertyValues[property.property_name] || '';
                const isPurchaseAmountProperty = property.property_name === 'purchase_amount';
                const shouldDisable = !!initialData && isPurchaseAmountProperty;
                return (<div key={property.property_name} className="space-y-2">
                  <Label htmlFor={`prop-${property.property_name}`}>
                    {displayLabel}
                    {property.is_required && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  <Input id={`prop-${property.property_name}`} value={value} onChange={(e) => handlePropertyChange(property.property_name, e.target.value)} placeholder={`Enter ${displayLabel.toLowerCase()}`} required={property.is_required} disabled={shouldDisable} className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20"/>
                </div>);
            })}
          </div>
        </div>) : selectedAssetType && (!selectedAssetType.properties || selectedAssetType.properties.length === 0) ? (<div className="text-sm text-gray-500 py-4 text-center border border-dashed border-[#002a6e]/20 rounded-lg">
          No properties configured for this asset type. You can add properties in the Asset Types section.
        </div>) : null}

      <div className="flex justify-end gap-3 pt-4 border-t border-[#002a6e]/10">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting} className="border-[#002a6e]/10 hover:bg-[#003594]/5 hover:text-[#003594]">
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !name.trim() || (!initialData && !assetTypeId)} className="bg-[#003594] hover:bg-[#003594]/90 text-white disabled:opacity-50">
          {isSubmitting ? (<>
              <Loader2 className="h-4 w-4 mr-2 animate-spin"/>
              {initialData ? 'Updating...' : 'Creating...'}
            </>) : (initialData ? 'Update Asset' : 'Create Asset')}
        </Button>
      </div>
    </form>);
}
