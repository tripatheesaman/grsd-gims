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
        }
    }, [initialData]);
    const loadAssetType = async (typeId: number) => {
        try {
            setIsLoadingType(true);
            const response = await API.get<AssetTypeWithProperties>(`/api/asset-types/${typeId}`);
            setSelectedAssetType(response.data);
        }
        catch (error) {
            console.error('Failed to load asset type:', error);
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
        if (!name.trim() || !assetTypeId) {
            return;
        }
        if (selectedAssetType?.properties) {
            const requiredProperties = selectedAssetType.properties.filter((p) => p.is_required);
            for (const prop of requiredProperties) {
                if (!propertyValues[prop.property_name]?.trim()) {
                    alert(`Please fill in the required field: ${PROPERTY_DISPLAY_LABELS[prop.property_name] || prop.property_name}`);
                    return;
                }
            }
        }
        setIsSubmitting(true);
        try {
            const formData: CreateAssetDTO | UpdateAssetDTO = {
                ...(initialData ? {} : { asset_type_id: parseInt(assetTypeId, 10) }),
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
                return (<div key={property.property_name} className="space-y-2">
                  <Label htmlFor={`prop-${property.property_name}`}>
                    {displayLabel}
                    {property.is_required && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  <Input id={`prop-${property.property_name}`} value={value} onChange={(e) => handlePropertyChange(property.property_name, e.target.value)} placeholder={`Enter ${displayLabel.toLowerCase()}`} required={property.is_required} className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20"/>
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
