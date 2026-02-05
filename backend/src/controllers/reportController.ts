import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';
import { ExcelService, StockCardData } from '../services/excelService';
import { rebuildAllNacInventoryStates } from '../services/issueInventoryService';
import path from 'path';
import fs from 'fs';
import { normalizeEquipmentNumbers, processPartNumbers, processItemName } from '../utils/utils';
import { adToBs } from '../utils/dateConverter';
import { formatDate } from '../utils/dateUtils';
import ExcelJS from 'exceljs';
import { ReceiveRRPReportItem, ReceiveRRPReportResponse } from '../types/rrpReport';
import archiver from 'archiver';
export const getDailyIssueReport = async (req: Request, res: Response): Promise<void> => {
    const { fromDate, toDate, equipmentNumber, partNumber, nacCode, page = 1, limit = 10 } = req.query;
    const connection = await pool.getConnection();
    try {
        if (!fromDate || !toDate) {
            throw new Error('fromDate and toDate are required parameters');
        }
        const pageNum = Number(page);
        const limitNum = Number(limit);
        const offset = (pageNum - 1) * limitNum;
        let countQuery = `
      SELECT COUNT(*) as total
      FROM issue_details i
      WHERE i.issue_date BETWEEN ? AND ?
      AND i.approval_status = ?
    `;
        let dataQuery = `
      SELECT 
        i.id,
        i.issue_slip_number,
        i.issue_date,
        i.part_number,
        i.issued_for,
        i.issued_by,
        i.issue_quantity,
        i.issue_cost,
        i.remaining_balance,
        i.nac_code,
        SUBSTRING_INDEX(s.item_name, ',', 1) as item_name
      FROM issue_details i
      LEFT JOIN stock_details s ON i.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
      WHERE i.issue_date BETWEEN ? AND ?
      AND i.approval_status = ?
    `;
        const countParams = [String(fromDate), String(toDate), "APPROVED"];
        const dataParams = [String(fromDate), String(toDate), "APPROVED"];
        if (equipmentNumber) {
            countQuery += ` AND i.issued_for = ?`;
            dataQuery += ` AND i.issued_for = ?`;
            countParams.push(String(equipmentNumber));
            dataParams.push(String(equipmentNumber));
        }
        if (partNumber) {
            countQuery += ` AND i.part_number LIKE ?`;
            dataQuery += ` AND i.part_number LIKE ?`;
            countParams.push(`%${String(partNumber)}%`);
            dataParams.push(`%${String(partNumber)}%`);
        }
        if (nacCode) {
            countQuery += ` AND i.nac_code LIKE ?`;
            dataQuery += ` AND i.nac_code LIKE ?`;
            countParams.push(`%${String(nacCode)}%`);
            dataParams.push(`%${String(nacCode)}%`);
        }
        dataQuery += ` ORDER BY i.issue_date, i.id, i.issue_slip_number LIMIT ? OFFSET ?`;
        dataParams.push(String(limitNum), String(offset));
        const [totalResult] = await connection.execute<RowDataPacket[]>(countQuery, countParams);
        const [issues] = await connection.execute<RowDataPacket[]>(dataQuery, dataParams);
        const formattedIssues = issues.map(issue => {
            let issuedBy = issue.issued_by;
            try {
                issuedBy = JSON.parse(issue.issued_by);
            }
            catch (e) {
                issuedBy = issue.issued_by;
            }
            return {
                ...issue,
                issued_by: issuedBy
            };
        });
        res.status(200).json({
            message: 'Daily issue report generated successfully',
            issues: formattedIssues,
            total: totalResult[0].total
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getDailyIssueReport: ${errorMessage}`, "reportLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const exportDailyIssueReport = async (req: Request, res: Response): Promise<void> => {
    const { fromDate, toDate, equipmentNumber, partNumber, nacCode } = req.body;
    const connection = await pool.getConnection();
    try {
        if (!fromDate || !toDate) {
            throw new Error('fromDate and toDate are required parameters');
        }
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
        i.nac_code,
        SUBSTRING_INDEX(s.item_name, ',', 1) as item_name
      FROM issue_details i
      LEFT JOIN stock_details s ON i.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
      WHERE i.issue_date BETWEEN ? AND ?
      AND i.approval_status = ?
    `;
        const queryParams = [String(fromDate), String(toDate), "APPROVED"];
        if (equipmentNumber) {
            query += ` AND i.issued_for = ?`;
            queryParams.push(String(equipmentNumber));
        }
        if (partNumber) {
            query += ` AND i.part_number LIKE ?`;
            queryParams.push(`%${String(partNumber)}%`);
        }
        if (nacCode) {
            query += ` AND i.nac_code LIKE ?`;
            queryParams.push(`%${String(nacCode)}%`);
        }
        query += ` ORDER BY i.issue_date DESC, i.issue_slip_number`;
        const [issues] = await connection.execute<RowDataPacket[]>(query, queryParams);
        const formattedIssues = issues.map(issue => {
            let issuedBy = issue.issued_by;
            try {
                issuedBy = JSON.parse(issue.issued_by);
            }
            catch (e) {
                issuedBy = issue.issued_by;
            }
            return {
                ...issue,
                issued_by: issuedBy
            };
        });
        res.status(200).json({
            message: 'Daily issue report exported successfully',
            issues: formattedIssues
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in exportDailyIssueReport: ${errorMessage}`, "reportLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
interface StockCardRequest {
    fromDate?: string;
    toDate?: string;
    naccodes?: string[];
    generateByIssueDate: boolean;
    generateAll?: boolean;
    equipmentNumber?: string;
    equipmentNumberFrom?: string;
    equipmentNumberTo?: string;
    createdDateFrom?: string;
    createdDateTo?: string;
    nacCode?: string;
}
interface StockMovement {
    date: Date;
    reference: string;
    type: 'issue' | 'receive';
    quantity: number;
    amount: number;
    balance_quantity: number;
    balance_amount: number;
}
const hasTextValue = (value?: string | null): boolean => typeof value === 'string' && value.trim().length > 0;
const hasEquipmentNumberFilter = (filters: StockCardRequest): boolean => hasTextValue(filters.equipmentNumber);
const hasEquipmentRangeFilter = (filters: StockCardRequest): boolean => hasTextValue(filters.equipmentNumberFrom) && hasTextValue(filters.equipmentNumberTo);
const hasCreatedDateFilter = (filters: StockCardRequest): boolean => hasTextValue(filters.createdDateFrom) || hasTextValue(filters.createdDateTo);
const sanitizeEquipmentToken = (token: string): string => token.replace(/[^0-9a-z]/gi, '').toUpperCase();
const parseEquipmentNumericValue = (token?: string | null): number | null => {
    if (!token)
        return null;
    const digits = token.replace(/[^0-9]/g, '');
    if (!digits)
        return null;
    return parseInt(digits, 10);
};
const extractEquipmentTokens = (raw?: string | null): string[] => {
    if (!raw)
        return [];
    return raw
        .split(/[\s,;/|]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 0);
};
const matchesEquipmentNumber = (raw: string | null | undefined, target?: string): boolean => {
    if (!hasTextValue(target)) {
        return true;
    }
    const normalizedTarget = sanitizeEquipmentToken(String(target));
    if (!normalizedTarget) {
        return true;
    }
    const tokens = extractEquipmentTokens(raw);
    return tokens.some((token) => sanitizeEquipmentToken(token) === normalizedTarget);
};
const matchesEquipmentRange = (raw: string | null | undefined, from?: string, to?: string): boolean => {
    if (!hasTextValue(from) || !hasTextValue(to)) {
        return true;
    }
    const fromValue = parseEquipmentNumericValue(from);
    const toValue = parseEquipmentNumericValue(to);
    if (fromValue === null || toValue === null) {
        return true;
    }
    const lowerBound = Math.min(fromValue, toValue);
    const upperBound = Math.max(fromValue, toValue);
    const tokens = extractEquipmentTokens(raw);
    return tokens.some((token) => {
        const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
        if (rangeMatch) {
            const start = parseEquipmentNumericValue(rangeMatch[1]) ?? 0;
            const end = parseEquipmentNumericValue(rangeMatch[2]) ?? 0;
            return start <= upperBound && end >= lowerBound;
        }
        const numericValue = parseEquipmentNumericValue(token);
        return numericValue !== null && numericValue >= lowerBound && numericValue <= upperBound;
    });
};
const passesEquipmentAndCreatedFilters = (rawEquipment: string | null | undefined, createdAtValue: string | Date | null | undefined, filters: StockCardRequest): boolean => {
    if (!matchesEquipmentNumber(rawEquipment, filters.equipmentNumber)) {
        return false;
    }
    if (!matchesEquipmentRange(rawEquipment, filters.equipmentNumberFrom, filters.equipmentNumberTo)) {
        return false;
    }
    if (!hasCreatedDateFilter(filters)) {
        return true;
    }
    if (!createdAtValue) {
        return false;
    }
    const createdAt = createdAtValue instanceof Date ? createdAtValue : new Date(String(createdAtValue));
    if (filters.createdDateFrom) {
        const fromDate = new Date(filters.createdDateFrom);
        if (createdAt < fromDate) {
            return false;
        }
    }
    if (filters.createdDateTo) {
        const toDate = new Date(filters.createdDateTo);
        if (createdAt > toDate) {
            return false;
        }
    }
    return true;
};
const fetchNacCodesByFilters = async (connection: PoolConnection, filters: StockCardRequest): Promise<string[]> => {
    let query = `
    SELECT 
      nac_code,
      applicable_equipments,
      created_at
    FROM stock_details
    WHERE 1 = 1
  `;
    const params: (string)[] = [];
    if (filters.createdDateFrom) {
        query += ' AND DATE(created_at) >= DATE(?)';
        params.push(String(filters.createdDateFrom));
    }
    if (filters.createdDateTo) {
        query += ' AND DATE(created_at) <= DATE(?)';
        params.push(String(filters.createdDateTo));
    }
    if (hasEquipmentNumberFilter(filters)) {
        query += ' AND LOWER(COALESCE(applicable_equipments, "")) LIKE ?';
        params.push(`%${String(filters.equipmentNumber).toLowerCase()}%`);
    }
    const [rows] = await connection.execute<RowDataPacket[]>(query, params);
    return rows
        .filter((row) => passesEquipmentAndCreatedFilters(row.applicable_equipments, row.created_at, filters))
        .map((row) => row.nac_code)
        .filter((code): code is string => typeof code === 'string' && code.trim().length > 0);
};
const fetchAllNacCodes = async (connection: PoolConnection, filters: StockCardRequest): Promise<string[]> => {
    const dateConditions: string[] = [];
    const params: string[] = [];
    if (filters.createdDateFrom) {
        dateConditions.push('DATE(created_at) >= DATE(?)');
        params.push(String(filters.createdDateFrom));
    }
    if (filters.createdDateTo) {
        dateConditions.push('DATE(created_at) <= DATE(?)');
        params.push(String(filters.createdDateTo));
    }
    const dateClause = dateConditions.length ? `WHERE ${dateConditions.join(' AND ')}` : '';
    const [rows] = await connection.execute<RowDataPacket[]>(`
      SELECT nac_code, applicable_equipments, created_at
      FROM stock_details
      ${dateClause}
    `, params);
    return rows
        .filter((row) => passesEquipmentAndCreatedFilters(row.applicable_equipments, row.created_at, filters))
        .map((row) => row.nac_code)
        .filter((code): code is string => typeof code === 'string' && code.trim().length > 0);
};
const sanitizeNacCodes = (codes: (string | null | undefined)[]): string[] => Array.from(new Set(codes
    .filter((code): code is string => typeof code === 'string')
    .map((code) => code.trim())
    .filter((code) => code.length > 0)));
const fetchStockDetailsByCodes = async (connection: PoolConnection, targetNaccodes: string[], filters: StockCardRequest): Promise<(StockCardData & {
    created_at?: Date | string | null;
})[]> => {
    if (!targetNaccodes.length) {
        return [];
    }
    const dateConditions: string[] = [];
    const dateParams: string[] = [];
    if (filters.createdDateFrom) {
        dateConditions.push('DATE(s.created_at) >= DATE(?)');
        dateParams.push(String(filters.createdDateFrom));
    }
    if (filters.createdDateTo) {
        dateConditions.push('DATE(s.created_at) <= DATE(?)');
        dateParams.push(String(filters.createdDateTo));
    }
    const dateClause = dateConditions.length ? ` AND ${dateConditions.join(' AND ')}` : '';
    if (targetNaccodes.length === 1) {
        const searchPattern = `%${targetNaccodes[0].replace(/\s+/g, '%')}%`;
        const [results] = await connection.execute<(StockCardData & {
            created_at?: Date | string | null;
        })[]>(`
      SELECT 
        s.nac_code,
        s.item_name,
        s.part_numbers as part_number,
        s.applicable_equipments as equipment_number,
        s.location,
        s.card_number,
        s.open_quantity,
        s.open_amount,
        s.created_at
      FROM stock_details s
      WHERE s.nac_code LIKE ?
      ${dateClause}
    `, [searchPattern, ...dateParams]);
        return results;
    }
    const placeholders = targetNaccodes.map(() => '?').join(',');
    const [results] = await connection.execute<(StockCardData & {
        created_at?: Date | string | null;
    })[]>(`
    SELECT 
      s.nac_code,
      s.item_name,
      s.part_numbers as part_number,
      s.applicable_equipments as equipment_number,
      s.location,
      s.card_number,
      s.open_quantity,
      s.open_amount,
      s.created_at
    FROM stock_details s
    WHERE s.nac_code IN (${placeholders})
    ${dateClause}
  `, [...targetNaccodes, ...dateParams]);
    return results;
};
const resolveTargetNaccodes = async (connection: PoolConnection, payload: StockCardRequest): Promise<string[]> => {
    const { fromDate, toDate, naccodes, generateByIssueDate, generateAll = false, equipmentNumber, equipmentNumberFrom, equipmentNumberTo, createdDateFrom, createdDateTo, nacCode, } = payload;
    let targetNaccodes: string[] = nacCode ? [nacCode] : [];
    if (!targetNaccodes.length) {
        if (generateAll) {
            targetNaccodes = await fetchAllNacCodes(connection, payload);
        }
        else if (generateByIssueDate) {
            if (!fromDate || !toDate) {
                throw new Error('fromDate and toDate are required when generateByIssueDate is true');
            }
            const [uniqueNaccodes] = await connection.execute<RowDataPacket[]>(`
        SELECT DISTINCT nac_code 
        FROM issue_details 
        WHERE issue_date BETWEEN ? AND ?
        AND approval_status = ?
      `, [fromDate, toDate, 'APPROVED']);
            targetNaccodes = uniqueNaccodes
                .map((row) => row.nac_code)
                .filter((code): code is string => typeof code === 'string' && code.trim().length > 0);
        }
        else if (naccodes && naccodes.length > 0) {
            targetNaccodes = naccodes;
        }
    }
    const filterOptionsProvided = hasEquipmentNumberFilter(payload) ||
        hasEquipmentRangeFilter(payload) ||
        hasCreatedDateFilter(payload);
    if (!targetNaccodes.length && filterOptionsProvided) {
        targetNaccodes = await fetchNacCodesByFilters(connection, payload);
    }
    targetNaccodes = sanitizeNacCodes(targetNaccodes);
    if (!targetNaccodes.length) {
        throw new Error('No NAC codes found for the provided filters');
    }
    return targetNaccodes;
};
const prepareStockCardData = async (connection: PoolConnection, payload: StockCardRequest, overrideNaccodes?: string[]): Promise<(StockCardData & {
    movements: StockMovement[];
    openingBalanceDate: Date;
})[]> => {
    const { fromDate, toDate, naccodes, generateByIssueDate, generateAll = false, equipmentNumber, equipmentNumberFrom, equipmentNumberTo, createdDateFrom, createdDateTo, nacCode, } = payload;
    const targetNaccodes = overrideNaccodes && overrideNaccodes.length
        ? sanitizeNacCodes(overrideNaccodes)
        : await resolveTargetNaccodes(connection, payload);
    const stockDetailsRaw = await fetchStockDetailsByCodes(connection, targetNaccodes, payload);
    let stockDetails = stockDetailsRaw.filter((stock) => passesEquipmentAndCreatedFilters(stock.equipment_number, stock.created_at ?? null, payload));
    if (!stockDetails.length) {
        throw new Error('No stock details found for the provided filters');
    }
    for (const stock of stockDetails) {
        const rawEquipmentNumbers = stock.equipment_number;
        stock.equipment_number = normalizeEquipmentNumbers(stock.equipment_number);
        const { primary, secondary } = processPartNumbers(stock.part_number);
        (stock as any).primary_part_number = primary;
        (stock as any).secondary_part_numbers = secondary;
        stock.item_name = processItemName(stock.item_name);
        let openingBalanceQty = stock.open_quantity;
        let openingBalanceAmt = stock.open_amount;
        let openingBalanceDate: Date;
        let totalReceiveQty = 0;
        let totalReceiveAmt = 0;
        if (fromDate && !generateByIssueDate) {
            openingBalanceDate = new Date(String(fromDate));
            openingBalanceDate.setDate(openingBalanceDate.getDate() - 1);
            if (stock.nac_code === 'GT 00000') {
                const [preDateReceives] = await connection.execute<RowDataPacket[]>(`SELECT 
              COALESCE(SUM(transaction_quantity), 0) as total_quantity
            FROM transaction_details
            WHERE transaction_type = 'purchase'
              AND transaction_status = 'confirmed'
              AND DATE(transaction_date) < DATE(?)
          `, [fromDate]);
                totalReceiveQty = Number(preDateReceives[0]?.total_quantity) || 0;
                totalReceiveAmt = 0;
            }
            else {
                const [preDateReceives] = await connection.execute<RowDataPacket[]>(`SELECT 
              COALESCE(SUM(rd.received_quantity), 0) as total_quantity,
              COALESCE(SUM(rrp.total_amount), 0) as total_amount
            FROM receive_details rd
            JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
            WHERE rd.nac_code = ?
            AND rd.approval_status = 'APPROVED'
            AND DATE(rd.receive_date) < DATE(?)
          `, [stock.nac_code, fromDate]);
                totalReceiveQty = Number(preDateReceives[0]?.total_quantity) || 0;
                totalReceiveAmt = Number(preDateReceives[0]?.total_amount) || 0;
            }
            const [preDateIssues] = await connection.execute<RowDataPacket[]>(`SELECT 
            COALESCE(SUM(issue_quantity), 0) as total_quantity,
            COALESCE(SUM(issue_cost), 0) as total_amount
          FROM issue_details
          WHERE nac_code = ?
          AND approval_status = 'APPROVED'
          AND DATE(issue_date) < DATE(?)
        `, [stock.nac_code, fromDate]);
            const totalIssueQty = Number(preDateIssues[0]?.total_quantity) || 0;
            const totalIssueAmt = Number(preDateIssues[0]?.total_amount) || 0;
            openingBalanceQty =
                (typeof stock.open_quantity === 'string'
                    ? Number(stock.open_quantity)
                    : Number(stock.open_quantity) || 0) +
                    totalReceiveQty -
                    totalIssueQty;
            openingBalanceAmt =
                (typeof stock.open_amount === 'string'
                    ? parseFloat(stock.open_amount)
                    : stock.open_amount || 0) +
                    totalReceiveAmt -
                    totalIssueAmt;
        }
        else {
            openingBalanceDate = new Date('2025-07-17');
        }
        stock.open_quantity = openingBalanceQty;
        stock.open_amount = openingBalanceAmt;
        const issueQueryParams: (string | number)[] = [stock.nac_code];
        let issueDateClause = '';
        if (!generateByIssueDate && fromDate && toDate) {
            issueDateClause = 'AND issue_date BETWEEN ? AND ?';
            issueQueryParams.push(fromDate, toDate);
        }
        const [issueRecords] = await connection.execute<RowDataPacket[]>(`SELECT 
          DATE_FORMAT(issue_date, '%Y-%m-%d') as date,
          issue_slip_number as reference,
          issue_quantity as quantity,
          issue_cost as amount,
          issued_for
        FROM issue_details
        WHERE nac_code = ?
        AND approval_status = 'APPROVED'
        ${issueDateClause}
        ORDER BY issue_date ASC
      `, issueQueryParams);
        let receiveRecords: RowDataPacket[];
        if (stock.nac_code === 'GT 00000') {
            const receiveParams: (string | number)[] = [];
            let receiveDateClause = '';
            if (!generateByIssueDate && fromDate && toDate) {
                receiveDateClause = 'AND transaction_date BETWEEN ? AND ?';
                receiveParams.push(fromDate, toDate);
            }
            const [gtReceiveRecords] = await connection.execute<RowDataPacket[]>(`SELECT 
            transaction_date as date,
            transaction_quantity as quantity,
            0 as total_amount,
            id as reference
          FROM transaction_details
          WHERE transaction_type = 'purchase'
            AND transaction_status = 'confirmed'
            ${receiveDateClause}
          ORDER BY transaction_date ASC
        `, receiveParams);
            receiveRecords = gtReceiveRecords;
        }
        else {
            const receiveParams: (string | number)[] = [stock.nac_code];
            let receiveDateClause = '';
            if (!generateByIssueDate && fromDate && toDate) {
                receiveDateClause = 'AND rd.receive_date BETWEEN ? AND ?';
                receiveParams.push(fromDate, toDate);
            }
            const [normalReceiveRecords] = await connection.execute<RowDataPacket[]>(`SELECT 
            DATE_FORMAT(rd.receive_date, '%Y-%m-%d') as date,
            rd.rrp_fk,
            rd.received_quantity as quantity,
            rd.unit,
            rrp.total_amount,
            rrp.rrp_number as reference
          FROM receive_details rd
          JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
          WHERE rd.nac_code = ?
          AND rd.approval_status = 'APPROVED'
          ${receiveDateClause}
          ORDER BY rd.receive_date ASC
        `, receiveParams);
            receiveRecords = normalReceiveRecords;
        }
        let movements: StockMovement[] = [
            ...issueRecords.map((record) => {
                const dateObj = record.date instanceof Date
                    ? record.date
                    : typeof record.date === 'string'
                        ? new Date(record.date)
                        : new Date('Invalid');
                return {
                    date: dateObj,
                    reference: record.reference,
                    type: 'issue' as const,
                    quantity: record.quantity,
                    amount: record.amount,
                    balance_quantity: 0,
                    balance_amount: 0,
                    equipment_number: record.issued_for,
                };
            }),
            ...receiveRecords.map((record) => {
                const dateObj = record.date instanceof Date
                    ? record.date
                    : typeof record.date === 'string'
                        ? new Date(record.date)
                        : new Date('Invalid');
                return {
                    date: dateObj,
                    reference: record.reference,
                    type: 'receive' as const,
                    quantity: record.quantity,
                    amount: record.total_amount,
                    balance_quantity: 0,
                    balance_amount: 0,
                };
            }),
        ];
        if (rawEquipmentNumbers && rawEquipmentNumbers.toLowerCase().includes('consumable')) {
            const aggregatedMovements: StockMovement[] = [];
            const dateMap = new Map<string, StockMovement>();
            movements
                .filter((m) => m.type === 'receive')
                .forEach((movement) => {
                aggregatedMovements.push(movement);
            });
            movements
                .filter((m) => m.type === 'issue')
                .forEach((movement) => {
                const dateKey = movement.date.toISOString().split('T')[0];
                if (dateMap.has(dateKey)) {
                    const existing = dateMap.get(dateKey)!;
                    existing.quantity += movement.quantity;
                    existing.amount += movement.amount;
                    existing.reference = existing.reference || movement.reference;
                }
                else {
                    dateMap.set(dateKey, { ...movement });
                }
            });
            aggregatedMovements.push(...Array.from(dateMap.values()));
            movements = aggregatedMovements.sort((a, b) => a.date.getTime() - b.date.getTime());
        }
        let balanceQty = openingBalanceQty;
        let balanceAmt = openingBalanceAmt;
        movements.forEach((movement) => {
            if (movement.type === 'receive') {
                balanceQty += movement.quantity;
                balanceAmt += movement.amount;
            }
            else {
                balanceQty -= movement.quantity;
                balanceAmt -= movement.amount;
            }
            movement.balance_quantity = balanceQty;
            movement.balance_amount = balanceAmt;
        });
        (stock as any).movements = movements;
        (stock as any).openingBalanceDate = openingBalanceDate;
    }
    return stockDetails as (StockCardData & {
        movements: StockMovement[];
        openingBalanceDate: Date;
    })[];
};
export const generateStockCardReport = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const filters = req.body as StockCardRequest;
        const templatePath = path.join(__dirname, '../../public/templates/template_file.xlsx');
        if (filters.generateAll) {
            const targetNaccodes = await resolveTargetNaccodes(connection, filters);
            const batchSize = Number(process.env.STOCK_CARD_BATCH_SIZE || 25);
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', 'attachment; filename=stock_card_report.zip');
            const archive = archiver('zip', { zlib: { level: 9 } });
            archive.on('error', (archiveErr: Error) => {
                throw archiveErr;
            });
            archive.pipe(res);
            for (let index = 0; index < targetNaccodes.length; index += batchSize) {
                const batchCodes = targetNaccodes.slice(index, index + batchSize);
                const batchData = await prepareStockCardData(connection, filters, batchCodes);
                const batchBufferRaw = await ExcelService.generateStockCardExcel(batchData, templatePath);
                const batchBuffer = Buffer.isBuffer(batchBufferRaw)
                    ? batchBufferRaw
                    : Buffer.from(batchBufferRaw);
                archive.append(batchBuffer, {
                    name: `stock_cards_part_${Math.floor(index / batchSize) + 1}.xlsx`,
                });
            }
            await archive.finalize();
            return;
        }
        const stockDetails = await prepareStockCardData(connection, filters);
        const excelBuffer = await ExcelService.generateStockCardExcel(stockDetails, templatePath);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=stock_card_report.xlsx');
        res.send(excelBuffer);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in generateStockCardReport: ${errorMessage}`, "reportLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const previewStockCard = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const filters = req.body as StockCardRequest;
        const targetNac = filters.nacCode || (filters.naccodes && filters.naccodes[0]);
        if (!targetNac) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'nacCode is required for preview',
            });
            return;
        }
        const stockDetails = await prepareStockCardData(connection, filters, [targetNac]);
        if (!stockDetails.length) {
            throw new Error('No stock details found for preview');
        }
        const stock = stockDetails[0];
        const movements = ((stock as any).movements as StockMovement[]).map((movement) => ({
            ...movement,
            date: movement.date instanceof Date ? movement.date.toISOString() : movement.date,
        }));
        res.status(200).json({
            stock: {
                nac_code: stock.nac_code,
                item_name: stock.item_name,
                part_number: stock.part_number,
                equipment_number: stock.equipment_number,
                location: stock.location,
                card_number: stock.card_number,
                open_quantity: stock.open_quantity,
                open_amount: stock.open_amount,
                openingBalanceDate: (stock as any).openingBalanceDate instanceof Date
                    ? (stock as any).openingBalanceDate.toISOString()
                    : (stock as any).openingBalanceDate,
                movements,
            },
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in previewStockCard: ${errorMessage}`, 'reportLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage,
        });
    }
    finally {
        connection.release();
    }
};
export const checkFlightCount = async (req: Request, res: Response): Promise<void> => {
    const { start_date, end_date } = req.query;
    const connection = await pool.getConnection();
    try {
        const [result] = await connection.query<RowDataPacket[]>(`SELECT COUNT(*) as count 
       FROM fuel_records f
       JOIN issue_details i ON f.issue_fk = i.id
       WHERE f.fuel_type = 'Diesel'
       AND i.issue_date BETWEEN ? AND ?
       AND f.number_of_flights IS NOT NULL`, [start_date, end_date]);
        res.status(200).json({
            has_flight_count: result[0].count > 0
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error checking flight count: ${errorMessage}`, "fuelLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while checking flight count'
        });
    }
    finally {
        connection.release();
    }
};
export const getWeeklyDieselSummary = async (req: Request, res: Response): Promise<void> => {
    const { start_date, end_date } = req.query;
    const connection = await pool.getConnection();
    try {
        if (!start_date || !end_date) {
            res.status(400).json({ message: 'start_date and end_date are required' });
            return;
        }
        const [weekData] = await connection.query<RowDataPacket[]>(`SELECT 
        MAX(f.week_number) as week_number,
        MAX(f.number_of_flights) as number_of_flights,
        SUM(i.issue_quantity) as total_quantity,
        SUM(i.issue_quantity * f.fuel_price) as total_cost
       FROM fuel_records f
       JOIN issue_details i ON f.issue_fk = i.id
       WHERE f.fuel_type = 'diesel'
       AND i.issue_date BETWEEN ? AND ?
       AND i.approval_status = 'APPROVED'`, [start_date, end_date]);
        const currentWeek = weekData[0]?.week_number || 0;
        const previousWeek = currentWeek > 0 ? currentWeek - 1 : 0;
        const [previousWeekData] = await connection.query<RowDataPacket[]>(`SELECT 
        MAX(f.week_number) as week_number,
        MAX(f.number_of_flights) as number_of_flights,
        SUM(i.issue_quantity) as total_quantity,
        SUM(i.issue_quantity * f.fuel_price) as total_cost
       FROM fuel_records f
       JOIN issue_details i ON f.issue_fk = i.id
       WHERE f.fuel_type = 'diesel'
       AND f.week_number = ?
       AND i.approval_status = 'APPROVED'`, [previousWeek]);
        const currentWeekData = weekData[0] || { total_quantity: 0, total_cost: 0, number_of_flights: 0 };
        const prevWeekData = previousWeekData[0] || { total_quantity: 0, total_cost: 0, number_of_flights: 0 };
        res.status(200).json({
            prevWeekLabel: `Week ${previousWeek}`,
            currentWeekLabel: `Week ${currentWeek}`,
            prev: {
                flights: Number(prevWeekData.number_of_flights) || 0,
                liters: Number(prevWeekData.total_quantity) || 0,
                cost: Number(prevWeekData.total_cost) || 0,
            },
            current: {
                flights: Number(currentWeekData.number_of_flights) || 0,
                liters: Number(currentWeekData.total_quantity) || 0,
                cost: Number(currentWeekData.total_cost) || 0,
            },
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error retrieving weekly diesel summary: ${errorMessage}`, 'fuelLog.log');
        res.status(500).json({
            message: 'Failed to get weekly diesel summary',
        });
    }
    finally {
        connection.release();
    }
};
export const generateWeeklyDieselReport = async (req: Request, res: Response): Promise<void> => {
    const { start_date, end_date, flight_count } = req.query;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [equipmentRows] = await connection.query<RowDataPacket[]>(`SELECT equipment_code FROM fuel_valid_equipments WHERE fuel_type = 'diesel' AND is_active = 1`);
        let rawEquipmentList: string[] = equipmentRows.map((row: any) => String(row.equipment_code).trim()).filter(Boolean);
        if (rawEquipmentList.length === 0) {
            const [configResult] = await connection.query<RowDataPacket[]>('SELECT config_value FROM app_config WHERE config_name = ? AND config_type = "fuel"', ['valid_equipment_list_diesel']);
            if (configResult.length === 0) {
                throw new Error('Valid equipment list configuration not found');
            }
            rawEquipmentList = configResult[0].config_value
                .replace(/\r\n/g, '')
                .split(',')
                .map((item: string) => item.trim())
                .filter((item: string) => item && !item.includes(' '));
        }
        const equipmentList = rawEquipmentList.sort((a: string, b: string) => {
            const aMatch = a.match(/^(\d+)T/);
            const bMatch = b.match(/^(\d+)T/);
            if (aMatch && bMatch) {
                const aNum = parseInt(aMatch[1]);
                const bNum = parseInt(bMatch[1]);
                return aNum - bNum;
            }
            const aIsPureAlpha = /^[A-Za-z]+$/.test(a);
            const bIsPureAlpha = /^[A-Za-z]+$/.test(b);
            if (aIsPureAlpha && bIsPureAlpha) {
                return a.localeCompare(b);
            }
            if (aIsPureAlpha && !bIsPureAlpha) {
                return 1;
            }
            if (!aIsPureAlpha && bIsPureAlpha) {
                return -1;
            }
            const aNum = parseInt(a);
            const bNum = parseInt(b);
            if (!isNaN(aNum) && !isNaN(bNum)) {
                return aNum - bNum;
            }
            return a.localeCompare(b);
        });
        const flightCount = flight_count;
        if (flightCount !== undefined && flightCount !== null) {
            await connection.query(`UPDATE fuel_records f
         JOIN issue_details i ON f.issue_fk = i.id
         SET f.number_of_flights = ?
         WHERE f.fuel_type = 'diesel'
         AND i.issue_date BETWEEN ? AND ?
         AND i.approval_status = 'APPROVED'`, [flightCount, start_date, end_date]);
        }
        const [fuelRecords] = await connection.query<RowDataPacket[]>(`SELECT 
        DATE(i.issue_date) as date,
        DAYNAME(i.issue_date) as day_name,
        i.issued_for,
        f.fuel_price,
        MAX(f.week_number) as week_number,
        SUM(i.issue_quantity) as issue_quantity,
        MAX(f.kilometers) as kilometers,
        SUM(i.issue_quantity * f.fuel_price) as daily_cost
       FROM fuel_records f
       JOIN issue_details i ON f.issue_fk = i.id
       WHERE f.fuel_type = 'diesel' 
      AND i.issue_date BETWEEN ? AND ?
      AND i.approval_status = 'APPROVED'
      GROUP BY DATE(i.issue_date), DAYNAME(i.issue_date), i.issued_for, f.fuel_price
      ORDER BY date, i.issued_for`, [start_date, end_date]);
        interface EquipmentData {
            quantity: number;
            kilometers: number;
            cost: number;
        }
        interface DailyData {
            date: string;
            day_name: string;
            fuel_price: number;
            equipmentData: Map<string, EquipmentData>;
        }
        interface EquipmentTotal {
            totalQuantity: number;
            totalCost: number;
        }
        interface ProcessedData {
            dailyData: Map<string, DailyData>;
            equipmentTotals: Map<string, EquipmentTotal>;
            grandTotal: {
                quantity: number;
                cost: number;
            };
        }
        const processedData: ProcessedData = {
            dailyData: new Map(),
            equipmentTotals: new Map(),
            grandTotal: {
                quantity: 0,
                cost: 0
            }
        };
        fuelRecords.forEach(record => {
            const dateKey = record.date;
            if (!processedData.dailyData.has(dateKey)) {
                processedData.dailyData.set(dateKey, {
                    date: record.date,
                    day_name: record.day_name,
                    fuel_price: record.fuel_price,
                    equipmentData: new Map()
                });
            }
        });
        fuelRecords.forEach(record => {
            const dateKey = record.date;
            const dailyData = processedData.dailyData.get(dateKey);
            if (!dailyData)
                return;
            const equipment = record.issued_for;
            if (!dailyData.equipmentData.has(equipment)) {
                dailyData.equipmentData.set(equipment, {
                    quantity: 0,
                    kilometers: 0,
                    cost: 0
                });
            }
            const equipmentData = dailyData.equipmentData.get(equipment);
            if (!equipmentData)
                return;
            equipmentData.quantity += record.issue_quantity;
            equipmentData.kilometers = Math.max(equipmentData.kilometers, record.kilometers || 0);
            equipmentData.cost += record.daily_cost;
            if (!processedData.equipmentTotals.has(equipment)) {
                processedData.equipmentTotals.set(equipment, {
                    totalQuantity: 0,
                    totalCost: 0
                });
            }
            const equipmentTotal = processedData.equipmentTotals.get(equipment);
            if (!equipmentTotal)
                return;
            equipmentTotal.totalQuantity += record.issue_quantity;
            equipmentTotal.totalCost += record.daily_cost;
            processedData.grandTotal.quantity += record.issue_quantity;
            processedData.grandTotal.cost += record.daily_cost;
        });
        const templatePath = path.join(__dirname, '../../public/templates/template_file.xlsx');
        const tempDir = path.join(__dirname, '../../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        const filename = `Diesel_Weekly_Report_${start_date}_to_${end_date}.xlsx`;
        const outputPath = path.join(tempDir, filename);
        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(templatePath);
            const sheet = workbook.getWorksheet('Diesel Weekly Template');
            if (!sheet) {
                throw new Error('Diesel Weekly Template sheet not found');
            }
            const startBsStr = adToBs(String(start_date));
            const endBsStr = adToBs(String(end_date));
            sheet.getCell('H5').value = `${startBsStr} to ${endBsStr} (${start_date} to ${end_date})`;
            const [weekData] = await connection.query<RowDataPacket[]>(`SELECT 
          MAX(f.week_number) as week_number,
          MAX(f.number_of_flights) as number_of_flights,
          SUM(i.issue_quantity) as total_quantity,
          SUM(i.issue_quantity * f.fuel_price) as total_cost
         FROM fuel_records f
         JOIN issue_details i ON f.issue_fk = i.id
         WHERE f.fuel_type = 'diesel'
         AND i.issue_date BETWEEN ? AND ?
         AND i.approval_status = 'APPROVED'`, [start_date, end_date]);
            const currentWeek = weekData[0]?.week_number || 0;
            const previousWeek = currentWeek - 1;
            const [previousWeekData] = await connection.query<RowDataPacket[]>(`SELECT 
          MAX(f.week_number) as week_number,
          MAX(f.number_of_flights) as number_of_flights,
          SUM(i.issue_quantity) as total_quantity,
          SUM(i.issue_quantity * f.fuel_price) as total_cost
         FROM fuel_records f
         JOIN issue_details i ON f.issue_fk = i.id
         WHERE f.fuel_type = 'diesel'
         AND f.week_number = ?
         AND i.approval_status = 'APPROVED'`, [previousWeek]);
            const currentWeekData = weekData[0] || { total_quantity: 0, total_cost: 0, number_of_flights: 0 };
            const prevWeekData = previousWeekData[0] || { total_quantity: 0, total_cost: 0, number_of_flights: 0 };
            const quantityDiff = Math.abs(currentWeekData.total_quantity - prevWeekData.total_quantity);
            const flightsDiff = Math.abs(currentWeekData.number_of_flights - prevWeekData.number_of_flights);
            const costDiff = Math.abs(currentWeekData.total_cost - prevWeekData.total_cost);
            if (currentWeek) {
                sheet.getCell('R4').value = currentWeek;
            }
            const today = new Date().toISOString().split('T')[0];
            sheet.getCell('R5').value = today;
            const dateColumns = ['C', 'E', 'G', 'I', 'K', 'M', 'O'];
            const dateData = new Map();
            const formatDate = (dateStr: string) => {
                const date = new Date(dateStr);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };
            const allDates = [];
            const start = new Date(String(start_date));
            const end = new Date(String(end_date));
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                allDates.push(formatDate(d.toISOString()));
            }
            allDates.forEach(date => {
                dateData.set(date, {
                    day_name: new Date(date).toLocaleDateString('en-US', { weekday: 'long' }),
                    fuel_price: null,
                    equipmentData: new Map()
                });
            });
            fuelRecords.forEach(record => {
                const dateKey = formatDate(record.date);
                if (dateData.has(dateKey)) {
                    const dateInfo = dateData.get(dateKey);
                    dateInfo.fuel_price = record.fuel_price;
                    if (!dateInfo.equipmentData.has(record.issued_for)) {
                        dateInfo.equipmentData.set(record.issued_for, {
                            quantity: null,
                            kilometers: null,
                            cost: 0
                        });
                    }
                    const equipmentData = dateInfo.equipmentData.get(record.issued_for);
                    equipmentData.quantity = (equipmentData.quantity || 0) + record.issue_quantity;
                    if (record.kilometers !== null && record.kilometers !== undefined) {
                        equipmentData.kilometers = Number(record.kilometers);
                    }
                    equipmentData.cost += record.daily_cost;
                }
            });
            allDates.forEach(date => {
                const dateInfo = dateData.get(date);
                if (dateInfo) {
                    const orderedEquipmentData = new Map();
                    equipmentList.forEach((equipment: string) => {
                        if (dateInfo.equipmentData.has(equipment)) {
                            orderedEquipmentData.set(equipment, dateInfo.equipmentData.get(equipment));
                        }
                        else {
                            orderedEquipmentData.set(equipment, {
                                quantity: null,
                                kilometers: null,
                                cost: 0
                            });
                        }
                    });
                    dateInfo.equipmentData = orderedEquipmentData;
                }
            });
            allDates.forEach((date, index) => {
                if (index < 7) {
                    const col = dateColumns[index];
                    const data = dateData.get(date);
                    const nepaliDate = adToBs(date);
                    sheet.getCell(`${col}6`).value = `${data.day_name}           (${nepaliDate})`;
                }
            });
            let lastPrice: number | null = null;
            allDates.forEach((date, index) => {
                if (index < 7) {
                    const col = dateColumns[index];
                    const data = dateData.get(date);
                    let priceToUse = data.fuel_price;
                    if (priceToUse === null || priceToUse === undefined) {
                        priceToUse = lastPrice;
                    }
                    else {
                        lastPrice = priceToUse;
                    }
                    if (priceToUse !== null && priceToUse !== undefined) {
                        sheet.getCell(`${col}8`).value = priceToUse;
                    }
                }
            });
            const templateRowIndex = 10;
            const templateRow = sheet.getRow(templateRowIndex);
            let currentRowIndex = templateRowIndex;
            const dailyTotals = new Map();
            allDates.forEach(date => {
                dailyTotals.set(date, { quantity: 0, cost: 0 });
            });
            for (let i = 0; i < equipmentList.length; i++) {
                const equipment = equipmentList[i];
                let totalQuantity = 0;
                let totalCost = 0;
                if (i > 0) {
                    currentRowIndex++;
                    sheet.insertRow(currentRowIndex, []);
                    const newRow = sheet.getRow(currentRowIndex);
                    newRow.height = templateRow.height || 15;
                    newRow.hidden = templateRow.hidden || false;
                    newRow.outlineLevel = templateRow.outlineLevel || 0;
                    templateRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                        const newCell = newRow.getCell(colNumber);
                        if (cell.style) {
                            newCell.style = cell.style;
                        }
                        if (cell.border) {
                            newCell.border = cell.border;
                        }
                        if (cell.font)
                            newCell.font = cell.font;
                        if (cell.alignment)
                            newCell.alignment = cell.alignment;
                        if (cell.fill)
                            newCell.fill = cell.fill;
                        if (cell.numFmt)
                            newCell.numFmt = cell.numFmt;
                        if (cell.protection)
                            newCell.protection = cell.protection;
                    });
                }
                const row = currentRowIndex;
                const aCell = sheet.getCell(`A${row}`);
                const templateACell = templateRow.getCell(1);
                const templateABorder = templateACell.border;
                const currentABorder = aCell.border;
                aCell.value = i + 1;
                if (templateABorder &&
                    (templateABorder.top || templateABorder.left || templateABorder.bottom || templateABorder.right)) {
                    aCell.border = templateABorder;
                }
                else if (currentABorder &&
                    (currentABorder.top || currentABorder.left || currentABorder.bottom || currentABorder.right)) {
                    aCell.border = currentABorder;
                }
                else {
                    aCell.border = {
                        top: { style: 'thin', color: { argb: 'FF000000' } },
                        left: { style: 'thin', color: { argb: 'FF000000' } },
                        bottom: { style: 'thin', color: { argb: 'FF000000' } },
                        right: { style: 'thin', color: { argb: 'FF000000' } }
                    };
                }
                if (templateACell.font)
                    aCell.font = templateACell.font;
                if (templateACell.fill)
                    aCell.fill = templateACell.fill;
                if (templateACell.alignment)
                    aCell.alignment = templateACell.alignment;
                if (templateACell.numFmt)
                    aCell.numFmt = templateACell.numFmt;
                const bCell = sheet.getCell(`B${row}`);
                const templateBCell = templateRow.getCell(2);
                const templateBorder = templateBCell.border;
                const currentBorder = bCell.border;
                bCell.value = equipment;
                if (templateBorder &&
                    (templateBorder.top || templateBorder.left || templateBorder.bottom || templateBorder.right)) {
                    bCell.border = templateBorder;
                }
                else if (currentBorder &&
                    (currentBorder.top || currentBorder.left || currentBorder.bottom || currentBorder.right)) {
                    bCell.border = currentBorder;
                }
                else {
                    bCell.border = {
                        top: { style: 'thin', color: { argb: 'FF000000' } },
                        left: { style: 'thin', color: { argb: 'FF000000' } },
                        bottom: { style: 'thin', color: { argb: 'FF000000' } },
                        right: { style: 'thin', color: { argb: 'FF000000' } }
                    };
                }
                if (templateBCell.font)
                    bCell.font = templateBCell.font;
                if (templateBCell.fill)
                    bCell.fill = templateBCell.fill;
                if (templateBCell.alignment)
                    bCell.alignment = templateBCell.alignment;
                if (templateBCell.numFmt)
                    bCell.numFmt = templateBCell.numFmt;
                allDates.forEach((date, index) => {
                    if (index < 7) {
                        const col = dateColumns[index];
                        const data = dateData.get(date);
                        const equipmentData = data.equipmentData.get(equipment) || { quantity: null, kilometers: null, cost: 0 };
                        if (equipmentData.quantity !== null) {
                            sheet.getCell(`${col}${row}`).value = equipmentData.quantity;
                            totalQuantity += equipmentData.quantity;
                            dailyTotals.get(date).quantity += equipmentData.quantity;
                        }
                        if (equipmentData.kilometers !== null && equipmentData.kilometers !== undefined) {
                            const kmCol = String.fromCharCode(col.charCodeAt(0) + 1);
                            const kmCell = sheet.getCell(`${kmCol}${row}`);
                            kmCell.value = Number(equipmentData.kilometers);
                            kmCell.numFmt = '#,##0';
                        }
                        if (equipmentData.cost !== 0) {
                            totalCost += equipmentData.cost;
                            dailyTotals.get(date).cost += equipmentData.cost;
                        }
                    }
                });
                sheet.getCell(`Q${row}`).value = totalQuantity;
                sheet.getCell(`R${row}`).value = totalCost;
            }
            const lastEquipmentRow = currentRowIndex;
            const dailyTotalsQuantityRow = lastEquipmentRow + 2;
            const dailyTotalsCostRow = dailyTotalsQuantityRow + 1;
            allDates.forEach((date, index) => {
                if (index < 7) {
                    const col = dateColumns[index];
                    const totals = dailyTotals.get(date);
                    sheet.getCell(`${col}${dailyTotalsQuantityRow}`).value = totals.quantity;
                    sheet.getCell(`${col}${dailyTotalsCostRow}`).value = totals.cost;
                }
            });
            const grandTotalQuantity = Array.from(dailyTotals.values()).reduce((sum, day) => sum + day.quantity, 0);
            const grandTotalCost = Array.from(dailyTotals.values()).reduce((sum, day) => sum + day.cost, 0);
            sheet.getCell(`R${dailyTotalsQuantityRow}`).value = grandTotalQuantity;
            sheet.getCell(`R${dailyTotalsCostRow}`).value = grandTotalCost;
            const analysisBaseRow = dailyTotalsCostRow + 4;
            const rowPrevWeekQty = analysisBaseRow;
            const rowCurrWeekQty = analysisBaseRow + 1;
            const rowQtyDiff = analysisBaseRow + 2;
            const rowPrevWeekFlights = analysisBaseRow + 6;
            const rowCurrWeekFlights = analysisBaseRow + 7;
            const rowFlightsDiff = analysisBaseRow + 8;
            const rowPrevWeekCost = analysisBaseRow + 11;
            const rowCurrWeekCost = analysisBaseRow + 12;
            const rowCostDiff = analysisBaseRow + 13;
            sheet.getCell(`B${rowPrevWeekQty}`).value = `Previous Week (Week ${previousWeek}) Consumption (in Ltrs)`;
            sheet.getCell(`B${rowCurrWeekQty}`).value = `Current Week (Week ${currentWeek}) Consumption (in Ltrs)`;
            sheet.getCell(`B${rowPrevWeekFlights}`).value = `Total number of flights handled in Week ${previousWeek}`;
            sheet.getCell(`B${rowCurrWeekFlights}`).value = `Total number of flights handled in Week ${currentWeek}`;
            sheet.getCell(`B${rowPrevWeekCost}`).value = `Total cost of diesel issued in Week ${previousWeek}`;
            sheet.getCell(`B${rowCurrWeekCost}`).value = `Total cost of diesel issued in Week ${currentWeek}`;
            sheet.getCell(`F${rowPrevWeekQty}`).value = prevWeekData.total_quantity;
            sheet.getCell(`F${rowCurrWeekQty}`).value = currentWeekData.total_quantity;
            sheet.getCell(`F${rowQtyDiff}`).value = quantityDiff;
            sheet.getCell(`F${rowPrevWeekFlights}`).value = prevWeekData.number_of_flights;
            sheet.getCell(`F${rowCurrWeekFlights}`).value = currentWeekData.number_of_flights;
            sheet.getCell(`F${rowFlightsDiff}`).value = flightsDiff;
            sheet.getCell(`F${rowPrevWeekCost}`).value = prevWeekData.total_cost;
            sheet.getCell(`F${rowCurrWeekCost}`).value = currentWeekData.total_cost;
            sheet.getCell(`F${rowCostDiff}`).value = costDiff;
            if (currentWeekData.total_quantity !== prevWeekData.total_quantity) {
                sheet.getCell(`I${rowQtyDiff}`).value =
                    currentWeekData.total_quantity > prevWeekData.total_quantity
                        ? 'Increase in fuel consumption'
                        : 'Decrease in fuel consumption';
            }
            else {
                sheet.getCell(`I${rowQtyDiff}`).value = 'No change in fuel consumption';
            }
            if (currentWeekData.number_of_flights !== prevWeekData.number_of_flights) {
                sheet.getCell(`I${rowFlightsDiff}`).value =
                    currentWeekData.number_of_flights > prevWeekData.number_of_flights
                        ? 'Increase in flight frequency this week'
                        : 'Decrease in flight frequency this week';
            }
            else {
                sheet.getCell(`I${rowFlightsDiff}`).value = 'No change in flight frequency';
            }
            if (currentWeekData.total_cost !== prevWeekData.total_cost) {
                sheet.getCell(`I${rowCostDiff}`).value =
                    currentWeekData.total_cost > prevWeekData.total_cost
                        ? 'Increase in total cost this week'
                        : 'Decrease in total cost this week';
            }
            else {
                sheet.getCell(`I${rowCostDiff}`).value = 'No change in total cost';
            }
            const chartsStartRow = rowCostDiff + 4;
            const secondChartRow = chartsStartRow + 13;
            const lastChartVisualEndRow = secondChartRow + 13;
            const authorityStartRow = lastChartVisualEndRow + 6;
            const [authorityRows] = await connection.query<RowDataPacket[]>('SELECT level_1_authority_name, level_1_authority_staffid, level_1_authority_designation, ' +
                'level_2_authority_name, level_2_authority_staffid, level_2_authority_designation, ' +
                'level_3_authority_name, level_3_authority_staffid, level_3_authority_designation ' +
                'FROM authority_details WHERE authority_type = ? ORDER BY id DESC LIMIT 1', ['fuel']);
            if ((authorityRows as RowDataPacket[]).length > 0) {
                const auth = (authorityRows as RowDataPacket[])[0];
                sheet.getCell(`A${authorityStartRow}`).value = 'Prepared By:';
                sheet.getCell(`A${authorityStartRow + 1}`).value = auth.level_1_authority_name || '';
                sheet.getCell(`A${authorityStartRow + 2}`).value = auth.level_1_authority_designation || '';
                sheet.getCell(`I${authorityStartRow}`).value = 'Checked By:';
                sheet.getCell(`I${authorityStartRow + 1}`).value = auth.level_2_authority_name || '';
                sheet.getCell(`I${authorityStartRow + 2}`).value = auth.level_2_authority_designation || '';
                sheet.getCell(`P${authorityStartRow}`).value = 'Reviewed/Submitted By:';
                sheet.getCell(`P${authorityStartRow + 1}`).value = auth.level_3_authority_name || '';
                sheet.getCell(`P${authorityStartRow + 2}`).value = auth.level_3_authority_designation || '';
            }
            await workbook.xlsx.writeFile(outputPath);
        }
        catch (error) {
            fs.copyFileSync(templatePath, outputPath);
        }
        res.download(outputPath, filename, (err) => {
            if (err) {
                logEvents(`Error sending file: ${err.message}`, "fuelLog.log");
            }
            fs.unlink(outputPath, (unlinkErr) => {
                if (unlinkErr) {
                    logEvents(`Error deleting temporary file: ${unlinkErr.message}`, "fuelLog.log");
                }
            });
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error generating weekly diesel report: ${errorMessage}`, "fuelLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while generating report'
        });
    }
    finally {
        connection.release();
    }
};
export const generateWeeklyPetrolReport = async (req: Request, res: Response): Promise<void> => {
    const { start_date, end_date } = req.query;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [equipmentRows] = await connection.query<RowDataPacket[]>(`SELECT equipment_code FROM fuel_valid_equipments WHERE fuel_type = 'petrol' AND is_active = 1`);
        let equipmentList: string[] = equipmentRows.map((row: any) => String(row.equipment_code).trim()).filter(Boolean);
        if (equipmentList.length === 0) {
            const [configResult] = await connection.query<RowDataPacket[]>('SELECT config_value FROM app_config WHERE config_name = ? AND config_type = "fuel"', ['valid_equipment_list_petrol']);
            if (configResult.length === 0) {
                throw new Error('Valid equipment list configuration not found');
            }
            equipmentList = configResult[0].config_value
                .replace(/\r\n/g, '')
                .split(',')
                .map((item: string) => item.trim())
                .filter((item: string) => item && !item.includes(' '));
        }
        const [fuelRecords] = await connection.query<RowDataPacket[]>(`SELECT 
        DATE(i.issue_date) as date,
        DAYNAME(i.issue_date) as day_name,
        i.issued_for,
              f.fuel_price,
        MAX(f.week_number) as week_number,
        SUM(i.issue_quantity) as issue_quantity,
        MAX(f.kilometers) as kilometers,
        SUM(i.issue_quantity * f.fuel_price) as daily_cost
            FROM fuel_records f
            JOIN issue_details i ON f.issue_fk = i.id
       WHERE f.fuel_type = 'Petrol' 
      AND i.issue_date BETWEEN ? AND ?
      AND i.approval_status = 'APPROVED'
      GROUP BY DATE(i.issue_date), DAYNAME(i.issue_date), i.issued_for, f.fuel_price
      ORDER BY date, i.issued_for`, [start_date, end_date]);
        const [weekData] = await connection.query<RowDataPacket[]>(`SELECT 
        MAX(f.week_number) as week_number,
        SUM(i.issue_quantity) as total_quantity,
        SUM(i.issue_quantity * f.fuel_price) as total_cost
       FROM fuel_records f
       JOIN issue_details i ON f.issue_fk = i.id
       WHERE f.fuel_type = 'Petrol'
       AND i.issue_date BETWEEN ? AND ?
       AND i.approval_status = 'APPROVED'`, [start_date, end_date]);
        const currentWeek = weekData[0]?.week_number || 0;
        const templatePath = path.join(__dirname, '../../public/templates/template_file.xlsx');
        const tempDir = path.join(__dirname, '../../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        const filename = `Petrol_Weekly_Report_${start_date}_to_${end_date}.xlsx`;
        const outputPath = path.join(tempDir, filename);
        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(templatePath);
            const sheet = workbook.getWorksheet('Petrol Weekly Template');
            if (!sheet) {
                throw new Error('Petrol Weekly Template sheet not found');
            }
            sheet.getCell('J6').value = `${start_date} to ${end_date}`;
            if (currentWeek) {
                sheet.getCell('R5').value = currentWeek;
            }
            const today = new Date().toISOString().split('T')[0];
            sheet.getCell('R6').value = today;
            const dateColumns = ['C', 'E', 'G', 'I', 'K', 'M', 'O'];
            const dateData = new Map();
            const formatDate = (dateStr: string) => {
                const date = new Date(dateStr);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };
            const allDates = [];
            const start = new Date(String(start_date));
            const end = new Date(String(end_date));
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                allDates.push(formatDate(d.toISOString()));
            }
            allDates.forEach(date => {
                dateData.set(date, {
                    day_name: new Date(date).toLocaleDateString('en-US', { weekday: 'long' }),
                    fuel_price: null,
                    equipmentData: new Map()
                });
            });
            fuelRecords.forEach(record => {
                const dateKey = formatDate(record.date);
                if (dateData.has(dateKey)) {
                    const dateInfo = dateData.get(dateKey);
                    dateInfo.fuel_price = record.fuel_price;
                    if (!dateInfo.equipmentData.has(record.issued_for)) {
                        dateInfo.equipmentData.set(record.issued_for, {
                            quantity: null,
                            kilometers: null,
                            cost: 0
                        });
                    }
                    const equipmentData = dateInfo.equipmentData.get(record.issued_for);
                    equipmentData.quantity = (equipmentData.quantity || 0) + record.issue_quantity;
                    if (record.kilometers !== null && record.kilometers !== undefined) {
                        equipmentData.kilometers = Number(record.kilometers);
                    }
                    equipmentData.cost += record.daily_cost;
                }
            });
            allDates.forEach((date, index) => {
                if (index < 7) {
                    const col = dateColumns[index];
                    const data = dateData.get(date);
                    sheet.getCell(`${col}7`).value = `${data.day_name}             (${date})`;
                }
            });
            let lastPrice: number | null = null;
            allDates.forEach((date, index) => {
                if (index < 7) {
                    const col = dateColumns[index];
                    const data = dateData.get(date);
                    let priceToUse = data.fuel_price;
                    if (priceToUse === null || priceToUse === undefined) {
                        priceToUse = lastPrice;
                    }
                    else {
                        lastPrice = priceToUse;
                    }
                    if (priceToUse !== null && priceToUse !== undefined) {
                        sheet.getCell(`${col}9`).value = priceToUse;
                    }
                }
            });
            const templateRowIndex = 11;
            const templateRow = sheet.getRow(templateRowIndex);
            let currentRowIndex = templateRowIndex;
            const dailyTotals = new Map();
            allDates.forEach(date => {
                dailyTotals.set(date, { quantity: 0, cost: 0 });
            });
            for (let i = 0; i < equipmentList.length; i++) {
                const equipment = equipmentList[i];
                let totalQuantity = 0;
                let totalCost = 0;
                if (i > 0) {
                    currentRowIndex++;
                    sheet.insertRow(currentRowIndex, []);
                    const newRow = sheet.getRow(currentRowIndex);
                    newRow.height = templateRow.height || 15;
                    newRow.hidden = templateRow.hidden || false;
                    newRow.outlineLevel = templateRow.outlineLevel || 0;
                    templateRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                        const newCell = newRow.getCell(colNumber);
                        newCell.style = cell.style;
                        newCell.border = cell.border;
                        if (cell.font)
                            newCell.font = cell.font;
                        if (cell.alignment)
                            newCell.alignment = cell.alignment;
                        if (cell.fill)
                            newCell.fill = cell.fill;
                        if (cell.numFmt)
                            newCell.numFmt = cell.numFmt;
                        if (cell.protection)
                            newCell.protection = cell.protection;
                    });
                }
                const row = currentRowIndex;
                const aCell = sheet.getCell(`A${row}`);
                const bCell = sheet.getCell(`B${row}`);
                aCell.value = i + 1;
                bCell.value = equipment;
                allDates.forEach((date, index) => {
                    if (index < 7) {
                        const col = dateColumns[index];
                        const data = dateData.get(date);
                        const equipmentData = data.equipmentData.get(equipment) || { quantity: null, kilometers: null, cost: 0 };
                        if (equipmentData.quantity !== null) {
                            sheet.getCell(`${col}${row}`).value = equipmentData.quantity;
                            totalQuantity += equipmentData.quantity;
                            dailyTotals.get(date).quantity += equipmentData.quantity;
                        }
                        if (equipmentData.kilometers !== null && equipmentData.kilometers !== undefined) {
                            const kmCol = String.fromCharCode(col.charCodeAt(0) + 1);
                            const kmCell = sheet.getCell(`${kmCol}${row}`);
                            kmCell.value = Number(equipmentData.kilometers);
                            kmCell.numFmt = '#,##0';
                        }
                        if (equipmentData.cost !== 0) {
                            totalCost += equipmentData.cost;
                            dailyTotals.get(date).cost += equipmentData.cost;
                        }
                    }
                });
                sheet.getCell(`Q${row}`).value = totalQuantity;
                sheet.getCell(`R${row}`).value = totalCost;
            }
            const lastEquipmentRow = currentRowIndex;
            const dailyTotalsQuantityRow = lastEquipmentRow + 2;
            const dailyTotalsCostRow = dailyTotalsQuantityRow + 1;
            allDates.forEach((date, index) => {
                if (index < 7) {
                    const col = dateColumns[index];
                    const totals = dailyTotals.get(date);
                    sheet.getCell(`${col}${dailyTotalsQuantityRow}`).value = totals.quantity;
                    sheet.getCell(`${col}${dailyTotalsCostRow}`).value = totals.cost;
                }
            });
            const grandTotalQuantity = Array.from(dailyTotals.values()).reduce((sum, day) => sum + day.quantity, 0);
            const grandTotalCost = Array.from(dailyTotals.values()).reduce((sum, day) => sum + day.cost, 0);
            sheet.getCell(`Q${dailyTotalsQuantityRow}`).value = grandTotalQuantity;
            sheet.getCell(`R${dailyTotalsCostRow}`).value = grandTotalCost;
            const authorityStartRow = dailyTotalsCostRow + 6;
            const [authorityRows] = await connection.query<RowDataPacket[]>('SELECT level_1_authority_name, level_1_authority_staffid, level_1_authority_designation, ' +
                'level_2_authority_name, level_2_authority_staffid, level_2_authority_designation, ' +
                'level_3_authority_name, level_3_authority_staffid, level_3_authority_designation ' +
                'FROM authority_details WHERE authority_type = ? ORDER BY id DESC LIMIT 1', ['fuel']);
            if ((authorityRows as RowDataPacket[]).length > 0) {
                const auth = (authorityRows as RowDataPacket[])[0];
                sheet.getCell(`A${authorityStartRow - 1}`).value = 'Prepared By:';
                sheet.getCell(`A${authorityStartRow}`).value = auth.level_1_authority_name || '';
                sheet.getCell(`A${authorityStartRow + 1}`).value = auth.level_1_authority_designation || '';
                sheet.getCell(`H${authorityStartRow - 1}`).value = 'Checked By:';
                sheet.getCell(`H${authorityStartRow}`).value = auth.level_2_authority_name || '';
                sheet.getCell(`H${authorityStartRow + 1}`).value = auth.level_2_authority_designation || '';
                sheet.getCell(`Q${authorityStartRow - 1}`).value = 'Reviewed/Submitted By:';
                sheet.getCell(`Q${authorityStartRow}`).value = auth.level_3_authority_name || '';
                sheet.getCell(`Q${authorityStartRow + 1}`).value = auth.level_3_authority_designation || '';
            }
            const targetSheetName = 'Petrol Weekly Template';
            const sheetsToRemove: ExcelJS.Worksheet[] = [];
            workbook.eachSheet((ws) => {
                if (ws.name !== targetSheetName) {
                    sheetsToRemove.push(ws);
                }
            });
            sheetsToRemove.forEach((ws) => {
                workbook.removeWorksheet(ws.id);
            });
            await workbook.xlsx.writeFile(outputPath);
        }
        catch (error) {
            fs.copyFileSync(templatePath, outputPath);
        }
        res.download(outputPath, filename, (err) => {
            if (err) {
                logEvents(`Error sending file: ${err.message}`, "fuelLog.log");
            }
            fs.unlink(outputPath, (unlinkErr) => {
                if (unlinkErr) {
                    logEvents(`Error deleting temporary file: ${unlinkErr.message}`, "fuelLog.log");
                }
            });
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error generating weekly petrol report: ${errorMessage}`, "fuelLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while generating report'
        });
    }
    finally {
        connection.release();
    }
};
export const generateOilConsumptionReport = async (req: Request, res: Response): Promise<void> => {
    const { start_date, end_date } = req.query;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [oilRows] = await connection.query<RowDataPacket[]>(`SELECT DISTINCT oil_code AS code FROM stock_details WHERE oil_code IS NOT NULL AND oil_code <> ''`);
        let oilCodes: string[] = oilRows.map((row: any) => String(row.code).trim()).filter(Boolean);
        if (oilCodes.length === 0) {
            const [oilConfigRows] = await connection.query<RowDataPacket[]>(`SELECT config_value FROM app_config WHERE config_type = 'fuel' AND config_name = 'oil_codes'`);
            if (!oilConfigRows.length)
                throw new Error('Oil codes not configured');
            oilCodes = oilConfigRows[0].config_value.split(',').map((c: string) => c.trim()).filter(Boolean);
        }
        const oilData: {
            naccode: string;
            total_issued: number;
            item_name: string;
            part_number: string;
            unit: string;
        }[] = [];
        for (const naccode of oilCodes) {
            const [issueRows] = await connection.query<RowDataPacket[]>(`SELECT SUM(issue_quantity) as total_issued FROM issue_details WHERE nac_code = ? AND issue_date BETWEEN ? AND ? AND approval_status = 'APPROVED'`, [naccode, start_date, end_date]);
            const total_issued = Number(issueRows[0]?.total_issued) || 0;
            const [stockRows] = await connection.query<RowDataPacket[]>(`SELECT item_name, part_numbers, unit FROM stock_details WHERE nac_code = ? LIMIT 1`, [naccode]);
            let item_name = '', part_number = '', unit = '';
            if (stockRows.length) {
                item_name = String(stockRows[0].item_name || '').split(',')[0].trim();
                part_number = String(stockRows[0].part_numbers || '').split(',')[0].trim();
                unit = stockRows[0].unit || '';
            }
            oilData.push({ naccode, total_issued, item_name, part_number, unit });
        }
        const [weekRows] = await connection.query<RowDataPacket[]>(`SELECT week_number FROM fuel_records f JOIN issue_details i ON f.issue_fk = i.id WHERE f.fuel_type = 'diesel' AND i.issue_date = ? LIMIT 1`, [start_date]);
        const weekNumber = weekRows.length ? weekRows[0].week_number : 0;
        const today = new Date().toISOString().split('T')[0];
        const [authRows] = await connection.query<RowDataPacket[]>(`SELECT level_3_authority_name, level_3_authority_designation FROM authority_details WHERE authority_type = 'fuel' ORDER BY id DESC LIMIT 1`);
        const level3Name = authRows.length ? authRows[0].level_3_authority_name : '';
        const level3Designation = authRows.length ? authRows[0].level_3_authority_designation : '';
        const templatePath = path.join(__dirname, '../../public/templates/template_file.xlsx');
        const tempDir = path.join(__dirname, '../../temp');
        if (!fs.existsSync(tempDir))
            fs.mkdirSync(tempDir, { recursive: true });
        const filename = `oil_consumption_report_${start_date}_to_${end_date}.xlsx`;
        const outputPath = path.join(tempDir, filename);
        try {
            const XlsxPopulate = require('xlsx-populate');
            const workbook = await XlsxPopulate.fromFileAsync(templatePath);
            const sheet = workbook.sheet('Oil Weekly Template');
            const startBsStr = adToBs(String(start_date));
            const endBsStr = adToBs(String(end_date));
            sheet.cell('E13').value(`${startBsStr} - ${endBsStr}`);
            sheet.cell('D13').value(`${start_date} - ${end_date}`);
            sheet.cell('C13').value(weekNumber);
            sheet.cell('E6').value(today);
            let row = 16;
            oilData.forEach((oil, idx) => {
                sheet.cell(row, 'A').value(idx + 1);
                sheet.cell(row, 'B').value(`${oil.item_name} (${oil.part_number})`);
                sheet.cell(row, 'C').value(oil.unit);
                sheet.cell(row, 'D').value(oil.total_issued);
                ['A', 'B', 'C', 'D'].forEach(col => {
                    sheet.cell(row, col).style({
                        border: true
                    });
                });
                row++;
            });
            row += 3;
            sheet.cell(row, 'E').value('Submitted By:');
            sheet.cell(row + 1, 'E').value(level3Name);
            sheet.cell(row + 2, 'E').value(level3Designation);
            await workbook.toFileAsync(outputPath);
        }
        catch (error) {
            fs.copyFileSync(templatePath, outputPath);
        }
        res.download(outputPath, filename, (err) => {
            if (err) {
                logEvents(`Error sending file: ${err.message}`, 'fuelLog.log');
            }
            fs.unlink(outputPath, (unlinkErr) => {
                if (unlinkErr) {
                    logEvents(`Error deleting temporary file: ${unlinkErr.message}`, 'fuelLog.log');
                }
            });
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error generating oil consumption report: ${errorMessage}`, 'fuelLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const getDailyReceiveSummary = async (req: Request, res: Response): Promise<void> => {
    const { fromDate, toDate } = req.query as {
        fromDate?: string;
        toDate?: string;
    };
    if (!fromDate || !toDate) {
        res.status(400).json({ error: 'Bad Request', message: 'fromDate and toDate are required' });
        return;
    }
    try {
        const [rows] = await pool.query<RowDataPacket[]>(`SELECT receive_date AS date, COUNT(*) AS count
       FROM receive_details
       WHERE receive_date BETWEEN ? AND ?
       AND approval_status = 'APPROVED'
       GROUP BY receive_date
       ORDER BY receive_date`, [fromDate, toDate]);
        res.status(200).json({ series: rows });
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        logEvents(`Error in getDailyReceiveSummary: ${msg}`, 'reportLog.log');
        res.status(500).json({ error: 'Internal Server Error', message: msg });
    }
};
export const getDailyRequestSummary = async (req: Request, res: Response): Promise<void> => {
    const { fromDate, toDate } = req.query as {
        fromDate?: string;
        toDate?: string;
    };
    if (!fromDate || !toDate) {
        res.status(400).json({ error: 'Bad Request', message: 'fromDate and toDate are required' });
        return;
    }
    try {
        const [rows] = await pool.query<RowDataPacket[]>(`SELECT 
        request_date AS date, 
        COUNT(*) AS count,
        COUNT(DISTINCT request_number) AS unique_requests,
        SUM(requested_quantity) AS total_items
       FROM request_details
       WHERE request_date BETWEEN ? AND ?
       AND approval_status = 'APPROVED'
       GROUP BY request_date
       ORDER BY request_date`, [fromDate, toDate]);
        res.status(200).json({ series: rows });
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        logEvents(`Error in getDailyRequestSummary: ${msg}`, 'reportLog.log');
        res.status(500).json({ error: 'Internal Server Error', message: msg });
    }
};
export const getDailyRRPSummary = async (req: Request, res: Response): Promise<void> => {
    const { fromDate, toDate } = req.query as {
        fromDate?: string;
        toDate?: string;
    };
    if (!fromDate || !toDate) {
        res.status(400).json({ error: 'Bad Request', message: 'fromDate and toDate are required' });
        return;
    }
    try {
        const [rows] = await pool.query<RowDataPacket[]>(`SELECT date AS date, COUNT(DISTINCT rrp_number) AS count
       FROM rrp_details
       WHERE date BETWEEN ? AND ?
       GROUP BY date
       ORDER BY date`, [fromDate, toDate]);
        res.status(200).json({ series: rows });
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        logEvents(`Error in getDailyRRPSummary: ${msg}`, 'reportLog.log');
        res.status(500).json({ error: 'Internal Server Error', message: msg });
    }
};
export const generateRequestReceiveReport = async (req: Request, res: Response): Promise<void> => {
    const { universal, equipmentNumber, partNumber, itemName, nacCode, receiveStatus, page = 1, pageSize = 20 } = req.query;
    try {
        logEvents(`Starting Request & Receive Report generation with parameters: universal=${universal}, equipmentNumber=${equipmentNumber}, partNumber=${partNumber}, itemName=${itemName}, nacCode=${nacCode}, receiveStatus=${receiveStatus}, page=${page}, pageSize=${pageSize}`, "reportLog.log");
        let query = `
            SELECT 
                rd.id as request_id,
                rd.request_number,
                rd.request_date,
                rd.requested_by,
                rd.part_number,
                rd.item_name,
                rd.equipment_number,
                rd.requested_quantity,
                rd.approval_status as request_status,
                rd.nac_code,
                rd.unit,
                rd.current_balance,
                rd.previous_rate,
                rd.image_path as request_image,
                rd.specifications,
                rd.remarks,
                rd.is_received,
                rd.receive_fk,
                COALESCE(sd.location, '') as location,
                COALESCE(sd.card_number, '') as card_number,
                pm.weighted_average_days AS predicted_days,
                pm.percentile_10_days AS predicted_range_lower,
                pm.percentile_90_days AS predicted_range_upper,
                pm.confidence_level AS predicted_confidence,
                pm.sample_size AS predicted_sample_size,
                pm.calculated_at AS predicted_calculated_at,
                    -- Latest approved receive id and all receive ids CSV (for reference)
                    (
                        SELECT ri3.id
                        FROM receive_details ri3
                        WHERE ri3.request_fk = rd.id
                        ORDER BY ri3.id DESC
                        LIMIT 1
                    ) AS latest_receive_id,
                    (
                        SELECT GROUP_CONCAT(ri4.id ORDER BY ri4.id)
                        FROM receive_details ri4
                        WHERE ri4.request_fk = rd.id
                    ) AS receive_ids_csv,
                -- Aggregated receive totals
                COALESCE((
                    SELECT SUM(ri.received_quantity) 
                    FROM receive_details ri 
                    WHERE ri.request_fk = rd.id 
                      AND ri.approval_status IN ('PENDING','APPROVED')
                ), 0) AS total_pending_approved,
                COALESCE((
                    SELECT SUM(ri.received_quantity) 
                    FROM receive_details ri 
                    WHERE ri.request_fk = rd.id 
                      AND ri.approval_status = 'APPROVED'
                ), 0) AS total_approved,
                (rd.requested_quantity - COALESCE((
                    SELECT SUM(ri.received_quantity) 
                    FROM receive_details ri 
                    WHERE ri.request_fk = rd.id 
                      AND ri.approval_status IN ('PENDING','APPROVED')
                ), 0)) AS remaining_quantity,
                CASE 
                    WHEN COALESCE((
                        SELECT SUM(ri.received_quantity) 
                        FROM receive_details ri 
                        WHERE ri.request_fk = rd.id 
                          AND ri.approval_status = 'APPROVED'
                    ), 0) = 0 THEN 'Not Received'
                    WHEN COALESCE((
                        SELECT SUM(ri.received_quantity) 
                        FROM receive_details ri 
                        WHERE ri.request_fk = rd.id 
                          AND ri.approval_status = 'APPROVED'
                    ), 0) < rd.requested_quantity THEN 'Partially Received'
                    ELSE 'Received'
                END AS derived_receive_status
            FROM request_details rd
            LEFT JOIN stock_details sd ON rd.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
            LEFT JOIN prediction_metrics pm ON pm.nac_code COLLATE utf8mb4_unicode_ci = rd.nac_code COLLATE utf8mb4_unicode_ci
            WHERE 1=1
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
        if (itemName && itemName.toString().trim() !== '') {
            query += ` AND rd.item_name LIKE ?`;
            params.push(`%${itemName}%`);
        }
        if (nacCode && nacCode.toString().trim() !== '') {
            query += ` AND rd.nac_code LIKE ?`;
            params.push(`%${nacCode}%`);
        }
        if (receiveStatus && receiveStatus.toString().trim() !== '') {
            if (receiveStatus === 'not_received') {
                query += ` AND (
                    (SELECT COALESCE(SUM(ri.received_quantity),0) FROM receive_details ri WHERE ri.request_fk = rd.id AND ri.approval_status = 'APPROVED') = 0
                )`;
            }
            else if (receiveStatus === 'partial') {
                query += ` AND (
                    (SELECT COALESCE(SUM(ri.received_quantity),0) FROM receive_details ri WHERE ri.request_fk = rd.id AND ri.approval_status = 'APPROVED') > 0
                    AND (SELECT COALESCE(SUM(ri2.received_quantity),0) FROM receive_details ri2 WHERE ri2.request_fk = rd.id AND ri2.approval_status = 'APPROVED') < rd.requested_quantity
                )`;
            }
            else if (receiveStatus === 'received') {
                query += ` AND (
                    (SELECT COALESCE(SUM(ri.received_quantity),0) FROM receive_details ri WHERE ri.request_fk = rd.id AND ri.approval_status = 'APPROVED') >= rd.requested_quantity
                )`;
            }
        }
        const currentPage = parseInt(page.toString()) || 1;
        const limit = parseInt(pageSize.toString()) || 20;
        const offset = (currentPage - 1) * limit;
        query += ` ORDER BY rd.request_date DESC, rd.id DESC LIMIT ${limit} OFFSET ${offset}`;
        logEvents(`Executing query: ${query} with params: ${JSON.stringify(params)}`, "reportLog.log");
        const [results] = await pool.execute<RowDataPacket[]>(query, params);
        let totalCount = 0;
        try {
            let countQuery = `
                SELECT COUNT(DISTINCT rd.id) as total 
                FROM request_details rd
                LEFT JOIN stock_details sd ON rd.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
                LEFT JOIN receive_details rec ON rd.id = rec.request_fk
                WHERE 1=1
            `;
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
            if (itemName && itemName.toString().trim() !== '') {
                countQuery += ` AND rd.item_name LIKE ?`;
                countParams.push(`%${itemName}%`);
            }
            if (nacCode && nacCode.toString().trim() !== '') {
                countQuery += ` AND rd.nac_code LIKE ?`;
                countParams.push(`%${nacCode}%`);
            }
            if (receiveStatus && receiveStatus.toString().trim() !== '') {
                if (receiveStatus === 'not_received') {
                    countQuery += ` AND (
                        (SELECT COALESCE(SUM(ri.received_quantity),0) FROM receive_details ri WHERE ri.request_fk = rd.id AND ri.approval_status = 'APPROVED') = 0
                    )`;
                }
                else if (receiveStatus === 'partial') {
                    countQuery += ` AND (
                        (SELECT COALESCE(SUM(ri.received_quantity),0) FROM receive_details ri WHERE ri.request_fk = rd.id AND ri.approval_status = 'APPROVED') > 0
                        AND (SELECT COALESCE(SUM(ri2.received_quantity),0) FROM receive_details ri2 WHERE ri2.request_fk = rd.id AND ri2.approval_status = 'APPROVED') < rd.requested_quantity
                    )`;
                }
                else if (receiveStatus === 'received') {
                    countQuery += ` AND (
                        (SELECT COALESCE(SUM(ri.received_quantity),0) FROM receive_details ri WHERE ri.request_fk = rd.id AND ri.approval_status = 'APPROVED') >= rd.requested_quantity
                    )`;
                }
            }
            const [countResult] = await pool.execute<RowDataPacket[]>(countQuery, countParams);
            totalCount = (countResult as any)[0]?.total || 0;
        }
        catch (countError) {
            logEvents(`Warning: Failed to get total count: ${countError}`, "reportLog.log");
            totalCount = results.length;
        }
        const formattedResults = results.map((row: any) => ({
            requestId: row.request_id,
            requestNumber: row.request_number,
            requestDate: row.request_date,
            requestedBy: row.requested_by,
            partNumber: row.part_number,
            itemName: row.item_name,
            equipmentNumber: row.equipment_number,
            requestedQuantity: row.requested_quantity,
            requestStatus: row.request_status,
            nacCode: row.nac_code,
            unit: row.unit,
            currentBalance: row.current_balance,
            previousRate: row.previous_rate,
            requestImage: row.request_image,
            specifications: row.specifications,
            remarks: row.remarks,
            isReceived: row.is_received,
            receiveFk: row.receive_fk,
            latestReceiveId: row.latest_receive_id,
            receiveIdsCsv: row.receive_ids_csv,
            location: row.location,
            cardNumber: row.card_number,
            receivedTotalPendingApproved: Number(row.total_pending_approved) || 0,
            receivedTotalApproved: Number(row.total_approved) || 0,
            remainingQuantity: Number(row.remaining_quantity) || 0,
            receiveStatus: row.derived_receive_status,
            predictionSummary: row.predicted_days !== null && row.predicted_days !== undefined ? {
                predictedDays: Number(row.predicted_days),
                rangeLowerDays: row.predicted_range_lower !== null && row.predicted_range_lower !== undefined ? Number(row.predicted_range_lower) : null,
                rangeUpperDays: row.predicted_range_upper !== null && row.predicted_range_upper !== undefined ? Number(row.predicted_range_upper) : null,
                confidence: row.predicted_confidence ?? null,
                sampleSize: row.predicted_sample_size !== null && row.predicted_sample_size !== undefined ? Number(row.predicted_sample_size) : 0,
                calculatedAt: row.predicted_calculated_at ?? null
            } : null
        }));
        logEvents(`Successfully generated Request & Receive Report with ${formattedResults.length} results`, "reportLog.log");
        res.json({
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
        logEvents(`Error generating Request & Receive Report: ${errorMessage}`, "reportLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while generating the report'
        });
    }
};
export const generateTenderReceiveReport = async (req: Request, res: Response): Promise<void> => {
    const { universal, tenderNumber, receiveStatus, page = 1, pageSize = 20 } = req.query;
    try {
        logEvents(`Starting Tender Receive Report generation with parameters: universal=${universal}, tenderNumber=${tenderNumber}, receiveStatus=${receiveStatus}, page=${page}, pageSize=${pageSize}`, "reportLog.log");
        let query = `
            SELECT 
                rd.id as receive_id,
                rd.receive_date,
                rd.received_by,
                rd.part_number,
                rd.item_name,
                rd.nac_code,
                rd.received_quantity,
                rd.unit,
                rd.approval_status,
                rd.image_path,
                rd.location,
                rd.card_number,
                rd.tender_reference_number,
                rd.created_at,
                rd.updated_at,
                CASE 
                    WHEN rd.approval_status = 'PENDING' THEN 'Pending Approval'
                    WHEN rd.approval_status = 'APPROVED' THEN 'Approved'
                    WHEN rd.approval_status = 'REJECTED' THEN 'Rejected'
                    ELSE 'Unknown'
                END AS derived_receive_status
            FROM receive_details rd
            WHERE rd.receive_source = 'tender'
        `;
        const params: (string | number)[] = [];
        if (universal && universal.toString().trim() !== '') {
            query += ` AND (
                rd.item_name LIKE ? OR
                rd.part_number LIKE ? OR
                rd.nac_code LIKE ? OR
                rd.tender_reference_number LIKE ?
            )`;
            params.push(`%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`);
        }
        if (tenderNumber && tenderNumber.toString().trim() !== '') {
            query += ` AND rd.tender_reference_number LIKE ?`;
            params.push(`%${tenderNumber}%`);
        }
        if (receiveStatus && receiveStatus.toString().trim() !== '') {
            if (receiveStatus === 'pending') {
                query += ` AND rd.approval_status = 'PENDING'`;
            }
            else if (receiveStatus === 'approved') {
                query += ` AND rd.approval_status = 'APPROVED'`;
            }
            else if (receiveStatus === 'rejected') {
                query += ` AND rd.approval_status = 'REJECTED'`;
            }
        }
        const currentPage = parseInt(page.toString()) || 1;
        const limit = parseInt(pageSize.toString()) || 20;
        const offset = (currentPage - 1) * limit;
        query += ` ORDER BY rd.receive_date DESC, rd.id DESC LIMIT ${limit} OFFSET ${offset}`;
        logEvents(`Executing query: ${query} with params: ${JSON.stringify(params)}`, "reportLog.log");
        const [results] = await pool.execute<RowDataPacket[]>(query, params);
        let totalCount = 0;
        try {
            let countQuery = `
                SELECT COUNT(*) as total 
                FROM receive_details rd
                WHERE rd.receive_source = 'tender'
            `;
            const countParams: (string | number)[] = [];
            if (universal && universal.toString().trim() !== '') {
                countQuery += ` AND (
                    rd.item_name LIKE ? OR
                    rd.part_number LIKE ? OR
                    rd.nac_code LIKE ? OR
                    rd.tender_reference_number LIKE ?
                )`;
                countParams.push(`%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`);
            }
            if (tenderNumber && tenderNumber.toString().trim() !== '') {
                countQuery += ` AND rd.tender_reference_number LIKE ?`;
                countParams.push(`%${tenderNumber}%`);
            }
            if (receiveStatus && receiveStatus.toString().trim() !== '') {
                if (receiveStatus === 'pending') {
                    countQuery += ` AND rd.approval_status = 'PENDING'`;
                }
                else if (receiveStatus === 'approved') {
                    countQuery += ` AND rd.approval_status = 'APPROVED'`;
                }
                else if (receiveStatus === 'rejected') {
                    countQuery += ` AND rd.approval_status = 'REJECTED'`;
                }
            }
            const [countResult] = await pool.execute<RowDataPacket[]>(countQuery, countParams);
            totalCount = countResult[0].total;
        }
        catch (countError) {
            logEvents(`Count query failed: ${JSON.stringify(countError)}`, "reportLog.log");
        }
        const formattedResults = results.map(item => ({
            receiveId: item.receive_id,
            receiveDate: formatDate(item.receive_date),
            receivedBy: item.received_by,
            partNumber: item.part_number,
            itemName: item.item_name,
            nacCode: item.nac_code,
            receivedQuantity: item.received_quantity,
            unit: item.unit,
            approvalStatus: item.approval_status,
            derivedReceiveStatus: item.derived_receive_status,
            imagePath: item.image_path,
            location: item.location,
            cardNumber: item.card_number,
            tenderReferenceNumber: item.tender_reference_number,
            createdAt: item.created_at,
            updatedAt: item.updated_at
        }));
        logEvents(`Successfully generated tender receive report with ${formattedResults.length} results`, "reportLog.log");
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
        logEvents(`Error generating tender receive report: ${errorMessage}`, "reportLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while generating the tender receive report'
        });
    }
};
export const generateBorrowHistoryReport = async (req: Request, res: Response): Promise<void> => {
    const { universal, borrowSourceId, borrowStatus, fromDate, toDate, page = 1, pageSize = 20 } = req.query;
    try {
        logEvents(`Starting Borrow History Report generation with parameters: universal=${universal}, borrowSourceId=${borrowSourceId}, borrowStatus=${borrowStatus}, fromDate=${fromDate}, toDate=${toDate}, page=${page}, pageSize=${pageSize}`, "reportLog.log");
        let query = `
            SELECT 
                rd.id as receive_id,
                rd.receive_date,
                rd.borrow_date,
                rd.return_date,
                rd.received_by,
                rd.part_number,
                rd.item_name,
                rd.nac_code,
                rd.received_quantity,
                rd.unit,
                rd.approval_status,
                rd.borrow_status,
                rd.borrow_reference_number,
                rd.image_path,
                rd.location,
                rd.card_number,
                rd.created_at,
                rd.updated_at,
                bs.source_name,
                bs.source_code,
                CASE 
                    WHEN rd.approval_status = 'PENDING' THEN 'Pending Approval'
                    WHEN rd.approval_status = 'APPROVED' THEN 'Approved'
                    WHEN rd.approval_status = 'REJECTED' THEN 'Rejected'
                    ELSE 'Unknown'
                END AS derived_receive_status,
                CASE 
                    WHEN rd.borrow_status = 'ACTIVE' THEN 'Active'
                    WHEN rd.borrow_status = 'RETURNED' THEN 'Returned'
                    WHEN rd.borrow_status = 'CANCELLED' THEN 'Cancelled'
                    ELSE 'Unknown'
                END AS derived_borrow_status
            FROM receive_details rd
            LEFT JOIN borrow_sources bs ON rd.borrow_source_id = bs.id
            WHERE rd.receive_source = 'borrow'
        `;
        const params: (string | number)[] = [];
        if (universal && universal.toString().trim() !== '') {
            query += ` AND (
                rd.item_name LIKE ? OR
                rd.part_number LIKE ? OR
                rd.nac_code LIKE ? OR
                rd.borrow_reference_number LIKE ? OR
                bs.source_name LIKE ?
            )`;
            params.push(`%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`);
        }
        if (borrowSourceId && borrowSourceId.toString().trim() !== '') {
            query += ` AND rd.borrow_source_id = ?`;
            params.push(parseInt(borrowSourceId.toString()));
        }
        if (borrowStatus && borrowStatus.toString().trim() !== '') {
            query += ` AND rd.borrow_status = ?`;
            params.push(borrowStatus.toString().toUpperCase());
        }
        if (fromDate && fromDate.toString().trim() !== '') {
            query += ` AND rd.borrow_date >= ?`;
            params.push(fromDate.toString());
        }
        if (toDate && toDate.toString().trim() !== '') {
            query += ` AND rd.borrow_date <= ?`;
            params.push(toDate.toString());
        }
        const receiveStatus = req.query.receiveStatus;
        if (receiveStatus && receiveStatus.toString().trim() !== '') {
            if (receiveStatus === 'pending') {
                query += ` AND rd.approval_status = 'PENDING'`;
            }
            else if (receiveStatus === 'approved') {
                query += ` AND rd.approval_status = 'APPROVED'`;
            }
            else if (receiveStatus === 'rejected') {
                query += ` AND rd.approval_status = 'REJECTED'`;
            }
        }
        const currentPage = parseInt(page.toString()) || 1;
        const limit = parseInt(pageSize.toString()) || 20;
        const offset = (currentPage - 1) * limit;
        query += ` ORDER BY rd.borrow_date DESC, rd.id DESC LIMIT ${limit} OFFSET ${offset}`;
        logEvents(`Executing query: ${query} with params: ${JSON.stringify(params)}`, "reportLog.log");
        const [results] = await pool.execute<RowDataPacket[]>(query, params);
        let totalCount = 0;
        try {
            let countQuery = `
                SELECT COUNT(*) as total 
                FROM receive_details rd
                LEFT JOIN borrow_sources bs ON rd.borrow_source_id = bs.id
                WHERE rd.receive_source = 'borrow'
            `;
            const countParams: (string | number)[] = [];
            if (universal && universal.toString().trim() !== '') {
                countQuery += ` AND (
                    rd.item_name LIKE ? OR
                    rd.part_number LIKE ? OR
                    rd.nac_code LIKE ? OR
                    rd.borrow_reference_number LIKE ? OR
                    bs.source_name LIKE ?
                )`;
                countParams.push(`%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`);
            }
            if (borrowSourceId && borrowSourceId.toString().trim() !== '') {
                countQuery += ` AND rd.borrow_source_id = ?`;
                countParams.push(parseInt(borrowSourceId.toString()));
            }
            if (borrowStatus && borrowStatus.toString().trim() !== '') {
                countQuery += ` AND rd.borrow_status = ?`;
                countParams.push(borrowStatus.toString().toUpperCase());
            }
            if (fromDate && fromDate.toString().trim() !== '') {
                countQuery += ` AND rd.borrow_date >= ?`;
                countParams.push(fromDate.toString());
            }
            if (toDate && toDate.toString().trim() !== '') {
                countQuery += ` AND rd.borrow_date <= ?`;
                countParams.push(toDate.toString());
            }
            if (receiveStatus && receiveStatus.toString().trim() !== '') {
                if (receiveStatus === 'pending') {
                    countQuery += ` AND rd.approval_status = 'PENDING'`;
                }
                else if (receiveStatus === 'approved') {
                    countQuery += ` AND rd.approval_status = 'APPROVED'`;
                }
                else if (receiveStatus === 'rejected') {
                    countQuery += ` AND rd.approval_status = 'REJECTED'`;
                }
            }
            const [countResult] = await pool.execute<RowDataPacket[]>(countQuery, countParams);
            totalCount = countResult[0].total;
        }
        catch (countError) {
            logEvents(`Count query failed: ${JSON.stringify(countError)}`, "reportLog.log");
        }
        const formattedResults = results.map(item => ({
            receiveId: item.receive_id,
            receiveDate: formatDate(item.receive_date),
            borrowDate: formatDate(item.borrow_date),
            returnDate: item.return_date ? formatDate(item.return_date) : null,
            receivedBy: item.received_by,
            partNumber: item.part_number,
            itemName: item.item_name,
            nacCode: item.nac_code,
            receivedQuantity: item.received_quantity,
            unit: item.unit,
            approvalStatus: item.approval_status,
            borrowStatus: item.borrow_status,
            derivedReceiveStatus: item.derived_receive_status,
            derivedBorrowStatus: item.derived_borrow_status,
            borrowReferenceNumber: item.borrow_reference_number,
            borrowSourceName: item.source_name,
            borrowSourceCode: item.source_code,
            imagePath: item.image_path,
            location: item.location,
            cardNumber: item.card_number,
            createdAt: item.created_at,
            updatedAt: item.updated_at
        }));
        logEvents(`Successfully generated borrow history report with ${formattedResults.length} results`, "reportLog.log");
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
        logEvents(`Error generating borrow history report: ${errorMessage}`, "reportLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while generating the borrow history report'
        });
    }
};
export const exportRequestReceiveReport = async (req: Request, res: Response): Promise<void> => {
    const { exportType, fromDate, toDate, page, pageSize, universal, equipmentNumber, partNumber, itemName, nacCode, receiveStatus } = req.body;
    try {
        logEvents(`Starting Request & Receive Report export with type: ${exportType}`, "reportLog.log");
        logEvents(`Export parameters: exportType=${exportType}, fromDate=${fromDate}, toDate=${toDate}, page=${page}, pageSize=${pageSize}, universal=${universal}, equipmentNumber=${equipmentNumber}, partNumber=${partNumber}, itemName=${itemName}, nacCode=${nacCode}, receiveStatus=${receiveStatus}`, "reportLog.log");
        const connection = await pool.getConnection();
        logEvents(`Database connection acquired successfully`, "reportLog.log");
        try {
            let query = `
                SELECT DISTINCT
                    rd.id,
                    rd.request_number,
                    rd.nac_code,
                    rd.item_name,
                    rd.part_number as requested_part_number,
                    rd.equipment_number as requested_for,
                    rd.request_date,
                    rd.requested_quantity,
                    rec.receive_date,
                    rec.part_number as received_part_number,
                    rec.received_quantity,
                    pm.weighted_average_days AS predicted_days,
                    pm.percentile_10_days AS predicted_range_lower,
                    pm.percentile_90_days AS predicted_range_upper,
                    pm.confidence_level AS predicted_confidence,
                    pm.sample_size AS predicted_sample_size,
                    pm.calculated_at AS predicted_calculated_at
                FROM request_details rd
                LEFT JOIN receive_details rec ON rd.id = rec.request_fk
                LEFT JOIN prediction_metrics pm ON pm.nac_code COLLATE utf8mb4_unicode_ci = rd.nac_code COLLATE utf8mb4_unicode_ci
                WHERE 1=1
            `;
            const params: (string | number)[] = [];
            if (exportType !== 'all') {
                if (universal && universal.toString().trim() !== '') {
                    query += ` AND (
                        rd.request_number LIKE ? OR
                        rd.item_name LIKE ? OR
                        rd.part_number LIKE ? OR
                        rd.equipment_number LIKE ? OR
                        rd.nac_code LIKE ?
                    )`;
                    params.push(`%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`);
                    logEvents(`Added universal filter: ${universal}`, "reportLog.log");
                }
                if (equipmentNumber && equipmentNumber.toString().trim() !== '') {
                    query += ` AND rd.equipment_number LIKE ?`;
                    params.push(`%${equipmentNumber}%`);
                    logEvents(`Added equipmentNumber filter: ${equipmentNumber}`, "reportLog.log");
                }
                if (partNumber && partNumber.toString().trim() !== '') {
                    query += ` AND rd.part_number LIKE ?`;
                    params.push(`%${partNumber}%`);
                    logEvents(`Added partNumber filter: ${partNumber}`, "reportLog.log");
                }
                if (itemName && itemName.toString().trim() !== '') {
                    query += ` AND rd.item_name LIKE ?`;
                    params.push(`%${itemName}%`);
                    logEvents(`Added itemName filter: ${itemName}`, "reportLog.log");
                }
                if (nacCode && nacCode.toString().trim() !== '') {
                    query += ` AND rd.nac_code LIKE ?`;
                    params.push(`%${nacCode}%`);
                    logEvents(`Added nacCode filter: ${nacCode}`, "reportLog.log");
                }
                if (receiveStatus && receiveStatus.toString().trim() !== '' && receiveStatus !== 'all') {
                    if (receiveStatus === 'not_received') {
                        query += ` AND (
                            (SELECT COALESCE(SUM(ri.received_quantity),0) FROM receive_details ri WHERE ri.request_fk = rd.id AND ri.approval_status = 'APPROVED') = 0
                        )`;
                    }
                    else if (receiveStatus === 'partial') {
                        query += ` AND (
                            (SELECT COALESCE(SUM(ri.received_quantity),0) FROM receive_details ri WHERE ri.request_fk = rd.id AND ri.approval_status = 'APPROVED') > 0
                            AND (SELECT COALESCE(SUM(ri2.received_quantity),0) FROM receive_details ri2 WHERE ri2.request_fk = rd.id AND ri2.approval_status = 'APPROVED') < rd.requested_quantity
                        )`;
                    }
                    else if (receiveStatus === 'received') {
                        query += ` AND (
                            (SELECT COALESCE(SUM(ri.received_quantity),0) FROM receive_details ri WHERE ri.request_fk = rd.id AND ri.approval_status = 'APPROVED') >= rd.requested_quantity
                        )`;
                    }
                    logEvents(`Added receiveStatus filter: ${receiveStatus}`, "reportLog.log");
                }
            }
            if (exportType === 'dateRange') {
                if (!fromDate || !toDate) {
                    throw new Error('fromDate and toDate are required for date range export');
                }
                query += ` AND rd.request_date BETWEEN ? AND ?`;
                params.push(fromDate, toDate);
                logEvents(`Added date range filter: fromDate=${fromDate}, toDate=${toDate}`, "reportLog.log");
            }
            query += ` ORDER BY rd.request_date DESC, rd.id DESC`;
            if (exportType === 'currentPage') {
                if (!page || !pageSize) {
                    throw new Error('page and pageSize are required for current page export');
                }
                const currentPage = parseInt(page.toString()) || 1;
                const limit = parseInt(pageSize.toString()) || 20;
                const offset = (currentPage - 1) * limit;
                query += ` LIMIT ${limit} OFFSET ${offset}`;
                logEvents(`Added current page pagination: page=${currentPage}, limit=${limit}, offset=${offset}`, "reportLog.log");
            }
            logEvents(`Final query: ${query}`, "reportLog.log");
            logEvents(`Query parameters: ${JSON.stringify(params)}`, "reportLog.log");
            const [results] = await connection.execute<RowDataPacket[]>(query, params);
            logEvents(`Query executed successfully, returned ${results.length} rows`, "reportLog.log");
            const excelData = results.map((row: any) => {
                const predictedDays = row.predicted_days !== null && row.predicted_days !== undefined
                    ? Number(row.predicted_days).toFixed(1)
                    : 'N/A';
                const rangeLower = row.predicted_range_lower !== null && row.predicted_range_lower !== undefined
                    ? Number(row.predicted_range_lower).toFixed(1)
                    : 'N/A';
                const rangeUpper = row.predicted_range_upper !== null && row.predicted_range_upper !== undefined
                    ? Number(row.predicted_range_upper).toFixed(1)
                    : 'N/A';
                return {
                    'Request Number': row.request_number || '',
                    'NAC Code': row.nac_code || '',
                    'Item Name': row.item_name || '',
                    'Requested Part Number': row.requested_part_number || '',
                    'Requested For': row.requested_for || '',
                    'Request Date': row.request_date || '',
                    'Requested Quantity': row.requested_quantity || 0,
                    'Receive Date': row.receive_date || 'N/A',
                    'Received Part Number': row.received_part_number || 'N/A',
                    'Received Quantity': row.received_quantity || 'N/A',
                    'Predicted Days (Weighted)': predictedDays,
                    'Predicted Range (Days)': rangeLower !== 'N/A' && rangeUpper !== 'N/A' ? `${rangeLower} - ${rangeUpper}` : 'N/A',
                    'Prediction Confidence': row.predicted_confidence || 'N/A',
                    'Prediction Sample Size': row.predicted_sample_size || 'N/A',
                    'Prediction Refreshed On': row.predicted_calculated_at || 'N/A'
                };
            });
            logEvents(`Data formatted for Excel, ${excelData.length} records prepared`, "reportLog.log");
            logEvents(`Starting Excel file generation`, "reportLog.log");
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Request & Receive Report');
            logEvents(`Excel workbook and worksheet created`, "reportLog.log");
            const headers = Object.keys(excelData[0] || {});
            if (headers.length > 0) {
                worksheet.columns = headers.map((h) => ({ header: h, key: h }));
            }
            else {
                worksheet.addRow(['No records found for the selected criteria']);
            }
            logEvents(`Headers added to worksheet: ${headers.join(', ')}`, "reportLog.log");
            if (headers.length > 0) {
                const headerRow = worksheet.getRow(1);
                headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                headerRow.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF003594' }
                };
                logEvents(`Headers styled successfully`, "reportLog.log");
            }
            if (excelData.length > 0) {
                excelData.forEach((row, index) => {
                    worksheet.addRow(Object.values(row));
                    if (index % 100 === 0) {
                        logEvents(`Added ${index + 1} data rows to worksheet`, "reportLog.log");
                    }
                });
                logEvents(`All ${excelData.length} data rows added to worksheet`, "reportLog.log");
            }
            if (worksheet.columns && worksheet.columns.length > 0) {
                worksheet.columns.forEach((column: any) => {
                    const headerLen = typeof column.header === 'string' ? column.header.length : 10;
                    const values = Array.isArray(column.values) ? column.values.slice(1) : [];
                    const maxValueLen = values.reduce((max: number, v: unknown) => {
                        const len = v != null ? String(v).length : 0;
                        return Math.max(max, len);
                    }, 0);
                    column.width = Math.max(headerLen, maxValueLen, 12);
                });
                logEvents(`Columns auto-fitted successfully`, "reportLog.log");
            }
            const fileName = `Request_Receive_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            logEvents(`Response headers set for file download: ${fileName}`, "reportLog.log");
            logEvents(`Starting to write Excel file to response`, "reportLog.log");
            await workbook.xlsx.write(res);
            res.end();
            logEvents(`Excel file written to response successfully`, "reportLog.log");
            logEvents(`Successfully exported Request & Receive Report with ${excelData.length} records`, "reportLog.log");
        }
        finally {
            connection.release();
            logEvents(`Database connection released`, "reportLog.log");
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        const errorStack = error instanceof Error ? error.stack : 'No stack trace available';
        logEvents(`Error exporting Request & Receive Report: ${errorMessage}`, "reportLog.log");
        logEvents(`Error stack trace: ${errorStack}`, "reportLog.log");
        logEvents(`Request body: ${JSON.stringify(req.body)}`, "reportLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while exporting the report'
        });
    }
};
export const getDailyRequestDetails = async (req: Request, res: Response): Promise<void> => {
    const { fromDate, toDate } = req.query as {
        fromDate?: string;
        toDate?: string;
    };
    if (!fromDate || !toDate) {
        res.status(400).json({ error: 'Bad Request', message: 'fromDate and toDate are required' });
        return;
    }
    try {
        const [rows] = await pool.query<RowDataPacket[]>(`SELECT 
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
                rd.unit
            FROM request_details rd
            WHERE rd.request_date BETWEEN ? AND ?
            AND rd.approval_status = 'APPROVED'
            ORDER BY rd.request_date DESC`, [fromDate, toDate]);
        res.status(200).json(rows);
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getDailyRequestDetails: ${msg}`, 'reportLog.log');
        res.status(500).json({ error: 'Internal Server Error', message: msg });
    }
};
export const getDailyReceiveDetails = async (req: Request, res: Response): Promise<void> => {
    const { fromDate, toDate } = req.query as {
        fromDate?: string;
        toDate?: string;
    };
    if (!fromDate || !toDate) {
        res.status(400).json({ error: 'Bad Request', message: 'fromDate and toDate are required' });
        return;
    }
    try {
        const [rows] = await pool.query<RowDataPacket[]>(`SELECT 
                rd.id,
                rd.receive_date,
                rd.received_quantity,
                rd.received_by,
                rd.approval_status,
                rd.item_name,
                rd.nac_code,
                rd.part_number,
                rd.unit,
                rq.request_number,
                rq.request_date,
                rq.requested_by,
                rq.equipment_number
            FROM receive_details rd
            JOIN request_details rq ON rd.request_fk = rq.id
            WHERE rd.receive_date BETWEEN ? AND ?
            AND rd.approval_status = 'APPROVED'
            ORDER BY rd.receive_date DESC`, [fromDate, toDate]);
        res.status(200).json(rows);
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getDailyReceiveDetails: ${msg}`, 'reportLog.log');
        res.status(500).json({ error: 'Internal Server Error', message: msg });
    }
};
export const getDailyRRPDetails = async (req: Request, res: Response): Promise<void> => {
    const { fromDate, toDate } = req.query as {
        fromDate?: string;
        toDate?: string;
    };
    if (!fromDate || !toDate) {
        res.status(400).json({ error: 'Bad Request', message: 'fromDate and toDate are required' });
        return;
    }
    try {
        const [rows] = await pool.query<RowDataPacket[]>(`SELECT 
                rrp.id,
                rrp.rrp_number,
                rrp.date as rrp_date,
                rrp.supplier_name,
                rrp.currency,
                rrp.forex_rate,
                rrp.invoice_number,
                rrp.invoice_date,
                rrp.po_number,
                rrp.airway_bill_number,
                rrp.approval_status,
                rrp.created_by,
                rd.item_name,
                rd.nac_code,
                rd.part_number,
                rd.received_quantity,
                rd.unit,
                rq.request_number,
                rq.request_date,
                rq.requested_by,
                rq.equipment_number
            FROM rrp_details rrp
            JOIN receive_details rd ON rrp.receive_fk = rd.id
            JOIN request_details rq ON rd.request_fk = rq.id
            WHERE rrp.date BETWEEN ? AND ?
            AND rrp.approval_status = 'APPROVED'
            ORDER BY rrp.date DESC`, [fromDate, toDate]);
        res.status(200).json(rows);
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getDailyRRPDetails: ${msg}`, 'reportLog.log');
        res.status(500).json({ error: 'Internal Server Error', message: msg });
    }
};
export const getDashboardTotals = async (req: Request, res: Response): Promise<void> => {
    try {
        const { fromDate, toDate } = req.query as {
            fromDate?: string;
            toDate?: string;
        };
        let requestWhereClause = '';
        let receiveWhereClause = '';
        let issueWhereClause = '';
        let rrpWhereClause = '';
        let requestParams: string[] = [];
        let receiveParams: string[] = [];
        let issueParams: string[] = [];
        let rrpParams: string[] = [];
        if (fromDate && toDate) {
            requestWhereClause = 'WHERE request_date BETWEEN ? AND ?';
            receiveWhereClause = 'WHERE receive_date BETWEEN ? AND ?';
            issueWhereClause = 'WHERE issue_date BETWEEN ? AND ?';
            rrpWhereClause = 'WHERE date BETWEEN ? AND ?';
            requestParams = [fromDate, toDate];
            receiveParams = [fromDate, toDate];
            issueParams = [fromDate, toDate];
            rrpParams = [fromDate, toDate];
        }
        else if (fromDate) {
            requestWhereClause = 'WHERE request_date >= ?';
            receiveWhereClause = 'WHERE receive_date >= ?';
            issueWhereClause = 'WHERE issue_date >= ?';
            rrpWhereClause = 'WHERE date >= ?';
            requestParams = [fromDate];
            receiveParams = [fromDate];
            issueParams = [fromDate];
            rrpParams = [fromDate];
        }
        else if (toDate) {
            requestWhereClause = 'WHERE request_date <= ?';
            receiveWhereClause = 'WHERE receive_date <= ?';
            issueWhereClause = 'WHERE issue_date <= ?';
            rrpWhereClause = 'WHERE date <= ?';
            requestParams = [toDate];
            receiveParams = [toDate];
            issueParams = [toDate];
            rrpParams = [toDate];
        }
        const appendCondition = (clause: string, condition: string) => clause ? `${clause} AND ${condition}` : `WHERE ${condition}`;
        const applyAliasToIssueClause = (alias: string) => issueWhereClause ? issueWhereClause.replace(/issue_date/g, `${alias}.issue_date`) : '';
        const nonTenderCondition = "LOWER(COALESCE(NULLIF(receive_source, ''), 'purchase')) <> 'tender'";
        const tenderCondition = "LOWER(COALESCE(receive_source, '')) = 'tender'";
        const notRejectedCondition = "approval_status <> 'REJECTED'";
        const purchaseReceiveClause = appendCondition(receiveWhereClause, `${notRejectedCondition} AND ${nonTenderCondition}`);
        const tenderReceiveClause = appendCondition(receiveWhereClause, `${notRejectedCondition} AND ${tenderCondition}`);
        const notBalanceTransferCondition = "LOWER(COALESCE(rrp_number, '')) <> 'code transfer'";
        const processedRRPClause = appendCondition(rrpWhereClause, `${notBalanceTransferCondition} AND approval_status <> 'REJECTED'`);
        const voidRRPClause = appendCondition(rrpWhereClause, `${notBalanceTransferCondition} AND approval_status = 'REJECTED'`);
        const issueClauseWithAlias = applyAliasToIssueClause('i');
        const [uniqueRequestsResult, totalItemsRequestedResult, totalItemsReceivedResult, issuesProcessedResult, uniqueRRPsResult, totalItemsPaidForResult, purchaseReceivesResult, tenderReceivesResult, processedRRPsResult, voidRRPsResult, processedLocalRRPsResult, processedForeignRRPsResult, sparesTotalsResult, totalItemsIssuedResult, petrolIssuedQuantityResult, dieselIssuedQuantityResult, spareIssuedQuantityResult] = await Promise.all([
            pool.query<RowDataPacket[]>(`SELECT COUNT(DISTINCT request_number) as count FROM request_details ${requestWhereClause}`, requestParams.length > 0 ? requestParams : undefined),
            pool.query<RowDataPacket[]>(`SELECT COUNT(*) as count FROM request_details ${requestWhereClause}`, requestParams.length > 0 ? requestParams : undefined),
            pool.query<RowDataPacket[]>(`SELECT COUNT(*) as count FROM receive_details ${receiveWhereClause}`, receiveParams.length > 0 ? receiveParams : undefined),
            pool.query<RowDataPacket[]>(`SELECT COUNT(*) as count FROM issue_details ${issueWhereClause}`, issueParams.length > 0 ? issueParams : undefined),
            pool.query<RowDataPacket[]>(`SELECT COUNT(DISTINCT rrp_number) as count FROM rrp_details ${rrpWhereClause}`, rrpParams.length > 0 ? rrpParams : undefined),
            pool.query<RowDataPacket[]>(`SELECT COUNT(*) as count FROM rrp_details ${rrpWhereClause}`, rrpParams.length > 0 ? rrpParams : undefined),
            pool.query<RowDataPacket[]>(`SELECT COUNT(*) as count FROM receive_details ${purchaseReceiveClause}`, receiveParams.length > 0 ? receiveParams : undefined),
            pool.query<RowDataPacket[]>(`SELECT COUNT(*) as count FROM receive_details ${tenderReceiveClause}`, receiveParams.length > 0 ? receiveParams : undefined),
            pool.query<RowDataPacket[]>(`SELECT COUNT(*) as count FROM rrp_details ${processedRRPClause}`, rrpParams.length > 0 ? rrpParams : undefined),
            pool.query<RowDataPacket[]>(`SELECT COUNT(*) as count FROM rrp_details ${voidRRPClause}`, rrpParams.length > 0 ? rrpParams : undefined),
            pool.query<RowDataPacket[]>(`SELECT COUNT(*) as count FROM rrp_details ${appendCondition(processedRRPClause, "LOWER(rrp_number) LIKE 'l%'")}`, rrpParams.length > 0 ? rrpParams : undefined),
            pool.query<RowDataPacket[]>(`SELECT COUNT(*) as count FROM rrp_details ${appendCondition(processedRRPClause, "LOWER(rrp_number) LIKE 'f%'")}`, rrpParams.length > 0 ? rrpParams : undefined),
            pool.query<RowDataPacket[]>(`SELECT 
                    COALESCE(SUM(current_balance), 0) as totalQuantity,
                    COALESCE(SUM(open_amount), 0) as totalValue
                 FROM stock_details`),
            pool.query<RowDataPacket[]>(`SELECT COALESCE(SUM(issue_quantity), 0) as totalQuantity FROM issue_details ${issueWhereClause}`, issueParams.length > 0 ? issueParams : undefined),
            pool.query<RowDataPacket[]>(`SELECT COALESCE(SUM(i.issue_quantity), 0) as totalQuantity
                 FROM issue_details i
                 JOIN fuel_records f ON f.issue_fk = i.id
                 ${appendCondition(issueClauseWithAlias, "LOWER(f.fuel_type) = 'petrol'")}`, issueParams.length > 0 ? issueParams : undefined),
            pool.query<RowDataPacket[]>(`SELECT COALESCE(SUM(i.issue_quantity), 0) as totalQuantity
                 FROM issue_details i
                 JOIN fuel_records f ON f.issue_fk = i.id
                 ${appendCondition(issueClauseWithAlias, "LOWER(f.fuel_type) = 'diesel'")}`, issueParams.length > 0 ? issueParams : undefined),
            pool.query<RowDataPacket[]>(`SELECT COALESCE(SUM(issue_quantity), 0) as totalQuantity
                 FROM issue_details
                 ${appendCondition(issueWhereClause, "nac_code NOT IN ('GT 07986', 'GT 00000')")}`, issueParams.length > 0 ? issueParams : undefined)
        ]);
        const totals = {
            uniqueRequests: uniqueRequestsResult[0][0]?.count || 0,
            totalItemsRequested: totalItemsRequestedResult[0][0]?.count || 0,
            totalItemsReceived: totalItemsReceivedResult[0][0]?.count || 0,
            issuesProcessed: issuesProcessedResult[0][0]?.count || 0,
            uniqueRRPs: uniqueRRPsResult[0][0]?.count || 0,
            totalItemsPaidFor: totalItemsPaidForResult[0][0]?.count || 0,
            purchaseReceives: purchaseReceivesResult[0][0]?.count || 0,
            tenderReceives: tenderReceivesResult[0][0]?.count || 0,
            processedRRPs: processedRRPsResult[0][0]?.count || 0,
            voidRRPs: voidRRPsResult[0][0]?.count || 0,
            processedLocalRRPs: processedLocalRRPsResult[0][0]?.count || 0,
            processedForeignRRPs: processedForeignRRPsResult[0][0]?.count || 0,
            totalSparesQuantity: Number(sparesTotalsResult[0][0]?.totalQuantity) || 0,
            totalSparesValue: Number(sparesTotalsResult[0][0]?.totalValue) || 0,
            totalItemsIssued: Number(totalItemsIssuedResult[0][0]?.totalQuantity) || 0,
            petrolIssuedQuantity: Number(petrolIssuedQuantityResult[0][0]?.totalQuantity) || 0,
            dieselIssuedQuantity: Number(dieselIssuedQuantityResult[0][0]?.totalQuantity) || 0,
            spareIssuedQuantity: Number(spareIssuedQuantityResult[0][0]?.totalQuantity) || 0
        };
        res.status(200).json(totals);
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getDashboardTotals: ${msg}`, 'reportLog.log');
        res.status(500).json({ error: 'Internal Server Error', message: msg });
    }
};
export const getReceiveRRPReport = async (req: Request, res: Response): Promise<void> => {
    try {
        const { fromDate, toDate, itemName, partNumber, nacCode, equipmentNumber, supplierName, hasRRP, page = '1', pageSize = '20' } = req.query;
        const pageNum = parseInt(page as string, 10) || 1;
        const pageSizeNum = Math.min(parseInt(pageSize as string, 10) || 20, 100);
        const offset = (pageNum - 1) * pageSizeNum;
        let whereClause = 'WHERE rd.approval_status = ?';
        const params: (string | number)[] = ['APPROVED'];
        if (fromDate && toDate) {
            whereClause += ' AND rd.receive_date BETWEEN ? AND ?';
            params.push(fromDate as string, toDate as string);
        }
        else if (fromDate) {
            whereClause += ' AND rd.receive_date >= ?';
            params.push(fromDate as string);
        }
        else if (toDate) {
            whereClause += ' AND rd.receive_date <= ?';
            params.push(toDate as string);
        }
        if (hasRRP === 'true') {
            whereClause += ' AND rd.rrp_fk IS NOT NULL';
        }
        else if (hasRRP === 'false') {
            whereClause += ' AND rd.rrp_fk IS NULL';
        }
        if (itemName) {
            whereClause += ' AND rd.item_name LIKE ?';
            params.push(`%${itemName}%`);
        }
        if (partNumber) {
            whereClause += ' AND rd.part_number LIKE ?';
            params.push(`%${partNumber}%`);
        }
        if (nacCode) {
            whereClause += ' AND rd.nac_code LIKE ?';
            params.push(`%${nacCode}%`);
        }
        if (equipmentNumber) {
            whereClause += ' AND rq.equipment_number LIKE ?';
            params.push(`%${equipmentNumber}%`);
        }
        if (supplierName) {
            whereClause += ' AND rrp.supplier_name LIKE ?';
            params.push(`%${supplierName}%`);
        }
        const countQuery = `
            SELECT COUNT(*) as total
            FROM receive_details rd
            LEFT JOIN request_details rq ON rd.request_fk = rq.id
            LEFT JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
            ${whereClause}
        `;
        const [countResult] = await pool.query<RowDataPacket[]>(countQuery, params);
        const total = (countResult[0] as {
            total: number;
        }).total || 0;
        const dataQuery = `
            SELECT 
                rd.id as receive_id,
                rd.receive_date as receive_date,
                rd.nac_code,
                rd.part_number,
                rd.item_name,
                rd.received_quantity,
                rd.unit,
                rd.received_by,
                rd.approval_status,
                rd.location,
                rd.card_number,
                rd.request_fk,
                rd.rrp_fk,
                rq.request_number,
                rq.request_date,
                rq.requested_by,
                rq.equipment_number,
                rrp.id as rrp_id,
                rrp.rrp_number,
                rrp.supplier_name,
                rrp.date as rrp_date,
                rrp.currency,
                rrp.forex_rate,
                rrp.item_price,
                rrp.customs_charge,
                rrp.customs_service_charge,
                rrp.vat_percentage,
                rrp.invoice_number,
                rrp.invoice_date,
                rrp.po_number,
                rrp.airway_bill_number,
                rrp.inspection_details,
                rrp.total_amount,
                rrp.freight_charge,
                rrp.customs_date,
                rrp.customs_number,
                rrp.reference_doc,
                rrp.approval_status as rrp_approval_status,
                rrp.created_by as rrp_created_by
            FROM receive_details rd
            LEFT JOIN request_details rq ON rd.request_fk = rq.id
            LEFT JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
            ${whereClause}
            ORDER BY rd.receive_date DESC, rd.id DESC
            LIMIT ? OFFSET ?
        `;
        const queryParams = [...params, pageSizeNum, offset];
        const [rows] = await pool.query<ReceiveRRPReportItem[]>(dataQuery, queryParams);
        const processedRows = rows.map(row => ({
            ...row,
            rrp_date: row.rrp_id && row.rrp_date ? row.rrp_date : null
        }));
        const response: ReceiveRRPReportResponse = {
            data: processedRows,
            pagination: {
                page: pageNum,
                pageSize: pageSizeNum,
                total,
                totalPages: Math.ceil(total / pageSizeNum)
            }
        };
        logEvents(`Successfully fetched receive and RRP report: ${processedRows.length} items`, 'reportLog.log');
        res.status(200).json(response);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getReceiveRRPReport: ${errorMessage}`, 'reportLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch receive and RRP report'
        });
    }
};
export const exportReceiveRRPReport = async (req: Request, res: Response): Promise<void> => {
    try {
        const { exportType, fromDate, toDate, page, pageSize, itemName, partNumber, nacCode, equipmentNumber, supplierName, hasRRP } = req.body;
        let whereClause = 'WHERE rd.approval_status = ?';
        const params: (string | number)[] = ['APPROVED'];
        if (fromDate && toDate) {
            whereClause += ' AND rd.receive_date BETWEEN ? AND ?';
            params.push(fromDate as string, toDate as string);
        }
        else if (fromDate) {
            whereClause += ' AND rd.receive_date >= ?';
            params.push(fromDate as string);
        }
        else if (toDate) {
            whereClause += ' AND rd.receive_date <= ?';
            params.push(toDate as string);
        }
        if (hasRRP === 'true') {
            whereClause += ' AND rd.rrp_fk IS NOT NULL';
        }
        else if (hasRRP === 'false') {
            whereClause += ' AND rd.rrp_fk IS NULL';
        }
        if (itemName) {
            whereClause += ' AND rd.item_name LIKE ?';
            params.push(`%${itemName}%`);
        }
        if (partNumber) {
            whereClause += ' AND rd.part_number LIKE ?';
            params.push(`%${partNumber}%`);
        }
        if (nacCode) {
            whereClause += ' AND rd.nac_code LIKE ?';
            params.push(`%${nacCode}%`);
        }
        if (equipmentNumber) {
            whereClause += ' AND rq.equipment_number LIKE ?';
            params.push(`%${equipmentNumber}%`);
        }
        if (supplierName) {
            whereClause += ' AND rrp.supplier_name LIKE ?';
            params.push(`%${supplierName}%`);
        }
        let limit = 10000;
        let offset = 0;
        if (exportType === 'currentPage' && page && pageSize) {
            limit = parseInt(pageSize as string, 10) || 20;
            offset = (parseInt(page as string, 10) - 1) * limit;
        }
        const dataQuery = `
            SELECT 
                rd.id as receive_id,
                rd.receive_date as receive_date,
                rd.nac_code,
                rd.part_number,
                rd.item_name,
                rd.received_quantity,
                rd.unit,
                rd.received_by,
                rd.approval_status,
                rd.location,
                rd.card_number,
                rq.request_number,
                rq.request_date,
                rq.requested_by,
                rq.equipment_number,
                rrp.id as rrp_id,
                rrp.rrp_number,
                rrp.supplier_name,
                rrp.date as rrp_date,
                rrp.currency,
                rrp.forex_rate,
                rrp.item_price,
                rrp.customs_charge,
                rrp.customs_service_charge,
                rrp.vat_percentage,
                rrp.invoice_number,
                rrp.invoice_date,
                rrp.po_number,
                rrp.airway_bill_number,
                rrp.inspection_details,
                rrp.total_amount,
                rrp.freight_charge,
                rrp.customs_date,
                rrp.customs_number,
                rrp.reference_doc,
                rrp.approval_status as rrp_approval_status,
                rrp.created_by as rrp_created_by
            FROM receive_details rd
            LEFT JOIN request_details rq ON rd.request_fk = rq.id
            LEFT JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
            ${whereClause}
            ORDER BY rd.receive_date DESC, rd.id DESC
            LIMIT ? OFFSET ?
        `;
        const queryParams = [...params, limit, offset];
        const [rows] = await pool.query<ReceiveRRPReportItem[]>(dataQuery, queryParams);
        const processedRows = rows.map(row => ({
            ...row,
            rrp_date: row.rrp_id && row.rrp_date ? row.rrp_date : null
        }));
        const excelData = processedRows.map((row) => ({
            'Receive Date': row.receive_date ? formatDate(row.receive_date) : 'N/A',
            'Item Name': row.item_name || 'N/A',
            'Part Number': row.part_number || 'N/A',
            'NAC Code': row.nac_code || 'N/A',
            'Quantity': `${row.received_quantity} ${row.unit || ''}`,
            'Request Number': row.request_number || 'N/A',
            'Request Date': row.request_date ? formatDate(row.request_date) : 'N/A',
            'Requested By': row.requested_by || 'N/A',
            'Equipment Number': row.equipment_number || 'N/A',
            'RRP Number': row.rrp_number || 'Not created',
            'RRP Date': row.rrp_date ? formatDate(row.rrp_date) : '-',
            'Supplier Name': row.supplier_name || '-',
            'Currency': row.currency || '-',
            'Forex Rate': row.forex_rate || '-',
            'Item Price': row.item_price || '-',
            'Customs Charge': row.customs_charge || '-',
            'Customs Service Charge': row.customs_service_charge || '-',
            'VAT Percentage': row.vat_percentage || '-',
            'Total Amount': row.total_amount ? `${row.currency || ''} ${Number(row.total_amount).toFixed(2)}` : '-',
            'Invoice Number': row.invoice_number || '-',
            'Invoice Date': row.invoice_date ? formatDate(row.invoice_date) : '-',
            'PO Number': row.po_number || '-',
            'Airway Bill Number': row.airway_bill_number || '-',
            'RRP Approval Status': row.rrp_approval_status || '-',
            'Location': row.location || '-',
            'Card Number': row.card_number || '-',
            'Received By': row.received_by || '-'
        }));
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Receive and RRP Report');
        if (excelData.length > 0) {
            const headers = Object.keys(excelData[0]);
            worksheet.columns = headers.map((h) => ({ header: h, key: h }));
            const headerRow = worksheet.getRow(1);
            headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            headerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF003594' }
            };
            excelData.forEach((row) => {
                worksheet.addRow(row);
            });
            worksheet.columns.forEach((column) => {
                if (column.header) {
                    let maxLength = column.header.length;
                    worksheet.getColumn(column.key as string).eachCell({ includeEmpty: false }, (cell) => {
                        const cellLength = cell.value ? String(cell.value).length : 10;
                        if (cellLength > maxLength) {
                            maxLength = cellLength;
                        }
                    });
                    column.width = Math.min(maxLength + 2, 50);
                }
            });
        }
        else {
            worksheet.addRow(['No records found for the selected criteria']);
        }
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Receive_RRP_Report_${new Date().toISOString().split('T')[0]}.xlsx"`);
        await workbook.xlsx.write(res);
        logEvents(`Successfully exported receive and RRP report: ${excelData.length} items`, 'reportLog.log');
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in exportReceiveRRPReport: ${errorMessage}`, 'reportLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to export receive and RRP report'
        });
    }
};
interface StockReportItem {
    nac_code: string;
    item_name: string;
    part_number: string;
    alternate_part_numbers: string;
    equipment_number: string;
    alternate_equipment_numbers: string;
    open_quantity: number;
    open_amount: number;
    received_quantity: number;
    rrp_quantity: number;
    rrp_amount: number;
    issue_quantity: number;
    issue_amount: number;
    balance_quantity: number;
    true_balance_quantity: number;
    true_balance_amount: number;
    location: string;
    card_number: string;
}
export const getCurrentStockReport = async (req: Request, res: Response): Promise<void> => {
    const { fromDate, toDate, nacCode, itemName, partNumber, equipmentNumber, createdDateFrom, createdDateTo, page = 1, pageSize = 20 } = req.query;
    const connection = await pool.getConnection();
    try {
        const defaultFromDate = '2025-07-17';
        const defaultToDate = new Date().toISOString().split('T')[0];
        const reportFromDate = fromDate ? String(fromDate) : defaultFromDate;
        const reportToDate = toDate ? String(toDate) : defaultToDate;
        let whereConditions: string[] = [];
        const params: (string | number)[] = [];
        if (nacCode && String(nacCode).trim() !== '') {
            whereConditions.push('s.nac_code LIKE ?');
            params.push(`%${String(nacCode)}%`);
        }
        if (itemName && String(itemName).trim() !== '') {
            whereConditions.push('s.item_name LIKE ?');
            params.push(`%${String(itemName)}%`);
        }
        if (partNumber && String(partNumber).trim() !== '') {
            whereConditions.push('s.part_numbers LIKE ?');
            params.push(`%${String(partNumber)}%`);
        }
        if (equipmentNumber && String(equipmentNumber).trim() !== '') {
            whereConditions.push('s.applicable_equipments LIKE ?');
            params.push(`%${String(equipmentNumber)}%`);
        }
        if (createdDateFrom && String(createdDateFrom).trim() !== '') {
            whereConditions.push('DATE(s.created_at) >= ?');
            params.push(String(createdDateFrom));
        }
        if (createdDateTo && String(createdDateTo).trim() !== '') {
            whereConditions.push('DATE(s.created_at) <= ?');
            params.push(String(createdDateTo));
        }
        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        const filtersClause = whereConditions.length > 0 ? ` AND ${whereConditions.join(' AND ')}` : '';
        const countQuery = `SELECT COUNT(DISTINCT s.nac_code) as total FROM stock_details s ${whereClause}`;
        const [countResult] = await connection.execute<RowDataPacket[]>(countQuery, params);
        const totalCount = countResult[0]?.total || 0;
        const currentPage = parseInt(String(page)) || 1;
        const limitNum = parseInt(String(pageSize)) || 20;
        const offsetNum = (currentPage - 1) * limitNum;
        const query = `
            SELECT 
                s.nac_code,
                s.item_name,
                s.part_numbers,
                s.applicable_equipments,
                s.location,
                s.card_number,
                s.open_quantity,
                s.open_amount,
                -- Calculate opening balance (open + receives before fromDate - issues before fromDate)
                (
                    SELECT COALESCE(SUM(rd.received_quantity), 0)
                    FROM receive_details rd
                    WHERE rd.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
                    AND rd.approval_status = 'APPROVED'
                    AND rd.receive_date < ?
                ) as pre_date_receive_qty,
                (
                    SELECT COALESCE(SUM(id.issue_quantity), 0)
                    FROM issue_details id
                    WHERE id.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
                    AND id.approval_status = 'APPROVED'
                    AND id.issue_date < ?
                ) as pre_date_issue_qty,
                -- Received quantity within date range
                (
                    SELECT COALESCE(SUM(rd.received_quantity), 0)
                    FROM receive_details rd
                    WHERE rd.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
                    AND rd.approval_status = 'APPROVED'
                    AND rd.receive_date BETWEEN ? AND ?
                ) as received_quantity,
                -- RRP quantity and amount within date range
                (
                    SELECT COALESCE(SUM(rd.received_quantity), 0)
                    FROM receive_details rd
                    JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
                    WHERE rd.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
                    AND rd.approval_status = 'APPROVED'
                    AND rd.rrp_fk IS NOT NULL
                    AND rd.receive_date BETWEEN ? AND ?
                ) as rrp_quantity,
                (
                    SELECT COALESCE(SUM(rrp.total_amount), 0)
                    FROM receive_details rd
                    JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
                    WHERE rd.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
                    AND rd.approval_status = 'APPROVED'
                    AND rd.rrp_fk IS NOT NULL
                    AND rd.receive_date BETWEEN ? AND ?
                ) as rrp_amount,
                -- Issue quantity and amount within date range
                (
                    SELECT COALESCE(SUM(id.issue_quantity), 0)
                    FROM issue_details id
                    WHERE id.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
                    AND id.approval_status = 'APPROVED'
                    AND id.issue_date BETWEEN ? AND ?
                ) as issue_quantity,
                (
                    SELECT COALESCE(SUM(id.issue_cost), 0)
                    FROM issue_details id
                    WHERE id.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
                    AND id.approval_status = 'APPROVED'
                    AND id.issue_date BETWEEN ? AND ?
                ) as issue_amount
            FROM stock_details s
            ${whereClause}
            ORDER BY s.nac_code ASC
            LIMIT ${limitNum} OFFSET ${offsetNum}
        `;
        const queryParams: (string | number)[] = [
            reportFromDate,
            reportFromDate,
            reportFromDate, reportToDate,
            reportFromDate, reportToDate,
            reportFromDate, reportToDate,
            reportFromDate, reportToDate,
            reportFromDate, reportToDate,
            ...params
        ];
        logEvents(`Executing stock report query with ${queryParams.length} parameters: ${JSON.stringify(queryParams.slice(0, 10))}...`, 'reportLog.log');
        const [results] = await connection.execute<RowDataPacket[]>(query, queryParams);
        const [openSumRows] = await connection.execute<RowDataPacket[]>(`SELECT 
                COALESCE(SUM(s.open_quantity), 0) as sum_open_quantity,
                COALESCE(SUM(s.open_amount), 0) as sum_open_amount
             FROM stock_details s
             ${whereClause}`, params);
        const sumOpenQuantity = Number(openSumRows[0]?.sum_open_quantity || 0);
        const sumOpenAmount = Number(openSumRows[0]?.sum_open_amount || 0);
        const reportItems: StockReportItem[] = results.map((row: any) => {
            const openQty = (typeof row.open_quantity === 'string' ? parseFloat(row.open_quantity) : row.open_quantity) || 0;
            const openAmt = (typeof row.open_amount === 'string' ? parseFloat(row.open_amount) : row.open_amount) || 0;
            const preDateReceiveQty = Number(row.pre_date_receive_qty) || 0;
            const preDateIssueQty = Number(row.pre_date_issue_qty) || 0;
            const calculatedOpenQty = openQty + preDateReceiveQty - preDateIssueQty;
            const receivedQty = Number(row.received_quantity) || 0;
            const rrpQty = Number(row.rrp_quantity) || 0;
            const rrpAmt = Number(row.rrp_amount) || 0;
            const issueQty = Number(row.issue_quantity) || 0;
            const issueAmt = Number(row.issue_amount) || 0;
            const balanceQty = calculatedOpenQty + receivedQty - issueQty;
            const trueBalanceQty = calculatedOpenQty + rrpQty - issueQty;
            const trueBalanceAmt = openAmt + rrpAmt - issueAmt;
            const partNumbers = String(row.part_numbers || '').split(',').map((p: string) => p.trim()).filter((p: string) => p);
            const primaryPartNumber = partNumbers[0] || '';
            const alternatePartNumbers = partNumbers.slice(1).join(', ') || '';
            const equipmentNumbers = String(row.applicable_equipments || '').split(',').map((e: string) => e.trim()).filter((e: string) => e);
            const primaryEquipmentNumber = equipmentNumbers[0] || '';
            const alternateEquipmentNumbers = equipmentNumbers.slice(1).join(', ') || '';
            return {
                nac_code: row.nac_code || '',
                item_name: row.item_name || '',
                part_number: primaryPartNumber,
                alternate_part_numbers: alternatePartNumbers,
                equipment_number: primaryEquipmentNumber,
                alternate_equipment_numbers: alternateEquipmentNumbers,
                open_quantity: calculatedOpenQty,
                open_amount: openAmt,
                received_quantity: receivedQty,
                rrp_quantity: rrpQty,
                rrp_amount: rrpAmt,
                issue_quantity: issueQty,
                issue_amount: issueAmt,
                balance_quantity: balanceQty,
                true_balance_quantity: trueBalanceQty,
                true_balance_amount: trueBalanceAmt,
                location: row.location || '',
                card_number: row.card_number || ''
            };
        });
        const totals = {
            open_quantity: sumOpenQuantity,
            open_amount: sumOpenAmount
        };
        logEvents(`Successfully generated current stock report: ${reportItems.length} items`, 'reportLog.log');
        res.status(200).json({
            data: reportItems,
            pagination: {
                currentPage,
                pageSize: limitNum,
                totalCount,
                totalPages: Math.ceil(totalCount / limitNum)
            },
            totals
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getCurrentStockReport: ${errorMessage}`, 'reportLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to generate current stock report'
        });
    }
    finally {
        connection.release();
    }
};
export const exportCurrentStockReport = async (req: Request, res: Response): Promise<void> => {
    const { fromDate, toDate, nacCode, itemName, partNumber, equipmentNumber, createdDateFrom, createdDateTo, exportType, page, pageSize } = req.body;
    const connection = await pool.getConnection();
    try {
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Stock Report');
        const defaultFromDate = '2025-07-17';
        const defaultToDate = new Date().toISOString().split('T')[0];
        let reportFromDate = fromDate || defaultFromDate;
        let reportToDate = toDate || defaultToDate;
        let exportLimit = 10000;
        let exportOffset = 0;
        if (exportType === 'currentPage' && page && pageSize) {
            exportLimit = parseInt(String(pageSize));
            exportOffset = (parseInt(String(page)) - 1) * exportLimit;
        }
        else if (exportType === 'dateRange' && fromDate && toDate) {
            reportFromDate = fromDate;
            reportToDate = toDate;
        }
        let whereConditions: string[] = [];
        const params: (string | number)[] = [];
        if (nacCode && String(nacCode).trim() !== '') {
            whereConditions.push('s.nac_code LIKE ?');
            params.push(`%${String(nacCode)}%`);
        }
        if (itemName && String(itemName).trim() !== '') {
            whereConditions.push('s.item_name LIKE ?');
            params.push(`%${String(itemName)}%`);
        }
        if (partNumber && String(partNumber).trim() !== '') {
            whereConditions.push('s.part_numbers LIKE ?');
            params.push(`%${String(partNumber)}%`);
        }
        if (equipmentNumber && String(equipmentNumber).trim() !== '') {
            whereConditions.push('s.applicable_equipments LIKE ?');
            params.push(`%${String(equipmentNumber)}%`);
        }
        if (createdDateFrom && String(createdDateFrom).trim() !== '') {
            whereConditions.push('DATE(s.created_at) >= ?');
            params.push(String(createdDateFrom));
        }
        if (createdDateTo && String(createdDateTo).trim() !== '') {
            whereConditions.push('DATE(s.created_at) <= ?');
            params.push(String(createdDateTo));
        }
        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        const query = `
            SELECT 
                s.nac_code,
                s.item_name,
                s.part_numbers,
                s.applicable_equipments,
                s.location,
                s.card_number,
                s.open_quantity,
                s.open_amount,
                (
                    SELECT COALESCE(SUM(rd.received_quantity), 0)
                    FROM receive_details rd
                    WHERE rd.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
                    AND rd.approval_status = 'APPROVED'
                    AND rd.receive_date < ?
                ) as pre_date_receive_qty,
                (
                    SELECT COALESCE(SUM(id.issue_quantity), 0)
                    FROM issue_details id
                    WHERE id.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
                    AND id.approval_status = 'APPROVED'
                    AND id.issue_date < ?
                ) as pre_date_issue_qty,
                (
                    SELECT COALESCE(SUM(rd.received_quantity), 0)
                    FROM receive_details rd
                    WHERE rd.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
                    AND rd.approval_status = 'APPROVED'
                    AND rd.receive_date BETWEEN ? AND ?
                ) as received_quantity,
                (
                    SELECT COALESCE(SUM(rd.received_quantity), 0)
                    FROM receive_details rd
                    JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
                    WHERE rd.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
                    AND rd.approval_status = 'APPROVED'
                    AND rd.rrp_fk IS NOT NULL
                    AND rd.receive_date BETWEEN ? AND ?
                ) as rrp_quantity,
                (
                    SELECT COALESCE(SUM(rrp.total_amount), 0)
                    FROM receive_details rd
                    JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
                    WHERE rd.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
                    AND rd.approval_status = 'APPROVED'
                    AND rd.rrp_fk IS NOT NULL
                    AND rd.receive_date BETWEEN ? AND ?
                ) as rrp_amount,
                (
                    SELECT COALESCE(SUM(id.issue_quantity), 0)
                    FROM issue_details id
                    WHERE id.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
                    AND id.approval_status = 'APPROVED'
                    AND id.issue_date BETWEEN ? AND ?
                ) as issue_quantity,
                (
                    SELECT COALESCE(SUM(id.issue_cost), 0)
                    FROM issue_details id
                    WHERE id.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
                    AND id.approval_status = 'APPROVED'
                    AND id.issue_date BETWEEN ? AND ?
                ) as issue_amount
            FROM stock_details s
            ${whereClause}
            ORDER BY s.nac_code ASC
            LIMIT ${exportLimit} OFFSET ${exportOffset}
        `;
        const queryParams: (string | number)[] = [
            reportFromDate, reportFromDate,
            reportFromDate, reportToDate,
            reportFromDate, reportToDate,
            reportFromDate, reportToDate,
            reportFromDate, reportToDate,
            reportFromDate, reportToDate,
            ...params
        ];
        const [results] = await connection.execute<RowDataPacket[]>(query, queryParams);
        const excelData: StockReportItem[] = results.map((row: any) => {
            const openQty = (typeof row.open_quantity === 'string' ? parseFloat(row.open_quantity) : row.open_quantity) || 0;
            const openAmt = (typeof row.open_amount === 'string' ? parseFloat(row.open_amount) : row.open_amount) || 0;
            const preDateReceiveQty = Number(row.pre_date_receive_qty) || 0;
            const preDateIssueQty = Number(row.pre_date_issue_qty) || 0;
            const calculatedOpenQty = openQty + preDateReceiveQty - preDateIssueQty;
            const receivedQty = Number(row.received_quantity) || 0;
            const rrpQty = Number(row.rrp_quantity) || 0;
            const rrpAmt = Number(row.rrp_amount) || 0;
            const issueQty = Number(row.issue_quantity) || 0;
            const issueAmt = Number(row.issue_amount) || 0;
            const balanceQty = calculatedOpenQty + receivedQty - issueQty;
            const trueBalanceQty = calculatedOpenQty + rrpQty - issueQty;
            const trueBalanceAmt = openAmt + rrpAmt - issueAmt;
            const partNumbers = String(row.part_numbers || '').split(',').map((p: string) => p.trim()).filter((p: string) => p);
            const primaryPartNumber = partNumbers[0] || '';
            const alternatePartNumbers = partNumbers.slice(1).join(', ') || '';
            const equipmentNumbers = String(row.applicable_equipments || '').split(',').map((e: string) => e.trim()).filter((e: string) => e);
            const primaryEquipmentNumber = equipmentNumbers[0] || '';
            const alternateEquipmentNumbers = equipmentNumbers.slice(1).join(', ') || '';
            return {
                nac_code: row.nac_code || '',
                item_name: row.item_name || '',
                part_number: primaryPartNumber,
                alternate_part_numbers: alternatePartNumbers,
                equipment_number: primaryEquipmentNumber,
                alternate_equipment_numbers: alternateEquipmentNumbers,
                open_quantity: calculatedOpenQty,
                open_amount: openAmt,
                received_quantity: receivedQty,
                rrp_quantity: rrpQty,
                rrp_amount: rrpAmt,
                issue_quantity: issueQty,
                issue_amount: issueAmt,
                balance_quantity: balanceQty,
                true_balance_quantity: trueBalanceQty,
                true_balance_amount: trueBalanceAmt,
                location: row.location || '',
                card_number: row.card_number || ''
            };
        });
        worksheet.addRow([
            'NAC Code',
            'Item Name',
            'Part Number',
            'Alternate Part Numbers',
            'Equipment Number',
            'Alternate Equipment Numbers',
            'Open Quantity',
            'Open Amount',
            'Received Quantity',
            'RRP Quantity',
            'RRP Amount',
            'Issue Quantity',
            'Issue Amount',
            'Balance Quantity',
            'True Balance Quantity',
            'True Balance Amount',
            'Location',
            'Card Number'
        ]);
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF003594' }
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        excelData.forEach((item) => {
            worksheet.addRow([
                item.nac_code || '',
                item.item_name || '',
                item.part_number || '',
                item.alternate_part_numbers || '',
                item.equipment_number || '',
                item.alternate_equipment_numbers || '',
                item.open_quantity || 0,
                item.open_amount || 0,
                item.received_quantity || 0,
                item.rrp_quantity || 0,
                item.rrp_amount || 0,
                item.issue_quantity || 0,
                item.issue_amount || 0,
                item.balance_quantity || 0,
                item.true_balance_quantity || 0,
                item.true_balance_amount || 0,
                item.location || '',
                item.card_number || ''
            ]);
        });
        worksheet.columns.forEach((column: any) => {
            if (column) {
                let maxLength = 10;
                column.eachCell({ includeEmpty: true }, (cell: any) => {
                    const cellLength = cell.value ? String(cell.value).length : 10;
                    if (cellLength > maxLength) {
                        maxLength = cellLength;
                    }
                });
                column.width = Math.min(maxLength + 2, 50);
            }
        });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Current_Stock_Report_${new Date().toISOString().split('T')[0]}.xlsx"`);
        await workbook.xlsx.write(res);
        logEvents(`Successfully exported current stock report: ${excelData.length} items`, 'reportLog.log');
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in exportCurrentStockReport: ${errorMessage}`, 'reportLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to export current stock report'
        });
    }
    finally {
        connection.release();
    }
};
interface StockHistoryItem {
    transaction_type: 'RECEIVE' | 'ISSUE';
    transaction_date: string;
    transaction_number: string;
    quantity: number;
    amount: number;
    received_by?: string;
    issued_by?: string | {
        name: string;
    };
    issued_for?: string;
    approval_status: string;
    request_number?: string;
    rrp_fk?: number;
    part_number?: string;
    equipment_number?: string;
}
export const getStockHistory = async (req: Request, res: Response): Promise<void> => {
    const { nacCode, fromDate, toDate } = req.query;
    const connection = await pool.getConnection();
    try {
        if (!nacCode) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'NAC code is required'
            });
            return;
        }
        if (!fromDate || !toDate) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'fromDate and toDate are required'
            });
            return;
        }
        const reportFromDate = String(fromDate);
        const reportToDate = String(toDate);
        const receiveQuery = `
            SELECT 
                'RECEIVE' as transaction_type,
                rd.receive_date as transaction_date,
                CONCAT('REC-', rd.id) as transaction_number,
                rd.received_quantity as quantity,
                COALESCE(rrp.total_amount, 0) as amount,
                rd.received_by,
                NULL as issued_by,
                NULL as issued_for,
                rd.approval_status,
                CASE 
                    WHEN rd.receive_source = 'tender' THEN CONCAT('TENDER-', COALESCE(rd.tender_reference_number, ''))
                    ELSE COALESCE(req.request_number, '')
                END AS request_number,
                rd.rrp_fk,
                rd.part_number,
                COALESCE(NULLIF(rd.equipment_number, ''), COALESCE(req.equipment_number, '')) AS equipment_number
            FROM receive_details rd
            LEFT JOIN request_details req ON rd.request_fk = req.id
            LEFT JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
            WHERE rd.nac_code COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
            AND rd.receive_date BETWEEN ? AND ?
            ORDER BY rd.receive_date DESC, rd.id DESC
        `;
        const issueQuery = `
            SELECT 
                'ISSUE' as transaction_type,
                id.issue_date as transaction_date,
                id.issue_slip_number as transaction_number,
                id.issue_quantity as quantity,
                id.issue_cost as amount,
                NULL as received_by,
                id.issued_by,
                id.issued_for,
                id.approval_status,
                NULL as request_number,
                NULL as rrp_fk,
                id.part_number,
                id.issued_for as equipment_number
            FROM issue_details id
            WHERE id.nac_code COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
            AND id.issue_date BETWEEN ? AND ?
            ORDER BY id.issue_date DESC, id.id DESC
        `;
        const [receives] = await connection.execute<RowDataPacket[]>(receiveQuery, [nacCode, reportFromDate, reportToDate]);
        const [issues] = await connection.execute<RowDataPacket[]>(issueQuery, [nacCode, reportFromDate, reportToDate]);
        const history: StockHistoryItem[] = [
            ...receives.map((row: any) => ({
                transaction_type: 'RECEIVE' as const,
                transaction_date: row.transaction_date,
                transaction_number: row.transaction_number,
                quantity: Number(row.quantity) || 0,
                amount: Number(row.amount) || 0,
                received_by: row.received_by || '',
                approval_status: row.approval_status || '',
                request_number: row.request_number || '',
                rrp_fk: row.rrp_fk || null,
                part_number: row.part_number || '',
                equipment_number: row.equipment_number || ''
            })),
            ...issues.map((row: any) => ({
                transaction_type: 'ISSUE' as const,
                transaction_date: row.transaction_date,
                transaction_number: row.transaction_number,
                quantity: Number(row.quantity) || 0,
                amount: Number(row.amount) || 0,
                issued_by: typeof row.issued_by === 'string' ? JSON.parse(row.issued_by) : row.issued_by,
                issued_for: row.issued_for || '',
                approval_status: row.approval_status || '',
                part_number: row.part_number || '',
                equipment_number: row.equipment_number || ''
            }))
        ].sort((a, b) => {
            const dateA = new Date(a.transaction_date).getTime();
            const dateB = new Date(b.transaction_date).getTime();
            if (dateB !== dateA)
                return dateB - dateA;
            if (a.transaction_type === 'RECEIVE' && b.transaction_type === 'ISSUE')
                return -1;
            if (a.transaction_type === 'ISSUE' && b.transaction_type === 'RECEIVE')
                return 1;
            return 0;
        });
        res.status(200).json({
            history,
            total: history.length
        });
        logEvents(`Successfully fetched stock history for NAC code: ${nacCode}`, 'reportLog.log');
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getStockHistory: ${errorMessage}`, 'reportLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch stock history'
        });
    }
    finally {
        connection.release();
    }
};
export const exportStockHistory = async (req: Request, res: Response): Promise<void> => {
    const { nacCode, fromDate, toDate } = req.body;
    const connection = await pool.getConnection();
    try {
        if (!nacCode || !fromDate || !toDate) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'NAC code, fromDate, and toDate are required'
            });
            return;
        }
        const reportFromDate = String(fromDate);
        const reportToDate = String(toDate);
        const [stockItem] = await connection.execute<RowDataPacket[]>(`SELECT nac_code, item_name, part_numbers, applicable_equipments, location, card_number 
             FROM stock_details 
             WHERE nac_code COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci 
             LIMIT 1`, [nacCode]);
        const receiveQuery = `
            SELECT 
                'RECEIVE' as transaction_type,
                rd.receive_date as transaction_date,
                CONCAT('REC-', rd.id) as transaction_number,
                rd.received_quantity as quantity,
                COALESCE(rrp.total_amount, 0) as amount,
                rd.received_by,
                NULL as issued_by,
                NULL as issued_for,
                rd.approval_status,
                CASE 
                    WHEN rd.receive_source = 'tender' THEN CONCAT('TENDER-', COALESCE(rd.tender_reference_number, ''))
                    ELSE COALESCE(req.request_number, '')
                END AS request_number,
                rd.rrp_fk,
                rd.part_number,
                COALESCE(NULLIF(rd.equipment_number, ''), COALESCE(req.equipment_number, '')) AS equipment_number
            FROM receive_details rd
            LEFT JOIN request_details req ON rd.request_fk = req.id
            LEFT JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
            WHERE rd.nac_code COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
            AND rd.receive_date BETWEEN ? AND ?
            ORDER BY rd.receive_date DESC, rd.id DESC
        `;
        const issueQuery = `
            SELECT 
                'ISSUE' as transaction_type,
                id.issue_date as transaction_date,
                id.issue_slip_number as transaction_number,
                id.issue_quantity as quantity,
                id.issue_cost as amount,
                NULL as received_by,
                id.issued_by,
                id.issued_for,
                id.approval_status,
                NULL as request_number,
                NULL as rrp_fk,
                id.part_number,
                id.issued_for as equipment_number
            FROM issue_details id
            WHERE id.nac_code COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
            AND id.issue_date BETWEEN ? AND ?
            ORDER BY id.issue_date DESC, id.id DESC
        `;
        const [receives] = await connection.execute<RowDataPacket[]>(receiveQuery, [nacCode, reportFromDate, reportToDate]);
        const [issues] = await connection.execute<RowDataPacket[]>(issueQuery, [nacCode, reportFromDate, reportToDate]);
        const history: StockHistoryItem[] = [
            ...receives.map((row: any) => ({
                transaction_type: 'RECEIVE' as const,
                transaction_date: row.transaction_date,
                transaction_number: row.transaction_number,
                quantity: Number(row.quantity) || 0,
                amount: Number(row.amount) || 0,
                received_by: row.received_by || '',
                approval_status: row.approval_status || '',
                request_number: row.request_number || '',
                rrp_fk: row.rrp_fk || null,
                part_number: row.part_number || '',
                equipment_number: row.equipment_number || ''
            })),
            ...issues.map((row: any) => ({
                transaction_type: 'ISSUE' as const,
                transaction_date: row.transaction_date,
                transaction_number: row.transaction_number,
                quantity: Number(row.quantity) || 0,
                amount: Number(row.amount) || 0,
                issued_by: typeof row.issued_by === 'string' ? JSON.parse(row.issued_by) : row.issued_by,
                issued_for: row.issued_for || '',
                approval_status: row.approval_status || '',
                part_number: row.part_number || '',
                equipment_number: row.equipment_number || ''
            }))
        ].sort((a, b) => {
            const dateA = new Date(a.transaction_date).getTime();
            const dateB = new Date(b.transaction_date).getTime();
            if (dateB !== dateA)
                return dateB - dateA;
            if (a.transaction_type === 'RECEIVE' && b.transaction_type === 'ISSUE')
                return -1;
            if (a.transaction_type === 'ISSUE' && b.transaction_type === 'RECEIVE')
                return 1;
            return 0;
        });
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Stock History');
        if (stockItem.length > 0) {
            const item = stockItem[0];
            worksheet.addRow(['NAC Code:', item.nac_code || '']);
            worksheet.addRow(['Item Name:', item.item_name || '']);
            worksheet.addRow(['Part Numbers:', item.part_numbers || '']);
            worksheet.addRow(['Equipment Numbers:', item.applicable_equipments || '']);
            worksheet.addRow(['Location:', item.location || '']);
            worksheet.addRow(['Card Number:', item.card_number || '']);
            worksheet.addRow(['']);
            worksheet.addRow(['Date Range:', `${reportFromDate} to ${reportToDate}`]);
            worksheet.addRow(['']);
        }
        worksheet.addRow([
            'Transaction Type',
            'Date',
            'Transaction Number',
            'Quantity',
            'Amount',
            'Received By',
            'Issued By',
            'Issued For',
            'Approval Status',
            'Request Number',
            'RRP FK',
            'Part Number',
            'Equipment Number'
        ]);
        const headerRow = worksheet.getRow(worksheet.rowCount);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF003594' }
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        history.forEach((item) => {
            const issuedByStr = item.issued_by ? (typeof item.issued_by === 'object' ? item.issued_by.name || '' : String(item.issued_by)) : '';
            worksheet.addRow([
                item.transaction_type,
                item.transaction_date,
                item.transaction_number,
                item.quantity,
                item.amount,
                item.received_by || '',
                issuedByStr,
                item.issued_for || '',
                item.approval_status,
                item.request_number || '',
                item.rrp_fk || '',
                item.part_number || '',
                item.equipment_number || ''
            ]);
        });
        worksheet.columns.forEach((column: any) => {
            if (column) {
                let maxLength = 10;
                column.eachCell({ includeEmpty: true }, (cell: any) => {
                    const cellLength = cell.value ? String(cell.value).length : 10;
                    if (cellLength > maxLength) {
                        maxLength = cellLength;
                    }
                });
                column.width = Math.min(maxLength + 2, 50);
            }
        });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Stock_History_${nacCode}_${new Date().toISOString().split('T')[0]}.xlsx"`);
        await workbook.xlsx.write(res);
        logEvents(`Successfully exported stock history for NAC code: ${nacCode}`, 'reportLog.log');
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in exportStockHistory: ${errorMessage}`, 'reportLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to export stock history'
        });
    }
    finally {
        connection.release();
    }
};
interface RRPDetailItem {
    id: number;
    rrp_number: string;
    supplier_name: string;
    date: string;
    item_price: number;
    total_amount: number;
    currency: string;
    forex_rate: number;
    received_quantity: number;
    unit: string;
    receive_date: string;
    approval_status: string;
    invoice_number: string;
    invoice_date: string;
    po_number: string;
    customs_charge?: number;
    freight_charge?: number;
    customs_service_charge?: number;
    vat_percentage?: number;
    airway_bill_number?: string;
    inspection_details?: string;
    part_number?: string;
    equipment_number?: string;
    request_number?: string;
}
export const getRRPDetailsForNAC = async (req: Request, res: Response): Promise<void> => {
    const { nacCode, fromDate, toDate } = req.query;
    const connection = await pool.getConnection();
    try {
        if (!nacCode) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'NAC code is required'
            });
            return;
        }
        const reportFromDate = fromDate ? String(fromDate) : null;
        const reportToDate = toDate ? String(toDate) : null;
        let dateFilter = '';
        const params: any[] = [String(nacCode)];
        if (reportFromDate && reportToDate) {
            dateFilter = 'AND rd.receive_date BETWEEN ? AND ?';
            params.push(reportFromDate, reportToDate);
        }
        const query = `
            SELECT 
                rrp.id,
                rrp.rrp_number,
                rrp.supplier_name,
                rrp.date,
                rrp.item_price,
                rrp.total_amount,
                rrp.currency,
                rrp.forex_rate,
                rd.received_quantity,
                rd.unit,
                rd.receive_date,
                rrp.approval_status,
                rrp.invoice_number,
                rrp.invoice_date,
                rrp.po_number,
                rrp.customs_charge,
                rrp.freight_charge,
                rrp.customs_service_charge,
                rrp.vat_percentage,
                rrp.airway_bill_number,
                rrp.inspection_details,
                rd.part_number,
                COALESCE(NULLIF(rd.equipment_number, ''), COALESCE(req.equipment_number, '')) AS equipment_number,
                CASE 
                    WHEN rd.receive_source = 'tender' THEN CONCAT('TENDER-', COALESCE(rd.tender_reference_number, ''))
                    ELSE COALESCE(req.request_number, '')
                END AS request_number
            FROM rrp_details rrp
            JOIN receive_details rd ON rrp.receive_fk = rd.id
            LEFT JOIN request_details req ON rd.request_fk = req.id
            WHERE rd.nac_code COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
            AND rd.rrp_fk IS NOT NULL
            ${dateFilter}
            ORDER BY rrp.date DESC, rrp.id DESC
        `;
        const [rows] = await connection.execute<RowDataPacket[]>(query, params);
        const rrpDetails: RRPDetailItem[] = rows.map((row: any) => ({
            id: row.id,
            rrp_number: row.rrp_number || '',
            supplier_name: row.supplier_name || '',
            date: row.date || '',
            item_price: Number(row.item_price) || 0,
            total_amount: Number(row.total_amount) || 0,
            currency: row.currency || '',
            forex_rate: Number(row.forex_rate) || 1,
            received_quantity: Number(row.received_quantity) || 0,
            unit: row.unit || '',
            receive_date: row.receive_date || '',
            approval_status: row.approval_status || '',
            invoice_number: row.invoice_number || '',
            invoice_date: row.invoice_date || '',
            po_number: row.po_number || '',
            customs_charge: Number(row.customs_charge) || 0,
            freight_charge: Number(row.freight_charge) || 0,
            customs_service_charge: Number(row.customs_service_charge) || 0,
            vat_percentage: Number(row.vat_percentage) || 0,
            airway_bill_number: row.airway_bill_number || '',
            inspection_details: row.inspection_details || '',
            part_number: row.part_number || '',
            equipment_number: row.equipment_number || '',
            request_number: row.request_number || ''
        }));
        res.status(200).json({
            rrpDetails,
            total: rrpDetails.length
        });
        logEvents(`Successfully fetched RRP details for NAC code: ${nacCode}`, 'reportLog.log');
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getRRPDetailsForNAC: ${errorMessage}`, 'reportLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch RRP details'
        });
    }
    finally {
        connection.release();
    }
};
interface IssueDetailItem {
    id: number;
    issue_slip_number: string;
    issue_date: string;
    issue_quantity: number;
    issue_cost: number;
    issued_for: string;
    issued_by: string | {
        name: string;
        [key: string]: any;
    };
    approval_status: string;
    part_number: string;
    remaining_balance: number;
}
interface ReceiveDetailItem {
    id: number;
    receive_number: string;
    receive_date: string;
    received_quantity: number;
    received_by: string;
    approval_status: string;
    part_number: string;
    equipment_number: string;
    request_number: string;
    receive_source: string;
    tender_reference_number?: string;
    location: string;
    card_number: string;
    unit: string;
    item_name: string;
}
export const getIssueDetailsForNAC = async (req: Request, res: Response): Promise<void> => {
    const { nacCode, fromDate, toDate } = req.query;
    const connection = await pool.getConnection();
    try {
        if (!nacCode) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'NAC code is required'
            });
            return;
        }
        const reportFromDate = fromDate ? String(fromDate) : null;
        const reportToDate = toDate ? String(toDate) : null;
        let dateFilter = '';
        const params: any[] = [String(nacCode)];
        if (reportFromDate && reportToDate) {
            dateFilter = 'AND id.issue_date BETWEEN ? AND ?';
            params.push(reportFromDate, reportToDate);
        }
        const query = `
            SELECT 
                id.id,
                id.issue_slip_number,
                id.issue_date,
                id.issue_quantity,
                id.issue_cost,
                id.issued_for,
                id.issued_by,
                id.approval_status,
                id.part_number,
                id.remaining_balance
            FROM issue_details id
            WHERE id.nac_code COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
            ${dateFilter}
            ORDER BY id.issue_date DESC, id.id DESC
        `;
        const [rows] = await connection.execute<RowDataPacket[]>(query, params);
        const issueDetails: IssueDetailItem[] = rows.map((row: any) => {
            let issuedBy = row.issued_by;
            try {
                issuedBy = typeof row.issued_by === 'string' ? JSON.parse(row.issued_by) : row.issued_by;
            }
            catch (e) {
            }
            return {
                id: row.id,
                issue_slip_number: row.issue_slip_number || '',
                issue_date: row.issue_date || '',
                issue_quantity: Number(row.issue_quantity) || 0,
                issue_cost: Number(row.issue_cost) || 0,
                issued_for: row.issued_for || '',
                issued_by: issuedBy,
                approval_status: row.approval_status || '',
                part_number: row.part_number || '',
                remaining_balance: Number(row.remaining_balance) || 0
            };
        });
        res.status(200).json({
            issueDetails,
            total: issueDetails.length
        });
        logEvents(`Successfully fetched issue details for NAC code: ${nacCode}`, 'reportLog.log');
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getIssueDetailsForNAC: ${errorMessage}`, 'reportLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch issue details'
        });
    }
    finally {
        connection.release();
    }
};
export const fixRemainingBalances = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        logEvents('Starting remaining balance fix for all NAC codes', 'reportLog.log');
        const [nacCodes] = await connection.execute<RowDataPacket[]>(`SELECT DISTINCT nac_code, open_quantity 
       FROM stock_details 
       WHERE nac_code IS NOT NULL AND nac_code != '' 
       ORDER BY nac_code ASC`);
        let totalFixed = 0;
        let totalErrors = 0;
        const errors: string[] = [];
        for (const stock of nacCodes) {
            const nacCode = stock.nac_code;
            const openQty = Number(stock.open_quantity || 0);
            try {
                const [receives] = await connection.execute<RowDataPacket[]>(`SELECT id, DATE(receive_date) as receive_date, received_quantity
           FROM receive_details
           WHERE nac_code = ?
           AND approval_status = 'APPROVED'
           ORDER BY receive_date ASC, id ASC`, [nacCode]);
                const [issues] = await connection.execute<RowDataPacket[]>(`SELECT id, DATE(issue_date) as issue_date, issue_quantity
           FROM issue_details
           WHERE nac_code = ?
           AND approval_status = 'APPROVED'
           ORDER BY issue_date ASC, id ASC`, [nacCode]);
                interface TimelineEvent {
                    type: 'receive' | 'issue';
                    dateStr: string;
                    id: number;
                    quantity: number;
                    issueId?: number;
                }
                const timeline: TimelineEvent[] = [];
                const normalizeDate = (dateInput: Date | string | null): string => {
                    if (!dateInput)
                        return '1970-01-01';
                    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
                        return dateInput;
                    }
                    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
                    if (isNaN(d.getTime()))
                        return '1970-01-01';
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    return `${year}-${month}-${day}`;
                };
                receives.forEach((r) => {
                    const dateStr = normalizeDate(r.receive_date);
                    timeline.push({
                        type: 'receive',
                        dateStr,
                        id: r.id,
                        quantity: Number(r.received_quantity || 0),
                    });
                });
                issues.forEach((i) => {
                    const dateStr = normalizeDate(i.issue_date);
                    timeline.push({
                        type: 'issue',
                        dateStr,
                        id: i.id,
                        quantity: Number(i.issue_quantity || 0),
                        issueId: i.id,
                    });
                });
                timeline.sort((a, b) => {
                    const dateStrDiff = a.dateStr.localeCompare(b.dateStr);
                    if (dateStrDiff !== 0)
                        return dateStrDiff;
                    if (a.type !== b.type) {
                        return a.type === 'receive' ? -1 : 1;
                    }
                    return a.id - b.id;
                });
                let runningBalance = openQty;
                for (const event of timeline) {
                    if (event.type === 'receive') {
                        runningBalance += event.quantity;
                    }
                    else {
                        runningBalance -= event.quantity;
                        const remainingBalance = Math.max(0, runningBalance);
                        await connection.execute(`UPDATE issue_details 
               SET remaining_balance = ? 
               WHERE id = ?`, [remainingBalance, event.issueId]);
                    }
                }
                totalFixed += issues.length;
                logEvents(`Fixed ${issues.length} issue records for NAC code: ${nacCode}`, 'reportLog.log');
            }
            catch (error) {
                totalErrors++;
                const errorMsg = `Error processing NAC code ${nacCode}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                errors.push(errorMsg);
                logEvents(errorMsg, 'reportLog.log');
            }
        }
        await connection.commit();
        logEvents(`Remaining balance fix completed. Fixed: ${totalFixed} records, Errors: ${totalErrors}`, 'reportLog.log');
        res.status(200).json({
            success: true,
            message: `Remaining balance fix completed`,
            totalFixed,
            totalErrors,
            errors: errors.length > 0 ? errors : undefined,
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in fixRemainingBalances: ${errorMessage}`, 'reportLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage,
        });
    }
    finally {
        connection.release();
    }
};
export const fixIssueCostsAndBalances = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const processed = await rebuildAllNacInventoryStates(connection);
        await connection.commit();
        const message = `Issue cost and balance rebuild completed for ${processed} NAC codes`;
        logEvents(message, 'reportLog.log');
        res.status(200).json({
            success: true,
            message,
            processed,
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in fixIssueCostsAndBalances: ${errorMessage}`, 'reportLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to rebuild issue costs and balances',
            details: errorMessage,
        });
    }
    finally {
        connection.release();
    }
};
export const getReceiveDetailsForNAC = async (req: Request, res: Response): Promise<void> => {
    const { nacCode, fromDate, toDate } = req.query;
    const connection = await pool.getConnection();
    try {
        if (!nacCode) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'NAC code is required'
            });
            return;
        }
        const reportFromDate = fromDate ? String(fromDate) : null;
        const reportToDate = toDate ? String(toDate) : null;
        let dateFilter = '';
        const params: any[] = [String(nacCode)];
        if (reportFromDate && reportToDate) {
            dateFilter = 'AND rd.receive_date BETWEEN ? AND ?';
            params.push(reportFromDate, reportToDate);
        }
        const query = `
            SELECT 
                rd.id,
                CONCAT('REC-', rd.id) as receive_number,
                rd.receive_date,
                rd.received_quantity,
                rd.received_by,
                rd.approval_status,
                rd.part_number,
                COALESCE(NULLIF(rd.equipment_number, ''), COALESCE(req.equipment_number, '')) AS equipment_number,
                CASE 
                    WHEN rd.receive_source = 'tender' THEN CONCAT('TENDER-', COALESCE(rd.tender_reference_number, ''))
                    ELSE COALESCE(req.request_number, '')
                END AS request_number,
                rd.receive_source,
                rd.tender_reference_number,
                rd.location,
                rd.card_number,
                rd.unit,
                rd.item_name
            FROM receive_details rd
            LEFT JOIN request_details req ON rd.request_fk = req.id
            WHERE rd.nac_code COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
            ${dateFilter}
            ORDER BY rd.receive_date DESC, rd.id DESC
        `;
        const [rows] = await connection.execute<RowDataPacket[]>(query, params);
        const receiveDetails: ReceiveDetailItem[] = rows.map((row: any) => ({
            id: row.id,
            receive_number: row.receive_number || '',
            receive_date: row.receive_date || '',
            received_quantity: Number(row.received_quantity) || 0,
            received_by: row.received_by || '',
            approval_status: row.approval_status || '',
            part_number: row.part_number || '',
            equipment_number: row.equipment_number || '',
            request_number: row.request_number || '',
            receive_source: row.receive_source || '',
            tender_reference_number: row.tender_reference_number || '',
            location: row.location || '',
            card_number: row.card_number || '',
            unit: row.unit || '',
            item_name: row.item_name || ''
        }));
        res.status(200).json({
            receiveDetails,
            total: receiveDetails.length
        });
        logEvents(`Successfully fetched receive details for NAC code: ${nacCode}`, 'reportLog.log');
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getReceiveDetailsForNAC: ${errorMessage}`, 'reportLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch receive details'
        });
    }
    finally {
        connection.release();
    }
};
