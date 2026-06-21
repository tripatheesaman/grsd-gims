'use client';

import Link from 'next/link';
import { Package, Fuel, ArrowRight, LogOut } from 'lucide-react';
import { RecordsPageShell, recordsTheme } from '@/components/records';
import { useRecordsPageAuth } from '@/components/records/useRecordsPageAuth';
import { cn } from '@/utils/utils';

const ISSUE_CARDS = [
    {
        href: '/records/spare-issue',
        title: 'Spare Issue Records',
        description:
            'Browse and manage spare parts issue slips — quantities issued, costs, remaining balances, and approval status for component dispatches.',
        icon: Package,
        accent: 'from-[#003594] to-[#012b6c]',
        border: 'border-[#003594]/15 hover:border-[#003594]/40',
        iconBg: 'bg-[#003594]/10 text-[#003594]',
    },
    {
        href: '/records/fuel-issue',
        title: 'Fuel Issue Records',
        description:
            'View fuel consumption issue records including fuel type, price, kilometers, weekly tracking, and issue slip details for vehicle fuel dispatches.',
        icon: Fuel,
        accent: 'from-[#b45309] to-[#d97706]',
        border: 'border-amber-200/80 hover:border-amber-400/60',
        iconBg: 'bg-amber-50 text-amber-700',
    },
] as const;

export default function IssueRecordsPage() {
    const { canAccess } = useRecordsPageAuth('can_access_issue_records');

    if (!canAccess) return null;

    return (
        <RecordsPageShell
            title="Issue Records"
            description="Choose a record type to browse issue history and manage existing issue slips."
            badge="Records"
        >
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {ISSUE_CARDS.map((card) => {
                    const Icon = card.icon;
                    return (
                        <Link
                            key={card.href}
                            href={card.href}
                            className={cn(
                                recordsTheme.card,
                                recordsTheme.cardPadding,
                                'group flex flex-col gap-4 transition hover:-translate-y-0.5 hover:shadow-md',
                                card.border
                            )}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', card.iconBg)}>
                                    <Icon className="h-6 w-6" />
                                </span>
                                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition group-hover:border-[#003594]/30 group-hover:text-[#003594]">
                                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                                </span>
                            </div>
                            <div className="space-y-2">
                                <h2
                                    className={cn(
                                        'text-lg font-semibold bg-gradient-to-r bg-clip-text text-transparent',
                                        card.accent
                                    )}
                                >
                                    {card.title}
                                </h2>
                                <p className="text-sm leading-relaxed text-slate-600">{card.description}</p>
                            </div>
                            <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-[#003594]">
                                <LogOut className="h-4 w-4" />
                                Open records
                            </span>
                        </Link>
                    );
                })}
            </div>
        </RecordsPageShell>
    );
}
