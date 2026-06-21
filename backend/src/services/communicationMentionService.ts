import { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';
import { ACTIVE_USER_STATUS_SQL } from '../utils/userStatus';

export const MENTION_REMINDER_HOURS = 2;

/** Matches tokens inserted by the mention UI: @[Display Name](u:123) */
export const MENTION_TOKEN_REGEX = /@\[([^\]]+)\]\(u:(\d+)\)/g;

export function extractMentionUserIds(body: string): number[] {
    const ids = new Set<number>();
    for (const match of body.matchAll(MENTION_TOKEN_REGEX)) {
        const id = Number(match[2]);
        if (Number.isFinite(id) && id > 0) {
            ids.add(id);
        }
    }
    return [...ids];
}

async function ensureMentionAlertColumns(): Promise<void> {
    const alters = [
        'ADD COLUMN acknowledged_at DATETIME NULL',
        'ADD COLUMN responded_at DATETIME NULL',
        'ADD COLUMN snoozed_until DATETIME NULL',
        'ADD COLUMN remind_on_login TINYINT(1) NOT NULL DEFAULT 0',
        'ADD COLUMN last_reminded_at DATETIME NULL',
    ];
    for (const clause of alters) {
        try {
            await pool.query(`ALTER TABLE communication_mention_alerts ${clause}`);
        } catch {
            // column already exists
        }
    }
}

export async function ensureMentionsTable(): Promise<void> {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS communication_mentions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            message_id INT NOT NULL,
            user_id INT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_comm_mention_message_user (message_id, user_id),
            KEY idx_comm_mentions_user (user_id),
            KEY idx_comm_mentions_message (message_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
}

export async function ensureMentionAlertsTable(): Promise<void> {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS communication_mention_alerts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            thread_id INT NOT NULL,
            recipient_user_id INT NOT NULL,
            message_id INT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            dismissed_at DATETIME NULL,
            acknowledged_at DATETIME NULL,
            responded_at DATETIME NULL,
            snoozed_until DATETIME NULL,
            remind_on_login TINYINT(1) NOT NULL DEFAULT 0,
            last_reminded_at DATETIME NULL,
            KEY idx_comm_mention_alerts_recipient (recipient_user_id, dismissed_at),
            KEY idx_comm_mention_alerts_thread (thread_id),
            KEY idx_comm_mention_alerts_message (message_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await ensureMentionAlertColumns();

    await pool.execute(`
        INSERT INTO communication_mention_alerts (thread_id, recipient_user_id, message_id, created_at)
        SELECT m.thread_id, cm.user_id, cm.message_id, cm.created_at
        FROM communication_mentions cm
        JOIN communication_messages m ON m.id = cm.message_id
        WHERE NOT EXISTS (
            SELECT 1 FROM communication_mention_alerts ma
            WHERE ma.message_id = cm.message_id
              AND ma.recipient_user_id = cm.user_id
        )
    `);
}

/** SQL fragment: mention alert still needs user attention (ack, follow-up, or reminder). */
export const MENTION_ALERT_PENDING_SQL = `
    ma.responded_at IS NULL
    AND ma.dismissed_at IS NULL
    AND (
        ma.acknowledged_at IS NULL
        OR ma.snoozed_until IS NULL
        OR ma.snoozed_until <= NOW()
    )
`;

export async function createMentionAlerts(params: {
    threadId: number;
    messageId: number;
    recipientUserIds: number[];
}): Promise<void> {
    const { threadId, messageId, recipientUserIds } = params;
    await ensureMentionAlertsTable();
    const uniqueRecipients = [...new Set(recipientUserIds.filter((id) => Number.isFinite(id) && id > 0))];
    for (const recipientUserId of uniqueRecipients) {
        await pool.execute(
            `INSERT INTO communication_mention_alerts (thread_id, recipient_user_id, message_id)
             VALUES (?, ?, ?)`,
            [threadId, recipientUserId, messageId]
        );
    }
}

export async function acknowledgeMentionAlertById(alertId: number, userId: number): Promise<boolean> {
    await ensureMentionAlertsTable();
    const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE communication_mention_alerts
         SET acknowledged_at = COALESCE(acknowledged_at, CURRENT_TIMESTAMP),
             snoozed_until = NULL,
             remind_on_login = 0
         WHERE id = ?
           AND recipient_user_id = ?
           AND responded_at IS NULL
           AND dismissed_at IS NULL`,
        [alertId, userId]
    );
    return result.affectedRows > 0;
}

export async function snoozeMentionAlertById(alertId: number, userId: number): Promise<boolean> {
    await ensureMentionAlertsTable();
    const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE communication_mention_alerts
         SET acknowledged_at = COALESCE(acknowledged_at, CURRENT_TIMESTAMP),
             snoozed_until = DATE_ADD(NOW(), INTERVAL ${MENTION_REMINDER_HOURS} HOUR),
             remind_on_login = 1,
             last_reminded_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND recipient_user_id = ?
           AND responded_at IS NULL
           AND dismissed_at IS NULL`,
        [alertId, userId]
    );
    return result.affectedRows > 0;
}

export async function resolveMentionAlertById(alertId: number, userId: number): Promise<boolean> {
    await ensureMentionAlertsTable();
    const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE communication_mention_alerts
         SET responded_at = COALESCE(responded_at, CURRENT_TIMESTAMP),
             dismissed_at = COALESCE(dismissed_at, CURRENT_TIMESTAMP),
             snoozed_until = NULL,
             remind_on_login = 0
         WHERE id = ?
           AND recipient_user_id = ?`,
        [alertId, userId]
    );
    return result.affectedRows > 0;
}

export async function applyLoginMentionReminders(userId: number): Promise<void> {
    await ensureMentionAlertsTable();
    await pool.execute(
        `UPDATE communication_mention_alerts
         SET snoozed_until = NULL,
             last_reminded_at = CURRENT_TIMESTAMP
         WHERE recipient_user_id = ?
           AND remind_on_login = 1
           AND acknowledged_at IS NOT NULL
           AND responded_at IS NULL
           AND dismissed_at IS NULL`,
        [userId]
    );
    await pool.execute(
        `UPDATE communication_mention_alerts
         SET remind_on_login = 0
         WHERE recipient_user_id = ?
           AND remind_on_login = 1
           AND responded_at IS NULL
           AND dismissed_at IS NULL`,
        [userId]
    );
}

export async function resolveMentionAlertsAfterReply(threadId: number, userId: number): Promise<void> {
    await ensureMentionAlertsTable();
    await pool.execute(
        `UPDATE communication_mention_alerts
         SET responded_at = COALESCE(responded_at, CURRENT_TIMESTAMP),
             dismissed_at = COALESCE(dismissed_at, CURRENT_TIMESTAMP),
             snoozed_until = NULL,
             remind_on_login = 0
         WHERE thread_id = ?
           AND recipient_user_id = ?
           AND responded_at IS NULL`,
        [threadId, userId]
    );
}

export async function userHasAcknowledgedMentionOnThread(threadId: number, userId: number): Promise<boolean> {
    await ensureMentionAlertsTable();
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT 1 FROM communication_mention_alerts
         WHERE thread_id = ?
           AND recipient_user_id = ?
           AND acknowledged_at IS NOT NULL
           AND responded_at IS NULL
         LIMIT 1`,
        [threadId, userId]
    );
    return rows.length > 0;
}

