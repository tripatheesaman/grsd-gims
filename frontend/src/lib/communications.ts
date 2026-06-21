'use client';

import { withBasePath } from '@/lib/urls';

export async function uploadCommunicationAttachment(file: File): Promise<{ path: string; name: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', 'communications');

    const response = await fetch(withBasePath('/api/upload'), {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to upload attachment');
    }

    const result = await response.json();
    return {
        path: result.path as string,
        name: file.name,
    };
}

export function formatCommunicationDate(value: string | null | undefined): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function communicationStatusLabel(status: string): string {
    switch (status) {
        case 'open':
            return 'Open';
        case 'in_progress':
            return 'In Progress';
        case 'resolved':
            return 'Resolved';
        case 'closed':
            return 'Closed';
        default:
            return status;
    }
}

export function communicationStatusClass(status: string): string {
    switch (status) {
        case 'open':
            return 'bg-amber-100 text-amber-800 border-amber-200';
        case 'in_progress':
            return 'bg-blue-100 text-blue-800 border-blue-200';
        case 'resolved':
            return 'bg-emerald-100 text-emerald-800 border-emerald-200';
        case 'closed':
            return 'bg-slate-100 text-slate-700 border-slate-200';
        default:
            return 'bg-gray-100 text-gray-700 border-gray-200';
    }
}

export function isActiveCommunicationStatus(status: string): boolean {
    return status === 'open' || status === 'in_progress';
}
