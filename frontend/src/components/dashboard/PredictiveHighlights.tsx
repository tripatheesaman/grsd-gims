import { useAuthContext } from '@/context/AuthContext';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { API } from '@/lib/api';
import { PredictionSummary } from '@/types/prediction';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@mui/material';
import { Badge } from '@/components/ui/badge';
import { PredictionSummaryCard } from '@/components/prediction/PredictionSummaryCard';
import { cn } from '@/utils/utils';
import { ChevronDown, ChevronUp, Flame, RefreshCcw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
interface RequestRecord {
    nac_code?: string | null;
    [key: string]: unknown;
}
export function PredictiveHighlights() {
    const { permissions } = useAuthContext();
    const canViewPredictive = permissions.includes('can_access_predictive_analysis');
    const [highlights, setHighlights] = useState<PredictionSummary[]>([]);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [adjustment, setAdjustment] = useState<number>(0);
    const [expandedNac, setExpandedNac] = useState<string | null>(null);
    const [itemCount, setItemCount] = useState<number>(5);
    const [itemCountInput, setItemCountInput] = useState<string>('5');
    const fetchHighlights = useCallback(async () => {
        if (!canViewPredictive)
            return;
        setLoading(true);
        setError(null);
        try {
            const fetchSize = Math.max(itemCount * 5, 50);
            const requestsResponse = await API.get('/api/request-records', {
                params: {
                    page: 1,
                    pageSize: fetchSize
                }
            });
            const requests: RequestRecord[] = requestsResponse.data?.data || [];
            const validRequests = requests.filter((r: RequestRecord) => {
                const nacCode = r?.nac_code;
                if (!nacCode)
                    return false;
                if (typeof nacCode !== 'string')
                    return false;
                const trimmed = nacCode.trim().toUpperCase();
                return trimmed !== '' &&
                    trimmed !== 'N/A' &&
                    trimmed !== 'NULL' &&
                    trimmed !== 'NA' &&
                    trimmed !== 'NONE';
            });
            if (validRequests.length === 0) {
                setHighlights([]);
                return;
            }
            const seenNacCodes = new Set<string>();
            const uniqueNacCodes: string[] = [];
            const targetUniqueCount = Math.max(itemCount * 3, 30);
            for (const request of validRequests) {
                const nacCode = request.nac_code?.trim();
                if (nacCode && !seenNacCodes.has(nacCode)) {
                    seenNacCodes.add(nacCode);
                    uniqueNacCodes.push(nacCode);
                    if (uniqueNacCodes.length >= targetUniqueCount) {
                        break;
                    }
                }
            }
            if (uniqueNacCodes.length === 0) {
                setHighlights([]);
                return;
            }
            const batchCodes = uniqueNacCodes.slice(0, targetUniqueCount);
            const predictionsResponse = await API.post('/api/predictions/batch', {
                nacCodes: batchCodes
            });
            const predictions: PredictionSummary[] = Array.isArray(predictionsResponse.data)
                ? predictionsResponse.data
                : [];
            const predictionsMap = new Map(predictions.map(item => [item.nacCode, item]));
            const highlightsList: PredictionSummary[] = [];
            for (const nacCode of batchCodes) {
                const pred = predictionsMap.get(nacCode);
                if (pred) {
                    highlightsList.push(pred);
                    if (highlightsList.length >= itemCount) {
                        break;
                    }
                }
            }
            setHighlights(highlightsList);
        }
        catch {
            setError('Could not load predictive insights right now.');
        }
        finally {
            setLoading(false);
        }
    }, [canViewPredictive, itemCount]);
    useEffect(() => {
        fetchHighlights();
    }, [fetchHighlights]);
    const adjustedHighlights = useMemo(() => {
        return highlights.map((item, index) => {
            const adjusted = Math.max(item.predictedDays + adjustment, 0);
            const adjustedLower = item.rangeLowerDays !== null ? Math.max(item.rangeLowerDays + adjustment, 0) : null;
            const adjustedUpper = item.rangeUpperDays !== null ? Math.max(item.rangeUpperDays + adjustment, 0) : null;
            return {
                ...item,
                adjustedDays: adjusted,
                adjustedLower,
                adjustedUpper,
                accent: index === 0
                    ? '#2563eb'
                    : index === 1
                        ? '#d2293b'
                        : index === 2
                            ? '#059669'
                            : '#7c3aed'
            };
        });
    }, [highlights, adjustment]);
    const handleRefresh = useCallback(async () => {
        setIsRefreshing(true);
        try {
            await fetchHighlights();
        }
        finally {
            setIsRefreshing(false);
        }
    }, [fetchHighlights]);
    const handleToggleExpanded = useCallback((nacCode: string) => {
        setExpandedNac((prev) => (prev === nacCode ? null : nacCode));
    }, []);
    if (!canViewPredictive) {
        return null;
    }
    return (<Card className="border border-[#002a6e]/10 bg-gradient-to-br from-white via-white to-[#eff4ff] w-full max-w-full min-w-full">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold text-[#003594]">Predictive Insights</CardTitle>
            <p className="text-xs text-gray-500">
              Last {itemCount} requested items with lead-time predictions (excluding N/A). Adjust the slider to simulate expedite or delay.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="item-count" className="text-xs text-gray-600 whitespace-nowrap">
                Items:
              </Label>
              <Input id="item-count" type="number" min="1" max="20" value={itemCountInput} onChange={(e) => {
            setItemCountInput(e.target.value);
        }} onBlur={(e) => {
            const value = parseInt(e.target.value, 10);
            if (isNaN(value) || value < 1) {
                setItemCountInput('3');
                setItemCount(3);
            }
            else if (value > 20) {
                setItemCountInput('20');
                setItemCount(20);
            }
            else {
                setItemCountInput(value.toString());
                setItemCount(value);
            }
        }} onKeyDown={(e) => {
            if (e.key === 'Enter') {
                const value = parseInt(e.currentTarget.value, 10);
                if (!isNaN(value) && value >= 1 && value <= 20) {
                    setItemCountInput(value.toString());
                    setItemCount(value);
                    e.currentTarget.blur();
                }
                else {
                    setItemCountInput('2');
                    setItemCount(2);
                }
            }
        }} className="w-16 h-8 text-xs text-center"/>
            </div>
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-600">
              <Flame className="mr-1 h-3 w-3"/>
              Watching {adjustedHighlights.length}
            </Badge>
            <Button type="button" size="sm" variant="outline" onClick={handleRefresh} disabled={loading || isRefreshing} className="gap-1 border-[#003594]/20 text-[#003594] hover:bg-[#003594]/10">
              <RefreshCcw className={cn('h-4 w-4', isRefreshing && 'animate-spin')}/>
              Sync
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 w-full max-w-full">
        <div className="rounded-xl border border-[#003594]/10 bg-white/70 p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">What-if adjustment</div>
              <div className="text-sm text-[#003594]">
                {adjustment > 0 ? `Expedite by ${adjustment} day(s)` : adjustment < 0 ? `Delay by ${Math.abs(adjustment)} day(s)` : 'Baseline projection'}
              </div>
            </div>
            <div className="text-xs text-gray-500">Drag to experiment with expected lead times</div>
          </div>
          <Slider size="small" value={adjustment} min={-10} max={10} step={1} marks={[
            { value: -10, label: '-10' },
            { value: 0, label: '0' },
            { value: 10, label: '+10' }
        ]} onChange={(_, value) => {
            if (Array.isArray(value))
                return;
            setAdjustment(value);
        }} sx={{
            color: '#003594',
            '& .MuiSlider-mark': { backgroundColor: '#00359433' },
            '& .MuiSlider-markLabel': { color: '#1f2937', fontSize: 10 }
        }}/>
        </div>

        {loading ? (<div className="flex min-h-[120px] items-center justify-center text-xs text-gray-500">
            Loading predictive insights…
          </div>) : error ? (<div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-600">{error}</div>) : adjustedHighlights.length === 0 ? (<div className="rounded-md border border-dashed border-[#003594]/20 bg-white p-4 text-xs text-gray-500">
            Insufficient history to generate highlights yet. Approve a few receives to unlock projections.
          </div>) : (<div className="grid gap-5 grid-cols-1 sm:grid-cols-2 w-full min-w-0">
            {adjustedHighlights.map((item) => {
                const predictionToShow: PredictionSummary = {
                    ...item,
                    predictedDays: item.adjustedDays ?? item.predictedDays,
                    rangeLowerDays: item.adjustedLower !== null ? item.adjustedLower : item.rangeLowerDays,
                    rangeUpperDays: item.adjustedUpper !== null ? item.adjustedUpper : item.rangeUpperDays
                };
                const isExpanded = expandedNac === item.nacCode;
                return (<div key={item.nacCode} className="flex flex-col gap-2.5 rounded-xl border border-[#003594]/10 bg-white/90 p-3 shadow-[0_20px_40px_-30px_rgba(0,53,148,0.35)] transition-transform hover:-translate-y-1 w-full min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="text-sm font-semibold text-[#003594] truncate">{item.nacCode}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {item.stats.confidenceLevel} • {item.sampleSize} samples
                      </div>
                    </div>
                    <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/5 text-[10px] font-semibold uppercase tracking-wider text-primary shrink-0 px-2 py-0.5">
                      Lead Time
                    </Badge>
                  </div>
                  <div className="w-full min-w-0 max-w-full">
                    <PredictionSummaryCard prediction={predictionToShow} baseDate={new Date()} compact accentColor={item.accent as string}/>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#003594]/10">
                    <Button type="button" size="sm" variant="ghost" className="text-xs text-[#003594] hover:bg-[#003594]/10 h-7 px-2" onClick={() => handleToggleExpanded(item.nacCode)}>
                      {isExpanded ? (<>
                          Hide
                          <ChevronUp className="ml-1 h-3 w-3"/>
                        </>) : (<>
                          Details
                          <ChevronDown className="ml-1 h-3 w-3"/>
                        </>)}
                    </Button>
                    <Link href={`/analytics/predictive?nac=${encodeURIComponent(item.nacCode)}`} className="inline-flex items-center gap-1 text-xs font-semibold text-[#d2293b] transition hover:text-[#a8182c]">
                      Analytics
                      <ExternalLink className="h-3 w-3"/>
                    </Link>
                  </div>
                  {isExpanded && (<div className="grid gap-2 rounded-lg border border-[#003594]/10 bg-[#f8faff] p-3 text-xs text-gray-600 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 min-w-0 max-w-full w-full overflow-hidden">
                      <div className="space-y-1 min-w-0 overflow-hidden">
                        <div className="font-semibold text-sm text-[#003594] mb-1 truncate">Percentiles</div>
                        <div className="text-xs truncate">
                          <span className="font-medium">P10:</span>{' '}
                          {item.stats.percentile10Days !== null
                            ? `${item.stats.percentile10Days.toFixed(1)}d`
                            : 'N/A'}
                        </div>
                        <div className="text-xs truncate">
                          <span className="font-medium">P90:</span>{' '}
                          {item.stats.percentile90Days !== null
                            ? `${item.stats.percentile90Days.toFixed(1)}d`
                            : 'N/A'}
                        </div>
                      </div>
                      <div className="space-y-1 min-w-0 overflow-hidden">
                        <div className="font-semibold text-sm text-[#003594] mb-1 truncate">Recency</div>
                        <div className="text-xs truncate">
                          <span className="font-medium">Request:</span>{' '}
                          {item.stats.latestRequestDate
                            ? new Date(item.stats.latestRequestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            : 'N/A'}
                        </div>
                        <div className="text-xs truncate">
                          <span className="font-medium">Receive:</span>{' '}
                          {item.stats.latestReceiveDate
                            ? new Date(item.stats.latestReceiveDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            : 'N/A'}
                        </div>
                      </div>
                      <div className="space-y-1 min-w-0 overflow-hidden">
                        <div className="font-semibold text-sm text-[#003594] mb-1 truncate">Volatility</div>
                        <div className="text-xs truncate">
                          <span className="font-medium">Std Dev:</span>{' '}
                          {item.stats.standardDeviationDays !== null
                            ? `${item.stats.standardDeviationDays.toFixed(1)}d`
                            : 'N/A'}
                        </div>
                        <div className="text-xs truncate">
                          <span className="font-medium">Median:</span> {item.stats.medianDays.toFixed(1)}d
                        </div>
                      </div>
                      <div className="space-y-1 min-w-0 overflow-hidden">
                        <div className="font-semibold text-sm text-[#003594] mb-1 truncate">Sample</div>
                        <div className="text-xs truncate">
                          <span className="font-medium">Size:</span> {item.sampleSize}
                        </div>
                        <div className="text-xs truncate">
                          <span className="font-medium">Weighted:</span> {item.stats.weightedAverageDays.toFixed(1)}d
                        </div>
                      </div>
                    </div>)}
                  <div className="grid gap-2 text-xs text-gray-600 grid-cols-2 sm:grid-cols-4 min-w-0 max-w-full w-full overflow-hidden">
                    <div className="rounded-lg bg-slate-50 p-2 min-w-0 overflow-hidden">
                      <span className="font-semibold text-[#003594] block mb-0.5 text-[10px] truncate">Historical Avg</span>
                      <div className="text-sm font-medium truncate">{item.stats.averageDays.toFixed(1)}d</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2 min-w-0 overflow-hidden">
                      <span className="font-semibold text-[#003594] block mb-0.5 text-[10px] truncate">Weighted</span>
                      <div className="text-sm font-medium truncate">{item.stats.weightedAverageDays.toFixed(1)}d</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2 min-w-0 overflow-hidden">
                      <span className="font-semibold text-[#003594] block mb-0.5 text-[10px] truncate">Median</span>
                      <div className="text-sm font-medium truncate">{item.stats.medianDays.toFixed(1)}d</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2 min-w-0 overflow-hidden">
                      <span className="font-semibold text-[#003594] block mb-0.5 text-[10px] truncate">Latest</span>
                      <div className="text-sm font-medium truncate">
                        {item.stats.latestReceiveDate
                        ? new Date(item.stats.latestReceiveDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>);
            })}
          </div>)}

        <div className="text-[11px] leading-relaxed text-gray-400">
          These insights update automatically as new receives are approved. Extreme expedite delays may fall outside the depicted range.
        </div>
      </CardContent>
    </Card>);
}
