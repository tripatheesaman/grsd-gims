'use client';

import { ReactNode } from 'react';
import { CommunicationsProvider } from '@/context/CommunicationsContext';
import CommunicationsPopup from '@/components/communications/CommunicationsPopup';

export function CommunicationsShell({ children }: { children: ReactNode }) {
    return (
        <CommunicationsProvider>
            {children}
            <CommunicationsPopup />
        </CommunicationsProvider>
    );
}
