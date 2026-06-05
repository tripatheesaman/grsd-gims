'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/utils';

interface InventoryPageHeaderProps {
    title: string;
    description: string;
    badge?: string;
    actions?: ReactNode;
    className?: string;
}

export function InventoryPageHeader({
    title,
    description,
    badge,
    actions,
    className,
}: InventoryPageHeaderProps) {
    return (
        <div
            className={cn(
                'relative overflow-hidden rounded-2xl border border-[#003594]/10 bg-gradient-to-br from-[#012b6c] via-[#003594] to-[#05163c] p-6 text-white shadow-lg sm:p-8',
                className
            )}
        >
            <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" aria-hidden />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                    {badge && (
                        <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-0.5 text-xs font-medium uppercase tracking-wider text-white/85">
                            {badge}
                        </span>
                    )}
                    <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
                    <p className="max-w-xl text-sm text-white/80">{description}</p>
                </div>
                {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
            </div>
        </div>
    );
}
