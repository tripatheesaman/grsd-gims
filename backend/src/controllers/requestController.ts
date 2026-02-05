import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { CreateRequestDTO, RequestDetail } from '../types/request';
import { formatDate, formatDateForDB } from '../utils/dateUtils';
import { logEvents } from '../middlewares/logger';
import { sendMail, renderEmailTemplate } from '../services/mailer';
import { generateRequestPdf } from '../services/excelService';
import fs from 'fs';

interface StockDetail extends RowDataPacket {
    current_balance: number;
    unit: string;
}

interface ReceiveDetail extends RowDataPacket {
    total_amount: number;
    receive_quantity: number;
}

interface PendingRequest extends RowDataPacket {
    request_number: string;
    request_date: Date;
    requested_by: string;
}

interface RequestItem extends RowDataPacket {
    id: number;
    request_number: string;
    item_name: string;
    part_number: string;
    equipment_number: string;
    requested_quantity: number;
    image_path: string;
    unit: string;
    specifications: string;
    remarks: string;
}

interface UpdateRequestDTO {
    requestNumber: string;
    requestDate: string;
    remarks: string;
    requestedBy?: string;
    items: Array<{
        id?: number;
        requestNumber: string;
        nacCode: string;
        partNumber: string;
        itemName: string;
        requestedQuantity: number;
        equipmentNumber: string;
        specifications: string;
        imageUrl: string;
        approvalStatus?: string;
        requestedById?: number | null;
        requestedByEmail?: string | null;
    }>;
}

interface ApproveRequestDTO {
    approvedBy: string;
}

interface RejectRequestDTO {
    rejectedBy: string;
    rejectionReason: string;
}

interface RequestWithItems extends RowDataPacket {
    id: number;
    request_number: string;
    request_date: Date;
    part_number: string;
    item_name: string;
    unit: string;
    requested_quantity: number;
    current_balance: number | string;
    previous_rate: number | string;
    equipment_number: string;
    image_path: string;
    specifications: string;
    remarks: string;
    requested_by: string;
    requested_by_id: number | null;
    requested_by_email: string | null;
    approval_status: string;
    nac_code: string;
}

interface SearchRequestResult extends RowDataPacket {
    id: number;
    request_number: string;
    request_date: Date;
    requested_by: string;
    part_number: string;
    item_name: string;
    equipment_number: string;
    requested_quantity: number;
    approval_status: string;
}

const getStockDetails = async (nacCode: string): Promise<StockDetail | null> => {
    try {
        const [rows] = await pool.query<StockDetail[]>(
            'SELECT current_balance, unit FROM stock_details WHERE nac_code = ?',
            [nacCode]
        );
        return rows[0] || null;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching stock details for NAC code ${nacCode}: ${errorMessage}`, "requestLog.log");
        throw error;
    }
};

// Helper function to validate request date against previous request dates
const validateRequestDate = async (requestDate: string, excludeRequestNumber?: string): Promise<{ isValid: boolean; lastRequestDate?: Date; errorMessage?: string }> => {
    try {
        let query = `SELECT request_date 
                     FROM request_details 
                     WHERE approval_status NOT IN ("CLOSED", "REJECTED")`;
        let params: (string | Date)[] = [];

        if (excludeRequestNumber) {
            query += ` AND request_number != ?`;
            params.push(excludeRequestNumber);
        }

        query += ` ORDER BY request_date DESC, id DESC LIMIT 1`;

        const [lastRequestInfo] = await pool.query<RowDataPacket[]>(query, params);

        if (lastRequestInfo.length > 0) {
            const lastRequestDate = new Date(lastRequestInfo[0].request_date);
            const currentRequestDate = new Date(requestDate);
            
            if (currentRequestDate < lastRequestDate) {
                return {
                    isValid: false,
                    lastRequestDate,
                    errorMessage: `Request date cannot be before the previous request date (${lastRequestDate.toISOString().split('T')[0]}).`
                };
            }
        }
        
        return { isValid: true };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error validating request date: ${errorMessage}`, "requestLog.log");
        throw error;
    }
};

const getPreviousRate = async (nacCode: string): Promise<string | number> => {
    try {
        const [rows] = await pool.query<ReceiveDetail[]>(
            `SELECT rd.received_quantity, rrp.total_amount
             FROM rrp_details rrp
             JOIN receive_details rd ON rrp.receive_fk = rd.id
             WHERE rd.nac_code = ?
             AND rd.rrp_fk is NOT NULL
             ORDER BY rd.receive_date DESC 
             LIMIT 1`,
            [nacCode]
        );
        if (rows[0]) {
            return Number((Number(rows[0].total_amount) / Number(rows[0].received_quantity)).toFixed(2));
        }
        return 'N/A';
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching previous rate for NAC code ${nacCode}: ${errorMessage}`, "requestLog.log");
        throw error;
    }
};

// -------- Email helpers for request approval --------
interface RequestEmailSettings {
    send_enabled: number;
    reminders_enabled: number;
    reminder_days: number;
    include_pdf: number;
    mail_sending_enabled: number;
    from_email?: string | null;
    smtp_user?: string | null;
    smtp_pass?: string | null;
}

interface RequestEmailRecipient {
    id: number;
    email: string;
    role: 'to' | 'cc' | 'bcc';
    send_on_approval: number;
    send_on_reminder: number;
    send_on_force_close: number;
    allow_reminder: number;
    is_active: number;
}

const fetchRequestEmailConfig = async (): Promise<{ settings: RequestEmailSettings | null; recipients: RequestEmailRecipient[] }> => {
    const [settingsRows] = await pool.query<RowDataPacket[]>(`SELECT * FROM request_email_settings ORDER BY id LIMIT 1`);
    const settings = (settingsRows[0] as RequestEmailSettings) || null;
    const [recipientRows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM request_email_recipients WHERE is_active = 1 ORDER BY role, id`
    );
    return { settings, recipients: recipientRows as RequestEmailRecipient[] };
};


const buildRecipientLists = (recipients: RequestEmailRecipient[], requestedByEmail?: string | null) => {
    const to: string[] = [];
    const cc: string[] = [];
    const bcc: string[] = [];

    recipients
        .filter(r => r.send_on_approval === 1 && r.is_active === 1)
        .forEach(r => {
            if (r.role === 'to') to.push(r.email);
            else if (r.role === 'cc') cc.push(r.email);
            else bcc.push(r.email);
        });

    if (requestedByEmail && !cc.includes(requestedByEmail)) {
        cc.push(requestedByEmail);
    }

    return { to, cc, bcc };
};

