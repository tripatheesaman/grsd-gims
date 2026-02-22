import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { formatDate, formatDateForDB } from '../utils/dateUtils';
import { logEvents } from '../middlewares/logger';
import { refreshPredictionMetrics } from '../services/predictionService';
import { sendMail, renderEmailTemplate } from '../services/mailer';
export interface SearchRequestResult extends RowDataPacket {
    id: number;
    request_number: string;
    request_date: Date;
    requested_by: string;
    part_number: string;
    item_name: string;
    equipment_number: string;
    requested_quantity: number;
    approval_status: string;
    nac_code: string;
    unit: string;
    current_balance: number | string;
    previous_rate: number | string;
    image_path: string;
    specifications: string;
    remarks: string;
}
export interface ReceiveItem {
    nacCode: string;
    partNumber: string;
    itemName: string;
    receiveQuantity: number;
    equipmentNumber: string;
    imagePath: string;
    unit: string;
    requestId: number;
    location?: string;
    cardNumber?: string;
}
export interface ReceiveRequest {
    receiveDate: string;
    remarks: string;
    receivedBy: string;
    items: ReceiveItem[];
}
interface PendingReceiveItem extends RowDataPacket {
    id: number;
    nac_code: string;
    item_name: string;
    part_number: string;
    received_quantity: number;
    equipment_number: string;
    receive_date: Date;
}
interface ReceiveDetailResult extends RowDataPacket {
    request_number: string;
    request_date: Date;
    receive_date: Date;
    item_name: string;
    requested_part_number: string;
    received_part_number: string;
    requested_quantity: number;
    received_quantity: number;
    equipment_number: string;
    unit: string;
    requested_unit?: string;
    nac_code?: string;
    requested_image: string;
    received_image: string;
    location?: string;
    card_number?: string;
}
interface StockDetailResult extends RowDataPacket {
    id: number;
    nac_code: string;
    item_name: string;
    part_numbers: string;
    applicable_equipments: string;
    current_balance: number;
    location: string;
    card_number: string;
    image_url: string;
    unit: string;
}
export const getPendingReceives = async (req: Request, res: Response): Promise<void> => {
    try {
        const [results] = await pool.execute<PendingReceiveItem[]>(`SELECT 
                rd.id,
                COALESCE(NULLIF(rd.nac_code, ''), COALESCE(req.nac_code, '')) as nac_code,
                rd.item_name,
                rd.part_number,
                rd.received_quantity,
                rd.receive_date,
                COALESCE(NULLIF(rd.equipment_number, ''), COALESCE(req.equipment_number, '')) as equipment_number,
                rd.receive_source,
                rd.tender_reference_number,
                rd.request_fk
            FROM receive_details rd
            LEFT JOIN request_details req ON rd.request_fk = req.id
            WHERE rd.approval_status = 'PENDING'
            ORDER BY rd.created_at DESC`);
        const pendingReceives = results.map(item => ({
            id: item.id,
            nacCode: item.nac_code,
            itemName: item.item_name,
            partNumber: item.part_number,
            receivedQuantity: item.received_quantity,
            receiveDate: formatDate(item.receive_date),
            equipmentNumber: item.equipment_number,
            receiveSource: item.receive_source,
            tenderReferenceNumber: item.tender_reference_number,
            requestFk: item.request_fk
        }));
        logEvents(`Successfully fetched ${pendingReceives.length} pending receives`, "receiveLog.log");
        res.status(200).json(pendingReceives);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching pending receives: ${errorMessage}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching pending receives'
        });
    }
};
export const searchReceivables = async (req: Request, res: Response): Promise<void> => {
    const { universal, equipmentNumber, partNumber, page = 1, pageSize = 20 } = req.query;
    try {
        let query = `
            SELECT DISTINCT
                rd.id,
                rd.request_number,
                rd.request_date,
                rd.requested_by,
                rd.part_number,
                rd.item_name,
                rd.equipment_number,
                rd.requested_quantity,
                rd.approval_status,
                rd.nac_code,
                rd.unit,
                rd.current_balance,
                rd.previous_rate,
                rd.image_path,
                rd.specifications,
                rd.remarks,
                COALESCE(sd.location, '') as location,
                COALESCE(sd.card_number, '') as card_number
            FROM request_details rd
            LEFT JOIN stock_details sd ON rd.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
            WHERE rd.approval_status = 'APPROVED'
            AND rd.is_received = 0
            AND rd.requested_quantity > (
                SELECT COALESCE(SUM(ri.received_quantity), 0)
                FROM receive_details ri
                WHERE ri.request_fk = rd.id
                AND ri.approval_status IN ('PENDING','APPROVED')
            )
        `;
        const params: (string | number)[] = [];
        if (universal && universal.toString().trim() !== '') {
            query += ` AND (
                rd.request_number LIKE ? OR
                rd.item_name LIKE ? OR
                rd.part_number LIKE ? OR
                rd.equipment_number LIKE ? OR
                rd.nac_code LIKE ?
            )`;
            params.push(`%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`);
        }
        if (equipmentNumber && equipmentNumber.toString().trim() !== '') {
            query += ` AND rd.equipment_number LIKE ?`;
            params.push(`%${equipmentNumber}%`);
        }
        if (partNumber && partNumber.toString().trim() !== '') {
            query += ` AND rd.part_number LIKE ?`;
            params.push(`%${partNumber}%`);
        }
        const currentPage = parseInt(page.toString()) || 1;
        const limit = parseInt(pageSize.toString()) || 20;
        const offset = (currentPage - 1) * limit;
        query += ` ORDER BY rd.request_date DESC LIMIT ${limit} OFFSET ${offset}`;
        const [results] = await pool.execute<SearchRequestResult[]>(query, params);
        let totalCount = 0;
        try {
            let countQuery = 'SELECT COUNT(DISTINCT rd.id) as total FROM request_details rd LEFT JOIN stock_details sd ON rd.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci WHERE rd.approval_status = "APPROVED" AND rd.is_received = 0 AND rd.requested_quantity > (SELECT COALESCE(SUM(ri.received_quantity), 0) FROM receive_details ri WHERE ri.request_fk = rd.id AND ri.approval_status IN (\'PENDING\',\'APPROVED\'))';
            const countParams: (string | number)[] = [];
            if (universal && universal.toString().trim() !== '') {
                countQuery += ` AND (
                    rd.request_number LIKE ? OR
                    rd.item_name LIKE ? OR
                    rd.part_number LIKE ? OR
                    rd.equipment_number LIKE ? OR
                    rd.nac_code LIKE ?
                )`;
                countParams.push(`%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`);
            }
            if (equipmentNumber && equipmentNumber.toString().trim() !== '') {
                countQuery += ` AND rd.equipment_number LIKE ?`;
                countParams.push(`%${equipmentNumber}%`);
            }
            if (partNumber && partNumber.toString().trim() !== '') {
                countQuery += ` AND rd.part_number LIKE ?`;
                countParams.push(`%${partNumber}%`);
            }
            const [countResult] = await pool.execute<RowDataPacket[]>(countQuery, countParams);
            totalCount = (countResult as any)[0]?.total || 0;
        }
        catch (countError) {
            logEvents(`Count query failed: ${JSON.stringify(countError)}`, "receiveLog.log");
        }
        const groupedResults = results.reduce((acc, result) => {
            if (!acc[result.request_number]) {
                acc[result.request_number] = {
                    requestNumber: result.request_number,
                    requestDate: result.request_date,
                    requestedBy: result.requested_by,
                    approvalStatus: result.approval_status,
                    items: []
                };
            }
            acc[result.request_number].items.push({
                id: result.id,
                partNumber: result.part_number,
                itemName: result.item_name,
                equipmentNumber: result.equipment_number,
                requestedQuantity: result.requested_quantity,
                nacCode: result.nac_code,
                unit: result.unit,
                currentBalance: result.current_balance,
                previousRate: result.previous_rate,
                imageUrl: result.image_path,
                specifications: result.specifications,
                remarks: result.remarks,
                location: result.location,
                cardNumber: result.card_number
            });
            return acc;
        }, {} as Record<string, any>);
        const response = Object.values(groupedResults);
        logEvents(`Successfully searched receivables with ${response.length} results`, "receiveLog.log");
        res.json({
            data: response,
            pagination: {
                currentPage,
                pageSize: limit,
                totalCount,
                totalPages: Math.ceil(totalCount / limit)
            }
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error searching receivables: ${errorMessage}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while searching receivables'
        });
    }
};
export const createReceive = async (req: Request, res: Response): Promise<void> => {
    const receiveData: ReceiveRequest = req.body;
    if (!receiveData.receiveDate || !receiveData.receivedBy || !receiveData.items || receiveData.items.length === 0) {
        logEvents(`Failed to create receive - Missing required fields by user: ${receiveData.receivedBy || 'Unknown'}`, "receiveLog.log");
        res.status(400).json({
            error: 'Bad Request',
            message: 'Missing required fields'
        });
        return;
    }
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const formattedDate = formatDateForDB(receiveData.receiveDate);
        const receiveIds: number[] = [];
        for (const item of receiveData.items) {
            const [requestCheck] = await connection.execute(`SELECT id, request_number FROM request_details 
                WHERE id = ?`, [item.requestId]);
            if (!(requestCheck as any[]).length) {
                logEvents(`Failed to create receive - Request not found: ${item.requestId} by user: ${receiveData.receivedBy}`, "receiveLog.log");
                throw new Error(`Request ID ${item.requestId} not found`);
            }
            const requestNumber = (requestCheck as any[])[0].request_number;
            let finalNacCode = item.nacCode;
            if (!finalNacCode || finalNacCode.trim() === '' || finalNacCode === 'N/A') {
                logEvents(`Warning: Empty/null nacCode received for request ${item.requestId}. Fetching from request_details...`, "receiveLog.log");
                const [requestNacCheck] = await connection.execute(`SELECT nac_code FROM request_details WHERE id = ?`, [item.requestId]);
                if ((requestNacCheck as any[]).length > 0) {
                    finalNacCode = (requestNacCheck as any[])[0].nac_code;
                    logEvents(`Retrieved nacCode from request_details: "${finalNacCode}" for request ${item.requestId}`, "receiveLog.log");
                }
                else {
                    logEvents(`Failed to create receive - Could not fetch nacCode for request ${item.requestId}`, "receiveLog.log");
                    throw new Error(`NAC Code is required for item: ${item.itemName}. Please ensure the request has a valid NAC Code.`);
                }
            }
            if (!finalNacCode || finalNacCode.trim() === '') {
                logEvents(`Failed to create receive - Final nacCode is empty for request ${item.requestId} by user: ${receiveData.receivedBy}`, "receiveLog.log");
                throw new Error(`NAC Code is required for item: ${item.itemName}. Please ensure the item has a valid NAC Code.`);
            }
            logEvents(`Creating receive for request ${item.requestId} with final nacCode: "${finalNacCode}"`, "receiveLog.log");
            const [duplicateCheck] = await connection.execute<RowDataPacket[]>(`SELECT id FROM receive_details 
                WHERE request_fk = ? AND nac_code = ? AND receive_date = ?`, [item.requestId, finalNacCode, formattedDate]);
            if ((duplicateCheck as any[]).length > 0) {
                logEvents(`Failed to create receive - Duplicate receive detected for request ${item.requestId}, nac_code ${finalNacCode} on date ${formattedDate} by user: ${receiveData.receivedBy}`, "receiveLog.log");
                throw new Error(`This item (${finalNacCode}) has already been received for request ${requestNumber} on ${formattedDate}. Please select a different date or item.`);
            }
            const [qRows] = await connection.execute<RowDataPacket[]>(`SELECT requested_quantity AS rq FROM request_details WHERE id = ? FOR UPDATE`, [item.requestId]);
            if (!(qRows as any[]).length) {
                logEvents(`Failed to create receive - Request not found: ${item.requestId} by user: ${receiveData.receivedBy}`, "receiveLog.log");
                throw new Error(`Request ID ${item.requestId} not found`);
            }
            const requestedQty = Number((qRows as any[])[0].rq);
            const [sumRows] = await connection.execute<RowDataPacket[]>(`SELECT COALESCE(SUM(received_quantity),0) AS total
                 FROM receive_details
                 WHERE request_fk = ? AND approval_status IN ('PENDING','APPROVED')`, [item.requestId]);
            const currentTotal = Number((sumRows as any[])[0]?.total || 0);
            const remaining = requestedQty - currentTotal;
            if (typeof item.receiveQuantity !== 'number' || item.receiveQuantity <= 0) {
                logEvents(`Failed to create receive - Invalid quantity ${item.receiveQuantity} for request ${item.requestId}`, "receiveLog.log");
                throw new Error(`Invalid receive quantity. Quantity must be a positive number.`);
            }
            if (item.receiveQuantity > remaining) {
                logEvents(`Failed to create receive - Quantity ${item.receiveQuantity} exceeds remaining ${remaining} for request ${item.requestId}`, "receiveLog.log");
                throw new Error(`Cannot receive ${item.receiveQuantity} units. Only ${remaining} units remaining for this request.`);
            }
            const columns = [
                'receive_date', 'request_fk', 'nac_code', 'part_number', 'item_name',
                'received_quantity', 'remaining_quantity', 'unit', 'approval_status', 'received_by', 'image_path'
            ];
            const values = [
                formattedDate,
                item.requestId,
                finalNacCode,
                item.partNumber,
                item.itemName,
                item.receiveQuantity,
                item.receiveQuantity,
                item.unit,
                'PENDING',
                receiveData.receivedBy,
                item.imagePath
            ];
            if (item.location !== undefined && item.location !== null && item.location !== '') {
                columns.push('location');
                values.push(item.location);
            }
            if (item.cardNumber !== undefined && item.cardNumber !== null && item.cardNumber !== '') {
                columns.push('card_number');
                values.push(item.cardNumber);
            }
            const placeholders = columns.map(() => '?').join(', ');
            const [result] = await connection.execute(`INSERT INTO receive_details (${columns.join(', ')}) VALUES (${placeholders})`, values);
            const receiveId = (result as any).insertId;
            receiveIds.push(receiveId);
            logEvents(`Created receive item for request ${requestNumber} with ID ${receiveId} by user: ${receiveData.receivedBy}`, "receiveLog.log");
        }
        await connection.commit();
        logEvents(`Successfully created receive with ${receiveIds.length} items by user: ${receiveData.receivedBy}`, "receiveLog.log");
        res.status(201).json({
            message: 'Receive created successfully',
            receiveDate: formatDate(receiveData.receiveDate),
            receiveIds
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error creating receive: ${errorMessage} by user: ${receiveData.receivedBy}`, "receiveLog.log");
        if (errorMessage.includes('Invalid receive quantity') ||
            errorMessage.includes('Request ID') && errorMessage.includes('not found') ||
            errorMessage.includes('Cannot receive') ||
            errorMessage.includes('Quantity must be a positive number') ||
            errorMessage.includes('has already been received') ||
            errorMessage.includes('NAC Code is required') ||
            errorMessage.includes('NAC Code is missing')) {
            res.status(400).json({
                error: 'Bad Request',
                message: errorMessage
            });
        }
        else {
            res.status(500).json({
                error: 'Internal Server Error',
                message: 'An error occurred while creating receive'
            });
        }
    }
    finally {
        connection.release();
    }
};
export const getReceiveDetails = async (req: Request, res: Response): Promise<void> => {
    try {
        const { receiveId } = req.params;
        const [results] = await pool.execute<ReceiveDetailResult[]>(`SELECT 
                COALESCE(req.request_number, '') as request_number,
                COALESCE(req.request_date, NULL) as request_date,
                rd.receive_date,
                rd.item_name,
                COALESCE(req.part_number, '') as requested_part_number,
                rd.part_number as received_part_number,
                COALESCE(req.requested_quantity, 0) as requested_quantity,
                rd.received_quantity,
                COALESCE(req.equipment_number, '') as equipment_number,
                rd.unit,
                COALESCE(req.unit, '') as requested_unit,
                COALESCE(NULLIF(rd.nac_code, ''), COALESCE(req.nac_code, '')) as nac_code,
                COALESCE(req.image_path, '') as requested_image,
                rd.image_path as received_image,
                rd.location,
                rd.card_number,
                rd.receive_source,
                rd.tender_reference_number,
                rd.borrow_reference_number,
                rd.borrow_date,
                rd.borrow_source_id,
                bs.source_name as borrow_source_name,
                bs.source_code as borrow_source_code,
                rd.request_fk
            FROM receive_details rd
            LEFT JOIN request_details req ON rd.request_fk = req.id
            LEFT JOIN borrow_sources bs ON rd.borrow_source_id = bs.id
            WHERE rd.id = ?`, [receiveId]);
        if (!results.length) {
            logEvents(`Failed to fetch receive details - Receive not found: ${receiveId}`, "receiveLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Receive details not found'
            });
            return;
        }
        const result = results[0];
        let conversionBase: number | null = null;
        if (result.requested_unit && result.unit && result.requested_unit !== result.unit) {
            const [convRows] = await pool.execute<RowDataPacket[]>(`SELECT conversion_base 
                 FROM unit_conversions 
                 WHERE nac_code = ? AND requested_unit = ? AND received_unit = ?`, [result.nac_code, result.requested_unit, result.unit]);
            if (convRows.length > 0 && convRows[0].conversion_base != null) {
                conversionBase = Number(convRows[0].conversion_base);
            }
        }
        const formattedResponse: any = {
            receiveId: parseInt(receiveId),
            requestNumber: result.request_number || '',
            requestDate: result.request_date ? formatDate(result.request_date) : '',
            receiveDate: formatDate(result.receive_date),
            itemName: result.item_name,
            requestedPartNumber: result.requested_part_number || '',
            receivedPartNumber: result.received_part_number,
            requestedQuantity: result.requested_quantity || 0,
            receivedQuantity: result.received_quantity,
            equipmentNumber: result.equipment_number || '',
            unit: result.unit,
            requestedUnit: result.requested_unit || null,
            conversionBase: conversionBase,
            nacCode: result.nac_code && result.nac_code.trim() !== '' ? result.nac_code : 'N/A',
            receiveSource: result.receive_source || null,
            tenderReferenceNumber: result.tender_reference_number || null,
            borrowReferenceNumber: result.borrow_reference_number || null,
            borrowDate: result.borrow_date ? formatDate(result.borrow_date) : null,
            borrowSourceId: result.borrow_source_id || null,
            borrowSourceName: result.borrow_source_name || null,
            borrowSourceCode: result.borrow_source_code || null,
            requestedImage: result.requested_image || '',
            receivedImage: result.received_image,
            requestFk: result.request_fk
        };
        if (result.location !== undefined && result.location !== null && result.location !== '') {
            formattedResponse.location = result.location;
        }
        if (result.card_number !== undefined && result.card_number !== null && result.card_number !== '') {
            formattedResponse.cardNumber = result.card_number;
        }
        logEvents(`Successfully fetched receive details for ID: ${receiveId}`, "receiveLog.log");
        res.status(200).json(formattedResponse);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching receive details: ${errorMessage} for ID: ${req.params.receiveId}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching receive details'
        });
    }
};
export const updateReceive = async (req: Request, res: Response): Promise<void> => {
    try {
        const { receiveId } = req.params;
        const { receivedQuantity, receivedPartNumber, unit, nacCode } = req.body;
        if (!receivedQuantity || typeof receivedQuantity !== 'number' || receivedQuantity <= 0) {
            logEvents(`Failed to update receive - Invalid quantity: ${receivedQuantity} for ID: ${receiveId}`, "receiveLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'Valid received quantity is required'
            });
            return;
        }
        if (!receivedPartNumber || typeof receivedPartNumber !== 'string' || receivedPartNumber.trim() === '') {
            logEvents(`Failed to update receive - Invalid part number: ${receivedPartNumber} for ID: ${receiveId}`, "receiveLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'Valid received part number is required'
            });
            return;
        }
        const [fkRows] = await pool.execute<RowDataPacket[]>(`SELECT request_fk, approval_status, nac_code FROM receive_details WHERE id = ?`, [receiveId]);
        if (!fkRows.length) {
            logEvents(`Failed to update receive - Receive not found: ${receiveId}`, "receiveLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Receive record not found'
            });
            return;
        }
        const requestFk = fkRows[0].request_fk as number;
        const existingNacCode = typeof fkRows[0].nac_code === 'string' ? fkRows[0].nac_code.trim() : '';
        const [[need]] = await pool.execute<RowDataPacket[]>(`SELECT requested_quantity AS rq FROM request_details WHERE id = ?`, [requestFk]);
        const requestedQty = Number((need as any).rq);
        const [[sumRow]] = await pool.execute<RowDataPacket[]>(`SELECT COALESCE(SUM(received_quantity),0) AS total
             FROM receive_details
             WHERE request_fk = ? AND approval_status IN ('PENDING','APPROVED')`, [requestFk]);
        const [[selfRow]] = await pool.execute<RowDataPacket[]>(`SELECT received_quantity AS selfQty FROM receive_details WHERE id = ?`, [receiveId]);
        const othersTotal = Number((sumRow as any).total) - Number((selfRow as any).selfQty);
        const maxAllowed = requestedQty - othersTotal;
        if (receivedQuantity > maxAllowed) {
            logEvents(`Failed to update receive - Quantity ${receivedQuantity} exceeds remaining ${maxAllowed} for request ${requestFk}`, "receiveLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: `Quantity exceeds remaining (${maxAllowed})`
            });
            return;
        }
        const updateFields = [
            'received_quantity = ?',
            'part_number = ?'
        ];
        const updateValues: (number | string | null)[] = [
            receivedQuantity,
            receivedPartNumber
        ];
        let requestNacCode = '';
        if (requestFk && requestFk > 0) {
            const [[requestRow]] = await pool.execute<RowDataPacket[]>(`SELECT nac_code FROM request_details WHERE id = ?`, [requestFk]);
            requestNacCode = typeof (requestRow as any)?.nac_code === 'string' ? (requestRow as any).nac_code.trim() : '';
        }
        const incomingNacCode = typeof nacCode === 'string' ? nacCode.trim() : '';
        const resolvedNacCode = incomingNacCode || requestNacCode || existingNacCode || '';
        
        updateFields.push('nac_code = COALESCE(NULLIF(?, \'\'), nac_code)');
        updateValues.push(resolvedNacCode);
        if (typeof unit === 'string' && unit.trim() !== '') {
            updateFields.push('unit = ?');
            updateValues.push(unit.trim());
        }
        updateFields.push('updated_at = CURRENT_TIMESTAMP');
        updateValues.push(receiveId);
        const [result] = await pool.execute(`UPDATE receive_details 
             SET ${updateFields.join(', ')}
            WHERE id = ?`, updateValues);
        const affectedRows = (result as any).affectedRows;
        if (affectedRows === 0) {
            logEvents(`Failed to update receive - Receive not found: ${receiveId}`, "receiveLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Receive record not found'
            });
            return;
        }
        
        const [[postUpdateRow]] = await pool.execute<RowDataPacket[]>(`SELECT nac_code FROM receive_details WHERE id = ?`, [receiveId]);
        const postUpdateNacCode = typeof (postUpdateRow as any)?.nac_code === 'string' ? (postUpdateRow as any).nac_code.trim() : '';
        if (postUpdateNacCode === '') {
            const fallbackNacCode = incomingNacCode || requestNacCode || existingNacCode || '';
            if (fallbackNacCode !== '') {
                await pool.execute(`UPDATE receive_details 
                    SET nac_code = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?`, [fallbackNacCode, receiveId]);
                logEvents(`Recovered blank nac_code for receive ${receiveId} using fallback value: ${fallbackNacCode}`, "receiveLog.log");
            }
        }
        if (fkRows[0].approval_status === 'APPROVED') {
            const [[apprSum]] = await pool.execute<RowDataPacket[]>(`SELECT COALESCE(SUM(received_quantity),0) AS total
                 FROM receive_details
                 WHERE request_fk = ? AND approval_status = 'APPROVED'`, [requestFk]);
            const approvedTotal = Number((apprSum as any).total || 0);
            const isComplete = approvedTotal >= requestedQty;
            const [latestReceive] = await pool.execute<RowDataPacket[]>(`SELECT id FROM receive_details 
                 WHERE request_fk = ? AND approval_status = 'APPROVED' 
                 ORDER BY id DESC LIMIT 1`, [requestFk]);
            const latestReceiveId = (latestReceive as any[])[0]?.id;
            await pool.execute(`UPDATE request_details 
                 SET is_received = ?, 
                     receive_fk = ?,
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`, [isComplete, latestReceiveId, requestFk]);
            logEvents(`Updated request ${requestFk} after edit: is_received=${isComplete}, receive_fk=${latestReceiveId}, approved_total=${approvedTotal}/${requestedQty}`, "receiveLog.log");
        }
        logEvents(`Successfully updated receive for ID: ${receiveId} - Quantity: ${receivedQuantity}, Part Number: ${receivedPartNumber}, NAC Code: ${resolvedNacCode || 'N/A'}`, "receiveLog.log");
        res.status(200).json({
            message: 'Receive updated successfully',
            receiveId,
            receivedQuantity,
            receivedPartNumber,
            nacCode: resolvedNacCode || null
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error updating receive: ${errorMessage} for ID: ${req.params.receiveId}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while updating receive'
        });
    }
};
export const updateReceiveImages = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const { receiveId } = req.params;
        const { requestedImagePath, receivedImagePath } = req.body;
        const [currentReceive] = await connection.execute<RowDataPacket[]>(`SELECT image_path FROM receive_details WHERE id = ?`, [receiveId]);
        if (currentReceive.length === 0) {
            logEvents(`Failed to update receive images - Receive not found: ${receiveId}`, "receiveLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Receive record not found'
            });
            return;
        }
        const oldRequestedImagePath = currentReceive[0].image_path;
        const oldReceivedImagePath = currentReceive[0].image_path;
        if (requestedImagePath && oldRequestedImagePath && requestedImagePath !== oldRequestedImagePath) {
            try {
                const fs = require('fs');
                const path = require('path');
                const publicDir = path.join(process.cwd(), '..', 'frontend', 'public');
                const oldImageFullPath = path.join(publicDir, oldRequestedImagePath.replace(/^\//, ''));
                if (fs.existsSync(oldImageFullPath)) {
                    fs.unlinkSync(oldImageFullPath);
                    logEvents(`Deleted old requested image file: ${oldImageFullPath} for receive ID: ${receiveId}`, "receiveLog.log");
                }
            }
            catch (deleteError) {
                logEvents(`Warning: Failed to delete old requested image file: ${oldRequestedImagePath} for receive ID: ${receiveId}. Error: ${deleteError}`, "receiveLog.log");
            }
        }
        if (receivedImagePath && oldReceivedImagePath && receivedImagePath !== oldReceivedImagePath) {
            try {
                const fs = require('fs');
                const path = require('path');
                const publicDir = path.join(process.cwd(), '..', 'frontend', 'public');
                const oldImageFullPath = path.join(publicDir, oldReceivedImagePath.replace(/^\//, ''));
                if (fs.existsSync(oldImageFullPath)) {
                    fs.unlinkSync(oldImageFullPath);
                    logEvents(`Deleted old received image file: ${oldImageFullPath} for receive ID: ${receiveId}`, "receiveLog.log");
                }
            }
            catch (deleteError) {
                logEvents(`Warning: Failed to delete old received image file: ${oldReceivedImagePath} for receive ID: ${receiveId}. Error: ${deleteError}`, "receiveLog.log");
            }
        }
        const [result] = await connection.execute(`UPDATE receive_details 
            SET image_path = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`, [receivedImagePath || oldReceivedImagePath, receiveId]);
        const affectedRows = (result as any).affectedRows;
        if (affectedRows === 0) {
            logEvents(`Failed to update receive images - Receive not found: ${receiveId}`, "receiveLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Receive record not found'
            });
            return;
        }
        logEvents(`Successfully updated receive images for ID: ${receiveId} - Requested: ${requestedImagePath || 'unchanged'}, Received: ${receivedImagePath || 'unchanged'}`, "receiveLog.log");
        res.status(200).json({
            message: 'Receive images updated successfully',
            receiveId,
            requestedImagePath,
            receivedImagePath
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error updating receive images: ${errorMessage} for ID: ${req.params.receiveId}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while updating receive images'
        });
    }
    finally {
        connection.release();
    }
};
const sendReceiveApprovalEmail = async (receiveId: number, requestFk: number | null): Promise<void> => {
    try {
        if (!requestFk || requestFk <= 0) {
            return;
        }
        const [settingsRows] = await pool.query<RowDataPacket[]>(`SELECT * FROM request_email_settings ORDER BY id LIMIT 1`);
        const settings = settingsRows[0];
        if (!settings || !settings.mail_sending_enabled || !settings.send_enabled) {
            await logEvents(`Receive approval email skipped - sending disabled`, "mailLog.log");
            return;
        }
        const [requestRows] = await pool.query<RowDataPacket[]>(`SELECT 
                request_number, 
                requested_by, 
                requested_by_email,
                item_name,
                part_number,
                requested_quantity,
                unit,
                equipment_number,
                nac_code
             FROM request_details
             WHERE id = ?`, [requestFk]);
        if (!requestRows.length) {
            await logEvents(`Receive approval email skipped - request not found for request_fk: ${requestFk}`, "mailLog.log");
            return;
        }
        const request = requestRows[0];
        const requestedByEmail = request.requested_by_email || (request.requested_by?.includes('@') ? request.requested_by : null);
        if (!requestedByEmail) {
            await logEvents(`Receive approval email skipped - no email for requested_by: ${request.requested_by}`, "mailLog.log");
            return;
        }
        const [receiveRows] = await pool.query<RowDataPacket[]>(`SELECT 
                item_name,
                part_number,
                received_quantity,
                unit,
                receive_date
             FROM receive_details
             WHERE id = ?`, [receiveId]);
        if (!receiveRows.length) {
            await logEvents(`Receive approval email skipped - receive not found: ${receiveId}`, "mailLog.log");
            return;
        }
        const receive = receiveRows[0];
        const receiveDate = formatDate(new Date(receive.receive_date));
        const bodyLines = [
            `<p>Dear Sir/Ma'am,</p>`,
            `<p>The requested item has been received. Kindly proceed with the inspection as soon as possible.</p>`,
            `<p><strong>Request Details</strong></p>`,
            `<ul style="padding-left:18px;margin:12px 0;color:#374151;font-size:14px;">
               <li><strong>Request Number:</strong> ${request.request_number}</li>
               <li><strong>Item Name:</strong> ${receive.item_name || request.item_name}</li>
               <li><strong>Part Number:</strong> ${receive.part_number || request.part_number}</li>
               <li><strong>Requested Quantity:</strong> ${request.requested_quantity} ${request.unit}</li>
               <li><strong>Received Quantity:</strong> ${receive.received_quantity} ${receive.unit || request.unit}</li>
               <li><strong>Receive Date:</strong> ${receiveDate}</li>
               ${request.equipment_number ? `<li><strong>Equipment Number:</strong> ${request.equipment_number}</li>` : ''}
               ${request.nac_code ? `<li><strong>NAC Code:</strong> ${request.nac_code}</li>` : ''}
             </ul>`,
        ].join('');
        const html = renderEmailTemplate({
            title: 'Item Received',
            subtitle: request.request_number,
            body: bodyLines,
            buttonLabel: 'View Request',
            buttonUrl: (process.env.NEXTAUTH_URL || process.env.APP_BASE_URL || '192.168.1.254:3000') + `/request/${request.request_number}`,
        });
        await sendMail({
            from: settings.from_email || process.env.SMTP_USER || 'noreply@nac.com.np',
            to: requestedByEmail,
            subject: `Item Received: ${request.request_number}`,
            html,
        }, {
            user: settings.from_email || undefined,
            pass: settings.smtp_pass ?? undefined,
        });
        await logEvents(`Successfully sent receive approval email to ${requestedByEmail} for request ${request.request_number}`, "mailLog.log");
    }
    catch (error) {
        await logEvents(`Error sending receive approval email for receive ${receiveId}: ${error instanceof Error ? error.message : String(error)}`, "mailLog.log");
    }
};
export const approveReceive = async (req: Request, res: Response): Promise<void> => {
    const { receiveId } = req.params;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [receiveDetails] = await connection.execute<ReceiveDetailResult[]>(`SELECT 
                rd.nac_code,
                rd.item_name,
                rd.part_number,
                rd.received_quantity,
                COALESCE(NULLIF(rd.equipment_number, ''), COALESCE(req.equipment_number, '')) as equipment_number,
                rd.location,
                rd.card_number,
                rd.image_path,
                rd.unit,
                COALESCE(req.unit, '') as requested_unit,
                rd.receive_source,
                rd.tender_reference_number,
                rd.request_fk
            FROM receive_details rd
            LEFT JOIN request_details req ON rd.request_fk = req.id
            WHERE rd.id = ?`, [receiveId]);
        if (!receiveDetails.length) {
            logEvents(`Failed to approve receive - Receive not found: ${receiveId}`, "receiveLog.log");
            throw new Error('Receive record not found');
        }
        const receive = receiveDetails[0];
        await connection.execute(`UPDATE receive_details 
            SET approval_status = 'APPROVED',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`, [receiveId]);
        const [stockDetails] = await connection.execute<StockDetailResult[]>(`SELECT * FROM stock_details 
            WHERE nac_code = ?`, [receive.nac_code]);
        let stockQty = typeof receive.received_quantity === 'string'
            ? parseFloat(receive.received_quantity)
            : receive.received_quantity;
        let stockUnit = receive.unit;
        if (receive.requested_unit && receive.unit && receive.requested_unit !== receive.unit) {
            const [convRows] = await connection.execute<RowDataPacket[]>(`SELECT conversion_base 
                 FROM unit_conversions 
                 WHERE nac_code = ? AND requested_unit = ? AND received_unit = ?`, [receive.nac_code, receive.requested_unit, receive.unit]);
            if (convRows.length > 0 && convRows[0].conversion_base != null) {
                const conv = Number(convRows[0].conversion_base);
                if (conv > 0) {
                    stockQty = stockQty / conv;
                    stockUnit = receive.requested_unit;
                }
            }
        }
        if (stockDetails.length > 0) {
            const stock = stockDetails[0];
            const currentBalance = typeof stock.current_balance === 'string'
                ? parseFloat(stock.current_balance)
                : stock.current_balance;
            const newBalance = currentBalance + stockQty;
            let partNumbers = stock.part_numbers.split(',').map(pn => pn.trim()).filter(pn => pn !== '');
            if (!partNumbers.includes(receive.part_number)) {
                partNumbers = [receive.part_number, ...partNumbers];
            }
            const updatedPartNumbers = partNumbers.join(',');
            let itemNames = stock.item_name.split(',').map(name => name.trim()).filter(name => name !== '');
            if (!itemNames.includes(receive.item_name)) {
                itemNames = [receive.item_name, ...itemNames];
            }
            const updatedItemNames = itemNames.join(',');
            const existingEquipmentNumbers = new Set(stock.applicable_equipments.split(',').map(num => num.trim()).filter(num => num !== ''));
            const newEquipmentNumbers = expandEquipmentNumbers(receive.equipment_number);
            const uniqueNewNumbers = Array.from(newEquipmentNumbers).filter(num => !existingEquipmentNumbers.has(num));
            const updatedEquipmentNumbers = uniqueNewNumbers.length > 0
                ? [...uniqueNewNumbers, ...Array.from(existingEquipmentNumbers)].join(',')
                : stock.applicable_equipments;
            const updateFields = [
                'current_balance = ?',
                'part_numbers = ?',
                'item_name = ?',
                'applicable_equipments = ?'
            ];
            const updateValues = [
                newBalance,
                updatedPartNumbers,
                updatedItemNames,
                updatedEquipmentNumbers
            ];
            if (receive.location && receive.location.trim() !== '') {
                updateFields.push('location = ?');
                updateValues.push(receive.location);
            }
            if (receive.card_number && receive.card_number.trim() !== '') {
                updateFields.push('card_number = ?');
                updateValues.push(receive.card_number);
            }
            if (receive.image_path && receive.image_path.trim() !== '') {
                updateFields.push('image_url = ?');
                updateValues.push(receive.image_path);
            }
            if (stockUnit && stockUnit.trim() !== '') {
                updateFields.push('unit = ?');
                updateValues.push(stockUnit);
            }
            updateValues.push(stock.id);
            await connection.execute(`UPDATE stock_details 
                SET ${updateFields.join(', ')},
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`, updateValues);
            logEvents(`Successfully updated stock for NAC code: ${receive.nac_code} with new balance: ${newBalance}`, "receiveLog.log");
        }
        else {
            if (!receive.nac_code || receive.nac_code.trim() === '') {
                logEvents(`Cannot create stock record - Empty/null nacCode for receive ID ${receiveId}`, "receiveLog.log");
                throw new Error(`Cannot create stock record - NAC Code is missing for item: ${receive.item_name}. Please ensure the receive record has a valid NAC Code.`);
            }
            logEvents(`Creating new stock record for NAC code: "${receive.nac_code}" with receive ID: ${receiveId}`, "receiveLog.log");
            const insertFields = [
                'nac_code',
                'item_name',
                'part_numbers',
                'applicable_equipments',
                'open_quantity',
                'open_amount',
                'current_balance',
                'unit'
            ];
            const insertValues = [
                receive.nac_code,
                receive.item_name,
                receive.part_number,
                Array.from(expandEquipmentNumbers(receive.equipment_number)).join(','),
                0,
                0,
                receive.received_quantity,
                receive.unit
            ];
            if (receive.location && receive.location.trim() !== '') {
                insertFields.push('location');
                insertValues.push(receive.location);
            }
            if (receive.card_number && receive.card_number.trim() !== '') {
                insertFields.push('card_number');
                insertValues.push(receive.card_number);
            }
            if (receive.image_path && receive.image_path.trim() !== '') {
                insertFields.push('image_url');
                insertValues.push(receive.image_path);
            }
            const placeholders = insertFields.map(() => '?').join(', ');
            await connection.execute(`INSERT INTO stock_details (${insertFields.join(', ')}) 
                VALUES (${placeholders})`, insertValues);
            logEvents(`Successfully created new stock record for NAC code: ${receive.nac_code}`, "receiveLog.log");
        }
        await connection.commit();
        logEvents(`Successfully approved receive ID: ${receiveId}`, "receiveLog.log");
        const [rqRows] = await connection.execute<RowDataPacket[]>(`SELECT request_fk, receive_source FROM receive_details WHERE id = ?`, [receiveId]);
        const requestFkForCompletion = (rqRows as any[])[0]?.request_fk;
        const receiveSource = (rqRows as any[])[0]?.receive_source;
        if (requestFkForCompletion && requestFkForCompletion > 0 && receiveSource !== 'tender') {
            const [needRows] = await connection.execute<RowDataPacket[]>(`SELECT requested_quantity AS rq FROM request_details WHERE id = ?`, [requestFkForCompletion]);
            const requestedQtyForCompletion = Number((needRows as any[])[0]?.rq || 0);
            const [apprRows] = await connection.execute<RowDataPacket[]>(`SELECT COALESCE(SUM(received_quantity),0) AS total
                 FROM receive_details
                 WHERE request_fk = ? AND approval_status = 'APPROVED'`, [requestFkForCompletion]);
            const approvedTotal = Number((apprRows as any[])[0]?.total || 0);
            const isComplete = approvedTotal >= requestedQtyForCompletion;
            const [latestReceive] = await connection.execute<RowDataPacket[]>(`SELECT id FROM receive_details 
                 WHERE request_fk = ? AND approval_status = 'APPROVED' 
                 ORDER BY id DESC LIMIT 1`, [requestFkForCompletion]);
            const latestReceiveId = (latestReceive as any[])[0]?.id;
            await connection.execute(`UPDATE request_details 
                 SET is_received = ?, 
                     receive_fk = ?,
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`, [isComplete, latestReceiveId, requestFkForCompletion]);
            logEvents(`Updated request ${requestFkForCompletion}: is_received=${isComplete}, receive_fk=${latestReceiveId}, approved_total=${approvedTotal}/${requestedQtyForCompletion}`, "receiveLog.log");
        }
        if (receive.nac_code) {
            try {
                await refreshPredictionMetrics({ nacCode: receive.nac_code });
            }
            catch (predictionError) {
                const predictionMessage = predictionError instanceof Error ? predictionError.message : 'Unknown error';
                logEvents(`Warning: Failed to refresh prediction metrics for NAC ${receive.nac_code} after approval ${receiveId}: ${predictionMessage}`, "predictionLog.log");
            }
        }
        const requestFkForEmail = (rqRows as any[])[0]?.request_fk;
        if (requestFkForEmail && requestFkForEmail > 0) {
            await sendReceiveApprovalEmail(Number(receiveId), Number(requestFkForEmail));
        }
        res.status(200).json({
            message: 'Receive approved and stock updated successfully'
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error approving receive: ${errorMessage} for ID: ${receiveId}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while approving receive'
        });
    }
    finally {
        connection.release();
    }
};
export const approveReceiveAndClose = async (req: Request, res: Response): Promise<void> => {
    const { receiveId } = req.params;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [receiveDetails] = await connection.execute<ReceiveDetailResult[]>(`SELECT 
                rd.nac_code,
                rd.item_name,
                rd.part_number,
                rd.received_quantity,
                COALESCE(NULLIF(rd.equipment_number, ''), COALESCE(req.equipment_number, '')) as equipment_number,
                rd.location,
                rd.card_number,
                rd.image_path,
                rd.unit,
                COALESCE(req.unit, '') as requested_unit,
                rd.receive_source,
                rd.tender_reference_number,
                rd.request_fk
            FROM receive_details rd
            LEFT JOIN request_details req ON rd.request_fk = req.id
            WHERE rd.id = ?`, [receiveId]);
        if (!receiveDetails.length) {
            logEvents(`Failed to approve & close - Receive not found: ${receiveId}`, "receiveLog.log");
            throw new Error('Receive record not found');
        }
        const receive = receiveDetails[0];
        await connection.execute(`UPDATE receive_details 
            SET approval_status = 'APPROVED',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`, [receiveId]);
        const [stockDetails] = await connection.execute<StockDetailResult[]>(`SELECT * FROM stock_details 
            WHERE nac_code = ?`, [receive.nac_code]);
        let stockQty = typeof receive.received_quantity === 'string'
            ? parseFloat(receive.received_quantity)
            : receive.received_quantity;
        let stockUnit = receive.unit;
        if (receive.requested_unit && receive.unit && receive.requested_unit !== receive.unit) {
            const [convRows] = await connection.execute<RowDataPacket[]>(`SELECT conversion_base 
                 FROM unit_conversions 
                 WHERE nac_code = ? AND requested_unit = ? AND received_unit = ?`, [receive.nac_code, receive.requested_unit, receive.unit]);
            if (convRows.length > 0 && convRows[0].conversion_base != null) {
                const conv = Number(convRows[0].conversion_base);
                if (conv > 0) {
                    stockQty = stockQty / conv;
                    stockUnit = receive.requested_unit;
                }
            }
        }
        if (stockDetails.length > 0) {
            const stock = stockDetails[0];
            const currentBalance = typeof stock.current_balance === 'string'
                ? parseFloat(stock.current_balance)
                : stock.current_balance;
            const newBalance = currentBalance + stockQty;
            let partNumbers = stock.part_numbers.split(',').map(pn => pn.trim()).filter(pn => pn !== '');
            if (!partNumbers.includes(receive.part_number)) {
                partNumbers = [receive.part_number, ...partNumbers];
            }
            const updatedPartNumbers = partNumbers.join(',');
            let itemNames = stock.item_name.split(',').map(name => name.trim()).filter(name => name !== '');
            if (!itemNames.includes(receive.item_name)) {
                itemNames = [receive.item_name, ...itemNames];
            }
            const updatedItemNames = itemNames.join(',');
            const existingEquipmentNumbers = new Set(stock.applicable_equipments.split(',').map(num => num.trim()).filter(num => num !== ''));
            const newEquipmentNumbers = expandEquipmentNumbers(receive.equipment_number);
            const uniqueNewNumbers = Array.from(newEquipmentNumbers).filter(num => !existingEquipmentNumbers.has(num));
            const updatedEquipmentNumbers = uniqueNewNumbers.length > 0
                ? [...uniqueNewNumbers, ...Array.from(existingEquipmentNumbers)].join(',')
                : stock.applicable_equipments;
            const updateFields = [
                'current_balance = ?',
                'part_numbers = ?',
                'item_name = ?',
                'applicable_equipments = ?'
            ];
            const updateValues: any[] = [
                newBalance,
                updatedPartNumbers,
                updatedItemNames,
                updatedEquipmentNumbers
            ];
            if (receive.location && receive.location.trim() !== '') {
                updateFields.push('location = ?');
                updateValues.push(receive.location);
            }
            if (receive.card_number && receive.card_number.trim() !== '') {
                updateFields.push('card_number = ?');
                updateValues.push(receive.card_number);
            }
            if (receive.image_path && receive.image_path.trim() !== '') {
                updateFields.push('image_url = ?');
                updateValues.push(receive.image_path);
            }
            if (stockUnit && stockUnit.trim() !== '') {
                updateFields.push('unit = ?');
                updateValues.push(stockUnit);
            }
            updateValues.push(stock.id);
            await connection.execute(`UPDATE stock_details 
                SET ${updateFields.join(', ')},
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`, updateValues);
        }
        else {
            if (!receive.nac_code || receive.nac_code.trim() === '') {
                logEvents(`Cannot create stock record - Empty/null nacCode for receive ID ${receiveId}`, "receiveLog.log");
                throw new Error(`Cannot create stock record - NAC Code is missing for item: ${receive.item_name}. Please ensure the receive record has a valid NAC Code.`);
            }
            const insertFields = [
                'nac_code',
                'item_name',
                'part_numbers',
                'applicable_equipments',
                'open_quantity',
                'open_amount',
                'current_balance',
                'unit'
            ];
            const insertValues: any[] = [
                receive.nac_code,
                receive.item_name,
                receive.part_number,
                Array.from(expandEquipmentNumbers(receive.equipment_number)).join(','),
                0,
                0,
                receive.received_quantity,
                receive.unit
            ];
            if (receive.location && receive.location.trim() !== '') {
                insertFields.push('location');
                insertValues.push(receive.location);
            }
            if (receive.card_number && receive.card_number.trim() !== '') {
                insertFields.push('card_number');
                insertValues.push(receive.card_number);
            }
            if (receive.image_path && receive.image_path.trim() !== '') {
                insertFields.push('image_url');
                insertValues.push(receive.image_path);
            }
            const placeholders = insertFields.map(() => '?').join(', ');
            await connection.execute(`INSERT INTO stock_details (${insertFields.join(', ')}) 
                VALUES (${placeholders})`, insertValues);
        }
        if (receive.request_fk && receive.request_fk > 0 && receive.receive_source !== 'tender') {
            await connection.execute(`UPDATE request_details 
                 SET is_received = 1,
                     receive_fk = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`, [receiveId, receive.request_fk]);
        }
        await connection.commit();
        logEvents(`Successfully approved & force closed receive ID: ${receiveId}`, "receiveLog.log");
        if (receive.nac_code) {
            try {
                await refreshPredictionMetrics({ nacCode: receive.nac_code });
            }
            catch (predictionError) {
                const predictionMessage = predictionError instanceof Error ? predictionError.message : 'Unknown error';
                logEvents(`Warning: Failed to refresh prediction metrics for NAC ${receive.nac_code} after approve-and-close ${receiveId}: ${predictionMessage}`, "predictionLog.log");
            }
        }
        if (receive.request_fk && receive.request_fk > 0) {
            await sendReceiveApprovalEmail(Number(receiveId), Number(receive.request_fk));
        }
        res.status(200).json({
            message: 'Receive approved, stock updated and request force-closed successfully'
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error approving & closing receive: ${errorMessage} for ID: ${receiveId}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while approving and closing receive'
        });
    }
    finally {
        connection.release();
    }
};
export const rejectReceive = async (req: Request, res: Response): Promise<void> => {
    const { receiveId } = req.params;
    const { rejectedBy, rejectionReason } = req.body || {};
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [receiveDetails] = await connection.execute<RowDataPacket[]>(`SELECT rd.request_fk, rd.received_by, rd.item_name 
            FROM receive_details rd 
            WHERE rd.id = ?`, [receiveId]);
        if (!receiveDetails.length) {
            logEvents(`Failed to reject receive - Receive not found: ${receiveId}`, "receiveLog.log");
            throw new Error('Receive record not found');
        }
        const requestFk = receiveDetails[0].request_fk as number | null;
        const receivedBy = receiveDetails[0].received_by as string;
        const itemName = receiveDetails[0].item_name as string;
        const safeRejectedBy = (typeof rejectedBy === 'string' && rejectedBy.trim() !== '') ? rejectedBy.trim() : (String(req.user || 'system'));
        const safeRejectionReason = (typeof rejectionReason === 'string') ? rejectionReason : '';
        await connection.execute(`UPDATE receive_details 
            SET approval_status = 'REJECTED',
                rejected_by = ?,
                rejection_reason = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`, [safeRejectedBy, safeRejectionReason, receiveId]);
        if (requestFk && requestFk > 0) {
            const [needRows] = await connection.execute<RowDataPacket[]>(`SELECT requested_quantity AS rq FROM request_details WHERE id = ?`, [requestFk]);
            const requestedQty = Number((needRows as any[])[0]?.rq || 0);
            const [apprRows] = await connection.execute<RowDataPacket[]>(`SELECT COALESCE(SUM(received_quantity),0) AS total
                 FROM receive_details
                 WHERE request_fk = ? AND approval_status = 'APPROVED'`, [requestFk]);
            const approvedTotal = Number((apprRows as any[])[0]?.total || 0);
            const isComplete = approvedTotal >= requestedQty;
            const [latestReceive] = await connection.execute<RowDataPacket[]>(`SELECT id FROM receive_details 
                 WHERE request_fk = ? AND approval_status = 'APPROVED' 
                 ORDER BY id DESC LIMIT 1`, [requestFk]);
            const latestReceiveId = (latestReceive as any[])[0]?.id ?? null;
            await connection.execute(`UPDATE request_details 
                SET is_received = ?,
                    receive_fk = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`, [isComplete, latestReceiveId, requestFk]);
            logEvents(`Updated request ${requestFk} after rejection: is_received=${isComplete}, receive_fk=${latestReceiveId}, approved_total=${approvedTotal}/${requestedQty}`, "receiveLog.log");
        }
        const [users] = await connection.query<RowDataPacket[]>('SELECT id FROM users WHERE username = ?', [receivedBy]);
        if (users.length === 0) {
            logEvents(`Failed to reject receive - User not found: ${receivedBy}`, "receiveLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'User not found'
            });
            return;
        }
        const userId = users[0].id;
        await connection.query(`INSERT INTO notifications 
             (user_id, reference_type, message, reference_id)
             VALUES (?, ?, ?, ?)`, [
            userId,
            'receive',
            `Your receive for ${itemName} has been rejected for the following reason: ${safeRejectionReason}`,
            receiveId
        ]);
        await connection.commit();
        logEvents(`Successfully rejected receive ID: ${receiveId} by user: ${rejectedBy}`, "receiveLog.log");
        res.status(200).json({
            message: 'Receive rejected successfully'
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error rejecting receive: ${errorMessage} for ID: ${receiveId} by user: ${rejectedBy}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while rejecting receive'
        });
    }
    finally {
        connection.release();
    }
};
function expandEquipmentNumbers(equipmentNumber: string): Set<string> {
    const numbers = new Set<string>();
    const parts = equipmentNumber.split(',');
    for (const part of parts) {
        const trimmedPart = part.trim();
        if (/^[A-Za-z\s]+$/.test(trimmedPart)) {
            numbers.add(trimmedPart);
        }
        else if (/^\d+-\d+$/.test(trimmedPart)) {
            const [start, end] = trimmedPart.split('-').map(Number);
            for (let num = start; num <= end; num++) {
                numbers.add(num.toString());
            }
        }
        else if (/^\d+$/.test(trimmedPart)) {
            numbers.add(trimmedPart);
        }
    }
    return numbers;
}
export const getUnitConversion = async (req: Request, res: Response): Promise<void> => {
    try {
        const { nacCode, requestedUnit, receivedUnit } = req.query;
        if (!nacCode || !requestedUnit || !receivedUnit) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'nacCode, requestedUnit, and receivedUnit are required'
            });
            return;
        }
        const [results] = await pool.execute<RowDataPacket[]>(`SELECT conversion_base 
            FROM unit_conversions 
            WHERE nac_code = ? AND requested_unit = ? AND received_unit = ?`, [nacCode, requestedUnit, receivedUnit]);
        if (results.length > 0) {
            res.status(200).json({
                conversionBase: results[0].conversion_base
            });
        }
        else {
            res.status(200).json({
                conversionBase: null
            });
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching unit conversion: ${errorMessage}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
};
export const saveUnitConversion = async (req: Request, res: Response): Promise<void> => {
    try {
        const { nacCode, requestedUnit, receivedUnit, conversionBase } = req.body;
        if (!nacCode || !requestedUnit || !receivedUnit || !conversionBase) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'nacCode, requestedUnit, receivedUnit, and conversionBase are required'
            });
            return;
        }
        await pool.execute(`INSERT INTO unit_conversions (nac_code, requested_unit, received_unit, conversion_base)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE conversion_base = VALUES(conversion_base), updated_at = CURRENT_TIMESTAMP`, [nacCode, requestedUnit, receivedUnit, conversionBase]);
        res.status(200).json({
            message: 'Unit conversion saved successfully'
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error saving unit conversion: ${errorMessage}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
};
export const getPreviousImage = async (req: Request, res: Response): Promise<void> => {
    try {
        const { nacCode } = req.query;
        if (!nacCode) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'nacCode is required'
            });
            return;
        }
        const [results] = await pool.execute<RowDataPacket[]>(`SELECT image_path 
            FROM receive_details 
            WHERE nac_code = ? 
            AND image_path IS NOT NULL 
            AND image_path != ''
            AND approval_status = 'APPROVED'
            ORDER BY receive_date DESC, id DESC
            LIMIT 1`, [nacCode]);
        if (results.length > 0 && results[0].image_path) {
            res.status(200).json({
                imagePath: results[0].image_path
            });
        }
        else {
            const [stockResults] = await pool.execute<RowDataPacket[]>(`SELECT image_url 
                FROM stock_details 
                WHERE nac_code = ? 
                AND image_url IS NOT NULL 
                AND image_url != ''
                LIMIT 1`, [nacCode]);
            if (stockResults.length > 0 && stockResults[0].image_url) {
                res.status(200).json({
                    imagePath: stockResults[0].image_url
                });
            }
            else {
                res.status(200).json({
                    imagePath: null
                });
            }
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching previous image: ${errorMessage}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
};
