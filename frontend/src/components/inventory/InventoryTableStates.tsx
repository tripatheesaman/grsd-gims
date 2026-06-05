'use client';

import { Loader2, PackageSearch, AlertCircle, Inbox } from 'lucide-react';
import { cn } from '@/utils/utils';

interface InventoryTableStatesProps {
    variant: 'loading' | 'error' | 'empty';
    title?: string;
    message?: string;
    className?: string;
}

export function InventoryTableStates({
    variant,
    title,
    message,
    className,
}: InventoryTableStatesProps) {
    const config = {
        loading: {
            icon: Loader2,
            iconClass: 'h-10 w-10 animate-spin text-[#003594]',
            defaultTitle: 'Loading…',
            defaultMessage: 'Fetching inventory records',
        },
        error: {
            icon: AlertCircle,
            iconClass: 'h-10 w-10 text-red-500',
            defaultTitle: 'Something went wrong',
            defaultMessage: 'Please try again in a moment.',
        },
        empty: {
            icon: Inbox,
            iconClass: 'h-10 w-10 text-slate-300',
            defaultTitle: 'No items found',
            defaultMessage: 'Try different filters or clear them to see all stock.',
        },
    }[variant];

    const Icon = config.icon;

    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center px-6 py-16 text-center',
                className
            )}
        >
            {variant === 'loading' ? (
                <Icon className={config.iconClass} />
            ) : (
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                    <Icon className={config.iconClass} />
                </div>
            )}
            <p className="text-base font-semibold text-slate-900">
                {title ?? config.defaultTitle}
            </p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
                {message ?? config.defaultMessage}
            </p>
            {variant === 'empty' && (
                <PackageSearch className="mt-4 h-5 w-5 text-slate-300" aria-hidden />
            )}
        </div>
    );
}