const sendRequestForceCloseEmail = async (requestNumber: string): Promise<void> => {
    try {
        const { settings, recipients } = await fetchRequestEmailConfig();
        if (!settings) {
            await logEvents(`Force close email skipped - no settings row`, "mailLog.log");
            return;
        }
        if (!settings.mail_sending_enabled || !settings.send_enabled) {
            await logEvents(`Force close email skipped for ${requestNumber} - sending disabled`, "mailLog.log");
            return;
        }

        const [requestRows] = await pool.query<RowDataPacket[]>(
            `SELECT 
                request_number, request_date, part_number, item_name, unit, requested_quantity,
                equipment_number, remarks, requested_by, requested_by_id, requested_by_email, nac_code
             FROM request_details
             WHERE request_number = ?`,
            [requestNumber]
        );

        if (!requestRows.length) {
            await logEvents(`Force close email skipped - request not found ${requestNumber}`, "mailLog.log");
            return;
        }

        // Collect all unique requested_by emails from all items
        const requestedByEmails = new Set<string>();
        for (const row of requestRows) {
            const email = row.requested_by_email || (row.requested_by?.includes('@') ? row.requested_by : null);
            if (email) {
                requestedByEmails.add(email);
            }
        }
        const requestedByEmailArray = Array.from(requestedByEmails);
        const primaryRequestedByEmail = requestedByEmailArray.length > 0 ? requestedByEmailArray[0] : null;
        const { to, cc, bcc } = buildRecipientLists(recipients, primaryRequestedByEmail);
        
        // Add all other requested_by emails to CC
        if (requestedByEmailArray.length > 1) {
            requestedByEmailArray.slice(1).forEach(email => {
                if (!cc.includes(email) && !to.includes(email) && !bcc.includes(email)) {
                    cc.push(email);
                }
            });
        }
        if (to.length === 0 && cc.length === 0 && bcc.length === 0) {
            await logEvents(`Force close email skipped - no recipients for ${requestNumber}`, "mailLog.log");
            return;
        }

        // Check received status for each item
        const [receiveDetails] = await pool.query<RowDataPacket[]>(
            `SELECT 
                r.request_fk,
                r.received_quantity,
                r.approval_status
             FROM receive_details r
             INNER JOIN request_details rd ON r.request_fk = rd.id
             WHERE rd.request_number = ?
             AND r.approval_status = 'APPROVED'`,
            [requestNumber]
        );

        // Create a map of request_detail_id -> total received quantity
        const receivedMap = new Map<number, number>();
        for (const receive of receiveDetails) {
            const requestFk = receive.request_fk;
            const receivedQty = Number(receive.received_quantity || 0);
            const currentTotal = receivedMap.get(requestFk) || 0;
            receivedMap.set(requestFk, currentTotal + receivedQty);
        }

        // Calculate totals
        let totalRequested = 0;
        let totalReceived = 0;
        const itemsWithStatus = requestRows.map((row, idx) => {
            const requestedQty = Number(row.requested_quantity || 0);
            const receivedQty = receivedMap.get(row.id) || 0;
            totalRequested += requestedQty;
            totalReceived += receivedQty;
            
            return {
                itemName: row.item_name,
                partNumber: row.part_number,
                unit: row.unit,
                requestedQuantity: requestedQty,
                receivedQuantity: receivedQty,
                equipmentNumber: row.equipment_number,
                nacCode: row.nac_code,
                index: idx + 1,
            };
        });

        // Determine status message
        let statusMessage = '';
        let statusTitle = 'Request Closed';
        if (totalReceived === 0) {
            statusMessage = `<p>The request <strong>${requestNumber}</strong> has been force closed by the administrator. The items have not been received.</p>`;
            statusTitle = 'Request Force Closed';
        } else if (totalReceived < totalRequested) {
            statusMessage = `<p>The request <strong>${requestNumber}</strong> has been force closed by the administrator. The items have been partially received.</p>`;
            statusTitle = 'Request Force Closed - Partially Received';
        } else {
            statusMessage = `<p>The items under request <strong>${requestNumber}</strong> have been successfully received, and the request is now closed.</p>`;
            statusTitle = 'Request Closed';
        }

        const requestDate = formatDate(new Date(requestRows[0].request_date));
        
        // Build items list with received status
        const itemsList = itemsWithStatus.map(item => {
            let itemStatus = '';
            if (item.receivedQuantity === 0) {
                itemStatus = ` - <strong>Not Received</strong>`;
            } else if (item.receivedQuantity < item.requestedQuantity) {
                itemStatus = ` - <strong>Partially Received (${item.receivedQuantity} ${item.unit} received out of ${item.requestedQuantity} ${item.unit} requested)</strong>`;
            } else {
                itemStatus = ` - <strong>Received (${item.receivedQuantity} ${item.unit})</strong>`;
            }
            
            return `<li>${item.itemName} (Part: ${item.partNumber}, Qty: ${item.requestedQuantity} ${item.unit}${item.equipmentNumber ? ', Equip: ' + item.equipmentNumber : ''}${item.nacCode ? ', NAC: ' + item.nacCode : ''})${itemStatus}</li>`;
        }).join('');

        const bodyLines = [
            `<p>Dear Sir/Ma'am,</p>`,
            statusMessage,
            `<p><strong>Details</strong></p>`,
            `<ul style="padding-left:18px;margin:12px 0;color:#374151;font-size:14px;">
               <li><strong>Request date:</strong> ${requestDate}</li>
               <li><strong>Requested by:</strong> ${requestRows[0].requested_by || 'N/A'}</li>
               <li><strong>Total requested:</strong> ${totalRequested}</li>
               <li><strong>Total received:</strong> ${totalReceived}</li>
             </ul>`,
            `<p><strong>Items</strong></p>`,
            `<ol style="padding-left:18px;margin:12px 0;color:#374151;font-size:14px;">${itemsList}</ol>`,
        ].join('');

        const html = renderEmailTemplate({
            title: statusTitle,
            subtitle: requestNumber,
            body: bodyLines,
            buttonLabel: 'View Request',
            buttonUrl: (process.env.NEXTAUTH_URL || process.env.APP_BASE_URL || 'http://192.168.1.254:3000') + `/request/${requestNumber}`,
        });

        // Determine subject based on status
        let emailSubject = '';
        if (totalReceived === 0) {
            emailSubject = `Request Force Closed: ${requestNumber}`;
        } else if (totalReceived < totalRequested) {
            emailSubject = `Request Force Closed (Partially Received): ${requestNumber}`;
        } else {
            emailSubject = `Request Closed: ${requestNumber}`;
        }

        await sendMail(
            {
                from: settings.from_email || process.env.SMTP_USER || 'noreply@nac.com.np',
                to: to.join(','),
                cc: cc.join(','),
                bcc: bcc.join(','),
                subject: emailSubject,
                html,
            },
            {
                // Use configured sender email as SMTP username if provided
                user: settings.from_email || undefined,
                pass: settings.smtp_pass ?? undefined,
            }
        );
    } catch (error) {
        await logEvents(`Error sending force close email for ${requestNumber}: ${error instanceof Error ? error.message : String(error)}`, "mailLog.log");
    }
};

