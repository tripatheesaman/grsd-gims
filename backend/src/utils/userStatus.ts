export function isUserStatusActive(status: unknown): boolean {
    if (status === 1 || status === true) return true;
    if (status === 0 || status === false) return false;
    const normalized = String(status ?? '').trim().toLowerCase();
    return normalized === '1' || normalized === 'active' || normalized === 'true';
}

/** Persist as varchar flag used by the users table. */
export function normalizeUserStatusForDb(status: unknown): string {
    return isUserStatusActive(status) ? '1' : '0';
}

/** API responses use numeric 1/0 for the frontend. */
export function normalizeUserStatusForApi(status: unknown): number {
    return isUserStatusActive(status) ? 1 : 0;
}

export const ACTIVE_USER_STATUS_SQL = `(status = '1' OR status = 1 OR status = 'active')`;
