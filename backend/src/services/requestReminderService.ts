import pool from '../config/db';
import { logEvents } from '../middlewares/logger';
import { sendMail, renderEmailTemplate } from './mailer';
import { RowDataPacket } from 'mysql2';
interface RequestEmailSettings extends RowDataPacket {
    id: number;
    send_enabled: number;
    reminders_enabled: number;
    reminder_days: number;
    include_pdf: number;
    mail_sending_enabled: number;
    from_email?: string | null;
    smtp_user?: string | null;
    smtp_pass?: string | null;
    reminder_interval_min?: number | null;
}
interface RequestEmailRecipient extends RowDataPacket {
    email: string;
    role: 'to' | 'cc' | 'bcc';
    send_on_reminder: number;
    allow_reminder: number;
    is_active: number;
}
interface PendingItem extends RowDataPacket {
    id: number;
    request_number: string;
    request_date: Date;
    part_number: string;
    item_name: string;
    unit: string;
    requested_quantity: number;
    equipment_number: string;
    remarks: string;
    requested_by: string;
    requested_by_email: string | null;
    reminder_no?: number | null;
}
interface UrgentPendingItem extends RowDataPacket {
    id: number;
    request_number: string;
    part_number: string;
    item_name: string;
    unit: string;
    requested_quantity: number;
    equipment_number: string;
    remarks: string;
    requested_by: string;
    requested_by_email: string | null;
    reminder_no?: number | null;
}
const isGmailEmail = (email: string | null | undefined) => {
    if (!email) return false;
    const e = String(email).trim().toLowerCase();
    return e.endsWith('@gmail.com') || e.endsWith('@googlemail.com');
};
const buildRecipientLists = (recipients: RequestEmailRecipient[], requestedByEmail?: string | null) => {
    const to: string[] = [];
    const cc: string[] = [];
    const bcc: string[] = [];
    recipients
        .filter(r => r.is_active === 1 && r.send_on_reminder === 1 && r.allow_reminder === 1)
        .forEach(r => {
        if (isGmailEmail(r.email)) return;
        if (r.role === 'to') to.push(r.email);
        else if (r.role === 'cc') cc.push(r.email);
        else bcc.push(r.email);
    });
    const requestedEmail = requestedByEmail ? String(requestedByEmail).trim() : null;
    if (requestedEmail && !isGmailEmail(requestedEmail) && !cc.includes(requestedEmail)) cc.push(requestedEmail);
    return { to, cc, bcc };
};
const ensureReminderNoColumn = async (): Promise<void> => {
    const [columnRows] = await pool.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'request_item_reminders'
           AND COLUMN_NAME = 'reminder_no'`
    );
    if (!columnRows.length) {
        await pool.query(`ALTER TABLE request_item_reminders ADD COLUMN reminder_no INT NOT NULL DEFAULT 0`);
        return;
    }
};
export const runRequestReminderCycle = async (): Promise<void> => {
    try {
        const [settingsRows] = await pool.query<RequestEmailSettings[]>(`SELECT * FROM request_email_settings ORDER BY id LIMIT 1`);
        const settings = settingsRows[0];
        if (!settings) {
            await logEvents('Reminder cycle skipped - no email settings row found', 'mailLog.log');
            return;
        }
        if (!settings.mail_sending_enabled || !settings.reminders_enabled) {
            await logEvents('Reminder cycle skipped - mail_sending_enabled or reminders_enabled is disabled', 'mailLog.log');
            return;
        }
        const [recipientRows] = await pool.query<RequestEmailRecipient[]>(`SELECT * FROM request_email_recipients WHERE is_active = 1`);
        await ensureReminderNoColumn();
        const [pendingItems] = await pool.query<PendingItem[]>(`
      SELECT rd.id, rd.request_number, rd.request_date, rd.part_number, rd.item_name, rd.unit,
             rd.requested_quantity, rd.equipment_number, rd.remarks, rd.requested_by, rd.requested_by_email,
             rir.last_sent_at, rir.reminder_no, rd.reference_document_uploaded_date
      FROM request_details rd
      LEFT JOIN request_item_reminders rir ON rir.request_detail_id = rd.id
      WHERE rd.approval_status = 'APPROVED'
        AND (rd.is_received = 0 OR rd.receive_fk IS NULL)
        AND rd.reference_document_uploaded_date IS NOT NULL
        AND DATEDIFF(NOW(), COALESCE(rir.last_sent_at, rd.reference_document_uploaded_date)) >= ?
      `, [settings.reminder_days]);
        if (!pendingItems.length) {
            await logEvents('Reminder cycle: no pending items matched reminder criteria', 'mailLog.log');
            return;
        }
        for (const item of pendingItems) {
            const requestedByEmail = item.requested_by_email || (item.requested_by?.includes('@') ? item.requested_by : null);
            const { to, cc, bcc } = buildRecipientLists(recipientRows, requestedByEmail);
            if (to.length === 0 && cc.length === 0 && bcc.length === 0) continue;

            const currentReminderNo = Number(item.reminder_no ?? 0);
            const nextReminderNo = currentReminderNo + 1;

            const connection = await pool.getConnection();
            try {
                await connection.beginTransaction();
                await connection.query(
                    `INSERT INTO request_item_reminders (request_detail_id, last_sent_at, reminder_no)
                     VALUES (?, NOW(), ?)
                     ON DUPLICATE KEY UPDATE last_sent_at = NOW(), reminder_no = ?`,
                    [item.id, nextReminderNo, nextReminderNo]
                );

                const body = [
                    `<p>Dear Sir/Ma'am,</p>`,
                    `<p>This item was requested earlier but has not yet been received by the Inventory Section. Kindly proceed with the necessary purchase at your earliest convenience.</p>`,
                    `<p><strong>Reference Number:</strong> ${item.request_number}</p>`,
                    `<p><strong>Reminder Number:</strong> ${nextReminderNo}</p>`,
                    `<ul style="padding-left:18px;margin:12px 0;color:#374151;font-size:14px;">`,
                    `<li>${item.item_name} (Part: ${item.part_number}) — Qty: ${item.requested_quantity} ${item.unit}${item.equipment_number ? ` — Equip: ${item.equipment_number}` : ''}</li>`,
                    `</ul>`,
                ].join('');

                const html = renderEmailTemplate({
                    title: 'Purchase Reminder',
                    subtitle: `${item.request_number} · Reminder #${nextReminderNo}`,
                    body,
                    buttonLabel: 'View Request',
                    buttonUrl: (process.env.NEXTAUTH_URL || process.env.APP_BASE_URL || 'http://192.168.1.254:3000') + `/request/${item.request_number}`,
                });
                await sendMail({
                    from: settings.from_email || process.env.SMTP_USER || 'noreply@nac.com.np',
                    to: to.join(','),
                    cc: cc.join(','),
                    bcc: bcc.join(','),
                    subject: `Reminder #${nextReminderNo}: Items pending purchase for Request ${item.request_number}`,
                    html,
                }, {
                    user: settings.from_email || undefined,
                    pass: settings.smtp_pass ?? undefined,
                });
                await connection.commit();
            } catch (err) {
                await connection.rollback();
                await logEvents(`Reminder send failed for request_detail_id=${item.id}: ${err instanceof Error ? err.message : String(err)}`, 'mailLog.log');
            } finally {
                connection.release();
            }
        }
    }
    catch (error) {
        await logEvents(`Reminder cycle error: ${error instanceof Error ? error.message : String(error)}`, 'mailLog.log');
    }
};

