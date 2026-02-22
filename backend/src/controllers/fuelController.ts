import { Request, Response } from 'express';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2';
import { logEvents } from '../middlewares/logger';
import { createIssue } from './issueController';
import { rebuildNacInventoryState } from '../services/issueInventoryService';

interface FuelRecordResult {
  issue_id: number;
  fuel_id: number | null;
}

interface FuelRecord {
  equipment_number: string;
  kilometers: number;
  quantity: number;
  is_kilometer_reset: boolean;
}

interface FuelPayload {
  issue_date: string;
  issued_by: string;
  fuel_type: string;
  price: number;
  records: FuelRecord[];
}

export const createFuelRecord = async (req: Request, res: Response): Promise<void> => {
  const payload: FuelPayload = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    
    const [configRows] = await connection.query<RowDataPacket[]>(
      'SELECT config_value FROM app_config WHERE config_type = ? AND config_name = ?',
      ['rrp', 'current_fy']
    );

    if (configRows.length === 0) {
      throw new Error('Current FY configuration not found');
    }

    const currentFY = configRows[0].config_value;

    
    const [firstRecordResult] = await connection.query<RowDataPacket[]>(
      `SELECT MIN(i.issue_date) as first_date
       FROM fuel_records f
       JOIN issue_details i ON f.issue_fk = i.id
       WHERE f.fy = ?`,
      [currentFY]
    );

    let weekNumber = 1;
    const currentDate = new Date(payload.issue_date);
    
    currentDate.setHours(0, 0, 0, 0);

    if (firstRecordResult[0]?.first_date) {
      const firstDate = new Date(firstRecordResult[0].first_date);
      
      firstDate.setHours(0, 0, 0, 0);
      
      
      
      const firstDateDay = firstDate.getDay(); 
      
      
      const daysToFirstSaturday = (6 - firstDateDay) % 7; 
      const firstWeekEndSaturday = new Date(firstDate);
      firstWeekEndSaturday.setDate(firstDate.getDate() + daysToFirstSaturday);
      firstWeekEndSaturday.setHours(0, 0, 0, 0);
      
      
      const firstWeek2Start = new Date(firstWeekEndSaturday);
      firstWeek2Start.setDate(firstWeekEndSaturday.getDate() + 1); 
      firstWeek2Start.setHours(0, 0, 0, 0);
      
      
      if (currentDate <= firstWeekEndSaturday) {
        weekNumber = 1;
      } else {
        
        
        
        
        
        
        const daysSinceWeek2Start = Math.floor((currentDate.getTime() - firstWeek2Start.getTime()) / (1000 * 60 * 60 * 24));
        
        
        weekNumber = Math.floor(daysSinceWeek2Start / 7) + 2;
      }
    } else {
      
      const currentDateDay = currentDate.getDay(); 
      
      
      
      
      weekNumber = 1;
    }

    
    const getNacCode = (fuelType: string) => {
      switch (fuelType.toLowerCase()) {
        case 'diesel':
          return 'GT 07986';
        case 'petrol':
          return 'GT 00000';
        default:
          throw new Error(`Invalid fuel type: ${fuelType}`);
      }
    };


    if (payload.fuel_type.toLowerCase() === 'diesel') {
      for (const record of payload.records) {
        const equipment = record.equipment_number?.trim() || '';
        if (!equipment || equipment.toLowerCase() === 'cleaning') {
          continue;
        }

        const [existingRows] = await connection.query<RowDataPacket[]>(
          `SELECT f.id
           FROM fuel_records f
           INNER JOIN issue_details i ON f.issue_fk = i.id
           WHERE LOWER(TRIM(f.fuel_type)) = 'diesel'
             AND DATE(i.issue_date) = DATE(?)
             AND LOWER(TRIM(i.issued_for)) = LOWER(TRIM(?))
           LIMIT 1`,
          [payload.issue_date, equipment]
        );

        if (existingRows.length > 0) {
          throw new Error(`Diesel entry already exists for equipment "${equipment}" on ${payload.issue_date}. Only Cleaning allows duplicate entries on the same date.`);
        }
      }
    }

    let totalFuelNeeded = 0;
    for (const record of payload.records) {
      totalFuelNeeded += record.quantity;
    }
    
    for (const record of payload.records) {
      const nacCode = getNacCode(payload.fuel_type);
      
      const [stockResults] = await connection.query<RowDataPacket[]>(
        'SELECT id, nac_code, current_balance FROM stock_details WHERE nac_code = ? COLLATE utf8mb4_unicode_ci',
        [nacCode]
      );

      if (stockResults.length === 0) {
        const [insertResult] = await connection.query(
          `INSERT INTO stock_details 
          (nac_code, item_name, part_numbers, applicable_equipments, current_balance, unit) 
          VALUES (?, ?, ?, ?, ?, ?)`,
          [
            nacCode,
            `${payload.fuel_type.charAt(0).toUpperCase() + payload.fuel_type.slice(1)} Fuel`,
            'N/A',
            record.equipment_number,
            0,
            'Liters'
          ]
        );
      } else {
        const currentBalance = stockResults[0].current_balance;
        if (currentBalance < totalFuelNeeded) {
          throw new Error(`Insufficient ${payload.fuel_type} fuel. Total requested: ${totalFuelNeeded}L, Available: ${currentBalance}L`);
        }
      }
    }

    const issueReq = {
      body: {
        issueDate: payload.issue_date,
        issuedBy: {
          name: payload.issued_by,
          staffId: payload.issued_by
        },
        items: payload.records.map((record, index) => ({
          nacCode: getNacCode(payload.fuel_type),
          quantity: record.quantity,
          equipmentNumber: record.equipment_number,
          partNumber: 'N/A',
          originalIndex: index
        }))
      }
    } as Request;

    let issueIds: number[] = [];

    const issueRes = {
      status: (code: number) => ({
        json: (data: any) => {
          logEvents(`CreateIssue response data: ${JSON.stringify(data)}`, "fuelLog.log");
          
          if (code === 201) {
            if (data.issueIds && Array.isArray(data.issueIds)) {
              issueIds = data.issueIds;
              logEvents(`Issue records created successfully with IDs: ${issueIds.join(', ')}`, "fuelLog.log");
            } else {
              logEvents(`Failed to find issue IDs in response: ${JSON.stringify(data)}`, "fuelLog.log");
            }
          } else {
            logEvents(`Failed to create issue record. Status: ${code}, Response: ${JSON.stringify(data)}`, "fuelLog.log");
          }
        }
      })
    } as Response;

    try {
      logEvents(`Sending createIssue request: ${JSON.stringify(issueReq.body)}`, "fuelLog.log");
      await createIssue(issueReq, issueRes);
      
      if (issueIds.length === 0) {
        throw new Error('Failed to create issue record - No issue IDs returned');
      }
    } catch (error) {
      logEvents(`Error in createIssue: ${error instanceof Error ? error.message : 'Unknown error'}`, "fuelLog.log");
      throw new Error('Failed to create issue record');
    }

    for (let i = 0; i < payload.records.length; i++) {
      const record = payload.records[i];
      const issueId = issueIds[i];
      
      let fuelPrice = payload.price;
      if (payload.fuel_type.toLowerCase() === 'diesel') {
        const [issueDetails] = await connection.query<RowDataPacket[]>(
          `SELECT issue_cost, issue_quantity FROM issue_details WHERE id = ?`,
          [issueId]
        );
        
        if (issueDetails.length > 0 && issueDetails[0].issue_cost && issueDetails[0].issue_quantity) {
          const issueCost = Number(issueDetails[0].issue_cost);
          const issueQuantity = Number(issueDetails[0].issue_quantity);
          if (issueQuantity > 0) {
            fuelPrice = issueCost / issueQuantity;
            logEvents(`Calculated diesel fuel_price from FIFO: ${fuelPrice} (cost: ${issueCost}, qty: ${issueQuantity})`, "fuelLog.log");
          }
        }
      }
      
      const [fuelResult] = await connection.query<RowDataPacket[]>(
        `INSERT INTO fuel_records 
        (fuel_type, kilometers, issue_fk, is_kilometer_reset, fuel_price, week_number, fy) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.fuel_type,
          record.kilometers,
          issueId,
          record.is_kilometer_reset ? 1 : 0,
          fuelPrice,
          weekNumber,
          currentFY
        ]
      );

      const fuelId = (fuelResult as any).insertId;

      logEvents(
        `Fuel record created - Issue ID: ${issueId}, Fuel ID: ${fuelId}, Equipment: ${record.equipment_number}, Fuel Type: ${payload.fuel_type}, Week: ${weekNumber}, FY: ${currentFY}`,
        "fuelLog.log"
      );
    }

    await connection.commit();

    res.status(201).json({
      message: 'Fuel records created successfully',
      issue_ids: issueIds
    });
  } catch (error) {
    await connection.rollback();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error creating fuel records: ${errorMessage}`, "fuelLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while creating fuel records'
    });
  } finally {
    connection.release();
  }
};

