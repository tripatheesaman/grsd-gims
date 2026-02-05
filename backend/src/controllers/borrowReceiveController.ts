import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { formatDateForDB } from '../utils/dateUtils';
import { logEvents } from '../middlewares/logger';
export interface BorrowReceiveRequest {
    receiveDate: string;
    borrowSourceId: number;
    borrowReferenceNumber?: string;
    receivedBy: string;
    items: {
        nacCode: string;
        partNumber: string;
        itemName: string;
        receiveQuantity: number;
        equipmentNumber: string;
        imagePath: string;
        unit: string;
        location?: string;
        cardNumber?: string;
        isNewItem?: boolean;
    }[];
}
export const createBorrowReceive = async (req: Request, res: Response): Promise<void> => {
    const receiveData: BorrowReceiveRequest = req.body;
    if (!receiveData.receiveDate || !receiveData.receivedBy || !receiveData.borrowSourceId || !receiveData.items || receiveData.items.length === 0) {
        logEvents(`Failed to create borrow receive - Missing required fields by user: ${receiveData.receivedBy || 'Unknown'}`, "receiveLog.log");
        res.status(400).json({
            error: 'Bad Request',
            message: 'Missing required fields (receiveDate, receivedBy, borrowSourceId, items)'
        });
        return;
    }
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const formattedDate = formatDateForDB(receiveData.receiveDate);
        const receiveIds: number[] = [];
        const [sourceCheck] = await connection.execute<RowDataPacket[]>('SELECT id, source_name FROM borrow_sources WHERE id = ? AND is_active = 1', [receiveData.borrowSourceId]);
        if ((sourceCheck as any[]).length === 0) {
            throw new Error('Invalid or inactive borrow source selected.');
        }
        for (const item of receiveData.items) {
            if (!item.nacCode || item.nacCode.trim() === '') {
                logEvents(`Failed to create borrow receive - Empty/null nacCode for source ${receiveData.borrowSourceId} by user: ${receiveData.receivedBy}`, "receiveLog.log");
                throw new Error(`NAC Code is required for item: ${item.itemName}. Please ensure the item has a valid NAC Code.`);
            }
            if (item.isNewItem === true) {
                const [existingStock] = await connection.execute<RowDataPacket[]>('SELECT id FROM stock_details WHERE nac_code = ? LIMIT 1', [item.nacCode]);
                if ((existingStock as any[]).length > 0) {
                    throw new Error(`NAC Code ${item.nacCode} already exists. Please choose a new NAC Code for new item.`);
                }
            }
            const [duplicateCheck] = await connection.execute<RowDataPacket[]>(`SELECT id FROM receive_details 
                WHERE borrow_source_id = ? AND nac_code = ? AND receive_date = ? AND receive_source = 'borrow'`, [receiveData.borrowSourceId, item.nacCode, formattedDate]);
            if ((duplicateCheck as any[]).length > 0) {
                logEvents(`Failed to create borrow receive - Duplicate receive detected for source ${receiveData.borrowSourceId}, nac_code ${item.nacCode} on date ${formattedDate} by user: ${receiveData.receivedBy}`, "receiveLog.log");
                throw new Error(`This item (${item.nacCode}) has already been borrowed from this source on ${formattedDate}. Please select a different date or item.`);
            }
            if (typeof item.receiveQuantity !== 'number' || item.receiveQuantity <= 0) {
                logEvents(`Failed to create borrow receive - Invalid quantity ${item.receiveQuantity} for source ${receiveData.borrowSourceId}`, "receiveLog.log");
                throw new Error(`Invalid receive quantity. Quantity must be a positive number.`);
            }
            const columns = [
                'receive_date', 'request_fk', 'nac_code', 'part_number', 'item_name',
                'received_quantity', 'remaining_quantity', 'unit', 'approval_status', 'received_by', 'image_path',
                'receive_source', 'borrow_source_id', 'borrow_status', 'borrow_date', 'borrow_reference_number', 'equipment_number'
            ];
            const values = [
                formattedDate,
                0,
                item.nacCode,
                item.partNumber,
                item.itemName,
                item.receiveQuantity,
                item.receiveQuantity,
                item.unit,
                'PENDING',
                receiveData.receivedBy,
                item.imagePath,
                'borrow',
                receiveData.borrowSourceId,
                'ACTIVE',
                formattedDate,
                receiveData.borrowReferenceNumber || null,
                item.equipmentNumber || ''
            ];
            if (item.location !== undefined && item.location !== null && item.location !== '') {
                columns.push('location');
                values.push(item.location);
            }
            if (item.cardNumber !== undefined && item.cardNumber !== null && item.cardNumber !== '') {
                columns.push('card_number');
                values.push(item.cardNumber);
            }
            const placeholders = values.map(() => '?').join(', ');
            const [result] = await connection.execute(`INSERT INTO receive_details (${columns.join(', ')}) VALUES (${placeholders})`, values);
            const receiveId = (result as any).insertId;
            receiveIds.push(receiveId);
            logEvents(`Created borrow receive record ID: ${receiveId} for NAC: ${item.nacCode}, Source: ${receiveData.borrowSourceId}`, "receiveLog.log");
        }
        await connection.commit();
        logEvents(`Successfully created ${receiveIds.length} borrow receive record(s) by user: ${receiveData.receivedBy}`, "receiveLog.log");
        res.status(201).json({
            message: 'Borrow receive created successfully',
            receiveIds
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error creating borrow receive: ${errorMessage}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const getBorrowReceiveDetails = async (req: Request, res: Response): Promise<void> => {
    try {
        const { receiveId } = req.params;
        const [results] = await pool.execute<RowDataPacket[]>(`SELECT 
                rd.id,
                rd.receive_date,
                rd.nac_code,
                rd.part_number,
                rd.item_name,
                rd.received_quantity,
                rd.unit,
                rd.approval_status,
                rd.received_by,
                rd.image_path,
                rd.location,
                rd.card_number,
                rd.receive_source,
                rd.borrow_source_id,
                rd.borrow_status,
                rd.borrow_date,
                rd.borrow_reference_number,
                rd.return_date,
                rd.return_receive_fk,
                bs.source_name,
                bs.source_code,
                rd.created_at,
                rd.updated_at
            FROM receive_details rd
            LEFT JOIN borrow_sources bs ON rd.borrow_source_id = bs.id
            WHERE rd.id = ? AND rd.receive_source = 'borrow'`, [receiveId]);
        if (!results.length) {
            logEvents(`Failed to fetch borrow receive details - Receive not found: ${receiveId}`, "receiveLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Borrow receive details not found'
            });
            return;
        }
        const result = results[0];
        const formattedResponse = {
            receiveId: parseInt(receiveId),
            receiveDate: result.receive_date,
            nacCode: result.nac_code,
            partNumber: result.part_number,
            itemName: result.item_name,
            receivedQuantity: result.received_quantity,
            unit: result.unit,
            approvalStatus: result.approval_status,
            receivedBy: result.received_by,
            imagePath: result.image_path,
            location: result.location,
            cardNumber: result.card_number,
            receiveSource: result.receive_source,
            borrowSourceId: result.borrow_source_id,
            borrowSourceName: result.source_name,
            borrowSourceCode: result.source_code,
            borrowStatus: result.borrow_status,
            borrowDate: result.borrow_date,
            borrowReferenceNumber: result.borrow_reference_number,
            returnDate: result.return_date,
            returnReceiveFk: result.return_receive_fk,
            createdAt: result.created_at,
            updatedAt: result.updated_at
        };
        res.status(200).json(formattedResponse);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching borrow receive details: ${errorMessage}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
};
export const returnBorrowedItem = async (req: Request, res: Response): Promise<void> => {
    const { borrowReceiveId, returnDate, receivedBy } = req.body;
    if (!borrowReceiveId || !returnDate || !receivedBy) {
        res.status(400).json({
            error: 'Bad Request',
            message: 'Missing required fields (borrowReceiveId, returnDate, receivedBy)'
        });
        return;
    }
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [borrowReceives] = await connection.execute<RowDataPacket[]>(`SELECT * FROM receive_details WHERE id = ? AND receive_source = 'borrow' AND borrow_status = 'ACTIVE'`, [borrowReceiveId]);
        if ((borrowReceives as any[]).length === 0) {
            throw new Error('Borrow receive not found or already returned.');
        }
        const borrowReceive = borrowReceives[0];
        const formattedReturnDate = formatDateForDB(returnDate);
        const [returnResult] = await connection.execute(`INSERT INTO receive_details (
                receive_date, request_fk, nac_code, part_number, item_name,
                received_quantity, remaining_quantity, unit, approval_status, received_by, image_path,
                receive_source, borrow_source_id, borrow_status, borrow_date, borrow_reference_number,
                equipment_number, location, card_number
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            formattedReturnDate,
            0,
            borrowReceive.nac_code,
            borrowReceive.part_number,
            borrowReceive.item_name,
            -borrowReceive.received_quantity,
            0,
            borrowReceive.unit,
            'PENDING',
            receivedBy,
            borrowReceive.image_path,
            'borrow',
            borrowReceive.borrow_source_id,
            'RETURNED',
            borrowReceive.borrow_date,
            borrowReceive.borrow_reference_number,
            borrowReceive.equipment_number,
            borrowReceive.location,
            borrowReceive.card_number
        ]);
        const returnReceiveId = (returnResult as any).insertId;
        await connection.execute(`UPDATE receive_details 
            SET borrow_status = 'RETURNED', return_date = ?, return_receive_fk = ?
            WHERE id = ?`, [formattedReturnDate, returnReceiveId, borrowReceiveId]);
        await connection.commit();
        logEvents(`Successfully returned borrowed item. Borrow ID: ${borrowReceiveId}, Return ID: ${returnReceiveId}`, "receiveLog.log");
        res.status(201).json({
            message: 'Borrowed item returned successfully',
            returnReceiveId,
            borrowReceiveId
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error returning borrowed item: ${errorMessage}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const getActiveBorrowsForNac = async (req: Request, res: Response): Promise<void> => {
    try {
        const { nacCode } = req.params;
        if (!nacCode) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'NAC code is required'
            });
            return;
        }
        const [results] = await pool.execute<RowDataPacket[]>(`SELECT 
                rd.id as receive_id,
                rd.receive_date,
                rd.borrow_date,
                rd.received_quantity,
                rd.unit,
                rd.approval_status,
                rd.borrow_status,
                rd.borrow_reference_number,
                bs.source_name,
                bs.source_code,
                rd.created_at
            FROM receive_details rd
            LEFT JOIN borrow_sources bs ON rd.borrow_source_id = bs.id
            WHERE rd.nac_code = ? 
            AND rd.receive_source = 'borrow'
            AND rd.borrow_status = 'ACTIVE'
            AND rd.approval_status = 'APPROVED'
            ORDER BY rd.borrow_date DESC`, [nacCode]);
        const activeBorrows = results.map(item => ({
            receiveId: item.receive_id,
            receiveDate: item.receive_date,
            borrowDate: item.borrow_date,
            receivedQuantity: item.received_quantity,
            unit: item.unit,
            approvalStatus: item.approval_status,
            borrowStatus: item.borrow_status,
            borrowReferenceNumber: item.borrow_reference_number,
            borrowSourceName: item.source_name,
            borrowSourceCode: item.source_code,
            createdAt: item.created_at
        }));
        res.status(200).json({
            data: activeBorrows,
            hasActiveBorrows: activeBorrows.length > 0
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching active borrows for NAC ${req.params.nacCode}: ${errorMessage}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
};
