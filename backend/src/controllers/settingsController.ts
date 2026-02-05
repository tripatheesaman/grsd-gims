import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';
import { testSMTPConnection } from '../services/mailer';
export const getFiscalYear = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.execute<RowDataPacket[]>('SELECT config_value FROM app_config WHERE config_name = ?', ['current_fy']);
        if (rows.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Fiscal year configuration not found'
            });
            return;
        }
        res.status(200).json({
            fiscalYear: rows[0].config_value
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getFiscalYear: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const updateFiscalYear = async (req: Request, res: Response): Promise<void> => {
    const { fiscalYear } = req.body;
    const connection = await pool.getConnection();
    try {
        if (!fiscalYear) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Fiscal year is required'
            });
            return;
        }
        const fiscalYearRegex = /^\d{4}\/\d{2}$/;
        if (!fiscalYearRegex.test(fiscalYear)) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Invalid fiscal year format. Must be in format YYYY/YY (e.g., 2081/82)'
            });
            return;
        }
        const [result] = await connection.execute('UPDATE app_config SET config_value = ? WHERE config_name = ?', [fiscalYear, 'current_fy']);
        if ((result as any).affectedRows === 0) {
            await connection.execute('INSERT INTO app_config (config_name, config_value) VALUES (?, ?)', ['current_fy', fiscalYear]);
        }
        res.status(200).json({
            message: 'Fiscal year updated successfully',
            fiscalYear
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in updateFiscalYear: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const getRequestAuthorityDetails = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.execute<RowDataPacket[]>('SELECT * FROM authority_details WHERE authority_type = ?', ['request']);
        res.status(200).json(rows);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getRequestAuthorityDetails: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const updateRequestAuthorityDetails = async (req: Request, res: Response): Promise<void> => {
    const { authorityDetails } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.execute('DELETE FROM authority_details WHERE authority_type = ?', ['request']);
        for (const auth of authorityDetails) {
            await connection.execute(`INSERT INTO authority_details (
          authority_type,
          level_1_authority_name,
          level_1_authority_staffid,
          level_1_authority_designation,
          level_2_authority_name,
          level_2_authority_staffid,
          level_2_authority_designation,
          level_3_authority_name,
          level_3_authority_staffid,
          level_3_authority_designation,
          quality_check_authority_name,
          quality_check_authority_staffid,
          quality_check_authority_designation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                'request',
                auth.level_1_authority_name,
                auth.level_1_authority_staffid,
                auth.level_1_authority_designation,
                auth.level_2_authority_name,
                auth.level_2_authority_staffid,
                auth.level_2_authority_designation,
                auth.level_3_authority_name,
                auth.level_3_authority_staffid,
                auth.level_3_authority_designation,
                auth.quality_check_authority_name,
                auth.quality_check_authority_staffid,
                auth.quality_check_authority_designation
            ]);
        }
        await connection.commit();
        res.status(200).json({ message: 'Authority details updated successfully' });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in updateRequestAuthorityDetails: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const getRRPAuthorityDetails = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.execute<RowDataPacket[]>('SELECT * FROM authority_details WHERE authority_type = ?', ['rrp']);
        res.status(200).json(rows);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getRRPAuthorityDetails: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const updateRRPAuthorityDetails = async (req: Request, res: Response): Promise<void> => {
    const { authorityDetails } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.execute('DELETE FROM authority_details WHERE authority_type = ?', ['rrp']);
        for (const auth of authorityDetails) {
            await connection.execute(`INSERT INTO authority_details (
          authority_type,
          level_1_authority_name,
          level_1_authority_staffid,
          level_1_authority_designation,
          level_2_authority_name,
          level_2_authority_staffid,
          level_2_authority_designation,
          level_3_authority_name,
          level_3_authority_staffid,
          level_3_authority_designation,
          quality_check_authority_name,
          quality_check_authority_staffid,
          quality_check_authority_designation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                'rrp',
                auth.level_1_authority_name,
                auth.level_1_authority_staffid,
                auth.level_1_authority_designation,
                auth.level_2_authority_name,
                auth.level_2_authority_staffid,
                auth.level_2_authority_designation,
                auth.level_3_authority_name,
                auth.level_3_authority_staffid,
                auth.level_3_authority_designation,
                auth.quality_check_authority_name,
                auth.quality_check_authority_staffid,
                auth.quality_check_authority_designation
            ]);
        }
        await connection.commit();
        res.status(200).json({ message: 'Authority details updated successfully' });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in updateRRPAuthorityDetails: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const getRRPSuppliers = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const page = Math.max(parseInt(String(req.query.page || '1'), 10), 1);
        const pageSize = Math.max(parseInt(String(req.query.pageSize || '25'), 10), 1);
        const offset = (page - 1) * pageSize;
        const [countRows] = await connection.execute<RowDataPacket[]>(`SELECT COUNT(*) as total FROM suppliers WHERE is_active = 1`);
        const totalCount = Number(countRows?.[0]?.total || 0);
        const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);
        const limitNum = Number(pageSize);
        const offsetNum = Number(offset);
        const [rows] = await connection.execute<RowDataPacket[]>(`SELECT id, name, supplier_type AS type, is_active 
       FROM suppliers 
       WHERE is_active = 1 
       ORDER BY name
       LIMIT ${limitNum} OFFSET ${offsetNum}`);
        res.status(200).json({
            data: rows,
            pagination: {
                page,
                pageSize,
                totalPages,
                totalCount
            }
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getRRPSuppliers: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const addRRPSupplier = async (req: Request, res: Response): Promise<void> => {
    const { name, type } = req.body;
    const connection = await pool.getConnection();
    try {
        if (!name || !type) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Name and type are required'
            });
            return;
        }
        await connection.execute(`INSERT INTO suppliers (name, supplier_type, is_active) VALUES (?, ?, 1)`, [name.trim(), type]);
        const [rows] = await connection.execute<RowDataPacket[]>(`SELECT id, name, supplier_type AS type, is_active 
       FROM suppliers 
       WHERE name = ? AND supplier_type = ? 
       ORDER BY id DESC 
       LIMIT 1`, [name.trim(), type]);
        res.status(201).json(rows[0]);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in addRRPSupplier: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const updateRRPSupplier = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { name, type, is_active } = req.body;
    const connection = await pool.getConnection();
    try {
        if (!name || !type) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Name and type are required'
            });
            return;
        }
        const [result] = await connection.execute(`UPDATE suppliers 
       SET name = ?, supplier_type = ?, is_active = COALESCE(?, is_active) 
       WHERE id = ?`, [name.trim(), type, is_active, id]);
        if ((result as any).affectedRows === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Supplier not found'
            });
            return;
        }
        const [rows] = await connection.execute<RowDataPacket[]>(`SELECT id, name, supplier_type AS type, is_active FROM suppliers WHERE id = ?`, [id]);
        res.status(200).json(rows[0]);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in updateRRPSupplier: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const deleteRRPSupplier = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const connection = await pool.getConnection();
    try {
        const [result] = await connection.execute(`UPDATE suppliers SET is_active = 0 WHERE id = ?`, [id]);
        if ((result as any).affectedRows === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Supplier not found'
            });
            return;
        }
        res.status(200).json({ message: 'Supplier deleted successfully' });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in deleteRRPSupplier: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const getFuelSettings = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const [authorityRows] = await connection.execute<RowDataPacket[]>('SELECT * FROM authority_details WHERE authority_type = ? ORDER BY id DESC LIMIT 1', ['fuel']);
        let authorityDetails;
        if (authorityRows.length === 0) {
            authorityDetails = [{
                    id: 1,
                    authority_type: 'fuel',
                    level_1_authority_name: '',
                    level_1_authority_staffid: '',
                    level_1_authority_designation: null,
                    level_2_authority_name: null,
                    level_2_authority_staffid: null,
                    level_2_authority_designation: null,
                    level_3_authority_name: null,
                    level_3_authority_staffid: null,
                    level_3_authority_designation: null,
                    quality_check_authority_name: null,
                    quality_check_authority_staffid: null,
                    quality_check_authority_designation: null,
                    created_at: new Date(),
                    updated_at: new Date()
                }];
        }
        else {
            authorityDetails = authorityRows;
        }
        const [petrolRows] = await connection.execute<RowDataPacket[]>(`SELECT equipment_code FROM fuel_valid_equipments WHERE fuel_type = 'petrol' AND is_active = 1`);
        const [dieselRows] = await connection.execute<RowDataPacket[]>(`SELECT equipment_code FROM fuel_valid_equipments WHERE fuel_type = 'diesel' AND is_active = 1`);
        let petrolList = petrolRows.map((row: any) => String(row.equipment_code).trim()).filter((item: string) => item);
        let dieselList = dieselRows.map((row: any) => String(row.equipment_code).trim()).filter((item: string) => item);
        if (petrolList.length === 0) {
            const [petrolConfig] = await connection.execute<RowDataPacket[]>('SELECT config_value FROM app_config WHERE config_name = ? AND config_type = "fuel"', ['valid_equipment_list_petrol']);
            petrolList = petrolConfig.length > 0 ? petrolConfig[0].config_value.replace(/\r\n/g, '').split(',').map((item: string) => item.trim()).filter((item: string) => item) : [];
        }
        if (dieselList.length === 0) {
            const [dieselConfig] = await connection.execute<RowDataPacket[]>('SELECT config_value FROM app_config WHERE config_name = ? AND config_type = "fuel"', ['valid_equipment_list_diesel']);
            dieselList = dieselConfig.length > 0 ? dieselConfig[0].config_value.replace(/\r\n/g, '').split(',').map((item: string) => item.trim()).filter((item: string) => item) : [];
        }
        const allEquipment = Array.from(new Set([...petrolList, ...dieselList]));
        let equipmentStatus: {
            [key: string]: {
                is_kilometer_reset: boolean | null;
                kilometers: number | null;
            };
        } = {};
        if (allEquipment.length > 0) {
            const [records] = await connection.query<RowDataPacket[]>(`SELECT fr.kilometers, fr.is_kilometer_reset, id.issued_for
         FROM fuel_records fr
         JOIN issue_details id ON fr.issue_fk = id.id
         WHERE id.issued_for IN (?)
         ORDER BY id.issue_date DESC, fr.id DESC`, [allEquipment]);
            for (const equipment of allEquipment) {
                const record = records.find((r: any) => r.issued_for === equipment);
                equipmentStatus[equipment] = record ? {
                    is_kilometer_reset: !!record.is_kilometer_reset,
                    kilometers: record.kilometers
                } : { is_kilometer_reset: null, kilometers: null };
            }
        }
        res.status(200).json({
            authorityDetails,
            petrolList,
            dieselList,
            equipmentStatus
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getFuelSettings: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const updateFuelSettings = async (req: Request, res: Response): Promise<void> => {
    const { authorityDetails, petrolList, dieselList, equipmentStatus } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.execute('DELETE FROM authority_details WHERE authority_type = ?', ['fuel']);
        for (const auth of authorityDetails) {
            await connection.execute(`INSERT INTO authority_details (
          authority_type,
          level_1_authority_name,
          level_1_authority_staffid,
          level_1_authority_designation,
          level_2_authority_name,
          level_2_authority_staffid,
          level_2_authority_designation,
          level_3_authority_name,
          level_3_authority_staffid,
          level_3_authority_designation,
          quality_check_authority_name,
          quality_check_authority_staffid,
          quality_check_authority_designation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                'fuel',
                auth.level_1_authority_name,
                auth.level_1_authority_staffid,
                auth.level_1_authority_designation,
                auth.level_2_authority_name,
                auth.level_2_authority_staffid,
                auth.level_2_authority_designation,
                auth.level_3_authority_name,
                auth.level_3_authority_staffid,
                auth.level_3_authority_designation,
                auth.quality_check_authority_name,
                auth.quality_check_authority_staffid,
                auth.quality_check_authority_designation
            ]);
        }
        await connection.execute('DELETE FROM fuel_valid_equipments WHERE fuel_type = ?', ['petrol']);
        if (petrolList.length) {
            const petrolValues = petrolList.map((code: string) => [code, 'petrol', 1]);
            await connection.query('INSERT INTO fuel_valid_equipments (equipment_code, fuel_type, is_active) VALUES ?', [petrolValues]);
        }
        await connection.execute('DELETE FROM fuel_valid_equipments WHERE fuel_type = ?', ['diesel']);
        if (dieselList.length) {
            const dieselValues = dieselList.map((code: string) => [code, 'diesel', 1]);
            await connection.query('INSERT INTO fuel_valid_equipments (equipment_code, fuel_type, is_active) VALUES ?', [dieselValues]);
        }
        const petrolListStr = petrolList.join(',');
        const dieselListStr = dieselList.join(',');
        await connection.execute('INSERT INTO app_config (config_name, config_value, config_type) VALUES (?, ?, "fuel") ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)', ['valid_equipment_list_petrol', petrolListStr]);
        await connection.execute('INSERT INTO app_config (config_name, config_value, config_type) VALUES (?, ?, "fuel") ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)', ['valid_equipment_list_diesel', dieselListStr]);
        for (const equipment of Object.keys(equipmentStatus)) {
            const status = equipmentStatus[equipment];
            if (status && status.is_kilometer_reset === true) {
                const [latest] = await connection.query<RowDataPacket[]>(`SELECT fr.id
           FROM fuel_records fr
           JOIN issue_details id ON fr.issue_fk = id.id
           WHERE id.issued_for = ?
           ORDER BY id.issue_date DESC, fr.id DESC
           LIMIT 1`, [equipment]);
                if (latest.length > 0) {
                    await connection.execute('UPDATE fuel_records SET is_kilometer_reset = 1 WHERE id = ?', [latest[0].id]);
                }
            }
        }
        await connection.commit();
        res.status(200).json({ message: 'Fuel settings updated successfully' });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in updateFuelSettings: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const getInspectionUsers = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.execute<RowDataPacket[]>(`SELECT id, name, designation, staff_id, section_name, email, is_active
       FROM requesting_receiving_authority
       WHERE is_active = 1
       ORDER BY name`);
        res.status(200).json(rows);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getInspectionUsers: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const getRequestingAuthorityList = getInspectionUsers;
export const addInspectionUser = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const { name, designation, staff_id, section_name, email } = req.body;
        if (!name || !designation) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Name and designation are required'
            });
            return;
        }
        const staffIdValue = (staff_id && typeof staff_id === 'string' && staff_id.trim()) ? staff_id.trim() : null;
        const sectionNameValue = (section_name && typeof section_name === 'string' && section_name.trim()) ? section_name.trim() : null;
        const emailValue = (email && typeof email === 'string' && email.trim()) ? email.trim() : null;
        await connection.execute(`INSERT INTO requesting_receiving_authority (name, designation, staff_id, section_name, email, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`, [name.trim(), designation.trim(), staffIdValue, sectionNameValue, emailValue]);
        const [rows] = await connection.execute<RowDataPacket[]>(`SELECT id, name, designation, staff_id, section_name, email, is_active
       FROM requesting_receiving_authority
       WHERE name = ? AND designation = ?
       ORDER BY id DESC
       LIMIT 1`, [name.trim(), designation.trim()]);
        res.status(201).json(rows[0]);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in addInspectionUser: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const updateInspectionUser = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        const { name, designation, staff_id, section_name, email, is_active } = req.body;
        if (!name || !designation) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Name and designation are required'
            });
            return;
        }
        const staffIdValue = (staff_id && typeof staff_id === 'string' && staff_id.trim()) ? staff_id.trim() : null;
        const sectionNameValue = (section_name && typeof section_name === 'string' && section_name.trim()) ? section_name.trim() : null;
        const emailValue = (email && typeof email === 'string' && email.trim()) ? email.trim() : null;
        const isActiveValue = is_active !== undefined ? is_active : null;
        const [result] = await connection.execute(`UPDATE requesting_receiving_authority
       SET name = ?, designation = ?, staff_id = ?, section_name = ?, email = ?, is_active = COALESCE(?, is_active)
       WHERE id = ?`, [name, designation, staffIdValue, sectionNameValue, emailValue, isActiveValue, id]);
        if ((result as any).affectedRows === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Inspection user not found'
            });
            return;
        }
        const [rows] = await connection.execute<RowDataPacket[]>(`SELECT id, name, designation, staff_id, section_name, email, is_active
       FROM requesting_receiving_authority
       WHERE id = ?`, [id]);
        res.status(200).json(rows[0]);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in updateInspectionUser: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const deleteInspectionUser = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        const [result] = await connection.execute(`UPDATE requesting_receiving_authority SET is_active = 0 WHERE id = ?`, [id]);
        if ((result as any).affectedRows === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Inspection user not found'
            });
            return;
        }
        res.status(200).json({
            message: 'Inspection user deleted successfully'
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in deleteInspectionUser: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
interface RequestEmailSettingsRow extends RowDataPacket {
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
interface RequestEmailRecipientRow extends RowDataPacket {
    id: number;
    settings_id: number;
    email: string;
    role: 'to' | 'cc' | 'bcc';
    send_on_approval: number;
    send_on_reminder: number;
    send_on_force_close: number;
    allow_reminder: number;
    is_active: number;
}
export const getRequestEmailConfig = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const [settingsRows] = await connection.query<RequestEmailSettingsRow[]>(`SELECT * FROM request_email_settings ORDER BY id LIMIT 1`);
        const settings = settingsRows[0] || null;
        const [recipientRows] = await connection.query<RequestEmailRecipientRow[]>(`SELECT * FROM request_email_recipients WHERE is_active = 1 ORDER BY role, id`);
        res.status(200).json({
            settings,
            recipients: recipientRows
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getRequestEmailConfig: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const updateRequestEmailConfig = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    const userPermissions = (req as any).permissions || [];
    if (!userPermissions.includes('can_configure_request_emails')) {
        res.status(403).json({ error: 'Forbidden', message: 'Insufficient permissions' });
        return;
    }
    const { settings, recipients, deactivateRecipientIds = [] }: {
        settings: Partial<RequestEmailSettingsRow>;
        recipients: Array<Partial<RequestEmailRecipientRow>>;
        deactivateRecipientIds?: number[];
    } = req.body;
    try {
        await connection.beginTransaction();
        const [columns] = await connection.query<RowDataPacket[]>(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'request_email_settings'`);
        const hasFromEmailColumn = columns.some(col => col.COLUMN_NAME === 'from_email');
        const hasSmtpUserColumn = columns.some(col => col.COLUMN_NAME === 'smtp_user');
        const hasSmtpPassColumn = columns.some(col => col.COLUMN_NAME === 'smtp_pass');
        const hasReminderIntervalColumn = columns.some(col => col.COLUMN_NAME === 'reminder_interval_min');
        const [existing] = await connection.query<RequestEmailSettingsRow[]>(`SELECT * FROM request_email_settings ORDER BY id LIMIT 1`);
        let settingsId: number;
        if (existing.length === 0) {
            const extraColumns: string[] = [];
            const extraPlaceholders: string[] = [];
            const extraValues: any[] = [];
            if (hasFromEmailColumn) {
                extraColumns.push('from_email');
                extraPlaceholders.push('?');
                extraValues.push(process.env.SMTP_USER || null);
            }
            if (hasSmtpUserColumn) {
                extraColumns.push('smtp_user');
                extraPlaceholders.push('?');
                extraValues.push(process.env.SMTP_USER || null);
            }
            if (hasSmtpPassColumn) {
                extraColumns.push('smtp_pass');
                extraPlaceholders.push('?');
                extraValues.push(process.env.SMTP_PASS || null);
            }
            if (hasReminderIntervalColumn) {
                extraColumns.push('reminder_interval_min');
                extraPlaceholders.push('?');
                extraValues.push(30);
            }
            const columnsSql = extraColumns.length ? `, ${extraColumns.join(', ')}` : '';
            const placeholdersSql = extraPlaceholders.length ? `, ${extraPlaceholders.join(', ')}` : '';
            const [insert] = await connection.execute(`INSERT INTO request_email_settings (send_enabled, reminders_enabled, reminder_days, include_pdf, mail_sending_enabled${columnsSql})
         VALUES (0,0,3,1,1${placeholdersSql})`, extraValues);
            settingsId = (insert as any).insertId;
        }
        else {
            settingsId = existing[0].id;
        }
        if (settings) {
            const { send_enabled, reminders_enabled, reminder_days, include_pdf, mail_sending_enabled, from_email, smtp_user, smtp_pass, reminder_interval_min, } = settings;
            const setFragments = [
                'send_enabled = COALESCE(?, send_enabled)',
                'reminders_enabled = COALESCE(?, reminders_enabled)',
                'reminder_days = COALESCE(?, reminder_days)',
                'include_pdf = COALESCE(?, include_pdf)',
                'mail_sending_enabled = COALESCE(?, mail_sending_enabled)',
            ];
            const values: any[] = [
                send_enabled ?? null,
                reminders_enabled ?? null,
                reminder_days ?? null,
                include_pdf ?? null,
                mail_sending_enabled ?? null,
            ];
            if (hasFromEmailColumn) {
                setFragments.push('from_email = COALESCE(?, from_email)');
                values.push(from_email ?? null);
            }
            if (hasSmtpUserColumn) {
                setFragments.push('smtp_user = COALESCE(?, smtp_user)');
                values.push(smtp_user ?? null);
            }
            if (hasSmtpPassColumn) {
                setFragments.push('smtp_pass = COALESCE(?, smtp_pass)');
                values.push(smtp_pass ?? null);
            }
            if (hasReminderIntervalColumn) {
                setFragments.push('reminder_interval_min = COALESCE(?, reminder_interval_min)');
                values.push(reminder_interval_min ?? null);
            }
            values.push(settingsId);
            await connection.execute(`UPDATE request_email_settings
         SET ${setFragments.join(', ')}
         WHERE id = ?`, values);
        }
        if (Array.isArray(recipients)) {
            for (const r of recipients) {
                if (!r.email || !r.role)
                    continue;
                if (r.id) {
                    await connection.execute(`UPDATE request_email_recipients
             SET email = ?, role = ?, send_on_approval = COALESCE(?, send_on_approval),
                 send_on_reminder = COALESCE(?, send_on_reminder),
                 send_on_force_close = COALESCE(?, send_on_force_close),
                 allow_reminder = COALESCE(?, allow_reminder),
                 is_active = COALESCE(?, is_active)
             WHERE id = ?`, [
                        r.email,
                        r.role,
                        r.send_on_approval ?? null,
                        r.send_on_reminder ?? null,
                        r.send_on_force_close ?? null,
                        r.allow_reminder ?? null,
                        r.is_active ?? null,
                        r.id
                    ]);
                }
                else {
                    await connection.execute(`INSERT INTO request_email_recipients
             (settings_id, email, role, send_on_approval, send_on_reminder, send_on_force_close, allow_reminder, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1)`, [
                        settingsId,
                        r.email,
                        r.role,
                        r.send_on_approval ?? 1,
                        r.send_on_reminder ?? 1,
                        r.send_on_force_close ?? 1,
                        r.allow_reminder ?? 1
                    ]);
                }
            }
        }
        if (Array.isArray(deactivateRecipientIds) && deactivateRecipientIds.length > 0) {
            await connection.query(`UPDATE request_email_recipients SET is_active = 0 WHERE id IN (?)`, [deactivateRecipientIds]);
        }
        await connection.commit();
        res.status(200).json({ message: 'Request email settings updated' });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in updateRequestEmailConfig: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const toggleMailSending = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    const userPermissions = (req as any).permissions || [];
    if (!userPermissions.includes('can_stop_and_start_mail_sending')) {
        res.status(403).json({ error: 'Forbidden', message: 'Insufficient permissions' });
        return;
    }
    const { mail_sending_enabled } = req.body as {
        mail_sending_enabled: boolean;
    };
    try {
        const [columns] = await connection.query<RowDataPacket[]>(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'request_email_settings' 
       AND COLUMN_NAME = 'from_email'`);
        const hasFromEmailColumn = columns.length > 0;
        const [existing] = await connection.query<RequestEmailSettingsRow[]>(`SELECT * FROM request_email_settings ORDER BY id LIMIT 1`);
        if (existing.length === 0) {
            if (hasFromEmailColumn) {
                await connection.execute(`INSERT INTO request_email_settings (send_enabled, reminders_enabled, reminder_days, include_pdf, mail_sending_enabled, from_email)
           VALUES (0,0,3,1,?,?)`, [mail_sending_enabled ? 1 : 0, process.env.SMTP_USER || null]);
            }
            else {
                await connection.execute(`INSERT INTO request_email_settings (send_enabled, reminders_enabled, reminder_days, include_pdf, mail_sending_enabled)
           VALUES (0,0,3,1,?)`, [mail_sending_enabled ? 1 : 0]);
            }
        }
        else {
            await connection.execute(`UPDATE request_email_settings SET mail_sending_enabled = ? WHERE id = ?`, [mail_sending_enabled ? 1 : 0, existing[0].id]);
        }
        res.status(200).json({ message: 'Mail sending toggle updated', mail_sending_enabled: !!mail_sending_enabled });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in toggleMailSending: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const verifySMTP = async (_req: Request, res: Response): Promise<void> => {
    const result = await testSMTPConnection();
    if (result.success) {
        res.status(200).json({ message: 'SMTP verified' });
    }
    else {
        res.status(500).json({ error: 'SMTP verification failed', details: result.error });
    }
};
