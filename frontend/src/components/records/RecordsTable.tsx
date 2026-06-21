'use client';

import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { recordsTheme } from './recordsTheme';

interface RecordsTableProps {
    loading?: boolean;
    error?: string | null;
    emptyMessage?: string;
    children: ReactNode;
}

export function RecordsTable({
    loading,
    error,
    emptyMessage = 'No records found',
    children,
}: RecordsTableProps) {
    return (
        <div className={recordsTheme.card}>
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <div className="flex flex-col items-center gap-3 text-slate-600">
                        <Loader2 className="h-8 w-8 animate-spin text-[#003594]" />
                        <p>Loading records…</p>
                    </div>
                </div>
            ) : error ? (
                <div className="flex items-center justify-center py-16 text-red-600">{error}</div>
            ) : (
                children || (
                    <div className="flex items-center justify-center py-16 text-slate-500">{emptyMessage}</div>
                )
            )}
        </div>
    );
}

export function RecordsTableScroll({ children }: { children: ReactNode }) {
    return <div className="overflow-x-auto">{children}</div>;
}

export function RecordsTableElement({ children }: { children: ReactNode }) {
    return <table className="w-full min-w-[960px]">{children}</table>;
}

export function RecordsTableHead({ children }: { children: ReactNode }) {
    return <thead className={recordsTheme.tableHead}>{children}</thead>;
}

export function RecordsTableHeadRow({ children }: { children: ReactNode }) {
    return <tr>{children}</tr>;
}

export function RecordsTableHeadCell({ children, className }: { children: ReactNode; className?: string }) {
    return <th className={`${recordsTheme.tableHeadCell} ${className || ''}`}>{children}</th>;
}

export function RecordsTableBody({ children }: { children: ReactNode }) {
    return <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>;
}

export function RecordsTableRow({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
    return (
        <tr className={recordsTheme.tableRow} onClick={onClick}>
            {children}
        </tr>
    );
}

export function RecordsTableCell({ children, className }: { children: ReactNode; className?: string }) {
    return <td className={`${recordsTheme.tableCell} ${className || ''}`}>{children}</td>;
}
