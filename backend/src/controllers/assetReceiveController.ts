import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { formatDate, formatDateForDB } from '../utils/dateUtils';
import { logEvents } from '../middlewares/logger';
import { ensureAssetSpareSchema } from '../services/assetSpareSchema';

export interface AssetReceiveRequest {
    receiveDate: string;
    receivedBy: string;
    items: {
        modelName: string;
        receiveQuantity: number;
        imagePath: string;
    }[];
}

export const createAssetReceive = async (req: Request, res: Response): Promise<void> => {
    const receiveData: AssetReceiveRequest = req.body;
    if (!receiveData.receiveDate || !receiveData.receivedBy || !receiveData.items?.length) {
        res.status(400).json({ error: 'Bad Request', message: 'Missing required fields' });
        return;
    }
    const connection = await pool.getConnection();
    try {
        await ensureAssetSpareSchema();
        await connection.beginTransaction();
        const formattedDate = formatDateForDB(receiveData.receiveDate);
        const receiveIds: number[] = [];
        for (const item of receiveData.items) {
            const modelName = String(item.modelName || '').trim();
            if (!modelName) {
                throw new Error('Model name is required for each item');
            }
            if (typeof item.receiveQuantity !== 'number' || item.receiveQuantity <= 0) {
                throw new Error('Receive quantity must be a positive number');
            }
            const imagePath = String(item.imagePath || '').trim();
            if (!imagePath) {
                throw new Error(`Equipment image is required for model "${modelName}"`);
            }
            const [duplicateCheck] = await connection.execute<RowDataPacket[]>(
                `SELECT id FROM asset_receive_details
                 WHERE model_name = ? AND receive_date = ? AND approval_status IN ('PENDING','APPROVED')`,
                [modelName, formattedDate]
            );
            if ((duplicateCheck as any[]).length > 0) {
                throw new Error(`Model "${modelName}" was already received on ${formattedDate}`);
            }
            const [result] = await connection.execute(
                `INSERT INTO asset_receive_details
                 (model_name, received_quantity, remaining_quantity, receive_date, approval_status, received_by, image_path)
                 VALUES (?, ?, ?, ?, 'PENDING', ?, ?)`,
                [modelName, item.receiveQuantity, item.receiveQuantity, formattedDate, receiveData.receivedBy, imagePath]
            );
            receiveIds.push((result as any).insertId);
        }
        await connection.commit();
        logEvents(`Created asset receive with ${receiveIds.length} items by ${receiveData.receivedBy}`, 'receiveLog.log');
        res.status(201).json({ message: 'Asset receive created successfully', receiveIds });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logEvents(`Error creating asset receive: ${errorMessage}`, 'receiveLog.log');
        res.status(400).json({ error: 'Bad Request', message: errorMessage });
    }
    finally {
        connection.release();
    }
};

export const getAssetReceiveDetails = async (req: Request, res: Response): Promise<void> => {
    try {
        await ensureAssetSpareSchema();
        const { id } = req.params;
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM asset_receive_details WHERE id = ?`,
            [id]
        );
        if (!rows.length) {
            res.status(404).json({ error: 'Not Found', message: 'Asset receive not found' });
            return;
        }
        const row = rows[0] as any;
        res.status(200).json({
            receiveId: row.id,
            requestNumber: '',
            requestDate: null,
            receiveDate: formatDate(row.receive_date),
            itemName: row.model_name,
            requestedPartNumber: 'N/A',
            receivedPartNumber: 'N/A',
            requestedQuantity: row.received_quantity,
            receivedQuantity: row.received_quantity,
            equipmentNumber: '',
            unit: 'EA',
            requestedUnit: 'EA',
            nacCode: 'ASSETS',
            receiveSource: 'assets',
            receivedBy: row.received_by,
            approvalStatus: row.approval_status,
            imagePath: row.image_path || '',
        });
    }
    catch {
        res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch asset receive details' });
    }
};

export const searchAssetReceives = async (req: Request, res: Response): Promise<void> => {
    try {
        await ensureAssetSpareSchema();
        const { universal, modelName, page = 1, pageSize = 20, pendingOnly } = req.query;
        const currentPage = parseInt(page.toString(), 10) || 1;
        const limit = Math.min(parseInt(pageSize.toString(), 10) || 20, 200);
        const offset = (currentPage - 1) * limit;
        let where = `WHERE ar.approval_status = 'APPROVED' AND ar.remaining_quantity > 0 AND (ar.rrp_fk IS NULL OR ar.rrp_fk = 0)`;
        const params: any[] = [];
        if (pendingOnly === 'false') {
            where = 'WHERE 1=1';
        }
        if (universal && String(universal).trim()) {
            where += ' AND ar.model_name LIKE ?';
            params.push(`%${String(universal).trim()}%`);
        }
        if (modelName && String(modelName).trim()) {
            where += ' AND ar.model_name LIKE ?';
            params.push(`%${String(modelName).trim()}%`);
        }
        const [countRows] = await pool.execute<RowDataPacket[]>(
            `SELECT COUNT(*) AS total FROM asset_receive_details ar ${where}`,
            params
        );
        const total = Number((countRows as any[])[0]?.total || 0);
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT ar.id, ar.model_name, ar.received_quantity, ar.remaining_quantity, ar.receive_date, ar.approval_status, ar.received_by, ar.image_path
             FROM asset_receive_details ar
             ${where}
             ORDER BY ar.receive_date DESC, ar.id DESC
             LIMIT ${limit} OFFSET ${offset}`,
            params
        );
        res.status(200).json({
            data: rows,
            pagination: { page: currentPage, pageSize: limit, total, totalPages: Math.ceil(total / limit) || 1 },
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: 'Internal Server Error', message: errorMessage });
    }
};

