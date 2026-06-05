'use client';

import { CalendarRange } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useFiscalYear } from '@/hooks/useFiscalYear';

export function FiscalYearBadge() {
    const { fiscalYear, startBs, endBs, loading } = useFiscalYear();

    if (loading || !fiscalYear) {
        return null;
    }

    return (
        <Badge
            variant="outline"
            className="gap-1.5 border-[#003594]/25 bg-[#003594]/5 font-normal text-[#003594]"
            title={`Nepali FY ${startBs} – ${endBs} (auto)`}
        >
            <CalendarRange className="h-3.5 w-3.5" />
            FY {fiscalYear}
        </Badge>
    );
}