export const updateFuelRecord = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { kilometers, fuel_type, is_kilometer_reset } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [fuelDetails] = await connection.query<RowDataPacket[]>(
      `SELECT f.*, i.issue_quantity, i.nac_code 
       FROM fuel_records f
       JOIN issue_details i ON f.issue_fk = i.id
       WHERE f.id = ?`,
      [id]
    );

    if (fuelDetails.length === 0) {
      throw new Error('Fuel record not found');
    }

    const fuel = fuelDetails[0];

    await connection.execute(
      `UPDATE fuel_records 
       SET fuel_type = ?,
           kilometers = ?,
           is_kilometer_reset = ?,
           updated_datetime = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [fuel_type, kilometers, is_kilometer_reset || 0, id]
    );

    await connection.commit();
    logEvents(`Successfully updated fuel record ID: ${id}`, "fuelLog.log");
    res.status(200).json({
      message: 'Fuel record updated successfully'
    });
  } catch (error) {
    await connection.rollback();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error updating fuel record: ${errorMessage} for ID: ${id}`, "fuelLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while updating fuel record'
    });
  } finally {
    connection.release();
  }
};

export const deleteFuelRecord = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [fuelDetails] = await connection.query<RowDataPacket[]>(
      `SELECT f.*, i.issue_quantity, i.nac_code 
       FROM fuel_records f
       JOIN issue_details i ON f.issue_fk = i.id
       WHERE f.id = ?`,
      [id]
    );

    if (fuelDetails.length === 0) {
      throw new Error('Fuel record not found');
    }

    const fuel = fuelDetails[0];

    await connection.execute(
      'DELETE FROM fuel_records WHERE id = ?',
      [id]
    );
    await connection.execute(
      'DELETE FROM issue_details WHERE id = ?',
      [fuel.issue_fk]
    );

    await connection.commit();
    logEvents(`Successfully deleted fuel record ID: ${id}`, "fuelLog.log");
    res.status(200).json({
      message: 'Fuel record deleted successfully'
    });
  } catch (error) {
    await connection.rollback();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error deleting fuel record: ${errorMessage} for ID: ${id}`, "fuelLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while deleting fuel record'
    });
  } finally {
    connection.release();
  }
};

export const approveFuelRecord = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { approvedBy } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [fuelDetails] = await connection.query<RowDataPacket[]>(
      `SELECT f.*, i.issue_quantity, i.nac_code 
       FROM fuel_records f
       JOIN issue_details i ON f.issue_fk = i.id
       WHERE f.id = ?`,
      [id]
    );

    if (fuelDetails.length === 0) {
      throw new Error('Fuel record not found');
    }

    const fuel = fuelDetails[0];

    await connection.execute(
      `UPDATE fuel_records 
       SET approval_status = 'APPROVED',
           approved_by = ?,
           updated_datetime = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [JSON.stringify(approvedBy), id]
    );

    await connection.execute(
      `UPDATE issue_details 
       SET approval_status = 'APPROVED',
           approved_by = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [JSON.stringify(approvedBy), fuel.issue_fk]
    );

    await rebuildNacInventoryState(connection, fuel.nac_code);
    logEvents(`Recalculated remaining balances for NAC code: ${fuel.nac_code} after approving fuel record`, "fuelLog.log");

    await connection.commit();
    logEvents(`Successfully approved fuel record ID: ${id}`, "fuelLog.log");
    res.status(200).json({
      message: 'Fuel record approved successfully'
    });
  } catch (error) {
    await connection.rollback();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error approving fuel record: ${errorMessage} for ID: ${id}`, "fuelLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while approving fuel record'
    });
  } finally {
    connection.release();
  }
};

