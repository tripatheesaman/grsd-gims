'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/utils/utils';

type BannerVariant = 'warning' | 'info';

const styles: Record<BannerVariant, string> = {
    warning: 'border-amber-200 bg-amber-50 text-amber-950',
    info: 'border-sky-200 bg-sky-50 text-sky-950',
};

export function ApprovalAlertBanner({
    children,
    variant = 'warning',
    className,
}: {
    children: ReactNode;
    variant?: BannerVariant;
    className?: string;
}) {
    const Icon = variant === 'warning' ? AlertTriangle : Info;
    return (
        <div
            className={cn(
                'flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm leading-relaxed',
                styles[variant],
                className
            )}
            role="status"
        >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">{children}</div>
        </div>
    );
}