const sendRequestApprovalEmail = async (requestNumber: string): Promise<void> => {
    try {
        const { settings, recipients } = await fetchRequestEmailConfig();
        if (!settings) {
            await logEvents(`Approval email skipped - no settings row`, "mailLog.log");
            return;
        }
        if (!settings.mail_sending_enabled || !settings.send_enabled) {
            await logEvents(`Approval email skipped for ${requestNumber} - sending disabled`, "mailLog.log");
            return;
        }

        const [requestRows] = await pool.query<RowDataPacket[]>(
            `SELECT 
                request_number, request_date, part_number, item_name, unit, requested_quantity,
                equipment_number, remarks, requested_by, requested_by_id, requested_by_email, nac_code
             FROM request_details
             WHERE request_number = ?`,
            [requestNumber]
        );

        if (!requestRows.length) {
            await logEvents(`Approval email skipped - request not found ${requestNumber}`, "mailLog.log");
            return;
        }

        // Collect all unique requested_by emails from all items
        const requestedByEmails = new Set<string>();
        for (const row of requestRows) {
            const email = row.requested_by_email || (row.requested_by?.includes('@') ? row.requested_by : null);
            if (email) {
                requestedByEmails.add(email);
            }
        }
        const requestedByEmailArray = Array.from(requestedByEmails);
        const primaryRequestedByEmail = requestedByEmailArray.length > 0 ? requestedByEmailArray[0] : null;
        const { to, cc, bcc } = buildRecipientLists(recipients, primaryRequestedByEmail);
        
        // Add all other requested_by emails to CC
        if (requestedByEmailArray.length > 1) {
            requestedByEmailArray.slice(1).forEach(email => {
                if (!cc.includes(email) && !to.includes(email) && !bcc.includes(email)) {
                    cc.push(email);
                }
            });
        }
        if (to.length === 0 && cc.length === 0 && bcc.length === 0) {
            await logEvents(`Approval email skipped - no recipients for ${requestNumber}`, "mailLog.log");
            return;
        }

        const requestDate = formatDate(new Date(requestRows[0].request_date));
        const remarks = requestRows[0].remarks || '';

        const items = requestRows.map((row, idx) => ({
            itemName: row.item_name,
            partNumber: row.part_number,
            unit: row.unit,
            quantity: row.requested_quantity,
            equipmentNumber: row.equipment_number,
            remarks: row.remarks,
            nacCode: row.nac_code,
            index: idx + 1,
        }));

        const bodyLines = [
            `<p>Hello,</p>`,
            `<p>The request for the following items has been <strong>initiated by the inventory section</strong> with reference number <strong>${requestNumber}</strong>.</p>`,
            `<p><strong>Details</strong></p>`,
            `<ul style="padding-left:18px;margin:12px 0;color:#374151;font-size:14px;">
               <li><strong>Request date:</strong> ${requestDate}</li>
               <li><strong>Requested by:</strong> ${requestRows[0].requested_by || 'N/A'}</li>
               ${remarks ? `<li><strong>Remarks:</strong> ${remarks}</li>` : ''}
             </ul>`,
            `<p><strong>Items</strong></p>`,
            `<ol style="padding-left:18px;margin:12px 0;color:#374151;font-size:14px;">` +
              items.map(item => `<li>${item.itemName} (Part: ${item.partNumber}, Qty: ${item.quantity} ${item.unit}${item.equipmentNumber ? ', Equip: ' + item.equipmentNumber : ''}${item.nacCode ? ', NAC: ' + item.nacCode : ''})</li>`).join('') +
            `</ol>`,
        ].join('');

        const html = renderEmailTemplate({
            title: 'Request Initiated',
            subtitle: requestNumber,
            body: bodyLines,
            buttonLabel: 'View Request',
            buttonUrl: (process.env.NEXTAUTH_URL || process.env.APP_BASE_URL || 'http://192.168.1.254:3000') + `/request/${requestNumber}`,
        });

        const attachments: Array<{ filename: string; path?: string; content?: Buffer; contentType?: string }> = [];
        let tempPdf: string | null = null;
        if (settings.include_pdf) {
            try {
                // Generate PDF directly using the same data/logic as Excel generation
                tempPdf = await generateRequestPdf(requestNumber);
                
                if (tempPdf && fs.existsSync(tempPdf)) {
                    // Attach the PDF file
                    attachments.push({ 
                        filename: `request-${requestNumber}.pdf`, 
                        path: tempPdf,
                        contentType: 'application/pdf'
                    });
                } else {
                    await logEvents(`PDF generation failed for ${requestNumber}`, "mailLog.log");
                }
            } catch (error) {
                await logEvents(`Error generating request PDF for email attachment ${requestNumber}: ${error instanceof Error ? error.message : String(error)}`, "mailLog.log");
                // Continue without attachment if generation fails
            }
        }

        await sendMail(
            {
                from: settings.from_email || process.env.SMTP_USER || 'noreply@nac.com.np',
                to: to.join(','),
                cc: cc.join(','),
                bcc: bcc.join(','),
                subject: `Request Initiated: ${requestNumber}`,
                html,
                attachments,
            },
            {
                user: settings.from_email || undefined,
                pass: settings.smtp_pass ?? undefined,
            }
        );

        // Clean up temporary files
        if (tempPdf) {
            fs.unlink(tempPdf, () => {});
        }
    } catch (error) {
        await logEvents(`Error sending approval email for ${requestNumber}: ${error instanceof Error ? error.message : String(error)}`, "mailLog.log");
    }
};

/**
 * Compute the next request number. Preferred logic:
 * - If lastRequestNumber matches pattern <section>Y<yy>T<seq1>F<yy2>RN<seq2>, increment seq1 and seq2 by 1 and reuse other parts.
 * - Otherwise, fall back to building from sectionCode and currentFy with RN sequence increment.
 */
const computeNextRequestNumber = (lastRequestNumber: string | null, sectionCode: string, currentFy: string): string => {
    if (lastRequestNumber) {
        // Try parse pattern like: 10.19Y83T182F82RN186
        const m = lastRequestNumber.match(/^(.+?)Y(\d+)T(\d+)F(\d+)RN(\d+)$/);
        const fy = currentFy.slice(2,4);
        if (m) {
            const section = sectionCode;
            const yPart = fy;
            const tSeq = Number(m[3] || 0);
            const fPart = fy;
            const rnSeq = Number(m[5] || 0);
            const nextT = tSeq + 1;
            const nextRN = rnSeq + 1;
            return `${section}Y${yPart}T${nextT}F${fPart}RN${nextRN}`;
        }
    }

    // Fallback: derive parts from currentFy and sectionCode
    const parts = (currentFy || '').split('/');
    let fy_front = '';
    let fy_back = '';
    if (parts.length === 2) {
        fy_front = parts[0].slice(-2);
        fy_back = parts[1];
    } else {
        fy_front = (currentFy || '').slice(-2);
        fy_back = fy_front;
    }

    let seq = 1;
    if (lastRequestNumber) {
        const m2 = lastRequestNumber.match(/RN(\d+)/);
        if (m2) seq = Number(m2[1]) + 1;
    }
    return `${sectionCode}Y${fy_back}T${seq}F${fy_front}RN${seq}`;
};


