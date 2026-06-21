'use client';

import { Loader2 } from 'lucide-react';
import { ModalDescription, ModalTitle } from '@/components/ui/modal';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
    ApprovalModalShell,
    ApprovalModalBody,
    ApprovalModalHeaderSection,
} from './ApprovalModalShell';
import { approvalTheme } from './approvalTheme';

interface ApprovalRejectModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title?: string;
    description?: string;
    reason: string;
    onReasonChange: (value: string) => void;
    onConfirm: () => void;
    onCancel?: () => void;
    isRejecting?: boolean;
    confirmLabel?: string;
}

export function ApprovalRejectModal({
    open,
    onOpenChange,
    title = 'Reject',
    description = 'Please provide a reason for rejection.',
    reason,
    onReasonChange,
    onConfirm,
    onCancel,
    isRejecting,
    confirmLabel = 'Confirm rejection',
}: ApprovalRejectModalProps) {
    const handleCancel = () => {
        onCancel?.();
        onOpenChange(false);
    };

    return (
        <ApprovalModalShell
            open={open}
            onOpenChange={onOpenChange}
            size="sm"
            processing={isRejecting}
            processingLabel="Rejecting…"
            layout="flex"
        >
            <ApprovalModalHeaderSection>
                <ModalTitle className={`text-lg font-bold ${approvalTheme.titleGradient}`}>{title}</ModalTitle>
                <ModalDescription className="mt-1 text-sm text-slate-600">{description}</ModalDescription>
            </ApprovalModalHeaderSection>
            <ApprovalModalBody>
                <div className="space-y-2">
                    <Label htmlFor="approval-reject-reason" className="text-sm font-medium text-[#003594]">
                        Reason
                    </Label>
                    <Textarea
                        id="approval-reject-reason"
                        value={reason}
                        onChange={(e) => onReasonChange(e.target.value)}
                        placeholder="Enter the reason for rejection"
                        className="min-h-[110px] border-slate-200 focus:border-[#003594] focus:ring-[#003594]/20"
                        required
                    />
                </div>
            </ApprovalModalBody>
            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
                <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                    disabled={isRejecting}
                    className="w-full sm:w-auto"
                >
                    Cancel
                </Button>
                <Button
                    type="button"
                    variant="destructive"
                    onClick={onConfirm}
                    disabled={!reason.trim() || isRejecting}
                    className="w-full bg-[#d2293b] hover:bg-[#d2293b]/90 sm:w-auto"
                >
                    {isRejecting ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Rejecting…
                        </>
                    ) : (
                        confirmLabel
                    )}
                </Button>
            </div>
        </ApprovalModalShell>
    );
}
