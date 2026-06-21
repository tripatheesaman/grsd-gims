import pool from '../config/db';

let ensured = false;

export const ensureCommunicationsSchema = async (): Promise<void> => {
    if (ensured) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS communication_threads (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(500) NOT NULL,
            status ENUM('open', 'in_progress', 'resolved', 'closed') NOT NULL DEFAULT 'open',
            created_by INT NOT NULL,
            assigned_to INT NULL,
            assigned_by INT NULL,
            assigned_at DATETIME NULL,
            conclusion TEXT NULL,
            concluded_by INT NULL,
            concluded_at DATETIME NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_comm_threads_status (status),
            KEY idx_comm_threads_created_by (created_by),
            KEY idx_comm_threads_assigned_to (assigned_to)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS communication_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            thread_id INT NOT NULL,
            user_id INT NOT NULL,
            body TEXT NOT NULL,
            attachment_path VARCHAR(500) NULL,
            attachment_name VARCHAR(255) NULL,
            message_type ENUM('initial', 'reply', 'conclusion') NOT NULL DEFAULT 'reply',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_comm_messages_thread (thread_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS communication_acknowledgements (
            id INT AUTO_INCREMENT PRIMARY KEY,
            thread_id INT NOT NULL,
            user_id INT NOT NULL,
            acknowledged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_comm_ack_thread_user (thread_id, user_id),
            KEY idx_comm_ack_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

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

    await pool.query(`
        CREATE TABLE IF NOT EXISTS communication_mention_alerts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            thread_id INT NOT NULL,
            recipient_user_id INT NOT NULL,
            message_id INT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            dismissed_at DATETIME NULL,
            KEY idx_comm_mention_alerts_recipient (recipient_user_id, dismissed_at),
            KEY idx_comm_mention_alerts_thread (thread_id),
            KEY idx_comm_mention_alerts_message (message_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const permissionSeeds = [
        { name: 'can_access_communications', readable: 'Access Communications', type: 'communications' },
        { name: 'can_send_communications', readable: 'Send Communications', type: 'communications' },
        { name: 'can_assign_tasks', readable: 'Assign Communication Tasks', type: 'communications' },
        { name: 'can_close_all_messages', readable: 'Close Any Communication', type: 'communications' },
    ];

    const [permRows] = await pool.query<any[]>(
        `SELECT permission_name FROM user_permissions WHERE permission_name IN (${permissionSeeds.map(() => '?').join(',')})`,
        permissionSeeds.map((p) => p.name)
    );
    const existing = new Set((permRows as any[]).map((r) => String(r.permission_name)));
    const [maxRow] = await pool.query<any[]>('SELECT COALESCE(MAX(id), 0) AS maxId FROM user_permissions');
    let nextId = Number((maxRow as any[])[0]?.maxId || 0) + 1;

    for (const seed of permissionSeeds) {
        if (!existing.has(seed.name)) {
            await pool.query(
                `INSERT INTO user_permissions (id, permission_name, permission_readable, permission_type, allowed_user_ids)
                 VALUES (?, ?, ?, ?, '')`,
                [nextId++, seed.name, seed.readable, seed.type]
            );
        } else {
            await pool.query(
                `UPDATE user_permissions SET permission_readable = ? WHERE permission_name = ?`,
                [seed.readable, seed.name]
            );
        }
    }

    ensured = true;
};