const processRequestItem = async (
    item: CreateRequestDTO['items'][0],
    requestData: CreateRequestDTO
): Promise<RequestDetail> => {
    try {
        let currentBalance: number | string = 'N/A';
        let unit = item.unit || 'N/A';

        if (item.nacCode !== 'N/A') {
            const stockDetail = await getStockDetails(item.nacCode);
            if (stockDetail) {
                currentBalance = stockDetail.current_balance;
                unit = stockDetail.unit;
            }
        } else {
            currentBalance = 0;
        }

        const previousRate = await getPreviousRate(item.nacCode);

        return {
            request_number: requestData.requestNumber,
            request_date: new Date(requestData.requestDate),
            part_number: item.partNumber,
            item_name: item.itemName,
            unit,
            requested_quantity: item.requestQuantity,
            current_balance: currentBalance,
            previous_rate: previousRate,
            equipment_number: item.equipmentNumber,
            image_path: item.imagePath,
            specifications: item.specifications,
            remarks: requestData.remarks,
            requested_by: requestData.requestedBy,
            requested_by_id: item.requestedById ?? null,
            requested_by_email: item.requestedByEmail ?? null,
            approval_status: 'PENDING',
            nac_code: item.nacCode
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error processing request item for ${item.itemName}: ${errorMessage}`, "requestLog.log");
        throw error;
    }
};

export const createRequest = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const requestData: CreateRequestDTO = req.body;
        if (!requestData.requestedBy) {
            await connection.rollback();
            res.status(400).json({ error: 'Bad Request', message: 'requestedBy is required' });
            return;
        }
        
        // Check if request number already exists (excluding CLOSED and REJECTED)
        const [existingRequests] = await connection.query<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM request_details WHERE request_number = ? AND approval_status NOT IN ("CLOSED", "REJECTED")',
            [requestData.requestNumber]
        );

        if (existingRequests[0].count > 0) {
            await connection.rollback();
            logEvents(`Failed to create request - Request number already exists: ${requestData.requestNumber} by user: ${requestData.requestedBy}`, "requestLog.log");
            res.status(409).json({ 
                error: 'Conflict',
                message: `Request number ${requestData.requestNumber} already exists. Please use a different request number.`
            });
            return;
        }

        // Check if user has permission to skip date validation
        const userPermissions = req.permissions || [];
        const canSkipDateValidation = userPermissions.includes('can_approve_request');

        // If the user does not have permission to create custom request numbers, ensure the provided
        // request number matches the system-generated next request number
        const canCreateCustomRequestNumber = userPermissions.includes('can_create_new_request_number');
        if (!canCreateCustomRequestNumber) {
            // Generate expected next request number from the latest request and app_config
            const [configRows] = await connection.query<RowDataPacket[]>(
                'SELECT config_name, config_value FROM app_config WHERE config_name IN (?, ?)',
                ['section_code', 'current_fy']
            );
            let sectionCode = '';
            let currentFy = '';
            for (const r of configRows as any[]) {
                if (r.config_name === 'section_code') sectionCode = r.config_value;
                if (r.config_name === 'current_fy') currentFy = r.config_value;
            }

            // Find last request
            const [lastRows] = await connection.query<RowDataPacket[]>(
                `SELECT request_number FROM request_details GROUP BY request_number ORDER BY MAX(request_date) DESC, request_number DESC LIMIT 1`
            );
            const lastRequestNumber = lastRows.length > 0 ? lastRows[0].request_number : null;

            const expectedNumber = computeNextRequestNumber(lastRequestNumber, sectionCode || '', currentFy || '');
            if (requestData.requestNumber !== expectedNumber) {
                await connection.rollback();
                logEvents(`Failed to create request - Unauthorized custom request number attempt by user: ${requestData.requestedBy}`, "requestLog.log");
                res.status(403).json({
                    error: 'Forbidden',
                    message: 'You are not allowed to create custom request numbers. Contact administrator.'
                });
                return;
            }
        }

        // Check if request date is not before the previous request date
        // Skip validation if user has approval permission
        logEvents(`Performing date validation for user: ${req.user || 'unknown'} (permissions: ${userPermissions.join(', ')})`, "requestLog.log");
        const validationResult = await validateRequestDate(requestData.requestDate, requestData.requestNumber);
        if (!validationResult.isValid) {
            await connection.rollback();
            logEvents(`Failed to create request - Request date ${requestData.requestDate} is before previous request date ${validationResult.lastRequestDate?.toISOString().split('T')[0]} by user: ${requestData.requestedBy}`, "requestLog.log");
            res.status(400).json({ 
                error: 'Bad Request',
                message: validationResult.errorMessage || 'An error occurred while validating request date.'
            });
            return;
        }
        
        const requestDetails = await Promise.all(
            requestData.items.map(item => processRequestItem(item, requestData))
        );

        for (const detail of requestDetails) {
            await connection.query(
            `INSERT INTO request_details 
            (request_number, request_date, part_number, item_name, unit, 
             requested_quantity, current_balance, previous_rate, equipment_number, 
             image_path, specifications, remarks, requested_by, requested_by_id, requested_by_email, approval_status, nac_code)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    detail.request_number,
                    formatDateForDB(detail.request_date),
                    detail.part_number,
                    detail.item_name,
                    detail.unit,
                    detail.requested_quantity,
                    detail.current_balance,
                    detail.previous_rate,
                    detail.equipment_number,
                    detail.image_path,
                    detail.specifications,
                    detail.remarks,
                detail.requested_by,
                detail.requested_by_id ?? null,
                detail.requested_by_email ?? null,
                    detail.approval_status,
                    detail.nac_code
                ]
            );
        }

        await connection.commit();
        logEvents(`Successfully created request ${requestData.requestNumber} with ${requestDetails.length} items by user: ${requestData.requestedBy}`, "requestLog.log");
        
        res.status(201).json({ 
            message: 'Request created successfully',
            requestNumber: requestData.requestNumber,
            requestDate: formatDate(requestData.requestDate)
        });
    } catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error creating request: ${errorMessage} by user: ${req.body.requestedBy}`, "requestLog.log");
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while creating the request'
        });
    } finally {
        connection.release();
    }
};

export const getPendingRequests = async (req: Request, res: Response): Promise<void> => {
    try {
        const [rows] = await pool.query<PendingRequest[]>(
            `SELECT id,nac_code,request_number, request_date, requested_by 
             FROM request_details 
             WHERE approval_status = 'PENDING'`
        );

        const pendingRequests = rows.map(row => ({
            requestId: row.id,
            nacCode: row.nac_code,
            requestNumber: row.request_number,
            requestDate: row.request_date,
            requestedBy: row.requested_by
        }));
        
        logEvents(`Successfully fetched ${pendingRequests.length} pending requests`, "requestLog.log");
        res.status(200).json(pendingRequests);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching pending requests: ${errorMessage}`, "requestLog.log");
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching pending requests'
        });
    }
};

export const getRequestItems = async (req: Request, res: Response): Promise<void> => {
    try {
        const { requestNumber } = req.params;

        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT id, request_number, nac_code, item_name, part_number, equipment_number, 
                    requested_quantity, image_path, specifications, remarks, unit,
                    requested_by_id, requested_by_email, requested_by
             FROM request_details 
             WHERE request_number = ?`,
            [requestNumber]
        );

        const requestItems = rows.map(row => ({
            id: row.id,
            requestNumber: row.request_number,
            nacCode: row.nac_code,
            itemName: row.item_name,
            partNumber: row.part_number,
            equipmentNumber: row.equipment_number,
            requestedQuantity: row.requested_quantity,
            imageUrl: row.image_path,
            specifications: row.specifications,
            remarks: row.remarks,
            unit: row.unit,
            requestedById: row.requested_by_id ?? null,
            requestedByEmail: row.requested_by_email ?? null,
            requestedBy: row.requested_by ?? null
        }));
        
        logEvents(`Successfully fetched ${requestItems.length} items for request ${requestNumber}`, "requestLog.log");
        res.status(200).json(requestItems);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching request items for ${req.params.requestNumber}: ${errorMessage}`, "requestLog.log");
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching request items'
        });
    }
};