export async function saveMessageMentions(
    connection: PoolConnection,
    messageId: number,
    userIds: number[]
): Promise<void> {
    await ensureMentionsTable();
    const uniqueIds = [...new Set(userIds.filter((id) => Number.isFinite(id) && id > 0))];
    for (const mentionedUserId of uniqueIds) {
        await connection.execute(
            `INSERT IGNORE INTO communication_mentions (message_id, user_id) VALUES (?, ?)`,
            [messageId, mentionedUserId]
        );
    }
}

export async function notifyMentionedUsers(params: {
    threadId: number;
    threadTitle: string;
    messageId: number;
    authorUserId: number;
    authorName: string;
    mentionedUserIds: number[];
    previewBody: string;
}): Promise<void> {
    const { threadId, threadTitle, messageId, authorUserId, authorName, mentionedUserIds, previewBody } = params;
    const recipients = mentionedUserIds.filter((id) => id !== authorUserId);
    if (!recipients.length) return;

    const preview = previewBody.trim().length > 120 ? `${previewBody.trim().slice(0, 120)}…` : previewBody.trim();
    const notificationMessage = `${authorName} mentioned you in "${threadTitle}": ${preview}`;

    for (const recipientUserId of recipients) {
        try {
            await createMentionAlerts({
                threadId,
                messageId,
                recipientUserIds: [recipientUserId],
            });

            await pool.execute(
                `INSERT INTO notifications (user_id, reference_type, message, reference_id)
                 VALUES (?, 'communication', ?, ?)`,
                [recipientUserId, notificationMessage, String(threadId)]
            );
            logEvents(
                `Mention notification sent to user ${recipientUserId} for thread ${threadId}, message ${messageId}`,
                'communicationsLog.log'
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logEvents(
                `Failed mention notification for user ${recipientUserId}, thread ${threadId}: ${message}`,
                'communicationsLog.log'
            );
        }
    }
}

export async function searchMentionableUsers(query: string): Promise<
    Array<{ id: number; username: string; name: string; designation?: string }>
> {
    const trimmed = query.trim();
    const like = `%${trimmed}%`;
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT id, username, first_name, last_name, designation
         FROM users
         WHERE ${ACTIVE_USER_STATUS_SQL}
           AND (
             ? = ''
             OR username LIKE ?
             OR first_name LIKE ?
             OR last_name LIKE ?
             OR CONCAT(first_name, ' ', last_name) LIKE ?
           )
         ORDER BY first_name ASC, last_name ASC, username ASC
         LIMIT 20`,
        [trimmed, like, like, like, like]
    );
    return rows.map((row) => ({
        id: Number(row.id),
        username: String(row.username),
        name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || String(row.username),
        designation: row.designation ? String(row.designation) : undefined,
    }));
}

export async function getActiveThreadCountForUser(userId: number): Promise<number> {
    await ensureMentionsTable();
    await ensureMentionAlertsTable();
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(DISTINCT t.id) AS active_count
         FROM communication_threads t
         WHERE t.status IN ('open', 'in_progress')
           AND (
             t.created_by = ?
             OR t.assigned_to = ?
             OR EXISTS (
                 SELECT 1 FROM communication_messages m
                 WHERE m.thread_id = t.id AND m.user_id = ?
             )
             OR EXISTS (
                 SELECT 1 FROM communication_mentions cm
                 JOIN communication_messages m ON m.id = cm.message_id
                 WHERE m.thread_id = t.id AND cm.user_id = ?
             )
             OR EXISTS (
                 SELECT 1 FROM communication_mention_alerts ma
                 WHERE ma.thread_id = t.id
                   AND ma.recipient_user_id = ?
                   AND ${MENTION_ALERT_PENDING_SQL}
             )
           )`,
        [userId, userId, userId, userId, userId]
    );
    return Number(rows[0]?.active_count || 0);
}
