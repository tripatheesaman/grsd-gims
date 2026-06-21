'use client';

import { cn } from '@/utils/utils';

const STATUS_STYLES: Record<string, string> = {
    PENDING: 'bg-amber-50 text-amber-800 border-amber-200',
    APPROVED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    REJECTED: 'bg-red-50 text-red-800 border-red-200',
    VOID: 'bg-violet-50 text-violet-800 border-violet-200',
    CLOSED: 'bg-slate-100 text-slate-700 border-slate-300',
    CANCELLED: 'bg-slate-100 text-slate-700 border-slate-200',
    COMPLETED: 'bg-blue-50 text-blue-800 border-blue-200',
};

interface RecordStatusBadgeProps {
    status: string;
    className?: string;
}

export function RecordStatusBadge({ status, className }: RecordStatusBadgeProps) {
    const normalized = String(status || 'UNKNOWN').toUpperCase();
    return (
        <span
            className={cn(
                'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                STATUS_STYLES[normalized] || 'bg-slate-100 text-slate-700 border-slate-200',
                className
            )}
        >
            {normalized}
        </span>
    );
}
