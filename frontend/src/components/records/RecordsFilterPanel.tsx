'use client';

import { Search } from 'lucide-react';
import { recordsTheme } from './recordsTheme';

interface FilterField {
    id: string;
    label: string;
    element: React.ReactNode;
    className?: string;
}

interface RecordsFilterPanelProps {
    fields: FilterField[];
    title?: string;
}

export function RecordsFilterPanel({ fields, title = 'Search & filter' }: RecordsFilterPanelProps) {
    return (
        <div className="space-y-4">
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-800">
                <Search className="h-4 w-4 text-[#003594]" />
                {title}
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {fields.map((field) => (
                    <div key={field.id} className={field.className || 'space-y-1.5'}>
                        <label className={recordsTheme.filterLabel} htmlFor={field.id}>
                            {field.label}
                        </label>
                        {field.element}
                    </div>
                ))}
            </div>
        </div>
    );
}

export function RecordsFilterInput({
    value,
    onChange,
    placeholder,
    id,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    id?: string;
}) {
    return (
        <input
            id={id}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={recordsTheme.input}
        />
    );
}

export function RecordsFilterSelect({
    value,
    onChange,
    options,
    id,
}: {
    value: string;
    onChange: (v: string) => void;
    options: Array<{ value: string; label: string }>;
    id?: string;
}) {
    return (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={recordsTheme.select}>
            {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                    {opt.label}
                </option>
            ))}
        </select>
    );
}
