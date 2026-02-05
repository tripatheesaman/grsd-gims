import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';
export const createStockItem = async (req: Request, res: Response): Promise<void> => {
    const { nacCode, itemName, partNumber, equipmentNumber, currentBalance, location, cardNumber } = req.body;
    const connection = await pool.getConnection();
    try {
        if (!nacCode || !itemName || !partNumber || !equipmentNumber || currentBalance === undefined || !location || !cardNumber) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'All fields are required'
            });
            return;
        }
        const [existingItem] = await connection.execute<RowDataPacket[]>('SELECT id FROM stock_details WHERE nac_code = ?', [nacCode]);
        if (existingItem.length > 0) {
            res.status(409).json({
                error: 'Conflict',
                message: 'NAC Code already exists'
            });
            return;
        }
        const [result] = await connection.execute(`INSERT INTO stock_details (
        nac_code, 
        item_name, 
        part_numbers, 
        applicable_equipments, 
        current_balance, 
        location, 
        card_number,
        open_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`, [nacCode, itemName, partNumber, equipmentNumber, currentBalance, location, cardNumber]);
        res.status(201).json({
            message: 'Stock item created successfully',
            id: (result as any).insertId
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in createStockItem: ${errorMessage}`, "stockLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const updateStockItem = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { nacCode, itemName, partNumber, equipmentNumber, currentBalance, location, cardNumber } = req.body;
    const connection = await pool.getConnection();
    try {
        if (!nacCode || !itemName || !partNumber || !equipmentNumber || currentBalance === undefined || !location || !cardNumber) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'All fields are required'
            });
            return;
        }
        const [existingItem] = await connection.execute<RowDataPacket[]>('SELECT id FROM stock_details WHERE id = ?', [id]);
        if (existingItem.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Stock item not found'
            });
            return;
        }
        const [duplicateNac] = await connection.execute<RowDataPacket[]>('SELECT id FROM stock_details WHERE nac_code = ? AND id != ?', [nacCode, id]);
        if (duplicateNac.length > 0) {
            res.status(409).json({
                error: 'Conflict',
                message: 'NAC Code already exists'
            });
            return;
        }
        await connection.execute(`UPDATE stock_details SET 
        nac_code = ?, 
        item_name = ?, 
        part_numbers = ?, 
        applicable_equipments = ?, 
        current_balance = ?, 
        location = ?, 
        card_number = ?
      WHERE id = ?`, [nacCode, itemName, partNumber, equipmentNumber, currentBalance, location, cardNumber, id]);
        res.status(200).json({
            message: 'Stock item updated successfully'
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in updateStockItem: ${errorMessage}`, "stockLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
export const deleteStockItem = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const connection = await pool.getConnection();
    try {
        const [existingItem] = await connection.execute<RowDataPacket[]>('SELECT id FROM stock_details WHERE id = ?', [id]);
        if (existingItem.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Stock item not found'
            });
            return;
        }
        await connection.execute('DELETE FROM stock_details WHERE id = ?', [id]);
        res.status(200).json({
            message: 'Stock item deleted successfully'
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in deleteStockItem: ${errorMessage}`, "stockLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
};
