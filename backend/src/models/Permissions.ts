import pool from "../config/db";

export interface Permission {
    id: number;
    permission_name: string;
    allowed_ids: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const permissionCache = new Map<number, { permissions: string[]; expiresAt: number }>();

export function invalidatePermissionCache(userId?: number): void {
    if (userId === undefined) {
        permissionCache.clear();
        return;
    }
    permissionCache.delete(userId);
}

export const getPermissionsByUserId = async (userId: number): Promise<string[]> => {
    const cached = permissionCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.permissions;
    }

    try {
        const [rows] = await pool.execute(`SELECT permission_name 
       FROM user_permissions 
       WHERE FIND_IN_SET(?, allowed_user_ids) > 0 
       OR allowed_user_ids = ?`, [userId.toString(), userId.toString()]);
        const permissions = (rows as Permission[]).map(row => row.permission_name);
        permissionCache.set(userId, {
            permissions,
            expiresAt: Date.now() + CACHE_TTL_MS,
        });
        return permissions;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        throw new Error(`Failed to fetch permissions: ${errorMessage}`);
    }
};
