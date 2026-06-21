'use client';

import type { ReactNode } from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { approvalTheme } from './approvalTheme';
import { cn } from '@/utils/utils';

export interface ApprovalTableColumn<T> {
    id: string;
    header: string;
    cell: (row: T) => ReactNode;
    /** Shown as label on mobile card layout */
    mobileLabel?: string;
    className?: string;
    hideOnMobile?: boolean;
}

interface ApprovalResponsiveTableProps<T> {
    columns: ApprovalTableColumn<T>[];
    rows: T[];
    getRowKey: (row: T) => string | number;
    emptyMessage?: string;
    rowActions?: (row: T) => ReactNode;
}

export function ApprovalResponsiveTable<T>({
    columns,
    rows,
    getRowKey,
    emptyMessage = 'No line items',
    rowActions,
}: ApprovalResponsiveTableProps<T>) {
    if (!rows.length) {
        return (
            <p className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
                {emptyMessage}
            </p>
        );
    }

    const mobileColumns = columns.filter((c) => !c.hideOnMobile);

    return (
        <>
            {/* Desktop table */}
            <div className={cn(approvalTheme.tableWrap, 'hidden md:block')}>
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            {columns.map((col) => (
                                <TableHead key={col.id} className={cn(approvalTheme.tableHead, col.className)}>
                                    {col.header}
                                </TableHead>
                            ))}
                            {rowActions && (
                                <TableHead className={cn(approvalTheme.tableHead, 'text-right')}>Actions</TableHead>
                            )}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row) => (
                            <TableRow key={getRowKey(row)} className="hover:bg-[#003594]/[0.03]">
                                {columns.map((col) => (
                                    <TableCell key={col.id} className={cn('text-sm text-slate-800', col.className)}>
                                        {col.cell(row)}
                                    </TableCell>
                                ))}
                                {rowActions && (
                                    <TableCell className="text-right">{rowActions(row)}</TableCell>
                                )}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
                {rows.map((row) => (
                    <div
                        key={getRowKey(row)}
                        className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm"
                    >
                        <dl className="space-y-2.5">
                            {mobileColumns.map((col) => (
                                <div key={col.id} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                                    <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-[#003594]/75 sm:w-28">
                                        {col.mobileLabel ?? col.header}
                                    </dt>
                                    <dd className="min-w-0 text-sm text-slate-900">{col.cell(row)}</dd>
                                </div>
                            ))}
                        </dl>
                        {rowActions && (
                            <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                                {rowActions(row)}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </>
    );
}
