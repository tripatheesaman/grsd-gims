'use client';
import { useCallback, useMemo, useState } from 'react';
import { useApiQuery } from '@/hooks/api/useApiQuery';
import { queryKeys } from '@/lib/queryKeys';

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
    
    const params = useMemo(() => ({ fromDate: range.from, toDate: range.to }), [range.from, range.to]);
    
    const { data: issuesRes, isLoading: issuesLoading } = useApiQuery(
        queryKeys.dashboard.dailyIssue({ ...params, page: 1, limit: 5000 }),
        '/api/report/dailyissue',
        { ...params, page: 1, limit: 5000 },
        { staleTime: 1000 * 60 * 2 }
    );
    
    const { data: reqRes, isLoading: reqLoading } = useApiQuery(
        queryKeys.dashboard.dailyRequest(params),
        '/api/report/daily/request',
        params,
        { staleTime: 1000 * 60 * 2 }
    );
    
    const { data: recRes, isLoading: recLoading } = useApiQuery(
        queryKeys.dashboard.dailyReceive(params),
        '/api/report/daily/receive',
        params,
        { staleTime: 1000 * 60 * 2 }
    );
    
    const { data: rrpRes, isLoading: rrpLoading } = useApiQuery(
        queryKeys.dashboard.dailyRrp(params),
        '/api/report/daily/rrp',
        params,
        { staleTime: 1000 * 60 * 2 }
    );
    
    const { data: totalsRes, isLoading: totalsLoading } = useApiQuery(
        queryKeys.dashboard.totals(params),
        '/api/report/dashboard/totals',
        params,
        { staleTime: 1000 * 60 * 2 }
    );
    
    const issuesByDate = useMemo(() => {
        const issuesRows =
            typeof issuesRes?.data === 'object' &&
            issuesRes.data !== null &&
            'issues' in issuesRes.data &&
            Array.isArray((issuesRes.data as { issues: unknown }).issues)
                ? (issuesRes.data as { issues: { issue_date: string; nac_code?: string }[] }).issues
                : [];
        const map = new Map<string, Set<string>>();
        for (const item of issuesRows) {
            const key = formatISODate(new Date(item.issue_date));
            const set = map.get(key) ?? new Set<string>();
            if (item.nac_code) {
                set.add(item.nac_code);
            }
            map.set(key, set);
        }
        return map;
    }, [issuesRes?.data]);
    
    const issueSeries = useMemo(() => 
        buildSeries(Array.from(issuesByDate.entries()).map(([date, set]) => ({ date, count: set.size })), range.from, range.to),
        [issuesByDate, range.from, range.to]
    );
    
            interface RequestSeriesRow {
                date: string;
                count?: number;
            }
    
    const requestSeries = useMemo(() => {
        const requestRows =
            typeof reqRes?.data === 'object' &&
            reqRes.data !== null &&
            'series' in reqRes.data &&
            Array.isArray((reqRes.data as { series: unknown }).series)
                ? (reqRes.data as { series: RequestSeriesRow[] }).series
                : [];
        return buildSeries(requestRows.map(r => ({ date: r.date, count: r.count || 0 })), range.from, range.to);
    }, [reqRes?.data, range.from, range.to]);
    
    const receiveSeries = useMemo(() => {
        const rows =
            typeof recRes?.data === 'object' &&
            recRes.data !== null &&
            'series' in recRes.data &&
            Array.isArray((recRes.data as { series: unknown }).series)
                ? (recRes.data as { series: SummaryRow[] }).series
                : [];
        return buildSeries(rows, range.from, range.to);
    }, [recRes?.data, range.from, range.to]);
    
    const rrpSeries = useMemo(() => {
        const rows =
            typeof rrpRes?.data === 'object' &&
            rrpRes.data !== null &&
            'series' in rrpRes.data &&
            Array.isArray((rrpRes.data as { series: unknown }).series)
                ? (rrpRes.data as { series: SummaryRow[] }).series
                : [];
        return buildSeries(rows, range.from, range.to);
    }, [rrpRes?.data, range.from, range.to]);
    
    const dashboardTotals: DashboardTotals = useMemo(() => {
        const data = (totalsRes?.data ?? {}) as Partial<DashboardTotals>;
        return {
            uniqueRequests: Number(data?.uniqueRequests) || 0,
            totalItemsRequested: Number(data?.totalItemsRequested) || 0,
            totalItemsReceived: Number(data?.totalItemsReceived) || 0,
            issuesProcessed: Number(data?.issuesProcessed) || 0,
            uniqueRRPs: Number(data?.uniqueRRPs) || 0,
            totalItemsPaidFor: Number(data?.totalItemsPaidFor) || 0,
            purchaseReceives: Number(data?.purchaseReceives) || 0,
            tenderReceives: Number(data?.tenderReceives) || 0,
            processedRRPs: Number(data?.processedRRPs) || 0,
            voidRRPs: Number(data?.voidRRPs) || 0,
            processedLocalRRPs: Number(data?.processedLocalRRPs) || 0,
            processedForeignRRPs: Number(data?.processedForeignRRPs) || 0,
            totalSparesQuantity: Number(data?.totalSparesQuantity) || 0,
            totalSparesValue: Number(data?.totalSparesValue) || 0,
            totalItemsIssued: Number(data?.totalItemsIssued) || 0,
            petrolIssuedQuantity: Number(data?.petrolIssuedQuantity) || 0,
            dieselIssuedQuantity: Number(data?.dieselIssuedQuantity) || 0,
            spareIssuedQuantity: Number(data?.spareIssuedQuantity) || 0
        };
    }, [totalsRes?.data]);
    
    const timeSeriesTotals = useMemo(() => ({
        issues: issueSeries.reduce((sum, point) => sum + point.value, 0),
        requests: requestSeries.reduce((sum, point) => sum + point.value, 0),
        receives: receiveSeries.reduce((sum, point) => sum + point.value, 0),
        rrps: rrpSeries.reduce((sum, point) => sum + point.value, 0)
    }), [issueSeries, requestSeries, receiveSeries, rrpSeries]);
    
    const handleRangeChange = useCallback((next: DashboardRange) => {
        setRange(next);
    }, []);
    
    const reload = useCallback(() => {
        setRange(prev => ({ ...prev }));
    }, []);
    
    return {
        range,
        setRange: handleRangeChange,
        loading: issuesLoading || reqLoading || recLoading || rrpLoading || totalsLoading,
        error: null,
        issueSeries,
        requestSeries,
        receiveSeries,
        rrpSeries,
        totals: dashboardTotals,
        timeSeriesTotals,
        reload
    };
};
