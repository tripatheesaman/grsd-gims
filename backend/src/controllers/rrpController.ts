import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { formatDate, formatDateForDB, utcToLocalDateString } from '../utils/dateUtils';
import { logEvents } from '../middlewares/logger';
interface ConfigRow extends RowDataPacket {
    config_name: string;
    config_value: string;
}
interface SupplierRow extends RowDataPacket {
    name: string;
    supplier_type: 'local' | 'foreign';
    is_active: number;
}
interface CurrencyRow extends RowDataPacket {
    code: string;
    name?: string | null;
    sort_order?: number | null;
    is_active: number;
}
interface AuthorityRow extends RowDataPacket {
    id: number;
    name: string;
    designation: string;
    staff_id?: string | null;
    section_name?: string | null;
    email?: string | null;
    is_active: number;
}
const fetchRRPConfigMasters = async () => {
    const [suppliers] = await pool.query<SupplierRow[]>(`SELECT name, supplier_type, is_active FROM suppliers WHERE is_active = 1`);
    const [currencies] = await pool.query<CurrencyRow[]>(`SELECT code, name, sort_order, is_active FROM currencies WHERE is_active = 1 ORDER BY COALESCE(sort_order, 9999), code`);
    const [authorities] = await pool.query<AuthorityRow[]>(`SELECT id, name, designation, staff_id, section_name, email, is_active FROM requesting_receiving_authority WHERE is_active = 1 ORDER BY name`);
    return {
        suppliers: {
            local: suppliers.filter(s => s.supplier_type === 'local').map(s => s.name),
            foreign: suppliers.filter(s => s.supplier_type === 'foreign').map(s => s.name),
        },
        currencies: currencies.map(c => c.code),
        authorities: authorities.map(a => ({
            id: a.id,
            name: a.name,
            designation: a.designation,
            staff_id: a.staff_id || null,
            section_name: a.section_name || null,
            email: a.email || null,
        })),
    };
};
interface RRPItem extends RowDataPacket {
    id: number;
    request_number: string;
    request_date: Date;
    receive_date: Date;
    equipment_number: string;
    requested_by: string;
    received_by: string;
    item_name: string;
    nac_code: string;
    part_number: string;
    received_quantity: number;
    unit: string;
}
interface RRPSubmissionItem {
    receive_id: number;
    price: number;
    vat_status: boolean;
    customs_charge: number;
    quantity: number;
    unit: string;
    nac_code: string;
    item_name: string;
    part_number: string;
    equipment_number: string;
    request_number: string;
    request_date: string;
    currency: string;
    forex_rate: number;
}
interface RRPSubmission {
    type: 'local' | 'foreign';
    rrp_number: string;
    rrp_date: string;
    invoice_date: string;
    supplier: string;
    inspection_user: string;
    invoice_number: string;
    freight_charge: number;
    custom_service_charge: number;
    vat_rate: number;
    created_by: string;
    customs_date?: string;
    customs_number?: string;
    po_number?: string;
    airway_bill_number?: string;
    currency?: string;
    forex_rate?: number;
    items: RRPSubmissionItem[];
}
interface RRPUpdateItem {
    id?: number;
    receive_id?: number;
    item_price: number;
    customs_charge?: number;
    customs_service_charge?: number;
    vat_percentage?: number;
    approval_status?: string;
    freight_charge?: number;
    total_amount?: number;
}
interface RRPUpdateData {
    rrp_number: string;
    supplier_name: string;
    date: string;
    currency: string;
    forex_rate: number;
    invoice_number: string;
    invoice_date: string;
    customs_date: string;
    customs_number?: string;
    po_number?: string;
    airway_bill_number?: string;
    inspection_user: string;
    created_by: string;
    items: RRPUpdateItem[];
}
interface RRPType {
    type: 'local' | 'foreign';
}
export const getRRPConfig = async (req: Request, res: Response): Promise<void> => {
    try {
        const [rows] = await pool.query<ConfigRow[]>('SELECT config_name, config_value FROM app_config WHERE config_type = ?', ['rrp']);
        const config: Record<string, any> = {};
        rows.forEach(row => {
            try {
                config[row.config_name] = JSON.parse(row.config_value);
            }
            catch {
                config[row.config_name] = row.config_value;
            }
        });
        const masters = await fetchRRPConfigMasters();
        config.supplier_list_local = masters.suppliers.local;
        config.supplier_list_foreign = masters.suppliers.foreign;
        config.currency_list = masters.currencies;
        config.requesting_and_receiving_authority = masters.authorities;
        config.inspection_user_details = masters.authorities;
        logEvents(`Successfully fetched RRP configuration with ${Object.keys(config).length} settings`, "rrpLog.log");
        res.status(200).json(config);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching RRP configuration: ${errorMessage}`, "rrpLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching RRP configuration'
        });
    }
};
export const getRRPItems = async (req: Request, res: Response): Promise<void> => {
    try {
        const { rrpDate } = req.query;
        let dateFilter = '';
        const queryParams: any[] = [];
        if (typeof rrpDate === 'string' && rrpDate.trim()) {
            const normalizedRRPDate = formatDateForDB(utcToLocalDateString(rrpDate));
            dateFilter = ' AND DATE(rq.request_date) <= DATE(?)';
            queryParams.push(normalizedRRPDate);
        }
        const [rows] = await pool.query<RRPItem[]>(`SELECT 
                rd.id,
                rq.request_number,
                rq.request_date,
                rd.receive_date,
                rq.equipment_number,
                rq.requested_by,
                rd.received_by,
                rd.item_name,
                rd.nac_code,
                rd.part_number,
                rd.received_quantity,
                rd.unit
            FROM receive_details rd
            JOIN request_details rq ON rd.request_fk = rq.id
            WHERE rd.approval_status = 'APPROVED'
            AND (rd.rrp_fk IS NULL OR rd.rrp_fk = '')
            ${dateFilter}
            ORDER BY rd.receive_date DESC`, queryParams);
        const formattedItems = rows.map(item => ({
            ...item,
            request_date: formatDateForDB(item.request_date),
            receive_date: formatDateForDB(item.receive_date),
            requestDate: formatDateForDB(item.request_date),
            receiveDate: formatDateForDB(item.receive_date)
        }));
        logEvents(`Successfully fetched ${formattedItems.length} RRP items`, "rrpLog.log");
        res.status(200).json(formattedItems);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching RRP items: ${errorMessage}`, "rrpLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching RRP items'
        });
    }
};
export const createRRP = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        logEvents(`Starting RRP creation transaction`, "rrpLog.log");
        const submissionData: RRPSubmission = req.body;
        const [configRows] = await connection.query<ConfigRow[]>('SELECT config_name, config_value FROM app_config WHERE config_type = ?', ['rrp']);
        const config: Record<string, any> = {};
        configRows.forEach(row => {
            try {
                config[row.config_name] = JSON.parse(row.config_value);
            }
            catch {
                config[row.config_name] = row.config_value;
            }
        });
        const currentFY = config.current_fy;
        if (!currentFY) {
            await connection.rollback();
            logEvents(`Failed to create RRP - Current FY configuration not found`, "rrpLog.log");
            res.status(500).json({
                error: 'Internal Server Error',
                message: 'Current FY configuration not found'
            });
            return;
        }
        const inputRRPNumber = submissionData.rrp_number;
        let rrpNumber = inputRRPNumber;
        if (inputRRPNumber.includes('T')) {
            const [existingRRP] = await connection.query<RowDataPacket[]>('SELECT approval_status FROM rrp_details WHERE rrp_number = ?', [inputRRPNumber]);
            if (existingRRP.length > 0 && existingRRP[0].approval_status !== 'REJECTED') {
                await connection.rollback();
                logEvents(`Failed to create RRP - Number already exists: ${inputRRPNumber}`, "rrpLog.log");
                res.status(400).json({
                    error: 'Bad Request',
                    message: 'RRP number already exists and is not rejected'
                });
                return;
            }
            if (existingRRP.length > 0) {
                await connection.query('DELETE FROM rrp_details WHERE rrp_number = ?', [inputRRPNumber]);
                await connection.query(`UPDATE receive_details rd
                     SET rrp_fk = NULL
                     WHERE EXISTS (
                         SELECT 1 FROM rrp_details rrp
                         WHERE rrp.receive_fk = rd.id
                         AND rrp.rrp_number = ?
                     )`, [inputRRPNumber]);
                logEvents(`Deleted existing rejected RRP: ${inputRRPNumber}`, "rrpLog.log");
            }
        }
        else {
            const [lastRRP] = await connection.query<RowDataPacket[]>(`SELECT rrp_number FROM rrp_details 
                WHERE rrp_number LIKE ? 
                ORDER BY rrp_number DESC LIMIT 1`, [`${inputRRPNumber}T%`]);
            if (lastRRP.length > 0) {
                const lastTNumber = parseInt(lastRRP[0].rrp_number.split('T')[1]);
                rrpNumber = `${inputRRPNumber}T${lastTNumber + 1}`;
            }
            else {
                rrpNumber = `${inputRRPNumber}T1`;
            }
            logEvents(`Generated new RRP number: ${rrpNumber}`, "rrpLog.log");
        }
        const requestedByAuthorities = new Map<number, {
            name: string;
            designation: string;
        }>();
        let hasItemsWithoutRequestedBy = false;
        for (const item of submissionData.items) {
            const [receiveDetails] = await connection.query<RowDataPacket[]>(`SELECT rd.*, rqd.requested_by_id, rqd.requested_by_email
                 FROM receive_details rd
                 LEFT JOIN request_details rqd ON rd.request_fk = rqd.id
                 WHERE rd.id = ?`, [item.receive_id]);
            if (receiveDetails.length === 0) {
                throw new Error(`Receive details not found for ID: ${item.receive_id}`);
            }
            const receive = receiveDetails[0];
            if (receive.requested_by_id) {
                const [authorityRows] = await connection.query<RowDataPacket[]>('SELECT id, name, designation FROM requesting_receiving_authority WHERE id = ? AND is_active = 1', [receive.requested_by_id]);
                if (authorityRows.length > 0) {
                    const authority = authorityRows[0];
                    requestedByAuthorities.set(authority.id, {
                        name: authority.name,
                        designation: authority.designation
                    });
                }
            }
            else {
                hasItemsWithoutRequestedBy = true;
            }
        }
        const allAuthorities: {
            name: string;
            designation: string;
        }[] = Array.from(requestedByAuthorities.values());
        if (hasItemsWithoutRequestedBy && submissionData.inspection_user) {
            const parts = submissionData.inspection_user.split(',');
            if (parts.length >= 2) {
                const manualName = parts[0].trim();
                const manualDesignation = parts.slice(1).join(',').trim();
                const exists = allAuthorities.some(a => a.name === manualName && a.designation === manualDesignation);
                if (!exists) {
                    allAuthorities.push({ name: manualName, designation: manualDesignation });
                }
            }
        }
        let inspectionUserString = '';
        let inspectionDetailsObj: any = {};
        if (allAuthorities.length > 0) {
            const names = allAuthorities.map(a => a.name).join(' / ');
            const designations = allAuthorities.map(a => a.designation).join(' / ');
            inspectionUserString = `${names},${designations}`;
            inspectionDetailsObj = {
                inspection_user: inspectionUserString,
                names: allAuthorities.map(a => a.name),
                designations: allAuthorities.map(a => a.designation),
                from_requested_by: requestedByAuthorities.size > 0,
                includes_manual: hasItemsWithoutRequestedBy
            };
        }
        else {
            inspectionUserString = submissionData.inspection_user;
            inspectionDetailsObj = config.inspection_details || {};
        }
        for (const item of submissionData.items) {
            const [receiveDetails] = await connection.query<RowDataPacket[]>('SELECT * FROM receive_details WHERE id = ?', [item.receive_id]);
            if (receiveDetails.length === 0) {
                throw new Error(`Receive details not found for ID: ${item.receive_id}`);
            }
            const receive = receiveDetails[0];
            const itemPrice = item.price * (submissionData.type === 'foreign' && submissionData.forex_rate ? submissionData.forex_rate : 1);
            const totalItemPrice = submissionData.items.reduce((sum: number, curr: RRPSubmissionItem) => sum + (curr.price * (submissionData.type === 'foreign' && submissionData.forex_rate ? submissionData.forex_rate : 1)), 0);
            const freightCharge = (itemPrice / totalItemPrice) * (submissionData.freight_charge || 0) *
                (submissionData.type === 'foreign' && submissionData.forex_rate ? submissionData.forex_rate : 1);
            const customServiceCharge = (itemPrice / totalItemPrice) * (submissionData.custom_service_charge || 0);
            let vatAmount = 0;
            if (item.vat_status) {
                const vatBase = itemPrice + freightCharge + (item.customs_charge || 0) + customServiceCharge;
                vatAmount = vatBase * ((submissionData.vat_rate || 0) / 100);
            }
            const totalAmount = itemPrice +
                freightCharge +
                (item.customs_charge || 0) +
                customServiceCharge +
                vatAmount;
            const formattedRRPDate = utcToLocalDateString(submissionData.rrp_date);
            const formattedInvoiceDate = utcToLocalDateString(submissionData.invoice_date);
            const formattedCustomsDate = utcToLocalDateString(submissionData.customs_date);
            const [result] = await connection.query(`INSERT INTO rrp_details (
                    receive_fk, rrp_number, supplier_name, date, currency, forex_rate,
                    item_price, customs_charge, customs_service_charge, vat_percentage,
                    invoice_number, invoice_date, po_number, airway_bill_number,
                    inspection_details, approval_status, created_by, total_amount,
                    freight_charge, customs_date, customs_number, current_fy
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?)`, [
                item.receive_id,
                rrpNumber,
                submissionData.supplier,
                formattedRRPDate,
                submissionData.type === 'foreign' ? submissionData.currency : 'NPR',
                submissionData.type === 'foreign' && submissionData.forex_rate ? submissionData.forex_rate : 1,
                item.price,
                item.customs_charge,
                customServiceCharge,
                item.vat_status ? submissionData.vat_rate : 0,
                submissionData.invoice_number,
                formattedInvoiceDate,
                submissionData.po_number || null,
                submissionData.airway_bill_number || null,
                JSON.stringify({
                    inspection_user: inspectionUserString,
                    inspection_details: inspectionDetailsObj
                }),
                submissionData.created_by,
                totalAmount,
                freightCharge,
                formattedCustomsDate,
                submissionData.customs_number || null,
                currentFY
            ]);
            const rrpId = (result as any).insertId;
            await connection.query('UPDATE receive_details SET rrp_fk = ? WHERE id = ?', [rrpId, item.receive_id]);
        }
        await connection.commit();
        logEvents(`Successfully created RRP ${rrpNumber} with ${submissionData.items.length} items by user: ${submissionData.created_by}`, "rrpLog.log");
        res.status(201).json({
            message: 'RRP created successfully',
            rrp_number: rrpNumber
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error creating RRP: ${errorMessage} by user: ${req.body.created_by}`, "rrpLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while creating RRP'
        });
    }
    finally {
        connection.release();
    }
};
export const getPendingRRPs = async (req: Request, res: Response): Promise<void> => {
    try {
        const [configRows] = await pool.query<ConfigRow[]>('SELECT config_name, config_value FROM app_config WHERE config_type = ?', ['rrp']);
        const config: Record<string, any> = {};
        configRows.forEach(row => {
            try {
                config[row.config_name] = JSON.parse(row.config_value);
            }
            catch {
                config[row.config_name] = row.config_value;
            }
        });
        const masters = await fetchRRPConfigMasters();
        config.supplier_list_local = masters.suppliers.local;
        config.supplier_list_foreign = masters.suppliers.foreign;
        config.currency_list = masters.currencies;
        config.requesting_and_receiving_authority = masters.authorities;
        config.inspection_user_details = masters.authorities;
        const [rows] = await pool.query<RowDataPacket[]>(`SELECT 
                rd.id,
                rd.rrp_number,
                rd.supplier_name,
                rd.date,
                rd.currency,
                rd.forex_rate,
                rd.item_price,
                rd.customs_charge,
                rd.customs_service_charge,
                rd.vat_percentage,
                rd.invoice_number,
                rd.invoice_date,
                rd.po_number,
                rd.airway_bill_number,
                rd.inspection_details,
                rd.approval_status,
                rd.created_by,
                rd.total_amount,
                rd.freight_charge,
                rd.customs_date,
                rd.customs_number,
                rd.receive_fk,
                red.item_name,
                red.nac_code,
                red.part_number,
                red.received_quantity,
                red.unit,
                red.received_by,
                red.receive_date,
                rqd.request_number,
                rqd.request_date,
                rqd.requested_by,
                rqd.equipment_number
            FROM rrp_details rd
            JOIN receive_details red ON rd.receive_fk = red.id
            JOIN request_details rqd ON red.request_fk = rqd.id
            WHERE rd.approval_status = 'PENDING'
            ORDER BY rd.date DESC`);
        const formattedRows = rows.map(row => ({
            ...row,
            date: formatDateForDB(row.date),
            invoice_date: formatDateForDB(row.invoice_date),
            receive_date: formatDateForDB(row.receive_date),
            request_date: formatDateForDB(row.request_date),
            customs_date: formatDateForDB(row.customs_date),
            inspection_details: JSON.parse(row.inspection_details)
        }));
        logEvents(`Successfully fetched ${formattedRows.length} pending RRPs`, "rrpLog.log");
        res.status(200).json({
            config,
            pendingRRPs: formattedRows
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching pending RRPs: ${errorMessage}`, "rrpLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching pending RRPs'
        });
    }
};
export const approveRRP = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        logEvents(`Starting RRP approval transaction for RRP: ${req.params.rrpNumber}`, "rrpLog.log");
        const rrpNumber = req.params.rrpNumber;
        const { approved_by } = req.body;
        const [rrpCheck] = await connection.query<RowDataPacket[]>('SELECT id, approval_status FROM rrp_details WHERE rrp_number = ?', [rrpNumber]);
        if (rrpCheck.length === 0) {
            await connection.rollback();
            logEvents(`Failed to approve RRP - Not found: ${rrpNumber}`, "rrpLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'RRP not found'
            });
            return;
        }
        if (rrpCheck[0].approval_status === 'APPROVED') {
            await connection.rollback();
            logEvents(`Failed to approve RRP - Already approved: ${rrpNumber}`, "rrpLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'RRP is already approved'
            });
            return;
        }
        const [result] = await connection.query(`UPDATE rrp_details 
            SET approval_status = 'APPROVED',
                approved_by = ?
            WHERE rrp_number = ? AND approval_status != 'APPROVED'`, [approved_by, rrpNumber]);
        if ((result as any).affectedRows === 0) {
            await connection.rollback();
            logEvents(`Failed to approve RRP - No rows affected: ${rrpNumber}`, "rrpLog.log");
            res.status(500).json({
                error: 'Internal Server Error',
                message: 'Failed to approve RRP'
            });
            return;
        }
        await connection.commit();
        logEvents(`Successfully approved RRP ${rrpNumber} by user: ${approved_by}`, "rrpLog.log");
        res.status(200).json({ message: 'RRP approved successfully' });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error approving RRP ${req.params.rrpNumber}: ${errorMessage} by user: ${req.body.approved_by}`, "rrpLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while approving RRP'
        });
    }
    finally {
        connection.release();
    }
};
export const rejectRRP = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        logEvents(`Starting RRP rejection transaction for RRP: ${req.params.rrpNumber}`, "rrpLog.log");
        const rrpNumber = req.params.rrpNumber;
        const { rejected_by, rejection_reason } = req.body;
        const [rrpCheck] = await connection.query<RowDataPacket[]>('SELECT id, approval_status FROM rrp_details WHERE rrp_number = ?', [rrpNumber]);
        if (rrpCheck.length === 0) {
            await connection.rollback();
            logEvents(`Failed to reject RRP - Not found: ${rrpNumber}`, "rrpLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'RRP not found'
            });
            return;
        }
        if (rrpCheck[0].approval_status === 'REJECTED') {
            await connection.rollback();
            logEvents(`Failed to reject RRP - Already rejected: ${rrpNumber}`, "rrpLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'RRP is already rejected'
            });
            return;
        }
        const [rrpDetails] = await connection.query<RowDataPacket[]>(`SELECT id, created_by 
             FROM rrp_details 
             WHERE rrp_number = ? 
             ORDER BY id ASC 
             LIMIT 1`, [rrpNumber]);
        const firstItemId = rrpDetails[0].id;
        const createdBy = rrpDetails[0].created_by;
        const [users] = await connection.query<RowDataPacket[]>('SELECT id FROM users WHERE username = ?', [createdBy]);
        if (users.length === 0) {
            await connection.rollback();
            logEvents(`Failed to reject RRP - User not found: ${createdBy}`, "rrpLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'User not found'
            });
            return;
        }
        const userId = users[0].id;
        const [result] = await connection.query(`UPDATE rrp_details 
            SET approval_status = 'REJECTED',
                rejected_by = ?,
                rejection_reason = ?
            WHERE rrp_number = ? AND approval_status != 'REJECTED'`, [rejected_by, rejection_reason, rrpNumber]);
        if ((result as any).affectedRows === 0) {
            await connection.rollback();
            logEvents(`Failed to reject RRP - No rows affected: ${rrpNumber}`, "rrpLog.log");
            res.status(500).json({
                error: 'Internal Server Error',
                message: 'Failed to reject RRP'
            });
            return;
        }
        await connection.query(`UPDATE receive_details rd
             SET rrp_fk = NULL
             WHERE EXISTS (
                 SELECT 1 FROM rrp_details rrp
                 WHERE rrp.receive_fk = rd.id
                 AND rrp.rrp_number = ?
             )`, [rrpNumber]);
        await connection.query(`INSERT INTO notifications 
             (user_id, reference_type, message, reference_id)
             VALUES (?, ?, ?, ?)`, [
            userId,
            'rrp',
            `Your RRP number ${rrpNumber} has been rejected for the following reason: ${rejection_reason}`,
            firstItemId
        ]);
        await connection.commit();
        logEvents(`Successfully rejected RRP ${rrpNumber} by user: ${rejected_by} with reason: ${rejection_reason}`, "rrpLog.log");
        res.status(200).json({ message: 'RRP rejected successfully' });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error rejecting RRP ${req.params.rrpNumber}: ${errorMessage} by user: ${req.body.rejected_by}`, "rrpLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while rejecting RRP'
        });
    }
    finally {
        connection.release();
    }
};
export const updateRRP = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        logEvents(`Starting RRP update transaction for RRP: ${req.params.rrpNumber}`, "rrpLog.log");
        const rrpNumber = req.params.rrpNumber;
        const updateData: RRPUpdateData = req.body;
        const [configRows] = await connection.query<ConfigRow[]>('SELECT config_name, config_value FROM app_config WHERE config_type = ?', ['rrp']);
        const config: Record<string, any> = {};
        configRows.forEach(row => {
            try {
                config[row.config_name] = JSON.parse(row.config_value);
            }
            catch {
                config[row.config_name] = row.config_value;
            }
        });
        const formattedRRPDate = formatDateForDB(updateData.date);
        const formattedInvoiceDate = formatDateForDB(updateData.invoice_date);
        const formattedCustomsDate = formatDateForDB(updateData.customs_date);
        const [existingItems] = await connection.query<RowDataPacket[]>('SELECT id, receive_fk FROM rrp_details WHERE rrp_number = ?', [rrpNumber]);
        const existingItemIds = existingItems.map(item => item.id);
        const updatedItemIds = updateData.items.filter((item: RRPUpdateItem) => item.id).map((item: RRPUpdateItem) => item.id);
        const itemsToDelete = existingItemIds.filter(id => !updatedItemIds.includes(id));
        if (itemsToDelete.length > 0) {
            const [itemsToDeleteDetails] = await connection.query<RowDataPacket[]>('SELECT receive_fk FROM rrp_details WHERE id IN (?)', [itemsToDelete]);
            const receiveFks = itemsToDeleteDetails.map(item => item.receive_fk);
            if (receiveFks.length > 0) {
                await connection.query('UPDATE receive_details SET rrp_fk = NULL WHERE id IN (?)', [receiveFks]);
            }
            await connection.query('DELETE FROM rrp_details WHERE id IN (?)', [itemsToDelete]);
            logEvents(`Deleted ${itemsToDelete.length} items from RRP ${rrpNumber}`, "rrpLog.log");
        }
        let updateSuccess = false;
        for (const item of updateData.items) {
            if (item.id) {
                const updateFields = [
                    'rrp_number = ?',
                    'supplier_name = ?',
                    'date = ?',
                    'currency = ?',
                    'forex_rate = ?',
                    'item_price = ?',
                    'customs_charge = ?',
                    'customs_service_charge = ?',
                    'vat_percentage = ?',
                    'invoice_number = ?',
                    'invoice_date = ?',
                    'customs_date = ?',
                    'po_number = ?',
                    'airway_bill_number = ?',
                    'inspection_details = ?',
                    'freight_charge = ?',
                    'total_amount = ?',
                    'customs_number = ?',
                    'updated_at = CURRENT_TIMESTAMP'
                ];
                const updateValues = [
                    updateData.rrp_number,
                    updateData.supplier_name,
                    formattedRRPDate,
                    updateData.currency,
                    updateData.forex_rate,
                    item.item_price,
                    item.customs_charge,
                    item.customs_service_charge,
                    item.vat_percentage,
                    updateData.invoice_number,
                    formattedInvoiceDate,
                    formattedCustomsDate,
                    updateData.po_number || null,
                    updateData.airway_bill_number || null,
                    JSON.stringify({
                        inspection_user: updateData.inspection_user,
                    }),
                    item.freight_charge,
                    item.total_amount,
                    updateData.customs_number || null
                ];
                if (item.approval_status) {
                    updateFields.push('approval_status = ?');
                    updateValues.push(item.approval_status);
                }
                updateValues.push(item.id);
                const [result] = await connection.query(`UPDATE rrp_details 
                    SET ${updateFields.join(', ')}
                    WHERE id = ?`, updateValues);
                if ((result as any).affectedRows > 0) {
                    updateSuccess = true;
                }
            }
            else {
                const [result] = await connection.query(`INSERT INTO rrp_details (
                        receive_fk, rrp_number, supplier_name, date, currency, forex_rate,
                        item_price, customs_charge, customs_service_charge, vat_percentage,
                        invoice_number, invoice_date, po_number, airway_bill_number,
                        inspection_details, approval_status, created_by, total_amount,
                        freight_charge, customs_date, customs_number
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    item.receive_id,
                    updateData.rrp_number,
                    updateData.supplier_name,
                    formattedRRPDate,
                    updateData.currency,
                    updateData.forex_rate,
                    item.item_price,
                    item.customs_charge,
                    item.customs_service_charge,
                    item.vat_percentage,
                    updateData.invoice_number,
                    formattedInvoiceDate,
                    updateData.po_number || null,
                    updateData.airway_bill_number || null,
                    JSON.stringify({
                        inspection_user: updateData.inspection_user,
                        inspection_details: config.inspection_details || {}
                    }),
                    item.approval_status || 'PENDING',
                    updateData.created_by,
                    item.total_amount,
                    item.freight_charge,
                    formattedCustomsDate,
                    updateData.customs_number || null
                ]);
                const rrpId = (result as any).insertId;
                await connection.query('UPDATE receive_details SET rrp_fk = ? WHERE id = ?', [rrpId, item.receive_id]);
                updateSuccess = true;
            }
        }
        if (!updateSuccess) {
            await connection.rollback();
            logEvents(`Failed to update RRP - No matching items found: ${rrpNumber}`, "rrpLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'No matching RRP items were found to update'
            });
            return;
        }
        await connection.commit();
        logEvents(`Successfully updated RRP ${rrpNumber} with ${updateData.items.length} items`, "rrpLog.log");
        res.status(200).json({ message: 'RRP updated successfully' });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error updating RRP ${req.params.rrpNumber}: ${errorMessage}`, "rrpLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while updating RRP'
        });
    }
    finally {
        connection.release();
    }
};
const getRRPType = (rrpNumber: string): RRPType => {
    const firstChar = rrpNumber.charAt(0).toUpperCase();
    return {
        type: firstChar === 'L' ? 'local' : 'foreign'
    };
};
export const getRRPById = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id;
        const [rrpNumberResult] = await pool.query<RowDataPacket[]>('SELECT rrp_number FROM rrp_details WHERE id = ?', [id]);
        if (rrpNumberResult.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'RRP not found'
            });
            return;
        }
        const rrpNumber = rrpNumberResult[0].rrp_number;
        const rrpType = getRRPType(rrpNumber);
        const [configRows] = await pool.query<ConfigRow[]>('SELECT config_name, config_value FROM app_config WHERE config_type = ?', ['rrp']);
        const config: Record<string, any> = {};
        configRows.forEach(row => {
            try {
                config[row.config_name] = JSON.parse(row.config_value);
            }
            catch {
                config[row.config_name] = row.config_value;
            }
        });
        const [rows] = await pool.query<RowDataPacket[]>(`SELECT 
                rd.id,
                rd.rrp_number,
                rd.supplier_name,
                rd.date,
                rd.currency,
                rd.forex_rate,
                rd.item_price,
                rd.customs_charge,
                rd.customs_number,
                rd.customs_service_charge,
                rd.vat_percentage,
                rd.invoice_number,
                rd.invoice_date,
                rd.po_number,
                rd.airway_bill_number,
                rd.inspection_details,
                rd.approval_status,
                rd.created_by,
                rd.total_amount,
                rd.freight_charge,
                rd.customs_date,
                rd.reference_doc,
                rd.receive_fk,
                red.item_name,
                red.nac_code,
                red.part_number,
                red.received_quantity,
                red.unit,
                red.received_by,
                red.receive_date,
                rqd.request_number,
                rqd.request_date,
                rqd.requested_by,
                rqd.requested_by_id,
                rqd.requested_by_email,
                rqd.equipment_number
            FROM rrp_details rd
            JOIN receive_details red ON rd.receive_fk = red.id
            JOIN request_details rqd ON red.request_fk = rqd.id
            WHERE rd.rrp_number = ?
            ORDER BY rd.id ASC`, [rrpNumber]);
        const requestedByAuthorities = new Map<number, {
            name: string;
            designation: string;
        }>();
        const authorityIds = new Set<number>();
        let hasItemsWithoutRequestedBy = false;
        for (const row of rows) {
            if (row.requested_by_id) {
                authorityIds.add(row.requested_by_id);
            }
            else {
                hasItemsWithoutRequestedBy = true;
            }
        }
        if (authorityIds.size > 0) {
            const [authorityRows] = await pool.query<RowDataPacket[]>(`SELECT id, name, designation FROM requesting_receiving_authority 
                 WHERE id IN (${Array.from(authorityIds).map(() => '?').join(',')}) AND is_active = 1`, Array.from(authorityIds));
            for (const authority of authorityRows) {
                requestedByAuthorities.set(authority.id, {
                    name: authority.name,
                    designation: authority.designation
                });
            }
        }
        const allAuthorities: {
            name: string;
            designation: string;
        }[] = Array.from(requestedByAuthorities.values());
        if (hasItemsWithoutRequestedBy && rows.length > 0) {
            try {
                const firstRowInspectionDetails = JSON.parse(rows[0].inspection_details);
                if (firstRowInspectionDetails.inspection_user && !firstRowInspectionDetails.from_requested_by) {
                    const parts = firstRowInspectionDetails.inspection_user.split(',');
                    if (parts.length >= 2) {
                        const manualName = parts[0].trim();
                        const manualDesignation = parts.slice(1).join(',').trim();
                        const exists = allAuthorities.some(a => a.name === manualName && a.designation === manualDesignation);
                        if (!exists) {
                            allAuthorities.push({ name: manualName, designation: manualDesignation });
                        }
                    }
                }
                else if (firstRowInspectionDetails.names && firstRowInspectionDetails.designations && firstRowInspectionDetails.includes_manual) {
                    const storedNames = Array.isArray(firstRowInspectionDetails.names)
                        ? firstRowInspectionDetails.names
                        : [firstRowInspectionDetails.names];
                    const storedDesignations = Array.isArray(firstRowInspectionDetails.designations)
                        ? firstRowInspectionDetails.designations
                        : [firstRowInspectionDetails.designations];
                    for (let i = 0; i < storedNames.length; i++) {
                        const exists = allAuthorities.some(a => a.name === storedNames[i] && a.designation === storedDesignations[i]);
                        if (!exists) {
                            allAuthorities.push({
                                name: storedNames[i],
                                designation: storedDesignations[i]
                            });
                        }
                    }
                }
            }
            catch (e) {
            }
        }
        let inspectionUserString = '';
        let inspectionDetailsObj: any = {};
        if (allAuthorities.length > 0) {
            const names = allAuthorities.map(a => a.name).join(' / ');
            const designations = allAuthorities.map(a => a.designation).join(' / ');
            inspectionUserString = `${names},${designations}`;
            inspectionDetailsObj = {
                inspection_user: inspectionUserString,
                names: allAuthorities.map(a => a.name),
                designations: allAuthorities.map(a => a.designation),
                from_requested_by: requestedByAuthorities.size > 0,
                includes_manual: hasItemsWithoutRequestedBy
            };
        }
        const formattedRows = rows.map(row => {
            const storedInspectionDetails = JSON.parse(row.inspection_details);
            const finalInspectionDetails = allAuthorities.length > 0
                ? inspectionDetailsObj
                : storedInspectionDetails;
            return {
                ...row,
                date: formatDate(row.date),
                invoice_date: formatDate(row.invoice_date),
                receive_date: formatDate(row.receive_date),
                request_date: formatDate(row.request_date),
                customs_date: formatDate(row.customs_date),
                inspection_details: finalInspectionDetails
            };
        });
        res.status(200).json({
            config,
            rrpDetails: formattedRows,
            type: rrpType.type
        });
    }
    catch (error) {
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching RRP details'
        });
    }
};
export const searchRRP = async (req: Request, res: Response): Promise<void> => {
    const { universal, equipmentNumber, partNumber, page = 1, pageSize = 20 } = req.query;
    const currentPage = parseInt(page as string) || 1;
    const limit = parseInt(pageSize as string) || 20;
    const offset = (currentPage - 1) * limit;
    logEvents(`searchRRP called with: universal=${universal}, equipmentNumber=${equipmentNumber}, partNumber=${partNumber}, page=${page}, pageSize=${pageSize}`, "rrpLog.log");
    try {
        let whereClause = "WHERE rrp.rrp_number != 'Code Transfer' AND rrp.rrp_number != 'TENDER-FREE'";
        const params: any[] = [];
        if (universal && universal !== '') {
            whereClause += " AND (rrp.rrp_number LIKE ? OR rd.item_name LIKE ? OR rd.part_number LIKE ? OR COALESCE(rqd.equipment_number, '') LIKE ? OR rd.tender_reference_number LIKE ?)";
            params.push(`%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`);
        }
        if (equipmentNumber && equipmentNumber !== '') {
            whereClause += " AND COALESCE(rqd.equipment_number, '') LIKE ?";
            params.push(`%${equipmentNumber}%`);
        }
        if (partNumber && partNumber !== '') {
            whereClause += " AND rd.part_number LIKE ?";
            params.push(`%${partNumber}%`);
        }
        const countQuery = `SELECT COUNT(DISTINCT rrp.rrp_number) as total FROM rrp_details rrp JOIN receive_details rd ON rrp.receive_fk = rd.id LEFT JOIN request_details rqd ON rd.request_fk = rqd.id ${whereClause}`;
        logEvents(`Count query: ${countQuery}`, "rrpLog.log");
        logEvents(`Count params: ${JSON.stringify(params)}`, "rrpLog.log");
        const [countResult] = await pool.execute<RowDataPacket[]>(countQuery, params);
        const totalCount = countResult[0].total;
        logEvents(`Count result: ${totalCount}`, "rrpLog.log");
        const mainQuery = `SELECT DISTINCT rrp.id, rrp.rrp_number, rrp.date as rrp_date, rrp.supplier_name, rrp.currency, rrp.forex_rate, rrp.item_price, rrp.customs_charge, rrp.customs_service_charge, rrp.vat_percentage, rrp.invoice_number, rrp.invoice_date, rrp.po_number, rrp.airway_bill_number, rrp.inspection_details, rrp.approval_status, rrp.created_by, rrp.total_amount, rrp.freight_charge, rrp.customs_date, rrp.customs_number, rrp.reference_doc, rd.item_name, rd.part_number, rd.received_quantity, rd.unit, COALESCE(rqd.equipment_number, 'N/A') as equipment_number, rd.receive_source, rd.tender_reference_number FROM rrp_details rrp JOIN receive_details rd ON rrp.receive_fk = rd.id LEFT JOIN request_details rqd ON rd.request_fk = rqd.id ${whereClause} ORDER BY rrp.date DESC LIMIT ${limit} OFFSET ${offset}`;
        const mainParams = [...params];
        logEvents(`Main query: ${mainQuery}`, "rrpLog.log");
        logEvents(`Main params: ${JSON.stringify(mainParams)}`, "rrpLog.log");
        let results: RowDataPacket[];
        try {
            [results] = await pool.execute<RowDataPacket[]>(mainQuery, mainParams);
            logEvents(`Main query executed successfully, got ${results.length} results`, "rrpLog.log");
        }
        catch (mainError) {
            logEvents(`Main query error: ${mainError}`, "rrpLog.log");
            throw mainError;
        }
        const groupedResults = results.reduce((acc, result) => {
            if (!acc[result.rrp_number]) {
                acc[result.rrp_number] = {
                    rrpNumber: result.rrp_number,
                    rrpDate: formatDateForDB(result.rrp_date),
                    supplierName: result.supplier_name || '',
                    type: getRRPType(result.rrp_number).type,
                    currency: result.currency,
                    forexRate: result.forex_rate?.toString() || '0',
                    invoiceNumber: result.invoice_number || '',
                    invoiceDate: formatDateForDB(result.invoice_date),
                    poNumber: result.po_number,
                    airwayBillNumber: result.airway_bill_number,
                    customsNumber: result.customs_number,
                    inspectionDetails: JSON.parse(result.inspection_details),
                    approvalStatus: result.approval_status,
                    createdBy: result.created_by || '',
                    customsDate: result.customs_date ? formatDateForDB(result.customs_date) : null,
                    referenceDoc: result.reference_doc,
                    items: []
                };
            }
            acc[result.rrp_number].items.push({
                id: result.id,
                itemName: result.item_name,
                partNumber: result.part_number,
                equipmentNumber: result.equipment_number || 'N/A',
                receivedQuantity: result.received_quantity?.toString() || '0',
                unit: result.unit,
                itemPrice: result.item_price?.toString() || '0',
                customsCharge: result.customs_charge?.toString() || '0',
                receiveSource: result.receive_source,
                tenderReferenceNumber: result.tender_reference_number || '',
                customsServiceCharge: result.customs_service_charge?.toString() || '0',
                vatPercentage: result.vat_percentage?.toString() || '0',
                freightCharge: result.freight_charge?.toString() || '0',
                totalAmount: result.total_amount?.toString() || '0'
            });
            return acc;
        }, {} as Record<string, any>);
        const response = {
            data: Object.values(groupedResults),
            pagination: {
                currentPage,
                pageSize: limit,
                totalCount,
                totalPages: Math.ceil(totalCount / limit)
            }
        };
        logEvents(`Successfully fetched ${response.data.length} RRPs (page ${currentPage})`, "rrpLog.log");
        res.json(response);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error searching RRPs: ${errorMessage}`, "rrpLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
};
export const verifyRRPNumber = async (req: Request, res: Response): Promise<void> => {
    try {
        const { rrpNumber } = req.params;
        const { date } = req.query;
        if (!rrpNumber || !rrpNumber.match(/^[LF]\d{3}(T\d+)?$/)) {
            logEvents(`Failed to verify RRP number - Invalid format: ${rrpNumber}`, "rrpLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'Invalid RRP number format. Must be in format L001 or L001T1'
            });
            return;
        }
        if (!date) {
            logEvents(`Failed to verify RRP number - Missing date parameter`, "rrpLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'RRP date is required'
            });
            return;
        }
        if (rrpNumber.includes('T')) {
            const [rejectedRecord] = await pool.query<RowDataPacket[]>(`SELECT rrp_number, date 
                 FROM rrp_details 
                 WHERE rrp_number = ? AND approval_status = 'REJECTED'`, [rrpNumber]);
            if (rejectedRecord.length === 0) {
                logEvents(`Failed to verify RRP number - Not found or not rejected: ${rrpNumber}`, "rrpLog.log");
                res.status(400).json({
                    error: 'Bad Request',
                    message: 'Invalid RRP Number'
                });
                return;
            }
            const baseNumber = rrpNumber.split('T')[0];
            const currentTNumber = parseInt(rrpNumber.split('T')[1]);
            const [previousRecord] = await pool.query<RowDataPacket[]>(`SELECT rrp_number, date 
                 FROM rrp_details 
                 WHERE rrp_number LIKE ? 
                 AND CAST(SUBSTRING_INDEX(rrp_number, 'T', -1) AS UNSIGNED) < ?
                 ORDER BY CAST(SUBSTRING_INDEX(rrp_number, 'T', -1) AS UNSIGNED) DESC
                 LIMIT 1`, [`${baseNumber}T%`, currentTNumber]);
            const [nextRecord] = await pool.query<RowDataPacket[]>(`SELECT rrp_number, date 
                 FROM rrp_details 
                 WHERE rrp_number LIKE ? 
                 AND CAST(SUBSTRING_INDEX(rrp_number, 'T', -1) AS UNSIGNED) > ?
                 ORDER BY CAST(SUBSTRING_INDEX(rrp_number, 'T', -1) AS UNSIGNED) ASC
                 LIMIT 1`, [`${baseNumber}T%`, currentTNumber]);
            const inputDate = new Date(date as string);
            if (previousRecord.length > 0) {
                const previousDate = new Date(previousRecord[0].date);
                if (inputDate < previousDate) {
                    logEvents(`Failed to verify RRP number - Date before previous RRP: ${rrpNumber}`, "rrpLog.log");
                    res.status(400).json({
                        error: 'Bad Request',
                        message: 'RRP date cannot be before the previous RRP date'
                    });
                    return;
                }
            }
            if (nextRecord.length > 0) {
                const nextDate = new Date(nextRecord[0].date);
                if (inputDate > nextDate) {
                    logEvents(`Failed to verify RRP number - Date after next RRP: ${rrpNumber}`, "rrpLog.log");
                    res.status(400).json({
                        error: 'Bad Request',
                        message: 'RRP date cannot be greater than the next RRP date'
                    });
                    return;
                }
            }
            logEvents(`Successfully verified RRP number: ${rrpNumber}`, "rrpLog.log");
            res.status(200).json({
                rrpNumber: rrpNumber
            });
        }
        else {
            const [configRows] = await pool.query<RowDataPacket[]>('SELECT config_value FROM app_config WHERE config_type = ? AND config_name = ?', ['rrp', 'current_fy']);
            if (configRows.length === 0) {
                logEvents(`Failed to verify RRP number - Current FY configuration not found`, "rrpLog.log");
                res.status(500).json({
                    error: 'Internal Server Error',
                    message: 'Current FY configuration not found'
                });
                return;
            }
            const currentFY = configRows[0].config_value;
            const [rows] = await pool.query<RowDataPacket[]>(`SELECT rrp_number, approval_status, current_fy
                 FROM rrp_details 
                 WHERE rrp_number LIKE ?
                 ORDER BY CAST(SUBSTRING_INDEX(rrp_number, 'T', -1) AS UNSIGNED) DESC
                 LIMIT 1`, [`${rrpNumber}T%`]);
            if (rows.length > 0) {
                const recordFY = rows[0].current_fy;
                if (recordFY === currentFY) {
                    logEvents(`Failed to verify RRP number - Duplicate in current FY: ${rrpNumber}`, "rrpLog.log");
                    res.status(400).json({
                        error: 'Bad Request',
                        message: 'Duplicate RRP number in current fiscal year'
                    });
                    return;
                }
            }
            logEvents(`Successfully verified RRP number: ${rrpNumber}`, "rrpLog.log");
            res.status(200).json({});
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error verifying RRP number ${req.params.rrpNumber}: ${errorMessage}`, "rrpLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while verifying RRP number'
        });
    }
};
export const getLatestRRPDetails = async (req: Request, res: Response): Promise<void> => {
    try {
        const { type } = req.params;
        if (!type || (type !== 'local' && type !== 'foreign')) {
            logEvents(`Failed to fetch latest RRP details - Invalid type: ${type}`, "rrpLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'Invalid RRP type. Must be either "local" or "foreign"'
            });
            return;
        }
        const prefix = type === 'local' ? 'L' : 'F';
        const [numberRows] = await pool.query<RowDataPacket[]>(`SELECT 
                rrp_number,
                date as rrp_date
             FROM rrp_details 
             WHERE rrp_number LIKE ?
             ORDER BY 
                CAST(SUBSTRING(rrp_number, 2, 3) AS UNSIGNED) DESC,
                CASE 
                    WHEN rrp_number LIKE '%T%' 
                    THEN CAST(SUBSTRING_INDEX(rrp_number, 'T', -1) AS UNSIGNED) 
                    ELSE 0 
                END DESC
             LIMIT 1`, [`${prefix}%`]);
        const [dateRows] = await pool.query<RowDataPacket[]>(`SELECT 
                rrp_number,
                date as rrp_date
             FROM rrp_details
             WHERE rrp_number LIKE ?
             AND approval_status <> 'REJECTED'
             ORDER BY date DESC, id DESC
             LIMIT 1`, [`${prefix}%`]);
        let nextRRPNumber = `${prefix}001`;
        if (numberRows.length > 0 && numberRows[0].rrp_number) {
            const latestNumber = numberRows[0].rrp_number as string;
            const basePart = latestNumber.includes('T') ? latestNumber.split('T')[0] : latestNumber;
            const numericPart = parseInt(basePart.slice(1), 10) || 0;
            const incremented = numericPart + 1;
            nextRRPNumber = `${prefix}${incremented.toString().padStart(3, '0')}`;
        }
        const latestRRP = {
            rrpNumber: dateRows.length > 0 ? dateRows[0].rrp_number : (numberRows[0]?.rrp_number ?? null),
            rrpDate: dateRows.length > 0 ? dateRows[0].rrp_date : null,
            nextRRPNumber
        };
        logEvents(`Successfully fetched latest ${type} RRP details: ${latestRRP.rrpNumber || 'None found'} | Next: ${nextRRPNumber}`, "rrpLog.log");
        res.status(200).json(latestRRP);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching latest RRP details for type ${req.params.type}: ${errorMessage}`, "rrpLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching latest RRP details'
        });
    }
};
export const uploadRRPReferenceDoc = async (req: Request, res: Response): Promise<void> => {
    try {
        const userPermissions = req.permissions || [];
        const { rrpNumber, imagePath } = req.body;
        const [existingDoc] = await pool.query<RowDataPacket[]>('SELECT reference_doc FROM rrp_details WHERE rrp_number = ? AND reference_doc IS NOT NULL LIMIT 1', [rrpNumber]);
        const isEdit = existingDoc.length > 0 && existingDoc[0].reference_doc;
        if (isEdit) {
            if (!userPermissions.includes('can_edit_reference_documents')) {
                res.status(403).json({
                    error: 'Forbidden',
                    message: 'You do not have permission to edit/replace reference documents'
                });
                return;
            }
        }
        else {
            if (!userPermissions.includes('can_upload_reference_documents')) {
                res.status(403).json({
                    error: 'Forbidden',
                    message: 'You do not have permission to upload reference documents'
                });
                return;
            }
        }
        if (!rrpNumber || !imagePath) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'RRP number and image path are required'
            });
            return;
        }
        const [result] = await pool.query('UPDATE rrp_details SET reference_doc = ? WHERE rrp_number = ?', [imagePath, rrpNumber]);
        if ((result as any).affectedRows === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'RRP not found'
            });
            return;
        }
        logEvents(`Successfully uploaded reference document for RRP ${rrpNumber}`, "rrpLog.log");
        res.status(200).json({
            message: 'Reference document uploaded successfully',
            rrpNumber,
            imagePath
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error uploading RRP reference document: ${errorMessage}`, "rrpLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while uploading reference document'
        });
    }
};
export const deleteRRPReferenceDoc = async (req: Request, res: Response): Promise<void> => {
    try {
        const userPermissions = req.permissions || [];
        if (!userPermissions.includes('can_delete_reference_documents')) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'You do not have permission to delete reference documents'
            });
            return;
        }
        const { rrpNumber } = req.params;
        if (!rrpNumber) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'RRP number is required'
            });
            return;
        }
        const [result] = await pool.query('UPDATE rrp_details SET reference_doc = NULL WHERE rrp_number = ?', [rrpNumber]);
        if ((result as any).affectedRows === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'RRP not found'
            });
            return;
        }
        logEvents(`Deleted reference document for RRP ${rrpNumber}`, 'rrpLog.log');
        res.status(200).json({
            message: 'Reference document deleted successfully',
            rrpNumber,
            updatedRecords: (result as any).affectedRows
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error deleting RRP reference document: ${errorMessage}`, 'rrpLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'An error occurred while deleting reference document'
        });
    }
};
