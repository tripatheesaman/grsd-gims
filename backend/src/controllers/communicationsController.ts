import { Request, Response } from 'express';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';
import { ensureCommunicationsSchema } from '../services/communicationsSchema';
import {
    dismissReplyAlertsForUser,
    dismissReplyAlertById,
    notifyParticipantsOnReply,
    ensureReplyAlertsTable,
} from '../services/communicationNotificationService';
import {
    extractMentionUserIds,
    saveMessageMentions,
    notifyMentionedUsers,
    searchMentionableUsers,
    getActiveThreadCountForUser,
    ensureMentionsTable,
    ensureMentionAlertsTable,
    acknowledgeMentionAlertById,
    snoozeMentionAlertById,
    resolveMentionAlertById,
    resolveMentionAlertsAfterReply,
    applyLoginMentionReminders,
    userHasAcknowledgedMentionOnThread,
    MENTION_ALERT_PENDING_SQL,
} from '../services/communicationMentionService';
import { ACTIVE_USER_STATUS_SQL } from '../utils/userStatus';
import { purgeCommunicationThread } from '../services/communicationCleanupService';

interface ThreadRow extends RowDataPacket {
    id: number;
    title: string;
    status: string;
    created_by: number;
    assigned_to: number | null;
    assigned_by: number | null;
    assigned_at: Date | null;
    conclusion: string | null;
    concluded_by: number | null;
    concluded_at: Date | null;
    created_at: Date;
    updated_at: Date;
    creator_name?: string;
    creator_username?: string;
    assignee_name?: string;
    assignee_username?: string;
    message_count?: number;
    ack_count?: number;
    user_has_acknowledged?: number;
    initial_body?: string;
    initial_attachment_path?: string | null;
    initial_attachment_name?: string | null;
    initial_created_at?: Date;
    alert_id?: number;
    alert_type?: 'initial' | 'reply' | 'mention';
    reply_body?: string;
    reply_attachment_path?: string | null;
    reply_attachment_name?: string | null;
    reply_created_at?: Date;
    reply_author_name?: string;
    mention_acknowledged_at?: Date | null;
}

interface MessageRow extends RowDataPacket {
    id: number;
    thread_id: number;
    user_id: number;
    body: string;
    attachment_path: string | null;
    attachment_name: string | null;
    message_type: string;
    created_at: Date;
    author_name?: string;
    author_username?: string;
}

const ACTIVE_STATUSES = ['open', 'in_progress'];

function hasPermission(req: Request, permission: string): boolean {
    return Boolean(req.permissions?.includes(permission));
}

function canBypassAcknowledgements(req: Request): boolean {
    return hasPermission(req, 'can_bypass_acknowledgements');
}

async function fetchThreadSummary(threadId: number, userId?: number): Promise<ThreadRow | null> {
    const [rows] = await pool.query<ThreadRow[]>(
        `SELECT t.*,
                CONCAT(c.first_name, ' ', c.last_name) AS creator_name,
                c.username AS creator_username,
                CONCAT(a.first_name, ' ', a.last_name) AS assignee_name,
                a.username AS assignee_username,
                (SELECT COUNT(*) FROM communication_messages m WHERE m.thread_id = t.id) AS message_count,
                (SELECT COUNT(*) FROM communication_acknowledgements ack WHERE ack.thread_id = t.id) AS ack_count
                ${userId ? `, (SELECT COUNT(*) FROM communication_acknowledgements ack WHERE ack.thread_id = t.id AND ack.user_id = ?) AS user_has_acknowledged` : ''}
         FROM communication_threads t
         JOIN users c ON c.id = t.created_by
         LEFT JOIN users a ON a.id = t.assigned_to
         WHERE t.id = ?`,
        userId ? [userId, threadId] : [threadId]
    );
    return rows[0] ?? null;
}

async function fetchThreadMessages(threadId: number): Promise<MessageRow[]> {
    const [rows] = await pool.query<MessageRow[]>(
        `SELECT m.*,
                CONCAT(u.first_name, ' ', u.last_name) AS author_name,
                u.username AS author_username
         FROM communication_messages m
         JOIN users u ON u.id = m.user_id
         WHERE m.thread_id = ?
         ORDER BY m.created_at ASC, m.id ASC`,
        [threadId]
    );
    return rows;
}

