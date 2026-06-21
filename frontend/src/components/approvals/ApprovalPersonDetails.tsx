'use client';

import type { ReactNode } from 'react';
import type { PersonDetails } from '@/types/personDetails';
import { cn } from '@/utils/utils';

interface ApprovalPersonDetailsProps {
    person?: PersonDetails | null;
    /** Inline single-line (name only). */
    compact?: boolean;
    className?: string;
}

function FieldRow({ label, value }: { label: string; value?: string | null }) {
    if (!value) return null;
    return (
        <p className="text-sm text-slate-700">
            <span className="font-medium text-slate-500">{label}: </span>
            <span className="break-words text-slate-900">{value}</span>
        </p>
    );
}

export function ApprovalPersonDetails({ person, compact, className }: ApprovalPersonDetailsProps) {
    if (!person?.name) {
        return <span className={cn('text-slate-400', className)}>—</span>;
    }

    if (compact) {
        return <span className={cn('font-semibold text-slate-900', className)}>{person.name}</span>;
    }

    return (
        <div className={cn('space-y-0.5', className)}>
            <p className="font-semibold text-slate-900">{person.name}</p>
            <FieldRow label="Designation" value={person.designation} />
            <FieldRow label="Staff ID" value={person.staffId} />
            <FieldRow label="Email" value={person.email} />
        </div>
    );
}

/** Four meta-grid cells for a person block (name, designation, staff ID, email). */
export function personDetailsMetaItems(
    prefix: string,
    person?: PersonDetails | null
): { label: string; value: ReactNode; className?: string }[] {
    if (!person?.name) {
        return [{ label: prefix, value: '—', className: 'sm:col-span-2 lg:col-span-3' }];
    }

    return [
        { label: `${prefix} — Name`, value: person.name },
        { label: `${prefix} — Designation`, value: person.designation || '—' },
        { label: `${prefix} — Staff ID`, value: person.staffId || '—' },
        { label: `${prefix} — Email`, value: person.email || '—' },
    ];
}

/** Single meta cell with full person block inside. */
export function personDetailsMetaBlock(
    prefix: string,
    person?: PersonDetails | null,
    spanClass = 'sm:col-span-2 lg:col-span-3'
) {
    return {
        label: prefix,
        value: <ApprovalPersonDetails person={person} />,
        className: spanClass,
    };
}
