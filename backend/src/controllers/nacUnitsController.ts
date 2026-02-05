import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';
export const getAllNacUnits = async (req: Request, res: Response): Promise<void> => {
    try {
        const { search = '', onlyDefault = 'false', page = '1', pageSize = '20' } = req.query;
        const searchTerm = String(search).trim();
        const onlyDefaultFlag = String(onlyDefault).toLowerCase() === 'true';
        const currentPage = parseInt(String(page)) || 1;
        const limit = parseInt(String(pageSize)) || 20;
        const offset = (currentPage - 1) * limit;
        let baseQuery = `
            FROM nac_units nu
            LEFT JOIN stock_details sd 
                ON nu.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
            WHERE 1 = 1
        `;
        const params: (string | number)[] = [];
        if (searchTerm) {
            baseQuery += `
                AND (
                    nu.nac_code LIKE ?
                    OR nu.unit LIKE ?
                    OR sd.item_name LIKE ?
                )
            `;
            const like = `%${searchTerm}%`;
            params.push(like, like, like);
        }
        if (onlyDefaultFlag) {
            baseQuery += ` AND nu.is_default = 1`;
        }
        const countQuery = `
            SELECT COUNT(*) as total
            ${baseQuery}
        `;
        const [countRows] = await pool.execute<RowDataPacket[]>(countQuery, params);
        const totalCount = countRows[0]?.total || 0;
        const dataQuery = `
            SELECT 
                nu.id,
                nu.nac_code,
                nu.unit,
                nu.is_default,
                sd.item_name,
                nu.created_at,
                nu.updated_at
            ${baseQuery}
            ORDER BY nu.nac_code ASC, nu.is_default DESC, nu.unit ASC
            LIMIT ${limit} OFFSET ${offset}
        `;
        const [results] = await pool.execute<RowDataPacket[]>(dataQuery, params);
        res.status(200).json({
            data: results,
            pagination: {
                currentPage,
                pageSize: limit,
                totalCount,
                totalPages: Math.ceil(totalCount / limit) || 1
            }
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching NAC units: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
};
export const getUnitsForNac = async (req: Request, res: Response): Promise<void> => {
    try {
        const { nacCode } = req.params;
        if (!nacCode) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'NAC code is required'
            });
            return;
        }
        const [results] = await pool.execute<RowDataPacket[]>(`SELECT unit, is_default
            FROM nac_units
            WHERE nac_code = ?
            ORDER BY is_default DESC, unit ASC`, [nacCode]);
        const units = results.map(row => row.unit);
        res.status(200).json({
            units,
            defaultUnit: results.find(r => r.is_default === 1)?.unit || null
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching units for NAC ${req.params.nacCode}: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
};
export const createNacUnit = async (req: Request, res: Response): Promise<void> => {
    try {
        const { nacCode, unit, isDefault } = req.body;
        if (!nacCode || !unit) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'NAC code and unit are required'
            });
            return;
        }
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            if (isDefault) {
                await connection.execute(`UPDATE nac_units SET is_default = 0 WHERE nac_code = ?`, [nacCode]);
            }
            await connection.execute(`INSERT INTO nac_units (nac_code, unit, is_default)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE is_default = VALUES(is_default)`, [nacCode, unit, isDefault ? 1 : 0]);
            await connection.commit();
            logEvents(`Successfully created NAC unit: ${nacCode} - ${unit}`, "settingsLog.log");
            res.status(201).json({
                message: 'NAC unit created successfully'
            });
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error creating NAC unit: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
};
export const updateNacUnit = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { unit, isDefault } = req.body;
        if (!unit) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Unit is required'
            });
            return;
        }
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const [unitRows] = await connection.execute<RowDataPacket[]>(`SELECT nac_code FROM nac_units WHERE id = ?`, [id]);
            if (unitRows.length === 0) {
                res.status(404).json({
                    error: 'Not Found',
                    message: 'NAC unit not found'
                });
                return;
            }
            const nacCode = unitRows[0].nac_code;
            if (isDefault) {
                await connection.execute(`UPDATE nac_units SET is_default = 0 WHERE nac_code = ? AND id != ?`, [nacCode, id]);
            }
            await connection.execute(`UPDATE nac_units SET unit = ?, is_default = ? WHERE id = ?`, [unit, isDefault ? 1 : 0, id]);
            await connection.commit();
            logEvents(`Successfully updated NAC unit ID: ${id}`, "settingsLog.log");
            res.status(200).json({
                message: 'NAC unit updated successfully'
            });
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error updating NAC unit: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
};
export const deleteNacUnit = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        await pool.execute(`DELETE FROM nac_units WHERE id = ?`, [id]);
        logEvents(`Successfully deleted NAC unit ID: ${id}`, "settingsLog.log");
        res.status(200).json({
            message: 'NAC unit deleted successfully'
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error deleting NAC unit: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
};
export const searchNacCodes = async (req: Request, res: Response): Promise<void> => {
    try {
        const { search, page = 1, pageSize = 20 } = req.query;
        const rawSearch = search ? String(search).trim() : '';
        if (!rawSearch) {
            const limit = parseInt(String(pageSize)) || 20;
            const offset = ((parseInt(String(page)) || 1) - 1) * limit;
            const [results] = await pool.execute<RowDataPacket[]>(`SELECT DISTINCT nac_code, item_name
                 FROM stock_details
                 WHERE nac_code IS NOT NULL
                   AND nac_code != ''
                 ORDER BY nac_code ASC
                 LIMIT ${limit} OFFSET ${offset}`);
            res.status(200).json({
                data: results.map(row => ({
                    nacCode: row.nac_code,
                    itemName: row.item_name
                })),
                pagination: {
                    currentPage: parseInt(String(page)) || 1,
                    pageSize: limit,
                    totalCount: results.length,
                    totalPages: 1
                }
            });
            return;
        }
        const searchTerm = rawSearch;
        const normalizedSearch = rawSearch.replace(/\s+/g, '');
        const limit = parseInt(String(pageSize)) || 20;
        const offset = ((parseInt(String(page)) || 1) - 1) * limit;
        const [results] = await pool.execute<RowDataPacket[]>(`SELECT DISTINCT nac_code, item_name
             FROM stock_details
             WHERE nac_code IS NOT NULL
               AND nac_code != ''
               AND (
                   nac_code LIKE ?
                   OR item_name LIKE ?
                   OR REPLACE(nac_code, ' ', '') LIKE ?
               )
             ORDER BY nac_code ASC
             LIMIT ${limit} OFFSET ${offset}`, [
            `%${searchTerm}%`,
            `%${searchTerm}%`,
            `%${normalizedSearch}%`
        ]);
        res.status(200).json({
            data: results.map(row => ({
                nacCode: row.nac_code,
                itemName: row.item_name
            })),
            pagination: {
                currentPage: parseInt(String(page)) || 1,
                pageSize: limit,
                totalCount: results.length,
                totalPages: 1
            }
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error searching NAC codes: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
};
