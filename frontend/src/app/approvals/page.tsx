'use client';
import { useMemo } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { ApprovalCountsProvider, useApprovalCountsContext } from '@/context/ApprovalCountsContext';
import { PendingRequestsCount } from '@/components/dashboard/PendingRequestsCount';
import { PendingReceivesCount } from '@/components/dashboard/PendingReceivesCount';
import { PendingRRPCount } from '@/components/dashboard/PendingRRPCount';
import { PendingIssuesCount } from '@/components/dashboard/PendingIssuesCount';
import { PendingFuelIssues } from '@/components/dashboard/PendingFuelIssues';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCcw } from 'lucide-react';
import { cn } from '@/utils/utils';
const SummaryPill = ({ label, value, accent, loading }: {
    label: string;
    value: number | null;
    accent: string;
    loading: boolean;
}) => (<div className={cn('rounded-2xl border p-4 shadow-sm backdrop-blur', accent)}>
    <p className="text-xs uppercase tracking-[0.25em] text-white/70">{label}</p>
    <div className="mt-2 text-2xl font-semibold text-white">
      {loading ? <span className="animate-pulse text-sm text-white/70">Loading…</span> : value ?? 0}
    </div>
  </div>);
function ApprovalsInner() {
    const { permissions } = useAuthContext();
    const { counts, loading, refresh } = useApprovalCountsContext();
    const sections = useMemo(() => [
        {
            key: 'requests',
            title: 'Requests',
            description: 'Item requests awaiting validation and approval.',
            permission: 'can_approve_request',
            component: <PendingRequestsCount />
        },
        {
            key: 'receives',
            title: 'Receives',
            description: 'Goods receipts pending confirmation into inventory.',
            permission: 'can_approve_receive',
            component: <PendingReceivesCount />
        },
        {
            key: 'rrps',
            title: 'RRPs',
            description: 'Receive Register Papers requiring review.',
            permission: 'can_approve_rrp',
            component: <PendingRRPCount />
        },
        {
            key: 'issues',
            title: 'Issues',
            description: 'General stock issue slips awaiting clearance.',
            permission: 'can_approve_issues',
            component: <PendingIssuesCount />
        },
        {
            key: 'fuel',
            title: 'Fuel Issues',
            description: 'Fuel dispensing slips pending approval.',
            permission: 'can_approve_issues',
            component: <PendingFuelIssues />
        }
    ], []);
    const allowedSections = useMemo(() => sections.filter((section) => permissions?.includes(section.permission)), [permissions, sections]);
    if (!permissions || allowedSections.length === 0) {
        return (<div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 bg-[#f6f8fc]/80 p-6 text-center">
        <AlertCircle className="h-10 w-10 text-[#d2293b]"/>
        <h1 className="text-lg font-semibold text-[#003594]">No Approval Access</h1>
        <p className="max-w-md text-sm text-gray-600">
          You currently do not have permission to review or approve any pending items. If you believe this is
          a mistake, please contact an administrator.
        </p>
      </div>);
    }
    return (<div className="min-h-screen bg-[#f6f8fc]">
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-3xl border border-[#003594]/10 bg-gradient-to-br from-[#012b6c] via-[#003594] to-[#05163c] p-8 text-white shadow-[0_30px_80px_-40px_rgba(0,0,0,0.5)]">
          <div className="absolute -right-32 -top-32 h-72 w-72 rounded-full bg-white/10 blur-3xl" aria-hidden/>
          <div className="absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-[#d2293b]/30 blur-3xl" aria-hidden/>
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-white/60">Approvals Command</p>
              <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
                {counts.total > 0 ? 'Action Required' : 'All Clear'}: Pending items dashboard
              </h1>
              <p className="max-w-xl text-sm text-white/80">
                Review and finalize outstanding requests, receives, issue slips, and RRPs. Keeping inventory in
                sync starts here.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3 md:items-end">
              <span className="text-xs uppercase tracking-[0.25em] text-white/60">Total pending</span>
              <span className="text-4xl font-bold text-white">{loading ? '…' : counts.total}</span>
              <Button onClick={refresh} variant="secondary" className="flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-4 py-2 text-sm text-white shadow-lg transition hover:bg-white/20">
                <RefreshCcw className="h-4 w-4"/>
                Refresh counts
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <SummaryPill label="Requests" value={counts.requests} accent="bg-gradient-to-br from-[#2563eb]/70 to-[#003594]/90" loading={loading}/>
          <SummaryPill label="Receives" value={counts.receives} accent="bg-gradient-to-br from-[#10b981]/60 to-[#0f766e]/80" loading={loading}/>
          <SummaryPill label="RRPs" value={counts.rrps} accent="bg-gradient-to-br from-[#d946ef]/70 to-[#86198f]/80" loading={loading}/>
          <SummaryPill label="Issues" value={counts.issues} accent="bg-gradient-to-br from-[#f59e0b]/70 to-[#d97706]/80" loading={loading}/>
          <SummaryPill label="Fuel" value={counts.fuelIssues} accent="bg-gradient-to-br from-[#d2293b]/70 to-[#7f1d1d]/80" loading={loading}/>
        </section>

        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {allowedSections.map((section) => (<div key={section.key} className="flex h-full flex-col gap-4 rounded-3xl border border-[#002a6e]/10 bg-white/95 p-6 shadow-[0_24px_60px_-36px_rgba(0,32,77,0.35)]">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[#003594]">{section.title}</h2>
                  <p className="text-sm text-gray-500">{section.description}</p>
                </div>
              </div>
              <div>{section.component}</div>
            </div>))}
        </section>
      </div>
    </div>);
}
export default function ApprovalsPage() {
    return (<ApprovalCountsProvider>
      <ApprovalsInner />
    </ApprovalCountsProvider>);
}
