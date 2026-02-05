import { Request, Response } from 'express';
import pool from '../config/db';
import { RowDataPacket, PoolConnection } from 'mysql2/promise';
import { formatDate, formatDateForDB } from '../utils/dateUtils';
import { logEvents } from '../middlewares/logger';
import { rebuildNacInventoryState } from '../services/issueInventoryService';
interface IssueItem {
    nacCode: string;
    quantity: number;
    equipmentNumber: string;
    partNumber: string;
    originalIndex?: number;
}
interface IssueRequest {
    issueDate: string;
    items: IssueItem[];
    issuedBy: {
        name: string;
        staffId: string;
    };
}
export const createIssue = async (req: Request, res: Response): Promise<void> => {
    const { issueDate, items, issuedBy }: IssueRequest = req.body;
    if (!issueDate || !items || !items.length || !issuedBy) {
        logEvents(`Issue creation failed - Missing required fields by user: ${issuedBy?.name || 'Unknown'}`, "issueLog.log");
        res.status(400).json({
            error: 'Bad Request',
            message: 'Missing required fields'
        });
        return;
    }
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const formattedIssueDate = formatDateForDB(issueDate);
        const issuedByName = issuedBy.name;
        const [configRows] = await connection.query<RowDataPacket[]>('SELECT config_value FROM app_config WHERE config_type = ? AND config_name = ?', ['rrp', 'current_fy']);
        if (configRows.length === 0) {
            logEvents(`Failed to create issue - Current FY configuration not found`, "issueLog.log");
            res.status(500).json({
                error: 'Internal Server Error',
                message: 'Current FY configuration not found'
            });
            return;
        }
        const currentFY = configRows[0].config_value;
        const validationErrors: {
            nacCode: string;
            message: string;
            originalIndex: number;
        }[] = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const [stockResults] = await connection.query<RowDataPacket[]>('SELECT current_balance FROM stock_details WHERE nac_code = ?', [item.nacCode]);
            if (stockResults.length === 0) {
                validationErrors.push({
                    nacCode: item.nacCode,
                    message: `Item with NAC code ${item.nacCode} not found`,
                    originalIndex: i
                });
                continue;
            }
            const stockDetails = stockResults[0];
            if (item.quantity > stockDetails.current_balance) {
                validationErrors.push({
                    nacCode: item.nacCode,
                    message: `Insufficient stock. Requested: ${item.quantity}, Available: ${stockDetails.current_balance}`,
                    originalIndex: i
                });
            }
        }
        if (validationErrors.length > 0) {
            logEvents(`Issue creation failed - Validation errors: ${JSON.stringify(validationErrors)} by user: ${issuedByName}`, "issueLog.log");
            res.status(400).json({
                error: 'Validation Failed',
                message: 'Some items have insufficient stock or are not found',
                validationErrors
            });
            return;
        }
        const [dayNumberResult] = await connection.query<RowDataPacket[]>(`SELECT 
        CASE 
          WHEN MIN(issue_date) IS NULL THEN 1
          ELSE DATEDIFF(?, MIN(issue_date)) + 1
        END as day_number
      FROM issue_details 
      WHERE current_fy = ?`, [formattedIssueDate, currentFY]);
        const dayNumber = dayNumberResult[0].day_number;
        const issueSlipNumber = `${dayNumber}Y${currentFY}`;
        const issueIds: {
            id: number;
            originalIndex: number;
        }[] = [];
        const affectedNacCodes = new Set<string>();
        for (const item of items) {
            affectedNacCodes.add(item.nacCode);
            const [result] = await connection.execute(`INSERT INTO issue_details (
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
                formattedIssueDate,
                item.nacCode,
                item.partNumber,
                item.quantity,
                item.equipmentNumber,
                0,
                0,
                JSON.stringify(issuedBy),
                JSON.stringify(issuedBy),
                issueSlipNumber,
                currentFY
            ]);
            const issueId = (result as any).insertId;
            issueIds.push({
                id: issueId,
                originalIndex: item.originalIndex || 0
            });
            await connection.execute('UPDATE stock_details SET current_balance = current_balance - ? WHERE nac_code = ?', [item.quantity, item.nacCode]);
            logEvents(`Item issued successfully - NAC: ${item.nacCode}, Quantity: ${item.quantity} by user: ${issuedByName}`, "issueLog.log");
        }
        for (const nacCode of affectedNacCodes) {
            await rebuildNacInventoryState(connection, nacCode);
        }
        await connection.commit();
        logEvents(`Issue created successfully for date: ${formatDate(issueDate)} by user: ${issuedByName}`, "issueLog.log");
        const sortedIssueIds = issueIds.sort((a, b) => a.originalIndex - b.originalIndex).map(item => item.id);
        res.status(201).json({
            message: 'Issue created successfully',
            issueDate: formatDate(issueDate),
            issueSlipNumber,
            issueIds: sortedIssueIds
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in createIssue: ${errorMessage}`, "issueLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const approveIssue = async (req: Request, res: Response): Promise<void> => {
    const { itemIds, approvedBy } = req.body;
    const connection = await pool.getConnection();
    const issueIds = Array.isArray(itemIds) ? itemIds : [itemIds];
    try {
        await connection.beginTransaction();
        if (!issueIds.length) {
            throw new Error('No issue IDs provided');
        }
        const [issueCheck] = await connection.execute<RowDataPacket[]>(`SELECT id, approval_status 
       FROM issue_details 
       WHERE id IN (${issueIds.map(() => '?').join(',')})`, issueIds);
        if (issueCheck.length === 0) {
            logEvents(`Failed to approve issues - No issues found with IDs: ${issueIds.join(', ')}`, "issueLog.log");
            throw new Error('Issue records not found');
        }
        const alreadyApproved = issueCheck.filter(issue => issue.approval_status === 'APPROVED');
        if (alreadyApproved.length > 0) {
            logEvents(`Failed to approve issues - Some issues are already approved: ${alreadyApproved.map(i => i.id).join(', ')}`, "issueLog.log");
            throw new Error(`Issues ${alreadyApproved.map(i => i.id).join(', ')} are already approved`);
        }
        const [issueDetails] = await connection.execute<RowDataPacket[]>(`SELECT 
        i.id,
        i.nac_code,
        i.issue_quantity,
        i.issue_date,
        i.issue_slip_number
      FROM issue_details i
      WHERE i.id IN (${issueIds.map(() => '?').join(',')})`, issueIds);
        await connection.execute(`UPDATE issue_details 
      SET approval_status = 'APPROVED',
          approved_by = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id IN (${issueIds.map(() => '?').join(',')})`, [approvedBy, ...issueIds]);
        const uniqueNacCodes = [...new Set(issueDetails.map(issue => issue.nac_code))];
        for (const nacCode of uniqueNacCodes) {
            await rebuildNacInventoryState(connection, nacCode);
            logEvents(`Rebuilt inventory state for NAC code: ${nacCode} after approving issues`, "issueLog.log");
        }
        await connection.commit();
        logEvents(`Successfully approved issues with IDs: ${issueIds.join(', ')} by user: ${approvedBy}`, "issueLog.log");
        res.status(200).json({
            message: 'Issues approved and stock updated successfully',
            approvedCount: issueDetails.length
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error approving issues: ${errorMessage} for IDs: ${issueIds.join(', ')}`, "issueLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while approving issues'
        });
    }
    finally {
        connection.release();
    }
};
export const rejectIssue = async (req: Request, res: Response): Promise<void> => {
    const { itemIds, rejectedBy } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [issueDetails] = await connection.execute<RowDataPacket[]>(`SELECT 
        i.id, 
        i.issue_slip_number, 
        i.issued_by, 
        i.issue_date,
        i.nac_code,
        i.issue_quantity
      FROM issue_details i
      WHERE i.id IN (${Array.isArray(itemIds) ? itemIds.map(() => '?').join(',') : '?'})`, Array.isArray(itemIds) ? itemIds : [itemIds]);
        if (issueDetails.length === 0) {
            logEvents(`Failed to reject issues - No issues found with IDs: ${Array.isArray(itemIds) ? itemIds.join(', ') : itemIds}`, "issueLog.log");
            throw new Error('Issue records not found');
        }
        const issuedBy = JSON.parse(issueDetails[0].issued_by);
        const [users] = await connection.query<RowDataPacket[]>('SELECT id FROM users WHERE username = ?', [issuedBy.staffId]);
        if (users.length > 0) {
            const userId = users[0].id;
            const issueDetailsText = issueDetails.map(issue => `Issue Slip: ${issue.issue_slip_number} (${formatDate(issue.issue_date)})`).join(', ');
            await connection.query(`INSERT INTO notifications 
         (user_id, reference_type, message, reference_id)
         VALUES (?, ?, ?, ?)`, [
                userId,
                'issue',
                `Your issues have been rejected: ${issueDetailsText}`,
                issueDetails[0].id
            ]);
        }
        const affectedNacCodes = new Set<string>();
        for (const issue of issueDetails) {
            affectedNacCodes.add(issue.nac_code);
            await connection.execute('UPDATE stock_details SET current_balance = current_balance + ? WHERE nac_code = ?', [issue.issue_quantity, issue.nac_code]);
        }
        await connection.execute(`DELETE FROM issue_details WHERE id IN (${Array.isArray(itemIds) ? itemIds.map(() => '?').join(',') : '?'})`, Array.isArray(itemIds) ? itemIds : [itemIds]);
        for (const nacCode of affectedNacCodes) {
            await rebuildNacInventoryState(connection, nacCode);
        }
        await connection.commit();
        logEvents(`Successfully rejected issues with IDs: ${Array.isArray(itemIds) ? itemIds.join(', ') : itemIds} by user: ${rejectedBy}`, "issueLog.log");
        res.status(200).json({
            message: 'Issues rejected successfully',
            rejectedCount: issueDetails.length
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error rejecting issues: ${errorMessage} for IDs: ${Array.isArray(itemIds) ? itemIds.join(', ') : itemIds}`, "issueLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while rejecting issues'
        });
    }
    finally {
        connection.release();
    }
};
export const getPendingIssues = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const [issues] = await connection.execute<RowDataPacket[]>(`SELECT 
        i.id,
        i.nac_code,
        i.issue_date,
        i.part_number,
        i.issue_quantity,
        i.issue_cost,
        i.remaining_balance,
        i.issue_slip_number,
        i.issued_by,
        i.issued_for,
        SUBSTRING_INDEX(s.item_name, ',', 1) as item_name
      FROM issue_details i
      LEFT JOIN stock_details s ON i.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
      WHERE i.approval_status = 'PENDING'
      ORDER BY i.issue_date DESC`);
        const formattedIssues = issues.map((issue) => ({
            ...issue,
            issued_by: JSON.parse(issue.issued_by),
        }));
        logEvents(`Successfully retrieved ${formattedIssues.length} pending issues`, "issueLog.log");
        res.status(200).json({
            message: 'Pending issues retrieved successfully',
            issues: formattedIssues
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error retrieving pending issues: ${errorMessage}`, "issueLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while retrieving pending issues'
        });
    }
    finally {
        connection.release();
    }
};
export const getPendingFuelIssues = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const [issues] = await connection.execute<RowDataPacket[]>(`SELECT 
        i.id,
        i.nac_code,
        i.issue_date,
        i.issue_quantity,
        i.issue_cost,
        i.remaining_balance,
        i.issue_slip_number,
        i.issued_by,
        i.issued_for,
        f.fuel_type,
        f.fuel_price as fuel_rate,
        f.kilometers,
        (
          SELECT f2.kilometers
          FROM issue_details i2
          JOIN fuel_records f2 ON i2.id = f2.issue_fk
          WHERE i2.issued_for = i.issued_for
          AND i2.nac_code = i.nac_code
          AND i2.issue_date < i.issue_date
          AND i2.approval_status = 'APPROVED'
          ORDER BY i2.issue_date DESC
          LIMIT 1
        ) as previous_kilometers,
        (
          SELECT MAX(i2.issue_date)
          FROM issue_details i2
          JOIN fuel_records f2 ON i2.id = f2.issue_fk
          WHERE i2.issued_for = i.issued_for
          AND i2.nac_code = i.nac_code
          AND i2.issue_date < i.issue_date
          AND i2.approval_status = 'APPROVED'
        ) as previous_issue_date
      FROM issue_details i
      LEFT JOIN fuel_records f ON i.id = f.issue_fk
      WHERE i.approval_status = 'PENDING'
      AND (i.nac_code = 'GT 07986' OR i.nac_code = 'GT 00000')
      ORDER BY i.issue_date ASC`);
        const formattedIssues = issues.map((issue: any) => ({
            ...issue,
            issued_by: JSON.parse(issue.issued_by),
            fuel_type: issue.fuel_type || (issue.nac_code === 'GT 07986' ? 'Diesel' : 'Petrol'),
            fuel_rate: issue.fuel_rate ? Number(issue.fuel_rate) : 0,
            kilometers: issue.kilometers ? Number(issue.kilometers) : 0,
            previous_kilometers: issue.previous_kilometers ? Number(issue.previous_kilometers) : 0,
            previous_issue_date: issue.previous_issue_date || null
        }));
        logEvents(`Successfully retrieved ${formattedIssues.length} pending fuel issues`, "issueLog.log");
        res.status(200).json({
            message: 'Pending fuel issues retrieved successfully',
            issues: formattedIssues
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error retrieving pending fuel issues: ${errorMessage}`, "issueLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while retrieving pending fuel issues'
        });
    }
    finally {
        connection.release();
    }
};
export const updateIssueItem = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { quantity, fuel_rate, kilometers } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [issueDetails] = await connection.query<RowDataPacket[]>(`SELECT 
        i.nac_code,
        i.issue_quantity,
        i.issue_slip_number,
        s.current_balance
      FROM issue_details i
      LEFT JOIN stock_details s ON i.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
      WHERE i.id = ?`, [id]);
        if (issueDetails.length === 0) {
            throw new Error('Issue item not found');
        }
        const issue = issueDetails[0];
        const quantityDifference = quantity !== undefined ? quantity - issue.issue_quantity : 0;
        const updateFields = [];
        const updateValues = [];
        if (quantity !== undefined) {
            updateFields.push('issue_quantity = ?');
            updateValues.push(quantity);
        }
        if (fuel_rate !== undefined) {
            updateFields.push('issue_cost = ?');
            const quantityForCost = quantity !== undefined ? quantity : issue.issue_quantity;
            updateValues.push(fuel_rate * quantityForCost);
        }
        updateFields.push('updated_at = CURRENT_TIMESTAMP');
        updateValues.push(id);
        if (updateFields.length > 1) {
            await connection.execute(`UPDATE issue_details 
        SET ${updateFields.join(', ')}
        WHERE id = ?`, updateValues);
        }
        if (fuel_rate !== undefined || kilometers !== undefined) {
            const fuelUpdateFields = [];
            const fuelUpdateValues = [];
            if (fuel_rate !== undefined) {
                fuelUpdateFields.push('fuel_price = ?');
                fuelUpdateValues.push(fuel_rate);
            }
            if (kilometers !== undefined) {
                fuelUpdateFields.push('kilometers = ?');
                fuelUpdateValues.push(kilometers);
            }
            if (fuelUpdateFields.length > 0) {
                fuelUpdateValues.push(id);
                await connection.execute(`UPDATE fuel_records 
           SET ${fuelUpdateFields.join(', ')}
           WHERE issue_fk = ?`, fuelUpdateValues);
            }
        }
        if (quantity !== undefined && quantityDifference !== 0) {
            await connection.execute('UPDATE stock_details SET current_balance = current_balance - ? WHERE nac_code = ?', [quantityDifference, issue.nac_code]);
        }
        await rebuildNacInventoryState(connection, issue.nac_code);
        await connection.commit();
        logEvents(`Successfully updated issue item ID: ${id} with new quantity: ${quantity}, fuel_rate: ${fuel_rate}, kilometers: ${kilometers}`, "issueLog.log");
        res.status(200).json({
            message: 'Issue item updated successfully',
            issueSlipNumber: issue.issue_slip_number
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error updating issue item: ${errorMessage} for ID: ${id}`, "issueLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while updating issue item'
        });
    }
    finally {
        connection.release();
    }
};
export const deleteIssueItem = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [issueDetails] = await connection.execute<RowDataPacket[]>(`SELECT 
        i.nac_code,
        i.issue_quantity,
        i.issue_slip_number,
        s.current_balance
      FROM issue_details i
      LEFT JOIN stock_details s ON i.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
      WHERE i.id = ?`, [id]);
        if (issueDetails.length === 0) {
            throw new Error('Issue item not found');
        }
        const issue = issueDetails[0];
        await connection.execute('DELETE FROM fuel_records WHERE issue_fk = ?', [id]);
        await connection.execute('DELETE FROM issue_details WHERE id = ?', [id]);
        await connection.execute('UPDATE stock_details SET current_balance = current_balance + ? WHERE nac_code = ?', [issue.issue_quantity, issue.nac_code]);
        await rebuildNacInventoryState(connection, issue.nac_code);
        await connection.commit();
        logEvents(`Successfully deleted issue item ID: ${id}`, "issueLog.log");
        res.status(200).json({
            message: 'Issue item deleted successfully',
            issueSlipNumber: issue.issue_slip_number
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error deleting issue item: ${errorMessage} for ID: ${id}`, "issueLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while deleting issue item'
        });
    }
    finally {
        connection.release();
    }
};
export const getDailyIssueReport = async (req: Request, res: Response): Promise<void> => {
    const { fromDate, toDate, equipmentNumber } = req.query;
    const connection = await pool.getConnection();
    try {
        let query = `
      SELECT 
        i.issue_slip_number,
        i.issue_date,
        i.part_number,
        i.issued_for,
        i.issued_by,
        i.issue_quantity,
        i.issue_cost,
        i.remaining_balance,
        SUBSTRING_INDEX(s.item_name, ',', 1) as item_name
      FROM issue_details i
      LEFT JOIN stock_details s ON i.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
      WHERE i.issue_date BETWEEN ? AND ?
    `;
        const queryParams: any[] = [fromDate, toDate];
        if (equipmentNumber) {
            query += ` AND i.issued_for = ?`;
            queryParams.push(equipmentNumber);
        }
        query += ` ORDER BY i.issue_date DESC, i.id ASC`;
        const [issues] = await connection.execute<RowDataPacket[]>(query, queryParams);
        const formattedIssues = issues.map(issue => ({
            ...issue,
            issued_by: JSON.parse(issue.issued_by)
        }));
        logEvents(`Successfully generated daily issue report from ${fromDate} to ${toDate}${equipmentNumber ? ` for equipment ${equipmentNumber}` : ''}`, "issueLog.log");
        res.status(200).json({
            message: 'Daily issue report generated successfully',
            issues: formattedIssues
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error generating daily issue report: ${errorMessage}`, "issueLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while generating the report'
        });
    }
    finally {
        connection.release();
    }
};
