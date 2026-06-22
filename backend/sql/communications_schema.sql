-- GIMS Communications System — run manually against your application database.
-- Creates tables + permission seeds for in-app messaging with acknowledgements and task assignment.

-- ---------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------

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
    KEY idx_comm_threads_assigned_to (assigned_to),
    CONSTRAINT fk_comm_threads_created_by FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_comm_threads_assigned_to FOREIGN KEY (assigned_to) REFERENCES users(id),
    CONSTRAINT fk_comm_threads_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id),
    CONSTRAINT fk_comm_threads_concluded_by FOREIGN KEY (concluded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS communication_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    thread_id INT NOT NULL,
    user_id INT NOT NULL,
    body TEXT NOT NULL,
    attachment_path VARCHAR(500) NULL,
    attachment_name VARCHAR(255) NULL,
    message_type ENUM('initial', 'reply', 'conclusion') NOT NULL DEFAULT 'reply',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_comm_messages_thread (thread_id),
    CONSTRAINT fk_comm_messages_thread FOREIGN KEY (thread_id) REFERENCES communication_threads(id) ON DELETE CASCADE,
    CONSTRAINT fk_comm_messages_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS communication_acknowledgements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    thread_id INT NOT NULL,
    user_id INT NOT NULL,
    acknowledged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_comm_ack_thread_user (thread_id, user_id),
    KEY idx_comm_ack_user (user_id),
    CONSTRAINT fk_comm_ack_thread FOREIGN KEY (thread_id) REFERENCES communication_threads(id) ON DELETE CASCADE,
    CONSTRAINT fk_comm_ack_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS communication_reply_alerts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    thread_id INT NOT NULL,
    recipient_user_id INT NOT NULL,
    message_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dismissed_at DATETIME NULL,
    KEY idx_comm_reply_alerts_recipient (recipient_user_id, dismissed_at),
    KEY idx_comm_reply_alerts_thread (thread_id),
    CONSTRAINT fk_comm_reply_alerts_thread FOREIGN KEY (thread_id) REFERENCES communication_threads(id) ON DELETE CASCADE,
    CONSTRAINT fk_comm_reply_alerts_message FOREIGN KEY (message_id) REFERENCES communication_messages(id) ON DELETE CASCADE,
    CONSTRAINT fk_comm_reply_alerts_user FOREIGN KEY (recipient_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS communication_mentions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    user_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_comm_mention_message_user (message_id, user_id),
    KEY idx_comm_mentions_user (user_id),
    KEY idx_comm_mentions_message (message_id),
    CONSTRAINT fk_comm_mentions_message FOREIGN KEY (message_id) REFERENCES communication_messages(id) ON DELETE CASCADE,
    CONSTRAINT fk_comm_mentions_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
    KEY idx_comm_mention_alerts_message (message_id),
    CONSTRAINT fk_comm_mention_alerts_thread FOREIGN KEY (thread_id) REFERENCES communication_threads(id) ON DELETE CASCADE,
    CONSTRAINT fk_comm_mention_alerts_message FOREIGN KEY (message_id) REFERENCES communication_messages(id) ON DELETE CASCADE,
    CONSTRAINT fk_comm_mention_alerts_user FOREIGN KEY (recipient_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Upgrade existing installs (safe to re-run; ignore duplicate-column errors)
ALTER TABLE communication_mention_alerts ADD COLUMN acknowledged_at DATETIME NULL;
ALTER TABLE communication_mention_alerts ADD COLUMN responded_at DATETIME NULL;
ALTER TABLE communication_mention_alerts ADD COLUMN snoozed_until DATETIME NULL;
ALTER TABLE communication_mention_alerts ADD COLUMN remind_on_login TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE communication_mention_alerts ADD COLUMN last_reminded_at DATETIME NULL;

-- ---------------------------------------------------------------------------
-- 2) Permissions
-- ---------------------------------------------------------------------------

INSERT INTO user_permissions (id, permission_name, permission_readable, permission_type, allowed_user_ids)
SELECT * FROM (
    SELECT 9101 AS id, 'can_access_communications' AS permission_name,
           'Access Communications' AS permission_readable, 'communications' AS permission_type, '' AS allowed_user_ids
    UNION ALL SELECT 9102, 'can_send_communications', 'Send Communications', 'communications', ''
    UNION ALL SELECT 9103, 'can_assign_tasks', 'Assign Communication Tasks', 'communications', ''
    UNION ALL SELECT 9104, 'can_close_all_messages', 'Close Any Communication', 'communications', ''
    UNION ALL SELECT 9105, 'can_delete_conversations', 'Delete Communications', 'communications', ''
    UNION ALL SELECT 9106, 'can_bypass_acknowledgements', 'Bypass Communication Acknowledgements', 'communications', ''
) AS seed
WHERE NOT EXISTS (
    SELECT 1 FROM user_permissions up WHERE up.permission_name = seed.permission_name
);

-- Grant all communications permissions to SuperAdmin users (adjust role name if needed)
UPDATE user_permissions dst
SET dst.allowed_user_ids = TRIM(BOTH ',' FROM CONCAT_WS(',', NULLIF(dst.allowed_user_ids, ''), (
    SELECT GROUP_CONCAT(u.id ORDER BY u.id)
    FROM users u
    WHERE LOWER(u.role) = 'superadmin'
)))
WHERE dst.permission_name IN (
    'can_access_communications',
    'can_send_communications',
    'can_assign_tasks',
    'can_close_all_messages',
    'can_delete_conversations',
    'can_bypass_acknowledgements'
);

-- Optional: grant access + send to all active users
-- UPDATE user_permissions
-- SET allowed_user_ids = (SELECT GROUP_CONCAT(id) FROM users WHERE status = 'active')
-- WHERE permission_name IN ('can_access_communications', 'can_send_communications');

-- ---------------------------------------------------------------------------
-- 3) Verify
-- ---------------------------------------------------------------------------
SELECT permission_name, permission_readable, allowed_user_ids
FROM user_permissions
WHERE permission_type = 'communications'
ORDER BY permission_name;