export const updateRequest = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    
    try {
        const { requestNumber: newRequestNumber, requestDate, remarks, items, requestedBy }: UpdateRequestDTO = req.body;
        const { requestNumber: oldRequestNumber } = req.params;
        await connection.beginTransaction();

        // Check if user has permission to skip date validation
        const userPermissions = req.permissions || [];
        const canSkipDateValidation = userPermissions.includes('can_approve_request');

        // Check if request date is not before the previous request date (excluding current request)
        // Skip validation if user has approval permission
        if (!canSkipDateValidation) {
            logEvents(`Performing date validation for user: ${req.user || 'unknown'} (permissions: ${userPermissions.join(', ')})`, "requestLog.log");
            const validationResult = await validateRequestDate(requestDate, oldRequestNumber);
            if (!validationResult.isValid) {
                await connection.rollback();
                logEvents(`Failed to update request - Request date ${requestDate} is before previous request date ${validationResult.lastRequestDate?.toISOString().split('T')[0]} by user: ${req.body.updatedBy || 'unknown'}`, "requestLog.log");
                res.status(400).json({ 
                    error: 'Bad Request',
                    message: validationResult.errorMessage || 'An error occurred while validating request date.'
                });
                return;
            }
        } else {
            logEvents(`Date validation skipped for user with approval permission: ${req.user || 'unknown'} (permissions: ${userPermissions.join(', ')})`, "requestLog.log");
        }

        const [existingItems] = await connection.query<RowDataPacket[]>(
            'SELECT id FROM request_details WHERE request_number = ?',
            [oldRequestNumber]
        );

        const existingItemIds = existingItems.map(item => item.id);
        const updatedItemIds = items.filter(item => item.id).map(item => item.id);

        const itemsToDelete = existingItemIds.filter(id => !updatedItemIds.includes(id));
        if (itemsToDelete.length > 0) {
            await connection.query(
                'DELETE FROM request_details WHERE id IN (?)',
                [itemsToDelete]
            );
            logEvents(`Deleted ${itemsToDelete.length} items from request ${oldRequestNumber}`, "requestLog.log");
        }

        for (const item of items) {
            if (item.id) {
                logEvents(`Updating item ${item.id} with NAC code: ${item.nacCode}`, "requestLog.log");

                // Fetch existing item to preserve requested_by if not provided
                const [existingItemRows] = await connection.query<RowDataPacket[]>(
                    'SELECT requested_by, requested_by_id, requested_by_email FROM request_details WHERE id = ?',
                    [item.id]
                );
                
                const existingItem = existingItemRows[0];
                let finalRequestedBy = requestedBy;
                let finalRequestedById = item.requestedById ?? null;
                let finalRequestedByEmail = item.requestedByEmail ?? null;

                // Check if requestedById actually changed
                const requestedByIdChanged = finalRequestedById !== null && finalRequestedById !== existingItem?.requested_by_id;
                const isExistingRequestedByEmail = existingItem?.requested_by && existingItem.requested_by.includes('@');

                // If requestedById hasn't changed and existing requested_by is an email, preserve it
                if (finalRequestedById && !requestedByIdChanged && isExistingRequestedByEmail) {
                    // Preserve existing email when requestedById hasn't changed
                    finalRequestedBy = existingItem.requested_by || '';
                    finalRequestedById = existingItem.requested_by_id ?? null;
                    finalRequestedByEmail = existingItem.requested_by_email ?? null;
                } else if (finalRequestedById && requestedByIdChanged) {
                    // If requestedById changed, fetch the authority name
                    const [authorityRows] = await connection.query<RowDataPacket[]>(
                        'SELECT name, designation FROM requesting_receiving_authority WHERE id = ? AND is_active = 1',
                        [finalRequestedById]
                    );
                    if (authorityRows.length > 0) {
                        const authority = authorityRows[0];
                        finalRequestedBy = `${authority.name}${authority.designation ? ` (${authority.designation})` : ''}`;
                    }
                } else if (!finalRequestedBy && existingItem) {
                    // Preserve existing requested_by if not provided and no requested_by_id
                    finalRequestedBy = existingItem.requested_by || '';
                    finalRequestedById = existingItem.requested_by_id ?? null;
                    finalRequestedByEmail = existingItem.requested_by_email ?? null;
                } else {
                    // Use provided requestedBy or empty string
                    finalRequestedBy = finalRequestedBy || '';
                }

                const updateFields = [
                    'request_number = ?',
                    'request_date = ?',
                    'nac_code = ?',
                    'part_number = ?',
                    'item_name = ?',
                    'requested_quantity = ?',
                    'equipment_number = ?',
                    'specifications = ?',
                    'image_path = ?',
                    'remarks = ?',
                    'requested_by = ?',
                    'requested_by_id = ?',
                    'requested_by_email = ?'
                ];
                const updateValues = [
                    newRequestNumber,
                    formatDateForDB(requestDate),
                    item.nacCode,
                    item.partNumber,
                    item.itemName,
                    item.requestedQuantity,
                    item.equipmentNumber,
                    item.specifications,
                    item.imageUrl,
                    remarks,
                    finalRequestedBy,
                    finalRequestedById,
                    finalRequestedByEmail
                ];

                if (item.approvalStatus) {
                    updateFields.push('approval_status = ?');
                    updateValues.push(item.approvalStatus);
                }

                await connection.query(
                    `UPDATE request_details 
                     SET ${updateFields.join(', ')}
                     WHERE id = ?`,
                    [...updateValues, item.id]
                );
            } else {
                logEvents(`Inserting new item with NAC code: ${item.nacCode}`, "requestLog.log");

                let newItemRequestedBy = requestedBy || '';
                let newItemRequestedById = item.requestedById ?? null;
                let newItemRequestedByEmail = item.requestedByEmail ?? null;

                // If item has requested_by_id, fetch the authority name
                if (newItemRequestedById) {
                    const [authorityRows] = await connection.query<RowDataPacket[]>(
                        'SELECT name, designation FROM requesting_receiving_authority WHERE id = ? AND is_active = 1',
                        [newItemRequestedById]
                    );
                    if (authorityRows.length > 0) {
                        const authority = authorityRows[0];
                        newItemRequestedBy = `${authority.name}${authority.designation ? ` (${authority.designation})` : ''}`;
                    }
                }

                const insertFields = [
                    'request_number',
                    'request_date',
                    'nac_code',
                    'part_number',
                    'item_name',
                    'requested_quantity',
                    'equipment_number',
                    'specifications',
                    'image_path',
                    'remarks',
                    'requested_by',
                    'requested_by_id',
                    'requested_by_email',
                    'approval_status'
                ];
                const insertValues = [
                    newRequestNumber,
                    formatDateForDB(requestDate),
                    item.nacCode,
                    item.partNumber,
                    item.itemName,
                    item.requestedQuantity,
                    item.equipmentNumber,
                    item.specifications,
                    item.imageUrl,
                    remarks,
                    newItemRequestedBy,
                    newItemRequestedById,
                    newItemRequestedByEmail,
                    item.approvalStatus || 'PENDING'
                ];

                await connection.query(
                    `INSERT INTO request_details 
                     (${insertFields.join(', ')})
                     VALUES (${insertValues.map(() => '?').join(', ')})`,
                    insertValues
                ); 
            }
        }

        // Note: requested_by_id and requested_by_email are now stored per item, not per request

        await connection.commit();
        logEvents(`Successfully updated request ${oldRequestNumber} to ${newRequestNumber} with ${items.length} items`, "requestLog.log");
        
        res.status(200).json({ 
            message: 'Request updated successfully',
            requestNumber: newRequestNumber
        });
    } catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error updating request ${req.params.requestNumber}: ${errorMessage}`, "requestLog.log");
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while updating the request'
        });
    } finally {
        connection.release();
    }
};

export const approveRequest = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    
    try {
        const { requestNumber } = req.params;
        const { approvedBy } = req.body as ApproveRequestDTO;

        await connection.beginTransaction();

        // First, get all NAC codes from the request being approved
        const [requestItems] = await connection.query<RowDataPacket[]>(
            `SELECT nac_code FROM request_details WHERE request_number = ?`,
            [requestNumber]
        );

        // For each NAC code, check if there are existing requests with the same NAC code
        // that haven't been received yet (receive_fk is null) and update their receive_fk to 0
        // and set is_received as true
        for (const item of requestItems) {
            if (item.nac_code && item.nac_code !== 'N/A') {
                await connection.query(
                    `UPDATE request_details 
                     SET receive_fk = 0, is_received = 1
                     WHERE nac_code = ? 
                     AND receive_fk IS NULL 
                     AND request_number != ?`,
                    [item.nac_code, requestNumber]
                );
            }
        }

        // Approve the current request
        await connection.query(
            `UPDATE request_details 
             SET approval_status = 'APPROVED',
                 approved_by = ?
             WHERE request_number = ?`,
            [approvedBy, requestNumber]
        );

        await connection.commit();
        logEvents(`Successfully approved request ${requestNumber} by user: ${approvedBy}`, "requestLog.log");
        
        // Send approval email (non-blocking)
        await sendRequestApprovalEmail(requestNumber);

        res.status(200).json({ 
            message: 'Request approved successfully',
            requestNumber
        });
    } catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error approving request ${req.params.requestNumber}: ${errorMessage} by user: ${req.body.approvedBy}`, "requestLog.log");
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while approving the request'
        });
    } finally {
        connection.release();
    }
};

