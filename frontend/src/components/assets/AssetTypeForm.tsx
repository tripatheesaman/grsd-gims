'use client';
import { useState, useEffect } from 'react';
import { AssetTypeWithProperties, CreateAssetTypeDTO, UpdateAssetTypeDTO, VALID_PROPERTY_NAMES, PROPERTY_DISPLAY_LABELS } from '@/types/asset';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
interface AssetTypeFormProps {
    initialData?: AssetTypeWithProperties;
    onSubmit: (data: CreateAssetTypeDTO | UpdateAssetTypeDTO) => void;
    onCancel: () => void;
    canConfigureProperties: boolean;
}
export function AssetTypeForm({ initialData, onSubmit, onCancel, canConfigureProperties }: AssetTypeFormProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [properties, setProperties] = useState<{
        property_name: string;
        is_required: boolean;
        display_order: number;
    }[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    useEffect(() => {
        if (initialData) {
            setName(initialData.name);
            setDescription(initialData.description || '');
            setProperties(initialData.properties?.map((prop, index) => ({
                property_name: prop.property_name,
                is_required: prop.is_required,
                display_order: prop.display_order ?? index,
            })) || []);
        }
    }, [initialData]);
    const toggleProperty = (propertyName: string) => {
        setProperties((prev) => {
            const existing = prev.find((p) => p.property_name === propertyName);
            if (existing) {
                return prev.filter((p) => p.property_name !== propertyName);
            }
            else {
                return [
                    ...prev,
                    {
                        property_name: propertyName,
                        is_required: false,
                        display_order: prev.length,
                    },
                ];
            }
        });
    };
    const toggleRequired = (propertyName: string) => {
        setProperties((prev) => prev.map((p) => p.property_name === propertyName ? { ...p, is_required: !p.is_required } : p));
    };
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            return;
        }
        setIsSubmitting(true);
        try {
            const formData: CreateAssetTypeDTO | UpdateAssetTypeDTO = {
                name: name.trim(),
                description: description.trim() || undefined,
                properties: properties.length > 0 ? properties : undefined,
            };
            await onSubmit(formData);
        }
        finally {
            setIsSubmitting(false);
        }
    };
    return (<form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Name *</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Vehicles, Equipment, Machinery" required className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20"/>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description for this asset type" rows={3} className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20"/>
      </div>

      {canConfigureProperties && (<div className="space-y-4">
          <div>
            <Label className="text-base font-semibold">Configure Properties</Label>
            <p className="text-sm text-gray-600 mt-1">
              Select which properties should be available for assets of this type. Toggle each property on/off and set whether it is required or optional.
            </p>
          </div>

          <div className="border border-[#002a6e]/10 rounded-lg p-4 space-y-3 max-h-96 overflow-y-auto">
            {VALID_PROPERTY_NAMES.map((propertyName) => {
                const isEnabled = properties.some((p) => p.property_name === propertyName);
                const property = properties.find((p) => p.property_name === propertyName);
                return (<div key={propertyName} className="flex items-center justify-between p-3 rounded-lg border border-[#002a6e]/10 hover:bg-[#003594]/5 transition-colors">
                  <div className="flex items-center gap-3 flex-1">
                    <Switch checked={isEnabled} onCheckedChange={() => toggleProperty(propertyName)}/>
                    <div className="flex-1">
                      <Label className="font-medium cursor-pointer" htmlFor={`prop-${propertyName}`}>
                        {PROPERTY_DISPLAY_LABELS[propertyName] || propertyName}
                      </Label>
                    </div>
                  </div>
                  {isEnabled && (<div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${property?.is_required ? 'text-red-600' : 'text-gray-500'}`}>
                          {property?.is_required ? 'Required' : 'Optional'}
                        </span>
                        <Switch id={`req-${propertyName}`} checked={property?.is_required || false} onCheckedChange={() => toggleRequired(propertyName)}/>
                      </div>
                    </div>)}
                </div>);
            })}
          </div>

          {properties.length > 0 && (<div className="text-sm text-gray-600">
              <p>
                <strong>{properties.length}</strong> property/properties enabled
                {properties.filter((p) => p.is_required).length > 0 && (<span>
                    {' '}
                    ({properties.filter((p) => p.is_required).length} required)
                  </span>)}
              </p>
            </div>)}
        </div>)}

      <div className="flex justify-end gap-3 pt-4 border-t border-[#002a6e]/10">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting} className="border-[#002a6e]/10 hover:bg-[#003594]/5 hover:text-[#003594]">
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !name.trim()} className="bg-[#003594] hover:bg-[#003594]/90 text-white disabled:opacity-50">
          {isSubmitting ? (<>
              <Loader2 className="h-4 w-4 mr-2 animate-spin"/>
              {initialData ? 'Updating...' : 'Creating...'}
            </>) : (initialData ? 'Update Asset Type' : 'Create Asset Type')}
        </Button>
      </div>
    </form>);
}
