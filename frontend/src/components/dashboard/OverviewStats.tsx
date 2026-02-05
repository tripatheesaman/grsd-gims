'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { API } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/ui/button';
import { FileText, Package, Receipt, ClipboardList, Activity, Fuel } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
interface Counts {
    requests: number | null;
    receives: number | null;
    rrps: number | null;
    issues: number | null;
    fuelIssues: number | null;
    healthOk: boolean | null;
}
type PendingRequestItem = {
    requestNumber: string;
};
type PendingReceiveRecord = {
    receiveSource?: string | null;
    receive_source?: string | null;
    [key: string]: unknown;
};
type PendingRRPRecord = {
    rrp_number?: string | null;
    rrpNumber?: string | null;
    approval_status?: string | null;
    approvalStatus?: string | null;
    [key: string]: unknown;
};
type PendingRRPResponse = {
    pendingRRPs?: PendingRRPRecord[];
};
export function OverviewStats() {
    const router = useRouter();
    const [counts, setCounts] = useState<Counts>({
        requests: null,
        receives: null,
        rrps: null,
        issues: null,
        fuelIssues: null,
        healthOk: null,
    });
    const [loading, setLoading] = useState(true);
    const fetchCounts = useCallback(async () => {
        setLoading(true);
        try {
            const [reqRes, recRes, rrpRes, issRes, fuelIssRes, healthRes] = await Promise.all([
                API.get('/api/request/pending'),
                API.get('/api/receive/pending'),
                API.get('/api/rrp/pending'),
                API.get('/api/issue/pending'),
                API.get('/api/issue/pending/fuel'),
                API.get('/health'),
            ]);
            const requestCount = Array.isArray(reqRes.data)
                ? new Set((reqRes.data as PendingRequestItem[]).map((r) => r.requestNumber)).size
                : 0;
            const receivesRaw = Array.isArray(recRes.data) ? (recRes.data as PendingReceiveRecord[]) : [];
            const normalizedReceives = receivesRaw.map((item) => ({
                ...item,
                receiveSource: (item.receiveSource ?? item.receive_source ?? '').toString(),
            }));
            const purchaseReceives = normalizedReceives.filter((item) => item.receiveSource.trim().toLowerCase() !== 'tender');
            const receivesCount = purchaseReceives.length;
            const pendingRRPsRaw: PendingRRPRecord[] = Array.isArray((rrpRes.data as PendingRRPResponse)?.pendingRRPs)
                ? ((rrpRes.data as PendingRRPResponse).pendingRRPs as PendingRRPRecord[])
                : Array.isArray(rrpRes.data)
                    ? (rrpRes.data as PendingRRPRecord[])
                    : [];
            const filteredRRPs = pendingRRPsRaw.filter((item) => {
                const number = String(item.rrp_number ?? item.rrpNumber ?? '').trim().toLowerCase();
                const status = String(item.approval_status ?? item.approvalStatus ?? '').trim().toUpperCase();
                return number !== 'code transfer' && status !== 'REJECTED';
            });
            const rrpsCount = filteredRRPs.length;
            const issuesCount = Array.isArray(issRes.data) ? (issRes.data as unknown[]).length : 0;
            const fuelIssuesCount = Array.isArray(fuelIssRes.data) ? (fuelIssRes.data as unknown[]).length : 0;
            const healthOk = !!healthRes?.data?.status && healthRes.data.status === 'ok';
            setCounts({
                requests: requestCount,
                receives: receivesCount,
                rrps: rrpsCount,
                issues: issuesCount,
                fuelIssues: fuelIssuesCount,
                healthOk,
            });
        }
        catch {
            setCounts((prev) => ({ ...prev, healthOk: false }));
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        fetchCounts();
    }, [fetchCounts]);
    const Stat = ({ title, value, icon: Icon, route }: {
        title: string;
        value: number | null;
        icon: LucideIcon;
        route: string;
    }) => (<Card className="border-[#002a6e]/10">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-sm font-medium text-[#003594]">{title}</CardTitle>
				<Icon className="h-5 w-5 text-[#003594]"/>
			</CardHeader>
			<CardContent className="flex items-center justify-between">
				<div className="text-3xl font-bold text-[#003594]">{loading ? '...' : value ?? 0}</div>
				<Button variant="outline" size="sm" className="border-[#002a6e]/20 hover:bg-[#003594]/5 hover:text-[#003594]" onClick={() => router.push(route)}>
					View
				</Button>
			</CardContent>
		</Card>);
    return (<div className="space-y-6">
			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-6">
				<Stat title="Pending Requests" value={counts.requests} icon={FileText as LucideIcon} route="/records/request"/>
				<Stat title="Pending Receives" value={counts.receives} icon={Package as LucideIcon} route="/records/receive"/>
				<Stat title="Pending RRPs" value={counts.rrps} icon={Receipt as LucideIcon} route="/records/rrp"/>
				<Stat title="Pending Issues" value={counts.issues} icon={ClipboardList as LucideIcon} route="/records/issue"/>
				<Stat title="Pending Fuel" value={counts.fuelIssues} icon={Fuel as LucideIcon} route="/fuels/issue"/>
				<Card className="border-[#002a6e]/10">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-[#003594]">Backend Health</CardTitle>
						<Activity className={`h-5 w-5 ${counts.healthOk ? 'text-green-600' : 'text-red-600'}`}/>
					</CardHeader>
					<CardContent>
						<div className={`text-sm font-semibold ${counts.healthOk ? 'text-green-700' : 'text-red-700'}`}>
							{counts.healthOk === null ? '...' : counts.healthOk ? 'Online' : 'Unavailable'}
						</div>
					</CardContent>
				</Card>
			</div>
		</div>);
}
