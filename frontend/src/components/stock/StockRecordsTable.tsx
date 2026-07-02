'use client';

import { useState, useCallback, Fragment } from 'react';
import { Pencil, Trash2, Package } from 'lucide-react';
import type { StockVariant } from '@/types/search';
import {
    FamilyNacCell,
    PartSummaryCell,
    BalanceCell,
    formatBalance,
} from '@/components/search/InventoryFamilyRow';
import { ApplicableEquipmentsCell } from '@/components/stock/ApplicableEquipmentsCell';
import { DataTablePagination } from '@/components/inventory/DataTablePagination';
import { InventoryTableStates } from '@/components/inventory/InventoryTableStates';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { cn } from '@/utils/utils';

export interface StockRecordRow {
    id: number;
    nacCode: string;
    itemName: string;
    partNumber: string;
    equipmentNumber: string;
    equipmentDisplay?: string;
    virtualBalance?: number;
    trueBalance?: number;
    /** @deprecated admin form only */
    currentBalance?: number;
    openQuantity: number;
    openAmount: number;
    location: string;
    variantCount?: number;
    variants?: StockVariant[];
}

interface StockRecordsTableProps {
    rows: StockRecordRow[];
    loading: boolean;
    error: string | null;
    hasActiveFilters: boolean;
    canEdit: boolean;
    canDelete: boolean;
    onEdit: (row: StockRecordRow) => void;
    onDelete: (row: StockRecordRow) => void;
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
}