export const sendUrgentRequestReminder = async (requestDetailId: number): Promise<{
    sent: boolean;
    reminderNo?: number;
    request_number?: string;
    skippedReason?: string;
}> => {
    const connection = await pool.getConnection();
    try {
        const [settingsRows] = await pool.query<RequestEmailSettings[]>(
            `SELECT * FROM request_email_settings ORDER BY id LIMIT 1`
        );
        const settings = settingsRows[0];
        if (!settings) {
            await logEvents('Urgent reminder skipped - no email settings row found', 'mailLog.log');
            return { sent: false, skippedReason: 'Email settings missing' };
        }
        if (!settings.mail_sending_enabled || !settings.reminders_enabled) {
            await logEvents('Urgent reminder skipped - mail_sending_enabled or reminders_enabled is disabled', 'mailLog.log');
            return { sent: false, skippedReason: 'Reminders disabled' };
        }

        const [recipientRows] = await pool.query<RequestEmailRecipient[]>(
            `SELECT * FROM request_email_recipients WHERE is_active = 1`
        );
        await ensureReminderNoColumn();

        const [items] = await pool.query<UrgentPendingItem[]>(
            `SELECT rd.id, rd.request_number, rd.part_number, rd.item_name, rd.unit,
                    rd.requested_quantity, rd.equipment_number, rd.remarks, rd.requested_by, rd.requested_by_email,
                    rir.reminder_no
             FROM request_details rd
             LEFT JOIN request_item_reminders rir ON rir.request_detail_id = rd.id
             WHERE rd.id = ?
               AND rd.approval_status = 'APPROVED'
               AND (rd.is_received = 0 OR rd.receive_fk IS NULL)
             LIMIT 1`,
            [requestDetailId]
        );

        const item = items[0];
        if (!item) return { sent: false, skippedReason: 'Item not eligible for reminder' };

        const requestedByEmail =
            item.requested_by_email || (item.requested_by?.includes('@') ? item.requested_by : null);

        const { to, cc, bcc } = buildRecipientLists(recipientRows, requestedByEmail);
        if (to.length === 0 && cc.length === 0 && bcc.length === 0) {
            return { sent: false, skippedReason: 'No eligible recipients (gmail excluded)' };
        }

        const currentReminderNo = Number(item.reminder_no ?? 0);
        const nextReminderNo = currentReminderNo + 1;

        await connection.beginTransaction();
        try {
            await connection.query(
                `INSERT INTO request_item_reminders (request_detail_id, last_sent_at, reminder_no)
                 VALUES (?, NOW(), ?)
                 ON DUPLICATE KEY UPDATE last_sent_at = NOW(), reminder_no = ?`,
                [item.id, nextReminderNo, nextReminderNo]
            );

            const body = [
                `<p style="color:#d2293b;font-weight:700;">URGENT</p>`,
                `<p>Dear Sir/Ma'am,</p>`,
                `<p>This item was requested earlier but has not yet been received by the Inventory Section. Kindly proceed with the necessary purchase as soon as possible.</p>`,
                `<p><strong>Reference Number:</strong> ${item.request_number}</p>`,
                `<p><strong>Reminder Number:</strong> ${nextReminderNo}</p>`,
                `<ul style="padding-left:18px;margin:12px 0;color:#374151;font-size:14px;">`,
                `<li>${item.item_name} (Part: ${item.part_number}) — Qty: ${item.requested_quantity} ${item.unit}${item.equipment_number ? ` — Equip: ${item.equipment_number}` : ''}</li>`,
                `</ul>`,
            ].join('');

            const html = renderEmailTemplate({
                title: 'URGENT Purchase Reminder',
                subtitle: `${item.request_number} · URGENT Reminder #${nextReminderNo}`,
                body,
                buttonLabel: 'View Request',
                buttonUrl: (process.env.NEXTAUTH_URL || process.env.APP_BASE_URL || 'http://192.168.1.254:3000') + `/request/${item.request_number}`,
            });

            await sendMail({
                from: settings.from_email || process.env.SMTP_USER || 'noreply@nac.com.np',
                to: to.join(','),
                cc: cc.join(','),
                bcc: bcc.join(','),
                subject: `URGENT Reminder #${nextReminderNo}: Items pending purchase for Request ${item.request_number}`,
                html,
            }, {
                user: settings.from_email || undefined,
                pass: settings.smtp_pass ?? undefined,
            });

            await connection.commit();
            return { sent: true, reminderNo: nextReminderNo, request_number: item.request_number };
        } catch (err) {
            await connection.rollback();
            await logEvents(
                `Urgent reminder send failed for request_detail_id=${requestDetailId}: ${err instanceof Error ? err.message : String(err)}`,
                'mailLog.log'
            );
            return { sent: false, skippedReason: 'Urgent reminder failed' };
        }
    } catch (error) {
        await logEvents(
            `Urgent reminder cycle error: ${error instanceof Error ? error.message : String(error)}`,
            'mailLog.log'
        );
        return { sent: false, skippedReason: 'Urgent reminder error' };
    } finally {
        connection.release();
    }
};
export const startRequestReminderWorker = () => {
    const initWorker = async () => {
        let intervalMin = parseInt(process.env.REQUEST_REMINDER_INTERVAL_MIN || '30', 10);
        try {
            const [settingsRows] = await pool.query<RequestEmailSettings[]>(`SELECT reminder_interval_min FROM request_email_settings ORDER BY id LIMIT 1`);
            if (settingsRows[0] && settingsRows[0].reminder_interval_min && settingsRows[0].reminder_interval_min > 0) {
                intervalMin = settingsRows[0].reminder_interval_min;
            }
        }
        catch (error) {
            await logEvents(`Reminder worker: failed to read reminder_interval_min from settings, using default. Error: ${error instanceof Error ? error.message : String(error)}`, 'mailLog.log');
        }
        const intervalMs = Math.max(intervalMin, 5) * 60 * 1000;
        setInterval(() => {
            runRequestReminderCycle();
        }, intervalMs);
        await logEvents(`Request reminder worker started (every ${intervalMs / 60000} min)`, 'mailLog.log');
    };
    initWorker();
};