function mapThread(row: ThreadRow) {
    return {
        id: row.id,
        title: row.title,
        status: row.status,
        createdBy: row.created_by,
        creatorName: row.creator_name?.trim() || row.creator_username,
        creatorUsername: row.creator_username,
        assignedTo: row.assigned_to,
        assigneeName: row.assignee_name?.trim() || row.assignee_username || null,
        assigneeUsername: row.assignee_username || null,
        assignedAt: row.assigned_at,
        conclusion: row.conclusion,
        concludedBy: row.concluded_by,
        concludedAt: row.concluded_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        messageCount: Number(row.message_count || 0),
        ackCount: Number(row.ack_count || 0),
        userHasAcknowledged: Number(row.user_has_acknowledged || 0) > 0,
    };
}

function mapMessage(row: MessageRow) {
    return {
        id: row.id,
        threadId: row.thread_id,
        userId: row.user_id,
        authorName: row.author_name?.trim() || row.author_username,
        authorUsername: row.author_username,
        body: row.body,
        attachmentPath: row.attachment_path,
        attachmentName: row.attachment_name,
        messageType: row.message_type,
        createdAt: row.created_at,
    };
}

export const getUnacknowledgedThreads = async (req: Request, res: Response): Promise<void> => {
    try {
        await ensureCommunicationsSchema();
        await ensureReplyAlertsTable();
        await ensureMentionAlertsTable();
        const userId = req.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
            return;
        }

        const sessionStart = String(req.query.sessionStart || '') === '1';
        if (sessionStart) {
            await applyLoginMentionReminders(userId);
        }

        const [initialRows] = await pool.query<ThreadRow[]>(
            `SELECT t.*,
                    CONCAT(c.first_name, ' ', c.last_name) AS creator_name,
                    c.username AS creator_username,
                    CONCAT(a.first_name, ' ', a.last_name) AS assignee_name,
                    a.username AS assignee_username,
                    m.body AS initial_body,
                    m.attachment_path AS initial_attachment_path,
                    m.attachment_name AS initial_attachment_name,
                    m.created_at AS initial_created_at,
                    'initial' AS alert_type,
                    NULL AS alert_id
             FROM communication_threads t
             JOIN users c ON c.id = t.created_by
             LEFT JOIN users a ON a.id = t.assigned_to
             JOIN communication_messages m ON m.thread_id = t.id AND m.message_type = 'initial'
             LEFT JOIN communication_acknowledgements ack
                ON ack.thread_id = t.id AND ack.user_id = ?
             WHERE t.status IN ('open', 'in_progress')
               AND ack.id IS NULL
               AND NOT EXISTS (
                   SELECT 1 FROM communication_mention_alerts ma
                   WHERE ma.thread_id = t.id
                     AND ma.recipient_user_id = ?
                     AND ${MENTION_ALERT_PENDING_SQL}
               )
             ORDER BY t.created_at ASC`,
            [userId, userId]
        );

        const initialAlerts = canBypassAcknowledgements(req) ? [] : initialRows;

        const [replyRows] = await pool.query<ThreadRow[]>(
            `SELECT t.*,
                    CONCAT(c.first_name, ' ', c.last_name) AS creator_name,
                    c.username AS creator_username,
                    CONCAT(a.first_name, ' ', a.last_name) AS assignee_name,
                    a.username AS assignee_username,
                    m.body AS initial_body,
                    m.attachment_path AS initial_attachment_path,
                    m.attachment_name AS initial_attachment_name,
                    m.created_at AS initial_created_at,
                    'reply' AS alert_type,
                    ra.id AS alert_id,
                    rm.body AS reply_body,
                    rm.attachment_path AS reply_attachment_path,
                    rm.attachment_name AS reply_attachment_name,
                    rm.created_at AS reply_created_at,
                    CONCAT(ru.first_name, ' ', ru.last_name) AS reply_author_name
             FROM communication_reply_alerts ra
             JOIN communication_threads t ON t.id = ra.thread_id
             JOIN users c ON c.id = t.created_by
             LEFT JOIN users a ON a.id = t.assigned_to
             JOIN communication_messages m ON m.thread_id = t.id AND m.message_type = 'initial'
             JOIN communication_messages rm ON rm.id = ra.message_id
             JOIN users ru ON ru.id = rm.user_id
             WHERE ra.recipient_user_id = ?
               AND ra.dismissed_at IS NULL
               AND t.status IN ('open', 'in_progress')
             ORDER BY ra.created_at ASC`,
            [userId]
        );

        const [mentionRows] = await pool.query<ThreadRow[]>(
            `SELECT t.*,
                    CONCAT(c.first_name, ' ', c.last_name) AS creator_name,
                    c.username AS creator_username,
                    CONCAT(a.first_name, ' ', a.last_name) AS assignee_name,
                    a.username AS assignee_username,
                    m.body AS initial_body,
                    m.attachment_path AS initial_attachment_path,
                    m.attachment_name AS initial_attachment_name,
                    m.created_at AS initial_created_at,
                    'mention' AS alert_type,
                    ma.id AS alert_id,
                    ma.acknowledged_at AS mention_acknowledged_at,
                    mm.body AS reply_body,
                    mm.attachment_path AS reply_attachment_path,
                    mm.attachment_name AS reply_attachment_name,
                    mm.created_at AS reply_created_at,
                    CONCAT(mu.first_name, ' ', mu.last_name) AS reply_author_name
             FROM communication_mention_alerts ma
             JOIN communication_threads t ON t.id = ma.thread_id
             JOIN users c ON c.id = t.created_by
             LEFT JOIN users a ON a.id = t.assigned_to
             JOIN communication_messages m ON m.thread_id = t.id AND m.message_type = 'initial'
             JOIN communication_messages mm ON mm.id = ma.message_id
             JOIN users mu ON mu.id = mm.user_id
             WHERE ma.recipient_user_id = ?
               AND ${MENTION_ALERT_PENDING_SQL}
               AND t.status IN ('open', 'in_progress')
             ORDER BY ma.created_at ASC`,
            [userId]
        );

        const mapAlertRow = (row: ThreadRow) => {
            const base = {
                ...mapThread(row),
                alertType: row.alert_type || 'initial',
                alertId: row.alert_id ?? null,
                mentionAcknowledged: row.alert_type === 'mention'
                    ? Boolean(row.mention_acknowledged_at)
                    : undefined,
                initialMessage: {
                    body: row.initial_body,
                    attachmentPath: row.initial_attachment_path,
                    attachmentName: row.initial_attachment_name,
                    createdAt: row.initial_created_at,
                },
            };
            if (row.alert_type === 'reply' || row.alert_type === 'mention') {
                return {
                    ...base,
                    latestReply: {
                        body: row.reply_body,
                        attachmentPath: row.reply_attachment_path,
                        attachmentName: row.reply_attachment_name,
                        createdAt: row.reply_created_at,
                        authorName: String(row.reply_author_name || '').trim() || 'Someone',
                    },
                };
            }
            return base;
        };

        res.status(200).json([
            ...initialAlerts.map(mapAlertRow),
            ...mentionRows.map(mapAlertRow),
            ...replyRows.map(mapAlertRow),
        ]);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logEvents(`getUnacknowledgedThreads error: ${message}`, 'communicationsLog.log');
        res.status(500).json({ error: 'Internal Server Error', message });
    }
};

