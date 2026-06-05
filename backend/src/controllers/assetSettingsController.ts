import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';
import { ensureAssetSpareSchema } from '../services/assetSpareSchema';

const CONFIG_TYPE = 'asset';

const defaultSettings = {
    locations: [] as string[],
    servicability_statuses: [] as string[],
    weight_units: ['KG', 'TON'],
    size_units: ['M', 'FT', 'CM'],
    quantity_units: ['EA', 'SET', 'UNIT'],
    default_asset_type_id: null as number | null,
};

async function loadAssetSettings(): Promise<typeof defaultSettings> {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT config_name, config_value FROM app_config WHERE config_type = ?',
        [CONFIG_TYPE]
    );
    const settings = { ...defaultSettings };
    for (const row of rows as any[]) {
        try {
            (settings as any)[row.config_name] = JSON.parse(row.config_value);
        }
        catch {
            (settings as any)[row.config_name] = row.config_value;
        }
    }
    return settings;
}

export const getAssetSettings = async (_req: Request, res: Response): Promise<void> => {
    try {
        await ensureAssetSpareSchema();
        const settings = await loadAssetSettings();
        res.status(200).json(settings);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logEvents(`Error fetching asset settings: ${errorMessage}`, 'assetLog.log');
        res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch asset settings' });
    }
};

export const updateAssetSettings = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await ensureAssetSpareSchema();
        await connection.beginTransaction();
        const body = req.body || {};
        const allowedKeys = Object.keys(defaultSettings);
        for (const key of allowedKeys) {
            if (body[key] === undefined) continue;
            const value = JSON.stringify(body[key]);
            await connection.execute(
                `INSERT INTO app_config (config_name, config_value, config_type)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), config_type = VALUES(config_type)`,
                [key, value, CONFIG_TYPE]
            );
        }
        await connection.commit();
        const settings = await loadAssetSettings();
        res.status(200).json(settings);
    }
    catch (error) {
        await connection.rollback();
        res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update asset settings' });
    }
    finally {
        connection.release();
    }
};
