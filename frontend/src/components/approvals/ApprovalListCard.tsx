'use client';

import type { ReactNode } from 'react';
import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { approvalTheme } from './approvalTheme';
import { cn } from '@/utils/utils';

interface ApprovalListCardProps {
    children: ReactNode;
    onView?: () => void;
    viewLabel?: string;
    hint?: string;
    onClick?: () => void;
    className?: string;
    footer?: ReactNode;
}

export function ApprovalListCard({
    children,
    onView,
    viewLabel = 'Review',
    hint,
    onClick,
    className,
    footer,
}: ApprovalListCardProps) {
    return (
        <div
            className={cn(approvalTheme.listCard, onClick && 'cursor-pointer', className)}
            onClick={onClick}
            onKeyDown={
                onClick
                    ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onClick();
                          }
                      }
                    : undefined
            }
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
        >
            <div className="space-y-4">{children}</div>
            {(onView || footer || hint) && (
                <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    {hint && (
                        <p className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Eye className="h-3.5 w-3.5 shrink-0" />
                            {hint}
                        </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                        {footer}
                        {onView && (
                            <Button
                                type="button"
                                size="sm"
                                className="w-full bg-[#003594] hover:bg-[#003594]/90 sm:w-auto"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onView();
                                }}
                            >
                                <Eye className="mr-1.5 h-4 w-4" />
                                {viewLabel}
                            </Button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
