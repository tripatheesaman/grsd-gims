import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';
interface LocationPhraseRow extends RowDataPacket {
    id: number;
    phrase: string;
    is_active: number;
}
export const getLocationPhrases = async (req: Request, res: Response): Promise<void> => {
    try {
        const [rows] = await pool.execute<LocationPhraseRow[]>(`SELECT id, phrase, is_active 
       FROM location_phrases 
       ORDER BY phrase ASC`);
        res.status(200).json({
            data: rows
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logEvents(`Error fetching location phrases: ${message}`, 'settingsLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch location phrases'
        });
    }
};
export const getActiveLocationPhrases = async (req: Request, res: Response): Promise<void> => {
    try {
        const [rows] = await pool.execute<LocationPhraseRow[]>(`SELECT phrase 
       FROM location_phrases 
       WHERE is_active = 1
       ORDER BY phrase ASC`);
        res.status(200).json({
            phrases: rows.map(r => r.phrase)
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logEvents(`Error fetching active location phrases: ${message}`, 'settingsLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch active location phrases'
        });
    }
};
export const createLocationPhrase = async (req: Request, res: Response): Promise<void> => {
    try {
        const { phrase } = req.body;
        if (!phrase || typeof phrase !== 'string' || !phrase.trim()) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Phrase is required'
            });
            return;
        }
        const trimmed = phrase.trim();
        await pool.execute(`INSERT INTO location_phrases (phrase, is_active)
       VALUES (?, 1)`, [trimmed]);
        logEvents(`Created location phrase: ${trimmed}`, 'settingsLog.log');
        res.status(201).json({
            message: 'Location phrase created successfully'
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logEvents(`Error creating location phrase: ${message}`, 'settingsLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to create location phrase'
        });
    }
};
export const updateLocationPhrase = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { phrase, is_active } = req.body;
        if (!phrase || typeof phrase !== 'string' || !phrase.trim()) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Phrase is required'
            });
            return;
        }
        const trimmed = phrase.trim();
        const activeFlag = is_active ? 1 : 0;
        const [result] = await pool.execute(`UPDATE location_phrases
       SET phrase = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`, [trimmed, activeFlag, id]);
        if (!(result as any).affectedRows) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Location phrase not found'
            });
            return;
        }
        logEvents(`Updated location phrase ID ${id}: ${trimmed}`, 'settingsLog.log');
        res.status(200).json({
            message: 'Location phrase updated successfully'
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logEvents(`Error updating location phrase: ${message}`, 'settingsLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to update location phrase'
        });
    }
};
export const deleteLocationPhrase = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const [result] = await pool.execute(`DELETE FROM location_phrases WHERE id = ?`, [id]);
        if (!(result as any).affectedRows) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Location phrase not found'
            });
            return;
        }
        logEvents(`Deleted location phrase ID ${id}`, 'settingsLog.log');
        res.status(200).json({
            message: 'Location phrase deleted successfully'
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logEvents(`Error deleting location phrase: ${message}`, 'settingsLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to delete location phrase'
        });
    }
};
