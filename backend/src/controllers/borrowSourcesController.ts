import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';
export const getAllBorrowSources = async (req: Request, res: Response): Promise<void> => {
    try {
        const { activeOnly } = req.query;
        let query = 'SELECT * FROM borrow_sources';
        const params: any[] = [];
        if (activeOnly === 'true') {
            query += ' WHERE is_active = 1';
        }
        query += ' ORDER BY source_name ASC';
        const [results] = await pool.execute<RowDataPacket[]>(query, params);
        res.status(200).json({
            data: results
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching borrow sources: ${errorMessage}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
};
export const getBorrowSource = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const [results] = await pool.execute<RowDataPacket[]>('SELECT * FROM borrow_sources WHERE id = ?', [id]);
        if (results.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Borrow source not found'
            });
            return;
        }
        res.status(200).json(results[0]);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching borrow source: ${errorMessage}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
};
export const createBorrowSource = async (req: Request, res: Response): Promise<void> => {
    try {
        const { source_name, source_code, contact_person, contact_phone, contact_email, address, created_by } = req.body;
        if (!source_name || source_name.trim() === '') {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Source name is required'
            });
            return;
        }
        const [existing] = await pool.execute<RowDataPacket[]>('SELECT id FROM borrow_sources WHERE source_name = ?', [source_name.trim()]);
        if (existing.length > 0) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'A source with this name already exists'
            });
            return;
        }
        const [result] = await pool.execute(`INSERT INTO borrow_sources 
            (source_name, source_code, contact_person, contact_phone, contact_email, address, created_by, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)`, [source_name.trim(), source_code || null, contact_person || null, contact_phone || null, contact_email || null, address || null, created_by || null]);
        const sourceId = (result as any).insertId;
        logEvents(`Created borrow source ID: ${sourceId}, Name: ${source_name}`, "receiveLog.log");
        res.status(201).json({
            message: 'Borrow source created successfully',
            sourceId
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error creating borrow source: ${errorMessage}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
};
export const updateBorrowSource = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { source_name, source_code, contact_person, contact_phone, contact_email, address, is_active } = req.body;
        const [existing] = await pool.execute<RowDataPacket[]>('SELECT id FROM borrow_sources WHERE id = ?', [id]);
        if (existing.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Borrow source not found'
            });
            return;
        }
        if (source_name) {
            const [duplicate] = await pool.execute<RowDataPacket[]>('SELECT id FROM borrow_sources WHERE source_name = ? AND id != ?', [source_name.trim(), id]);
            if (duplicate.length > 0) {
                res.status(400).json({
                    error: 'Bad Request',
                    message: 'A source with this name already exists'
                });
                return;
            }
        }
        const updates: string[] = [];
        const values: any[] = [];
        if (source_name !== undefined) {
            updates.push('source_name = ?');
            values.push(source_name.trim());
        }
        if (source_code !== undefined) {
            updates.push('source_code = ?');
            values.push(source_code || null);
        }
        if (contact_person !== undefined) {
            updates.push('contact_person = ?');
            values.push(contact_person || null);
        }
        if (contact_phone !== undefined) {
            updates.push('contact_phone = ?');
            values.push(contact_phone || null);
        }
        if (contact_email !== undefined) {
            updates.push('contact_email = ?');
            values.push(contact_email || null);
        }
        if (address !== undefined) {
            updates.push('address = ?');
            values.push(address || null);
        }
        if (is_active !== undefined) {
            updates.push('is_active = ?');
            values.push(is_active ? 1 : 0);
        }
        if (updates.length === 0) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'No fields to update'
            });
            return;
        }
        values.push(id);
        await pool.execute(`UPDATE borrow_sources SET ${updates.join(', ')} WHERE id = ?`, values);
        logEvents(`Updated borrow source ID: ${id}`, "receiveLog.log");
        res.status(200).json({
            message: 'Borrow source updated successfully'
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error updating borrow source: ${errorMessage}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
};
export const deleteBorrowSource = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const [existing] = await pool.execute<RowDataPacket[]>('SELECT id FROM borrow_sources WHERE id = ?', [id]);
        if (existing.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Borrow source not found'
            });
            return;
        }
        const [inUse] = await pool.execute<RowDataPacket[]>(`SELECT id FROM receive_details 
            WHERE borrow_source_id = ? AND receive_source = 'borrow' AND borrow_status = 'ACTIVE'`, [id]);
        if (inUse.length > 0) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Cannot delete source. It is being used in active borrow receives.'
            });
            return;
        }
        await pool.execute('UPDATE borrow_sources SET is_active = 0 WHERE id = ?', [id]);
        logEvents(`Deleted (deactivated) borrow source ID: ${id}`, "receiveLog.log");
        res.status(200).json({
            message: 'Borrow source deleted successfully'
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error deleting borrow source: ${errorMessage}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
};
