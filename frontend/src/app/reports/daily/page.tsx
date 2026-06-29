'use client';

import { useAuthContext } from '@/context/AuthContext';
import { DashboardInsightsProvider, useDashboardInsightsContext } from '@/context/DashboardInsightsContext';
import { DashboardAnalytics } from '@/components/dashboard/DashboardAnalytics';
import { FunDatePicker } from '@/components/dashboard/FunDatePicker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function DailyReportsContent() {
    const { permissions } = useAuthContext();
    const canAccess =
        permissions?.includes('view_daily_reports') ||
        permissions?.includes('can_view_dashboard');
    const { range, setRange, fiscalYearLabel, timeSeriesTotals, loading } = useDashboardInsightsContext();

    if (!canAccess) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 bg-[#f6f8fc]/80 p-6 text-center">
                <h1 className="text-lg font-semibold text-[#003594]">Access Denied</h1>
                <p className="max-w-md text-sm text-gray-600">
                    You do not have permission to view daily reports. If you believe this is a mistake, please contact an administrator.
                </p>
            </div>
        );
    }

    const summaryItems = [
        { label: 'Issues', value: timeSeriesTotals.issues, color: 'text-rose-600' },
        { label: 'Requests', value: timeSeriesTotals.requests, color: 'text-sky-600' },
        { label: 'Receives', value: timeSeriesTotals.receives, color: 'text-emerald-600' },
        { label: 'RRPs', value: timeSeriesTotals.rrps, color: 'text-amber-600' },
    ];

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
                        Daily Reports
                    </h1>
                    <p className="mt-1 text-gray-600">
                        Daily operational trends for issues, requests, receives, and RRPs.
                        {fiscalYearLabel ? ` Fiscal year ${fiscalYearLabel}.` : ''}
                    </p>
                </div>

                <Card className="border-[#002a6e]/10">
                    <CardHeader>
                        <CardTitle>Date Range</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <FunDatePicker from={range.from} to={range.to} onChange={setRange} />
                        <p className="text-sm text-gray-500">
                            Showing {new Date(range.from).toLocaleDateString()} to {new Date(range.to).toLocaleDateString()}.
                            Click a point on any chart to view that day&apos;s details.
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {summaryItems.map((item) => (
                                <div
                                    key={item.label}
                                    className="rounded-xl border border-[#002a6e]/10 bg-white px-4 py-3 shadow-sm"
                                >
                                    <p className="text-xs uppercase tracking-wide text-gray-500">{item.label}</p>
                                    <p className={`text-2xl font-semibold ${item.color}`}>
                                        {loading ? '…' : item.value.toLocaleString()}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <DashboardAnalytics />
            </div>
        </div>
    );
}

export default function DailyReportsPage() {
    return (
        <DashboardInsightsProvider>
            <DailyReportsContent />
        </DashboardInsightsProvider>
    );
}
