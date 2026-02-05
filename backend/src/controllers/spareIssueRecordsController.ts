import { Request, Response } from 'express';
import pool from '../config/db';
import { RowDataPacket, PoolConnection } from 'mysql2/promise';
import { formatDate, formatDateForDB } from '../utils/dateUtils';
import { logEvents } from '../middlewares/logger';
const getExistingDateForSlipNumber = async (connection: PoolConnection, issueSlipNumber: string): Promise<string | null> => {
    const [results] = await connection.execute<RowDataPacket[]>('SELECT issue_date FROM issue_details WHERE issue_slip_number = ? LIMIT 1', [issueSlipNumber]);
    return results.length > 0 ? results[0].issue_date : null;
};
const generateIssueSlipNumber = async (connection: PoolConnection, issueDate: string): Promise<string> => {
    const [configRows] = await connection.execute<RowDataPacket[]>('SELECT config_value FROM app_config WHERE config_type = ? AND config_name = ?', ['rrp', 'current_fy']);
    if (configRows.length === 0) {
        throw new Error('Current FY configuration not found');
    }
    const currentFY = configRows[0].config_value;
    const [dayNumberResult] = await connection.execute<RowDataPacket[]>(`SELECT 
      CASE 
        WHEN MIN(issue_date) IS NULL THEN 1
        ELSE DATEDIFF(?, MIN(issue_date)) + 1
      END as day_number
    FROM issue_details 
    WHERE current_fy = ?`, [issueDate, currentFY]);
    const dayNumber = dayNumberResult[0].day_number;
    return `${dayNumber}Y${currentFY}`;
};
interface SpareIssueRecord {
    id: number;
    issue_slip_number: string;
    issue_date: string;
    nac_code: string;
    part_number: string;
    item_name: string;
    issue_quantity: number;
    issue_cost: number;
    remaining_balance: number;
    issued_for: string;
    issued_by: string;
    approval_status: string;
}
interface SpareIssueFormData {
    issue_slip_number: string;
    issue_date: string;
    nac_code: string;
    part_number: string;
    issue_quantity: number;
    issue_cost: number;
    remaining_balance: number;
    issued_for: string;
    issued_by: string;
    approval_status: string;
}
export const getAllSpareIssueRecords = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const { page = 1, limit = 10, search = '', issueSlipNumber = '', partNumber = '', itemName = '', nacCode = '', issuedFor = '', status = '', issuedBy = '', sortBy = 'issue_date', sortOrder = 'DESC' } = req.query;
        const offset = (Number(page) - 1) * Number(limit);
        const allowedSortFields = ['issue_slip_number', 'issue_date', 'nac_code', 'issue_quantity', 'issue_cost', 'approval_status'];
        const validSortBy = allowedSortFields.includes(sortBy as string) ? sortBy as string : 'issue_date';
        const validSortOrder = (sortOrder as string).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
        let searchConditions = '';
        const searchParams: any[] = [];
        if (search) {
            searchConditions += ' AND (i.issue_slip_number LIKE ? OR i.nac_code LIKE ? OR i.part_number LIKE ? OR s.item_name LIKE ? OR i.issued_for LIKE ? OR i.issued_by LIKE ?)';
            const searchTerm = `%${search}%`;
            searchParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
        }
        if (issueSlipNumber) {
            searchConditions += ' AND i.issue_slip_number LIKE ?';
            searchParams.push(`%${issueSlipNumber}%`);
        }
        if (partNumber) {
            searchConditions += ' AND i.part_number LIKE ?';
            searchParams.push(`%${partNumber}%`);
        }
        if (itemName) {
            searchConditions += ' AND s.item_name LIKE ?';
            searchParams.push(`%${itemName}%`);
        }
        if (nacCode) {
            searchConditions += ' AND i.nac_code = ?';
            searchParams.push(nacCode);
        }
        if (issuedFor) {
            searchConditions += ' AND i.issued_for = ?';
            searchParams.push(issuedFor);
        }
        if (status) {
            searchConditions += ' AND i.approval_status = ?';
            searchParams.push(status);
        }
        if (issuedBy) {
            searchConditions += ' AND JSON_UNQUOTE(JSON_EXTRACT(i.issued_by, "$.name")) = ?';
            searchParams.push(issuedBy);
        }
        const countQuery = 'SELECT COUNT(*) as total FROM issue_details i LEFT JOIN stock_details s ON i.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci WHERE i.nac_code NOT IN (?, ?)' + searchConditions;
        const [countResult] = await connection.execute<RowDataPacket[]>(countQuery, ['GT 07986', 'GT 00000', ...searchParams]);
        const total = countResult[0].total;
        let orderByClause = 'ORDER BY i.issue_date DESC';
        if (validSortBy === 'issue_slip_number') {
            orderByClause = validSortOrder === 'ASC' ? 'ORDER BY i.issue_slip_number ASC' : 'ORDER BY i.issue_slip_number DESC';
        }
        else if (validSortBy === 'issue_date') {
            orderByClause = validSortOrder === 'ASC' ? 'ORDER BY i.issue_date ASC' : 'ORDER BY i.issue_date DESC';
        }
        else if (validSortBy === 'nac_code') {
            orderByClause = validSortOrder === 'ASC' ? 'ORDER BY i.nac_code ASC' : 'ORDER BY i.nac_code DESC';
        }
        else if (validSortBy === 'issue_quantity') {
            orderByClause = validSortOrder === 'ASC' ? 'ORDER BY i.issue_quantity ASC' : 'ORDER BY i.issue_quantity DESC';
        }
        else if (validSortBy === 'issue_cost') {
            orderByClause = validSortOrder === 'ASC' ? 'ORDER BY i.issue_cost ASC' : 'ORDER BY i.issue_cost DESC';
        }
        else if (validSortBy === 'approval_status') {
            orderByClause = validSortOrder === 'ASC' ? 'ORDER BY i.approval_status ASC' : 'ORDER BY i.approval_status DESC';
        }
        const limitNum = parseInt(limit as string, 10);
        const offsetNum = parseInt(offset.toString(), 10);
        const queryParams = ['GT 07986', 'GT 00000', ...searchParams, limitNum.toString(), offsetNum.toString()];
        let mainQuery = `
      SELECT 
        i.id,
        i.issue_slip_number,
        i.issue_date,
        i.nac_code,
        i.part_number,
        SUBSTRING_INDEX(s.item_name, ',', 1) as item_name,
        i.issue_quantity,
        i.issue_cost,
        i.remaining_balance,
        i.issued_for,
        i.issued_by,
        i.approval_status
      FROM issue_details i
      LEFT JOIN stock_details s ON i.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
      WHERE i.nac_code NOT IN (?, ?)
    `;
        if (searchConditions) {
            mainQuery += searchConditions;
        }
        mainQuery += ` ${orderByClause} LIMIT ? OFFSET ?`;
        const [records] = await connection.execute<RowDataPacket[]>(mainQuery, queryParams);
        const formattedRecords = records.map(record => {
            let issuedBy = {};
            try {
                issuedBy = JSON.parse(record.issued_by || '{}');
            }
            catch (error) {
                issuedBy = { name: 'Unknown', staffId: 'Unknown' };
            }
            return {
                ...record,
                issued_by: issuedBy
            };
        });
        logEvents(`Successfully retrieved ${formattedRecords.length} spare issue records`, "spareIssueRecordsLog.log");
        res.status(200).json({
            message: 'Spare issue records retrieved successfully',
            records: formattedRecords,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(total / Number(limit))
            }
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error retrieving spare issue records: ${errorMessage}`, "spareIssueRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const getSpareIssueRecordById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const connection = await pool.getConnection();
    try {
        const [records] = await connection.execute<RowDataPacket[]>(`SELECT 
        i.id,
        i.issue_slip_number,
        i.issue_date,
        i.nac_code,
        i.part_number,
        SUBSTRING_INDEX(s.item_name, ',', 1) as item_name,
        i.issue_quantity,
        i.issue_cost,
        i.remaining_balance,
        i.issued_for,
        i.issued_by,
        i.approval_status
       FROM issue_details i
       LEFT JOIN stock_details s ON i.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
       WHERE i.id = ? AND i.nac_code NOT IN ('GT 07986', 'GT 00000')`, [id]);
        if (records.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Spare issue record not found'
            });
            return;
        }
        const record = {
            ...records[0],
            issued_by: JSON.parse(records[0].issued_by || '{}')
        };
        logEvents(`Successfully retrieved spare issue record ID: ${id}`, "spareIssueRecordsLog.log");
        res.status(200).json({
            message: 'Spare issue record retrieved successfully',
            record
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error retrieving spare issue record: ${errorMessage} for ID: ${id}`, "spareIssueRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const createSpareIssueRecord = async (req: Request, res: Response): Promise<void> => {
    const formData: SpareIssueFormData = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        if (!formData.issue_slip_number || !formData.issue_date || !formData.nac_code ||
            !formData.part_number || !formData.issue_quantity || !formData.issued_for || !formData.issued_by) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Missing required fields'
            });
            return;
        }
        const [stockCheck] = await connection.execute<RowDataPacket[]>('SELECT current_balance FROM stock_details WHERE nac_code = ?', [formData.nac_code]);
        if (stockCheck.length === 0) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Item with this NAC code not found in stock'
            });
            return;
        }
        const currentBalance = stockCheck[0].current_balance;
        if (formData.issue_quantity > currentBalance) {
            res.status(400).json({
                error: 'Bad Request',
                message: `Insufficient stock. Available: ${currentBalance}, Requested: ${formData.issue_quantity}`
            });
            return;
        }
        const remainingBalance = currentBalance - formData.issue_quantity;
        const [result] = await connection.execute(`INSERT INTO issue_details (
        issue_slip_number,
        issue_date,
        nac_code,
        part_number,
        issue_quantity,
        issue_cost,
        remaining_balance,
        issued_for,
        issued_by,
        approval_status,
        current_fy
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            formData.issue_slip_number,
            formatDateForDB(formData.issue_date),
            formData.nac_code,
            formData.part_number,
            formData.issue_quantity,
            formData.issue_cost || 0,
            remainingBalance,
            formData.issued_for,
            JSON.stringify(formData.issued_by),
            formData.approval_status || 'PENDING',
            new Date().getFullYear().toString()
        ]);
        const recordId = (result as any).insertId;
        await connection.execute('UPDATE stock_details SET current_balance = ? WHERE nac_code = ?', [remainingBalance, formData.nac_code]);
        await connection.commit();
        logEvents(`Successfully created spare issue record ID: ${recordId}`, "spareIssueRecordsLog.log");
        res.status(201).json({
            message: 'Spare issue record created successfully',
            recordId
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error creating spare issue record: ${errorMessage}`, "spareIssueRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const updateSpareIssueRecord = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const formData: Partial<SpareIssueFormData> = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [currentRecord] = await connection.execute<RowDataPacket[]>('SELECT * FROM issue_details WHERE id = ? AND nac_code NOT IN (\'GT 07986\', \'GT 00000\')', [id]);
        if (currentRecord.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Spare issue record not found'
            });
            return;
        }
        const record = currentRecord[0];
        const oldQuantity = record.issue_quantity;
        const newQuantity = formData.issue_quantity || oldQuantity;
        let finalIssueDate = formData.issue_date ? formatDateForDB(formData.issue_date) : record.issue_date;
        let finalIssueSlipNumber = formData.issue_slip_number || record.issue_slip_number;
        if (formData.issue_slip_number && formData.issue_slip_number !== record.issue_slip_number) {
            const existingDate = await getExistingDateForSlipNumber(connection, formData.issue_slip_number);
            if (existingDate) {
                finalIssueDate = existingDate;
                logEvents(`Auto-adjusted date to ${finalIssueDate} for slip number ${formData.issue_slip_number}`, "spareIssueRecordsLog.log");
            }
        }
        if (formData.issue_date && formData.issue_date !== record.issue_date) {
            try {
                finalIssueSlipNumber = await generateIssueSlipNumber(connection, finalIssueDate);
                logEvents(`Auto-generated slip number ${finalIssueSlipNumber} for date ${finalIssueDate}`, "spareIssueRecordsLog.log");
            }
            catch (error) {
                await connection.rollback();
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                res.status(500).json({
                    error: 'Internal Server Error',
                    message: `Failed to generate slip number: ${errorMessage}`
                });
                return;
            }
        }
        if (formData.issue_quantity && formData.issue_quantity !== oldQuantity) {
            const [stockCheck] = await connection.execute<RowDataPacket[]>('SELECT current_balance FROM stock_details WHERE nac_code = ?', [record.nac_code]);
            if (stockCheck.length === 0) {
                res.status(400).json({
                    error: 'Bad Request',
                    message: 'Item not found in stock'
                });
                return;
            }
            const currentStock = stockCheck[0].current_balance;
            const quantityDifference = newQuantity - oldQuantity;
            if (quantityDifference > currentStock) {
                res.status(400).json({
                    error: 'Bad Request',
                    message: `Insufficient stock for quantity increase. Available: ${currentStock}, Additional needed: ${quantityDifference}`
                });
                return;
            }
        }
        const updateFields = [];
        const updateValues = [];
        if (formData.issue_slip_number !== undefined || formData.issue_date !== undefined) {
            updateFields.push('issue_slip_number = ?');
            updateValues.push(finalIssueSlipNumber);
            updateFields.push('issue_date = ?');
            updateValues.push(finalIssueDate);
        }
        if (formData.nac_code !== undefined) {
            updateFields.push('nac_code = ?');
            updateValues.push(formData.nac_code);
        }
        if (formData.part_number !== undefined) {
            updateFields.push('part_number = ?');
            updateValues.push(formData.part_number);
        }
        if (formData.issue_quantity !== undefined) {
            updateFields.push('issue_quantity = ?');
            updateValues.push(formData.issue_quantity);
        }
        if (formData.issue_cost !== undefined) {
            updateFields.push('issue_cost = ?');
            updateValues.push(formData.issue_cost);
        }
        if (formData.issued_for !== undefined) {
            updateFields.push('issued_for = ?');
            updateValues.push(formData.issued_for);
        }
        if (formData.issued_by !== undefined) {
            updateFields.push('issued_by = ?');
            updateValues.push(JSON.stringify(formData.issued_by));
        }
        if (formData.approval_status !== undefined) {
            updateFields.push('approval_status = ?');
            updateValues.push(formData.approval_status);
        }
        updateValues.push(id);
        await connection.execute(`UPDATE issue_details SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);
        const oldNacCode = record.nac_code;
        const newNacCode = formData.nac_code || oldNacCode;
        const quantityChanged = formData.issue_quantity && formData.issue_quantity !== oldQuantity;
        const nacCodeChanged = formData.nac_code && formData.nac_code !== oldNacCode;
        if (quantityChanged || nacCodeChanged) {
            if (nacCodeChanged) {
                await connection.execute('UPDATE stock_details SET current_balance = current_balance + ? WHERE nac_code = ?', [oldQuantity, oldNacCode]);
                const [newStockCheck] = await connection.execute<RowDataPacket[]>('SELECT current_balance FROM stock_details WHERE nac_code = ?', [newNacCode]);
                if (newStockCheck.length === 0) {
                    await connection.rollback();
                    res.status(400).json({
                        error: 'Bad Request',
                        message: 'New NAC code not found in stock'
                    });
                    return;
                }
                const newStockBalance = newStockCheck[0].current_balance;
                if (newQuantity > newStockBalance) {
                    await connection.rollback();
                    res.status(400).json({
                        error: 'Bad Request',
                        message: `Insufficient stock in new NAC code. Available: ${newStockBalance}, Required: ${newQuantity}`
                    });
                    return;
                }
                await connection.execute('UPDATE stock_details SET current_balance = current_balance - ? WHERE nac_code = ?', [newQuantity, newNacCode]);
            }
            else if (quantityChanged) {
                const quantityDifference = newQuantity - oldQuantity;
                await connection.execute('UPDATE stock_details SET current_balance = current_balance - ? WHERE nac_code = ?', [quantityDifference, oldNacCode]);
            }
            const newRemainingBalance = record.remaining_balance - (newQuantity - oldQuantity);
            await connection.execute('UPDATE issue_details SET remaining_balance = ? WHERE id = ?', [newRemainingBalance, id]);
        }
        await connection.commit();
        logEvents(`Successfully updated spare issue record ID: ${id}`, "spareIssueRecordsLog.log");
        res.status(200).json({
            message: 'Spare issue record updated successfully'
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error updating spare issue record: ${errorMessage} for ID: ${id}`, "spareIssueRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const deleteSpareIssueRecord = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [currentRecord] = await connection.execute<RowDataPacket[]>('SELECT * FROM issue_details WHERE id = ? AND nac_code NOT IN (\'GT 07986\', \'GT 00000\')', [id]);
        if (currentRecord.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Spare issue record not found'
            });
            return;
        }
        const record = currentRecord[0];
        await connection.execute('UPDATE stock_details SET current_balance = current_balance + ? WHERE nac_code = ?', [record.issue_quantity, record.nac_code]);
        await connection.execute('DELETE FROM issue_details WHERE id = ?', [id]);
        await connection.commit();
        logEvents(`Successfully deleted spare issue record ID: ${id}`, "spareIssueRecordsLog.log");
        res.status(200).json({
            message: 'Spare issue record deleted successfully'
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error deleting spare issue record: ${errorMessage} for ID: ${id}`, "spareIssueRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const getSpareIssueRecordFilters = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const [slipNumbers] = await connection.execute<RowDataPacket[]>(`SELECT DISTINCT issue_slip_number 
       FROM issue_details 
       WHERE nac_code NOT IN ('GT 07986', 'GT 00000')
       ORDER BY issue_slip_number`);
        const [nacCodes] = await connection.execute<RowDataPacket[]>(`SELECT DISTINCT i.nac_code, SUBSTRING_INDEX(s.item_name, ',', 1) as item_name
       FROM issue_details i
       LEFT JOIN stock_details s ON i.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
       WHERE i.nac_code NOT IN ('GT 07986', 'GT 00000')
       ORDER BY i.nac_code`);
        const [equipmentNumbers] = await connection.execute<RowDataPacket[]>(`SELECT DISTINCT issued_for 
       FROM issue_details 
       WHERE nac_code NOT IN ('GT 07986', 'GT 00000')
       AND issued_for IS NOT NULL
       ORDER BY issued_for`);
        const [approvalStatuses] = await connection.execute<RowDataPacket[]>(`SELECT DISTINCT approval_status 
       FROM issue_details 
       WHERE nac_code NOT IN ('GT 07986', 'GT 00000')
       ORDER BY approval_status`);
        logEvents(`Successfully retrieved filter options for spare issue records`, "spareIssueRecordsLog.log");
        res.status(200).json({
            message: 'Filter options retrieved successfully',
            filters: {
                issueSlipNumbers: slipNumbers.map(item => item.issue_slip_number),
                nacCodes: nacCodes.map(item => ({
                    nac_code: item.nac_code,
                    item_name: item.item_name
                })),
                equipmentNumbers: equipmentNumbers.map(item => item.issued_for),
                approvalStatuses: approvalStatuses.map(item => item.approval_status)
            }
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error retrieving filter options: ${errorMessage}`, "spareIssueRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