export const getFuelConfig = async (req: Request, res: Response): Promise<void> => {
  const { type } = req.params;
  const connection = await pool.getConnection();
  const totalStartTime = Date.now();

  try {
    const equipmentStartTime = Date.now();
    const [equipmentRows] = await connection.query<RowDataPacket[]>(
      `SELECT equipment_code FROM fuel_valid_equipments WHERE fuel_type = ? AND is_active = 1`,
      [type.toLowerCase()]
    );
    let equipmentList: string[] = equipmentRows.map((row: any) => String(row.equipment_code).trim()).filter(Boolean);
    const equipmentTime = Date.now() - equipmentStartTime;
    logEvents(`Equipment list query took ${equipmentTime}ms, found ${equipmentList.length} equipment`, "fuelLog.log");

    if (equipmentList.length === 0) {
      const [configResult] = await connection.query<RowDataPacket[]>(
        'SELECT config_value FROM app_config WHERE config_name = ? AND config_type = "fuel"',
        [`valid_equipment_list_${type.toLowerCase()}`]
      );
      if (configResult.length === 0) {
        throw new Error('Fuel configuration not found');
      }

      equipmentList = configResult[0].config_value
        .replace(/\r\n/g, '')
        .split(',')
        .map((item: string) => item.trim())
        .filter((item: string) => item && !item.includes(' '));
    }

    let equipmentKilometers: { [key: string]: number } = {};
    let latestFuelPrice = 0;

    if (equipmentList.length > 0) {
      try {
        const startTime = Date.now();
        const batchSize = 500;
        const batches = [];
        for (let i = 0; i < equipmentList.length; i += batchSize) {
          batches.push(equipmentList.slice(i, i + batchSize));
        }

        const allKilometerResults: RowDataPacket[] = [];
        for (const batch of batches) {
          const [kilometerResults] = await connection.query<RowDataPacket[]>(
            `SELECT kilometers, is_kilometer_reset, issued_for
             FROM (
               SELECT 
                 fr.kilometers,
                 fr.is_kilometer_reset,
                 id.issued_for,
                 ROW_NUMBER() OVER (PARTITION BY id.issued_for ORDER BY id.issue_date DESC, fr.id DESC) as rn
               FROM fuel_records fr
               INNER JOIN issue_details id ON fr.issue_fk = id.id
               WHERE id.issued_for IN (?)
             ) ranked
             WHERE rn = 1`,
            [batch]
          );
          allKilometerResults.push(...(kilometerResults as RowDataPacket[]));
        }

        const queryTime = Date.now() - startTime;
        logEvents(`Kilometers query took ${queryTime}ms for ${equipmentList.length} equipment (${batches.length} batches)`, "fuelLog.log");

        equipmentKilometers = equipmentList.reduce((acc: { [key: string]: number }, equipment: string) => {
          const record = allKilometerResults.find(r => r.issued_for === equipment);
          acc[equipment] = record && !record.is_kilometer_reset ? record.kilometers : 0;
          return acc;
        }, {});
      } catch (kmError) {
        logEvents(`Warning: Failed to fetch kilometers: ${kmError instanceof Error ? kmError.message : 'Unknown error'}`, "fuelLog.log");
        equipmentKilometers = equipmentList.reduce((acc: { [key: string]: number }, equipment: string) => {
          acc[equipment] = 0;
          return acc;
        }, {});
      }
    }

    try {
      const [priceResult] = await connection.query<RowDataPacket[]>(
        `SELECT fuel_price 
         FROM fuel_records 
         WHERE fuel_type = ?
         ORDER BY created_datetime DESC 
         LIMIT 1`,
        [type]
      );
      latestFuelPrice = priceResult.length > 0 ? priceResult[0].fuel_price : 0;
    } catch (priceError) {
      logEvents(`Warning: Failed to fetch fuel price: ${priceError instanceof Error ? priceError.message : 'Unknown error'}`, "fuelLog.log");
    }

    const totalTime = Date.now() - totalStartTime;
    logEvents(`Total getFuelConfig took ${totalTime}ms for type: ${type}`, "fuelLog.log");
    
    res.status(200).json({
      equipment_list: equipmentList,
      equipment_kilometers: equipmentKilometers,
      latest_fuel_price: latestFuelPrice
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error getting fuel config: ${errorMessage}`, "fuelLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while getting fuel config'
    });
  } finally {
    connection.release();
  }
};

export const receiveFuel = async (req: Request, res: Response): Promise<void> => {
  const { receive_date, received_by, quantity } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [transactionResult] = await connection.query<RowDataPacket[]>(
      `INSERT INTO transaction_details 
      (transaction_type, transaction_quantity, transaction_date, transaction_status, transaction_done_by) 
      VALUES (?, ?, ?, ?, ?)`,
      ['purchase', quantity, receive_date, 'confirmed', received_by]
    );

    const transactionId = (transactionResult as any).insertId;

    const [updateResult] = await connection.query<RowDataPacket[]>(
      `UPDATE stock_details 
       SET current_balance = current_balance + ? 
       WHERE nac_code = ?`,
      [quantity, 'GT 00000']
    );

    if ((updateResult as any).affectedRows === 0) {
      throw new Error('Failed to update stock balance');
    }

    await connection.commit();
    logEvents(`Fuel received successfully - Quantity: ${quantity}, Received by: ${received_by}`, "fuelLog.log");
    
    res.status(201).json({
      message: 'Fuel received successfully',
      transaction_id: transactionId
    });
  } catch (error) {
    await connection.rollback();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error receiving fuel: ${errorMessage}`, "fuelLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while receiving fuel'
    });
  } finally {
    connection.release();
  }
};

export const getLastReceive = async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();

  try {
    const [result] = await connection.query<RowDataPacket[]>(
      `SELECT transaction_date as last_receive_date, transaction_quantity as last_receive_quantity
       FROM transaction_details
       WHERE transaction_type = 'purchase'
       AND nac_code = 'GT 00000'
       ORDER BY transaction_date DESC
       LIMIT 1`
    );

    if (result.length === 0) {
      res.status(200).json({
        last_receive_date: null,
        last_receive_quantity: 0
      });
      return;
    }

    res.status(200).json(result[0]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error getting last receive: ${errorMessage}`, "fuelLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while getting last receive'
    });
  } finally {
    connection.release();
  }
}; 