/** Token format inserted by MentionTextarea: @[Display Name](u:123) */
export const MENTION_TOKEN_REGEX = /@\[([^\]]+)\]\(u:(\d+)\)/g;

export function buildMentionToken(name: string, userId: number): string {
    return `@[${name}](u:${userId})`;
}

export function getActiveMentionQuery(text: string, cursorPos: number): { query: string; startIndex: number } | null {
    const before = text.slice(0, cursorPos);
    const match = /(?:^|[\s(\[])(@[^\s@\[(\n]{0,40})$/.exec(before);
    if (!match) return null;
    const fragment = match[1];
    const startIndex = before.length - fragment.length;
    return { query: fragment.slice(1), startIndex };
}

export function insertMentionToken(
    text: string,
    startIndex: number,
    cursorPos: number,
    name: string,
    userId: number
): { value: string; cursor: number } {
    const token = `${buildMentionToken(name, userId)} `;
    const value = `${text.slice(0, startIndex)}${token}${text.slice(cursorPos)}`;
    const cursor = startIndex + token.length;
    return { value, cursor };
}

export type MessageBodyPart =
    | { type: 'text'; value: string }
    | { type: 'mention'; name: string; userId: number };

export function parseMessageBody(body: string): MessageBodyPart[] {
    const parts: MessageBodyPart[] = [];
    let lastIndex = 0;
    for (const match of body.matchAll(MENTION_TOKEN_REGEX)) {
        const index = match.index ?? 0;
        if (index > lastIndex) {
            parts.push({ type: 'text', value: body.slice(lastIndex, index) });
        }
        parts.push({
            type: 'mention',
            name: match[1],
            userId: Number(match[2]),
        });
        lastIndex = index + match[0].length;
    }
    if (lastIndex < body.length) {
        parts.push({ type: 'text', value: body.slice(lastIndex) });
    }
    return parts.length ? parts : [{ type: 'text', value: body }];
}

export function canCloseCommunication(params: {
    createdBy: number;
    userId?: number;
    permissions: string[];
}): boolean {
    const { createdBy, userId, permissions } = params;
    if (!userId) return false;
    if (createdBy === userId) return true;
    return permissions.includes('can_close_all_messages');
}
