'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { recordsTheme } from './recordsTheme';

interface RecordsModalProps {
    open: boolean;
    title: string;
    description?: string;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
    size?: 'md' | 'lg' | 'xl' | '2xl';
    submitting?: boolean;
}

const SIZE_CLASS = {
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-5xl',
};

export function RecordsModal({
    open,
    title,
    description,
    onClose,
    children,
    footer,
    size = 'lg',
    submitting,
}: RecordsModalProps) {
    useEffect(() => {
        if (!open) {
            return;
        }
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [open]);

    if (!open || typeof document === 'undefined') {
        return null;
    }

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px]">
            <div
                className={`relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl border border-[#002a6e]/10 bg-white shadow-2xl ${SIZE_CLASS[size]}`}
                role="dialog"
                aria-modal="true"
            >
                {submitting && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
                        <div className="flex flex-col items-center gap-2 text-[#003594]">
                            <Loader2 className="h-8 w-8 animate-spin" />
                            <p className="text-sm font-medium">Saving…</p>
                        </div>
                    </div>
                )}
                <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
                        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
                {footer && (
                    <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">{footer}</div>
                )}
            </div>
        </div>,
        document.body
    );
}

export function RecordsModalActions({
    onCancel,
    onSubmit,
    submitLabel = 'Save',
    cancelLabel = 'Cancel',
    submitting,
    danger,
}: {
    onCancel: () => void;
    onSubmit: () => void;
    submitLabel?: string;
    cancelLabel?: string;
    submitting?: boolean;
    danger?: boolean;
}) {
    return (
        <>
            <button type="button" onClick={onCancel} disabled={submitting} className={recordsTheme.outlineBtn}>
                {cancelLabel}
            </button>
            <button
                type="button"
                onClick={onSubmit}
                disabled={submitting}
                className={danger ? recordsTheme.dangerBtn : recordsTheme.primaryBtn}
            >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitLabel}
            </button>
        </>
    );
}
