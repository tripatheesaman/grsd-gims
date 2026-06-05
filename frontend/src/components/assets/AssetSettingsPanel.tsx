'use client';

import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Loader2, Plus, X } from 'lucide-react';

type ListKey = 'locations' | 'servicability_statuses' | 'weight_units' | 'size_units' | 'quantity_units';

export function AssetSettingsPanel() {
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [settings, setSettings] = useState<Record<ListKey, string[]>>({
        locations: [],
        servicability_statuses: [],
        weight_units: [],
        size_units: [],
        quantity_units: [],
    });
    const [newItem, setNewItem] = useState<Record<ListKey, string>>({
        locations: '',
        servicability_statuses: '',
        weight_units: '',
        size_units: '',
        quantity_units: '',
    });

    useEffect(() => {
        API.get('/api/settings/assets')
            .then((res) => setSettings({
                locations: res.data.locations || [],
                servicability_statuses: res.data.servicability_statuses || [],
                weight_units: res.data.weight_units || ['KG'],
                size_units: res.data.size_units || ['M'],
                quantity_units: res.data.quantity_units || ['EA'],
            }))
            .catch(() => showErrorToast({ title: 'Error', message: 'Failed to load settings', duration: 3000 }))
            .finally(() => setIsLoading(false));
    }, [showErrorToast]);

    const addToList = (key: ListKey) => {
        const v = newItem[key].trim();
        if (!v) return;
        setSettings((s) => ({ ...s, [key]: [...(s[key] || []), v] }));
        setNewItem((n) => ({ ...n, [key]: '' }));
    };

    const removeFromList = (key: ListKey, index: number) => {
        setSettings((s) => ({ ...s, [key]: s[key].filter((_, i) => i !== index) }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await API.put('/api/settings/assets', settings);
            showSuccessToast({ title: 'Saved', message: 'Asset settings updated', duration: 3000 });
        }
        catch {
            showErrorToast({ title: 'Error', message: 'Failed to save settings', duration: 3000 });
        }
        finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#003594]" />
            </div>
        );
    }

    const renderList = (key: ListKey, label: string) => (
        <div key={key} className="rounded-lg border border-slate-200 p-4 space-y-3">
            <Label className="font-semibold text-[#003594]">{label}</Label>
            <ul className="flex flex-wrap gap-2">
                {(settings[key] || []).map((item, i) => (
                    <li key={`${item}-${i}`} className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-sm">
                        {item}
                        <button type="button" onClick={() => removeFromList(key, i)} aria-label="Remove">
                            <X className="h-3 w-3" />
                        </button>
                    </li>
                ))}
            </ul>
            <div className="flex gap-2">
                <Input
                    value={newItem[key]}
                    onChange={(e) => setNewItem((n) => ({ ...n, [key]: e.target.value }))}
                    placeholder={`Add ${label.toLowerCase()}…`}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addToList(key))}
                />
                <Button type="button" variant="outline" size="icon" onClick={() => addToList(key)}>
                    <Plus className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            <p className="text-sm text-gray-600">
                Configure locations, servicability options, and units used in Capital RRP and asset records.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
                {renderList('locations', 'Locations')}
                {renderList('servicability_statuses', 'Servicability statuses')}
                {renderList('weight_units', 'Weight units')}
                {renderList('size_units', 'Size units')}
                {renderList('quantity_units', 'Quantity units')}
            </div>
            <Button className="bg-[#003594] hover:bg-[#d2293b]" disabled={isSaving} onClick={handleSave}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save settings
            </Button>
        </div>
    );
}
