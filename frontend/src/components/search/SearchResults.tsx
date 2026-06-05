'use client';

import { Eye, Package } from 'lucide-react';
import { SearchResult, ReceiveSearchResult } from '@/types/search';
import { SpareApplicableEquipmentsCell } from '@/components/search/SpareApplicableEquipmentsCell';
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

interface SearchResultsProps {
    results: (SearchResult | ReceiveSearchResult)[] | null;
    isLoading: boolean;
    error: string | null;
    onRowClick?: (item: SearchResult | ReceiveSearchResult) => void;
    onRowDoubleClick?: (item: SearchResult | ReceiveSearchResult) => void;
    onViewDetails?: (item: SearchResult | ReceiveSearchResult) => void;
    canViewFullDetails: boolean;
    selectedItemId?: number | null;
    currentPage?: number;
    totalCount?: number;
    totalPages?: number;
    pageSize?: number;
    onPageChange?: (page: number) => void;
    onPageSizeChange?: (size: number) => void;
    hasActiveFilters?: boolean;
}

export const SearchResults = ({
    results,
    isLoading,
    error,
    onRowClick,
    onRowDoubleClick,
    onViewDetails,
    canViewFullDetails,
    selectedItemId,
    currentPage = 1,
    totalCount = 0,
    totalPages = 0,
    pageSize = 10,
    onPageChange,
    onPageSizeChange,
    hasActiveFilters = false,
}: SearchResultsProps) => {
    if (isLoading) {
        return <InventoryTableStates variant="loading" />;
    }

    if (error) {
        return <InventoryTableStates variant="error" message={error} />;
    }

    if (!results || results.length === 0) {
        return (
            <InventoryTableStates
                variant="empty"
                title={hasActiveFilters ? 'No matching items' : 'No stock records'}
                message={
                    hasActiveFilters
                        ? 'Adjust or clear your filters to broaden the search.'
                        : 'There are no items in stock to display.'
                }
            />
        );
    }

    const openDetails = (item: SearchResult | ReceiveSearchResult) => {
        if (canViewFullDetails && onViewDetails) {
            onViewDetails(item);
        }
    };

    return (
        <div className="flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-[#003594]" />
                    <span className="text-sm font-semibold text-slate-900">
                        {totalCount.toLocaleString()} item{totalCount === 1 ? '' : 's'}
                    </span>
                </div>
                {canViewFullDetails && (
                    <span className="text-xs text-slate-500">Click a row or View for full details</span>
                )}
            </div>

            <div className="overflow-x-auto">
                <Table>
                    <TableHeader className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                        <TableRow className="hover:bg-transparent border-slate-200">
                            <TableHead className="min-w-[100px] text-xs font-semibold uppercase tracking-wide text-slate-600">
                                NAC
                            </TableHead>
                            <TableHead className="min-w-[120px] text-xs font-semibold uppercase tracking-wide text-slate-600">
                                Part no.
                            </TableHead>
                            <TableHead className="min-w-[160px] text-xs font-semibold uppercase tracking-wide text-slate-600">
                                Item name
                            </TableHead>
                            <TableHead className="w-[90px] text-center text-xs font-semibold uppercase tracking-wide text-slate-600">
                                Balance
                            </TableHead>
                            <TableHead className="min-w-[360px] text-xs font-semibold uppercase tracking-wide text-slate-600">
                                Applicable for
                            </TableHead>
                            <TableHead className="w-[90px] text-xs font-semibold uppercase tracking-wide text-slate-600">
                                Location
                            </TableHead>
                            {canViewFullDetails && (
                                <TableHead className="w-[72px] text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                                    Action
                                </TableHead>
                            )}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {results.map((item, index) => {
                            const isSelected = selectedItemId === item.id;
                            const balance = Number(item.currentBalance);
                            const lowStock = Number.isFinite(balance) && balance <= 0;

                            return (
                                <TableRow
                                    key={item.id}
                                    className={cn(
                                        'cursor-pointer border-slate-100 transition-colors',
                                        isSelected ? 'bg-[#003594]/8' : index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50',
                                        'hover:bg-[#003594]/5'
                                    )}
                                    onClick={() => {
                                        onRowClick?.(item);
                                        openDetails(item);
                                    }}
                                    onDoubleClick={() => onRowDoubleClick?.(item)}
                                >
                                    <TableCell className="py-3">
                                        <span className="font-mono text-sm font-semibold text-[#003594]">
                                            {item.nacCode}
                                        </span>
                                    </TableCell>
                                    <TableCell className="py-3 text-sm text-slate-700">
                                        {item.partNumber || '—'}
                                    </TableCell>
                                    <TableCell className="py-3 max-w-[220px]">
                                        <span className="line-clamp-2 text-sm text-slate-900" title={item.itemName}>
                                            {item.itemName}
                                        </span>
                                    </TableCell>
                                    <TableCell className="py-3 text-center">
                                        <Badge
                                            variant={lowStock ? 'destructive' : 'secondary'}
                                            className={cn(
                                                'tabular-nums font-semibold',
                                                !lowStock && 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                            )}
                                        >
                                            {item.currentBalance}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="py-3 min-w-[360px] align-top">
                                        <SpareApplicableEquipmentsCell
                                            equipmentNumber={item.equipmentNumber}
                                            equipmentDisplay={item.equipmentDisplay ?? undefined}
                                            showAll
                                        />
                                    </TableCell>
                                    <TableCell className="py-3 text-sm text-slate-600">
                                        {item.location || '—'}
                                    </TableCell>
                                    {canViewFullDetails && (
                                        <TableCell className="py-3 text-right">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 px-2 text-[#003594] hover:bg-[#003594]/10"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onViewDetails?.(item);
                                                }}
                                            >
                                                <Eye className="h-4 w-4" />
                                                <span className="sr-only">View</span>
                                            </Button>
                                        </TableCell>
                                    )}
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            {onPageChange && (
                <DataTablePagination
                    page={currentPage}
                    pageSize={pageSize}
                    totalPages={totalPages}
                    totalCount={totalCount}
                    onPageChange={onPageChange}
                    onPageSizeChange={onPageSizeChange}
                />
            )}
        </div>
    );
};
