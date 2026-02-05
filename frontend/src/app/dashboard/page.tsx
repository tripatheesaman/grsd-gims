'use client';
import Link from 'next/link';
import { useMemo, useState, useEffect } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { DashboardAnalytics } from '@/components/dashboard/DashboardAnalytics';
import { DashboardInsightsProvider, useDashboardInsightsContext } from '@/context/DashboardInsightsContext';
import { FunDatePicker } from '@/components/dashboard/FunDatePicker';
import { ArrowRight, ClipboardList, Package, Receipt, BarChart3, Sparkle, DollarSign, Boxes } from 'lucide-react';
import { cn } from '@/utils/utils';
const QuickAction = ({ href, label, description, icon: Icon, accent, }: {
    href: string;
    label: string;
    description: string;
    icon: typeof ArrowRight;
    accent: string;
}) => (<Link href={href} className={cn('group flex items-center gap-3 rounded-xl border px-3.5 py-2 text-xs text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl', accent)}>
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white transition group-hover:bg-white/20">
      <Icon className="h-4 w-4 transition group-hover:scale-110"/>
    </span>
    <div className="flex-1">
      <p className="text-sm font-semibold leading-tight text-white">{label}</p>
      <p className="text-[11px] text-white/80">{description}</p>
    </div>
    <ArrowRight className="h-3 w-3 text-white/70 transition group-hover:translate-x-1 group-hover:text-white"/>
  </Link>);
