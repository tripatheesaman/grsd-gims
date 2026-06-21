/** Shared visual tokens for approval modals across the app. */
export const approvalTheme = {
    panel:
        'border border-[#002a6e]/10 bg-white text-slate-900 shadow-xl sm:rounded-2xl',
    titleGradient: 'bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent',
    sectionCard: 'rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 sm:p-5',
    metaLabel: 'text-xs font-semibold uppercase tracking-wide text-[#003594]/80',
    metaValue: 'text-sm font-semibold text-slate-900 break-words',
    listCard:
        'rounded-xl border border-slate-200/90 bg-white p-4 sm:p-5 transition-all hover:border-[#003594]/25 hover:shadow-md hover:shadow-[#003594]/5',
    tableWrap: 'overflow-auto rounded-xl border border-slate-200/90 -mx-1 sm:mx-0',
    tableHead: 'bg-slate-50 text-xs font-semibold uppercase tracking-wide text-[#003594]',
    stickyFooter:
        'sticky bottom-0 z-10 shrink-0 -mx-4 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6',
    modalScrollBody:
        'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5',
} as const;

export const approvalModalSizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
    full: 'max-w-[min(96vw,72rem)]',
} as const;

export function formatApprovalDate(value?: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