export const listCommunicationThreads = async (req: Request, res: Response): Promise<void> => {
    try {
        await ensureCommunicationsSchema();
        await ensureReplyAlertsTable();
        const userId = req.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
            return;
        }

        const status = String(req.query.status || 'all');
        const searchQuery = String(req.query.q || '').trim();
        const ackFilter = String(req.query.ack || 'all');
        const assignedToMe =
            req.query.assignedToMe === '1' || String(req.query.assignedToMe).toLowerCase() === 'true';

        let where = '1=1';
        const filterParams: unknown[] = [];

        if (status !== 'all') {
            where += ' AND t.status = ?';
            filterParams.push(status);
        }

        if (assignedToMe) {
            where += ' AND t.assigned_to = ?';
            filterParams.push(userId);
        }

        if (ackFilter === 'pending') {
            where += ` AND NOT EXISTS (
                SELECT 1 FROM communication_acknowledgements ack
                WHERE ack.thread_id = t.id AND ack.user_id = ?
            )`;
            filterParams.push(userId);
        } else if (ackFilter === 'acknowledged') {
            where += ` AND EXISTS (
                SELECT 1 FROM communication_acknowledgements ack
                WHERE ack.thread_id = t.id AND ack.user_id = ?
            )`;
            filterParams.push(userId);
        }

        if (searchQuery) {
            const like = `%${searchQuery}%`;
            where += ` AND (
                t.title LIKE ?
                OR CONCAT(c.first_name, ' ', c.last_name) LIKE ?
                OR c.username LIKE ?
                OR CONCAT(IFNULL(a.first_name, ''), ' ', IFNULL(a.last_name, '')) LIKE ?
                OR IFNULL(a.username, '') LIKE ?
                OR EXISTS (
                    SELECT 1 FROM communication_messages m
                    WHERE m.thread_id = t.id AND m.body LIKE ?
                )
            )`;
            filterParams.push(like, like, like, like, like, like);
        }

        const [rows] = await pool.query<ThreadRow[]>(
            `SELECT t.*,
                    CONCAT(c.first_name, ' ', c.last_name) AS creator_name,
                    c.username AS creator_username,
                    CONCAT(a.first_name, ' ', a.last_name) AS assignee_name,
                    a.username AS assignee_username,
                    (SELECT COUNT(*) FROM communication_messages m WHERE m.thread_id = t.id) AS message_count,
                    (SELECT COUNT(*) FROM communication_acknowledgements ack WHERE ack.thread_id = t.id) AS ack_count,
                    (SELECT COUNT(*) FROM communication_acknowledgements ack WHERE ack.thread_id = t.id AND ack.user_id = ?) AS user_has_acknowledged
             FROM communication_threads t
             JOIN users c ON c.id = t.created_by
             LEFT JOIN users a ON a.id = t.assigned_to
             WHERE ${where}
             ORDER BY t.updated_at DESC, t.id DESC
             LIMIT 200`,
            [userId, ...filterParams]
        );

        res.status(200).json(rows.map(mapThread));
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logEvents(`listCommunicationThreads error: ${message}`, 'communicationsLog.log');
        res.status(500).json({ error: 'Internal Server Error', message });
    }
};

