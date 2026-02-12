import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';
const updateStockBalance = async (connection: any, nacCode: string, quantityChange: number, operation: 'add' | 'subtract'): Promise<boolean> => {
    try {
        const [currentStock] = await connection.execute('SELECT current_balance FROM stock_details WHERE nac_code = ?', [nacCode]) as [
            RowDataPacket[],
            any
        ];
        if (currentStock.length === 0) {
            await connection.execute('INSERT INTO stock_details (nac_code, current_balance, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)', [nacCode, Math.abs(quantityChange)]);
            return true;
        }
        const currentBalance = currentStock[0].current_balance;
        const newBalance = operation === 'add'
            ? currentBalance + quantityChange
            : currentBalance - quantityChange;
        if (newBalance < 0) {
            return false;
        }
        await connection.execute('UPDATE stock_details SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE nac_code = ?', [newBalance, nacCode]);
        return true;
    }
    catch (error) {
        logEvents(`Error updating stock balance: ${error}`, "receiveRecordsLog.log");
        return false;
    }
};
const getCurrentStockBalance = async (connection: any, nacCode: string): Promise<number> => {
    try {
        const [currentStock] = await connection.execute('SELECT current_balance FROM stock_details WHERE nac_code = ?', [nacCode]) as [
            RowDataPacket[],
            any
        ];
        return currentStock.length > 0 ? currentStock[0].current_balance : 0;
    }
    catch (error) {
        logEvents(`Error getting stock balance: ${error}`, "receiveRecordsLog.log");
        return 0;
    }
};
export interface ReceiveRecord {
    id: number;
    receive_number: string;
    receive_date: string;
    request_fk: number;
    request_number: string;
    nac_code: string;
    part_number: string;
    item_name: string;
    received_quantity: number;
    unit: string;
    approval_status: string;
    received_by: string;
    image_path: string;
    location?: string;
    card_number?: string;
    rejection_reason?: string;
    rrp_fk?: number | null;
    created_at: string;
    updated_at: string;
    prediction_summary?: {
        predicted_days: number;
        range_lower_days: number | null;
        range_upper_days: number | null;
        confidence: string | null;
        sample_size: number;
        calculated_at: string | null;
    } | null;
}
export interface ReceiveRecordsResponse {
    data: ReceiveRecord[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
}
export interface ReceiveFormData {
    receive_number: string;
    receive_date: string;
    request_fk: number;
    nac_code: string;
    part_number: string;
    item_name: string;
    received_quantity: number;
    unit: string;
    approval_status: string;
    received_by: string;
    image_path: string;
    location: string;
    card_number: string;
}
export const getAllReceiveRecords = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const { universal, equipmentNumber, partNumber, status, receivedBy, page = 1, pageSize = 20 } = req.query;
        const offset = (Number(page) - 1) * Number(pageSize);
        let whereConditions = [];
        let queryParams: any[] = [];
        if (universal) {
            whereConditions.push(`(rd.nac_code LIKE ? OR rd.item_name LIKE ? OR rd.part_number LIKE ? OR req.request_number LIKE ? OR rd.tender_reference_number LIKE ?)`);
            const searchParam = `%${universal}%`;
            queryParams.push(searchParam, searchParam, searchParam, searchParam, searchParam);
        }
        if (equipmentNumber) {
            whereConditions.push(`COALESCE(NULLIF(rd.equipment_number, ''), COALESCE(req.equipment_number, '')) LIKE ?`);
            queryParams.push(`%${equipmentNumber}%`);
        }
        if (partNumber) {
            whereConditions.push(`rd.part_number LIKE ?`);
            queryParams.push(`%${partNumber}%`);
        }
        if (status && status !== 'all') {
            whereConditions.push(`rd.approval_status = ?`);
            queryParams.push(status);
        }
        if (receivedBy && receivedBy !== 'all') {
            whereConditions.push(`rd.received_by LIKE ?`);
            queryParams.push(`%${receivedBy}%`);
        }
        let whereClause = '';
        if (whereConditions.length > 0) {
            let whereClauseWithValues = whereConditions.join(' AND ');
            queryParams.forEach((param, index) => {
                whereClauseWithValues = whereClauseWithValues.replace('?', `'${param}'`);
            });
            whereClause = `WHERE ${whereClauseWithValues}`;
        }
        const countQuery = `SELECT COUNT(*) as total FROM receive_details rd LEFT JOIN request_details req ON rd.request_fk = req.id ${whereClause}`;
        const [countResult] = await connection.execute<RowDataPacket[]>(countQuery);
        const totalCount = countResult[0].total;
        const totalPages = Math.ceil(totalCount / Number(pageSize));
        const dataQuery = `
      SELECT 
        rd.id, CONCAT('REC-', rd.id) as receive_number, rd.receive_date, rd.request_fk, 
        CASE 
          WHEN rd.receive_source = 'tender' THEN CONCAT('TENDER-', COALESCE(rd.tender_reference_number, ''))
          ELSE COALESCE(req.request_number, '')
        END AS request_number,
        rd.receive_source, rd.tender_reference_number,
        rd.nac_code, rd.part_number, rd.item_name,
        rd.received_quantity, req.requested_quantity, rd.unit, rd.approval_status, rd.received_by,
        rd.image_path, rd.location, rd.card_number, rd.rejection_reason,
        COALESCE(NULLIF(rd.equipment_number, ''), COALESCE(req.equipment_number, '')) AS equipment_number,
        rd.rrp_fk, rd.created_at, rd.updated_at,
        pm.weighted_average_days AS predicted_days,
        pm.percentile_10_days AS predicted_range_lower,
        pm.percentile_90_days AS predicted_range_upper,
        pm.confidence_level AS predicted_confidence,
        pm.sample_size AS predicted_sample_size,
        pm.calculated_at AS predicted_calculated_at
      FROM receive_details rd
      LEFT JOIN request_details req ON rd.request_fk = req.id
      LEFT JOIN prediction_metrics pm ON pm.nac_code COLLATE utf8mb4_unicode_ci = rd.nac_code COLLATE utf8mb4_unicode_ci
      ${whereClause}
      ORDER BY rd.created_at DESC
      LIMIT ${Number(pageSize)} OFFSET ${offset}
    `;
        const [rows] = await connection.execute<RowDataPacket[]>(dataQuery);
        const data = (rows as RowDataPacket[]).map(row => ({
            ...row,
            prediction_summary: row.predicted_days !== null && row.predicted_days !== undefined ? {
                predicted_days: Number(row.predicted_days),
                range_lower_days: row.predicted_range_lower !== null && row.predicted_range_lower !== undefined ? Number(row.predicted_range_lower) : null,
                range_upper_days: row.predicted_range_upper !== null && row.predicted_range_upper !== undefined ? Number(row.predicted_range_upper) : null,
                confidence: row.predicted_confidence ?? null,
                sample_size: row.predicted_sample_size !== null && row.predicted_sample_size !== undefined ? Number(row.predicted_sample_size) : 0,
                calculated_at: row.predicted_calculated_at ?? null
            } : null
        }));
        const response: ReceiveRecordsResponse = {
            data: data as ReceiveRecord[],
            totalCount,
            totalPages,
            currentPage: Number(page),
            pageSize: Number(pageSize)
        };
        res.status(200).json(response);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getAllReceiveRecords: ${errorMessage}`, "receiveRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const getReceiveRecordById = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        const query = `
      SELECT 
        rd.id, CONCAT('REC-', rd.id) as receive_number, rd.receive_date, rd.request_fk, 
        CASE 
          WHEN rd.receive_source = 'tender' THEN CONCAT('TENDER-', COALESCE(rd.tender_reference_number, ''))
          ELSE COALESCE(req.request_number, '')
        END AS request_number,
        rd.receive_source, rd.tender_reference_number,
        rd.nac_code, rd.part_number, rd.item_name,
        rd.received_quantity, req.requested_quantity, rd.unit, rd.approval_status, rd.received_by,
        rd.image_path, rd.location, rd.card_number, rd.rejection_reason,
        COALESCE(NULLIF(rd.equipment_number, ''), COALESCE(req.equipment_number, '')) AS equipment_number,
        rd.rrp_fk, rd.created_at, rd.updated_at
      FROM receive_details rd
      LEFT JOIN request_details req ON rd.request_fk = req.id
      WHERE rd.id = ?
    `;
        const [rows] = await connection.execute<RowDataPacket[]>(query, [id]);
        if (rows.length === 0) {
            res.status(404).json({ error: 'Receive record not found' });
            return;
        }
        res.status(200).json(rows[0] as ReceiveRecord);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getReceiveRecordById: ${errorMessage}`, "receiveRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const createReceiveRecord = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const formData: ReceiveFormData = req.body;
        await connection.beginTransaction();
        const query = `
      INSERT INTO receive_details (
        receive_date, request_fk, nac_code, part_number, 
        item_name, received_quantity, remaining_quantity, unit, approval_status, received_by,
        image_path, location, card_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
        const values = [
            formData.receive_date,
            formData.request_fk,
            formData.nac_code,
            formData.part_number,
            formData.item_name,
            formData.received_quantity,
            formData.received_quantity,
            formData.unit,
            formData.approval_status,
            formData.received_by,
            formData.image_path || '',
            formData.location || '',
            formData.card_number || ''
        ];
        const [result] = await connection.execute(query, values);
        const receiveId = (result as any).insertId;
        const stockUpdated = await updateStockBalance(connection, formData.nac_code, formData.received_quantity, 'add');
        if (!stockUpdated) {
            await connection.rollback();
            res.status(400).json({
                error: 'Stock Update Failed',
                message: 'Failed to update stock balance. Please try again.'
            });
            return;
        }
        await connection.execute('UPDATE request_details SET is_received = 1, receive_fk = ? WHERE id = ?', [receiveId, formData.request_fk]);
        await connection.commit();
        res.status(201).json({
            message: 'Receive record created successfully',
            id: receiveId
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in createReceiveRecord: ${errorMessage}`, "receiveRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const updateReceiveRecord = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        const formData: Partial<ReceiveFormData> = req.body;
        await connection.beginTransaction();
        const [currentRecord] = await connection.execute<RowDataPacket[]>(`SELECT rd.*, req.requested_quantity 
       FROM receive_details rd 
       LEFT JOIN request_details req ON rd.request_fk = req.id 
       WHERE rd.id = ?`, [id]);
        if (currentRecord.length === 0) {
            await connection.rollback();
            res.status(404).json({ error: 'Receive record not found' });
            return;
        }
        const record = currentRecord[0];
        const updatedData = {
            receive_date: formData.receive_date ?? record.receive_date,
            request_fk: formData.request_fk ?? record.request_fk,
            nac_code: formData.nac_code ?? record.nac_code,
            part_number: formData.part_number ?? record.part_number,
            item_name: formData.item_name ?? record.item_name,
            received_quantity: formData.received_quantity ?? record.received_quantity,
            unit: formData.unit ?? record.unit,
            approval_status: formData.approval_status ?? record.approval_status,
            received_by: formData.received_by ?? record.received_by,
            image_path: formData.image_path !== undefined ? formData.image_path : (record.image_path || ''),
            location: formData.location !== undefined ? formData.location : (record.location || ''),
            card_number: formData.card_number !== undefined ? formData.card_number : (record.card_number || '')
        };
        if (formData.image_path !== undefined && formData.image_path && record.image_path && formData.image_path !== record.image_path) {
            try {
                const fs = require('fs');
                const path = require('path');
                const publicDir = path.join(process.cwd(), '..', 'frontend', 'public');
                const oldImageFullPath = path.join(publicDir, record.image_path.replace(/^\//, ''));
                if (fs.existsSync(oldImageFullPath)) {
                    fs.unlinkSync(oldImageFullPath);
                    logEvents(`Deleted old image file: ${oldImageFullPath} for receive ID: ${id}`, "receiveRecordsLog.log");
                }
            }
            catch (deleteError) {
                logEvents(`Warning: Failed to delete old image file: ${record.image_path} for receive ID: ${id}. Error: ${deleteError}`, "receiveRecordsLog.log");
            }
        }
        if (record.request_fk && record.request_fk > 0 && record.requested_quantity != null) {
            if (updatedData.received_quantity > record.requested_quantity) {
                await connection.rollback();
                res.status(400).json({
                    error: 'Validation Error',
                    message: 'Received quantity cannot be more than the requested quantity'
                });
                return;
            }
        }
        const quantityDifference = updatedData.received_quantity - record.received_quantity;
        if (quantityDifference !== 0) {
            const currentStockBalance = await getCurrentStockBalance(connection, record.nac_code);
            const newStockBalance = currentStockBalance + quantityDifference;
            if (newStockBalance < 0) {
                await connection.rollback();
                res.status(400).json({
                    error: 'Insufficient Stock',
                    message: `Cannot update quantity. This would result in negative stock balance. Current balance: ${currentStockBalance}`
                });
                return;
            }
            const stockUpdated = await updateStockBalance(connection, record.nac_code, quantityDifference, 'add');
            if (!stockUpdated) {
                await connection.rollback();
                res.status(400).json({
                    error: 'Stock Update Failed',
                    message: 'Failed to update stock balance. Please try again.'
                });
                return;
            }
        }
        const query = `
      UPDATE receive_details SET 
        receive_date = ?, request_fk = ?, nac_code = ?, part_number = ?,
        item_name = ?, received_quantity = ?, unit = ?, approval_status = ?,
        received_by = ?, image_path = ?, location = ?, card_number = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
        const values = [
            updatedData.receive_date,
            updatedData.request_fk,
            updatedData.nac_code,
            updatedData.part_number,
            updatedData.item_name,
            updatedData.received_quantity,
            updatedData.unit,
            updatedData.approval_status,
            updatedData.received_by,
            updatedData.image_path || '',
            updatedData.location || '',
            updatedData.card_number || '',
            id
        ];
        await connection.execute(query, values);
        await connection.commit();
        res.status(200).json({ message: 'Receive record updated successfully' });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in updateReceiveRecord: ${errorMessage}`, "receiveRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const deleteReceiveRecord = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        await connection.beginTransaction();
        const [rows] = await connection.execute<RowDataPacket[]>('SELECT request_fk, rrp_fk, nac_code, received_quantity FROM receive_details WHERE id = ?', [id]);
        if (rows.length === 0) {
            await connection.rollback();
            res.status(404).json({ error: 'Receive record not found' });
            return;
        }
        const record = rows[0];
        if (record.rrp_fk && record.rrp_fk > 0) {
            await connection.rollback();
            res.status(400).json({
                error: 'Cannot Delete',
                message: 'RRP has already been made for this receive. This cannot be deleted.'
            });
            return;
        }
        const requestFk = record.request_fk;
        const nacCode = record.nac_code;
        const receivedQuantity = record.received_quantity;
        const stockUpdated = await updateStockBalance(connection, nacCode, receivedQuantity, 'subtract');
        if (!stockUpdated) {
            await connection.rollback();
            res.status(400).json({
                error: 'Stock Update Failed',
                message: 'Failed to update stock balance. Please try again.'
            });
            return;
        }
        await connection.execute('DELETE FROM receive_details WHERE id = ?', [id]);
        if (requestFk && requestFk > 0) {
            await connection.execute('UPDATE request_details SET is_received = 0, receive_fk = NULL WHERE id = ?', [requestFk]);
        }
        await connection.commit();
        res.status(200).json({ message: 'Receive record deleted successfully' });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in deleteReceiveRecord: ${errorMessage}`, "receiveRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const getReceiveRecordFilters = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const [statusRows] = await connection.execute<RowDataPacket[]>(`SELECT DISTINCT rd.approval_status 
       FROM receive_details rd 
       LEFT JOIN request_details req ON rd.request_fk = req.id 
       WHERE rd.approval_status IS NOT NULL 
       AND req.request_number IS NOT NULL 
       AND req.request_number != '' 
       ORDER BY rd.approval_status`);
        const statuses = statusRows.map(row => row.approval_status);
        const [receivedByRows] = await connection.execute<RowDataPacket[]>(`SELECT DISTINCT rd.received_by 
       FROM receive_details rd 
       LEFT JOIN request_details req ON rd.request_fk = req.id 
       WHERE rd.received_by IS NOT NULL 
       AND req.request_number IS NOT NULL 
       AND req.request_number != '' 
       ORDER BY rd.received_by`);
        const receivedBy = receivedByRows.map(row => row.received_by);
        res.status(200).json({
            statuses,
            receivedBy
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getReceiveRecordFilters: ${errorMessage}`, "receiveRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
