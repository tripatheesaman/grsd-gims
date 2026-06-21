'use client';

import Image from 'next/image';
import { Paperclip } from 'lucide-react';
import { CommunicationMessage } from '@/types/communications';
import { formatCommunicationDate } from '@/lib/communications';
import { CommunicationMessageBody } from '@/components/communications/CommunicationMessageBody';
import { withBasePath } from '@/lib/urls';

function MessageAttachment({
    path,
    name,
}: {
    path: string;
    name?: string | null;
}) {
    const href = withBasePath(path);
    const label = name || 'Attachment';
    const isImage = /\.(png|jpe?g|gif|webp|bmp)$/i.test(path);

    if (isImage) {
        return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="mt-2 block">
                <Image
                    src={href}
                    alt={label}
                    width={640}
                    height={320}
                    unoptimized
                    className="max-h-40 rounded-md border border-slate-200 object-contain"
                />
            </a>
        );
    }

    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-2 text-sm text-blue-700 hover:underline"
        >
            <Paperclip size={14} />
            {label}
        </a>
    );
}

export function CommunicationMessageBubble({ message }: { message: CommunicationMessage }) {
    const isConclusion = message.messageType === 'conclusion';

    return (
        <div
            className={`rounded-lg border px-4 py-3 ${
                isConclusion
                    ? 'border-emerald-200 bg-emerald-50'
                    : message.messageType === 'initial'
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-slate-200 bg-white'
            }`}
        >
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900">{message.authorName}</span>
                <span className="text-xs text-slate-500">{formatCommunicationDate(message.createdAt)}</span>
            </div>
            {isConclusion && (
                <span className="mb-2 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-emerald-800">
                    Conclusion
                </span>
            )}
            <CommunicationMessageBody body={message.body} />
            {message.attachmentPath && (
                <MessageAttachment path={message.attachmentPath} name={message.attachmentName} />
            )}
        </div>
    );
}
