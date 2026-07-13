'use client';

import type { ReactNode } from 'react';
import { Upload, X } from 'lucide-react';
import { cn } from '@/utils/utils';
import { recordsTheme } from './recordsTheme';

export function RecordFormSection({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="space-y-4 rounded-lg border border-slate-100 bg-slate-50/60 p-4">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-[#003594]">{title}</h4>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
        </div>
    );
}

interface FieldProps {
    label: string;
    error?: string;
    required?: boolean;
    className?: string;
    children: ReactNode;
}

export function RecordFormField({ label, error, required, className, children }: FieldProps) {
    return (
        <div className={cn('space-y-1.5', className)}>
            <label className={recordsTheme.filterLabel}>
                {label}
                {required && <span className="ml-0.5 text-red-500">*</span>}
            </label>
            {children}
            {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
    );
}

interface TextInputProps {
    value: string | number;
    onChange: (value: string) => void;
    type?: string;
    placeholder?: string;
    error?: boolean;
    disabled?: boolean;
    min?: number;
}

export function RecordTextInput({
    value,
    onChange,
    type = 'text',
    placeholder,
    error,
    disabled,
    min,
}: TextInputProps) {
    return (
        <input
            type={type}
            value={value ?? ''}
            min={min}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={cn(recordsTheme.input, error && recordsTheme.inputError, disabled && 'bg-slate-50')}
        />
    );
}

interface SelectInputProps {
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
    error?: boolean;
    disabled?: boolean;
}

export function RecordSelectInput({ value, onChange, options, error, disabled }: SelectInputProps) {
    return (
        <select
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className={cn(recordsTheme.select, error && recordsTheme.inputError, disabled && 'bg-slate-50')}
        >
            {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                    {opt.label}
                </option>
            ))}
        </select>
    );
}

export function RecordTextArea({
    value,
    onChange,
    placeholder,
    error,
    rows = 3,
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    error?: boolean;
    rows?: number;
}) {
    return (
        <textarea
            value={value}
            rows={rows}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={cn(recordsTheme.textarea, error && recordsTheme.inputError)}
        />
    );
}

interface ImageFieldProps {
    previewUrl: string | null;
    currentPath?: string | null;
    onSelect: (file: File | null) => void;
    onClear: () => void;
    label?: string;
}

export function RecordImageField({
    previewUrl,
    currentPath,
    onSelect,
    onClear,
    label = 'Image',
}: ImageFieldProps) {
    return (
        <div className="md:col-span-2 space-y-2">
            <label className={recordsTheme.filterLabel}>{label}</label>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="relative flex h-36 w-36 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-white">
                    {previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={previewUrl} alt="Preview" className="h-full w-full object-cover" />
                    ) : (
                        <Upload className="h-8 w-8 text-slate-300" />
                    )}
                </div>
                <div className="flex flex-1 flex-col gap-2">
                    {currentPath && !previewUrl && (
                        <p className="text-xs text-slate-500 truncate">Current: {currentPath}</p>
                    )}
                    <label className={cn(recordsTheme.outlineBtn, 'w-fit cursor-pointer')}>
                        <Upload className="h-4 w-4" />
                        Choose image
                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => onSelect(e.target.files?.[0] || null)}
                        />
                    </label>
                    {(previewUrl || currentPath) && (
                        <button type="button" onClick={onClear} className={recordsTheme.outlineBtn}>
                            <X className="h-4 w-4" />
                            Remove image
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export const APPROVAL_STATUS_OPTIONS = [
    { value: 'PENDING', label: 'Pending' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'CLOSED', label: 'Closed' },
];
