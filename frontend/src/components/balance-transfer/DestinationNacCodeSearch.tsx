'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { API } from '@/lib/api';
import { stripSuffixFromNac } from '@/utils/nacCodeUtils';
import { Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DestinationNacOption = {
    nacCode: string;
    itemName?: string;
    partNumber?: string;
    baseNacCode?: string;
};

interface FamilyVariant {
    nacCode: string;
    partNumber: string;
}

interface DestinationNacCodeSearchProps {
    excludeNacCode: string;
    value: string;
    selected: DestinationNacOption | null;
    onChange: (option: DestinationNacOption | null) => void;
    disabled?: boolean;
    error?: string;
}

export function DestinationNacCodeSearch({
    excludeNacCode,
    value,
    selected,
    onChange,
    disabled = false,
    error,
}: DestinationNacCodeSearchProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState<DestinationNacOption[]>([]);
    const [familyVariants, setFamilyVariants] = useState<FamilyVariant[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [loadingFamily, setLoadingFamily] = useState(false);
    const searchAbortRef = useRef<AbortController | null>(null);
    const searchTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        if (!excludeNacCode) {
            setFamilyVariants([]);
            return;
        }
        const loadFamily = async () => {
            setLoadingFamily(true);
            try {
                const base = stripSuffixFromNac(excludeNacCode);
                const response = await API.get(`/api/stock/family/${encodeURIComponent(base)}`);
                const variants: FamilyVariant[] = (response.data?.variants || [])
                    .filter((v: FamilyVariant) => v.nacCode !== excludeNacCode);
                setFamilyVariants(variants);
            } catch {
                setFamilyVariants([]);
            } finally {
                setLoadingFamily(false);
            }
        };
        void loadFamily();
    }, [excludeNacCode]);

    const runSearch = useCallback(async (term: string) => {
        const trimmed = term.trim();
        if (trimmed.length < 2) {
            setResults([]);
            setIsSearching(false);
            return;
        }
        if (searchAbortRef.current) {
            searchAbortRef.current.abort();
        }
        const controller = new AbortController();
        searchAbortRef.current = controller;
        setIsSearching(true);
        try {
            const response = await API.get('/api/balance-transfer/destination-codes/search', {
                params: {
                    search: trimmed,
                    excludeNac: excludeNacCode || undefined,
                    page: 1,
                    pageSize: 50,
                },
                signal: controller.signal,
            });
            if (!controller.signal.aborted && response.status === 200) {
                setResults(response.data?.data || []);
            }
        } catch (err: unknown) {
            const e = err as { name?: string; code?: string };
            if (e?.name !== 'AbortError' && e?.name !== 'CanceledError' && e?.code !== 'ERR_CANCELED') {
                setResults([]);
            }
        } finally {
            if (!controller.signal.aborted) {
                setIsSearching(false);
            }
        }
    }, [excludeNacCode]);

    const handleSearchChange = (term: string) => {
        setSearchTerm(term);
        if (searchTimeoutRef.current !== null) {
            window.clearTimeout(searchTimeoutRef.current);
        }
        if (term.trim().length < 2) {
            setResults([]);
            setIsSearching(false);
            return;
        }
        searchTimeoutRef.current = window.setTimeout(() => {
            void runSearch(term);
        }, 350);
    };

    const selectOption = (option: DestinationNacOption) => {
        onChange(option);
        setSearchTerm('');
        setResults([]);
    };

    const clearSelection = () => {
        onChange(null);
        setSearchTerm('');
        setResults([]);
    };

    const renderOptionButton = (option: DestinationNacOption, key: string) => (
        <button
            key={key}
            type="button"
            disabled={disabled}
            className={cn(
                'w-full text-left px-3 py-2 hover:bg-[#003594]/5 text-sm flex flex-col gap-0.5 border-b border-[#002a6e]/5 last:border-0',
                value === option.nacCode && 'bg-[#003594]/10'
            )}
            onClick={() => selectOption(option)}
        >
            <span className="font-mono font-medium text-[#003594]">{option.nacCode}</span>
            {option.partNumber && (
                <span className="text-xs text-gray-500">Part: {option.partNumber}</span>
            )}
            {option.itemName && (
                <span className="text-xs text-gray-600 truncate">{option.itemName}</span>
            )}
        </button>
    );

    return (
        <div className="space-y-3">
            <Label className="text-sm font-medium">To NAC Code *</Label>
            <p className="text-xs text-gray-500">
                Search by NAC code, sub-code, part number, or item name. You can transfer to another sub-code in the same family.
            </p>

            {value && selected ? (
                <div className="flex items-start justify-between gap-2 rounded-md border border-[#002a6e]/15 bg-[#003594]/5 px-3 py-2">
                    <div className="min-w-0">
                        <p className="font-mono font-semibold text-[#003594]">{selected.nacCode}</p>
                        {selected.partNumber && (
                            <p className="text-xs text-gray-600">Part: {selected.partNumber}</p>
                        )}
                        {selected.itemName && (
                            <p className="text-xs text-gray-600 truncate">{selected.itemName}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={clearSelection}
                        disabled={disabled}
                        className="shrink-0 text-gray-500 hover:text-gray-800"
                        aria-label="Clear selection"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            ) : (
                <>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <Input
                            value={searchTerm}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="Search destination NAC or sub-code..."
                            disabled={disabled}
                            className={cn('pl-10', error && 'border-red-500')}
                        />
                    </div>

                    {(loadingFamily || familyVariants.length > 0) && (
                        <div className="rounded-md border border-[#002a6e]/10 bg-slate-50 p-3 space-y-2">
                            <p className="text-xs font-medium text-[#003594]">Sub-codes in this family</p>
                            {loadingFamily ? (
                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                    <Loader2 className="h-3 w-3 animate-spin" /> Loading variants…
                                </p>
                            ) : familyVariants.length === 0 ? (
                                <p className="text-xs text-gray-500">No other sub-codes in this family.</p>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {familyVariants.map((variant) => (
                                        <button
                                            key={variant.nacCode}
                                            type="button"
                                            disabled={disabled}
                                            onClick={() =>
                                                selectOption({
                                                    nacCode: variant.nacCode,
                                                    partNumber: variant.partNumber,
                                                })
                                            }
                                            className="inline-flex items-center gap-1"
                                        >
                                            <Badge
                                                variant="outline"
                                                className="font-mono cursor-pointer hover:bg-[#003594]/10"
                                            >
                                                {variant.nacCode}
                                            </Badge>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="rounded-md border border-[#002a6e]/10 max-h-52 overflow-y-auto bg-white">
                        {isSearching ? (
                            <div className="flex items-center justify-center py-4 text-sm text-gray-500">
                                <Loader2 className="h-4 w-4 animate-spin text-[#003594]" />
                                <span className="ml-2">Searching…</span>
                            </div>
                        ) : searchTerm.trim().length < 2 ? (
                            <div className="py-3 px-3 text-sm text-gray-500">
                                Type at least 2 characters to search all stock codes.
                            </div>
                        ) : results.length === 0 ? (
                            <div className="py-3 px-3 text-sm text-gray-500">No matching NAC codes found.</div>
                        ) : (
                            results.map((option) => renderOptionButton(option, option.nacCode))
                        )}
                    </div>
                </>
            )}

            {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>
    );
}
