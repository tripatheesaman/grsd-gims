import { Request, Response } from 'express';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2';
import { logEvents } from '../middlewares/logger';
interface SearchResult extends RowDataPacket {
    id: number;
    nacCode: string;
    itemName: string;
    partNumber: string;
    equipmentNumber: string;
    currentBalance: number;
    location: string;
    cardNumber: string;
}
interface ItemDetails extends RowDataPacket {
    id: number;
    nacCode: string;
    itemName: string;
    partNumber: string;
    equipmentNumber: string;
    currentBalance: number;
    location: string;
    cardNumber: string;
    unit: string;
    openQuantity: number;
    openAmount: number;
    imageUrl: string;
    altText: string;
    trueBalance: number;
    averageCostPerUnit: number;
}
interface CountResult extends RowDataPacket {
    total: number;
}
interface SearchError extends Error {
    code?: string;
    errno?: number;
    sqlState?: string;
    sqlMessage?: string;
}
export const getItemDetails = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    if (!id) {
        logEvents(`Failed to fetch item details - Missing ID parameter`, "searchLog.log");
        res.status(400).json({
            error: 'Bad Request',
            message: 'Item ID is required'
        });
        return;
    }
    try {
        logEvents(`Fetching item details for ID: ${id}`, "searchLog.log");
        const query = `
      WITH stock_info AS (
        SELECT 
          sd.id,
          sd.nac_code,
          sd.item_name,
          sd.part_numbers,
          sd.applicable_equipments,
          sd.current_balance,
          sd.location,
          sd.card_number,
          sd.unit,
          sd.open_quantity,
          sd.open_amount,
          sd.image_url,
          CASE 
            WHEN INSTR(sd.item_name, ',') > 0 
            THEN SUBSTRING_INDEX(sd.item_name, ',', 1)
            ELSE sd.item_name
          END as altText,
          COALESCE(sd.open_quantity, 0) as openQuantity,
          (
            SELECT COALESCE(SUM(rd.received_quantity), 0)
            FROM receive_details rd
            WHERE rd.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
            AND rd.rrp_fk IS NOT NULL
          ) as rrpQuantity,
          (
            SELECT COALESCE(SUM(id.issue_quantity), 0)
            FROM issue_details id
            WHERE id.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
          ) as issueQuantity,
          (
            SELECT 
              CASE 
                WHEN EXISTS (
                  SELECT 1 FROM receive_details rd2 
                  JOIN rrp_details rrp2 ON rd2.rrp_fk = rrp2.id 
                  WHERE rd2.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
                ) THEN (
                  SELECT COALESCE(SUM(rrp.total_amount), 0)
                  FROM receive_details rd
                  JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
                  WHERE rd.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
                  AND rd.rrp_fk IS NOT NULL
                )
                ELSE COALESCE(sd.open_amount, 0)
              END
          ) as totalCost
        FROM stock_details sd
        WHERE sd.id = ?
      )
      SELECT 
        id,
        nac_code as nacCode,
        item_name as itemName,
        part_numbers as partNumber,
        applicable_equipments as equipmentNumber,
        current_balance as currentBalance,
        location,
        card_number as cardNumber,
        unit,
        openQuantity,
        open_amount as openAmount,
        image_url as imageUrl,
        altText,
        openQuantity,
        rrpQuantity,
        issueQuantity,
        (openQuantity + rrpQuantity - issueQuantity) as trueBalance,
        CASE 
          WHEN rrpQuantity > 0 
          THEN totalCost / rrpQuantity
          WHEN openQuantity > 0 
          THEN totalCost / openQuantity
          ELSE 0 
        END as averageCostPerUnit
      FROM stock_info
    `;
        const [results] = await pool.execute<ItemDetails[]>(query, [id]);
        if (results.length === 0) {
            logEvents(`Item not found for ID: ${id}`, "searchLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Item not found'
            });
            return;
        }
        try {
            const [costDebug] = await pool.execute(`
        SELECT 
          rd.nac_code,
          rd.rrp_fk,
          rd.request_fk,
          rrp.total_amount,
          rrp.rrp_number,
          rqd.nac_code as request_nac_code
        FROM receive_details rd
        JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
        LEFT JOIN request_details rqd ON rd.request_fk = rqd.id
        WHERE rd.nac_code = ?
        AND rd.rrp_fk IS NOT NULL
      `, [results[0].nacCode]);
            logEvents(`Cost calculation debug for ${results[0].nacCode}: ${JSON.stringify(costDebug)}`, "searchLog.log");
            const [codeTransferDebug] = await pool.execute(`
        SELECT 
          rrp.rrp_number,
          rrp.total_amount,
          rrp.date,
          rd.nac_code,
          rd.received_quantity
        FROM rrp_details rrp
        JOIN receive_details rd ON rrp.receive_fk = rd.id
        WHERE rd.nac_code = ?
        AND rrp.rrp_number = 'Code Transfer'
      `, [results[0].nacCode]);
            logEvents(`Code Transfer RRP debug for ${results[0].nacCode}: ${JSON.stringify(codeTransferDebug)}`, "searchLog.log");
            const [allRRPsDebug] = await pool.execute(`
        SELECT 
          rrp.rrp_number,
          rrp.total_amount,
          rrp.date,
          rd.nac_code,
          rd.received_quantity,
          rd.request_fk
        FROM rrp_details rrp
        JOIN receive_details rd ON rrp.receive_fk = rd.id
        WHERE rd.nac_code = ?
        AND rd.rrp_fk IS NOT NULL
        ORDER BY rrp.date DESC
      `, [results[0].nacCode]);
            logEvents(`All RRPs debug for ${results[0].nacCode}: ${JSON.stringify(allRRPsDebug)}`, "searchLog.log");
            const [stockDebug] = await pool.execute(`
        SELECT 
          nac_code,
          open_quantity,
          open_amount,
          current_balance
        FROM stock_details
        WHERE nac_code = ?
      `, [results[0].nacCode]);
            logEvents(`Stock details debug for ${results[0].nacCode}: ${JSON.stringify(stockDebug)}`, "searchLog.log");
        }
        catch (debugError) {
            logEvents(`Cost debug query failed: ${JSON.stringify(debugError)}`, "searchLog.log");
        }
        logEvents(`Successfully fetched item details for ID: ${id}`, "searchLog.log");
        res.json(results[0]);
    }
    catch (error) {
        const searchError = error as SearchError;
        const errorMessage = searchError.message || 'Unknown error occurred';
        logEvents(`Error fetching item details for ID ${id}: ${errorMessage}`, "searchLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'An error occurred while fetching item details',
            details: errorMessage
        });
    }
};
export const searchStockDetails = async (req: Request, res: Response): Promise<void> => {
    const { universal, equipmentNumber, partNumber, page = 1, pageSize = 20 } = req.query;
    logEvents(`searchStockDetails called with query params: ${JSON.stringify(req.query)}`, "searchLog.log");
    logEvents(`Request headers: ${JSON.stringify(req.headers)}`, "searchLog.log");
    try {
        logEvents(`Starting stock search with parameters: universal=${universal}, equipmentNumber=${equipmentNumber}, partNumber=${partNumber}, page=${page}, pageSize=${pageSize}`, "searchLog.log");
        let tableName = 'stock_details';
        let tableCheck: any;
        try {
            const [tables] = await pool.execute('SHOW TABLES');
            logEvents(`Available tables: ${JSON.stringify(tables)}`, "searchLog.log");
            try {
                [tableCheck] = await pool.execute('DESCRIBE stock_details');
                logEvents(`Table structure check for stock_details: ${JSON.stringify(tableCheck)}`, "searchLog.log");
            }
            catch (tableError) {
                logEvents(`stock_details table not found, trying alternatives`, "searchLog.log");
                const alternativeNames = ['stock_detail', 'stock', 'inventory', 'items'];
                for (const altName of alternativeNames) {
                    try {
                        [tableCheck] = await pool.execute(`DESCRIBE ${altName}`);
                        tableName = altName;
                        logEvents(`Found alternative table: ${altName}`, "searchLog.log");
                        break;
                    }
                    catch (altError) {
                    }
                }
                if (!tableCheck) {
                    throw new Error(`No suitable table found. Available tables: ${JSON.stringify(tables)}`);
                }
            }
        }
        catch (tableError) {
            logEvents(`Table structure check failed: ${JSON.stringify(tableError)}`, "searchLog.log");
            res.status(500).json({
                error: 'Database Error',
                message: 'stock_details table not found or inaccessible',
                details: tableError instanceof Error ? tableError.message : 'Unknown table error'
            });
            return;
        }
        let query = `
      SELECT 
        id,
        nac_code as nacCode,
        item_name as itemName,
        part_numbers as partNumber,
        applicable_equipments as equipmentNumber,
        current_balance as currentBalance,
        location,
        unit,
        card_number as cardNumber
      FROM ${tableName}
      WHERE 1=1
    `;
        logEvents(`Base query: ${query}`, "searchLog.log");
        const params: (string | number)[] = [];
        let hasSearchConditions = false;
        if (universal && universal.toString().trim() !== '') {
            hasSearchConditions = true;
            query += ` AND (
        nac_code COLLATE utf8mb4_unicode_ci LIKE ? OR
        item_name COLLATE utf8mb4_unicode_ci LIKE ? OR
        part_numbers COLLATE utf8mb4_unicode_ci LIKE ? OR
        applicable_equipments COLLATE utf8mb4_unicode_ci LIKE ?
      )`;
            params.push(`%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`);
            logEvents(`Using LIKE search for universal parameter: ${universal}`, "searchLog.log");
            logEvents(`Search term: "${universal}", length: ${universal.length}, trimmed: "${universal.toString().trim()}"`, "searchLog.log");
            try {
                const [directSearch] = await pool.execute(`SELECT COUNT(*) as count FROM ${tableName} WHERE nac_code LIKE ?`, [`%${universal}%`]);
                logEvents(`Direct search count for "${universal}": ${JSON.stringify(directSearch)}`, "searchLog.log");
            }
            catch (directError) {
                logEvents(`Direct search failed: ${JSON.stringify(directError)}`, "searchLog.log");
            }
        }
        if (equipmentNumber && equipmentNumber.toString().trim() !== '') {
            hasSearchConditions = true;
            query += ` AND applicable_equipments LIKE ?`;
            params.push(`%${equipmentNumber}%`);
        }
        if (partNumber && partNumber.toString().trim() !== '') {
            hasSearchConditions = true;
            query += ` AND part_numbers LIKE ?`;
            params.push(`%${partNumber}%`);
        }
        const currentPage = parseInt(page.toString()) || 1;
        const limit = parseInt(pageSize.toString()) || 20;
        const offset = (currentPage - 1) * limit;
        query += ` ORDER BY id ASC LIMIT ${limit} OFFSET ${offset}`;
        logEvents(`Executing RRP search query: ${query} with params: ${JSON.stringify(params)}`, "searchLog.log");
        let results: SearchResult[] = [];
        try {
            const [queryResults] = await pool.execute<SearchResult[]>(query, params);
            results = queryResults;
            logEvents(`Search query returned ${results.length} results`, "searchLog.log");
            if (results.length > 0) {
                logEvents(`First result: ${JSON.stringify(results[0])}`, "searchLog.log");
            }
        }
        catch (queryError) {
            logEvents(`Main search query failed: ${JSON.stringify(queryError)}`, "searchLog.log");
            if (universal && universal.toString().trim() !== '') {
                try {
                    logEvents(`Attempting fallback search for: ${universal}`, "searchLog.log");
                    const [fallbackResults] = await pool.execute<SearchResult[]>(`SELECT 
              id,
              nac_code as nacCode,
              item_name as itemName,
              part_numbers as partNumber,
              applicable_equipments as equipmentNumber,
              current_balance as currentBalance,
              unit,
              location,
              card_number as cardNumber
            FROM ${tableName}
            WHERE nac_code LIKE ? OR item_name LIKE ?
            ORDER BY id ASC LIMIT ${limit} OFFSET ${offset}`, [`%${universal}%`, `%${universal}%`]);
                    results = fallbackResults;
                    logEvents(`Fallback search returned ${results.length} results`, "searchLog.log");
                }
                catch (fallbackError) {
                    logEvents(`Fallback search also failed: ${JSON.stringify(fallbackError)}`, "searchLog.log");
                    results = [];
                }
            }
        }
        let totalCount = 0;
        try {
            let countQuery = `SELECT COUNT(*) as total FROM ${tableName} WHERE 1=1`;
            const countParams: (string | number)[] = [];
            if (universal && universal.toString().trim() !== '') {
                countQuery += ` AND (
          nac_code COLLATE utf8mb4_unicode_ci LIKE ? OR
          item_name COLLATE utf8mb4_unicode_ci LIKE ? OR
          part_numbers COLLATE utf8mb4_unicode_ci LIKE ? OR
          applicable_equipments COLLATE utf8mb4_unicode_ci LIKE ?
        )`;
                countParams.push(`%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`);
            }
            if (equipmentNumber && equipmentNumber.toString().trim() !== '') {
                countQuery += ` AND applicable_equipments LIKE ?`;
                countParams.push(`%${equipmentNumber}%`);
            }
            if (partNumber && partNumber.toString().trim() !== '') {
                countQuery += ` AND part_numbers LIKE ?`;
                countParams.push(`%${partNumber}%`);
            }
            const [countResult] = await pool.execute<CountResult[]>(countQuery, countParams);
            totalCount = (countResult as any)[0]?.total || 0;
        }
        catch (countError) {
            logEvents(`Count query failed: ${JSON.stringify(countError)}`, "searchLog.log");
        }
        if (results.length === 0) {
            logEvents(`No results found${hasSearchConditions ? ' for search parameters' : ''}`, "searchLog.log");
            res.json({
                data: [],
                pagination: {
                    currentPage,
                    pageSize: limit,
                    totalCount,
                    totalPages: Math.ceil(totalCount / limit)
                }
            });
        }
        else {
            logEvents(`Successfully found ${results.length} results${hasSearchConditions ? ' for search parameters' : ''}`, "searchLog.log");
            res.json({
                data: results,
                pagination: {
                    currentPage,
                    pageSize: limit,
                    totalCount,
                    totalPages: Math.ceil(totalCount / limit)
                }
            });
        }
    }
    catch (error) {
        const searchError = error as SearchError;
        const errorMessage = searchError.message || 'Unknown error occurred';
        logEvents(`Search error details: ${JSON.stringify({
            message: errorMessage,
            code: searchError.code,
            errno: searchError.errno,
            sqlState: searchError.sqlState,
            sqlMessage: searchError.sqlMessage,
            stack: searchError.stack
        })}`, "searchLog.log");
        logEvents(`Search error: ${errorMessage}`, "searchLog.log");
        if (searchError.code === 'ER_FT_MATCHING_KEY_NOT_FOUND') {
            logEvents(`Full-text search configuration error`, "searchLog.log");
            res.status(400).json({
                error: 'Search Configuration Error',
                message: 'Full-text search is not properly configured',
                details: 'Please contact system administrator to set up the required FULLTEXT index',
                fallback: 'Using basic search instead'
            });
            return;
        }
        if (searchError.code?.startsWith('ER_')) {
            logEvents(`Database error during search: ${searchError.sqlMessage}`, "searchLog.log");
            res.status(500).json({
                error: 'Database Error',
                message: 'An error occurred while searching',
                details: searchError.sqlMessage
            });
            return;
        }
        logEvents(`Unexpected error during search: ${errorMessage}`, "searchLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'An unexpected error occurred',
            details: errorMessage
        });
    }
};
export const getAvailableUnits = async (req: Request, res: Response): Promise<void> => {
    try {
        const [results] = await pool.execute<RowDataPacket[]>(`SELECT DISTINCT unit 
      FROM stock_details 
      WHERE unit IS NOT NULL 
      AND unit != '' 
      AND unit != 'N/A'
      ORDER BY unit ASC`);
        const units = results.map(row => row.unit).filter(Boolean);
        logEvents(`Successfully fetched ${units.length} unique units from stock_details`, "searchLog.log");
        res.status(200).json({
            units
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching available units: ${errorMessage}`, "searchLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
};
