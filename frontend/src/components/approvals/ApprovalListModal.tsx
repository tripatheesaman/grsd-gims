'use client';

import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { ModalDescription, ModalTitle } from '@/components/ui/modal';
import { ApprovalModalShell, ApprovalModalBody, ApprovalModalHeaderSection } from './ApprovalModalShell';
import { approvalTheme } from './approvalTheme';

interface ApprovalListModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    count?: number;
    emptyMessage?: string;
    isEmpty?: boolean;
    size?: 'lg' | 'xl';
    children: ReactNode;
}

export function ApprovalListModal({
    open,
    onOpenChange,
    title,
    description,
    count,
    emptyMessage = 'Nothing pending right now.',
    isEmpty,
    size = 'lg',
    children,
}: ApprovalListModalProps) {
    const showEmpty = isEmpty ?? count === 0;

    return (
        <ApprovalModalShell open={open} onOpenChange={onOpenChange} size={size} layout="flex">
            <ApprovalModalHeaderSection>
                <ModalTitle className={`text-xl font-bold sm:text-2xl ${approvalTheme.titleGradient}`}>
                    {title}
                </ModalTitle>
                <ModalDescription className="mt-1.5 text-sm text-slate-600">
                    {description ??
                        (typeof count === 'number'
                            ? `${count} item${count === 1 ? '' : 's'} awaiting your review`
                            : 'Review pending items')}
                </ModalDescription>
            </ApprovalModalHeaderSection>
            <ApprovalModalBody>
                {showEmpty ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                            <Inbox className="h-7 w-7 text-slate-400" />
                        </div>
                        <p className="text-sm font-medium text-slate-700">{emptyMessage}</p>
                    </div>
                ) : (
                    <div className="space-y-3">{children}</div>
                )}
            </ApprovalModalBody>
        </ApprovalModalShell>
    );
}