function formatOpenQuantity(value: number | string | null | undefined): string {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatOpenAmount(value: number | string | null | undefined): string {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function StockRecordsTable({
    rows,
    loading,
    error,
    hasActiveFilters,
    canEdit,
    canDelete,
    onEdit,
    onDelete,
    page,
    pageSize,
    totalCount,
    totalPages,
    onPageChange,
    onPageSizeChange,
}: StockRecordsTableProps) {
    const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());

    const toggleFamily = useCallback((nacCode: string, variantCount?: number) => {
        if (!variantCount || variantCount <= 1) return;
        setExpandedFamilies(prev => {
            const next = new Set(prev);
            if (next.has(nacCode)) next.delete(nacCode);
            else next.add(nacCode);
            return next;
        });
    }, []);

    if (loading) {
        return <InventoryTableStates variant="loading" />;
    }

    if (error) {
        return <InventoryTableStates variant="error" message={error} />;
    }

    if (rows.length === 0) {
        return (
            <InventoryTableStates
                variant="empty"
                title={hasActiveFilters ? 'No matching records' : 'No stock records'}
                message={
                    hasActiveFilters
                        ? 'Adjust or clear filters, or add a new item.'
                        : 'Add your first stock item to get started.'
                }
            />
        );
    }

    const showActions = canEdit || canDelete;

    return (
        <div className="flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-[#003594]" />
                    <span className="text-sm font-semibold text-slate-900">
                        {totalCount.toLocaleString()} record{totalCount === 1 ? '' : 's'}
                    </span>
                </div>
            </div>

            <div className="max-h-[min(65vh,720px)] overflow-auto">
                <Table>
                    <TableHeader className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                        <TableRow className="hover:bg-transparent border-slate-200">
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                NAC
                            </TableHead>
                            <TableHead className="min-w-[140px] text-xs font-semibold uppercase tracking-wide text-slate-600">
                                Item
                            </TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                Part no.
                            </TableHead>
                            <TableHead className="min-w-[200px] text-xs font-semibold uppercase tracking-wide text-slate-600">
                                Applicable for
                            </TableHead>
                            <TableHead className="w-[90px] text-center text-xs font-semibold uppercase tracking-wide text-slate-600">
                                Current bal.
                            </TableHead>
                            <TableHead className="w-[90px] text-center text-xs font-semibold uppercase tracking-wide text-slate-600">
                                True bal.
                            </TableHead>
                            <TableHead className="w-[80px] text-center text-xs font-semibold uppercase tracking-wide text-slate-600">
                                Open qty
                            </TableHead>
                            <TableHead className="w-[90px] text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                                Open amt
                            </TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                Location
                            </TableHead>
                            {showActions && (
                                <TableHead className="w-[100px] text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                                    Actions
                                </TableHead>
                            )}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((r, index) => {
                            const variantCount = Number(r.variantCount || 1);
                            const hasVariants = variantCount > 1;
                            const isExpanded = expandedFamilies.has(r.nacCode);
                            const variants = r.variants ?? [];
                            const virtualBalance = r.virtualBalance ?? variants.reduce(
                                (sum, v) => sum + Number(v.virtualBalance || 0),
                                0
                            );
                            const trueBalance = r.trueBalance ?? variants.reduce(
                                (sum, v) => sum + Number(v.trueBalance || 0),
                                0
                            );
                            const openQuantity = variants.length > 0
                                ? variants.reduce((sum, v) => sum + Number(v.openQuantity || 0), 0)
                                : Number(r.openQuantity ?? 0);
                            const openAmount = variants.length > 0
                                ? variants.reduce((sum, v) => sum + Number(v.openAmount || 0), 0)
                                : Number(r.openAmount ?? 0);

                            return (
                                <Fragment key={r.id}>
                                    <TableRow
                                        className={cn(
                                            'border-slate-100',
                                            index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50',
                                            'hover:bg-[#003594]/5'
                                        )}
                                    >
                                        <TableCell className="py-3">
                                            <FamilyNacCell
                                                nacCode={r.nacCode}
                                                variantCount={variantCount}
                                                isExpanded={isExpanded}
                                                onToggle={() => toggleFamily(r.nacCode, variantCount)}
                                            />
                                        </TableCell>
                                        <TableCell className="py-3 max-w-[200px]">
                                            <span className="line-clamp-2 text-sm text-slate-900" title={r.itemName}>
                                                {r.itemName}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <PartSummaryCell
                                                partNumber={r.partNumber}
                                                variantCount={variantCount}
                                                variants={variants.length ? variants : undefined}
                                            />
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <ApplicableEquipmentsCell
                                                equipmentNumber={r.equipmentNumber}
                                                equipmentDisplay={r.equipmentDisplay}
                                                maxVisible={2}
                                            />
                                        </TableCell>
                                        <TableCell className="py-3 text-center">
                                            <BalanceCell value={virtualBalance} variant="virtual" />
                                        </TableCell>
                                        <TableCell className="py-3 text-center">
                                            <BalanceCell value={trueBalance} variant="true" />
                                        </TableCell>
                                        <TableCell className="py-3 text-center text-sm tabular-nums text-slate-700">
                                            {formatOpenQuantity(openQuantity)}
                                        </TableCell>
                                        <TableCell className="py-3 text-right text-sm tabular-nums text-slate-700">
                                            {formatOpenAmount(openAmount)}
                                        </TableCell>
                                        <TableCell className="py-3 text-sm text-slate-600">{r.location || '—'}</TableCell>
                                        {showActions && !hasVariants && (
                                            <TableCell className="py-3 text-right">
                                                <div className="flex justify-end gap-1">
                                                    {canEdit && (
                                                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-[#003594] hover:bg-[#003594]/10" onClick={() => onEdit(r)}>
                                                            <Pencil className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                    {canDelete && !hasVariants && (
                                                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-red-600 hover:bg-red-50" onClick={() => onDelete(r)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        )}
                                        {showActions && hasVariants && <TableCell className="py-3" />}
                                    </TableRow>
                                    {hasVariants && isExpanded && variants.map(v => (
                                        <TableRow key={`v-${v.id}`} className="bg-slate-50/80 border-slate-100">
                                            <TableCell className="py-2 pl-8 font-mono text-xs text-[#003594]">{v.nacCode}</TableCell>
                                            <TableCell className="py-2 text-sm text-slate-600">—</TableCell>
                                            <TableCell className="py-2 text-sm">{v.partNumber}</TableCell>
                                            <TableCell className="py-2">—</TableCell>
                                            <TableCell className="py-2 text-center text-sm text-sky-800">{formatBalance(v.virtualBalance)}</TableCell>
                                            <TableCell className="py-2 text-center text-sm text-emerald-800">{formatBalance(v.trueBalance)}</TableCell>
                                            <TableCell className="py-2 text-center text-sm tabular-nums text-slate-700">
                                                {formatOpenQuantity(v.openQuantity)}
                                            </TableCell>
                                            <TableCell className="py-2 text-right text-sm tabular-nums text-slate-700">
                                                {formatOpenAmount(v.openAmount)}
                                            </TableCell>
                                            <TableCell className="py-2 text-sm">{v.location || r.location}</TableCell>
                                            {showActions && (
                                                <TableCell className="py-2 text-right">
                                                    <div className="flex justify-end gap-1">
                                                        {canEdit && (
                                                            <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => onEdit({ ...r, id: v.id, nacCode: v.nacCode, partNumber: v.partNumber, virtualBalance: Number(v.virtualBalance ?? 0), trueBalance: Number(v.trueBalance ?? 0), openQuantity: Number(v.openQuantity ?? 0), openAmount: Number(v.openAmount ?? 0), location: v.location || r.location })}>
                                                                <Pencil className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                        {canDelete && (
                                                            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-red-600" onClick={() => onDelete({ ...r, id: v.id, nacCode: v.nacCode, partNumber: v.partNumber, trueBalance: Number(v.trueBalance ?? 0) })}>
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))}
                                </Fragment>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            <DataTablePagination
                page={page}
                pageSize={pageSize}
                totalPages={totalPages}
                totalCount={totalCount}
                onPageChange={onPageChange}
                onPageSizeChange={onPageSizeChange}
            />
        </div>
    );
}
