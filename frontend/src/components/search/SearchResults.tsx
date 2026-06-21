'use client';

import { useState, useCallback, Fragment } from 'react';
import { Eye, Package } from 'lucide-react';
import { SearchResult, ReceiveSearchResult, StockVariant } from '@/types/search';
import { SpareApplicableEquipmentsCell } from '@/components/search/SpareApplicableEquipmentsCell';
import {
    FamilyNacCell,
    PartSummaryCell,
    BalanceCell,
    VariantExpandPanel,
} from '@/components/search/InventoryFamilyRow';
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

function resolveVariants(item: SearchResult | ReceiveSearchResult): StockVariant[] {
    const list = item.variants && item.variants.length > 0 ? [...item.variants] : [];
    if (list.length > 1 && item.id) {
        const idx = list.findIndex((v) => v.id === item.id);
        if (idx > 0) {
            const [preferred] = list.splice(idx, 1);
            list.unshift(preferred);
        }
    }
    return list;
}

function sumBalances(
    item: SearchResult | ReceiveSearchResult,
    variants: StockVariant[],
    field: 'virtualBalance' | 'trueBalance'
): number {
    if (item[field] != null && Number.isFinite(Number(item[field]))) {
        return Number(item[field]);
    }
    return variants.reduce((sum, v) => sum + Number(v[field] || 0), 0);
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
    const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());

    const toggleFamily = useCallback((nacCode: string, variantCount?: number) => {
        if (!variantCount || variantCount <= 1) {
            return;
        }
        setExpandedFamilies(prev => {
            const next = new Set(prev);
            if (next.has(nacCode)) {
                next.delete(nacCode);
            } else {
                next.add(nacCode);
            }
            return next;
        });
    }, []);

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

    const colSpan = canViewFullDetails ? 8 : 7;

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
                            <TableHead className="w-[100px] text-center text-xs font-semibold uppercase tracking-wide text-slate-600">
                                Virtual bal.
                            </TableHead>
                            <TableHead className="w-[100px] text-center text-xs font-semibold uppercase tracking-wide text-slate-600">
                                True bal.
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
                            const variantCount = Number(item.variantCount || 1);
                            const hasVariants = variantCount > 1;
                            const isExpanded = expandedFamilies.has(item.nacCode);
                            const variants = resolveVariants(item);
                            const virtualBalance = sumBalances(item, variants, 'virtualBalance');
                            const trueBalance = sumBalances(item, variants, 'trueBalance');

                            return (
                                <Fragment key={item.id}>
                                    <TableRow
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
                                            <FamilyNacCell
                                                nacCode={item.nacCode}
                                                variantCount={variantCount}
                                                isExpanded={isExpanded}
                                                onToggle={() => toggleFamily(item.nacCode, variantCount)}
                                            />
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <PartSummaryCell
                                                partNumber={item.partNumber}
                                                variantCount={variantCount}
                                                variants={variants.length ? variants : undefined}
                                                preferredVariantId={item.id}
                                            />
                                        </TableCell>
                                        <TableCell className="py-3 max-w-[220px]">
                                            <span className="line-clamp-2 text-sm text-slate-900" title={item.itemName}>
                                                {item.itemName}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-3 text-center">
                                            <BalanceCell value={virtualBalance} variant="virtual" />
                                        </TableCell>
                                        <TableCell className="py-3 text-center">
                                            <BalanceCell value={trueBalance} variant="true" />
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
                                    {hasVariants && isExpanded && (
                                        <VariantExpandPanel
                                            variants={variants}
                                            colSpan={colSpan}
                                        />
                                    )}
                                </Fragment>
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
