import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';
import { formatDate } from '../utils/dateUtils';
export interface RRPRecord {
    id: number;
    rrp_number: string;
    request_number: string;
    receive_number: string;
    supplier_name: string;
    date: string;
    currency: string;
    forex_rate: number;
    item_price: number;
    customs_charge: number;
    customs_date: string;
    customs_number: string;
    freight_charge: number;
    customs_service_charge: number;
    vat_percentage: number;
    invoice_number: string;
    invoice_date: string;
    po_number: string;
    total_amount: number;
    airway_bill_number: string;
    inspection_details: string;
    reference_doc: string;
    current_fy: string;
    approval_status: string;
    created_by: string;
    approved_by: string;
    rejected_by: string;
    rejection_reason: string;
    created_at: string;
    updated_at: string;
    item_name: string;
    nac_code: string;
    part_number: string;
    received_quantity: number;
    unit: string;
    received_by: string;
    receive_date: string;
    requested_by: string;
    request_date: string;
    equipment_number: string;
}
export interface RRPRecordsResponse {
    data: RRPRecord[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
}
export interface RRPFormData {
    receive_fk?: number;
    rrp_number: string;
    supplier_name: string;
    date: string;
    currency: string;
    forex_rate: number;
    item_price: number;
    customs_charge: number;
    customs_date: string;
    customs_number: string;
    freight_charge: number;
    customs_service_charge: number;
    vat_percentage: number;
    invoice_number: string;
    invoice_date: string;
    po_number: string;
    total_amount: number;
    airway_bill_number: string;
    inspection_details: string;
    reference_doc: string;
    approval_status: string;
    created_by: string;
}
export const getAllRRPRecords = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const { universal, equipmentNumber, partNumber, status, createdBy, page = 1, pageSize = 20 } = req.query;
        const offset = (Number(page) - 1) * Number(pageSize);
        let whereConditions = [];
        let queryParams: any[] = [];
        if (universal) {
            whereConditions.push(`(rd.rrp_number LIKE ? OR red.item_name LIKE ? OR red.part_number LIKE ? OR rqd.request_number LIKE ?)`);
            const searchParam = `%${universal}%`;
            queryParams.push(searchParam, searchParam, searchParam, searchParam);
        }
        if (equipmentNumber) {
            whereConditions.push(`rqd.equipment_number LIKE ?`);
            queryParams.push(`%${equipmentNumber}%`);
        }
        if (partNumber) {
            whereConditions.push(`red.part_number LIKE ?`);
            queryParams.push(`%${partNumber}%`);
        }
        if (status && status !== 'all') {
            whereConditions.push(`rd.approval_status = ?`);
            queryParams.push(status);
        }
        if (createdBy && createdBy !== 'all') {
            whereConditions.push(`rd.created_by LIKE ?`);
            queryParams.push(`%${createdBy}%`);
        }
        let whereClause = '';
        if (whereConditions.length > 0) {
            whereClause = `WHERE ${whereConditions.join(' AND ')}`;
        }
        const countQuery = `
      SELECT COUNT(DISTINCT rd.rrp_number) as total 
      FROM rrp_details rd
      LEFT JOIN receive_details red ON rd.receive_fk = red.id
      LEFT JOIN request_details rqd ON red.request_fk = rqd.id
      ${whereClause}
    `;
        const [countResult] = await connection.execute<RowDataPacket[]>(countQuery, queryParams);
        const totalCount = countResult[0].total;
        const totalPages = Math.ceil(totalCount / Number(pageSize));
        const dataQuery = `
      SELECT 
        rd.id,
        rd.rrp_number,
        rqd.request_number,
        CONCAT('REC-', red.id) as receive_number,
        rd.supplier_name,
        rd.date,
        rd.currency,
        rd.forex_rate,
        rd.item_price,
        rd.customs_charge,
        rd.customs_date,
        rd.customs_number,
        rd.freight_charge,
        rd.customs_service_charge,
        rd.vat_percentage,
        rd.invoice_number,
        rd.invoice_date,
        rd.po_number,
        rd.total_amount,
        rd.airway_bill_number,
        rd.inspection_details,
        rd.reference_doc,
        rd.current_fy,
        rd.approval_status,
        rd.created_by,
        rd.approved_by,
        rd.rejected_by,
        rd.rejection_reason,
        rd.created_at,
        rd.updated_at,
        red.item_name,
        red.nac_code,
        red.part_number,
        red.received_quantity,
        red.unit,
        red.received_by,
        red.receive_date,
        rqd.requested_by,
        rqd.request_date,
        rqd.equipment_number
      FROM rrp_details rd
      LEFT JOIN receive_details red ON rd.receive_fk = red.id
      LEFT JOIN request_details rqd ON red.request_fk = rqd.id
      ${whereClause}
      ORDER BY rd.created_at DESC
      LIMIT ${Number(pageSize)} OFFSET ${offset}
    `;
        const [rows] = await connection.execute<RowDataPacket[]>(dataQuery, queryParams);
        const response: RRPRecordsResponse = {
            data: rows as RRPRecord[],
            totalCount,
            totalPages,
            currentPage: Number(page),
            pageSize: Number(pageSize)
        };
        res.status(200).json(response);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getAllRRPRecords: ${errorMessage}`, "rrpRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const getRRPRecordById = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        const query = `
      SELECT 
        rd.id,
        rd.rrp_number,
        rqd.request_number,
        CONCAT('REC-', red.id) as receive_number,
        rd.supplier_name,
        rd.date,
        rd.currency,
        rd.forex_rate,
        rd.item_price,
        rd.customs_charge,
        rd.customs_date,
        rd.customs_number,
        rd.freight_charge,
        rd.customs_service_charge,
        rd.vat_percentage,
        rd.invoice_number,
        rd.invoice_date,
        rd.po_number,
        rd.total_amount,
        rd.airway_bill_number,
        rd.inspection_details,
        rd.reference_doc,
        rd.current_fy,
        rd.approval_status,
        rd.created_by,
        rd.approved_by,
        rd.rejected_by,
        rd.rejection_reason,
        rd.created_at,
        rd.updated_at,
        red.item_name,
        red.nac_code,
        red.part_number,
        red.received_quantity,
        red.unit,
        red.received_by,
        red.receive_date,
        rqd.requested_by,
        rqd.request_date,
        rqd.equipment_number
      FROM rrp_details rd
      LEFT JOIN receive_details red ON rd.receive_fk = red.id
      LEFT JOIN request_details rqd ON red.request_fk = rqd.id
      WHERE rd.id = ?
    `;
        const [rows] = await connection.execute<RowDataPacket[]>(query, [id]);
        if (rows.length === 0) {
            res.status(404).json({ error: 'RRP record not found' });
            return;
        }
        res.status(200).json(rows[0] as RRPRecord);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getRRPRecordById: ${errorMessage}`, "rrpRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const createRRPRecord = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const formData: RRPFormData = req.body;
        await connection.beginTransaction();
        const rrpDate = new Date(formData.date);
        const invoiceDate = new Date(formData.invoice_date);
        if (rrpDate > invoiceDate) {
            await connection.rollback();
            res.status(400).json({
                error: 'Validation Error',
                message: 'RRP date cannot be greater than invoice date'
            });
            return;
        }
        const [existingRRP] = await connection.execute<RowDataPacket[]>('SELECT id, date FROM rrp_details WHERE rrp_number = ?', [formData.rrp_number]);
        let finalRRPDate = formData.date;
        if (existingRRP.length > 0) {
            finalRRPDate = existingRRP[0].date;
            logEvents(`RRP number ${formData.rrp_number} already exists. Using existing date: ${finalRRPDate}`, "rrpRecordsLog.log");
        }
        const query = `
      INSERT INTO rrp_details (
        receive_fk, rrp_number, supplier_name, date, currency, forex_rate,
        item_price, customs_charge, customs_date, customs_number,
        freight_charge, customs_service_charge, vat_percentage,
        invoice_number, invoice_date, po_number, total_amount,
        airway_bill_number, inspection_details, reference_doc,
        approval_status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
        const values = [
            formData.receive_fk || null,
            formData.rrp_number,
            formData.supplier_name,
            finalRRPDate,
            formData.currency,
            formData.forex_rate,
            formData.item_price,
            formData.customs_charge,
            formData.customs_date || null,
            formData.customs_number,
            formData.freight_charge,
            formData.customs_service_charge,
            formData.vat_percentage,
            formData.invoice_number,
            formData.invoice_date,
            formData.po_number,
            formData.total_amount,
            formData.airway_bill_number,
            formData.inspection_details,
            formData.reference_doc,
            formData.approval_status,
            formData.created_by
        ];
        const [result] = await connection.execute(query, values);
        const rrpId = (result as any).insertId;
        await connection.commit();
        res.status(201).json({
            message: 'RRP record created successfully',
            id: rrpId
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in createRRPRecord: ${errorMessage}`, "rrpRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const updateRRPRecord = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        const formData: RRPFormData = req.body;
        await connection.beginTransaction();
        const rrpDate = new Date(formData.date);
        const invoiceDate = new Date(formData.invoice_date);
        if (rrpDate > invoiceDate) {
            await connection.rollback();
            res.status(400).json({
                error: 'Validation Error',
                message: 'RRP date cannot be greater than invoice date'
            });
            return;
        }
        const [existingRRP] = await connection.execute<RowDataPacket[]>('SELECT id, date FROM rrp_details WHERE rrp_number = ? AND id != ?', [formData.rrp_number, id]);
        let finalRRPDate = formData.date;
        if (existingRRP.length > 0) {
            finalRRPDate = existingRRP[0].date;
            logEvents(`RRP number ${formData.rrp_number} already exists. Using existing date: ${finalRRPDate}`, "rrpRecordsLog.log");
        }
        const query = `
      UPDATE rrp_details SET 
        rrp_number = ?, supplier_name = ?, date = ?, currency = ?, forex_rate = ?,
        item_price = ?, customs_charge = ?, customs_date = ?, customs_number = ?,
        freight_charge = ?, customs_service_charge = ?, vat_percentage = ?,
        invoice_number = ?, invoice_date = ?, po_number = ?, total_amount = ?,
        airway_bill_number = ?, inspection_details = ?, reference_doc = ?,
        approval_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
        const values = [
            formData.rrp_number,
            formData.supplier_name,
            finalRRPDate,
            formData.currency,
            formData.forex_rate,
            formData.item_price,
            formData.customs_charge,
            formData.customs_date || null,
            formData.customs_number,
            formData.freight_charge,
            formData.customs_service_charge,
            formData.vat_percentage,
            formData.invoice_number,
            formData.invoice_date,
            formData.po_number,
            formData.total_amount,
            formData.airway_bill_number,
            formData.inspection_details,
            formData.reference_doc,
            formData.approval_status,
            id
        ];
        await connection.execute(query, values);
        await connection.commit();
        res.status(200).json({ message: 'RRP record updated successfully' });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in updateRRPRecord: ${errorMessage}`, "rrpRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const deleteRRPRecord = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        await connection.beginTransaction();
        const [rows] = await connection.execute<RowDataPacket[]>('SELECT receive_fk, rrp_number FROM rrp_details WHERE id = ?', [id]);
        if (rows.length === 0) {
            await connection.rollback();
            res.status(404).json({ error: 'RRP record not found' });
            return;
        }
        const record = rows[0];
        const receiveFk = record.receive_fk;
        const rrpNumber = record.rrp_number;
        const [countRows] = await connection.execute<RowDataPacket[]>('SELECT COUNT(*) as count FROM rrp_details WHERE rrp_number = ?', [rrpNumber]);
        const count = countRows[0].count;
        await connection.execute('DELETE FROM rrp_details WHERE id = ?', [id]);
        if (count === 1 && receiveFk) {
            await connection.execute('UPDATE receive_details SET rrp_fk = NULL WHERE id = ?', [receiveFk]);
        }
        await connection.commit();
        res.status(200).json({ message: 'RRP record deleted successfully' });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in deleteRRPRecord: ${errorMessage}`, "rrpRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const getRRPRecordFilters = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const [statusRows] = await connection.execute<RowDataPacket[]>(`SELECT DISTINCT rd.approval_status 
       FROM rrp_details rd 
       WHERE rd.approval_status IS NOT NULL 
       ORDER BY rd.approval_status`);
        const statuses = statusRows.map(row => row.approval_status);
        const [createdByRows] = await connection.execute<RowDataPacket[]>(`SELECT DISTINCT rd.created_by 
       FROM rrp_details rd 
       WHERE rd.created_by IS NOT NULL 
       ORDER BY rd.created_by`);
        const createdBy = createdByRows.map(row => row.created_by);
        res.status(200).json({
            statuses,
            createdBy
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getRRPRecordFilters: ${errorMessage}`, "rrpRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const updateRRPStatus = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { status } = req.body;
    const connection = await pool.getConnection();
    try {
        const [recordRows] = await connection.execute<RowDataPacket[]>('SELECT rrp_number FROM rrp_details WHERE id = ?', [id]);
        if (recordRows.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'RRP record not found'
            });
            return;
        }
        const rrpNumber = recordRows[0].rrp_number;
        const [result] = await connection.execute('UPDATE rrp_details SET approval_status = ? WHERE rrp_number = ?', [status, rrpNumber]);
        const affectedRows = (result as any).affectedRows;
        logEvents(`Updated status to '${status}' for ${affectedRows} records with RRP number '${rrpNumber}'`, "rrpRecordsLog.log");
        res.status(200).json({
            message: `Status updated successfully for ${affectedRows} records`,
            affectedRows,
            rrpNumber
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in updateRRPStatus: ${errorMessage}`, "rrpRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const getConfiguredSuppliers = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const query = `
      SELECT config_name, config_value 
      FROM app_config 
      WHERE config_name IN ('supplier_list_local', 'supplier_list_foreign')
    `;
        const [rows] = await connection.execute<RowDataPacket[]>(query);
        const suppliers = {
            local: [] as string[],
            foreign: [] as string[]
        };
        rows.forEach(row => {
            if (row.config_value) {
                const supplierList = row.config_value.split(', ').map((name: string) => name.trim());
                if (row.config_name === 'supplier_list_local') {
                    suppliers.local = supplierList;
                }
                else if (row.config_name === 'supplier_list_foreign') {
                    suppliers.foreign = supplierList;
                }
            }
        });
        res.status(200).json({ suppliers });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getConfiguredSuppliers: ${errorMessage}`, "rrpRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
