'use client';

import type { ReactNode } from 'react';
import { ModalDescription, ModalTitle } from '@/components/ui/modal';
import { approvalTheme } from './approvalTheme';
import { cn } from '@/utils/utils';

interface ApprovalDetailHeaderProps {
    title: string;
    description?: ReactNode;
    badges?: ReactNode;
    alert?: ReactNode;
    meta?: ReactNode;
    actions?: ReactNode;
    className?: string;
}

export function ApprovalDetailHeader({
    title,
    description,
    badges,
    alert,
    meta,
    actions,
    className,
}: ApprovalDetailHeaderProps) {
    return (
        <div className={cn('space-y-3', className)}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <ModalTitle
                            className={`text-lg font-bold leading-snug sm:text-xl lg:text-2xl ${approvalTheme.titleGradient}`}
                        >
                            {title}
                        </ModalTitle>
                        {badges}
                    </div>
                    {description && (
                        <ModalDescription className="text-sm text-slate-600">{description}</ModalDescription>
                    )}
                    {meta && <div className="text-sm text-slate-600">{meta}</div>}
                </div>
                {actions && <div className="shrink-0 lg:max-w-[50%]">{actions}</div>}
            </div>
            {alert}
        </div>
    );
}
