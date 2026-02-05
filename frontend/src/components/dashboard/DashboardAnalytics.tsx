'use client';
import { useState, useCallback } from 'react';
import { TimeSeriesChart } from './TimeSeriesChart';
import { DateDetailModal } from './DateDetailModal';
import { PredictiveHighlights } from './PredictiveHighlights';
import { useDashboardInsightsContext } from '@/context/DashboardInsightsContext';
import { ArrowRight } from 'lucide-react';
export function DashboardAnalytics() {
    const { range, loading, error, issueSeries, requestSeries, receiveSeries, rrpSeries, timeSeriesTotals, reload } = useDashboardInsightsContext();
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [selectedType, setSelectedType] = useState<string | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const handleDateClick = useCallback((date: string, type: 'issues' | 'requests' | 'receives' | 'rrps') => {
        setSelectedDate(date);
        setSelectedType(type);
        setIsDetailModalOpen(true);
    }, []);
    return (<section className="space-y-6 rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white via-white to-slate-50/50 p-6 shadow-lg">
			<header className="flex flex-wrap items-center justify-between gap-5 pb-4 border-b border-slate-200/60">
				<div className="space-y-3">
					<div className="flex items-center gap-3">
						<h2 className="text-lg font-bold text-slate-900">Operational Trendlines</h2>
						<span className="inline-flex items-center gap-1.5 rounded-full bg-[#003594]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#003594]">
							Analytics
						</span>
					</div>
					<p className="text-xs text-slate-600 font-medium">
						{new Date(range.from).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} → {new Date(range.to).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
					</p>
					<div className="flex flex-wrap gap-4 text-[11px] text-slate-600">
						<span className="flex items-center gap-2 font-medium">
							<span className="h-2.5 w-2.5 rounded-full bg-rose-500 shadow-sm"/>
							Issues
						</span>
						<span className="flex items-center gap-2 font-medium">
							<span className="h-2.5 w-2.5 rounded-full bg-sky-500 shadow-sm"/>
							Requests
						</span>
						<span className="flex items-center gap-2 font-medium">
							<span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm"/>
							Receives
						</span>
						<span className="flex items-center gap-2 font-medium">
							<span className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow-sm"/>
							RRPs
						</span>
					</div>
				</div>
				<button onClick={reload} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border-2 border-[#003594]/20 bg-white px-4 py-2 text-xs font-semibold text-[#003594] transition-all hover:border-[#003594]/40 hover:bg-[#003594]/5 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
					<ArrowRight className={`h-3.5 w-3.5 transition-transform ${loading ? 'animate-spin' : 'group-hover:translate-x-0.5'}`}/>
					{loading ? 'Refreshing...' : 'Refresh'}
				</button>
			</header>
			{loading ? (<div className="flex h-60 items-center justify-center">
					<div className="flex flex-col items-center gap-3">
						<div className="h-8 w-8 animate-spin rounded-full border-4 border-[#003594]/20 border-t-[#003594]"></div>
						<p className="text-sm text-slate-500 font-medium">Loading analytics…</p>
					</div>
				</div>) : error ? (<div className="flex h-60 flex-col items-center justify-center gap-3 rounded-xl border-2 border-red-200 bg-red-50/50 p-6">
					<span className="text-sm font-semibold text-red-600">{error}</span>
					<button onClick={reload} className="rounded-lg border border-red-300 bg-white px-4 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50">
						Try again
					</button>
				</div>) : (<div className="space-y-6">
					<div className="grid gap-6 md:grid-cols-2">
						<TimeSeriesChart title={`Issues • ${timeSeriesTotals.issues}`} data={issueSeries} color="#e11d48" onDateClick={handleDateClick} chartType="issues"/>
						<TimeSeriesChart title={`Requests • ${timeSeriesTotals.requests}`} data={requestSeries} color="#0ea5e9" onDateClick={handleDateClick} chartType="requests"/>
						<TimeSeriesChart title={`Receives • ${timeSeriesTotals.receives}`} data={receiveSeries} color="#10b981" onDateClick={handleDateClick} chartType="receives"/>
						<TimeSeriesChart title={`RRPs • ${timeSeriesTotals.rrps}`} data={rrpSeries} color="#f59e0b" onDateClick={handleDateClick} chartType="rrps"/>
					</div>
					<PredictiveHighlights />
				</div>)}

			{selectedDate && selectedType && (<DateDetailModal isOpen={isDetailModalOpen} onClose={() => {
                setIsDetailModalOpen(false);
                setSelectedDate(null);
                setSelectedType(null);
            }} date={selectedDate} type={selectedType as 'issues' | 'requests' | 'receives' | 'rrps'}/>)}
		</section>);
}
