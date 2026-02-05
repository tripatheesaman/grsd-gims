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
}
const groupByRequest = (items: PendingItem[]) => {
    const map = new Map<string, PendingItem[]>();
    for (const item of items) {
        if (!map.has(item.request_number))
            map.set(item.request_number, []);
        map.get(item.request_number)?.push(item);
    }
    return map;
};
const buildRecipientLists = (recipients: RequestEmailRecipient[], requestedByEmail?: string | null) => {
    const to: string[] = [];
    const cc: string[] = [];
    const bcc: string[] = [];
    recipients
        .filter(r => r.is_active === 1 && r.send_on_reminder === 1 && r.allow_reminder === 1)
        .forEach(r => {
        if (r.role === 'to')
            to.push(r.email);
        else if (r.role === 'cc')
            cc.push(r.email);
        else
            bcc.push(r.email);
    });
    if (requestedByEmail && !cc.includes(requestedByEmail))
        cc.push(requestedByEmail);
    return { to, cc, bcc };
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
        const [pendingItems] = await pool.query<PendingItem[]>(`
      SELECT rd.id, rd.request_number, rd.request_date, rd.part_number, rd.item_name, rd.unit,
             rd.requested_quantity, rd.equipment_number, rd.remarks, rd.requested_by, rd.requested_by_email,
             rir.last_sent_at, rd.reference_document_uploaded_date
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
        const grouped = groupByRequest(pendingItems);
        for (const [requestNumber, items] of grouped.entries()) {
            const requestedByEmails = new Set<string>();
            for (const item of items) {
                const email = item.requested_by_email || (item.requested_by?.includes('@') ? item.requested_by : null);
                if (email) {
                    requestedByEmails.add(email);
                }
            }
            const requestedByEmailArray = Array.from(requestedByEmails);
            const primaryRequestedByEmail = requestedByEmailArray.length > 0 ? requestedByEmailArray[0] : null;
            const { to, cc, bcc } = buildRecipientLists(recipientRows, primaryRequestedByEmail);
            if (requestedByEmailArray.length > 1) {
                requestedByEmailArray.slice(1).forEach(email => {
                    if (!cc.includes(email) && !to.includes(email) && !bcc.includes(email)) {
                        cc.push(email);
                    }
                });
            }
            if (to.length === 0 && cc.length === 0 && bcc.length === 0)
                continue;
            const body = [
                `<p>Dear Sir/Ma'am,</p>`,
                `<p>The following items were requested earlier but have not yet been received by the Inventory Section. Kindly proceed with the necessary purchase at your earliest convenience.</p>`,
                `<p><strong>Reference Number:</strong> ${requestNumber}</p>`,
                `<ol style="padding-left:18px;margin:12px 0;color:#374151;font-size:14px;">` +
                    items
                        .map((item, idx) => `<li>${idx + 1}. ${item.item_name} (Part: ${item.part_number}) — Qty: ${item.requested_quantity} ${item.unit}${item.equipment_number ? ` — Equip: ${item.equipment_number}` : ''}</li>`)
                        .join('') +
                    `</ol>`,
            ].join('');
            const html = renderEmailTemplate({
                title: 'Purchase Reminder',
                subtitle: requestNumber,
                body,
                buttonLabel: 'View Request',
                buttonUrl: (process.env.NEXTAUTH_URL || process.env.APP_BASE_URL || 'http://192.168.1.254:3000') + `/request/${requestNumber}`,
            });
            await sendMail({
                from: settings.from_email || process.env.SMTP_USER || 'noreply@nac.com.np',
                to: to.join(','),
                cc: cc.join(','),
                bcc: bcc.join(','),
                subject: `Reminder: Items pending purchase for Request ${requestNumber}`,
                html,
            }, {
                user: settings.from_email || undefined,
                pass: settings.smtp_pass ?? undefined,
            });
            const ids = items.map(i => i.id);
            await pool.query(`INSERT INTO request_item_reminders (request_detail_id, last_sent_at)
         VALUES ${ids.map(() => '(?, NOW())').join(',')}
         ON DUPLICATE KEY UPDATE last_sent_at = NOW()`, ids);
        }
    }
    catch (error) {
        await logEvents(`Reminder cycle error: ${error instanceof Error ? error.message : String(error)}`, 'mailLog.log');
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
