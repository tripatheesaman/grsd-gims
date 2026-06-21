'use client';

import { parseMessageBody } from '@/lib/communicationMentions';

export function CommunicationMessageBody({ body }: { body: string }) {
    const parts = parseMessageBody(body);

    return (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {parts.map((part, index) => {
                if (part.type === 'mention') {
                    return (
                        <span
                            key={`mention-${index}-${part.userId}`}
                            className="rounded bg-blue-100 px-1 font-medium text-blue-800"
                            title={`User #${part.userId}`}
                        >
                            @{part.name}
                        </span>
                    );
                }
                return <span key={`text-${index}`}>{part.value}</span>;
            })}
        </p>
    );
}