export const listAssetReceives = async (req: Request, res: Response): Promise<void> => {
    try {
        await ensureAssetSpareSchema();
        const { page = 1, pageSize = 20, approvalStatus } = req.query;
        const currentPage = parseInt(page.toString(), 10) || 1;
        const limit = Math.min(parseInt(pageSize.toString(), 10) || 20, 200);
        const offset = (currentPage - 1) * limit;
        let where = 'WHERE 1=1';
        const params: any[] = [];
        if (approvalStatus && String(approvalStatus) !== 'all') {
            where += ' AND ar.approval_status = ?';
            params.push(String(approvalStatus));
        }
        const [countRows] = await pool.execute<RowDataPacket[]>(
            `SELECT COUNT(*) AS total FROM asset_receive_details ar ${where}`,
            params
        );
        const total = Number((countRows as any[])[0]?.total || 0);
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT ar.* FROM asset_receive_details ar ${where}
             ORDER BY ar.receive_date DESC, ar.id DESC LIMIT ${limit} OFFSET ${offset}`,
            params
        );
        res.status(200).json({
            data: rows,
            pagination: { page: currentPage, pageSize: limit, total, totalPages: Math.ceil(total / limit) || 1 },
        });
    }
    catch {
        res.status(500).json({ error: 'Internal Server Error', message: 'Failed to list asset receives' });
    }
};

export const approveAssetReceive = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const approvedBy = (req.body?.approvedBy as string) || (req as any).user?.username || 'system';
    const connection = await pool.getConnection();
    try {
        await ensureAssetSpareSchema();
        await connection.beginTransaction();
        const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT id, model_name, approval_status FROM asset_receive_details WHERE id = ? FOR UPDATE`,
            [id]
        );
        if (!(rows as any[]).length) {
            await connection.rollback();
            res.status(404).json({ error: 'Not Found', message: 'Asset receive not found' });
            return;
        }
        if ((rows as any[])[0].approval_status !== 'PENDING') {
            await connection.rollback();
            res.status(400).json({ error: 'Bad Request', message: 'Only pending asset receives can be approved' });
            return;
        }
        await connection.execute(
            `UPDATE asset_receive_details
             SET approval_status = 'APPROVED', approved_by = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [approvedBy, id]
        );
        await connection.commit();
        logEvents(`Approved asset receive ${id} by ${approvedBy}`, 'receiveLog.log');
        res.status(200).json({ message: 'Asset receive approved successfully' });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: 'Internal Server Error', message: errorMessage });
    }
    finally {
        connection.release();
    }
};

export const rejectAssetReceive = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { rejectedBy, rejectionReason } = req.body || {};
    const connection = await pool.getConnection();
    try {
        await ensureAssetSpareSchema();
        await connection.beginTransaction();
        const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT id, model_name, received_by, approval_status FROM asset_receive_details WHERE id = ?`,
            [id]
        );
        if (!(rows as any[]).length) {
            await connection.rollback();
            res.status(404).json({ error: 'Not Found', message: 'Asset receive not found' });
            return;
        }
        const row = (rows as any[])[0];
        if (row.approval_status !== 'PENDING') {
            await connection.rollback();
            res.status(400).json({ error: 'Bad Request', message: 'Only pending asset receives can be rejected' });
            return;
        }
        const safeRejectedBy = (typeof rejectedBy === 'string' && rejectedBy.trim()) ? rejectedBy.trim() : String((req as any).user || 'system');
        const safeReason = typeof rejectionReason === 'string' ? rejectionReason : '';
        await connection.execute(
            `UPDATE asset_receive_details
             SET approval_status = 'REJECTED', rejected_by = ?, rejection_reason = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [safeRejectedBy, safeReason, id]
        );
        const receivedBy = row.received_by as string;
        const [users] = await connection.query<RowDataPacket[]>('SELECT id FROM users WHERE username = ?', [receivedBy]);
        if (users.length > 0) {
            await connection.query(
                `INSERT INTO notifications (user_id, reference_type, message, reference_id)
                 VALUES (?, ?, ?, ?)`,
                [
                    users[0].id,
                    'receive',
                    `Your assets receive for ${row.model_name} has been rejected for the following reason: ${safeReason}`,
                    id,
                ]
            );
        }
        await connection.commit();
        logEvents(`Rejected asset receive ${id} by ${safeRejectedBy}`, 'receiveLog.log');
        res.status(200).json({ message: 'Asset receive rejected successfully' });
    }
    catch (error) {
        await connection.rollback();
        res.status(500).json({ error: 'Internal Server Error', message: 'Failed to reject asset receive' });
    }
    finally {
        connection.release();
    }
};

export const getPendingAssetReceives = async (_req: Request, res: Response): Promise<void> => {
    try {
        const data = await fetchPendingAssetReceivesForDashboard();
        res.status(200).json(data);
    }
    catch {
        res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch pending asset receives' });
    }
};

export const fetchPendingAssetReceivesForDashboard = async (): Promise<any[]> => {
    await ensureAssetSpareSchema();
    const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id, model_name, received_quantity, receive_date, received_by, image_path
         FROM asset_receive_details
         WHERE approval_status = 'PENDING'
         ORDER BY created_at DESC`
    );
    return (rows as any[]).map((item) => ({
        id: item.id,
        nacCode: 'ASSETS',
        itemName: item.model_name,
        partNumber: 'N/A',
        receivedQuantity: item.received_quantity,
        receiveDate: formatDate(item.receive_date),
        equipmentNumber: '',
        receiveSource: 'assets',
        tenderReferenceNumber: null,
        requestFk: 0,
        imagePath: item.image_path || '',
    }));
};
