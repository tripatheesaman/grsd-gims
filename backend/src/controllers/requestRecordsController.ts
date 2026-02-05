import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';
interface RequestRecord extends RowDataPacket {
    id: number;
    request_number: string;
    nac_code: string;
    request_date: Date;
    part_number: string;
    item_name: string;
    unit: string;
    requested_quantity: number;
    current_balance: number;
    previous_rate: string;
    equipment_number: string;
    image_path: string | null;
    specifications: string | null;
    remarks: string | null;
    requested_by: string;
    approval_status: string;
    is_received: boolean;
    approved_by: string | null;
    rejected_by: string | null;
    rejection_reason: string | null;
    receive_fk: number | null;
    reference_doc: string | null;
    created_at: Date;
    updated_at: Date;
}
interface RequestRecordsResponse {
    data: RequestRecord[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
}
interface RequestFormData {
    request_number: string;
    nac_code: string;
    request_date: string;
    part_number: string;
    item_name: string;
    unit: string;
    requested_quantity: number;
    current_balance: number;
    previous_rate: string;
    equipment_number: string;
    image_path: string;
    specifications: string;
    remarks: string;
    requested_by: string;
    approval_status: string;
    reference_doc: string;
}
export const getAllRequestRecords = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const { universal, equipmentNumber, partNumber, status, requestedBy, page = 1, pageSize = 20 } = req.query;
        const offset = (Number(page) - 1) * Number(pageSize);
        let whereConditions = [];
        let queryParams: any[] = [];
        if (universal) {
            whereConditions.push(`(rd.request_number LIKE ? OR rd.nac_code LIKE ? OR rd.item_name LIKE ? OR rd.part_number LIKE ? OR rd.equipment_number LIKE ?)`);
            const searchParam = `%${universal}%`;
            queryParams.push(searchParam, searchParam, searchParam, searchParam, searchParam);
        }
        if (equipmentNumber) {
            whereConditions.push(`rd.equipment_number LIKE ?`);
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
        if (requestedBy && requestedBy !== 'all') {
            whereConditions.push(`rd.requested_by LIKE ?`);
            queryParams.push(`%${requestedBy}%`);
        }
        let whereClause = '';
        if (whereConditions.length > 0) {
            let whereClauseWithValues = whereConditions.join(' AND ');
            queryParams.forEach((param, index) => {
                whereClauseWithValues = whereClauseWithValues.replace('?', `'${param}'`);
            });
            whereClause = `WHERE ${whereClauseWithValues}`;
        }
        const countQuery = `SELECT COUNT(*) as total FROM request_details rd ${whereClause}`;
        const [countResult] = await connection.execute<RowDataPacket[]>(countQuery);
        const totalCount = countResult[0].total;
        const totalPages = Math.ceil(totalCount / Number(pageSize));
        const dataQuery = `
      SELECT 
        rd.id, rd.request_number, rd.nac_code, rd.request_date, rd.part_number,
        rd.item_name, rd.unit, rd.requested_quantity, rd.current_balance,
        rd.previous_rate, rd.equipment_number, rd.image_path, rd.specifications,
        rd.remarks, rd.requested_by, rd.approval_status, rd.is_received,
        rd.approved_by, rd.rejected_by, rd.rejection_reason, rd.receive_fk,
        rd.reference_doc, rd.created_at, rd.updated_at,
        pm.weighted_average_days AS predicted_days,
        pm.percentile_10_days AS predicted_range_lower,
        pm.percentile_90_days AS predicted_range_upper,
        pm.confidence_level AS predicted_confidence,
        pm.sample_size AS predicted_sample_size,
        pm.calculated_at AS predicted_calculated_at,
        -- Aggregates for receive status
        COALESCE((
          SELECT SUM(ri.received_quantity)
          FROM receive_details ri
          WHERE ri.request_fk = rd.id AND ri.approval_status = 'APPROVED'
        ), 0) AS total_approved,
        COALESCE((
          SELECT SUM(ri.received_quantity)
          FROM receive_details ri
          WHERE ri.request_fk = rd.id AND ri.approval_status IN ('PENDING','APPROVED')
        ), 0) AS total_pending_approved
      FROM request_details rd
      LEFT JOIN prediction_metrics pm ON pm.nac_code COLLATE utf8mb4_unicode_ci = rd.nac_code COLLATE utf8mb4_unicode_ci
      ${whereClause}
      ORDER BY rd.created_at DESC
      LIMIT ${Number(pageSize)} OFFSET ${offset}
    `;
        const [rows] = await connection.execute<any[]>(dataQuery);
        const data = rows.map((r: any) => ({
            ...r,
            prediction_summary: r.predicted_days !== null && r.predicted_days !== undefined ? {
                predicted_days: Number(r.predicted_days),
                range_lower_days: r.predicted_range_lower !== null && r.predicted_range_lower !== undefined ? Number(r.predicted_range_lower) : null,
                range_upper_days: r.predicted_range_upper !== null && r.predicted_range_upper !== undefined ? Number(r.predicted_range_upper) : null,
                confidence: r.predicted_confidence,
                sample_size: r.predicted_sample_size !== null && r.predicted_sample_size !== undefined ? Number(r.predicted_sample_size) : 0,
                calculated_at: r.predicted_calculated_at
            } : null,
            receive_status_label: (Number(r.total_approved) === 0)
                ? 'Not Received'
                : (Number(r.total_approved) < Number(r.requested_quantity) ? 'Partially Received' : 'Received')
        }));
        const response: RequestRecordsResponse = {
            data,
            totalCount,
            totalPages,
            currentPage: Number(page),
            pageSize: Number(pageSize)
        };
        res.status(200).json(response);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getAllRequestRecords: ${errorMessage}`, "requestRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const getRequestRecordById = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        const [rows] = await connection.execute<RequestRecord[]>(`SELECT * FROM request_details WHERE id = ?`, [id]);
        if (rows.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Request record not found'
            });
            return;
        }
        res.status(200).json(rows[0]);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getRequestRecordById: ${errorMessage}`, "requestRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const createRequestRecord = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const { request_number, nac_code, request_date, part_number, item_name, unit, requested_quantity, current_balance, previous_rate, equipment_number, image_path, specifications, remarks, requested_by, approval_status, reference_doc }: RequestFormData = req.body;
        if (!request_number || !nac_code || !request_date || !part_number || !item_name ||
            !unit || !requested_quantity || !equipment_number || !requested_by) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Required fields are missing'
            });
            return;
        }
        const [result] = await connection.execute(`INSERT INTO request_details (
        request_number, nac_code, request_date, part_number, item_name, unit,
        requested_quantity, current_balance, previous_rate, equipment_number,
        image_path, specifications, remarks, requested_by, approval_status,
        reference_doc, is_received
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`, [
            request_number, nac_code, request_date, part_number, item_name, unit,
            requested_quantity, current_balance, previous_rate, equipment_number,
            image_path || null, specifications || null, remarks || null, requested_by,
            approval_status || 'PENDING', reference_doc || null
        ]);
        res.status(201).json({
            message: 'Request record created successfully',
            id: (result as any).insertId
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in createRequestRecord: ${errorMessage}`, "requestRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const updateRequestRecord = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        const { request_number, nac_code, request_date, part_number, item_name, unit, requested_quantity, current_balance, previous_rate, equipment_number, image_path, specifications, remarks, requested_by, approval_status, reference_doc }: RequestFormData = req.body;
        if (!request_number || !nac_code || !request_date || !part_number || !item_name ||
            !unit || !requested_quantity || !equipment_number || !requested_by) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Required fields are missing'
            });
            return;
        }
        const [currentRecord] = await connection.execute<RowDataPacket[]>('SELECT is_received, receive_fk, image_path FROM request_details WHERE id = ?', [id]);
        if (currentRecord.length > 0) {
            const record = currentRecord[0];
            if (record.is_received === 1 && record.receive_fk) {
                const [receiveRecord] = await connection.execute<RowDataPacket[]>('SELECT received_quantity FROM receive_details WHERE id = ?', [record.receive_fk]);
                if (receiveRecord.length > 0) {
                    const receivedQuantity = receiveRecord[0].received_quantity;
                    if (Number(requested_quantity) < Number(receivedQuantity)) {
                        res.status(400).json({
                            error: 'Bad Request',
                            message: `Requested quantity cannot be less than received quantity. Received quantity: ${receivedQuantity}`
                        });
                        return;
                    }
                }
            }
            if (image_path && record.image_path && image_path !== record.image_path) {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const publicDir = path.join(process.cwd(), '..', 'frontend', 'public');
                    const oldImageFullPath = path.join(publicDir, record.image_path.replace(/^\//, ''));
                    if (fs.existsSync(oldImageFullPath)) {
                        fs.unlinkSync(oldImageFullPath);
                        logEvents(`Deleted old image file: ${oldImageFullPath} for request ID: ${id}`, "requestRecordsLog.log");
                    }
                }
                catch (deleteError) {
                    logEvents(`Warning: Failed to delete old image file: ${record.image_path} for request ID: ${id}. Error: ${deleteError}`, "requestRecordsLog.log");
                }
            }
        }
        const [result] = await connection.execute(`UPDATE request_details SET
        request_number = ?, nac_code = ?, request_date = ?, part_number = ?, item_name = ?,
        unit = ?, requested_quantity = ?, current_balance = ?, previous_rate = ?,
        equipment_number = ?, image_path = ?, specifications = ?, remarks = ?,
        requested_by = ?, approval_status = ?, reference_doc = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`, [
            request_number, nac_code, request_date, part_number, item_name, unit,
            requested_quantity, current_balance, previous_rate, equipment_number,
            image_path || null, specifications || null, remarks || null, requested_by,
            approval_status || 'PENDING', reference_doc || null, id
        ]);
        if ((result as any).affectedRows === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Request record not found'
            });
            return;
        }
        res.status(200).json({
            message: 'Request record updated successfully'
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in updateRequestRecord: ${errorMessage}`, "requestRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const deleteRequestRecord = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        const [existingRecord] = await connection.execute<RowDataPacket[]>('SELECT id FROM request_details WHERE id = ?', [id]);
        if (existingRecord.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Request record not found'
            });
            return;
        }
        const [receivedCheck] = await connection.execute<RowDataPacket[]>('SELECT is_received, receive_fk FROM request_details WHERE id = ?', [id]);
        if (receivedCheck[0].is_received === 1 && receivedCheck[0].receive_fk && receivedCheck[0].receive_fk > 0) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Cannot delete request that has already been received'
            });
            return;
        }
        const [result] = await connection.execute('DELETE FROM request_details WHERE id = ?', [id]);
        if ((result as any).affectedRows === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Request record not found'
            });
            return;
        }
        res.status(200).json({
            message: 'Request record deleted successfully'
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in deleteRequestRecord: ${errorMessage}`, "requestRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const getRequestRecordFilters = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const [statuses] = await connection.execute<RowDataPacket[]>('SELECT DISTINCT approval_status FROM request_details ORDER BY approval_status');
        const [requestedBy] = await connection.execute<RowDataPacket[]>('SELECT DISTINCT requested_by FROM request_details ORDER BY requested_by');
        res.status(200).json({
            statuses: statuses.map(row => row.approval_status),
            requestedBy: requestedBy.map(row => row.requested_by)
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getRequestRecordFilters: ${errorMessage}`, "requestRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
