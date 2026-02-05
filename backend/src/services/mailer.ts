import nodemailer from 'nodemailer';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import PDFDocument from 'pdfkit';
import { logEvents } from '../middlewares/logger';
type SMTPAuth = {
    user?: string | null;
    pass?: string | null;
};
const createTransporter = (overrideAuth?: SMTPAuth) => {
    const config: any = {
        host: process.env.SMTP_HOST || 'mail.nac.com.np',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_PORT === '465',
        tls: { rejectUnauthorized: false },
    };
    const user = overrideAuth?.user || process.env.SMTP_USER;
    const pass = overrideAuth?.pass || process.env.SMTP_PASS;
    if (user && pass) {
        config.auth = {
            user,
            pass,
        };
    }
    return nodemailer.createTransport(config);
};
const transporter = createTransporter();
const getLogoUrl = () => {
    const baseUrl = process.env.NEXTAUTH_URL || process.env.APP_BASE_URL || 'http://localhost:3000';
    return `${baseUrl}/logo.png`;
};
interface EmailTemplateOptions {
    title: string;
    subtitle?: string;
    body: string;
    buttonLabel?: string;
    buttonUrl?: string;
    footerNote?: string;
}
export const renderEmailTemplate = ({ title, subtitle, body, buttonLabel, buttonUrl, footerNote = 'Automated message from the Ground Support Inventory Management System (GIMS).', }: EmailTemplateOptions) => {
    const logoUrl = getLogoUrl();
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${title}</title>
    </head>
    <body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;color:#111827;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;padding:20px 0;">
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
              <tr>
                <td style="padding:24px 24px 16px 24px;text-align:center;">
                  <img src="${logoUrl}" alt="Nepal Airlines" style="height:48px;width:auto;margin-bottom:12px;" />
                  <h1 style="margin:0;font-size:20px;color:#111827;">${title}</h1>
                  ${subtitle ? `<p style="margin:8px 0 0 0;font-size:14px;color:#6b7280;">${subtitle}</p>` : ''}
                </td>
              </tr>
              <tr>
                <td style="padding:0 24px 24px 24px;">
                  <div style="font-size:14px;line-height:1.6;color:#1f2937;">
                    ${body}
                  </div>
                  ${buttonLabel && buttonUrl
        ? `<div style="margin-top:24px;text-align:center;">
                          <a href="${buttonUrl}" style="display:inline-block;background-color:#1e3a8a;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;">
                            ${buttonLabel}
                          </a>
                        </div>`
        : ''}
                </td>
              </tr>
              <tr>
                <td style="padding:16px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;">
                  ${footerNote}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};
export const sendMail = async (options: nodemailer.SendMailOptions, authOverride?: SMTPAuth) => {
    try {
        const smtpUser = authOverride?.user || process.env.SMTP_USER;
        const smtpPass = authOverride?.pass || process.env.SMTP_PASS;
        if (!smtpUser || !smtpPass) {
            const errorMsg = 'SMTP credentials not configured. Please set SMTP_USER/SMTP_PASS or configure them in email settings.';
            await logEvents(`Email send failed: ${options.subject} -> ${options.to} :: ${errorMsg}`, 'mailLog.log');
            return { success: false, error: errorMsg };
        }
        const mailTransporter = createTransporter({ user: smtpUser, pass: smtpPass });
        const result = await mailTransporter.sendMail(options);
        await logEvents(`Email sent: ${options.subject} -> ${options.to} (messageId: ${result.messageId})`, 'mailLog.log');
        return { success: true, messageId: result.messageId };
    }
    catch (error) {
        await logEvents(`Email send failed: ${options.subject} -> ${options.to} :: ${error instanceof Error ? error.message : String(error)}`, 'mailLog.log');
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
};
export const testSMTPConnection = async (): Promise<{
    success: boolean;
    error?: string;
}> => {
    try {
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
            const errorMsg = 'SMTP credentials not configured. Please set SMTP_USER and SMTP_PASS environment variables.';
            await logEvents(`SMTP connection failed: ${errorMsg}`, 'mailLog.log');
            return { success: false, error: errorMsg };
        }
        const mailTransporter = createTransporter();
        await mailTransporter.verify();
        await logEvents('SMTP connection verified successfully', 'mailLog.log');
        return { success: true };
    }
    catch (error) {
        await logEvents(`SMTP connection failed: ${error instanceof Error ? error.message : String(error)}`, 'mailLog.log');
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
};
export interface RequestPdfData {
    requestNumber: string;
    requestDate: string;
    requestedBy?: string;
    requestedByEmail?: string | null;
    remarks?: string;
    items: Array<{
        itemName: string;
        partNumber: string;
        unit: string;
        quantity: number;
        equipmentNumber?: string;
        remarks?: string;
    }>;
}
export const generateRequestPdf = async (data: RequestPdfData): Promise<string> => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const tmpPath = path.join(os.tmpdir(), `request-${data.requestNumber}-${uuidv4()}.pdf`);
    const stream = fs.createWriteStream(tmpPath);
    doc.pipe(stream);
    doc.fontSize(16).text(`Request ${data.requestNumber}`, { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Date: ${data.requestDate}`);
    if (data.requestedBy)
        doc.text(`Requested by: ${data.requestedBy}`);
    if (data.requestedByEmail)
        doc.text(`Requested by email: ${data.requestedByEmail}`);
    if (data.remarks) {
        doc.moveDown(0.5);
        doc.text(`Remarks: ${data.remarks}`);
    }
    doc.moveDown(1);
    doc.fontSize(12).text('Items', { underline: true });
    doc.moveDown(0.5);
    data.items.forEach((item, idx) => {
        doc.fontSize(10).text(`${idx + 1}. ${item.itemName} (Part: ${item.partNumber}) | Qty: ${item.quantity} ${item.unit}` +
            (item.equipmentNumber ? ` | Equip: ${item.equipmentNumber}` : '') +
            (item.remarks ? ` | Remarks: ${item.remarks}` : ''));
        doc.moveDown(0.2);
    });
    doc.end();
    await new Promise<void>((resolve, reject) => {
        stream.on('finish', () => resolve());
        stream.on('error', (err) => reject(err));
    });
    return tmpPath;
};
