import { Request, Response } from 'express';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2';
import { logEvents } from '../middlewares/logger';
interface FuelIssueRecord {
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
    fuel_type: string;
    fuel_price: number;
    kilometers: number;
    is_kilometer_reset: boolean;
    week_number: number;
    fy: string;
}
interface FuelIssueFormData {
    issue_slip_number: string;
    issue_date: string;
    nac_code: string;
    part_number: string;
    issue_quantity: number;
    issued_for: string;
    issued_by: string;
    fuel_type: string;
    fuel_price: number;
    kilometers: number;
    is_kilometer_reset: boolean;
}
export const getAllFuelIssueRecords = async (req: Request, res: Response): Promise<void> => {
    const { page = '1', limit = '10', search = '', sortBy = 'issue_date', sortOrder = 'DESC', issueSlipNumber = '', partNumber = '', itemName = '', nacCode = '', issuedFor = '', status = '', issuedBy = '', fuelType = '', fromDate = '', toDate = '', weekNumber = '', equipmentNumber = '' } = req.query;
    const connection = await pool.getConnection();
    try {
        const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
        const validSortFields = ['issue_date', 'issue_slip_number', 'nac_code', 'part_number', 'issued_for', 'issued_by', 'fuel_type', 'kilometers'];
        const validSortBy = validSortFields.includes(sortBy as string) ? sortBy as string : 'issue_date';
        const validSortOrder = ['ASC', 'DESC'].includes((sortOrder as string).toUpperCase()) ? (sortOrder as string).toUpperCase() : 'DESC';
        let searchConditions = '';
        const queryParams: any[] = ['GT 07986', 'GT 00000'];
        if (issueSlipNumber) {
            searchConditions += ' AND i.issue_slip_number LIKE ?';
            queryParams.push(`%${issueSlipNumber}%`);
        }
        if (partNumber) {
            searchConditions += ' AND i.part_number LIKE ?';
            queryParams.push(`%${partNumber}%`);
        }
        if (itemName) {
            searchConditions += ' AND SUBSTRING_INDEX(s.item_name, \',\', 1) LIKE ?';
            queryParams.push(`%${itemName}%`);
        }
        if (nacCode) {
            searchConditions += ' AND i.nac_code = ?';
            queryParams.push(nacCode);
        }
        if (issuedFor) {
            searchConditions += ' AND i.issued_for LIKE ?';
            queryParams.push(`%${issuedFor}%`);
        }
        if (status) {
            searchConditions += ' AND i.approval_status = ?';
            queryParams.push(status);
        }
        if (issuedBy) {
            searchConditions += ' AND i.issued_by LIKE ?';
            queryParams.push(`%${issuedBy}%`);
        }
        if (fuelType) {
            searchConditions += ' AND f.fuel_type = ?';
            queryParams.push(fuelType);
        }
        if (fromDate) {
            searchConditions += ' AND i.issue_date >= ?';
            queryParams.push(fromDate);
        }
        if (toDate) {
            searchConditions += ' AND i.issue_date <= ?';
            queryParams.push(toDate);
        }
        if (weekNumber) {
            searchConditions += ' AND f.week_number = ?';
            queryParams.push(weekNumber);
        }
        if (equipmentNumber) {
            searchConditions += ' AND i.issued_for LIKE ?';
            queryParams.push(`%${equipmentNumber}%`);
        }
        if (search) {
            searchConditions += ` AND (
        i.issue_slip_number LIKE ? OR
        i.part_number LIKE ? OR
        SUBSTRING_INDEX(s.item_name, ',', 1) LIKE ? OR
        i.issued_for LIKE ? OR
        i.issued_by LIKE ? OR
        f.fuel_type LIKE ?
      )`;
            const searchTerm = `%${search}%`;
            queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
        }
        const countQuery = `
      SELECT COUNT(*) as total 
      FROM fuel_records f
      JOIN issue_details i ON f.issue_fk = i.id
      LEFT JOIN stock_details s ON i.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
      WHERE i.nac_code IN (?, ?)
      ${searchConditions}
    `;
        const [countResult] = await connection.execute<RowDataPacket[]>(countQuery, queryParams);
        const total = countResult[0].total;
        const mainQuery = `
      SELECT 
        f.id,
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
        i.approval_status,
        f.fuel_type,
        f.fuel_price,
        f.kilometers,
        f.is_kilometer_reset,
        f.week_number,
        f.fy
      FROM fuel_records f
      JOIN issue_details i ON f.issue_fk = i.id
      LEFT JOIN stock_details s ON i.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
      WHERE i.nac_code IN (?, ?)
      ${searchConditions}
      ORDER BY i.${validSortBy} ${validSortOrder}
      LIMIT ? OFFSET ?
    `;
        const finalQueryParams = [...queryParams, String(parseInt(limit as string)), String(offset)];
        const [rows] = await connection.execute<RowDataPacket[]>(mainQuery, finalQueryParams);
        const formattedRecords = rows.map(row => ({
            ...row,
            issued_by: JSON.parse(row.issued_by)
        }));
        res.status(200).json({
            records: formattedRecords,
            pagination: {
                total,
                page: parseInt(page as string),
                limit: parseInt(limit as string),
                totalPages: Math.ceil(total / parseInt(limit as string))
            }
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error retrieving fuel issue records: ${errorMessage}`, "fuelIssueRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while retrieving fuel issue records'
        });
    }
    finally {
        connection.release();
    }
};
export const getFuelIssueRecordById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.execute<RowDataPacket[]>(`SELECT 
        f.id,
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
        i.approval_status,
        f.fuel_type,
        f.fuel_price,
        f.kilometers,
        f.is_kilometer_reset,
        f.week_number,
        f.fy
      FROM fuel_records f
      JOIN issue_details i ON f.issue_fk = i.id
      LEFT JOIN stock_details s ON i.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
      WHERE f.id = ?`, [id]);
        if (rows.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Fuel issue record not found'
            });
            return;
        }
        const record = {
            ...rows[0],
            issued_by: JSON.parse(rows[0].issued_by)
        };
        res.status(200).json(record);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error retrieving fuel issue record: ${errorMessage} for ID: ${id}`, "fuelIssueRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while retrieving fuel issue record'
        });
    }
    finally {
        connection.release();
    }
};
export const createFuelIssueRecord = async (req: Request, res: Response): Promise<void> => {
    const formData: FuelIssueFormData = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [configRows] = await connection.query<RowDataPacket[]>('SELECT config_value FROM app_config WHERE config_type = ? AND config_name = ?', ['rrp', 'current_fy']);
        if (configRows.length === 0) {
            throw new Error('Current FY configuration not found');
        }
        const currentFY = configRows[0].config_value;
        const [dayNumberResult] = await connection.query<RowDataPacket[]>(`SELECT 
        CASE 
          WHEN MIN(issue_date) IS NULL THEN 1
          ELSE DATEDIFF(?, MIN(issue_date)) + 1
        END as day_number
      FROM issue_details 
      WHERE current_fy = ?`, [formData.issue_date, currentFY]);
        const dayNumber = dayNumberResult[0].day_number;
        const issueSlipNumber = `${dayNumber}Y${currentFY}`;
        const [stockResults] = await connection.query<RowDataPacket[]>('SELECT current_balance FROM stock_details WHERE nac_code = ?', [formData.nac_code]);
        if (stockResults.length === 0) {
            throw new Error(`Stock not found for NAC code: ${formData.nac_code}`);
        }
        const currentBalance = stockResults[0].current_balance;
        if (currentBalance < formData.issue_quantity) {
            throw new Error(`Insufficient stock. Available: ${currentBalance}, Requested: ${formData.issue_quantity}`);
        }
        const issueCost = formData.fuel_price * formData.issue_quantity;
        const [issueResult] = await connection.execute(`INSERT INTO issue_details (
        issue_date,
        nac_code,
        part_number,
        issue_quantity,
        issued_for,
        remaining_balance,
        issue_cost,
        issued_by,
        updated_by,
        issue_slip_number,
        current_fy,
        approval_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`, [
            formData.issue_date,
            formData.nac_code,
            formData.part_number,
            formData.issue_quantity,
            formData.issued_for,
            currentBalance - formData.issue_quantity,
            issueCost,
            JSON.stringify(formData.issued_by),
            JSON.stringify(formData.issued_by),
            issueSlipNumber,
            currentFY
        ]);
        const issueId = (issueResult as any).insertId;
        const [firstRecordResult] = await connection.query<RowDataPacket[]>(`SELECT MIN(i.issue_date) as first_date
       FROM fuel_records f
       JOIN issue_details i ON f.issue_fk = i.id
       WHERE f.fy = ?`, [currentFY]);
        let weekNumber = 1;
        const currentDate = new Date(formData.issue_date);
        if (firstRecordResult[0]?.first_date) {
            const firstDate = new Date(firstRecordResult[0].first_date);
            const firstDateDay = firstDate.getDay();
            const daysToFirstSaturday = (6 - firstDateDay) % 7;
            const firstWeekEnd = new Date(firstDate);
            firstWeekEnd.setDate(firstDate.getDate() + daysToFirstSaturday);
            if (currentDate <= firstWeekEnd) {
                weekNumber = 1;
            }
            else {
                const daysSinceFirstWeekEnd = Math.floor((currentDate.getTime() - firstWeekEnd.getTime()) / (1000 * 60 * 60 * 24));
                weekNumber = Math.floor(daysSinceFirstWeekEnd / 7) + 2;
            }
        }
        const [fuelResult] = await connection.execute(`INSERT INTO fuel_records 
      (fuel_type, kilometers, issue_fk, is_kilometer_reset, fuel_price, week_number, fy) 
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [
            formData.fuel_type,
            formData.kilometers,
            issueId,
            formData.is_kilometer_reset ? 1 : 0,
            formData.fuel_price,
            weekNumber,
            currentFY
        ]);
        const fuelId = (fuelResult as any).insertId;
        await connection.execute('UPDATE stock_details SET current_balance = current_balance - ? WHERE nac_code = ?', [formData.issue_quantity, formData.nac_code]);
        await connection.commit();
        logEvents(`Fuel issue record created successfully - ID: ${fuelId}, Issue ID: ${issueId}`, "fuelIssueRecordsLog.log");
        res.status(201).json({
            message: 'Fuel issue record created successfully',
            id: fuelId,
            issueSlipNumber
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error creating fuel issue record: ${errorMessage}`, "fuelIssueRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while creating fuel issue record'
        });
    }
    finally {
        connection.release();
    }
};
export const updateFuelIssueRecord = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const formData: Partial<FuelIssueFormData> = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [fuelDetails] = await connection.query<RowDataPacket[]>(`SELECT f.*, i.issue_quantity, i.nac_code, i.issue_date, i.issue_slip_number
       FROM fuel_records f
       JOIN issue_details i ON f.issue_fk = i.id
       WHERE f.id = ?`, [id]);
        if (fuelDetails.length === 0) {
            throw new Error('Fuel issue record not found');
        }
        const fuel = fuelDetails[0];
        const oldQuantity = fuel.issue_quantity;
        const oldNacCode = fuel.nac_code;
        if (formData.issue_quantity !== undefined || formData.nac_code !== undefined ||
            formData.part_number !== undefined || formData.issued_for !== undefined || formData.issue_date !== undefined) {
            const updateFields = [];
            const updateValues = [];
            if (formData.issue_quantity !== undefined) {
                updateFields.push('issue_quantity = ?');
                updateValues.push(formData.issue_quantity);
            }
            if (formData.nac_code !== undefined) {
                updateFields.push('nac_code = ?');
                updateValues.push(formData.nac_code);
            }
            if (formData.part_number !== undefined) {
                updateFields.push('part_number = ?');
                updateValues.push(formData.part_number);
            }
            if (formData.issued_for !== undefined) {
                updateFields.push('issued_for = ?');
                updateValues.push(formData.issued_for);
            }
            if (formData.issue_date !== undefined) {
                updateFields.push('issue_date = ?');
                updateValues.push(formData.issue_date);
                const [dayNumberResult] = await connection.query<RowDataPacket[]>(`SELECT 
            CASE 
              WHEN MIN(issue_date) IS NULL THEN 1
              ELSE DATEDIFF(?, MIN(issue_date)) + 1
            END as day_number
          FROM issue_details 
          WHERE current_fy = ?`, [formData.issue_date, fuel.fy]);
                const dayNumber = dayNumberResult[0].day_number;
                const regeneratedSlip = `${dayNumber}Y${fuel.fy}`;
                updateFields.push('issue_slip_number = ?');
                updateValues.push(regeneratedSlip);
            }
            if (formData.fuel_price !== undefined || formData.issue_quantity !== undefined) {
                const fuelPrice = formData.fuel_price !== undefined ? formData.fuel_price : fuel.fuel_price;
                const quantity = formData.issue_quantity !== undefined ? formData.issue_quantity : fuel.issue_quantity;
                const issueCost = fuelPrice * quantity;
                updateFields.push('issue_cost = ?');
                updateValues.push(issueCost);
            }
            updateFields.push('updated_at = CURRENT_TIMESTAMP');
            updateValues.push(fuel.issue_fk);
            await connection.execute(`UPDATE issue_details SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);
        }
        if (formData.fuel_type !== undefined || formData.fuel_price !== undefined ||
            formData.kilometers !== undefined || formData.is_kilometer_reset !== undefined) {
            const fuelUpdateFields = [];
            const fuelUpdateValues = [];
            if (formData.fuel_type !== undefined) {
                fuelUpdateFields.push('fuel_type = ?');
                fuelUpdateValues.push(formData.fuel_type);
            }
            if (formData.fuel_price !== undefined) {
                fuelUpdateFields.push('fuel_price = ?');
                fuelUpdateValues.push(formData.fuel_price);
            }
            if (formData.kilometers !== undefined) {
                fuelUpdateFields.push('kilometers = ?');
                fuelUpdateValues.push(formData.kilometers);
            }
            if (formData.is_kilometer_reset !== undefined) {
                fuelUpdateFields.push('is_kilometer_reset = ?');
                fuelUpdateValues.push(formData.is_kilometer_reset ? 1 : 0);
            }
            fuelUpdateFields.push('updated_datetime = CURRENT_TIMESTAMP');
            fuelUpdateValues.push(id);
            await connection.execute(`UPDATE fuel_records SET ${fuelUpdateFields.join(', ')} WHERE id = ?`, fuelUpdateValues);
        }
        if (formData.issue_quantity !== undefined || formData.nac_code !== undefined) {
            const newQuantity = formData.issue_quantity !== undefined ? formData.issue_quantity : oldQuantity;
            const newNacCode = formData.nac_code !== undefined ? formData.nac_code : oldNacCode;
            if (formData.nac_code !== undefined && formData.nac_code !== oldNacCode) {
                await connection.execute('UPDATE stock_details SET current_balance = current_balance + ? WHERE nac_code = ?', [oldQuantity, oldNacCode]);
                const [newStockResults] = await connection.query<RowDataPacket[]>('SELECT current_balance FROM stock_details WHERE nac_code = ?', [newNacCode]);
                if (newStockResults.length === 0) {
                    throw new Error(`Stock not found for NAC code: ${newNacCode}`);
                }
                const newStockBalance = newStockResults[0].current_balance;
                if (newStockBalance < newQuantity) {
                    throw new Error(`Insufficient stock for new NAC code. Available: ${newStockBalance}, Requested: ${newQuantity}`);
                }
                await connection.execute('UPDATE stock_details SET current_balance = current_balance - ? WHERE nac_code = ?', [newQuantity, newNacCode]);
            }
            else if (formData.issue_quantity !== undefined) {
                const quantityDifference = newQuantity - oldQuantity;
                await connection.execute('UPDATE stock_details SET current_balance = current_balance - ? WHERE nac_code = ?', [quantityDifference, newNacCode]);
            }
            const [stockResult] = await connection.query<RowDataPacket[]>('SELECT current_balance FROM stock_details WHERE nac_code = ?', [newNacCode]);
            const remainingBalance = stockResult[0].current_balance;
            await connection.execute('UPDATE issue_details SET remaining_balance = ? WHERE id = ?', [remainingBalance, fuel.issue_fk]);
        }
        await connection.commit();
        logEvents(`Fuel issue record updated successfully - ID: ${id}`, "fuelIssueRecordsLog.log");
        res.status(200).json({
            message: 'Fuel issue record updated successfully'
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error updating fuel issue record: ${errorMessage} for ID: ${id}`, "fuelIssueRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while updating fuel issue record'
        });
    }
    finally {
        connection.release();
    }
};
export const deleteFuelIssueRecord = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [fuelDetails] = await connection.query<RowDataPacket[]>(`SELECT f.*, i.issue_quantity, i.nac_code
       FROM fuel_records f
       JOIN issue_details i ON f.issue_fk = i.id
       WHERE f.id = ?`, [id]);
        if (fuelDetails.length === 0) {
            throw new Error('Fuel issue record not found');
        }
        const fuel = fuelDetails[0];
        console.log(fuel.issue_fk, id);
        await connection.execute('DELETE FROM issue_details WHERE id = ?', [fuel.issue_fk]);
        await connection.execute('DELETE FROM fuel_records WHERE id = ?', [id]);
        await connection.execute('UPDATE stock_details SET current_balance = current_balance + ? WHERE nac_code = ?', [fuel.issue_quantity, fuel.nac_code]);
        await connection.commit();
        logEvents(`Fuel issue record deleted successfully - ID: ${id}`, "fuelIssueRecordsLog.log");
        res.status(200).json({
            message: 'Fuel issue record deleted successfully'
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error deleting fuel issue record: ${errorMessage} for ID: ${id}`, "fuelIssueRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while deleting fuel issue record'
        });
    }
    finally {
        connection.release();
    }
};
export const getFuelTypes = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.execute<RowDataPacket[]>('SELECT DISTINCT fuel_type FROM fuel_records ORDER BY fuel_type');
        const fuelTypes = rows.map(row => row.fuel_type);
        res.status(200).json({ fuelTypes });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error retrieving fuel types: ${errorMessage}`, "fuelIssueRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while retrieving fuel types'
        });
    }
    finally {
        connection.release();
    }
};
export const getNacCodes = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.execute<RowDataPacket[]>('SELECT DISTINCT nac_code FROM issue_details WHERE nac_code IN (?, ?) ORDER BY nac_code', ['GT 07986', 'GT 00000']);
        const nacCodes = rows.map(row => row.nac_code);
        res.status(200).json({ nacCodes });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error retrieving NAC codes: ${errorMessage}`, "fuelIssueRecordsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while retrieving NAC codes'
        });
    }
    finally {
        connection.release();
    }
};
