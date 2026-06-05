'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { cn } from '@/utils/utils';

interface DataTablePaginationProps {
    page: number;
    pageSize: number;
    totalPages: number;
    totalCount: number;
    onPageChange: (page: number) => void;
    onPageSizeChange?: (size: number) => void;
    pageSizeOptions?: number[];
    className?: string;
}

export function DataTablePagination({
    page,
    pageSize,
    totalPages,
    totalCount,
    onPageChange,
    onPageSizeChange,
    pageSizeOptions = [10, 20, 50, 100],
    className,
}: DataTablePaginationProps) {
    const safeTotalPages = Math.max(1, totalPages);
    const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, totalCount);

    return (
        <div
            className={cn(
                'flex flex-col gap-3 border-t border-slate-200 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
                className
            )}
        >
            <p className="text-sm text-slate-600">
                {totalCount === 0 ? (
                    'No records'
                ) : (
                    <>
                        Showing <span className="font-medium text-slate-900">{from}</span>–
                        <span className="font-medium text-slate-900">{to}</span> of{' '}
                        <span className="font-medium text-slate-900">{totalCount}</span>
                    </>
                )}
            </p>

            <div className="flex flex-wrap items-center gap-2">
                {onPageSizeChange && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                        <span className="hidden sm:inline">Rows</span>
                        <Select
                            value={String(pageSize)}
                            onValueChange={(v) => onPageSizeChange(Number(v))}
                        >
                            <SelectTrigger className="h-9 w-[72px] border-slate-200 bg-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {pageSizeOptions.map((n) => (
                                    <SelectItem key={n} value={String(n)}>
                                        {n}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                <span className="text-sm text-slate-500 px-1">
                    Page {page} / {safeTotalPages}
                </span>

                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 border-slate-200"
                    disabled={page <= 1}
                    onClick={() => onPageChange(page - 1)}
                >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="sr-only">Previous</span>
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 border-slate-200"
                    disabled={page >= safeTotalPages}
                    onClick={() => onPageChange(page + 1)}
                >
                    <ChevronRight className="h-4 w-4" />
                    <span className="sr-only">Next</span>
                </Button>
            </div>
        </div>
    );
}