const MetricCard = ({ label, value, accentClass, icon: Icon, loading, details, isActive, onToggle, }: {
    label: string;
    value: number | string;
    accentClass: string;
    icon: typeof ArrowRight;
    loading: boolean;
    details?: {
        label: string;
        value: number | string;
    }[];
    isActive?: boolean;
    onToggle?: () => void;
}) => (<div className="relative">
    <button type="button" onClick={(event) => {
        event.stopPropagation();
        onToggle?.();
    }} className="relative w-full text-left overflow-hidden rounded-xl border border-[#e0e7ff] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26438f]/40">
      <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-[#003594]/10 blur-3xl"/>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <span className="text-[11px] uppercase tracking-[0.25em] text-[#4c5c8f]">{label}</span>
          <span className="text-2xl font-semibold text-[#0f1f46]">
            {loading ? (<span className="animate-pulse text-sm text-[#8a94c4]">…</span>) : typeof value === 'number' ? (value.toLocaleString()) : (value)}
          </span>
        </div>
        <div className={cn('rounded-full border bg-[#f3f6ff] p-2 text-[#26438f] shadow-sm', accentClass)}>
          <Icon className="h-4 w-4"/>
        </div>
      </div>
      {details && (<div className="mt-3 space-y-1 text-xs font-medium text-[#4c5c8f]">
          {details.map((d) => (<div key={d.label} className="flex items-center justify-between">
              <span className="uppercase tracking-[0.2em] text-[10px] text-[#7a88b5]">{d.label}</span>
              <span className="text-sm text-[#0f1f46]">
                {typeof d.value === 'number' ? d.value.toLocaleString() : d.value}
              </span>
            </div>))}
        </div>)}
    </button>
    {isActive && (<div onClick={(event) => event.stopPropagation()} className="absolute top-4 right-4 z-30 sm:left-full sm:top-1/2 sm:-translate-y-1/2 sm:ml-3 w-44 rounded-2xl border border-[#d9def9] bg-white/95 px-4 py-3 text-[#0f1f46] shadow-2xl ring-1 ring-[#e7ebff] transition duration-200">
        <p className="text-[10px] uppercase tracking-[0.4em] text-[#7a88b5]">Total</p>
        <p className="text-xl font-semibold">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        <span className="absolute -left-1 top-1/2 hidden h-3 w-3 rotate-45 rounded-[2px] bg-white shadow-md sm:block"/>
      </div>)}
  </div>);
const getDashboardGreeting = (role: string | undefined): string => {
    if (!role)
        return 'welcome to your dashboard';
    const roleLower = role.toLowerCase();
    if (roleLower === 'superadmin' || roleLower === 'admin') {
        return 'orchestrate today\'s inventory flow';
    }
    else if (roleLower === 'manager') {
        return 'manage today\'s inventory operations';
    }
    else {
        return 'welcome to your inventory dashboard';
    }
};
const DashboardContent = () => {
    const { user, permissions } = useAuthContext();
    const { totals, loading, range, setRange } = useDashboardInsightsContext();
    const [activeMetric, setActiveMetric] = useState<string | null>(null);
    useEffect(() => {
        const closeActive = () => setActiveMetric(null);
        window.addEventListener('click', closeActive);
        return () => window.removeEventListener('click', closeActive);
    }, []);
    const quickActions = useMemo(() => {
        const items: Array<{
            href: string;
            label: string;
            description: string;
            permission: string;
            icon: typeof ArrowRight;
            accent: string;
        }> = [
            {
                href: '/request',
                label: 'Create Request',
                description: 'Log a new requirement.',
                permission: 'can_request_items',
                icon: ClipboardList,
                accent: 'border-[#1f3f92]/40 bg-gradient-to-r from-[#14265e] via-[#1d3f8f] to-[#335ad4]',
            },
            {
                href: '/receive',
                label: 'Record Receive',
                description: 'Confirm incoming stock.',
                permission: 'can_receive_items',
                icon: Package,
                accent: 'border-[#0f766e]/40 bg-gradient-to-r from-[#0c5f58] via-[#0f766e] to-[#26d2bb]',
            },
            {
                href: '/issue',
                label: 'Issue Stock',
                description: 'Dispatch components.',
                permission: 'can_issue_items',
                icon: Receipt,
                accent: 'border-[#b45309]/40 bg-gradient-to-r from-[#7c3504] via-[#c56719] to-[#f97316]',
            },
            {
                href: '/analytics/predictive',
                label: 'Predictive Insights',
                description: 'Review lead-time outlook.',
                permission: 'can_access_predictive_analysis',
                icon: BarChart3,
                accent: 'border-[#be123c]/40 bg-gradient-to-r from-[#7f0d29] via-[#d63356] to-[#f85a85]',
            },
        ];
        return items.filter((item) => permissions?.includes(item.permission));
    }, [permissions]);
    const metricData = [
        {
            label: 'Purchase receives',
            value: totals.purchaseReceives,
            accentClass: 'border-[#0f766e]/30 bg-[#dcfdf5]',
            icon: Package,
        },
        {
            label: 'Processed RRPs',
            value: totals.processedRRPs,
            accentClass: 'border-[#be123c]/30 bg-[#ffe5ec]',
            icon: Sparkle,
            details: [
                { label: 'LOCAL', value: totals.processedLocalRRPs },
                { label: 'FOREIGN', value: totals.processedForeignRRPs },
            ],
        },
        {
            label: 'Spares issued',
            value: totals.spareIssuedQuantity,
            accentClass: 'border-[#7c3aed]/30 bg-[#ede9fe]',
            icon: Boxes,
        },
        {
            label: 'Total spares quantity',
            value: totals.totalSparesQuantity,
            accentClass: 'border-[#1f3f92]/30 bg-[#e4e9ff]',
            icon: ClipboardList,
        },
        {
            label: 'Total spares value',
            value: `NPR ${totals.totalSparesValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
            accentClass: 'border-[#10b981]/30 bg-[#d1fae5]',
            icon: DollarSign,
        },
    ];
    const insightChips = [
        { label: 'Total requests made', value: totals.uniqueRequests },
        { label: 'Items requested', value: totals.totalItemsRequested },
        { label: 'Purchase receives', value: totals.purchaseReceives },
        { label: 'Processed RRPs', value: totals.processedRRPs },
        { label: 'Local processed RRPs', value: totals.processedLocalRRPs },
        { label: 'Foreign processed RRPs', value: totals.processedForeignRRPs },
        { label: 'Total items issued', value: totals.totalItemsIssued },
        { label: 'Petrol issued', value: totals.petrolIssuedQuantity },
        { label: 'Diesel issued', value: totals.dieselIssuedQuantity },
        { label: 'Items paid for', value: totals.totalItemsPaidFor },
        {
            label: 'Total spares value',
            value: `NPR ${totals.totalSparesValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
        },
    ];
    return (<div className="min-h-screen bg-[#f2f5ff]">
      <div className="mx-auto max-w-6xl space-y-7 px-4 py-8 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-3xl border border-[#0f2d6f]/40 bg-gradient-to-br from-[#0a1d46] via-[#103173] to-[#154285] text-white shadow-[0_40px_90px_-55px_rgba(6,24,71,0.6)]">
          <div className="absolute -top-28 -right-10 h-48 w-48 rounded-full bg-[#f973ab]/25 blur-3xl" aria-hidden/>
          <div className="absolute -bottom-36 left-16 h-56 w-56 rounded-full bg-[#14b8a6]/20 blur-3xl" aria-hidden/>
          <div className="relative flex flex-col gap-6 p-6 sm:p-8">
            <header className="flex flex-wrap items-start justify-between gap-6">
              <div className="space-y-3 max-w-xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-white/80 shadow-sm">
                  Ground Support Ops
                </span>
                <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">
                  {user?.UserInfo?.name?.split(' ')[0] ?? 'Team'}, {getDashboardGreeting(user?.UserInfo?.role)}.
                </h1>
                <p className="max-w-xl text-sm text-white/75">
                  Track momentum, trigger quick actions, and surface lead-time insights without leaving this view.
                </p>
              </div>
              <div className="w-full max-w-xs rounded-2xl border border-white/35 bg-white/15 p-4 shadow-lg backdrop-blur">
                <div className="text-[11px] uppercase tracking-[0.3em] text-white/70">Date range</div>
                <div className="mt-2 text-sm font-medium text-white">
                  {new Date(range.from).toLocaleDateString()} → {new Date(range.to).toLocaleDateString()}
                </div>
                <div className="mt-3 rounded-xl border border-white/25 bg-white/15 p-2 shadow-inner">
                  <FunDatePicker from={range.from} to={range.to} onChange={setRange}/>
                </div>
              </div>
            </header>

            {quickActions.length > 0 && (<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {quickActions.map((action) => (<QuickAction key={action.href} href={action.href} label={action.label} description={action.description} icon={action.icon} accent={action.accent}/>))}
              </div>)}

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {insightChips.map((chip) => {
            const displayValue = typeof chip.value === 'number' ? chip.value.toLocaleString() : chip.value;
            return (<span key={chip.label} className="inline-flex items-center gap-2 rounded-2xl border border-white/30 bg-white/15 px-3 py-2 text-xs font-medium text-white/85 shadow-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/80"/>
                    {chip.label}
                    <strong className="text-white">{loading ? '…' : displayValue}</strong>
                  </span>);
        })}
            </div>
          </div>
        </section>

        <section className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {metricData.map((metric) => (<MetricCard key={metric.label} label={metric.label} value={metric.value} accentClass={metric.accentClass} icon={metric.icon} loading={loading} details={metric.details} isActive={activeMetric === metric.label} onToggle={() => setActiveMetric((prev) => (prev === metric.label ? null : metric.label))}/>))}
        </section>

        <DashboardAnalytics />
      </div>
    </div>);
};
export default function DashboardPage() {
    return (<DashboardInsightsProvider>
      <DashboardContent />
    </DashboardInsightsProvider>);
}
