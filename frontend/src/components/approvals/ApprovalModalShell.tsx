'use client';

import type { ReactNode } from 'react';
import { Modal, ModalContent } from '@/components/ui/modal';
import { ApprovalProcessingOverlay } from '@/components/dashboard/ApprovalProcessingOverlay';
import { approvalModalSizes, approvalTheme } from './approvalTheme';
import { cn } from '@/utils/utils';

type ApprovalModalSize = keyof typeof approvalModalSizes;

interface ApprovalModalShellProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    size?: ApprovalModalSize;
    processing?: boolean;
    processingLabel?: string;
    children: ReactNode;
    className?: string;
    /** Flex column layout with scrollable body (detail modals). */
    layout?: 'scroll' | 'flex';
}

export function ApprovalModalShell({
    open,
    onOpenChange,
    size = 'lg',
    processing,
    processingLabel,
    children,
    className,
    layout = 'scroll',
}: ApprovalModalShellProps) {
    return (
        <Modal open={open} onOpenChange={onOpenChange}>
            <ModalContent
                className={cn(
                    'relative w-full max-h-[min(92dvh,calc(100dvh-2rem))] gap-0 p-0',
                    approvalModalSizes[size],
                    approvalTheme.panel,
                    layout === 'flex' && 'flex flex-col overflow-hidden',
                    layout === 'scroll' && 'overflow-y-auto overscroll-contain p-4 sm:p-6',
                    className
                )}
            >
                <ApprovalProcessingOverlay active={!!processing} label={processingLabel} />
                {children}
            </ModalContent>
        </Modal>
    );
}

export function ApprovalModalBody({
    children,
    className,
    noPadding,
}: {
    children: ReactNode;
    className?: string;
    noPadding?: boolean;
}) {
    return (
        <div
            className={cn(
                'min-h-0 flex-1 overflow-y-auto overscroll-contain',
                !noPadding && 'px-4 py-4 sm:px-6 sm:py-5',
                className
            )}
        >
            {children}
        </div>
    );
}

export function ApprovalModalHeaderSection({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'shrink-0 border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5',
                className
            )}
        >
            {children}
        </div>
    );
}
