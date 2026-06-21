'use client';

import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { useCommunicationsContextOptional } from '@/context/CommunicationsContext';
import { cn } from '@/utils/utils';

export function CommunicationsAlertBadge() {
    const context = useCommunicationsContextOptional();
    const count = context?.activeOpenCount ?? 0;

    if (!count) {
        return null;
    }

    return (
        <Link
            href="/communications"
            className={cn(
                'relative inline-flex h-11 w-11 items-center justify-center rounded-full',
                'border border-amber-200 bg-amber-50 text-amber-700 shadow-sm transition-colors hover:bg-amber-100'
            )}
            title={`${count} open conversation${count === 1 ? '' : 's'} you are active in`}
            aria-label={`${count} open active conversations`}
        >
            <MessageSquare className="h-5 w-5" />
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#d2293b] px-1 text-[10px] font-semibold text-white">
                {count > 9 ? '9+' : count}
            </span>
        </Link>
    );
}
