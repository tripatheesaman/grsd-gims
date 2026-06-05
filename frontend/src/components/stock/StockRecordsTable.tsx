'use client';

import { Pencil, Trash2, Package } from 'lucide-react';
import { ApplicableEquipmentsCell } from '@/components/stock/ApplicableEquipmentsCell';
import { DataTablePagination } from '@/components/inventory/DataTablePagination';
import { InventoryTableStates } from '@/components/inventory/InventoryTableStates';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
    currentBalance: number;
    openQuantity: number;
    openAmount: number;
    location: string;
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
                            <TableHead className="w-[80px] text-center text-xs font-semibold uppercase tracking-wide text-slate-600">
                                Balance
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
                            const balance = Number(r.currentBalance);
                            const lowStock = Number.isFinite(balance) && balance <= 0;

                            return (
                                <TableRow
                                    key={r.id}
                                    className={cn(
                                        'border-slate-100',
                                        index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50',
                                        'hover:bg-[#003594]/5'
                                    )}
                                >
                                    <TableCell className="py-3">
                                        <span className="font-mono text-sm font-semibold text-[#003594]">
                                            {r.nacCode}
                                        </span>
                                    </TableCell>
                                    <TableCell className="py-3 max-w-[200px]">
                                        <span className="line-clamp-2 text-sm text-slate-900" title={r.itemName}>
                                            {r.itemName}
                                        </span>
                                    </TableCell>
                                    <TableCell className="py-3 text-sm text-slate-700">
                                        {r.partNumber || '—'}
                                    </TableCell>
                                    <TableCell className="py-3">
                                        <ApplicableEquipmentsCell
                                            equipmentNumber={r.equipmentNumber}
                                            equipmentDisplay={r.equipmentDisplay}
                                            maxVisible={2}
                                        />
                                    </TableCell>
                                    <TableCell className="py-3 text-center">
                                        <Badge
                                            variant={lowStock ? 'destructive' : 'secondary'}
                                            className={cn(
                                                'tabular-nums font-semibold',
                                                !lowStock && 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                            )}
                                        >
                                            {r.currentBalance}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="py-3 text-center text-sm tabular-nums text-slate-700">
                                        {r.openQuantity}
                                    </TableCell>
                                    <TableCell className="py-3 text-right text-sm tabular-nums text-slate-700">
                                        {r.openAmount}
                                    </TableCell>
                                    <TableCell className="py-3 text-sm text-slate-600">{r.location || '—'}</TableCell>
                                    {showActions && (
                                        <TableCell className="py-3 text-right">
                                            <div className="flex justify-end gap-1">
                                                {canEdit && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 px-2 text-[#003594] hover:bg-[#003594]/10"
                                                        onClick={() => onEdit(r)}
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                        <span className="sr-only">Edit</span>
                                                    </Button>
                                                )}
                                                {canDelete && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 px-2 text-red-600 hover:bg-red-50"
                                                        onClick={() => onDelete(r)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                        <span className="sr-only">Delete</span>
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    )}
                                </TableRow>
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
