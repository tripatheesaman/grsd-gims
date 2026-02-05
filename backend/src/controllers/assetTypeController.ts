import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';
import { AssetType, AssetTypeProperty, CreateAssetTypeDTO, UpdateAssetTypeDTO, VALID_PROPERTY_NAMES } from '../types/asset';
export const getAllAssetTypes = async (req: Request, res: Response): Promise<void> => {
    try {
        const [rows] = await pool.query<AssetType[]>(`SELECT id, name, description, created_at, updated_at 
       FROM asset_types 
       ORDER BY name ASC`);
        logEvents(`Successfully fetched ${rows.length} asset types`, 'assetLog.log');
        res.status(200).json(rows);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching asset types: ${errorMessage}`, 'assetLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch asset types'
        });
    }
};
export const getAssetTypeById = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const [assetTypes] = await pool.query<AssetType[]>(`SELECT id, name, description, created_at, updated_at 
       FROM asset_types 
       WHERE id = ?`, [id]);
        if (assetTypes.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Asset type not found'
            });
            return;
        }
        const [properties] = await pool.query<AssetTypeProperty[]>(`SELECT id, asset_type_id, property_name, is_required, display_order, created_at 
       FROM asset_type_properties 
       WHERE asset_type_id = ? 
       ORDER BY display_order ASC, property_name ASC`, [id]);
        const assetType = {
            ...assetTypes[0],
            properties
        };
        logEvents(`Successfully fetched asset type: ${id}`, 'assetLog.log');
        res.status(200).json(assetType);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching asset type: ${errorMessage}`, 'assetLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch asset type'
        });
    }
};
export const createAssetType = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { name, description, properties = [] }: CreateAssetTypeDTO = req.body;
        if (!name || !name.trim()) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Asset type name is required'
            });
            await connection.rollback();
            return;
        }
        for (const prop of properties) {
            if (!VALID_PROPERTY_NAMES.includes(prop.property_name as any)) {
                res.status(400).json({
                    error: 'Bad Request',
                    message: `Invalid property name: ${prop.property_name}. Valid properties are: ${VALID_PROPERTY_NAMES.join(', ')}`
                });
                await connection.rollback();
                return;
            }
        }
        const [result] = await connection.query<any>(`INSERT INTO asset_types (name, description) 
       VALUES (?, ?)`, [name.trim(), description?.trim() || null]);
        const assetTypeId = result.insertId;
        if (properties.length > 0) {
            const propertyValues = properties.map((prop, index) => [
                assetTypeId,
                prop.property_name,
                prop.is_required || false,
                prop.display_order ?? index
            ]);
            await connection.query(`INSERT INTO asset_type_properties (asset_type_id, property_name, is_required, display_order) 
         VALUES ?`, [propertyValues]);
        }
        await connection.commit();
        const [assetTypes] = await connection.query<AssetType[]>(`SELECT id, name, description, created_at, updated_at 
       FROM asset_types 
       WHERE id = ?`, [assetTypeId]);
        const [propertyRows] = await connection.query<AssetTypeProperty[]>(`SELECT id, asset_type_id, property_name, is_required, display_order, created_at 
       FROM asset_type_properties 
       WHERE asset_type_id = ? 
       ORDER BY display_order ASC, property_name ASC`, [assetTypeId]);
        const createdAssetType = {
            ...assetTypes[0],
            properties: propertyRows
        };
        logEvents(`Successfully created asset type: ${name} (ID: ${assetTypeId})`, 'assetLog.log');
        res.status(201).json(createdAssetType);
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        if (errorMessage.includes('Duplicate entry') || errorMessage.includes('UNIQUE constraint')) {
            res.status(409).json({
                error: 'Conflict',
                message: 'An asset type with this name already exists'
            });
            return;
        }
        logEvents(`Error creating asset type: ${errorMessage}`, 'assetLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to create asset type'
        });
    }
    finally {
        connection.release();
    }
};
export const updateAssetType = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;
        const { name, description, properties }: UpdateAssetTypeDTO = req.body;
        const [existing] = await connection.query<AssetType[]>(`SELECT id FROM asset_types WHERE id = ?`, [id]);
        if (existing.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Asset type not found'
            });
            await connection.rollback();
            return;
        }
        if (name !== undefined || description !== undefined) {
            const updates: string[] = [];
            const values: any[] = [];
            if (name !== undefined) {
                if (!name.trim()) {
                    res.status(400).json({
                        error: 'Bad Request',
                        message: 'Asset type name cannot be empty'
                    });
                    await connection.rollback();
                    return;
                }
                updates.push('name = ?');
                values.push(name.trim());
            }
            if (description !== undefined) {
                updates.push('description = ?');
                values.push(description?.trim() || null);
            }
            values.push(id);
            await connection.query(`UPDATE asset_types SET ${updates.join(', ')} WHERE id = ?`, values);
        }
        if (properties !== undefined) {
            for (const prop of properties) {
                if (!VALID_PROPERTY_NAMES.includes(prop.property_name as any)) {
                    res.status(400).json({
                        error: 'Bad Request',
                        message: `Invalid property name: ${prop.property_name}. Valid properties are: ${VALID_PROPERTY_NAMES.join(', ')}`
                    });
                    await connection.rollback();
                    return;
                }
            }
            await connection.query(`DELETE FROM asset_type_properties WHERE asset_type_id = ?`, [id]);
            if (properties.length > 0) {
                const propertyValues = properties.map((prop, index) => [
                    id,
                    prop.property_name,
                    prop.is_required || false,
                    prop.display_order ?? index
                ]);
                await connection.query(`INSERT INTO asset_type_properties (asset_type_id, property_name, is_required, display_order) 
           VALUES ?`, [propertyValues]);
            }
        }
        await connection.commit();
        const [assetTypes] = await connection.query<AssetType[]>(`SELECT id, name, description, created_at, updated_at 
       FROM asset_types 
       WHERE id = ?`, [id]);
        const [propertyRows] = await connection.query<any[]>(`SELECT id, asset_type_id, property_name, is_required, display_order, created_at 
       FROM asset_type_properties 
       WHERE asset_type_id = ? 
       ORDER BY display_order ASC, property_name ASC`, [id]);
        const updatedAssetType = {
            ...assetTypes[0],
            properties: propertyRows
        };
        logEvents(`Successfully updated asset type: ${id}`, 'assetLog.log');
        res.status(200).json(updatedAssetType);
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        if (errorMessage.includes('Duplicate entry') || errorMessage.includes('UNIQUE constraint')) {
            res.status(409).json({
                error: 'Conflict',
                message: 'An asset type with this name already exists'
            });
            return;
        }
        logEvents(`Error updating asset type: ${errorMessage}`, 'assetLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to update asset type'
        });
    }
    finally {
        connection.release();
    }
};
export const deleteAssetType = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;
        const [existing] = await connection.query<AssetType[]>(`SELECT id FROM asset_types WHERE id = ?`, [id]);
        if (existing.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Asset type not found'
            });
            await connection.rollback();
            return;
        }
        const [assets] = await connection.query<RowDataPacket[]>(`SELECT COUNT(*) as count FROM assets WHERE asset_type_id = ?`, [id]);
        if (assets[0].count > 0) {
            res.status(409).json({
                error: 'Conflict',
                message: `Cannot delete asset type. There are ${assets[0].count} asset(s) using this type. Please delete or reassign those assets first.`
            });
            await connection.rollback();
            return;
        }
        await connection.query(`DELETE FROM asset_type_properties WHERE asset_type_id = ?`, [id]);
        await connection.query(`DELETE FROM asset_types WHERE id = ?`, [id]);
        await connection.commit();
        logEvents(`Successfully deleted asset type: ${id}`, 'assetLog.log');
        res.status(200).json({
            message: 'Asset type deleted successfully'
        });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error deleting asset type: ${errorMessage}`, 'assetLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to delete asset type'
        });
    }
    finally {
        connection.release();
    }
};
