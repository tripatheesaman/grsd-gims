import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2/promise';
import pool from '../config/db';
import { formatDateForDB } from '../utils/dateUtils';
import { logEvents } from '../middlewares/logger';
import { rebuildNacInventoryState } from '../services/issueInventoryService';
interface TransferrableItem extends RowDataPacket {
    id: number;
    nac_code: string;
    item_name: string;
    part_number: string;
    received_quantity: number;
    transferred_quantity: number;
    transferrable_quantity: number;
    total_amount: number;
    rrp_number: string;
    rrp_date: string;
    supplier_name: string;
}
interface BalanceTransferRequest {
    fromNacCode: string;
    toNacCode: string;
    transferQuantity: number;
    transferDate: string;
    transferredBy: string;
}
export const getTransferrableItems = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const [results] = await connection.query<TransferrableItem[]>(`SELECT 
        rd.id,
        rd.nac_code,
        rd.item_name,
        rd.part_number,
        rd.received_quantity,
        COALESCE(rd.transferred_quantity, 0) as transferred_quantity,
        (rd.received_quantity - COALESCE(rd.transferred_quantity, 0)) as transferrable_quantity,
        rrp.total_amount,
        rrp.rrp_number,
        rrp.date as rrp_date,
        rrp.supplier_name
      FROM receive_details rd
      JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
      WHERE rd.rrp_fk IS NOT NULL 
        AND rrp.approval_status = 'APPROVED'
        AND rrp.rrp_number != 'Code Transfer'
        AND (rd.received_quantity - COALESCE(rd.transferred_quantity, 0)) > 0
      ORDER BY rd.nac_code, rd.created_at DESC`);
        res.status(200).json(results);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getTransferrableItems: ${errorMessage}`, "balanceTransferLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const getExistingNacCodes = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const [results] = await connection.query<RowDataPacket[]>('SELECT DISTINCT nac_code FROM stock_details ORDER BY nac_code');
        const nacCodes = results.map(row => row.nac_code);
        res.status(200).json(nacCodes);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getExistingNacCodes: ${errorMessage}`, "balanceTransferLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const getAllBalanceTransfers = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const [results] = await connection.query<RowDataPacket[]>(`SELECT 
        rrp.id,
        rrp.rrp_number,
        rrp.date as transfer_date,
        rrp.total_amount as transfer_amount,
        rrp.created_by as transferred_by,
        rd.nac_code as to_nac_code,
        rd.received_quantity as transfer_quantity,
        rd.part_number,
        COALESCE(rd.item_name, sd.item_name, 'N/A') as item_name,
        -- Get the source NAC code from the issue record that matches the transfer
        COALESCE(
          id_issue.nac_code,
          (SELECT id2.nac_code
           FROM issue_details id2
           WHERE id2.issued_for = CONCAT('code_transfer_to_', rd.nac_code)
           AND ABS(TIMESTAMPDIFF(HOUR, id2.issue_date, rrp.date)) <= 24
           AND id2.issue_quantity = rd.received_quantity
           ORDER BY ABS(TIMESTAMPDIFF(HOUR, id2.issue_date, rrp.date)) ASC, id2.id DESC
           LIMIT 1),
          'Unknown'
        ) as from_nac_code
      FROM rrp_details rrp
      JOIN receive_details rd ON rrp.receive_fk = rd.id
      LEFT JOIN stock_details sd ON rd.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
      LEFT JOIN issue_details id_issue ON 
        id_issue.issued_for = CONCAT('code_transfer_to_', rd.nac_code)
        AND DATE(id_issue.issue_date) = DATE(rrp.date)
        AND id_issue.issue_quantity = rd.received_quantity
        AND COALESCE(id_issue.part_number, '') = COALESCE(rd.part_number, '')
      WHERE rrp.rrp_number = 'Code Transfer'
      ORDER BY rrp.date DESC`);
        const processedResults = results.map((row: any) => {
            const fromNacCode = row.from_nac_code || 'Unknown';
            return {
                id: row.id,
                rrpNumber: row.rrp_number,
                transferDate: row.transfer_date,
                transferAmount: row.transfer_amount,
                transferredBy: row.transferred_by,
                fromNacCode: fromNacCode,
                toNacCode: row.to_nac_code,
                transferQuantity: row.transfer_quantity,
                partNumber: row.part_number,
                itemName: row.item_name
            };
        });
        logEvents(`Successfully retrieved ${processedResults.length} balance transfer records`, "balanceTransferLog.log");
        res.status(200).json(processedResults);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getAllBalanceTransfers: ${errorMessage}`, "balanceTransferLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const exportBalanceTransfers = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const { exportType, fromDate, toDate, page, pageSize } = req.body;
        let query = `
      SELECT 
        rrp.id,
        rrp.rrp_number,
        rrp.date as transfer_date,
        rrp.total_amount as transfer_amount,
        rrp.created_by as transferred_by,
        rd.nac_code as to_nac_code,
        rd.received_quantity as transfer_quantity,
        rd.part_number,
        COALESCE(rd.item_name, sd.item_name, 'N/A') as item_name,
        COALESCE(
          id_issue.nac_code,
          (SELECT id2.nac_code
           FROM issue_details id2
           WHERE id2.issued_for = CONCAT('code_transfer_to_', rd.nac_code)
           AND ABS(TIMESTAMPDIFF(HOUR, id2.issue_date, rrp.date)) <= 24
           AND id2.issue_quantity = rd.received_quantity
           ORDER BY ABS(TIMESTAMPDIFF(HOUR, id2.issue_date, rrp.date)) ASC, id2.id DESC
           LIMIT 1),
          'Unknown'
        ) as from_nac_code
      FROM rrp_details rrp
      JOIN receive_details rd ON rrp.receive_fk = rd.id
      LEFT JOIN stock_details sd ON rd.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
      LEFT JOIN issue_details id_issue ON 
        id_issue.issued_for = CONCAT('code_transfer_to_', rd.nac_code)
        AND DATE(id_issue.issue_date) = DATE(rrp.date)
        AND id_issue.issue_quantity = rd.received_quantity
        AND COALESCE(id_issue.part_number, '') = COALESCE(rd.part_number, '')
      WHERE rrp.rrp_number = 'Code Transfer'
    `;
        const queryParams: any[] = [];
        if (exportType === 'dateRange' && fromDate && toDate) {
            query += ` AND DATE(rrp.date) BETWEEN ? AND ?`;
            queryParams.push(fromDate, toDate);
        }
        query += ` ORDER BY rrp.date DESC`;
        if (exportType === 'currentPage' && page && pageSize) {
            query += ` LIMIT ? OFFSET ?`;
            queryParams.push(parseInt(pageSize), (parseInt(page) - 1) * parseInt(pageSize));
        }
        const [results] = await connection.query<RowDataPacket[]>(query, queryParams);
        const processedResults = results.map((row: any) => {
            const fromNacCode = row.from_nac_code || 'Unknown';
            return {
                'Transfer Date': new Date(row.transfer_date).toLocaleDateString('en-GB'),
                'From NAC Code': fromNacCode,
                'To NAC Code': row.to_nac_code,
                'Item Name': row.item_name,
                'Part Number': row.part_number,
                'Quantity': row.transfer_quantity,
                'Amount (NPR)': row.transfer_amount,
                'Transferred By': row.transferred_by,
                'RRP Number': row.rrp_number
            };
        });
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Balance Transfer Report');
        if (processedResults.length > 0) {
            const headers = Object.keys(processedResults[0]);
            worksheet.addRow(headers);
            const headerRow = worksheet.getRow(1);
            headerRow.font = { bold: true };
            headerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF003594' }
            };
            headerRow.font.color = { argb: 'FFFFFFFF' };
            processedResults.forEach(record => {
                worksheet.addRow(Object.values(record));
            });
            worksheet.columns.forEach((column: any) => {
                column.width = Math.max(column.header ? column.header.length : 10, ...processedResults.map(row => String(row[column.key as keyof typeof row]).length));
            });
        }
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Balance_Transfer_Report_${new Date().toISOString().split('T')[0]}.xlsx"`);
        await workbook.xlsx.write(res);
        logEvents(`Successfully exported ${processedResults.length} balance transfer records`, "balanceTransferLog.log");
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in exportBalanceTransfers: ${errorMessage}`, "balanceTransferLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const transferBalance = async (req: Request, res: Response): Promise<void> => {
    const { fromNacCode, toNacCode, transferQuantity, transferDate, transferredBy }: BalanceTransferRequest = req.body;
    if (!fromNacCode || !toNacCode || !transferQuantity || !transferDate || !transferredBy) {
        res.status(400).json({
            error: 'Bad Request',
            message: 'All fields are required'
        });
        return;
    }
    if (fromNacCode === toNacCode) {
        res.status(400).json({
            error: 'Bad Request',
            message: 'Cannot transfer to the same NAC code'
        });
        return;
    }
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        logEvents(`Starting balance transfer transaction from ${fromNacCode} to ${toNacCode}`, "balanceTransferLog.log");
        const [sourceItems] = await connection.query<RowDataPacket[]>(`SELECT 
        rd.id as receive_id,
        rd.nac_code,
        COALESCE(sd.item_name, 'Unknown Item') as item_name,
        rd.part_number,
        rd.received_quantity,
        COALESCE(rd.transferred_quantity, 0) as transferred_quantity,
        (rd.received_quantity - COALESCE(rd.transferred_quantity, 0)) as transferrable_quantity,
        rrp.total_amount,
        rrp.id as rrp_id
      FROM receive_details rd
      JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
      LEFT JOIN stock_details sd ON rd.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
      WHERE rd.nac_code = ? 
        AND rd.rrp_fk IS NOT NULL 
        AND rrp.approval_status = 'APPROVED'
        AND (rd.received_quantity - COALESCE(rd.transferred_quantity, 0)) >= ?
      ORDER BY rd.created_at ASC
      LIMIT 1`, [fromNacCode, transferQuantity]);
        if (sourceItems.length === 0) {
            await connection.rollback();
            res.status(400).json({
                error: 'Bad Request',
                message: 'Insufficient transferrable quantity or item not found'
            });
            return;
        }
        const sourceItem = sourceItems[0];
        const [destItems] = await connection.query<RowDataPacket[]>('SELECT id FROM stock_details WHERE nac_code = ?', [toNacCode]);
        if (destItems.length === 0) {
            await connection.rollback();
            res.status(400).json({
                error: 'Bad Request',
                message: 'Destination NAC code does not exist'
            });
            return;
        }
        const transferCost = (sourceItem.total_amount / sourceItem.received_quantity) * transferQuantity;
        const formattedTransferDate = formatDateForDB(transferDate);
        if (!formattedTransferDate) {
            await connection.rollback();
            res.status(400).json({
                error: 'Bad Request',
                message: 'Invalid transfer date format'
            });
            return;
        }
        const [configRows] = await connection.query<RowDataPacket[]>('SELECT config_value FROM app_config WHERE config_type = ? AND config_name = ?', ['rrp', 'current_fy']);
        if (configRows.length === 0) {
            await connection.rollback();
            logEvents(`Failed to transfer balance - Current FY configuration not found`, "balanceTransferLog.log");
            res.status(500).json({
                error: 'Internal Server Error',
                message: 'Current FY configuration not found'
            });
            return;
        }
        const currentFY = configRows[0].config_value;
        const [issueSlipResults] = await connection.query<RowDataPacket[]>(`SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(issue_slip_number, '-', -1) AS UNSIGNED)), 0) + 1 as next_number
       FROM issue_details 
       WHERE DATE(issue_date) = ?`, [formattedTransferDate]);
        const nextIssueNumber = issueSlipResults[0].next_number;
        const issueSlipNumber = `${formattedTransferDate.split('T')[0]}-${nextIssueNumber.toString().padStart(3, '0')}`;
        const [issueResult] = await connection.execute(`INSERT INTO issue_details (
        issue_date, issue_slip_number, nac_code, part_number,
        issue_quantity, issue_cost, remaining_balance,
        issued_for, issued_by, current_fy,
        approval_status, approved_by
      ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?)`, [
            formattedTransferDate,
            issueSlipNumber,
            fromNacCode,
            sourceItem.part_number,
            transferQuantity,
            `code_transfer_to_${toNacCode}`,
            transferredBy,
            currentFY,
            'APPROVED',
            transferredBy
        ]);
        const issueId = (issueResult as any).insertId;
        await connection.execute('UPDATE stock_details SET current_balance = current_balance - ? WHERE nac_code = ?', [transferQuantity, fromNacCode]);
        const [receiveResult] = await connection.execute(`INSERT INTO receive_details (
        request_fk, rrp_fk, nac_code, part_number, 
        received_quantity, received_by, receive_date, 
        approval_status, remaining_quantity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            0,
            null,
            toNacCode,
            sourceItem.part_number,
            transferQuantity,
            transferredBy,
            formattedTransferDate,
            'APPROVED',
            transferQuantity
        ]);
        const receiveId = (receiveResult as any).insertId;
        const [rrpResult] = await connection.execute(`INSERT INTO rrp_details (
        receive_fk, rrp_number, supplier_name, date, currency, forex_rate,
        item_price, customs_charge, customs_service_charge, vat_percentage,
        invoice_number, invoice_date, po_number, airway_bill_number,
        inspection_details, approval_status, created_by, total_amount,
        freight_charge, customs_date, customs_number, current_fy
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            receiveId,
            'Code Transfer',
            'N/A',
            formattedTransferDate,
            'NPR',
            1,
            transferCost,
            0,
            0,
            0,
            'N/A',
            formattedTransferDate,
            'N/A',
            'N/A',
            JSON.stringify({
                inspection_user: 'N/A',
                inspection_details: {}
            }),
            'APPROVED',
            transferredBy,
            transferCost,
            0,
            formattedTransferDate,
            'N/A',
            currentFY
        ]);
        const rrpId = (rrpResult as any).insertId;
        await connection.execute('UPDATE receive_details SET rrp_fk = ? WHERE id = ?', [rrpId, receiveId]);
        await connection.execute('UPDATE stock_details SET current_balance = current_balance + ? WHERE nac_code = ?', [transferQuantity, toNacCode]);
        await connection.execute('UPDATE receive_details SET transferred_quantity = COALESCE(transferred_quantity, 0) + ? WHERE id = ?', [transferQuantity, sourceItem.receive_id]);
        await connection.execute(`UPDATE issue_details 
       SET nac_code = ?, part_number = ?
       WHERE nac_code = ? 
         AND part_number = ? 
         AND DATE(issue_date) >= ?
         AND id != ?`, [
            toNacCode,
            sourceItem.part_number,
            fromNacCode,
            sourceItem.part_number,
            formattedTransferDate,
            issueId
        ]);
        await rebuildNacInventoryState(connection, fromNacCode);
        await rebuildNacInventoryState(connection, toNacCode);
        await connection.commit();
        logEvents(`Successfully transferred balance from ${fromNacCode} to ${toNacCode}`, "balanceTransferLog.log");
        res.status(200).json({
            message: 'Balance transferred successfully',
            transferId: issueId,
            issueSlipNumber,
            transferCost
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in transferBalance: ${errorMessage}`, "balanceTransferLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const revertBalanceTransfer = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        await connection.beginTransaction();
        const [transferDetails] = await connection.query<RowDataPacket[]>(`SELECT 
        rrp.id,
        rrp.receive_fk,
        rrp.date,
        rrp.total_amount,
        rd.nac_code as to_nac_code,
        rd.received_quantity,
        rd.part_number,
        rd.item_name,
        (SELECT id.nac_code
         FROM issue_details id
         WHERE id.issued_for = CONCAT('code_transfer_to_', rd.nac_code)
         AND DATE(id.issue_date) = DATE(rrp.date)
         AND id.issue_quantity = rd.received_quantity
         LIMIT 1) as from_nac_code
      FROM rrp_details rrp
      JOIN receive_details rd ON rrp.receive_fk = rd.id
      WHERE rrp.id = ? AND rrp.rrp_number = 'Code Transfer'`, [id]);
        if (transferDetails.length === 0) {
            await connection.rollback();
            res.status(404).json({
                error: 'Not Found',
                message: 'Balance transfer record not found'
            });
            return;
        }
        const transfer = transferDetails[0];
        const fromNacCode = transfer.from_nac_code;
        const toNacCode = transfer.to_nac_code;
        const quantity = transfer.received_quantity;
        if (!fromNacCode) {
            await connection.rollback();
            res.status(400).json({
                error: 'Bad Request',
                message: 'Source NAC code not found for this transfer'
            });
            return;
        }
        await connection.query('DELETE FROM rrp_details WHERE id = ?', [id]);
        await connection.query('DELETE FROM receive_details WHERE id = ?', [transfer.receive_fk]);
        await connection.query('DELETE FROM issue_details WHERE issued_for = ? AND DATE(issue_date) = DATE(?) AND issue_quantity = ?', [`code_transfer_to_${toNacCode}`, transfer.date, quantity]);
        await connection.query('UPDATE stock_details SET current_balance = current_balance - ? WHERE nac_code = ?', [quantity, toNacCode]);
        await connection.query('UPDATE stock_details SET current_balance = current_balance + ? WHERE nac_code = ?', [quantity, fromNacCode]);
        await connection.query(`UPDATE issue_details 
       SET nac_code = ?, part_number = ?
       WHERE nac_code = ? 
         AND part_number = ? 
         AND DATE(issue_date) >= ?
         AND issued_for != ?`, [
            fromNacCode,
            transfer.part_number,
            toNacCode,
            transfer.part_number,
            transfer.date,
            `code_transfer_to_${toNacCode}`
        ]);
        const [sourceRRP] = await connection.query<RowDataPacket[]>(`SELECT rd.id, rd.transferred_quantity
       FROM receive_details rd
       JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
       WHERE rd.nac_code = ? AND rrp.rrp_number != 'Code Transfer'
       ORDER BY rrp.date DESC
       LIMIT 1`, [fromNacCode]);
        if (sourceRRP.length > 0) {
            const newTransferredQuantity = Math.max(0, sourceRRP[0].transferred_quantity - quantity);
            await connection.query('UPDATE receive_details SET transferred_quantity = ? WHERE id = ?', [newTransferredQuantity, sourceRRP[0].id]);
        }
        await connection.commit();
        logEvents(`Successfully reverted balance transfer ID: ${id} from ${fromNacCode} to ${toNacCode}`, "balanceTransferLog.log");
        res.status(200).json({
            message: 'Balance transfer reverted successfully',
            details: {
                fromNacCode,
                toNacCode,
                quantity,
                date: transfer.date
            }
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in revertBalanceTransfer: ${errorMessage}`, "balanceTransferLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
