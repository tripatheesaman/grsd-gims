'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import { cn } from '@/utils/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { API } from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';
import { collapseEquipmentSelectionValue } from '@/utils/equipmentNumbers';

type EquipmentOption = {
    equipmentCode: string;
    name: string;
    kind: 'series' | 'section';
    label: string;
};

interface RequestEquipmentSelectProps {
    nacCode: string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
    multiple?: boolean;
    disabled?: boolean;
}

export function RequestEquipmentSelect({
    nacCode,
    value,
    onChange,
    error,
    multiple = true,
    disabled = false,
}: RequestEquipmentSelectProps) {
    const [open, setOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [options, setOptions] = useState<EquipmentOption[]>([]);
    const [filteredByCompatibility, setFilteredByCompatibility] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const debouncedSearch = useDebounce(inputValue, 250);

    const selectedValues = useMemo(
        () => value.split(',').map((v) => v.trim()).filter(Boolean),
        [value]
    );

    const fetchOptions = useCallback(async (search: string) => {
        setIsLoading(true);
        setLoadError(null);
        try {
            const response = await API.get('/api/request/equipment-options', {
                params: {
                    nacCode: nacCode || 'N/A',
                    ...(search ? { search } : {}),
                },
            });
            const rows = response.data?.options;
            if (!Array.isArray(rows)) {
                throw new Error('Unexpected response from server');
            }
            setOptions(rows);
            setFilteredByCompatibility(Boolean(response.data?.filteredByCompatibility));
        } catch (err: unknown) {
            setOptions([]);
            const axiosMsg =
                err && typeof err === 'object' && 'response' in err
                    ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
                    : undefined;
            setLoadError(axiosMsg || (err instanceof Error ? err.message : 'Failed to load equipment'));
        } finally {
            setIsLoading(false);
        }
    }, [nacCode]);

    useEffect(() => {
        void fetchOptions('');
    }, [fetchOptions]);

    useEffect(() => {
        if (!open) {
            return;
        }
        void fetchOptions(debouncedSearch.trim());
    }, [open, debouncedSearch, fetchOptions]);

    const optionMap = useMemo(() => {
        const map = new Map<string, EquipmentOption>();
        for (const option of options) {
            map.set(option.equipmentCode, option);
        }
        return map;
    }, [options]);

    const filteredOptions = useMemo(() => {
        const q = inputValue.trim().toLowerCase();
        if (!q) {
            return options;
        }
        return options.filter(
            (o) =>
                o.equipmentCode.toLowerCase().includes(q) ||
                o.name.toLowerCase().includes(q) ||
                o.label.toLowerCase().includes(q)
        );
    }, [options, inputValue]);

    const sectionOptions = useMemo(
        () => filteredOptions.filter((o) => o.kind === 'section'),
        [filteredOptions]
    );
    const seriesOptions = useMemo(
        () => filteredOptions.filter((o) => o.kind === 'series'),
        [filteredOptions]
    );

    const applySelection = (code: string) => {
        const normalizedCode = collapseEquipmentSelectionValue(code);
        const isSelected = selectedValues.some(
            (value) => collapseEquipmentSelectionValue(value) === normalizedCode
        );
        if (multiple) {
            const next = isSelected
                ? selectedValues.filter(
                      (value) => collapseEquipmentSelectionValue(value) !== normalizedCode
                  )
                : [...selectedValues, normalizedCode];
            onChange(collapseEquipmentSelectionValue(next.join(', ')));
            return;
        }
        onChange(normalizedCode);
        setOpen(false);
    };

    const handleRemove = (code: string, e: React.MouseEvent) => {
        e.stopPropagation();
        onChange(selectedValues.filter((v) => v !== code).join(', '));
    };

    const renderOption = (option: EquipmentOption) => {
        const normalizedCode = collapseEquipmentSelectionValue(option.equipmentCode);
        const isSelected = selectedValues.some(
            (value) => collapseEquipmentSelectionValue(value) === normalizedCode
        );
        const label = option.label || option.equipmentCode;
        return (
            <button
                key={`${option.kind}-${option.equipmentCode}`}
                type="button"
                onClick={() => applySelection(option.equipmentCode)}
                className={cn(
                    'relative flex w-full cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none text-left',
                    'hover:bg-[#003594]/5',
                    isSelected && 'bg-[#003594]/10'
                )}
            >
                <Check className={cn('mr-2 h-4 w-4 shrink-0', isSelected ? 'opacity-100 text-[#003594]' : 'opacity-0')} />
                <span className="flex-1 truncate">{label}</span>
                {option.kind === 'section' && (
                    <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wide bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                        Section
                    </span>
                )}
            </button>
        );
    };

    return (
        <div className="flex flex-col gap-1.5">
            <Button
                type="button"
                variant="outline"
                disabled={disabled}
                className={cn(
                    'w-full justify-between min-h-[42px] h-auto py-2 bg-white border-[#002a6e]/15 hover:bg-gray-50',
                    error ? 'border-red-500' : '',
                    disabled && 'opacity-60 cursor-not-allowed'
                )}
                onClick={() => !disabled && setOpen((prev) => !prev)}
            >
                <div className="flex flex-wrap gap-1 flex-1 justify-start text-left">
                    {selectedValues.length > 0 ? (
                        selectedValues.map((code) => {
                            const opt = optionMap.get(code);
                            const badgeLabel = opt?.label || code;
                            return (
                                <Badge
                                    key={code}
                                    variant="secondary"
                                    className="text-xs flex items-center gap-1 bg-[#003594]/10 text-[#003594]"
                                >
                                    <span className="max-w-[180px] truncate">{badgeLabel}</span>
                                    {multiple && (
                                        <span
                                            role="button"
                                            tabIndex={0}
                                            onClick={(e) => handleRemove(code, e)}
                                            className="cursor-pointer hover:bg-red-100 rounded-full p-0.5"
                                            aria-label={`Remove ${code}`}
                                        >
                                            <X className="h-3 w-3" />
                                        </span>
                                    )}
                                </Badge>
                            );
                        })
                    ) : (
                        <span className="text-muted-foreground text-sm font-normal">
                            {isLoading ? 'Loading equipment…' : 'Select equipment series or section…'}
                        </span>
                    )}
                </div>
                {isLoading ? (
                    <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-60" />
                ) : (
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                )}
            </Button>

            {open && (
                <div className="rounded-lg border border-[#002a6e]/15 bg-white shadow-sm overflow-hidden">
                    <div className="flex w-full items-center border-b border-[#002a6e]/10 px-3">
                        <input
                            className="flex h-10 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
                            placeholder="Search equipment series or sections…"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            autoComplete="off"
                        />
                    </div>
                    <div className="max-h-[240px] overflow-y-auto">
                        {isLoading && options.length === 0 ? (
                            <p className="p-4 text-sm text-center text-muted-foreground flex items-center justify-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading…
                            </p>
                        ) : loadError ? (
                            <div className="p-4 text-sm text-center">
                                <p className="text-red-500">{loadError}</p>
                                <button
                                    type="button"
                                    className="mt-2 text-[#003594] underline text-xs"
                                    onClick={() => void fetchOptions(debouncedSearch.trim())}
                                >
                                    Retry
                                </button>
                            </div>
                        ) : filteredOptions.length === 0 ? (
                            <p className="p-4 text-sm text-center text-muted-foreground">
                                No equipment series or sections found for this item.
                            </p>
                        ) : (
                            <>
                                {sectionOptions.length > 0 && (
                                    <div>
                                        <p className="sticky top-0 px-3 py-1.5 text-[11px] font-semibold text-gray-500 uppercase bg-gray-50 border-b">
                                            Sections ({sectionOptions.length})
                                        </p>
                                        {sectionOptions.map(renderOption)}
                                    </div>
                                )}
                                {seriesOptions.length > 0 && (
                                    <div>
                                        <p className="sticky top-0 px-3 py-1.5 text-[11px] font-semibold text-gray-500 uppercase bg-gray-50 border-b">
                                            Equipment ({seriesOptions.length})
                                            {filteredByCompatibility && (
                                                <span className="ml-1 normal-case font-normal text-gray-400">
                                                    · compatible
                                                </span>
                                            )}
                                        </p>
                                        {seriesOptions.map(renderOption)}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    {multiple && (
                        <div className="border-t border-[#002a6e]/10 px-3 py-2 flex justify-between items-center bg-gray-50">
                            <span className="text-xs text-gray-500">
                                {selectedValues.length} selected · {options.length} available
                            </span>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setOpen(false)}
                            >
                                Done
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {!open && filteredByCompatibility && options.length > 0 && (
                <p className="text-xs text-gray-500">
                    {options.length} compatible equipment series available — click above to select.
                </p>
            )}
            {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
    );
}
