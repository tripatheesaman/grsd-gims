'use client';

import { Loader2 } from 'lucide-react';
import { ModalDescription, ModalTitle } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import {
    ApprovalModalShell,
    ApprovalModalBody,
    ApprovalModalHeaderSection,
} from './ApprovalModalShell';
import { approvalTheme } from './approvalTheme';

interface ApprovalConfirmModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    onConfirm: () => void;
    onCancel?: () => void;
    isProcessing?: boolean;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'default';
}

export function ApprovalConfirmModal({
    open,
    onOpenChange,
    title,
    description,
    onConfirm,
    onCancel,
    isProcessing,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'danger',
}: ApprovalConfirmModalProps) {
    const handleCancel = () => {
        onCancel?.();
        onOpenChange(false);
    };

    return (
        <ApprovalModalShell
            open={open}
            onOpenChange={onOpenChange}
            size="sm"
            processing={isProcessing}
            processingLabel="Processing…"
            layout="flex"
        >
            <ApprovalModalHeaderSection>
                <ModalTitle className={`text-lg font-bold ${approvalTheme.titleGradient}`}>{title}</ModalTitle>
                {description && (
                    <ModalDescription className="mt-1 text-sm text-slate-600">{description}</ModalDescription>
                )}
            </ApprovalModalHeaderSection>
            <ApprovalModalBody className="py-2">
                <p className="text-sm text-slate-600">
                    This action cannot be undone. Please confirm to continue.
                </p>
            </ApprovalModalBody>
            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
                <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                    disabled={isProcessing}
                    className="w-full sm:w-auto"
                >
                    {cancelLabel}
                </Button>
                <Button
                    type="button"
                    variant={variant === 'danger' ? 'destructive' : 'default'}
                    onClick={onConfirm}
                    disabled={isProcessing}
                    className={
                        variant === 'danger'
                            ? 'w-full bg-[#d2293b] hover:bg-[#d2293b]/90 sm:w-auto'
                            : 'w-full bg-[#003594] hover:bg-[#003594]/90 sm:w-auto'
                    }
                >
                    {isProcessing ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Processing…
                        </>
                    ) : (
                        confirmLabel
                    )}
                </Button>
            </div>
        </ApprovalModalShell>
    );
}