export const getCommunicationThread = async (req: Request, res: Response): Promise<void> => {
    try {
        await ensureCommunicationsSchema();
        await ensureReplyAlertsTable();
        const userId = req.userId;
        const threadId = Number(req.params.id);
        if (!userId || !threadId) {
            res.status(400).json({ error: 'Bad Request', message: 'Invalid request' });
            return;
        }

        const thread = await fetchThreadSummary(threadId, userId);
        if (!thread) {
            res.status(404).json({ error: 'Not Found', message: 'Thread not found' });
            return;
        }

        const messages = await fetchThreadMessages(threadId);

        const [ackRows] = await pool.query<RowDataPacket[]>(
            `SELECT ack.user_id, ack.acknowledged_at,
                    CONCAT(u.first_name, ' ', u.last_name) AS user_name,
                    u.username
             FROM communication_acknowledgements ack
             JOIN users u ON u.id = ack.user_id
             WHERE ack.thread_id = ?
             ORDER BY ack.acknowledged_at ASC`,
            [threadId]
        );

        const userHasAcknowledgedMention = await userHasAcknowledgedMentionOnThread(threadId, userId);
        const mappedThread = mapThread(thread);

        res.status(200).json({
            thread: mappedThread,
            messages: messages.map(mapMessage),
            acknowledgements: ackRows.map((row) => ({
                userId: row.user_id,
                userName: String(row.user_name || '').trim() || row.username,
                username: row.username,
                acknowledgedAt: row.acknowledged_at,
            })),
            userHasAcknowledgedMention,
            userCanReply:
                canBypassAcknowledgements(req)
                || mappedThread.userHasAcknowledged
                || userHasAcknowledgedMention,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logEvents(`getCommunicationThread error: ${message}`, 'communicationsLog.log');
        res.status(500).json({ error: 'Internal Server Error', message });
    }
};

export const createCommunicationThread = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await ensureCommunicationsSchema();
        await ensureReplyAlertsTable();
        const userId = req.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
            return;
        }

        const { title, body, attachmentPath, attachmentName } = req.body as {
            title?: string;
            body?: string;
            attachmentPath?: string;
            attachmentName?: string;
        };
        const trimmedTitle = String(title || '').trim();
        const trimmedBody = String(body || '').trim();
        if (!trimmedTitle || !trimmedBody) {
            res.status(400).json({ error: 'Bad Request', message: 'Title and message body are required' });
            return;
        }

        await connection.beginTransaction();
        const [insertResult] = await connection.execute<ResultSetHeader>(
            `INSERT INTO communication_threads (title, status, created_by)
             VALUES (?, 'open', ?)`,
            [trimmedTitle, userId]
        );
        const threadId = insertResult.insertId;

        const [msgResult] = await connection.execute<ResultSetHeader>(
            `INSERT INTO communication_messages
             (thread_id, user_id, body, attachment_path, attachment_name, message_type)
             VALUES (?, ?, ?, ?, ?, 'initial')`,
            [
                threadId,
                userId,
                trimmedBody,
                attachmentPath?.trim() || null,
                attachmentName?.trim() || null,
            ]
        );
        const messageId = msgResult.insertId;
        const mentionedUserIds = extractMentionUserIds(trimmedBody);
        if (messageId && mentionedUserIds.length) {
            await saveMessageMentions(connection, messageId, mentionedUserIds);
        }

        await connection.execute(
            `INSERT INTO communication_acknowledgements (thread_id, user_id)
             VALUES (?, ?)`,
            [threadId, userId]
        );

        await connection.commit();

        if (messageId && mentionedUserIds.length) {
            const [authorRows] = await pool.query<RowDataPacket[]>(
                `SELECT CONCAT(first_name, ' ', last_name) AS name, username FROM users WHERE id = ?`,
                [userId]
            );
            const authorName =
                String(authorRows[0]?.name || '').trim() || String(authorRows[0]?.username || 'Someone');
            try {
                await notifyMentionedUsers({
                    threadId,
                    threadTitle: trimmedTitle,
                    messageId,
                    authorUserId: userId,
                    authorName,
                    mentionedUserIds,
                    previewBody: trimmedBody,
                });
            } catch (notifyError) {
                const notifyMessage = notifyError instanceof Error ? notifyError.message : 'Unknown error';
                logEvents(`notifyMentionedUsers error: ${notifyMessage}`, 'communicationsLog.log');
            }
        }

        logEvents(`Communication thread ${threadId} created by user ${userId}`, 'communicationsLog.log');
        res.status(201).json({ message: 'Communication sent', threadId });
    } catch (error) {
        await connection.rollback();
        const message = error instanceof Error ? error.message : 'Unknown error';
        logEvents(`createCommunicationThread error: ${message}`, 'communicationsLog.log');
        res.status(500).json({ error: 'Internal Server Error', message });
    } finally {
        connection.release();
    }
};

