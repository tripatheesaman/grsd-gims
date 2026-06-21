'use client';

import { useMemo } from 'react';
import { cn } from '@/utils/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface PartNumberSelectProps {
    partNumberList: string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
    disabled?: boolean;
    placeholder?: string;
}

export function PartNumberSelect({
    partNumberList,
    value,
    onChange,
    error,
    disabled = false,
    placeholder = 'Select part number',
}: PartNumberSelectProps) {
    const partNumbers = useMemo(() => {
        if (!partNumberList) {
            return [];
        }
        const seen = new Set<string>();
        return partNumberList
            .split(',')
            .map((part) => part.trim())
            .filter((part) => {
                if (!part || seen.has(part)) {
                    return false;
                }
                seen.add(part);
                return true;
            });
    }, [partNumberList]);

    if (partNumbers.length === 0) {
        return (
            <div className="flex flex-col gap-1.5">
                <Select disabled>
                    <SelectTrigger className={cn('w-full bg-white border-[#002a6e]/15', error && 'border-red-500')}>
                        <SelectValue placeholder="No part numbers available" />
                    </SelectTrigger>
                </Select>
                {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-1.5">
            <Select
                value={value || undefined}
                onValueChange={onChange}
                disabled={disabled}
            >
                <SelectTrigger
                    className={cn(
                        'w-full bg-white border-[#002a6e]/15 focus:border-[#003594] focus:ring-[#003594]/20',
                        error && 'border-red-500',
                        disabled && 'opacity-60 cursor-not-allowed'
                    )}
                >
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent className="bg-white border-[#002a6e]/10 max-h-[240px]">
                    {partNumbers.map((part) => (
                        <SelectItem key={part} value={part} className="focus:bg-[#003594]/5">
                            {part}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
    );
}
