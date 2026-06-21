'use client';

import { ReceiveSearchResult } from '@/types/search';
import { format } from 'date-fns';
import { PackagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ReceiveSearchResultsProps {
    results: ReceiveSearchResult[] | null;
    isLoading: boolean;
    error: string | null;
    onRowDoubleClick: (item: ReceiveSearchResult) => void;
    onReceiveClick?: (item: ReceiveSearchResult) => void;
    canViewFullDetails: boolean;
    cartRequestIds?: Set<number>;
    currentPage?: number;
    totalCount?: number;
    totalPages?: number;
    onPageChange?: (page: number) => void;
}

export const ReceiveSearchResults = ({
    results,
    isLoading,
    error,
    onRowDoubleClick,
    onReceiveClick,
    canViewFullDetails,
    cartRequestIds,
    currentPage = 1,
    totalCount = 0,
    totalPages = 0,
    onPageChange,
}: ReceiveSearchResultsProps) => {
    if (isLoading) {
        return (
            <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003594]" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-[#d2293b]/20 rounded-lg p-4 text-[#d2293b] text-center">
                <p className="font-medium">Error loading results</p>
                <p className="text-sm mt-1">{error}</p>
            </div>
        );
    }

    if (!results || results.length === 0) {
        return (
            <div className="bg-gray-50 border border-[#002a6e]/10 rounded-lg p-8 text-center">
                <p className="text-gray-500">No approved requests pending receive</p>
                <p className="text-xs text-gray-400 mt-1">Try adjusting your search filters</p>
            </div>
        );
    }

    return (
        <div>
            {canViewFullDetails && (
                <p className="text-xs text-gray-500 mb-3">
                    Double-click a row or use <strong>Receive</strong> to open the receive form.
                </p>
            )}
            <div className="overflow-x-auto rounded-lg border border-[#002a6e]/10">
                <table className="min-w-full divide-y divide-[#002a6e]/10">
                    <thead>
                        <tr className="bg-[#003594]/5">
                            <th className="px-4 py-3 text-left text-xs font-semibold text-[#003594] uppercase">Request</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-[#003594] uppercase">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-[#003594] uppercase">NAC</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-[#003594] uppercase">Item</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-[#003594] uppercase">Part</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-[#003594] uppercase">Remaining</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-[#003594] uppercase">Equipment</th>
                            {canViewFullDetails && (
                                <th className="px-4 py-3 text-right text-xs font-semibold text-[#003594] uppercase">Action</th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-[#002a6e]/10">
                        {results.map((row) => {
                            const remaining = row.remainingQuantity ?? row.requestedQuantity;
                            const inCart = cartRequestIds?.has(row.id);
                            return (
                                <tr
                                    key={row.id}
                                    onDoubleClick={() => canViewFullDetails && !inCart && onRowDoubleClick(row)}
                                    className={`transition-colors ${
                                        canViewFullDetails && !inCart ? 'hover:bg-[#003594]/5 cursor-pointer' : ''
                                    } ${inCart ? 'bg-emerald-50/60' : ''}`}
                                >
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <span className="text-sm font-medium text-[#003594]">{row.requestNumber}</span>
                                        {inCart && (
                                            <Badge variant="outline" className="ml-2 text-[10px] text-emerald-700 border-emerald-300">
                                                In cart
                                            </Badge>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                                        {format(new Date(row.requestDate), 'dd MMM yyyy')}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <span className="font-mono text-sm text-gray-900">{row.nacCode}</span>
                                    </td>
                                    <td className="px-4 py-3 max-w-[180px]">
                                        <span className="text-sm text-gray-900 line-clamp-2">{row.itemName}</span>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                                        {row.partNumber || '—'}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-center">
                                        <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-sm font-semibold bg-[#003594]/10 text-[#003594]">
                                            {remaining}
                                        </span>
                                        {remaining < row.requestedQuantity && (
                                            <span className="block text-[10px] text-gray-400 mt-0.5">
                                                of {row.requestedQuantity}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 max-w-[140px]">
                                        <span className="text-sm text-gray-700 line-clamp-2">{row.equipmentNumber || '—'}</span>
                                    </td>
                                    {canViewFullDetails && (
                                        <td className="px-4 py-3 whitespace-nowrap text-right">
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                disabled={inCart}
                                                className="h-8 text-xs border-[#003594]/30 text-[#003594] hover:bg-[#003594] hover:text-white"
                                                onClick={() => (onReceiveClick || onRowDoubleClick)(row)}
                                            >
                                                <PackagePlus className="h-3.5 w-3.5 mr-1" />
                                                Receive
                                            </Button>
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {onPageChange && totalPages > 1 && (
                <div className="flex items-center justify-between px-2 py-3 mt-2">
                    <span className="text-sm text-gray-600">
                        Page {currentPage} of {totalPages} ({totalCount} items)
                    </span>
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={currentPage <= 1}
                            onClick={() => onPageChange(currentPage - 1)}
                        >
                            Previous
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={currentPage >= totalPages}
                            onClick={() => onPageChange(currentPage + 1)}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};