export const acknowledgeCommunicationThread = async (req: Request, res: Response): Promise<void> => {
    try {
        await ensureCommunicationsSchema();
        await ensureReplyAlertsTable();
        await ensureMentionAlertsTable();
        const userId = req.userId;
        const threadId = Number(req.params.id);
        if (!userId || !threadId) {
            res.status(400).json({ error: 'Bad Request', message: 'Invalid request' });
            return;
        }

        const { alertType, alertId } = req.body as { alertType?: string; alertId?: number };

        if (alertType === 'reply') {
            if (alertId) {
                const dismissed = await dismissReplyAlertById(Number(alertId), userId);
                if (!dismissed) {
                    res.status(404).json({ error: 'Not Found', message: 'Reply alert not found' });
                    return;
                }
            } else {
                await dismissReplyAlertsForUser(threadId, userId);
            }
            res.status(200).json({ message: 'Reply alert dismissed', threadId });
            return;
        }

        if (alertType === 'mention') {
            const { mentionAction } = req.body as { mentionAction?: string };
            if (!alertId) {
                res.status(400).json({ error: 'Bad Request', message: 'Mention alert id is required' });
                return;
            }
            if (mentionAction === 'snooze') {
                const snoozed = await snoozeMentionAlertById(Number(alertId), userId);
                if (!snoozed) {
                    res.status(404).json({ error: 'Not Found', message: 'Mention alert not found' });
                    return;
                }
                res.status(200).json({ message: 'Mention reminder snoozed', threadId });
                return;
            }
            if (mentionAction === 'resolve') {
                const resolved = await resolveMentionAlertById(Number(alertId), userId);
                if (!resolved) {
                    res.status(404).json({ error: 'Not Found', message: 'Mention alert not found' });
                    return;
                }
                res.status(200).json({ message: 'Mention alert resolved', threadId });
                return;
            }
            const acknowledged = await acknowledgeMentionAlertById(Number(alertId), userId);
            if (!acknowledged) {
                res.status(404).json({ error: 'Not Found', message: 'Mention alert not found' });
                return;
            }
            res.status(200).json({ message: 'Mention acknowledged', threadId });
            return;
        }

        const thread = await fetchThreadSummary(threadId);
        if (!thread) {
            res.status(404).json({ error: 'Not Found', message: 'Thread not found' });
            return;
        }
        if (!ACTIVE_STATUSES.includes(thread.status)) {
            res.status(409).json({ error: 'Conflict', message: 'This matter is already closed' });
            return;
        }

        await pool.execute(
            `INSERT IGNORE INTO communication_acknowledgements (thread_id, user_id)
             VALUES (?, ?)`,
            [threadId, userId]
        );

        res.status(200).json({ message: 'Acknowledged', threadId });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logEvents(`acknowledgeCommunicationThread error: ${message}`, 'communicationsLog.log');
        res.status(500).json({ error: 'Internal Server Error', message });
    }
};

