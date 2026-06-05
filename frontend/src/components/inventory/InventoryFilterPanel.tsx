'use client';

import { Search, Wrench, Hash, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/utils/utils';

export interface InventoryFilterValues {
    universal: string;
    equipment: string;
    part: string;
}

interface InventoryFilterPanelProps {
    values?: InventoryFilterValues;
    onChange: (field: keyof InventoryFilterValues, value: string) => void;
    onClear?: () => void;
    className?: string;
}

const fields: {
    key: keyof InventoryFilterValues;
    label: string;
    placeholder: string;
    icon: typeof Search;
}[] = [
    {
        key: 'universal',
        label: 'Quick search',
        placeholder: 'NAC, item name, part, or equipment…',
        icon: Search,
    },
    {
        key: 'equipment',
        label: 'Equipment',
        placeholder: 'Code or asset name…',
        icon: Wrench,
    },
    {
        key: 'part',
        label: 'Part number',
        placeholder: 'Part number…',
        icon: Hash,
    },
];

const defaultFilterValues: InventoryFilterValues = {
    universal: '',
    equipment: '',
    part: '',
};

export function InventoryFilterPanel({
    values = defaultFilterValues,
    onChange,
    onClear,
    className,
}: InventoryFilterPanelProps) {
    const hasFilters = Boolean(values.universal || values.equipment || values.part);

    return (
        <div className={cn('space-y-4', className)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-sm font-semibold text-slate-900">Filters</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Leave empty to browse all stock. Results update as you type.
                    </p>
                </div>
                {hasFilters && onClear && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-slate-600 hover:text-[#003594]"
                        onClick={onClear}
                    >
                        <X className="mr-1.5 h-3.5 w-3.5" />
                        Clear filters
                    </Button>
                )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {fields.map(({ key, label, placeholder, icon: Icon }) => (
                    <div key={key} className="space-y-1.5">
                        <Label htmlFor={`filter-${key}`} className="text-xs font-medium text-slate-600">
                            {label}
                        </Label>
                        <div className="relative">
                            <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input
                                id={`filter-${key}`}
                                value={values[key]}
                                onChange={(e) => onChange(key, e.target.value)}
                                placeholder={placeholder}
                                className="h-10 border-slate-200 bg-white pl-9 pr-8 focus-visible:ring-[#003594]/25"
                            />
                            {values[key] && (
                                <button
                                    type="button"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                    onClick={() => onChange(key, '')}
                                    aria-label={`Clear ${label}`}
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
