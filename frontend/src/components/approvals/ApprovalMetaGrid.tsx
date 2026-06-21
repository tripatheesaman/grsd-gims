'use client';

import { approvalTheme } from './approvalTheme';
import { cn } from '@/utils/utils';

export interface ApprovalMetaItem {
    label: string;
    value: React.ReactNode;
    className?: string;
}

export function ApprovalMetaGrid({
    items,
    columns = 3,
    className,
}: {
    items: ApprovalMetaItem[];
    columns?: 1 | 2 | 3 | 4;
    className?: string;
}) {
    const colClass =
        columns === 1
            ? 'grid-cols-1'
            : columns === 4
              ? 'sm:grid-cols-2 lg:grid-cols-4'
              : columns === 2
                ? 'sm:grid-cols-2'
                : 'sm:grid-cols-2 lg:grid-cols-3';

    return (
        <div className={cn(approvalTheme.sectionCard, className)}>
            <div className={cn('grid grid-cols-1 gap-4', colClass)}>
                {items.map((item) => (
                    <div key={item.label} className={cn('space-y-1', item.className)}>
                        <p className={approvalTheme.metaLabel}>{item.label}</p>
                        <div className={approvalTheme.metaValue}>{item.value}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