export const replyToCommunicationThread = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    let connectionReleased = false;
    try {
        await ensureCommunicationsSchema();
        await ensureReplyAlertsTable();
        const userId = req.userId;
        const threadId = Number(req.params.id);
        if (!userId || !threadId) {
            res.status(400).json({ error: 'Bad Request', message: 'Invalid request' });
            return;
        }

        const { body, attachmentPath, attachmentName } = req.body as {
            body?: string;
            attachmentPath?: string;
            attachmentName?: string;
        };
        const trimmedBody = String(body || '').trim();
        if (!trimmedBody) {
            res.status(400).json({ error: 'Bad Request', message: 'Reply body is required' });
            return;
        }

        const thread = await fetchThreadSummary(threadId, userId);
        if (!thread) {
            res.status(404).json({ error: 'Not Found', message: 'Thread not found' });
            return;
        }
        if (!ACTIVE_STATUSES.includes(thread.status)) {
            res.status(409).json({ error: 'Conflict', message: 'Cannot reply to a closed matter' });
            return;
        }
        if (!canBypassAcknowledgements(req) && Number(thread.user_has_acknowledged || 0) === 0) {
            const hasMentionAck = await userHasAcknowledgedMentionOnThread(threadId, userId);
            if (!hasMentionAck) {
                res.status(403).json({
                    error: 'Forbidden',
                    message: 'Acknowledge this communication or your mention before replying',
                });
                return;
            }
        }

        await connection.beginTransaction();

        const [insertResult] = await connection.execute<ResultSetHeader>(
            `INSERT INTO communication_messages
             (thread_id, user_id, body, attachment_path, attachment_name, message_type)
             VALUES (?, ?, ?, ?, ?, 'reply')`,
            [threadId, userId, trimmedBody, attachmentPath?.trim() || null, attachmentName?.trim() || null]
        );
        const messageId = insertResult.insertId;
        const mentionedUserIds = extractMentionUserIds(trimmedBody);
        if (messageId && mentionedUserIds.length) {
            await saveMessageMentions(connection, messageId, mentionedUserIds);
        }

        await connection.execute(
            `UPDATE communication_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [threadId]
        );

        const [authorRows] = await connection.query<RowDataPacket[]>(
            `SELECT CONCAT(first_name, ' ', last_name) AS name, username FROM users WHERE id = ?`,
            [userId]
        );
        const authorName =
            String(authorRows[0]?.name || '').trim() || String(authorRows[0]?.username || 'Someone');

        await connection.commit();
        connection.release();
        connectionReleased = true;

        try {
            await notifyParticipantsOnReply({
                threadId,
                threadTitle: thread.title,
                messageId,
                replierUserId: userId,
                replierName: authorName,
                replyBody: trimmedBody,
            });
        } catch (notifyError) {
            const notifyMessage = notifyError instanceof Error ? notifyError.message : 'Unknown error';
            logEvents(`notifyParticipantsOnReply error: ${notifyMessage}`, 'communicationsLog.log');
        }

        try {
            await resolveMentionAlertsAfterReply(threadId, userId);
        } catch (resolveError) {
            const resolveMessage = resolveError instanceof Error ? resolveError.message : 'Unknown error';
            logEvents(`resolveMentionAlertsAfterReply error: ${resolveMessage}`, 'communicationsLog.log');
        }

        if (messageId && mentionedUserIds.length) {
            try {
                await notifyMentionedUsers({
                    threadId,
                    threadTitle: thread.title,
                    messageId,
                    authorUserId: userId,
                    authorName,
                    mentionedUserIds,
                    previewBody: trimmedBody,
                });
            } catch (notifyError) {
                const notifyMessage = notifyError instanceof Error ? notifyError.message : 'Unknown error';
                logEvents(`notifyMentionedUsers error: ${notifyMessage}`, 'communicationsLog.log');
            }
        }

        res.status(200).json({ message: 'Reply posted', threadId, messageId });
    } catch (error) {
        await connection.rollback();
        const message = error instanceof Error ? error.message : 'Unknown error';
        logEvents(`replyToCommunicationThread error: ${message}`, 'communicationsLog.log');
        res.status(500).json({ error: 'Internal Server Error', message });
    } finally {
        if (!connectionReleased) {
            connection.release();
        }
    }
};

export const concludeCommunicationThread = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await ensureCommunicationsSchema();
        await ensureReplyAlertsTable();
        const userId = req.userId;
        const threadId = Number(req.params.id);
        if (!userId || !threadId) {
            res.status(400).json({ error: 'Bad Request', message: 'Invalid request' });
            return;
        }

        const { conclusion } = req.body as { conclusion?: string };
        const trimmedConclusion = String(conclusion || '').trim();
        if (!trimmedConclusion) {
            res.status(400).json({ error: 'Bad Request', message: 'Conclusion / solution is required' });
            return;
        }

        const thread = await fetchThreadSummary(threadId, userId);
        if (!thread) {
            res.status(404).json({ error: 'Not Found', message: 'Thread not found' });
            return;
        }
        if (!ACTIVE_STATUSES.includes(thread.status)) {
            res.status(409).json({ error: 'Conflict', message: 'This matter is already closed' });
            return;
        }

        const isSender = Number(thread.created_by) === userId;
        if (!isSender && !hasPermission(req, 'can_close_all_messages')) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'Only the original sender or users with close permission can close this matter',
            });
            return;
        }

        await connection.beginTransaction();
        await connection.execute(
            `UPDATE communication_threads
             SET status = 'resolved',
                 conclusion = ?,
                 concluded_by = ?,
                 concluded_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [trimmedConclusion, userId, threadId]
        );
        await connection.execute(
            `INSERT INTO communication_messages
             (thread_id, user_id, body, message_type)
             VALUES (?, ?, ?, 'conclusion')`,
            [threadId, userId, trimmedConclusion]
        );
        await connection.commit();

        res.status(200).json({ message: 'Matter closed with conclusion', threadId });
    } catch (error) {
        await connection.rollback();
        const message = error instanceof Error ? error.message : 'Unknown error';
        logEvents(`concludeCommunicationThread error: ${message}`, 'communicationsLog.log');
        res.status(500).json({ error: 'Internal Server Error', message });
    } finally {
        connection.release();
    }
};

