'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { API } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { Loader2, ChevronDown } from 'lucide-react';

type AssetSuggestion = {
    equipment_code?: string | null;
    name?: string | null;
};

interface EquipmentAssetAutocompleteProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    error?: string;
    minChars?: number;
}

export function EquipmentAssetAutocomplete({
    value,
    onChange,
    placeholder,
    className,
    error,
    minChars = 1,
}: EquipmentAssetAutocompleteProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [inputValue, setInputValue] = useState(value || '');
    const [suggestions, setSuggestions] = useState<AssetSuggestion[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const debouncedQuery = useDebounce(inputValue, 350);

    useEffect(() => {
        setInputValue(value || '');
    }, [value]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const el = containerRef.current;
            if (!el) return;
            if (!el.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const shouldSearch = useMemo(() => {
        const q = debouncedQuery.trim();
        return q.length >= minChars;
    }, [debouncedQuery, minChars]);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            if (!shouldSearch) {
                setSuggestions([]);
                setIsLoading(false);
                return;
            }
            setIsLoading(true);
            try {
                const response = await API.get('/api/assets', {
                    params: {
                        page: 1,
                        pageSize: 20,
                        search: debouncedQuery,
                    },
                });
                if (cancelled) return;
                const rows = Array.isArray(response.data?.data) ? response.data.data : [];
                setSuggestions(rows.map((r: { equipment_code?: string | null; name?: string | null }) => ({
                    equipment_code: r.equipment_code ?? null,
                    name: r.name ?? null,
                })).filter((r: AssetSuggestion) => !!r.equipment_code));
                setOpen(true);
            }
            catch {
                if (cancelled) return;
                setSuggestions([]);
            }
            finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };
        run();
        return () => {
            cancelled = true;
        };
    }, [debouncedQuery, shouldSearch]);

    return (
        <div ref={containerRef} className={cn('relative', className || '')}>
            <Input
                value={inputValue}
                onChange={(e) => {
                    setInputValue(e.target.value);
                    onChange(e.target.value);
                    if (!open) setOpen(true);
                }}
                placeholder={placeholder}
                className={cn(error ? 'border-red-500 focus-visible:ring-red-500' : 'bg-white border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20')}
                onFocus={() => setOpen(true)}
            />
            <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-muted-foreground">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4 opacity-50" />}
            </div>
            {open && (shouldSearch && inputValue.trim().length >= minChars) && (
                <div className="absolute z-[9999] left-0 right-0 mt-1 rounded-md border bg-white shadow-md max-h-[220px] overflow-auto">
                    {suggestions.length === 0 && !isLoading ? (
                        <div className="p-3 text-sm text-muted-foreground">No equipment found</div>
                    ) : (
                        suggestions.map((s, idx) => {
                            const code = String(s.equipment_code || '');
                            const label = s.name ? `${code} - ${s.name}` : code;
                            return (
                                <button
                                    key={`${code}-${idx}`}
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                                    onClick={() => {
                                        setInputValue(code);
                                        onChange(code);
                                        setOpen(false);
                                    }}
                                >
                                    {label}
                                </button>
                            );
                        })
                    )}
                </div>
            )}
            {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
        </div>
    );
}

