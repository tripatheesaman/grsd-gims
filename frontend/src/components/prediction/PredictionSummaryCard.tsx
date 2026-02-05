import { useMemo, useState } from 'react';
import { addDays, format } from 'date-fns';
import { CalendarDays, Sparkles, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/utils/utils';
import { PredictionConfidence, PredictionSummary } from '@/types/prediction';
interface PredictionSummaryCardProps {
    prediction: PredictionSummary;
    baseDate?: string | Date | null;
    className?: string;
    accentColor?: string;
    compact?: boolean;
}
const confidenceToProgress = (confidence: PredictionConfidence): number => {
    switch (confidence) {
        case 'HIGH':
            return 100;
        case 'MEDIUM':
            return 65;
        default:
            return 35;
    }
};
const formatDate = (date: Date | null): string | null => {
    if (!date || Number.isNaN(date.getTime()))
        return null;
    return format(date, 'PPP');
};
export function PredictionSummaryCard({ prediction, baseDate, className, accentColor = '#2563eb', compact = false }: PredictionSummaryCardProps) {
    const [mode, setMode] = useState<'days' | 'dates'>('days');
    const predictedDate = useMemo(() => {
        if (!baseDate)
            return null;
        const requestDate = baseDate instanceof Date ? baseDate : new Date(baseDate);
        if (Number.isNaN(requestDate.getTime()))
            return null;
        return addDays(requestDate, prediction.predictedDays);
    }, [baseDate, prediction.predictedDays]);
    const lowerDate = useMemo(() => {
        if (!baseDate || !prediction.rangeLowerDays)
            return null;
        const requestDate = baseDate instanceof Date ? baseDate : new Date(baseDate);
        if (Number.isNaN(requestDate.getTime()))
            return null;
        return addDays(requestDate, prediction.rangeLowerDays);
    }, [baseDate, prediction.rangeLowerDays]);
    const upperDate = useMemo(() => {
        if (!baseDate || !prediction.rangeUpperDays)
            return null;
        const requestDate = baseDate instanceof Date ? baseDate : new Date(baseDate);
        if (Number.isNaN(requestDate.getTime()))
            return null;
        return addDays(requestDate, prediction.rangeUpperDays);
    }, [baseDate, prediction.rangeUpperDays]);
    const confidenceProgress = confidenceToProgress(prediction.stats.confidenceLevel);
    const roundedPredictedDays = Math.round(prediction.predictedDays);
    const roundedLower = prediction.rangeLowerDays ? Math.round(prediction.rangeLowerDays) : null;
    const roundedUpper = prediction.rangeUpperDays ? Math.round(prediction.rangeUpperDays) : null;
    const percentile10 = prediction.stats.percentile10Days;
    const percentile90 = prediction.stats.percentile90Days;
    const showDates = mode === 'dates' && predictedDate;
    const modeLabel = showDates && predictedDate ? formatDate(predictedDate) ?? 'TBD' : `~${roundedPredictedDays} days`;
    const subLabel = showDates && lowerDate && upperDate
        ? `${formatDate(lowerDate) ?? ''} → ${formatDate(upperDate) ?? ''}`
        : `${roundedLower !== null && roundedUpper !== null ? `${roundedLower}-${roundedUpper}` : 'Awaiting history'} days`;
    return (<Card className={cn('relative overflow-hidden border border-primary/10 bg-white/95 backdrop-blur w-full min-w-0 max-w-full', className)}>
      <div aria-hidden className="pointer-events-none absolute -top-16 -right-20 h-40 w-40 rounded-full opacity-40 blur-3xl" style={{ background: accentColor }}/>
      <CardContent className={cn('flex flex-col gap-3 p-3 sm:p-4 min-w-0 max-w-full', compact ? 'gap-2 p-2.5 sm:p-3' : 'sm:gap-4 sm:p-5')}>
        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0 max-w-full">
          <div className="flex items-center gap-2 text-primary min-w-0 flex-1 overflow-hidden">
            <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0"/>
            <span className="text-xs font-semibold tracking-wide uppercase truncate">
              Lead Time Outlook
            </span>
          </div>
          {predictedDate && (<div className="flex items-center gap-0.5 rounded-full border border-primary/10 bg-primary/5 p-0.5 text-xs font-medium text-primary shrink-0">
              <button type="button" onClick={() => setMode('days')} className={cn('rounded-full px-2 py-1 transition-colors whitespace-nowrap text-xs', mode === 'days' ? 'bg-white shadow text-primary' : 'text-primary/70 hover:text-primary')}>
                Days
              </button>
              <button type="button" onClick={() => setMode('dates')} className={cn('flex items-center gap-1 rounded-full px-2 py-1 transition-colors whitespace-nowrap text-xs', mode === 'dates' ? 'bg-white shadow text-primary' : 'text-primary/70 hover:text-primary')}>
                <CalendarDays className="h-3 w-3"/>
                Dates
              </button>
            </div>)}
        </div>

        <div className={cn('flex gap-3 min-w-0 max-w-full', compact
            ? 'flex-row items-center justify-between'
            : 'flex-row items-start justify-between')}>
          <div className="flex flex-col gap-1 min-w-0 flex-1 overflow-hidden">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium whitespace-nowrap">
              Expected Arrival
            </div>
            <div className="flex items-baseline gap-2 flex-wrap min-w-0">
              <span className="text-xl sm:text-2xl lg:text-3xl font-bold text-[#0f172a] leading-none break-words">
                {modeLabel}
              </span>
              {!showDates && predictedDate && (<span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  ≈ {formatDate(predictedDate) ?? ''}
                </span>)}
            </div>
            <div className="text-xs text-muted-foreground truncate">{subLabel}</div>
          </div>

          <div className="flex flex-row items-center gap-2.5 rounded-lg border border-primary/10 bg-white/70 p-2.5 text-xs text-muted-foreground shadow-[0_5px_30px_-20px_rgba(0,21,82,0.4)] shrink-0 min-w-0">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-1 font-semibold text-slate-700">
                <TrendingUp className="h-3 w-3 text-primary shrink-0"/>
                <span className="text-[10px]">Confidence</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-primary whitespace-nowrap">
                  {prediction.stats.confidenceLevel}
                </span>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {prediction.sampleSize}
                </span>
              </div>
              <div className="relative h-1.5 w-16 overflow-hidden rounded-full bg-slate-200/80">
                <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{
            width: `${confidenceProgress}%`,
            background: `linear-gradient(90deg, ${accentColor}, rgba(37,99,235,0.6))`
        }}/>
              </div>
            </div>
            <div className="flex flex-row gap-1.5 border-l border-primary/10 pl-2.5">
              <div className="rounded-md bg-primary/5 px-1.5 py-1 min-w-0">
                <div className="font-semibold text-primary text-[9px] leading-tight">P10</div>
                <div className="text-[10px] font-medium whitespace-nowrap leading-tight">{percentile10 !== null ? `${Math.round(percentile10)}d` : 'N/A'}</div>
              </div>
              <div className="rounded-md bg-primary/5 px-1.5 py-1 min-w-0">
                <div className="font-semibold text-primary text-[9px] leading-tight">P90</div>
                <div className="text-[10px] font-medium whitespace-nowrap leading-tight">{percentile90 !== null ? `${Math.round(percentile90)}d` : 'N/A'}</div>
              </div>
            </div>
          </div>
        </div>

        {!compact && (<div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-3 text-xs font-medium text-slate-600 min-w-0">
            <div className="rounded-lg border border-primary/10 bg-white/80 p-2 sm:p-3 shadow-sm min-w-0">
              <div className="text-[10px] sm:text-[11px] uppercase tracking-wide text-muted-foreground truncate">
                Average
              </div>
              <div className="mt-1 text-base sm:text-lg font-semibold text-[#0f172a] truncate">
                {prediction.stats.averageDays.toFixed(1)} <span className="text-xs font-normal">days</span>
              </div>
            </div>
            <div className="rounded-lg border border-primary/10 bg-white/80 p-2 sm:p-3 shadow-sm min-w-0">
              <div className="text-[10px] sm:text-[11px] uppercase tracking-wide text-muted-foreground truncate">
                Weighted
              </div>
              <div className="mt-1 text-base sm:text-lg font-semibold text-[#0f172a] truncate">
                {prediction.stats.weightedAverageDays.toFixed(1)} <span className="text-xs font-normal">days</span>
              </div>
            </div>
            <div className="rounded-lg border border-primary/10 bg-white/80 p-2 sm:p-3 shadow-sm min-w-0">
              <div className="text-[10px] sm:text-[11px] uppercase tracking-wide text-muted-foreground truncate">
                Median
              </div>
              <div className="mt-1 text-base sm:text-lg font-semibold text-[#0f172a] truncate">
                {prediction.stats.medianDays.toFixed(1)} <span className="text-xs font-normal">days</span>
              </div>
            </div>
          </div>)}
      </CardContent>
    </Card>);
}
