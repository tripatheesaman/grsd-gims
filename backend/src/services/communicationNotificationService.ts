import { RowDataPacket, ResultSetHeader } from 'mysql2';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';

const REPLY_PREVIEW_MAX = 120;

function truncatePreview(text: string): string {
    const trimmed = text.trim();
    if (trimmed.length <= REPLY_PREVIEW_MAX) return trimmed;
    return `${trimmed.slice(0, REPLY_PREVIEW_MAX)}…`;
}

export async function ensureReplyAlertsTable(): Promise<void> {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS communication_reply_alerts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            thread_id INT NOT NULL,
            recipient_user_id INT NOT NULL,
            message_id INT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            dismissed_at DATETIME NULL,
            KEY idx_comm_reply_alerts_recipient (recipient_user_id, dismissed_at),
            KEY idx_comm_reply_alerts_thread (thread_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
}

async function getReplyNotificationRecipients(
    threadId: number,
    replierUserId: number
): Promise<number[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT DISTINCT uid AS user_id
         FROM (
             SELECT created_by AS uid FROM communication_threads WHERE id = ?
             UNION
             SELECT assigned_to AS uid FROM communication_threads WHERE id = ? AND assigned_to IS NOT NULL
             UNION
             SELECT user_id AS uid FROM communication_messages WHERE thread_id = ?
         ) participants
         WHERE uid IS NOT NULL AND uid != ?`,
        [threadId, threadId, threadId, replierUserId]
    );
    return rows.map((row) => Number(row.user_id)).filter((id) => Number.isFinite(id) && id > 0);
}

export async function notifyParticipantsOnReply(params: {
    threadId: number;
    threadTitle: string;
    messageId: number;
    replierUserId: number;
    replierName: string;
    replyBody: string;
}): Promise<void> {
    const { threadId, threadTitle, messageId, replierUserId, replierName, replyBody } = params;

    await ensureReplyAlertsTable();

    const recipients = await getReplyNotificationRecipients(threadId, replierUserId);
    if (!recipients.length) {
        logEvents(
            `No reply notification recipients for thread ${threadId} (replier ${replierUserId})`,
            'communicationsLog.log'
        );
        return;
    }

    const preview = truncatePreview(replyBody);
    const notificationMessage = `${replierName} replied to "${threadTitle}": ${preview}`;

    for (const recipientUserId of recipients) {
        try {
            await pool.execute(
                `INSERT INTO communication_reply_alerts (thread_id, recipient_user_id, message_id)
                 VALUES (?, ?, ?)`,
                [threadId, recipientUserId, messageId]
            );

            await pool.execute(
                `INSERT INTO notifications (user_id, reference_type, message, reference_id)
                 VALUES (?, 'communication', ?, ?)`,
                [recipientUserId, notificationMessage, String(threadId)]
            );

            logEvents(
                `Reply notification sent to user ${recipientUserId} for thread ${threadId}, message ${messageId}`,
                'communicationsLog.log'
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logEvents(
                `Failed reply notification for user ${recipientUserId}, thread ${threadId}: ${message}`,
                'communicationsLog.log'
            );
        }
    }
}

export async function dismissReplyAlertsForUser(threadId: number, userId: number): Promise<void> {
    await ensureReplyAlertsTable();
    await pool.execute(
        `UPDATE communication_reply_alerts
         SET dismissed_at = CURRENT_TIMESTAMP
         WHERE thread_id = ?
           AND recipient_user_id = ?
           AND dismissed_at IS NULL`,
        [threadId, userId]
    );
}

export async function dismissReplyAlertById(alertId: number, userId: number): Promise<boolean> {
    await ensureReplyAlertsTable();
    const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE communication_reply_alerts
         SET dismissed_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND recipient_user_id = ?
           AND dismissed_at IS NULL`,
        [alertId, userId]
    );
    return result.affectedRows > 0;
}
