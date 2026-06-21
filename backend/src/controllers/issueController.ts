import { Request, Response } from 'express';
import pool from '../config/db';
import { RowDataPacket, PoolConnection } from 'mysql2/promise';
import { formatDate, formatDateForDB } from '../utils/dateUtils';
import { logEvents } from '../middlewares/logger';
import { rebuildNacInventoryState } from '../services/issueInventoryService';
import {
    getVariantBalances,
    resolveAndPersistTransactionVariant,
    resolveTransactionVariantTarget,
} from '../services/inventoryVariantService';
import { ensureAssetSpareSchema } from '../services/assetSpareSchema';
import { enrichIssuedByPerson } from '../services/personDetailsService';
import { resolveCurrentFiscalYear } from '../services/fiscalYearService';
import { validateIssuedFor, assessIssuedForApplicableExtension, type IssueValidationCaches } from '../services/issueValidationService';
import {
    mergeFamilyEquipments,
    syncFamilySpareCompatibilityFromEquipment,
} from '../services/inventoryVariantService';
import { expandEquipmentTokensToSet } from '../services/spareEquipmentDisplay';
import { stripSuffixFromNac } from '../utils/nacCodeUtils';
import { setNoCacheHeaders, sendAlreadyProcessed } from '../utils/approvalResponse';
import { searchIssueEquipmentAssets } from '../services/requestEquipmentService';
import {
    buildConsumptionAnalysis,
    computeConsumptionStats,
    consumptionStatsKey,
    fuelTypeToNacCode,
    loadConsumptionStatsMap,
} from '../services/fuelConsumptionService';
import { ResultSetHeader } from 'mysql2';
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
        await ensureAssetSpareSchema();
        const formattedIssueDate = formatDateForDB(issueDate);
        const issuedByName = issuedBy.name;
        const currentFY = await resolveCurrentFiscalYear(connection);
        const validationErrors: {
            nacCode: string;
            message: string;
            originalIndex: number;
        }[] = [];

        const validationCaches: IssueValidationCaches = {};
        const resolvedItems: Array<
            IssueItem & { resolvedNac: string; resolvedPart: string; extendsApplicableEquipment: boolean }
        > = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const resolved = await resolveTransactionVariantTarget(connection, {
                nacCode: item.nacCode,
                partNumber: item.partNumber,
                preferLatestReceived: true,
            });
            const nacCode = resolved.nacCode;

            const issuedForCheck = await validateIssuedFor(
                connection,
                nacCode,
                item.equipmentNumber,
                validationCaches
            );
            if (!issuedForCheck.valid) {
                validationErrors.push({
                    nacCode: item.nacCode,
                    message: issuedForCheck.message || `Invalid equipment ${item.equipmentNumber}`,
                    originalIndex: i
                });
                continue;
            }

            const extendsApplicableEquipment = await assessIssuedForApplicableExtension(
                connection,
                nacCode,
                item.equipmentNumber,
                validationCaches
            );

            const balances = await getVariantBalances(connection, nacCode);
            if (!balances) {
                validationErrors.push({
                    nacCode: item.nacCode,
                    message: `Item with NAC code ${item.nacCode} not found`,
                    originalIndex: i
                });
                continue;
            }
            if (item.quantity > balances.trueBalance) {
                validationErrors.push({
                    nacCode: item.nacCode,
                    message: `Insufficient stock. Requested: ${item.quantity}, Available: ${balances.trueBalance}`,
                    originalIndex: i
                });
                continue;
            }
            resolvedItems.push({
                ...item,
                resolvedNac: nacCode,
                resolvedPart: resolved.partNumber || item.partNumber,
                extendsApplicableEquipment,
            });
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
        for (const item of resolvedItems) {
            affectedNacCodes.add(item.resolvedNac);
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
          approval_status,
          extends_applicable_equipment
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`, [
                formattedIssueDate,
                item.resolvedNac,
                item.resolvedPart,
                item.quantity,
                item.equipmentNumber,
                0,
                0,
                JSON.stringify(issuedBy),
                JSON.stringify(issuedBy),
                issueSlipNumber,
                currentFY,
                item.extendsApplicableEquipment ? 1 : 0,
            ]);
            const issueId = (result as any).insertId;
            issueIds.push({
                id: issueId,
                originalIndex: item.originalIndex || 0
            });
            await connection.execute('UPDATE stock_details SET current_balance = current_balance - ? WHERE nac_code = ?', [item.quantity, item.resolvedNac]);
            logEvents(`Item issued successfully - NAC: ${item.resolvedNac}, Quantity: ${item.quantity} by user: ${issuedByName}`, "issueLog.log");
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
        await ensureAssetSpareSchema();
        if (!issueIds.length) {
            throw new Error('No issue IDs provided');
        }
        const [issueCheck] = await connection.execute<RowDataPacket[]>(`SELECT id, approval_status 
       FROM issue_details 
       WHERE id IN (${issueIds.map(() => '?').join(',')})
       FOR UPDATE`, issueIds);
        if (issueCheck.length === 0) {
            logEvents(`Failed to approve issues - No issues found with IDs: ${issueIds.join(', ')}`, "issueLog.log");
            throw new Error('Issue records not found');
        }
        const alreadyProcessed = issueCheck.filter(issue => issue.approval_status !== 'PENDING');
        if (alreadyProcessed.length > 0) {
            await connection.rollback();
            logEvents(`Failed to approve issues - Already processed: ${alreadyProcessed.map(i => i.id).join(', ')}`, "issueLog.log");
            sendAlreadyProcessed(res, 'One or more issues');
            return;
        }
        const [issueDetails] = await connection.execute<RowDataPacket[]>(`SELECT 
        i.id,
        i.nac_code,
        i.part_number,
        i.issue_quantity,
        i.issue_date,
        i.issue_slip_number,
        i.issued_for,
        i.extends_applicable_equipment
      FROM issue_details i
      WHERE id IN (${issueIds.map(() => '?').join(',')}) AND approval_status = 'PENDING'`, issueIds);
        if (issueDetails.length !== issueIds.length) {
            await connection.rollback();
            sendAlreadyProcessed(res, 'One or more issues');
            return;
        }
        const [updateResult] = await connection.execute<ResultSetHeader>(`UPDATE issue_details 
      SET approval_status = 'APPROVED',
          approved_by = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id IN (${issueIds.map(() => '?').join(',')}) AND approval_status = 'PENDING'`, [approvedBy, ...issueIds]);
        if (updateResult.affectedRows === 0) {
            await connection.rollback();
            sendAlreadyProcessed(res, 'One or more issues');
            return;
        }
        const validationCaches: IssueValidationCaches = {};
        const uniqueNacCodes = new Set<string>();
        const extendedEquipmentKeys = new Set<string>();
        const needsEquipmentExtension = issueDetails.some(
            (issue) => Number(issue.extends_applicable_equipment) === 1 && issue.issued_for
        );
        if (needsEquipmentExtension) {
            const [sectionRows] = await connection.query<RowDataPacket[]>(
                `SELECT code FROM issue_sections WHERE is_active = 1`
            );
            validationCaches.sectionCodes = new Set(
                sectionRows.map((row) => String(row.code).toUpperCase())
            );
        }
        for (const issue of issueDetails) {
            if (Number(issue.extends_applicable_equipment) === 1 && issue.issued_for) {
                const baseNac = stripSuffixFromNac(String(issue.nac_code));
                const extensionKey = `${baseNac}|${String(issue.issued_for).trim().toLowerCase()}`;
                if (!extendedEquipmentKeys.has(extensionKey)) {
                    await mergeFamilyEquipments(
                        connection,
                        baseNac,
                        String(issue.issued_for),
                        expandEquipmentTokensToSet
                    );
                    await syncFamilySpareCompatibilityFromEquipment(
                        connection,
                        baseNac,
                        String(issue.issued_for),
                        validationCaches.sectionCodes!
                    );
                    extendedEquipmentKeys.add(extensionKey);
                    logEvents(
                        `Extended applicable equipment for ${baseNac} with ${issue.issued_for} on issue approval`,
                        'issueLog.log'
                    );
                }
            }
            const resolved = await resolveAndPersistTransactionVariant(
                connection,
                'issue_details',
                issue.id,
                issue.nac_code,
                issue.part_number,
                { preferLatestReceived: true }
            );
            uniqueNacCodes.add(resolved.nacCode);
        }
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
        i.part_number,
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
        const stockAdjustments = new Map<string, number>();
        for (const issue of issueDetails) {
            const resolved = await resolveTransactionVariantTarget(connection, {
                nacCode: issue.nac_code,
                partNumber: issue.part_number,
                preferLatestReceived: true,
            });
            affectedNacCodes.add(resolved.nacCode);
            stockAdjustments.set(
                resolved.nacCode,
                (stockAdjustments.get(resolved.nacCode) || 0) + Number(issue.issue_quantity)
            );
        }
        for (const [nacCode, quantity] of stockAdjustments) {
            await connection.execute(
                'UPDATE stock_details SET current_balance = current_balance + ? WHERE nac_code = ?',
                [quantity, nacCode]
            );
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
        await ensureAssetSpareSchema();
        setNoCacheHeaders(res);
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
        i.extends_applicable_equipment,
        SUBSTRING_INDEX(s.item_name, ',', 1) as item_name
      FROM issue_details i
      LEFT JOIN stock_details s ON i.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
      WHERE i.approval_status = 'PENDING'
      ORDER BY i.issue_date DESC`);
        const formattedIssues = await Promise.all(
            issues.map(async (issue) => ({
                ...issue,
                issued_by: await enrichIssuedByPerson(connection, issue.issued_by),
                extends_applicable_equipment: Number(issue.extends_applicable_equipment) === 1,
            }))
        );
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
        setNoCacheHeaders(res);
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
        const consumptionStatsMap = await loadConsumptionStatsMap(
            connection,
            issues.map((issue) => ({
                nacCode: String(issue.nac_code),
                equipment: String(issue.issued_for || ''),
            }))
        );
        const formattedIssues = await Promise.all(
            issues.map(async (issue: RowDataPacket) => {
                const fuelType =
                    issue.fuel_type || (issue.nac_code === 'GT 07986' ? 'diesel' : 'petrol');
                const kilometers = issue.kilometers ? Number(issue.kilometers) : 0;
                const previousKilometers = issue.previous_kilometers
                    ? Number(issue.previous_kilometers)
                    : 0;
                const issueQuantity = Number(issue.issue_quantity);
                const equipment = String(issue.issued_for || '').trim();
                const nacCode = fuelTypeToNacCode(fuelType);

                let consumption = null;
                if (equipment && kilometers > 0 && issueQuantity > 0) {
                    try {
                        const stats =
                            consumptionStatsMap.get(consumptionStatsKey(nacCode, equipment)) ||
                            consumptionStatsMap.get(consumptionStatsKey(String(issue.nac_code), equipment)) ||
                            computeConsumptionStats([]);
                        consumption = buildConsumptionAnalysis(stats, {
                                equipment,
                                nacCode,
                                previousKilometers,
                                currentKilometers: kilometers,
                                quantityLiters: issueQuantity,
                            });
                    } catch {
                        consumption = null;
                    }
                }

                return {
                    ...issue,
                    issued_by: await enrichIssuedByPerson(connection, issue.issued_by),
                    fuel_type: fuelType,
                    fuel_rate: issue.fuel_rate ? Number(issue.fuel_rate) : 0,
                    kilometers,
                    previous_kilometers: previousKilometers,
                    previous_issue_date: issue.previous_issue_date || null,
                    consumption,
                };
            })
        );
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
        i.id,
        i.nac_code,
        i.part_number,
        i.issue_quantity,
        i.issue_slip_number,
        s.current_balance
      FROM issue_details i
      LEFT JOIN stock_details s ON i.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
      WHERE i.id = ?`, [id]);
        if (issueDetails.length === 0) {
            throw new Error('Issue item not found');
        }
        let issue = issueDetails[0];
        if (issue.current_balance == null) {
            const resolved = await resolveAndPersistTransactionVariant(
                connection,
                'issue_details',
                Number(id),
                issue.nac_code,
                issue.part_number,
                { preferLatestReceived: true }
            );
            issue = { ...issue, nac_code: resolved.nacCode };
        }
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
        i.part_number,
        i.issue_quantity,
        i.issue_slip_number,
        s.current_balance
      FROM issue_details i
      LEFT JOIN stock_details s ON i.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
      WHERE i.id = ?`, [id]);
        if (issueDetails.length === 0) {
            throw new Error('Issue item not found');
        }
        let issue = issueDetails[0];
        if (issue.current_balance == null) {
            const resolved = await resolveTransactionVariantTarget(connection, {
                nacCode: issue.nac_code,
                partNumber: issue.part_number,
                preferLatestReceived: true,
            });
            issue = { ...issue, nac_code: resolved.nacCode };
        }
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

export const getIssueEquipmentOptions = async (req: Request, res: Response): Promise<void> => {
    const search = String(req.query.search || '').trim();
    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 100);
    const connection = await pool.getConnection();
    try {
        await ensureAssetSpareSchema();
        if (!search) {
            res.status(200).json({ options: [] });
            return;
        }
        const entries = await searchIssueEquipmentAssets(connection, search, limit);
        res.status(200).json({
            options: entries.map((entry) => ({
                equipmentCode: entry.code,
                name: entry.name || '',
                label: entry.name ? `${entry.code} — ${entry.name}` : entry.code,
            })),
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching issue equipment options: ${errorMessage}`, 'issueLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage,
        });
    }
    finally {
        connection.release();
    }
};
