'use client';

import Image from 'next/image';
import { ModalDescription, ModalTitle } from '@/components/ui/modal';
import {
    ApprovalModalShell,
    ApprovalModalBody,
    ApprovalModalHeaderSection,
} from './ApprovalModalShell';
import { approvalTheme } from './approvalTheme';

interface ApprovalImagePreviewModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    src: string;
    alt?: string;
    title?: string;
}

export function ApprovalImagePreviewModal({
    open,
    onOpenChange,
    src,
    alt = 'Preview',
    title = 'Image preview',
}: ApprovalImagePreviewModalProps) {
    return (
        <ApprovalModalShell open={open} onOpenChange={onOpenChange} size="xl" layout="flex">
            <ApprovalModalHeaderSection>
                <ModalTitle className={`text-lg font-bold ${approvalTheme.titleGradient}`}>{title}</ModalTitle>
                <ModalDescription className="sr-only">Full size image preview</ModalDescription>
            </ApprovalModalHeaderSection>
            <ApprovalModalBody className="flex items-center justify-center bg-slate-50/50">
                <Image
                    src={src}
                    alt={alt}
                    width={800}
                    height={600}
                    className="max-h-[min(70dvh,640px)] w-auto max-w-full rounded-xl border border-slate-200 object-contain"
                    unoptimized
                />
            </ApprovalModalBody>
        </ApprovalModalShell>
    );
}
