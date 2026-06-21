'use client';

import type { ReactNode } from 'react';
import { InventoryPageHeader } from '@/components/inventory/InventoryPageHeader';
import { recordsTheme } from './recordsTheme';

interface RecordsPageShellProps {
    title: string;
    description: string;
    badge?: string;
    actions?: ReactNode;
    filters?: ReactNode;
    children: ReactNode;
}

export function RecordsPageShell({
    title,
    description,
    badge = 'Records',
    actions,
    filters,
    children,
}: RecordsPageShellProps) {
    return (
        <div className={recordsTheme.page}>
            <div className={recordsTheme.container}>
                <InventoryPageHeader
                    title={title}
                    description={description}
                    badge={badge}
                    actions={actions}
                />
                {filters && (
                    <div className={recordsTheme.card}>
                        <div className={recordsTheme.cardPadding}>{filters}</div>
                    </div>
                )}
                {children}
            </div>
        </div>
    );
}
