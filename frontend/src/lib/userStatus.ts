export function isUserActive(status: unknown): boolean {
    if (status === 1 || status === true) return true;
    if (status === 0 || status === false) return false;
    const normalized = String(status ?? '').trim().toLowerCase();
    return normalized === '1' || normalized === 'active' || normalized === 'true';
}

export function userStatusLabel(status: unknown): 'Active' | 'Inactive' {
    return isUserActive(status) ? 'Active' : 'Inactive';
}

export function userStatusToFormValue(status: unknown): number {
    return isUserActive(status) ? 1 : 0;
}
