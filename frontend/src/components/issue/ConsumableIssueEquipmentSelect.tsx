'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/utils/utils';
import { Button } from '@/components/ui/button';
import { API } from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';

interface IssueSection {
    id: number;
    name: string;
    code: string;
}

interface EquipmentOptionRow {
    equipmentCode: string;
    name?: string;
    label: string;
}

interface ConsumableIssueEquipmentSelectProps {
    value: string;
    onChange: (value: string) => void;
    sections: IssueSection[];
    error?: string;
}

type SelectOption = {
    value: string;
    label: string;
    kind: 'section' | 'equipment';
};

export function ConsumableIssueEquipmentSelect({
    value,
    onChange,
    sections,
    error,
}: ConsumableIssueEquipmentSelectProps) {
    const [open, setOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [assetOptions, setAssetOptions] = useState<SelectOption[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const debouncedQuery = useDebounce(inputValue, 300);

    const sectionOptions = useMemo<SelectOption[]>(
        () => sections.map((s) => ({
            value: s.code,
            label: `${s.name} (Section)`,
            kind: 'section' as const,
        })),
        [sections]
    );

    const fetchAssets = useCallback(async (query: string) => {
        const trimmed = query.trim();
        if (!trimmed) {
            setAssetOptions([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const res = await API.get('/api/issue/equipment-options', {
                params: { search: trimmed, limit: 50 },
            });
            const rows: EquipmentOptionRow[] = Array.isArray(res.data?.options) ? res.data.options : [];
            setAssetOptions(
                rows.map((row) => ({
                    value: row.equipmentCode,
                    label: row.label || row.equipmentCode,
                    kind: 'equipment' as const,
                }))
            );
        } catch {
            setAssetOptions([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!open) return;
        void fetchAssets(debouncedQuery);
    }, [open, debouncedQuery, fetchAssets]);

    useEffect(() => {
        if (!open) {
            setInputValue('');
            setAssetOptions([]);
        }
    }, [open]);

    const filteredSections = useMemo(() => {
        const q = inputValue.toLowerCase();
        if (!q) return sectionOptions;
        return sectionOptions.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
    }, [sectionOptions, inputValue]);

    const selectedLabel = useMemo(() => {
        const section = sectionOptions.find((o) => o.value === value);
        if (section) return section.label;
        if (value) return value;
        return '';
    }, [value, sectionOptions]);

    const handleSelect = (optionValue: string) => {
        onChange(optionValue);
        setOpen(false);
        setInputValue('');
    };

    const showTypeToSearch = !inputValue.trim() && assetOptions.length === 0 && !isLoading;

    return (
        <div className="flex flex-col gap-1.5">
            <div className="relative">
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn('w-full justify-between', error ? 'border-red-500' : '')}
                    onClick={() => setOpen(!open)}
                >
                    <span className="truncate">{selectedLabel || 'Select equipment or section...'}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
                {open && (
                    <div className="absolute w-full z-[9999] bg-white rounded-md border shadow-md mt-1">
                        <div className="flex w-full items-center border-b px-3">
                            <input
                                className="flex h-9 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                                placeholder="Type equipment number (e.g. 312)..."
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <div className="max-h-[240px] overflow-y-auto">
                            {filteredSections.length > 0 && (
                                <div>
                                    <p className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase">Sections</p>
                                    {filteredSections.map((option) => (
                                        <div
                                            key={`section-${option.value}`}
                                            onClick={() => handleSelect(option.value)}
                                            className={cn(
                                                'relative flex w-full cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none',
                                                'hover:bg-accent hover:text-accent-foreground',
                                                value === option.value && 'bg-accent text-accent-foreground'
                                            )}
                                        >
                                            <Check className={cn('mr-2 h-4 w-4 flex-shrink-0', value === option.value ? 'opacity-100' : 'opacity-0')} />
                                            <span className="flex-1">{option.label}</span>
                                            <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Section</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div>
                                <p className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase">Assets</p>
                                {isLoading ? (
                                    <p className="p-3 text-sm text-muted-foreground">Searching assets...</p>
                                ) : showTypeToSearch ? (
                                    <p className="p-3 text-sm text-muted-foreground">
                                        Enter an equipment number to search registered assets.
                                    </p>
                                ) : assetOptions.length === 0 ? (
                                    <p className="p-3 text-sm text-muted-foreground">No matching assets found</p>
                                ) : (
                                    assetOptions.map((option) => (
                                        <div
                                            key={`asset-${option.value}`}
                                            onClick={() => handleSelect(option.value)}
                                            className={cn(
                                                'relative flex w-full cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none',
                                                'hover:bg-accent hover:text-accent-foreground',
                                                value === option.value && 'bg-accent text-accent-foreground'
                                            )}
                                        >
                                            <Check className={cn('mr-2 h-4 w-4 flex-shrink-0', value === option.value ? 'opacity-100' : 'opacity-0')} />
                                            {option.label}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
    );
}
