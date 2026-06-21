import { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

export interface PersonDetails {
    name: string;
    email?: string | null;
    staffId?: string | null;
    designation?: string | null;
}

type DbExecutor = Pool | PoolConnection;

interface AuthorityRow extends RowDataPacket {
    name: string;
    designation: string | null;
    staff_id: string | null;
    email: string | null;
}

interface UserRow extends RowDataPacket {
    username: string;
    first_name: string;
    last_name: string;
    staffid: string | null;
    designation: string | null;
}

const trimOrNull = (value: unknown): string | null => {
    if (value == null) return null;
    const text = String(value).trim();
    return text || null;
};

const looksLikeEmail = (value: string): boolean => value.includes('@');

export const buildPersonDetails = (input: Partial<PersonDetails> & { name?: string | null }): PersonDetails => ({
    name: trimOrNull(input.name) || 'Unknown',
    email: trimOrNull(input.email),
    staffId: trimOrNull(input.staffId),
    designation: trimOrNull(input.designation),
});

export async function resolveAuthorityPerson(
    executor: DbExecutor,
    authorityId: number | null | undefined
): Promise<PersonDetails | null> {
    if (!authorityId) return null;

    const [rows] = await executor.execute<AuthorityRow[]>(
        `SELECT name, designation, staff_id, email
         FROM requesting_receiving_authority
         WHERE id = ? AND is_active = 1
         LIMIT 1`,
        [authorityId]
    );

    if (!rows.length) return null;

    const row = rows[0];
    return buildPersonDetails({
        name: row.name,
        designation: row.designation,
        staffId: row.staff_id,
        email: row.email,
    });
}

export async function resolveAuthorityPersonByEmail(
    executor: DbExecutor,
    email: string | null | undefined
): Promise<PersonDetails | null> {
    const normalized = trimOrNull(email);
    if (!normalized) return null;

    const [rows] = await executor.execute<AuthorityRow[]>(
        `SELECT name, designation, staff_id, email
         FROM requesting_receiving_authority
         WHERE LOWER(email) = LOWER(?) AND is_active = 1
         ORDER BY id ASC
         LIMIT 1`,
        [normalized]
    );

    if (!rows.length) return null;

    const row = rows[0];
    return buildPersonDetails({
        name: row.name,
        designation: row.designation,
        staffId: row.staff_id,
        email: row.email,
    });
}

export async function resolveUserPersonByUsername(
    executor: DbExecutor,
    username: string | null | undefined
): Promise<PersonDetails | null> {
    const normalized = trimOrNull(username);
    if (!normalized) return null;

    const [rows] = await executor.execute<UserRow[]>(
        `SELECT username, first_name, last_name, staffid, designation
         FROM users
         WHERE username = ? OR LOWER(username) = LOWER(?)
         LIMIT 1`,
        [normalized, normalized]
    );

    if (!rows.length) return null;

    const row = rows[0];
    const fullName = `${row.first_name || ''} ${row.last_name || ''}`.trim();
    return buildPersonDetails({
        name: fullName || normalized,
        email: looksLikeEmail(row.username) ? row.username : null,
        staffId: row.staffid || row.username,
        designation: row.designation,
    });
}

export async function resolveRequestRequester(
    executor: DbExecutor,
    input: {
        requestedById?: number | null;
        requestedByEmail?: string | null;
        requestedBy?: string | null;
    }
): Promise<PersonDetails> {
    const fromAuthority = await resolveAuthorityPerson(executor, input.requestedById);
    if (fromAuthority) {
        if (!fromAuthority.email && input.requestedByEmail) {
            fromAuthority.email = trimOrNull(input.requestedByEmail);
        }
        return fromAuthority;
    }

    const fromAuthorityEmail = await resolveAuthorityPersonByEmail(
        executor,
        input.requestedByEmail || (looksLikeEmail(String(input.requestedBy || '')) ? input.requestedBy : null)
    );
    if (fromAuthorityEmail) return fromAuthorityEmail;

    const fromUser = await resolveUserPersonByUsername(executor, input.requestedBy);
    if (fromUser) return fromUser;

    const requestedBy = trimOrNull(input.requestedBy);
    const requestedByEmail = trimOrNull(input.requestedByEmail);

    if (requestedBy && looksLikeEmail(requestedBy)) {
        return buildPersonDetails({
            name: requestedByEmail ? requestedBy.split('@')[0] : requestedBy,
            email: requestedBy,
            staffId: requestedBy,
        });
    }

    return buildPersonDetails({
        name: requestedBy || requestedByEmail || 'Unknown',
        email: requestedByEmail || (requestedBy && looksLikeEmail(requestedBy) ? requestedBy : null),
        staffId: requestedBy && !looksLikeEmail(requestedBy) ? requestedBy : null,
    });
}

export async function enrichIssuedByPerson(
    executor: DbExecutor,
    issuedByRaw: unknown
): Promise<PersonDetails> {
    let parsed: { name?: string; staffId?: string; email?: string; designation?: string } = {};
    if (typeof issuedByRaw === 'string') {
        try {
            parsed = JSON.parse(issuedByRaw);
        } catch {
            parsed = { name: issuedByRaw };
        }
    } else if (issuedByRaw && typeof issuedByRaw === 'object') {
        parsed = issuedByRaw as typeof parsed;
    }

    const lookupKey = trimOrNull(parsed.staffId) || trimOrNull(parsed.name);
    const fromUser = await resolveUserPersonByUsername(executor, lookupKey);
    if (fromUser) {
        return buildPersonDetails({
            name: trimOrNull(parsed.name) || fromUser.name,
            email: trimOrNull(parsed.email) || fromUser.email,
            staffId: trimOrNull(parsed.staffId) || fromUser.staffId,
            designation: trimOrNull(parsed.designation) || fromUser.designation,
        });
    }

    return buildPersonDetails({
        name: parsed.name,
        email: parsed.email,
        staffId: parsed.staffId,
        designation: parsed.designation,
    });
}

export async function resolveActorPerson(
    executor: DbExecutor,
    username: string | null | undefined
): Promise<PersonDetails> {
    const fromUser = await resolveUserPersonByUsername(executor, username);
    if (fromUser) return fromUser;

    const normalized = trimOrNull(username);
    if (!normalized) return buildPersonDetails({ name: 'Unknown' });

    if (looksLikeEmail(normalized)) {
        return buildPersonDetails({
            name: normalized.split('@')[0],
            email: normalized,
            staffId: normalized,
        });
    }

    return buildPersonDetails({ name: normalized, staffId: normalized });
}