export const rejectRequest = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    
    try {
        const { requestNumber } = req.params;
        const { rejectedBy, rejectionReason } = req.body as RejectRequestDTO;

        await connection.beginTransaction();

        const [requestDetails] = await connection.query<RowDataPacket[]>(
            `SELECT id, requested_by, requested_by_id, requested_by_email 
             FROM request_details 
             WHERE request_number = ? 
             ORDER BY id ASC 
             LIMIT 1`,
            [requestNumber]
        );

        if (requestDetails.length === 0) {
            await connection.rollback();
            logEvents(`Failed to reject request - Request not found: ${requestNumber}`, "requestLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Request not found'
            });
            return;
        }

        const firstItemId = requestDetails[0].id;
        const requestedBy = requestDetails[0].requested_by;

        // Try to find user by username
        // Note: requested_by might be a name/designation string, not always a username
        let userId: number | null = null;
        
        if (requestedBy) {
            const [usersByUsername] = await connection.query<RowDataPacket[]>(
                'SELECT id FROM users WHERE username = ?',
                [requestedBy]
            );
            if (usersByUsername.length > 0) {
                userId = usersByUsername[0].id;
            }
        }

        // Update request status
        await connection.query(
            `UPDATE request_details 
             SET approval_status = 'REJECTED',
                 rejected_by = ?,
                 rejection_reason = ?
             WHERE request_number = ?`,
            [rejectedBy, rejectionReason, requestNumber]
        );

        // Create notification only if user is found
        if (userId) {
            await connection.query(
                `INSERT INTO notifications 
                 (user_id, reference_type, message, reference_id)
                 VALUES (?, ?, ?, ?)`,
                [
                    userId,
                    'request',
                    `Your request number ${requestNumber} has been rejected for the following reason: ${rejectionReason}`,
                    firstItemId
                ]
            );
        } else {
            logEvents(`Warning: Could not find user for request ${requestNumber} (requested_by: ${requestedBy || 'N/A'}). Notification not sent.`, "requestLog.log");
        }

        await connection.commit();
        logEvents(`Successfully rejected request ${requestNumber} by user: ${rejectedBy}`, "requestLog.log");
        
        res.status(200).json({ 
            message: 'Request rejected successfully',
            requestNumber
        });
    } catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error rejecting request ${req.params.requestNumber}: ${errorMessage} by user: ${req.body.rejectedBy}`, "requestLog.log");
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while rejecting the request'
        });
    } finally {
        connection.release();
    }
};

export const forceCloseRequest = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    
    try {
        const { requestNumber } = req.params;
        const { closedBy } = req.body as { closedBy: string };

        await connection.beginTransaction();

        // Check if request exists and is active (not already closed or rejected)
        const [requestDetails] = await connection.query<RowDataPacket[]>(
            `SELECT id, approval_status, requested_by 
             FROM request_details 
             WHERE request_number = ? 
             ORDER BY id ASC 
             LIMIT 1`,
            [requestNumber]
        );

        if (requestDetails.length === 0) {
            await connection.rollback();
            logEvents(`Failed to force close request - Request not found: ${requestNumber}`, "requestLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Request not found'
            });
            return;
        }

        const firstItemId = requestDetails[0].id;
        const approvalStatus = requestDetails[0].approval_status;
        const requestedBy = requestDetails[0].requested_by;

        // Check if request is already closed or rejected
        if (approvalStatus === 'CLOSED') {
            await connection.rollback();
            logEvents(`Failed to force close request - Request already closed: ${requestNumber}`, "requestLog.log");
            res.status(409).json({
                error: 'Conflict',
                message: 'Already Closed'
            });
            return;
        }

        if (approvalStatus === 'REJECTED') {
            await connection.rollback();
            logEvents(`Failed to force close request - Request is rejected: ${requestNumber}`, "requestLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'Cannot close a rejected request'
            });
            return;
        }

        // Allow force-close for incomplete requests even if partially received.
        // Block only if the request is already fully received (approved receives >= requested qty).
        const [totals] = await connection.query<RowDataPacket[]>(
            `
            SELECT 
              COALESCE(SUM(rd.requested_quantity), 0) AS total_requested,
              (
                SELECT COALESCE(SUM(r.received_quantity), 0)
                FROM receive_details r
                WHERE r.request_fk IN (
                  SELECT id FROM request_details WHERE request_number = ?
                )
                AND r.approval_status = 'APPROVED'
              ) AS total_received_approved
            FROM request_details rd
            WHERE rd.request_number = ?
            `,
            [requestNumber, requestNumber]
        );
        const totalRequested = Number(totals[0]?.total_requested || 0);
        const totalApprovedReceived = Number(totals[0]?.total_received_approved || 0);
        if (totalRequested > 0 && totalApprovedReceived >= totalRequested) {
            await connection.rollback();
            logEvents(`Failed to force close request - Request fully received already (treat as closed): ${requestNumber}`, "requestLog.log");
            res.status(409).json({
                error: 'Conflict',
                message: 'Already Closed'
            });
            return;
        }

        // Force close the request
        await connection.query(
            `UPDATE request_details 
             SET approval_status = 'CLOSED',
                 rejected_by = ?,
                 rejection_reason = 'Force closed by administrator'
             WHERE request_number = ?`,
            [closedBy, requestNumber]
        );

        // Get user ID for notification
        const [users] = await connection.query<RowDataPacket[]>(
            'SELECT id FROM users WHERE username = ?',
            [requestedBy]
        );

        if (users.length > 0) {
            const userId = users[0].id;
            await connection.query(
                `INSERT INTO notifications (user_id, reference_type, message, is_read, created_at) 
                 VALUES (?, ?, ?, 0, NOW())`,
                [
                    userId,
                    'request_closed',
                    `Your request ${requestNumber} has been force closed by an administrator.`
                ]
            );
        }

        await connection.commit();
        logEvents(`Successfully force closed request ${requestNumber} by user: ${closedBy}`, "requestLog.log");
        
        // Send force close email
        await sendRequestForceCloseEmail(requestNumber);
        
        res.status(200).json({ 
            message: 'Request force closed successfully',
            requestNumber
        });
    } catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error force closing request ${req.params.requestNumber}: ${errorMessage} by user: ${req.body.closedBy}`, "requestLog.log");
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while force closing the request'
        });
    } finally {
        connection.release();
    }
};

