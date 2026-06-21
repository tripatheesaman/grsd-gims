'use client';

import type { ReactNode } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/utils';

interface ApprovalActionBarProps {
    onApprove?: () => void;
    onReject?: () => void;
    onEdit?: () => void;
    extraActions?: ReactNode;
    isApproving?: boolean;
    isRejecting?: boolean;
    disabled?: boolean;
    approveLabel?: string;
    rejectLabel?: string;
    editLabel?: string;
    className?: string;
    /** Sticky bar at bottom of detail modal on mobile */
    sticky?: boolean;
}

export function ApprovalActionBar({
    onApprove,
    onReject,
    onEdit,
    extraActions,
    isApproving,
    isRejecting,
    disabled,
    approveLabel = 'Approve',
    rejectLabel = 'Reject',
    editLabel = 'Edit',
    className,
    sticky,
}: ApprovalActionBarProps) {
    const busy = disabled || isApproving || isRejecting;

    const bar = (
        <div
            className={cn(
                'flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end',
                className
            )}
        >
            {onEdit && (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={onEdit}
                    className="w-full border-slate-200 sm:w-auto"
                >
                    <Pencil className="mr-1.5 h-4 w-4" />
                    {editLabel}
                </Button>
            )}
            {extraActions}
            {onReject && (
                <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={onReject}
                    className="w-full bg-[#d2293b] hover:bg-[#d2293b]/90 sm:w-auto"
                >
                    <X className="mr-1.5 h-4 w-4" />
                    {rejectLabel}
                </Button>
            )}
            {onApprove && (
                <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={onApprove}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 sm:w-auto"
                >
                    {isApproving ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                        <Check className="mr-1.5 h-4 w-4" />
                    )}
                    {isApproving ? 'Approving…' : approveLabel}
                </Button>
            )}
        </div>
    );

    if (sticky) {
        return (
            <div className="sticky bottom-0 z-20 -mx-4 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
                {bar}
            </div>
        );
    }

    return bar;
}
