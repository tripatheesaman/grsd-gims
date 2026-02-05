'use client';
import { useAuthContext } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { API } from '@/lib/api';
import { PredictionSummary } from '@/types/prediction';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PredictionSummaryCard } from '@/components/prediction/PredictionSummaryCard';
import { Slider } from '@mui/material';
import { RefreshCcw, Activity, Search, Sparkles, SlidersHorizontal } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/utils/utils';
interface PredictionListResponse {
    data: PredictionSummary[];
    pagination: {
        page: number;
        pageSize: number;
        total: number;
    };
}
type ConfidenceFilter = 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW';
const PAGE_SIZE = 20;
export default function PredictiveAnalyticsPage() {
    const { user, permissions } = useAuthContext();
    const router = useRouter();
    const canAccess = permissions.includes('can_access_predictive_analysis');
    const [loading, setLoading] = useState(false);
    const [predictions, setPredictions] = useState<PredictionSummary[]>([]);
    const [selectedPrediction, setSelectedPrediction] = useState<PredictionSummary | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [minDays, setMinDays] = useState(0);
    const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('ALL');
    const [adjustment, setAdjustment] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        if (!user) {
            router.push('/login');
            return;
        }
        if (!canAccess) {
            router.push('/unauthorized');
        }
    }, [user, canAccess, router]);
    const fetchPredictions = useCallback(async () => {
        if (!canAccess)
            return;
        setLoading(true);
        setError(null);
        try {
            const response = await API.get('/api/predictions', {
                params: {
                    page,
                    pageSize: PAGE_SIZE,
                    search: searchTerm || undefined
                }
            });
            const payload = response.data as PredictionListResponse;
            setPredictions(payload.data);
            const total = payload.pagination?.total ?? PAGE_SIZE;
            setTotalPages(Math.max(1, Math.ceil(total / PAGE_SIZE)));
            if (payload.data.length > 0) {
                setSelectedPrediction((prev) => {
                    if (prev) {
                        const found = payload.data.find((item) => item.nacCode === prev.nacCode);
                        return found ?? payload.data[0];
                    }
                    return payload.data[0];
                });
            }
            else {
                setSelectedPrediction(null);
            }
        }
        catch {
            if (process.env.NODE_ENV !== 'production') {
            }
            setError('Unable to load predictive data. Please try again.');
        }
        finally {
            setLoading(false);
        }
    }, [canAccess, page, searchTerm]);
    useEffect(() => {
        fetchPredictions();
    }, [fetchPredictions]);
    const filteredPredictions = useMemo(() => {
        return predictions.filter((item) => {
            const meetsMin = item.predictedDays >= minDays;
            const meetsConfidence = confidenceFilter === 'ALL' ? true : item.stats.confidenceLevel === confidenceFilter;
            return meetsMin && meetsConfidence;
        });
    }, [predictions, minDays, confidenceFilter]);
    const adjustedPrediction = useMemo(() => {
        if (!selectedPrediction)
            return null;
        const base = selectedPrediction.predictedDays + adjustment;
        const lower = selectedPrediction.rangeLowerDays !== null
            ? selectedPrediction.rangeLowerDays + adjustment
            : null;
        const upper = selectedPrediction.rangeUpperDays !== null
            ? selectedPrediction.rangeUpperDays + adjustment
            : null;
        return {
            ...selectedPrediction,
            predictedDays: Math.max(base, 0),
            rangeLowerDays: lower !== null ? Math.max(lower, 0) : null,
            rangeUpperDays: upper !== null ? Math.max(upper, 0) : null
        };
    }, [selectedPrediction, adjustment]);
    const handleRefreshAll = useCallback(async () => {
        if (!canAccess)
            return;
        setRefreshing(true);
        try {
            await API.post('/api/predictions/refresh');
            await fetchPredictions();
        }
        catch {
            if (process.env.NODE_ENV !== 'production') {
            }
            setError('Failed to refresh predictions. Please try again later.');
        }
        finally {
            setRefreshing(false);
        }
    }, [canAccess, fetchPredictions]);
    const handleRefreshSingle = useCallback(async () => {
        if (!canAccess || !selectedPrediction)
            return;
        setRefreshing(true);
        try {
            await API.post('/api/predictions/refresh', { nacCode: selectedPrediction.nacCode });
            await fetchPredictions();
        }
        catch {
            if (process.env.NODE_ENV !== 'production') {
            }
            setError(`Failed to refresh ${selectedPrediction.nacCode}.`);
        }
        finally {
            setRefreshing(false);
        }
    }, [canAccess, selectedPrediction, fetchPredictions]);
    if (!canAccess) {
        return null;
    }
    return (<div className="space-y-6">
      <div className="rounded-2xl border border-[#003594]/10 bg-gradient-to-r from-white via-white to-[#f3f7ff] p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#003594]/70">
              <Sparkles className="h-4 w-4 text-[#d2293b]"/>
              Predictive
            </div>
            <h1 className="text-3xl font-bold leading-tight text-[#0f172a]">
              Predictive Lead-Time Analysis
            </h1>
            <p className="text-sm text-gray-600">
              Explore historical lead times, compare confidence levels, and simulate arrival scenarios for every NAC code.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-[#003594]/20 bg-[#003594]/5 text-[#003594]">
                {filteredPredictions.length} results • page {page} of {totalPages}
              </Badge>
              {minDays > 0 && (<Badge variant="outline" className="border-[#d2293b]/20 bg-[#d2293b]/5 text-[#d2293b]">
                  ≥ {minDays} days filter
                </Badge>)}
              {confidenceFilter !== 'ALL' && (<Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-600">
                  {confidenceFilter} confidence
                </Badge>)}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleRefreshAll} disabled={refreshing || loading} className="bg-[#003594] hover:bg-[#003594]/90 text-white">
              <RefreshCcw className="h-4 w-4 mr-2"/>
              Refresh All Metrics
            </Button>
            <Button variant="outline" onClick={handleRefreshSingle} disabled={refreshing || !selectedPrediction || loading} className="border-[#002a6e]/20 hover:bg-[#003594]/5 hover:text-[#003594]">
              <Activity className="h-4 w-4 mr-2"/>
              Refresh Selected
            </Button>
          </div>
        </div>
      </div>

      <Card className="border border-[#002a6e]/10 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-lg font-semibold text-[#003594] flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-[#d2293b]"/>
              Filters & Controls
            </CardTitle>
            {(searchTerm || minDays > 0 || confidenceFilter !== 'ALL') && (<Button variant="ghost" size="sm" className="text-xs text-[#003594]" onClick={() => {
                setSearchTerm('');
                setMinDays(0);
                setConfidenceFilter('ALL');
            }}>
                Clear filters
              </Button>)}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600 uppercase">Search NAC Codes</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"/>
              <Input value={searchTerm} onChange={(e) => {
            setPage(1);
            setSearchTerm(e.target.value);
        }} className="pl-9" placeholder="e.g. GT 04552"/>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600 uppercase">Minimum Predicted Days</label>
            <Slider value={minDays} min={0} max={60} step={1} marks={[
            { value: 0, label: '0' },
            { value: 30, label: '30' },
            { value: 60, label: '60' }
        ]} onChange={(_, value) => {
            if (Array.isArray(value))
                return;
            setMinDays(value);
        }} sx={{
            color: '#003594',
            '& .MuiSlider-mark': { backgroundColor: '#00359433' },
            '& .MuiSlider-markLabel': { color: '#1f2937', fontSize: 10 }
        }}/>
            <div className="text-xs text-gray-500">Showing NAC codes with ≥ {minDays} days</div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600 uppercase">Confidence</label>
            <div className="flex gap-2 flex-wrap">
              {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as ConfidenceFilter[]).map((option) => (<button key={option} type="button" onClick={() => setConfidenceFilter(option)} className={cn('rounded-full border px-3 py-1 text-xs font-semibold transition-colors', confidenceFilter === option
                ? 'bg-[#003594] text-white border-[#003594]'
                : 'border-[#003594]/20 text-[#003594] hover:bg-[#003594]/10')}>
                  {option}
                </button>))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600 uppercase">Pages</label>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((prev) => Math.max(prev - 1, 1))}>
                Previous
              </Button>
              <span className="text-xs text-gray-500">
                Page {page} of {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}>
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 2xl:grid-cols-[2fr_3fr]">
        <Card className="border border-[#002a6e]/10">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold text-[#003594]">NAC Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (<div className="flex items-center justify-center py-8">
                <Spinner />
              </div>) : error ? (<div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                {error}
              </div>) : filteredPredictions.length === 0 ? (<div className="text-sm text-gray-500">No predictions match the current filters.</div>) : (<div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                {filteredPredictions.map((item) => {
                const isActive = selectedPrediction?.nacCode === item.nacCode;
                const progress = Math.min((item.predictedDays / 60) * 100, 100);
                return (<button key={item.nacCode} type="button" onClick={() => setSelectedPrediction(item)} className={cn('w-full text-left rounded-xl border p-3 transition-transform duration-150 ease-out', isActive
                        ? 'border-[#003594] bg-[#003594]/10 shadow-lg shadow-[#0035940d] ring-2 ring-[#003594]/20'
                        : 'border-[#002a6e]/10 hover:-translate-y-[1px] hover:border-[#003594]/30 hover:bg-[#003594]/5')}>
                      <div className="flex items-center justify-between text-sm font-semibold text-[#003594]">
                        <span>{item.nacCode}</span>
                        <span>~{Math.round(item.predictedDays)} days</span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        Confidence {item.stats.confidenceLevel} • {item.sampleSize} samples
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-[#cbd5f5]">
                        <div className="h-2 rounded-full bg-[#003594]" style={{ width: `${progress}%` }}/>
                      </div>
                    </button>);
            })}
              </div>)}
          </CardContent>
        </Card>

        <Card className="border border-[#002a6e]/10">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold text-[#003594]">
              Prediction Playground
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {!selectedPrediction ? (<div className="text-sm text-gray-500">
                Select a NAC code from the list to inspect detailed predictions.
              </div>) : (<>
                {adjustedPrediction && (<PredictionSummaryCard prediction={adjustedPrediction} baseDate={new Date()} accentColor="#d2293b"/>)}
                <div className="rounded-xl border border-[#d2293b]/20 bg-[#fff5f5] p-4 text-xs text-[#7f1d1d] shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold uppercase tracking-wide">Scenario planner</span>
                    <span>{adjustment > 0 ? `Expedite by ${adjustment} day(s)` : adjustment < 0 ? `Delay by ${Math.abs(adjustment)} day(s)` : 'Baseline'}</span>
                  </div>
                  <Slider value={adjustment} min={-10} max={10} step={1} marks={[
                { value: -10, label: '-10' },
                { value: 0, label: '0' },
                { value: 10, label: '+10' }
            ]} onChange={(_, value) => {
                if (Array.isArray(value))
                    return;
                setAdjustment(value);
            }} sx={{
                color: '#d2293b',
                '& .MuiSlider-mark': { backgroundColor: '#d2293b33' },
                '& .MuiSlider-markLabel': { color: '#7f1d1d', fontSize: 10 }
            }}/>
                  <p className="mt-2 text-[11px] text-[#7f1d1d]/80">
                    Drag to simulate expedited or delayed arrival scenarios. The highlight above updates instantly.
                  </p>
                </div>
                <div className="grid gap-3 text-xs text-gray-600 md:grid-cols-2">
                  <div className="rounded-lg border border-[#002a6e]/10 bg-slate-50 p-4 shadow-sm">
                    <div className="font-semibold text-[#003594]">Distribution</div>
                    <div className="mt-2 grid gap-1">
                      <div>Average: {selectedPrediction.stats.averageDays.toFixed(1)} days</div>
                      <div>Weighted: {selectedPrediction.stats.weightedAverageDays.toFixed(1)} days</div>
                      <div>Median: {selectedPrediction.stats.medianDays.toFixed(1)} days</div>
                      <div>
                        Std Dev:{' '}
                        {selectedPrediction.stats.standardDeviationDays !== null
                ? selectedPrediction.stats.standardDeviationDays.toFixed(1)
                : 'N/A'}{' '}
                        days
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#002a6e]/10 bg-slate-50 p-4 shadow-sm">
                    <div className="font-semibold text-[#003594]">Recent Activity</div>
                    <div className="mt-2 grid gap-1">
                      <div>
                        Latest Request:{' '}
                        {selectedPrediction.stats.latestRequestDate
                ? new Date(selectedPrediction.stats.latestRequestDate).toLocaleDateString()
                : 'N/A'}
                      </div>
                      <div>
                        Latest Receive:{' '}
                        {selectedPrediction.stats.latestReceiveDate
                ? new Date(selectedPrediction.stats.latestReceiveDate).toLocaleDateString()
                : 'N/A'}
                      </div>
                      <div>Sample Size: {selectedPrediction.sampleSize}</div>
                      <div>
                        Last Calculated:{' '}
                        {selectedPrediction.stats.calculatedAt
                ? new Date(selectedPrediction.stats.calculatedAt).toLocaleString()
                : 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>
              </>)}
          </CardContent>
        </Card>
      </div>
    </div>);
}