export const getRequestById = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    
    try {
        const { id } = req.params;

        const [requestRows] = await connection.query<RowDataPacket[]>(
            'SELECT request_number FROM request_details WHERE id = ?',
            [id]
        );

        if (requestRows.length === 0) {
            logEvents(`Failed to fetch request - Request not found: ${id}`, "requestLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Request not found'
            });
            return;
        }

        const requestNumber = requestRows[0].request_number;

        const [items] = await connection.query<RequestWithItems[]>(
            `SELECT id, request_number, request_date, part_number, item_name, unit,
                    requested_quantity, current_balance, previous_rate, equipment_number,
                    image_path, specifications, remarks, requested_by, requested_by_id, requested_by_email, approval_status, nac_code
             FROM request_details
             WHERE request_number = ?
             ORDER BY id`,
            [requestNumber]
        );

        if (items.length === 0) {
            logEvents(`Failed to fetch request items - No items found for request: ${requestNumber}`, "requestLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Request items not found'
            });
            return;
        }

        const requestDetails = {
            requestNumber: items[0].request_number,
            requestDate: items[0].request_date,
            requestedBy: items[0].requested_by,
            approvalStatus: items[0].approval_status,
            items: items.map(item => ({
                id: item.id,
                partNumber: item.part_number,
                itemName: item.item_name,
                unit: item.unit,
                requestedQuantity: item.requested_quantity,
                currentBalance: item.current_balance,
                previousRate: item.previous_rate,
                equipmentNumber: item.equipment_number,
                imageUrl: item.image_path,
                specifications: item.specifications,
                remarks: item.remarks,
                nacCode: item.nac_code,
                requestedById: item.requested_by_id || null,
                requestedByEmail: item.requested_by_email || null
            }))
        };
        
        logEvents(`Successfully fetched request ${requestNumber} with ${items.length} items`, "requestLog.log");
        res.status(200).json(requestDetails);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching request ${req.params.id}: ${errorMessage}`, "requestLog.log");
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching the request'
        });
    } finally {
        connection.release();
    }
};

export const searchRequests = async (req: Request, res: Response): Promise<void> => {
    const { universal, equipmentNumber, partNumber, page = 1, pageSize = 20 } = req.query;

    try {
        let query = `
            SELECT DISTINCT
                rd.id,
                rd.request_number,
                rd.request_date,
                rd.requested_by,
                rd.part_number,
                rd.item_name,
                rd.equipment_number,
                rd.requested_quantity,
                rd.approval_status,
                rd.nac_code,
                rd.reference_doc
            FROM request_details rd
            WHERE 1=1
        `;
        const params: (string | number)[] = [];

        // If no search parameters provided, show all requests
        if (!universal && !equipmentNumber && !partNumber) {
            // Get total count for pagination
            let countQuery = 'SELECT COUNT(DISTINCT rd.request_number) as total FROM request_details rd';
            const [countResult] = await pool.execute<RowDataPacket[]>(countQuery);
            const totalCount = (countResult as any)[0]?.total || 0;

            // Calculate pagination
            const currentPage = parseInt(page.toString()) || 1;
            const limit = parseInt(pageSize.toString()) || 20;
            const offset = (currentPage - 1) * limit;

            // First, get the distinct request numbers with pagination
            const distinctQuery = `
                SELECT DISTINCT rd.request_number, rd.request_date, rd.requested_by, rd.approval_status, rd.reference_doc
                FROM request_details rd
                ORDER BY rd.request_date DESC, CAST(SUBSTRING_INDEX(rd.request_number, 'RN', -1) AS UNSIGNED) DESC
                LIMIT ${limit} OFFSET ${offset}
            `;
            
            const [distinctResults] = await pool.execute<RowDataPacket[]>(distinctQuery);
            
            if (distinctResults.length === 0) {
                res.json({
                    data: [],
                    pagination: {
                        currentPage,
                        pageSize: limit,
                        totalCount,
                        totalPages: Math.ceil(totalCount / limit)
                    }
                });
                return;
            }

            // Get the request numbers for this page
            const requestNumbers = distinctResults.map((r: any) => `'${r.request_number}'`).join(',');
            
            // Now get all items for these request numbers
            const itemsQuery = `
                SELECT rd.*
                FROM request_details rd
                WHERE rd.request_number IN (${requestNumbers})
                ORDER BY rd.request_date DESC, CAST(SUBSTRING_INDEX(rd.request_number, 'RN', -1) AS UNSIGNED) DESC
            `;
            
            const [results] = await pool.execute<SearchRequestResult[]>(itemsQuery);
            
            const groupedResults = results.reduce((acc, result) => {
                if (!acc[result.request_number]) {
                    acc[result.request_number] = {
                        requestNumber: result.request_number,
                        requestDate: result.request_date,
                        requestedBy: result.requested_by,
                        approvalStatus: result.approval_status,
                        referenceDoc: result.reference_doc,
                        items: []
                    };
                }
                acc[result.request_number].items.push({
                    id: result.id,
                    partNumber: result.part_number,
                    itemName: result.item_name,
                    equipmentNumber: result.equipment_number,
                    requestedQuantity: result.requested_quantity,
                    nacCode: result.nac_code
                });
                return acc;
            }, {} as Record<string, any>);

            const response = Object.values(groupedResults);
            logEvents(`Successfully fetched all requests with ${response.length} results`, "requestLog.log");
            res.json({
                data: response,
                pagination: {
                    currentPage,
                    pageSize: limit,
                    totalCount,
                    totalPages: Math.ceil(totalCount / limit)
                }
            });
            return;
        }

        if (universal) {
            query += ` AND (
                rd.request_number LIKE ? OR
                rd.item_name LIKE ? OR
                rd.part_number LIKE ? OR
                rd.equipment_number LIKE ? OR
                rd.nac_code LIKE ?
            )`;
            params.push(`%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`);
        }

        if (equipmentNumber) {
            query += ` AND rd.equipment_number LIKE ?`;
            params.push(`%${equipmentNumber}%`);
        }

        if (partNumber) {
            query += ` AND rd.part_number LIKE ?`;
            params.push(`%${partNumber}%`);
        }

        // Calculate pagination
        const currentPage = parseInt(page.toString()) || 1;
        const limit = parseInt(pageSize.toString()) || 20;
        const offset = (currentPage - 1) * limit;

        // First, get the distinct request numbers with pagination
        let distinctQuery = `
            SELECT DISTINCT rd.request_number, rd.request_date, rd.requested_by, rd.approval_status, rd.reference_doc
            FROM request_details rd
            WHERE 1=1
        `;
        
        if (universal) {
            distinctQuery += ` AND (
                rd.request_number LIKE ? OR
                rd.item_name LIKE ? OR
                rd.part_number LIKE ? OR
                rd.equipment_number LIKE ? OR
                rd.nac_code LIKE ?
            )`;
        }

        if (equipmentNumber) {
            distinctQuery += ` AND rd.equipment_number LIKE ?`;
        }

        if (partNumber) {
            distinctQuery += ` AND rd.part_number LIKE ?`;
        }

        distinctQuery += ` ORDER BY rd.request_date DESC, CAST(SUBSTRING_INDEX(rd.request_number, 'RN', -1) AS UNSIGNED) DESC LIMIT ${limit} OFFSET ${offset}`;
        
        const [distinctResults] = await pool.execute<RowDataPacket[]>(distinctQuery, params);
        
        if (distinctResults.length === 0) {
            res.json({
                data: [],
                pagination: {
                    currentPage,
                    pageSize: limit,
                    totalCount: 0,
                    totalPages: 0
                }
            });
            return;
        }

        // Get the request numbers for this page
        const requestNumbers = distinctResults.map((r: any) => `'${r.request_number}'`).join(',');
        
        // Now get all items for these request numbers
        const itemsQuery = `
            SELECT rd.*
            FROM request_details rd
            WHERE rd.request_number IN (${requestNumbers})
            ORDER BY rd.request_date DESC, CAST(SUBSTRING_INDEX(rd.request_number, 'RN', -1) AS UNSIGNED) DESC
        `;
        
        const [results] = await pool.execute<SearchRequestResult[]>(itemsQuery);
        
        // Get total count for pagination
        let totalCount = 0;
        try {
            let countQuery = 'SELECT COUNT(DISTINCT rd.request_number) as total FROM request_details rd WHERE 1=1';
            const countParams: (string | number)[] = [];

            if (universal) {
                countQuery += ` AND (
                    rd.request_number LIKE ? OR
                    rd.item_name LIKE ? OR
                    rd.part_number LIKE ? OR
                    rd.nac_code LIKE ?
                )`;
                countParams.push(`%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`);
            }

            if (equipmentNumber) {
                countQuery += ` AND rd.equipment_number LIKE ?`;
                countParams.push(`%${equipmentNumber}%`);
            }

            if (partNumber) {
                countQuery += ` AND rd.part_number LIKE ?`;
                countParams.push(`%${partNumber}%`);
            }

            const [countResult] = await pool.execute<RowDataPacket[]>(countQuery, countParams);
            totalCount = (countResult as any)[0]?.total || 0;
        } catch (countError) {
            logEvents(`Count query failed: ${JSON.stringify(countError)}`, "requestLog.log");
            // Continue without count if it fails
        }
        
        const groupedResults = results.reduce((acc, result) => {
            if (!acc[result.request_number]) {
                acc[result.request_number] = {
                    requestNumber: result.request_number,
                    requestDate: result.request_date,
                    requestedBy: result.requested_by,
                    approvalStatus: result.approval_status,
                    referenceDoc: result.reference_doc,
                    items: []
                };
            }
            acc[result.request_number].items.push({
                id: result.id,
                partNumber: result.part_number,
                itemName: result.item_name,
                equipmentNumber: result.equipment_number,
                requestedQuantity: result.requested_quantity,
                nacCode: result.nac_code
            });
            return acc;
        }, {} as Record<string, any>);

        const response = Object.values(groupedResults);
        logEvents(`Successfully searched requests with ${response.length} results`, "requestLog.log");
        res.json({
            data: response,
            pagination: {
                currentPage,
                pageSize: limit,
                totalCount,
                totalPages: Math.ceil(totalCount / limit)
            }
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error searching requests: ${errorMessage}`, "requestLog.log");
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while searching requests'
        });
    }
};

