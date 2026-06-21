export function isNotificationUnread(isRead: number | boolean | string | null | undefined): boolean {
    if (isRead === 0 || isRead === false) return true;
    if (typeof isRead === 'string') return isRead === '0' || isRead.toLowerCase() === 'false';
    return !isRead;
}