export const assignCommunicationThread = async (req: Request, res: Response): Promise<void> => {
    try {
        await ensureCommunicationsSchema();
        await ensureReplyAlertsTable();
        const userId = req.userId;
        const threadId = Number(req.params.id);
        if (!userId || !threadId) {
            res.status(400).json({ error: 'Bad Request', message: 'Invalid request' });
            return;
        }
        if (!hasPermission(req, 'can_assign_tasks')) {
            res.status(403).json({ error: 'Forbidden', message: 'You do not have permission to assign tasks' });
            return;
        }

        const { assigneeUserId } = req.body as { assigneeUserId?: number };
        const assigneeId = Number(assigneeUserId);
        if (!assigneeId) {
            res.status(400).json({ error: 'Bad Request', message: 'Assignee user is required' });
            return;
        }

        const thread = await fetchThreadSummary(threadId);
        if (!thread) {
            res.status(404).json({ error: 'Not Found', message: 'Thread not found' });
            return;
        }
        if (!ACTIVE_STATUSES.includes(thread.status)) {
            res.status(409).json({ error: 'Conflict', message: 'Cannot assign a closed matter' });
            return;
        }

        const [userRows] = await pool.query<RowDataPacket[]>(
            `SELECT id FROM users WHERE id = ? AND ${ACTIVE_USER_STATUS_SQL} LIMIT 1`,
            [assigneeId]
        );
        if (!userRows.length) {
            res.status(404).json({ error: 'Not Found', message: 'Assignee user not found or inactive' });
            return;
        }

        await pool.execute(
            `UPDATE communication_threads
             SET assigned_to = ?,
                 assigned_by = ?,
                 assigned_at = CURRENT_TIMESTAMP,
                 status = 'in_progress',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [assigneeId, userId, threadId]
        );

        res.status(200).json({ message: 'Task assigned', threadId, assigneeUserId: assigneeId });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logEvents(`assignCommunicationThread error: ${message}`, 'communicationsLog.log');
        res.status(500).json({ error: 'Internal Server Error', message });
    }
};

export const listCommunicationAssignees = async (req: Request, res: Response): Promise<void> => {
    try {
        await ensureCommunicationsSchema();
        if (!hasPermission(req, 'can_assign_tasks')) {
            res.status(403).json({ error: 'Forbidden', message: 'You do not have permission to assign tasks' });
            return;
        }

        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT id, username, first_name, last_name, staffid, designation
             FROM users
             WHERE ${ACTIVE_USER_STATUS_SQL}
             ORDER BY first_name ASC, last_name ASC, username ASC`
        );

        res.status(200).json(
            rows.map((row) => ({
                id: row.id,
                username: row.username,
                name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.username,
                staffId: row.staffid,
                designation: row.designation,
            }))
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logEvents(`listCommunicationAssignees error: ${message}`, 'communicationsLog.log');
        res.status(500).json({ error: 'Internal Server Error', message });
    }
};

export const getActiveThreadCount = async (req: Request, res: Response): Promise<void> => {
    try {
        await ensureCommunicationsSchema();
        await ensureMentionsTable();
        await ensureMentionAlertsTable();
        const userId = req.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
            return;
        }
        const count = await getActiveThreadCountForUser(userId);
        res.status(200).json({ count });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logEvents(`getActiveThreadCount error: ${message}`, 'communicationsLog.log');
        res.status(500).json({ error: 'Internal Server Error', message });
    }
};