export const getLastRequestInfo = async (req: Request, res: Response): Promise<void> => {
    try {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT 
                request_number,
                request_date,
                COUNT(*) as number_of_items
             FROM request_details 
             GROUP BY request_number, request_date
             ORDER BY request_date DESC, request_number DESC
             LIMIT 1`
        );

        if (rows.length === 0) {
            logEvents(`Failed to fetch last request info - No requests found`, "requestLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'No requests found'
            });
            return;
        }

        const lastRequest = {
            requestNumber: rows[0].request_number,
            requestDate: rows[0].request_date,
            numberOfItems: rows[0].number_of_items
        };

        logEvents(`Successfully fetched last request info: ${lastRequest.requestNumber}`, "requestLog.log");
        res.status(200).json(lastRequest);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching last request info: ${errorMessage}`, "requestLog.log");
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching last request info'
        });
    }
};

export const getNextRequestNumber = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        // Read section_code and current_fy from app_config
        const [configRows] = await connection.query<RowDataPacket[]>(
            'SELECT config_name, config_value FROM app_config WHERE config_name IN (?, ?)',
            ['section_code', 'current_fy']
        );

        let sectionCode = '';
        let currentFy = '';
        for (const r of configRows as any[]) {
            if (r.config_name === 'section_code') sectionCode = r.config_value;
            if (r.config_name === 'current_fy') currentFy = r.config_value;
        }
        // Get last request number
        const [lastRows] = await connection.query<RowDataPacket[]>(
            `SELECT request_number FROM request_details GROUP BY request_number ORDER BY MAX(request_date) DESC, request_number DESC LIMIT 1`
        );
        const lastRequestNumber = lastRows.length > 0 ? lastRows[0].request_number : null;

        const nextNumber = computeNextRequestNumber(lastRequestNumber, sectionCode || '', currentFy || '');
        res.status(200).json({ requestNumber: nextNumber });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching next request number: ${errorMessage}`, "requestLog.log");
        res.status(500).json({ error: 'Internal Server Error', message: errorMessage });
    } finally {
        connection.release();
    }
};

export const checkDuplicateRequest = async (req: Request, res: Response): Promise<void> => {
    try {
        const { nacCode } = req.query;

        if (!nacCode) {
            logEvents(`Failed to check duplicate request - Missing NAC code parameter`, "requestLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'NAC code is required'
            });
            return;
        }

        // Check if there's a pending request with the same NAC code (excluding CLOSED and REJECTED)
        const [existingRequests] = await pool.query<RowDataPacket[]>(
            `SELECT COUNT(*) as count 
             FROM request_details 
             WHERE nac_code = ? 
             AND is_received = 0
             AND approval_status NOT IN ('CLOSED', 'REJECTED')`,
            [nacCode]
        );

        const isDuplicate = existingRequests[0].count > 0;

        logEvents(`Duplicate check for NAC code ${nacCode}: ${isDuplicate ? 'Duplicate found' : 'No duplicate'}`, "requestLog.log");
        
        res.status(200).json({
            isDuplicate,
            message: isDuplicate ? 'This item is already requested and pending approval' : 'Item is available for request'
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error checking duplicate request for NAC code ${req.query.nacCode}: ${errorMessage}`, "requestLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'An error occurred while checking for duplicate requests'
        });
    }
};

export const uploadReferenceDocument = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    
    try {
        const userPermissions = req.permissions || [];
        const { requestNumber, imagePath } = req.body;
        
        // Check if a reference document already exists for this request
        const [existingDoc] = await connection.query<RowDataPacket[]>(
            'SELECT reference_doc FROM request_details WHERE request_number = ? AND reference_doc IS NOT NULL LIMIT 1',
            [requestNumber]
        );
        
        const isEdit = existingDoc.length > 0 && existingDoc[0].reference_doc;
        
        // Check appropriate permission based on whether it's upload or edit
        if (isEdit) {
            if (!userPermissions.includes('can_edit_reference_documents')) {
                res.status(403).json({
                    error: 'Forbidden',
                    message: 'You do not have permission to edit/replace reference documents'
                });
                return;
            }
        } else {
            if (!userPermissions.includes('can_upload_reference_documents')) {
                res.status(403).json({
                    error: 'Forbidden',
                    message: 'You do not have permission to upload reference documents'
                });
                return;
            }
        }

        // Validate required fields
        if (!requestNumber || !imagePath) {
            logEvents(`Failed to upload reference document - Missing required fields: requestNumber=${requestNumber}, imagePath=${imagePath}`, "requestLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'Request number and image path are required'
            });
            return;
        }

        logEvents(`Starting reference document upload for request: ${requestNumber}`, "requestLog.log");

        await connection.beginTransaction();

        // First, check if the request exists
        const [existingRequests] = await connection.query<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM request_details WHERE request_number = ?',
            [requestNumber]
        );

        if (existingRequests[0].count === 0) {
            await connection.rollback();
            logEvents(`Failed to upload reference document - Request not found: ${requestNumber}`, "requestLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Request not found'
            });
            return;
        }

        // Update all records in request_details table with the specified request_number
        // Set reference_document_uploaded_date only if it's the first upload (not an edit)
        const updateQuery = isEdit 
            ? `UPDATE request_details 
               SET reference_doc = ?, 
                   updated_at = CURRENT_TIMESTAMP
               WHERE request_number = ?`
            : `UPDATE request_details 
               SET reference_doc = ?, 
                   reference_document_uploaded_date = NOW(),
                   updated_at = CURRENT_TIMESTAMP
               WHERE request_number = ?`;
        
        const [updateResult] = await connection.query(
            updateQuery,
            [imagePath, requestNumber]
        );

        if ((updateResult as any).affectedRows === 0) {
            await connection.rollback();
            logEvents(`Failed to upload reference document - No records updated for request: ${requestNumber}`, "requestLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'No request records found to update'
            });
            return;
        }

        await connection.commit();

        logEvents(`Successfully uploaded reference document for request: ${requestNumber}. Updated ${(updateResult as any).affectedRows} records.`, "requestLog.log");
        
        res.status(200).json({
            message: 'Reference document uploaded successfully',
            requestNumber: requestNumber,
            imagePath: imagePath,
            updatedRecords: (updateResult as any).affectedRows
        });

    } catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error uploading reference document: ${errorMessage}`, "requestLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'An error occurred while uploading reference document'
        });
    } finally {
        connection.release();
    }
};

export const deleteReferenceDocument = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();

    try {
        const userPermissions = req.permissions || [];
        if (!userPermissions.includes('can_delete_reference_documents')) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'You do not have permission to delete reference documents'
            });
            return;
        }

        const { requestNumber } = req.params;

        if (!requestNumber) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Request number is required'
            });
            return;
        }

        await connection.beginTransaction();

        const [updateResult] = await connection.query(
            `UPDATE request_details
             SET reference_doc = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE request_number = ?`,
            [requestNumber]
        );

        if ((updateResult as any).affectedRows === 0) {
            await connection.rollback();
            res.status(404).json({
                error: 'Not Found',
                message: 'No request records found to update'
            });
            return;
        }

        await connection.commit();
        logEvents(`Deleted reference document for request ${requestNumber}`, 'requestLog.log');
        res.status(200).json({
            message: 'Reference document deleted successfully',
            requestNumber,
            updatedRecords: (updateResult as any).affectedRows
        });
    } catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error deleting reference document: ${errorMessage}`, 'requestLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'An error occurred while deleting reference document'
        });
    } finally {
        connection.release();
    }
};