'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { TableCell, TableRow } from '@/components/ui/table';
import type { StockVariant } from '@/types/search';
import { cn } from '@/utils/utils';

export function formatBalance(value: number | string | undefined | null): string {
    const n = Number(value);
    if (!Number.isFinite(n)) {
        return '—';
    }
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function formatPartSummary(
    partNumber: string,
    variantCount = 1,
    variants?: StockVariant[],
    preferredVariantId?: number
): { primary: string; moreCount: number } {
    if (variants && variants.length > 1) {
        const preferred = preferredVariantId
            ? variants.find((v) => v.id === preferredVariantId)
            : undefined;
        const matchedFromRow =
            partNumber && !partNumber.includes(',') ? partNumber.trim() : '';
        const primary =
            preferred?.partNumber ||
            matchedFromRow ||
            variants[0].partNumber ||
            '—';
        return {
            primary,
            moreCount: variants.length - 1,
        };
    }
    const parts = String(partNumber || '')
        .split(',')
        .map(p => p.trim())
        .filter(Boolean);
    if (parts.length <= 1) {
        return { primary: parts[0] || partNumber || '—', moreCount: 0 };
    }
    if (variantCount > 1) {
        return { primary: parts[0], moreCount: Math.max(variantCount - 1, parts.length - 1) };
    }
    return { primary: parts[0], moreCount: parts.length - 1 };
}

interface FamilyNacCellProps {
    nacCode: string;
    variantCount?: number;
    isExpanded: boolean;
    onToggle?: () => void;
}

export function FamilyNacCell({ nacCode, variantCount = 1, isExpanded, onToggle }: FamilyNacCellProps) {
    const hasVariants = variantCount > 1;
    return (
        <div className="flex items-center gap-1">
            {hasVariants && onToggle && (
                <button
                    type="button"
                    className="rounded p-0.5 hover:bg-slate-200"
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggle();
                    }}
                    aria-label={isExpanded ? 'Collapse variants' : 'Expand variants'}
                >
                    {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-slate-500" />
                    ) : (
                        <ChevronRight className="h-4 w-4 text-slate-500" />
                    )}
                </button>
            )}
            <span className="font-mono text-sm font-semibold text-[#003594]">{nacCode}</span>
            {hasVariants && (
                <Badge variant="outline" className="ml-1 border-slate-300 text-[10px] font-normal text-slate-600">
                    {variantCount} parts
                </Badge>
            )}
        </div>
    );
}

interface PartSummaryCellProps {
    partNumber: string;
    variantCount?: number;
    variants?: StockVariant[];
    preferredVariantId?: number;
}

export function PartSummaryCell({
    partNumber,
    variantCount = 1,
    variants,
    preferredVariantId,
}: PartSummaryCellProps) {
    const { primary, moreCount } = formatPartSummary(
        partNumber,
        variantCount,
        variants,
        preferredVariantId
    );
    return (
        <span className="text-sm text-slate-700">
            {primary}
            {moreCount > 0 && (
                <span className="ml-1 text-xs text-slate-400">+{moreCount} more</span>
            )}
        </span>
    );
}

interface BalanceCellProps {
    value: number | string | undefined | null;
    variant?: 'virtual' | 'true';
    className?: string;
}

export function BalanceCell({ value, variant = 'true', className }: BalanceCellProps) {
    const balance = Number(value);
    const lowStock = Number.isFinite(balance) && balance <= 0;
    const formatted = formatBalance(value);
    return (
        <Badge
            variant={lowStock ? 'destructive' : 'secondary'}
            className={cn(
                'tabular-nums font-semibold',
                !lowStock && variant === 'true' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
                !lowStock && variant === 'virtual' && 'border-sky-200 bg-sky-50 text-sky-800',
                className
            )}
        >
            {formatted}
        </Badge>
    );
}

interface VariantExpandPanelProps {
    variants: StockVariant[];
    loading?: boolean;
    colSpan: number;
}

export function VariantExpandPanel({
    variants,
    loading,
    colSpan,
}: VariantExpandPanelProps) {
    return (
        <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
            <TableCell colSpan={colSpan} className="py-2 px-6">
                {loading ? (
                    <p className="text-sm text-slate-500">Loading part variants…</p>
                ) : variants.length === 0 ? (
                    <p className="text-sm text-slate-500">No variant details available.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs uppercase text-slate-500">
                                    <th className="pb-2 pr-4">Sub-code</th>
                                    <th className="pb-2 pr-4">Part no.</th>
                                    <th className="pb-2 pr-4 text-center">Virtual bal.</th>
                                    <th className="pb-2 text-center">True bal.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {variants.map(v => (
                                    <tr key={v.id} className="border-t border-slate-200">
                                        <td className="py-1.5 pr-4 font-mono text-[#003594]">{v.nacCode}</td>
                                        <td className="py-1.5 pr-4">{v.partNumber}</td>
                                        <td className="py-1.5 pr-4 text-center tabular-nums text-sky-800">
                                            {formatBalance(v.virtualBalance)}
                                        </td>
                                        <td className="py-1.5 text-center tabular-nums text-emerald-800">
                                            {formatBalance(v.trueBalance)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </TableCell>
        </TableRow>
    );
}
