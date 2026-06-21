'use client';

import { Loader2 } from 'lucide-react';

interface ApprovalProcessingOverlayProps {
    active: boolean;
    label?: string;
}

export function ApprovalProcessingOverlay({
    active,
    label = 'Processing approval…',
}: ApprovalProcessingOverlayProps) {
    if (!active) {
        return null;
    }

    return (
        <div
            className="absolute inset-0 z-50 flex items-center justify-center rounded-[inherit] bg-slate-900/10 backdrop-blur-[3px]"
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <div className="mx-4 flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-white/60 bg-white/95 px-8 py-7 text-center shadow-xl shadow-[#003594]/10">
                <Loader2 className="h-10 w-10 animate-spin text-[#003594]" />
                <p className="text-sm font-semibold text-[#003594]">{label}</p>
                <p className="text-xs text-slate-500">Please wait while the request completes.</p>
            </div>
        </div>
    );
}
