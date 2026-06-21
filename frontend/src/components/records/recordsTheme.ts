export const recordsTheme = {
    page: 'min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100',
    container: 'container mx-auto max-w-7xl space-y-6 p-4 sm:p-6',
    card: 'rounded-xl border border-[#002a6e]/10 bg-white shadow-sm',
    cardPadding: 'p-5 sm:p-6',
    filterLabel: 'text-sm font-medium text-slate-700',
    input:
        'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-[#003594] focus:outline-none focus:ring-2 focus:ring-[#003594]/15',
    inputError: 'border-red-400 focus:border-red-500 focus:ring-red-500/15',
    select:
        'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-[#003594] focus:outline-none focus:ring-2 focus:ring-[#003594]/15',
    textarea:
        'w-full min-h-[88px] rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-[#003594] focus:outline-none focus:ring-2 focus:ring-[#003594]/15',
    tableHead: 'bg-gradient-to-r from-[#003594] to-[#012b6c] text-white',
    tableHeadCell: 'whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide',
    tableRow: 'border-b border-slate-100 transition hover:bg-[#003594]/[0.03]',
    tableCell: 'whitespace-nowrap px-4 py-3 text-sm text-slate-800',
    primaryBtn:
        'inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#003594] to-[#012b6c] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:from-[#012b6c] hover:to-[#001a5c] disabled:opacity-60',
    outlineBtn:
        'inline-flex items-center gap-2 rounded-lg border border-[#002a6e]/15 bg-white px-4 py-2.5 text-sm font-medium text-[#003594] shadow-sm transition hover:bg-[#003594]/5 disabled:opacity-60',
    dangerBtn:
        'inline-flex items-center gap-2 rounded-lg bg-[#d2293b] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#b81f30] disabled:opacity-60',
    iconBtn:
        'inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition hover:border-[#003594]/30 hover:bg-[#003594]/5 hover:text-[#003594]',
    iconBtnDanger:
        'inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 transition hover:bg-red-50',
} as const;
