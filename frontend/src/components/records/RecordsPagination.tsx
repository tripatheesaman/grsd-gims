'use client';

import { recordsTheme } from './recordsTheme';

interface RecordsPaginationProps {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    pageSizeOptions?: number[];
}

export function RecordsPagination({
    page,
    pageSize,
    totalCount,
    totalPages,
    onPageChange,
    onPageSizeChange,
    pageSizeOptions = [10, 20, 50, 100],
}: RecordsPaginationProps) {
    const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, totalCount);

    return (
        <div className={`${recordsTheme.card} ${recordsTheme.cardPadding} flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}>
            <p className="text-sm text-slate-600">
                Showing <span className="font-medium text-slate-900">{start}</span>–
                <span className="font-medium text-slate-900">{end}</span> of{' '}
                <span className="font-medium text-slate-900">{totalCount}</span>
            </p>
            <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                    Rows
                    <select
                        value={pageSize}
                        onChange={(e) => onPageSizeChange(Number(e.target.value))}
                        className={recordsTheme.select}
                    >
                        {pageSizeOptions.map((size) => (
                            <option key={size} value={size}>
                                {size}
                            </option>
                        ))}
                    </select>
                </label>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => onPageChange(page - 1)}
                        className={recordsTheme.outlineBtn}
                    >
                        Previous
                    </button>
                    <span className="px-2 text-sm text-slate-600">
                        {page} / {Math.max(totalPages, 1)}
                    </span>
                    <button
                        type="button"
                        disabled={page >= totalPages}
                        onClick={() => onPageChange(page + 1)}
                        className={recordsTheme.outlineBtn}
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
}
