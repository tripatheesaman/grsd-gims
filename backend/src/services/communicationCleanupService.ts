import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { ensureCommunicationsSchema } from './communicationsSchema';
import { ensureReplyAlertsTable } from './communicationNotificationService';
import { ensureMentionAlertsTable, ensureMentionsTable } from './communicationMentionService';

export interface CommunicationThreadPurgeResult {
    notificationsDeleted: number;
    mentionAlertsDeleted: number;
    replyAlertsDeleted: number;
    mentionsDeleted: number;
    acknowledgementsDeleted: number;
    messagesDeleted: number;
}

const COMMUNICATION_REFERENCE_TYPES = ['communication', 'communications'] as const;

async function deleteCommunicationNotifications(
    connection: PoolConnection,
    threadId: number,
    messageIds: number[]
): Promise<number> {
    const referenceIds = [
        ...new Set([
            String(threadId),
            String(Number(threadId)),
            ...messageIds.map((id) => String(id)),
        ]),
    ].filter(Boolean);

    if (referenceIds.length === 0) {
        return 0;
    }

    const typePlaceholders = COMMUNICATION_REFERENCE_TYPES.map(() => '?').join(', ');
    const refPlaceholders = referenceIds.map(() => '?').join(', ');

    const [result] = await connection.execute<ResultSetHeader>(
        `DELETE FROM notifications
         WHERE reference_type IN (${typePlaceholders})
           AND CAST(reference_id AS CHAR) IN (${refPlaceholders})`,
        [...COMMUNICATION_REFERENCE_TYPES, ...referenceIds]
    );

    return result.affectedRows;
}

async function deleteAlertsForThread(
    connection: PoolConnection,
    table: 'communication_mention_alerts' | 'communication_reply_alerts',
    threadId: number,
    messageIds: number[]
): Promise<number> {
    const [byThread] = await connection.execute<ResultSetHeader>(
        `DELETE FROM ${table} WHERE thread_id = ?`,
        [threadId]
    );

    if (messageIds.length === 0) {
        return byThread.affectedRows;
    }

    const placeholders = messageIds.map(() => '?').join(', ');
    const [byMessage] = await connection.execute<ResultSetHeader>(
        `DELETE FROM ${table} WHERE message_id IN (${placeholders})`,
        messageIds
    );

    return byThread.affectedRows + byMessage.affectedRows;
}

export async function purgeCommunicationThread(
    connection: PoolConnection,
    threadId: number
): Promise<CommunicationThreadPurgeResult> {
    await ensureCommunicationsSchema();
    await ensureReplyAlertsTable();
    await ensureMentionsTable();
    await ensureMentionAlertsTable();

    const [messageRows] = await connection.query<RowDataPacket[]>(
        `SELECT id FROM communication_messages WHERE thread_id = ?`,
        [threadId]
    );
    const messageIds = messageRows
        .map((row) => Number(row.id))
        .filter((id) => Number.isFinite(id) && id > 0);

    const notificationsDeleted = await deleteCommunicationNotifications(
        connection,
        threadId,
        messageIds
    );
    const mentionAlertsDeleted = await deleteAlertsForThread(
        connection,
        'communication_mention_alerts',
        threadId,
        messageIds
    );
    const replyAlertsDeleted = await deleteAlertsForThread(
        connection,
        'communication_reply_alerts',
        threadId,
        messageIds
    );

    const [mentionsResult] = await connection.execute<ResultSetHeader>(
        `DELETE cm FROM communication_mentions cm
         INNER JOIN communication_messages m ON m.id = cm.message_id
         WHERE m.thread_id = ?`,
        [threadId]
    );
    const [ackResult] = await connection.execute<ResultSetHeader>(
        `DELETE FROM communication_acknowledgements WHERE thread_id = ?`,
        [threadId]
    );
    const [messagesResult] = await connection.execute<ResultSetHeader>(
        `DELETE FROM communication_messages WHERE thread_id = ?`,
        [threadId]
    );

    return {
        notificationsDeleted,
        mentionAlertsDeleted,
        replyAlertsDeleted,
        mentionsDeleted: mentionsResult.affectedRows,
        acknowledgementsDeleted: ackResult.affectedRows,
        messagesDeleted: messagesResult.affectedRows,
    };
}