export const listMentionableUsers = async (req: Request, res: Response): Promise<void> => {
    try {
        await ensureCommunicationsSchema();
        const userId = req.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
            return;
        }
        const q = String(req.query.q || '');
        const users = await searchMentionableUsers(q);
        res.status(200).json(users);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logEvents(`listMentionableUsers error: ${message}`, 'communicationsLog.log');
        res.status(500).json({ error: 'Internal Server Error', message });
    }
};

export const deleteCommunicationThread = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await ensureCommunicationsSchema();
        await ensureReplyAlertsTable();
        await ensureMentionsTable();
        await ensureMentionAlertsTable();

        const threadId = Number(req.params.id);
        if (!threadId) {
            res.status(400).json({ error: 'Bad Request', message: 'Invalid thread id' });
            return;
        }
        if (!hasPermission(req, 'can_delete_conversations')) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'You do not have permission to delete conversations',
            });
            return;
        }

        const thread = await fetchThreadSummary(threadId);
        if (!thread) {
            res.status(404).json({ error: 'Not Found', message: 'Thread not found' });
            return;
        }

        await connection.beginTransaction();

        const purgeResult = await purgeCommunicationThread(connection, threadId);
        const [result] = await connection.execute<ResultSetHeader>(
            `DELETE FROM communication_threads WHERE id = ?`,
            [threadId]
        );

        if (result.affectedRows === 0) {
            await connection.rollback();
            res.status(404).json({ error: 'Not Found', message: 'Thread not found' });
            return;
        }

        await connection.commit();
        logEvents(
            `Communication thread ${threadId} deleted by user ${req.userId ?? 'unknown'} ` +
            `(notifications=${purgeResult.notificationsDeleted}, mentionAlerts=${purgeResult.mentionAlertsDeleted}, ` +
            `replyAlerts=${purgeResult.replyAlertsDeleted})`,
            'communicationsLog.log'
        );
        res.status(200).json({
            message: 'Conversation deleted',
            threadId,
            purge: purgeResult,
        });
    } catch (error) {
        await connection.rollback();
        const message = error instanceof Error ? error.message : 'Unknown error';
        logEvents(`deleteCommunicationThread error: ${message}`, 'communicationsLog.log');
        res.status(500).json({ error: 'Internal Server Error', message });
    } finally {
        connection.release();
    }
};
