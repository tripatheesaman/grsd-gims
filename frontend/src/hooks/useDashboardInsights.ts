'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { API } from '@/lib/api';
export interface SeriesPoint {
    date: string;
    value: number;
}
export interface DashboardRange {
    from: string;
    to: string;
}
interface SummaryRow {
    date: string;
    count: number;
}
interface DashboardTotals {
    uniqueRequests: number;
    totalItemsRequested: number;
    totalItemsReceived: number;
    issuesProcessed: number;
    uniqueRRPs: number;
    totalItemsPaidFor: number;
    purchaseReceives: number;
    tenderReceives: number;
    processedRRPs: number;
    voidRRPs: number;
    processedLocalRRPs: number;
    processedForeignRRPs: number;
    totalSparesQuantity: number;
    totalSparesValue: number;
    totalItemsIssued: number;
    petrolIssuedQuantity: number;
    dieselIssuedQuantity: number;
    spareIssuedQuantity: number;
}
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const formatISODate = (value: Date) => value.toISOString().slice(0, 10);
export const getDefaultDashboardRange = (): DashboardRange => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const fiscalStart = new Date(currentYear, 6, 17);
    const from = fiscalStart > today ? new Date(currentYear - 1, 6, 17) : fiscalStart;
    return { from: formatISODate(from), to: formatISODate(today) };
};
const buildSeries = (rows: SummaryRow[], from: string, to: string): SeriesPoint[] => {
    const byDate = new Map<string, number>();
    for (const row of rows) {
        const key = formatISODate(new Date(row.date));
        byDate.set(key, (byDate.get(key) ?? 0) + Number(row.count));
    }
    const start = new Date(from);
    const end = new Date(to);
    const series: SeriesPoint[] = [];
    for (let cursor = new Date(start); cursor <= end; cursor = new Date(cursor.getTime() + MS_PER_DAY)) {
        const key = formatISODate(cursor);
        series.push({ date: key, value: byDate.get(key) ?? 0 });
    }
    return series;
};
export const useDashboardInsights = () => {
    const [range, setRange] = useState<DashboardRange>(() => getDefaultDashboardRange());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [issueSeries, setIssueSeries] = useState<SeriesPoint[]>([]);
    const [requestSeries, setRequestSeries] = useState<SeriesPoint[]>([]);
    const [receiveSeries, setReceiveSeries] = useState<SeriesPoint[]>([]);
    const [rrpSeries, setRrpSeries] = useState<SeriesPoint[]>([]);
    const [dashboardTotals, setDashboardTotals] = useState<DashboardTotals>({
        uniqueRequests: 0,
        totalItemsRequested: 0,
        totalItemsReceived: 0,
        issuesProcessed: 0,
        uniqueRRPs: 0,
        totalItemsPaidFor: 0,
        purchaseReceives: 0,
        tenderReceives: 0,
        processedRRPs: 0,
        voidRRPs: 0,
        processedLocalRRPs: 0,
        processedForeignRRPs: 0,
        totalSparesQuantity: 0,
        totalSparesValue: 0,
        totalItemsIssued: 0,
        petrolIssuedQuantity: 0,
        dieselIssuedQuantity: 0,
        spareIssuedQuantity: 0
    });
    const fetchAll = useCallback(async (from: string, to: string) => {
        setLoading(true);
        setError(null);
        try {
            const [issuesRes, reqRes, recRes, rrpRes] = await Promise.all([
                API.get('/api/report/dailyissue', { params: { fromDate: from, toDate: to, page: 1, limit: 5000 } }),
                API.get('/api/report/daily/request', { params: { fromDate: from, toDate: to } }),
                API.get('/api/report/daily/receive', { params: { fromDate: from, toDate: to } }),
                API.get('/api/report/daily/rrp', { params: { fromDate: from, toDate: to } })
            ]);
            const issuesRows: {
                issue_date: string;
                nac_code?: string;
            }[] = Array.isArray(issuesRes.data?.issues)
                ? issuesRes.data.issues
                : [];
            const issuesByDate = new Map<string, Set<string>>();
            for (const item of issuesRows) {
                const key = formatISODate(new Date(item.issue_date));
                const set = issuesByDate.get(key) ?? new Set<string>();
                if (item.nac_code) {
                    set.add(item.nac_code);
                }
                issuesByDate.set(key, set);
            }
            setIssueSeries(buildSeries(Array.from(issuesByDate.entries()).map(([date, set]) => ({ date, count: set.size })), from, to));
            interface RequestSeriesRow {
                date: string;
                count?: number;
            }
            const requestRows: RequestSeriesRow[] = (reqRes.data?.series ?? []) as RequestSeriesRow[];
            setRequestSeries(buildSeries(requestRows.map(r => ({ date: r.date, count: r.count || 0 })), from, to));
            setReceiveSeries(buildSeries(((recRes.data?.series ?? []) as SummaryRow[]) ?? [], from, to));
            setRrpSeries(buildSeries(((rrpRes.data?.series ?? []) as SummaryRow[]) ?? [], from, to));
        }
        catch {
            setIssueSeries([]);
            setRequestSeries([]);
            setReceiveSeries([]);
            setRrpSeries([]);
            setError('Unable to load analytics right now.');
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        fetchAll(range.from, range.to);
    }, [range, fetchAll]);
    const [totalsLoading, setTotalsLoading] = useState(true);
    const fetchDashboardTotals = useCallback(async (from: string, to: string) => {
        setTotalsLoading(true);
        try {
            const totalsRes = await API.get('/api/report/dashboard/totals', {
                params: { fromDate: from, toDate: to }
            });
            if (totalsRes.data) {
                setDashboardTotals({
                    uniqueRequests: Number(totalsRes.data.uniqueRequests) || 0,
                    totalItemsRequested: Number(totalsRes.data.totalItemsRequested) || 0,
                    totalItemsReceived: Number(totalsRes.data.totalItemsReceived) || 0,
                    issuesProcessed: Number(totalsRes.data.issuesProcessed) || 0,
                    uniqueRRPs: Number(totalsRes.data.uniqueRRPs) || 0,
                    totalItemsPaidFor: Number(totalsRes.data.totalItemsPaidFor) || 0,
                    purchaseReceives: Number(totalsRes.data.purchaseReceives) || 0,
                    tenderReceives: Number(totalsRes.data.tenderReceives) || 0,
                    processedRRPs: Number(totalsRes.data.processedRRPs) || 0,
                    voidRRPs: Number(totalsRes.data.voidRRPs) || 0,
                    processedLocalRRPs: Number(totalsRes.data.processedLocalRRPs) || 0,
                    processedForeignRRPs: Number(totalsRes.data.processedForeignRRPs) || 0,
                    totalSparesQuantity: Number(totalsRes.data.totalSparesQuantity) || 0,
                    totalSparesValue: Number(totalsRes.data.totalSparesValue) || 0,
                    totalItemsIssued: Number(totalsRes.data.totalItemsIssued) || 0,
                    petrolIssuedQuantity: Number(totalsRes.data.petrolIssuedQuantity) || 0,
                    dieselIssuedQuantity: Number(totalsRes.data.dieselIssuedQuantity) || 0,
                    spareIssuedQuantity: Number(totalsRes.data.spareIssuedQuantity) || 0
                });
            }
        }
        catch {
        }
        finally {
            setTotalsLoading(false);
        }
    }, []);
    useEffect(() => {
        fetchDashboardTotals(range.from, range.to);
    }, [range, fetchDashboardTotals]);
    const timeSeriesTotals = useMemo(() => ({
        issues: issueSeries.reduce((sum, point) => sum + point.value, 0),
        requests: requestSeries.reduce((sum, point) => sum + point.value, 0),
        receives: receiveSeries.reduce((sum, point) => sum + point.value, 0),
        rrps: rrpSeries.reduce((sum, point) => sum + point.value, 0)
    }), [issueSeries, requestSeries, receiveSeries, rrpSeries]);
    const totals: DashboardTotals = useMemo(() => dashboardTotals, [dashboardTotals]);
    const handleRangeChange = useCallback((next: DashboardRange) => {
        setRange(next);
    }, []);
    const reload = useCallback(() => {
        fetchAll(range.from, range.to);
    }, [fetchAll, range.from, range.to]);
    return {
        range,
        setRange: handleRangeChange,
        loading: loading || totalsLoading,
        error,
        issueSeries,
        requestSeries,
        receiveSeries,
        rrpSeries,
        totals,
        timeSeriesTotals,
        reload
    };
};
