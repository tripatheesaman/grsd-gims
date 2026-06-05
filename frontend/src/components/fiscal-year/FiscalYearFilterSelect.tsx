'use client';

import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useFiscalYear } from '@/hooks/useFiscalYear';

interface FiscalYearFilterSelectProps {
    value: string;
    onChange: (value: string) => void;
    className?: string;
    showAllOption?: boolean;
}

/** value: current FY label, or `all` for no FY filter */
export function FiscalYearFilterSelect({
    value,
    onChange,
    className,
    showAllOption = true,
}: FiscalYearFilterSelectProps) {
    const { fiscalYear, availableFiscalYears, loading } = useFiscalYear();
    const options = availableFiscalYears.length ? availableFiscalYears : fiscalYear ? [fiscalYear] : [];

    return (
        <div className={className}>
            <Label className="text-xs font-medium text-slate-600">Fiscal year</Label>
            <Select value={value || fiscalYear} onValueChange={onChange} disabled={loading || !fiscalYear}>
                <SelectTrigger className="mt-1.5 h-10 border-slate-200 bg-white">
                    <SelectValue placeholder="Select FY" />
                </SelectTrigger>
                <SelectContent>
                    {fiscalYear && (
                        <SelectItem value={fiscalYear}>
                            Current ({fiscalYear})
                        </SelectItem>
                    )}
                    {options
                        .filter((fy) => fy !== fiscalYear)
                        .map((fy) => (
                            <SelectItem key={fy} value={fy}>
                                {fy}
                            </SelectItem>
                        ))}
                    {showAllOption && <SelectItem value="all">All fiscal years</SelectItem>}
                </SelectContent>
            </Select>
        </div>
    );
}
