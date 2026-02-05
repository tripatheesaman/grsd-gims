import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { formatDateForDB } from '../utils/dateUtils';
import { logEvents } from '../middlewares/logger';
export interface TenderReceiveRequest {
    receiveDate: string;
    tenderNumber: string;
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
export interface TenderReceiveItem {
    nacCode: string;
    partNumber: string;
    itemName: string;
    receiveQuantity: number;
    equipmentNumber: string;
    imagePath: string;
    unit: string;
    location?: string;
    cardNumber?: string;
}
export const createTenderReceive = async (req: Request, res: Response): Promise<void> => {
    const receiveData: TenderReceiveRequest = req.body;
    if (!receiveData.receiveDate || !receiveData.receivedBy || !receiveData.tenderNumber || !receiveData.items || receiveData.items.length === 0) {
        logEvents(`Failed to create tender receive - Missing required fields by user: ${receiveData.receivedBy || 'Unknown'}`, "receiveLog.log");
        res.status(400).json({
            error: 'Bad Request',
            message: 'Missing required fields (receiveDate, receivedBy, tenderNumber, items)'
        });
        return;
    }
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const formattedDate = formatDateForDB(receiveData.receiveDate);
        const receiveIds: number[] = [];
        for (const item of receiveData.items) {
            if (!item.nacCode || item.nacCode.trim() === '') {
                logEvents(`Failed to create tender receive - Empty/null nacCode for tender ${receiveData.tenderNumber} by user: ${receiveData.receivedBy}`, "receiveLog.log");
                throw new Error(`NAC Code is required for item: ${item.itemName}. Please ensure the item has a valid NAC Code.`);
            }
            logEvents(`Creating tender receive for tender ${receiveData.tenderNumber} with nacCode: "${item.nacCode}"`, "receiveLog.log");
            if (item.isNewItem === true) {
                const [existingStock] = await connection.execute<RowDataPacket[]>('SELECT id FROM stock_details WHERE nac_code = ? LIMIT 1', [item.nacCode]);
                if ((existingStock as any[]).length > 0) {
                    throw new Error(`NAC Code ${item.nacCode} already exists. Please choose a new NAC Code for new item.`);
                }
            }
            const [duplicateCheck] = await connection.execute<RowDataPacket[]>(`SELECT id FROM receive_details 
                WHERE tender_reference_number = ? AND nac_code = ? AND receive_date = ? AND receive_source = 'tender'`, [receiveData.tenderNumber, item.nacCode, formattedDate]);
            if ((duplicateCheck as any[]).length > 0) {
                logEvents(`Failed to create tender receive - Duplicate receive detected for tender ${receiveData.tenderNumber}, nac_code ${item.nacCode} on date ${formattedDate} by user: ${receiveData.receivedBy}`, "receiveLog.log");
                throw new Error(`This item (${item.nacCode}) has already been received for tender ${receiveData.tenderNumber} on ${formattedDate}. Please select a different date or item.`);
            }
            if (typeof item.receiveQuantity !== 'number' || item.receiveQuantity <= 0) {
                logEvents(`Failed to create tender receive - Invalid quantity ${item.receiveQuantity} for tender ${receiveData.tenderNumber}`, "receiveLog.log");
                throw new Error(`Invalid receive quantity. Quantity must be a positive number.`);
            }
            const columns = [
                'receive_date', 'request_fk', 'nac_code', 'part_number', 'item_name',
                'received_quantity', 'remaining_quantity', 'unit', 'approval_status', 'received_by', 'image_path',
                'receive_source', 'tender_reference_number', 'equipment_number'
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
                'tender',
                receiveData.tenderNumber,
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
            const placeholders = columns.map(() => '?').join(', ');
            const [result] = await connection.execute(`INSERT INTO receive_details (${columns.join(', ')}) VALUES (${placeholders})`, values);
            const receiveId = (result as any).insertId;
            receiveIds.push(receiveId);
            await connection.execute(`INSERT INTO rrp_details (
                    receive_fk, rrp_number, supplier_name, date, currency, forex_rate,
                    item_price, customs_charge, customs_service_charge, vat_percentage,
                    invoice_number, invoice_date, po_number, airway_bill_number,
                    inspection_details, approval_status, created_by, total_amount,
                    freight_charge, customs_date, customs_number
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                receiveId,
                'TENDER-FREE',
                'Tender Supply',
                formattedDate,
                'NPR',
                1.0,
                0,
                0,
                0,
                0,
                `TENDER-${receiveData.tenderNumber}`,
                formattedDate,
                null,
                null,
                JSON.stringify({
                    inspection_user: receiveData.receivedBy,
                    inspection_details: { note: 'Tender receive - free of cost' }
                }),
                'APPROVED',
                receiveData.receivedBy,
                0,
                0,
                null,
                null
            ]);
            logEvents(`Created tender receive item and RRP for tender ${receiveData.tenderNumber} with ID ${receiveId} by user: ${receiveData.receivedBy}`, "receiveLog.log");
        }
        await connection.commit();
        logEvents(`Successfully created tender receive with ${receiveIds.length} items for tender ${receiveData.tenderNumber} by user: ${receiveData.receivedBy}`, "receiveLog.log");
        res.status(201).json({
            message: 'Tender receive created successfully',
            receiveDate: formattedDate,
            tenderNumber: receiveData.tenderNumber,
            receiveIds
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error creating tender receive: ${errorMessage} by user: ${receiveData.receivedBy}`, "receiveLog.log");
        if (errorMessage.includes('Invalid receive quantity') ||
            errorMessage.includes('NAC Code is required') ||
            errorMessage.includes('has already been received')) {
            res.status(400).json({
                error: 'Bad Request',
                message: errorMessage
            });
        }
        else {
            res.status(500).json({
                error: 'Internal Server Error',
                message: 'An error occurred while creating tender receive'
            });
        }
    }
    finally {
        connection.release();
    }
};
export const getTenderReceiveDetails = async (req: Request, res: Response): Promise<void> => {
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
                rd.tender_reference_number,
                rd.created_at,
                rd.updated_at
            FROM receive_details rd
            WHERE rd.id = ? AND rd.receive_source = 'tender'`, [receiveId]);
        if (!results.length) {
            logEvents(`Failed to fetch tender receive details - Receive not found: ${receiveId}`, "receiveLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Tender receive details not found'
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
            tenderReferenceNumber: result.tender_reference_number,
            createdAt: result.created_at,
            updatedAt: result.updated_at
        };
        logEvents(`Successfully fetched tender receive details for ID: ${receiveId}`, "receiveLog.log");
        res.json(formattedResponse);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching tender receive details: ${errorMessage}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'An error occurred while fetching tender receive details'
        });
    }
};
export const getTenderRRPs = async (req: Request, res: Response): Promise<void> => {
    try {
        const { universal, tenderNumber, page = 1, pageSize = 20 } = req.query;
        const currentPage = parseInt(page.toString()) || 1;
        const limit = parseInt(pageSize.toString()) || 20;
        const offset = (currentPage - 1) * limit;
        let whereClause = "WHERE rrp.rrp_number = 'TENDER-FREE'";
        const params: any[] = [];
        if (universal && universal.toString().trim() !== '') {
            whereClause += " AND (rd.item_name LIKE ? OR rd.part_number LIKE ? OR rd.tender_reference_number LIKE ?)";
            params.push(`%${universal}%`, `%${universal}%`, `%${universal}%`);
        }
        if (tenderNumber && tenderNumber.toString().trim() !== '') {
            whereClause += " AND rd.tender_reference_number LIKE ?";
            params.push(`%${tenderNumber}%`);
        }
        const countQuery = `SELECT COUNT(DISTINCT rrp.id) as total FROM rrp_details rrp JOIN receive_details rd ON rrp.receive_fk = rd.id ${whereClause}`;
        const [countResult] = await pool.execute<RowDataPacket[]>(countQuery, params);
        const totalCount = countResult[0].total;
        const mainQuery = `SELECT DISTINCT rrp.id, rrp.rrp_number, rrp.date as rrp_date, rrp.supplier_name, rrp.currency, rrp.forex_rate, rrp.item_price, rrp.customs_charge, rrp.customs_service_charge, rrp.vat_percentage, rrp.invoice_number, rrp.invoice_date, rrp.po_number, rrp.airway_bill_number, rrp.inspection_details, rrp.approval_status, rrp.created_by, rrp.total_amount, rrp.freight_charge, rrp.customs_date, rrp.customs_number, rrp.reference_doc, rd.item_name, rd.part_number, rd.received_quantity, rd.unit, rd.tender_reference_number FROM rrp_details rrp JOIN receive_details rd ON rrp.receive_fk = rd.id ${whereClause} ORDER BY rrp.date DESC LIMIT ${limit} OFFSET ${offset}`;
        const [results] = await pool.execute<RowDataPacket[]>(mainQuery, params);
        const groupedResults = results.reduce((acc, result) => {
            if (!acc[result.rrp_number]) {
                acc[result.rrp_number] = {
                    rrpNumber: result.rrp_number,
                    rrpDate: result.rrp_date,
                    supplierName: result.supplier_name || '',
                    type: 'tender',
                    currency: result.currency,
                    forexRate: result.forex_rate?.toString() || '0',
                    invoiceNumber: result.invoice_number || '',
                    invoiceDate: result.invoice_date,
                    poNumber: result.po_number,
                    airwayBillNumber: result.airway_bill_number,
                    customsNumber: result.customs_number,
                    inspectionDetails: JSON.parse(result.inspection_details),
                    approvalStatus: result.approval_status,
                    createdBy: result.created_by || '',
                    customsDate: result.customs_date,
                    referenceDoc: result.reference_doc,
                    items: []
                };
            }
            acc[result.rrp_number].items.push({
                id: result.id,
                itemName: result.item_name,
                partNumber: result.part_number,
                equipmentNumber: 'N/A',
                receivedQuantity: result.received_quantity?.toString() || '0',
                unit: result.unit,
                itemPrice: result.item_price?.toString() || '0',
                customsCharge: result.customs_charge?.toString() || '0',
                receiveSource: 'tender',
                tenderReferenceNumber: result.tender_reference_number || '',
                customsServiceCharge: result.customs_service_charge?.toString() || '0',
                vatPercentage: result.vat_percentage?.toString() || '0',
                freightCharge: result.freight_charge?.toString() || '0',
                totalAmount: result.total_amount?.toString() || '0'
            });
            return acc;
        }, {} as Record<string, any>);
        const formattedResults = Object.values(groupedResults);
        logEvents(`Successfully fetched ${formattedResults.length} tender RRP records`, "tenderReceiveLog.log");
        res.status(200).json({
            data: formattedResults,
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
        logEvents(`Error fetching tender RRPs: ${errorMessage}`, "tenderReceiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'An error occurred while fetching tender RRPs'
        });
    }
};
