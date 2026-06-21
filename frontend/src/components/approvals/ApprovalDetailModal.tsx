'use client';

import type { ReactNode } from 'react';
import {
    ApprovalModalShell,
    ApprovalModalBody,
    ApprovalModalHeaderSection,
} from './ApprovalModalShell';
import { ApprovalDetailHeader } from './ApprovalDetailHeader';

interface ApprovalDetailModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: ReactNode;
    badges?: ReactNode;
    alert?: ReactNode;
    meta?: ReactNode;
    actions?: ReactNode;
    processing?: boolean;
    processingLabel?: string;
    children: ReactNode;
    footer?: ReactNode;
    size?: 'md' | 'lg' | 'xl' | 'full';
}

export function ApprovalDetailModal({
    open,
    onOpenChange,
    title,
    description,
    badges,
    alert,
    meta,
    actions,
    processing,
    processingLabel,
    children,
    footer,
    size = 'full',
}: ApprovalDetailModalProps) {
    return (
        <ApprovalModalShell
            open={open}
            onOpenChange={onOpenChange}
            size={size}
            layout="flex"
            processing={processing}
            processingLabel={processingLabel}
        >
            <ApprovalModalHeaderSection>
                <ApprovalDetailHeader
                    title={title}
                    description={description}
                    badges={badges}
                    alert={alert}
                    meta={meta}
                    actions={actions}
                />
            </ApprovalModalHeaderSection>
            <ApprovalModalBody>{children}</ApprovalModalBody>
            {footer}
        </ApprovalModalShell>
    );
}
