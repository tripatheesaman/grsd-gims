import { Request, Response } from 'express';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2';
import { logEvents } from '../middlewares/logger';
import {
    SPARE_STOCK_JOIN,
    SPARE_EQUIPMENT_CODES_SQL,
    SPARE_EQUIPMENT_DISPLAY_SQL,
    STOCK_FAMILY_KEY_SQL,
    VARIANT_VIRTUAL_BALANCE_SQL,
    VARIANT_TRUE_BALANCE_SQL,
    appendEquipmentFilter,
    appendUniversalAssetNameFilter,
    buildFamilyGroupedStockListSql,
    buildFamilyGroupedStockCountSql,
    equipmentDisplaySubquery,
} from '../services/spareEquipmentDisplay';
import { enrichEquipmentDisplays } from '../services/spareEquipmentEnrichment';
import { normalizePartNumber, stripSuffixFromNac } from '../utils/nacCodeUtils';
import { processItemName } from '../utils/utils';

const partHintLike = (hint: string): string => `%${hint.trim()}%`;

/** Prefer variant row whose part number matches the search hint. */
const familyIdSelectSql = (hasHint: boolean): string =>
    hasHint
        ? `COALESCE(MIN(CASE WHEN sd.part_numbers COLLATE utf8mb4_unicode_ci LIKE ? THEN sd.id END), MIN(sd.id))`
        : 'MIN(sd.id)';

const familyPartSelectSql = (hasHint: boolean): string =>
    hasHint
        ? `COALESCE(MAX(CASE WHEN sd.part_numbers COLLATE utf8mb4_unicode_ci LIKE ? THEN sd.part_numbers END), MIN(sd.part_numbers))`
        : `GROUP_CONCAT(DISTINCT sd.part_numbers ORDER BY sd.nac_code SEPARATOR ', ')`;

const resolvePartSearchHint = (
    partNumber?: string | unknown,
    universal?: string | unknown
): string => {
    const part = String(partNumber || '').trim();
    if (part) {
        return part;
    }
    const uni = String(universal || '').trim();
    if (!uni || /^(GT|TW|GS)\s*\d/i.test(uni)) {
        return '';
    }
    return uni;
};

const pickVariantByHint = <T extends { id: number; partNumber: string }>(
    variants: T[],
    hint: string,
    fallbackId: number
): T | undefined => {
    if (!variants.length) {
        return undefined;
    }
    const normalizedHint = normalizePartNumber(hint);
    if (normalizedHint) {
        const exact = variants.find(
            (v) => normalizePartNumber(v.partNumber) === normalizedHint
        );
        if (exact) {
            return exact;
        }
        const partial = variants.find((v) =>
            normalizePartNumber(v.partNumber).includes(normalizedHint)
        );
        if (partial) {
            return partial;
        }
    }
    return variants.find((v) => v.id === fallbackId) ?? variants[0];
};

interface SearchVariantRow extends RowDataPacket {
    familyKey: string;
    id: number;
    nacCode: string;
    partNumber: string;
    virtualBalance: number;
    trueBalance: number;
    openQuantity: number;
    openAmount: number;
    location: string;
}

interface SearchResult extends RowDataPacket {
    id: number;
    nacCode: string;
    itemName: string;
    partNumber: string;
    equipmentNumber: string;
    equipmentDisplay?: string;
    virtualBalance?: number;
    trueBalance?: number;
    openQuantity?: number;
    openAmount?: number;
    location: string;
    variantCount?: number;
    variants?: Array<{
        id: number;
        nacCode: string;
        partNumber: string;
        virtualBalance: number;
        trueBalance: number;
        openQuantity: number;
        openAmount: number;
        location: string;
    }>;
}
interface ItemDetails extends RowDataPacket {
    id: number;
    nacCode: string;
    itemName: string;
    partNumber: string;
    equipmentNumber: string;
    equipmentDisplay?: string;
    location: string;
    unit: string;
    openQuantity: number;
    openAmount: number;
    imageUrl: string;
    altText: string;
    receivedQuantity: number;
    rrpQuantity: number;
    issueQuantity: number;
    virtualBalance: number;
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

async function attachFamilyDetails(results: SearchResult[]): Promise<void> {
    if (!results.length) {
        return;
    }
    const keys = results.map(f => f.nacCode);
    const placeholders = keys.map(() => '?').join(', ');
    const [variantRows] = await pool.execute<SearchVariantRow[]>(
        `SELECT
            ${STOCK_FAMILY_KEY_SQL} as familyKey,
            sd.id,
            sd.nac_code as nacCode,
            sd.part_numbers as partNumber,
            ${VARIANT_VIRTUAL_BALANCE_SQL} as virtualBalance,
            ${VARIANT_TRUE_BALANCE_SQL} as trueBalance,
            COALESCE(sd.open_quantity, 0) as openQuantity,
            COALESCE(sd.open_amount, 0) as openAmount,
            sd.location
         FROM stock_details sd
         WHERE ${STOCK_FAMILY_KEY_SQL} IN (${placeholders})
         ORDER BY sd.nac_code ASC`,
        keys
    );
    const byFamily = new Map<string, SearchResult['variants']>();
    for (const row of variantRows) {
        const list = byFamily.get(row.familyKey) ?? [];
        list.push({
            id: row.id,
            nacCode: row.nacCode,
            partNumber: row.partNumber,
            virtualBalance: Number(row.virtualBalance),
            trueBalance: Number(row.trueBalance),
            openQuantity: Number(row.openQuantity),
            openAmount: Number(row.openAmount),
            location: row.location,
        });
        byFamily.set(row.familyKey, list);
    }
    for (const result of results) {
        const variants = byFamily.get(result.nacCode) ?? [];
        if (variants.length > 1) {
            result.variants = variants;
        }
        result.virtualBalance = variants.reduce((sum, v) => sum + Number(v.virtualBalance || 0), 0);
        result.trueBalance = variants.reduce((sum, v) => sum + Number(v.trueBalance || 0), 0);
        if (result.openQuantity === undefined || result.openQuantity === null) {
            result.openQuantity = variants.reduce((sum, v) => sum + Number(v.openQuantity || 0), 0);
        }
        if (result.openAmount === undefined || result.openAmount === null) {
            result.openAmount = variants.reduce((sum, v) => sum + Number(v.openAmount || 0), 0);
        }
        if (!result.variantCount) {
            result.variantCount = variants.length || 1;
        }
    }
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
            AND rd.approval_status = 'APPROVED'
          ) as receivedQuantity,
          (
            SELECT COALESCE(SUM(rd.received_quantity), 0)
            FROM receive_details rd
            WHERE rd.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
            AND rd.approval_status = 'APPROVED'
            AND rd.rrp_fk IS NOT NULL
          ) as rrpQuantity,
          (
            SELECT COALESCE(SUM(id.issue_quantity), 0)
            FROM issue_details id
            WHERE id.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
            AND id.approval_status = 'APPROVED'
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
        ${equipmentDisplaySubquery('stock_info.nac_code', 'stock_info.applicable_equipments')} as equipmentDisplay,
        location,
        unit,
        openQuantity,
        open_amount as openAmount,
        image_url as imageUrl,
        altText,
        openQuantity,
        rrpQuantity,
        issueQuantity,
        receivedQuantity,
        (openQuantity + receivedQuantity - issueQuantity) as virtualBalance,
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
        let results: ItemDetails[] = [];
        try {
            const [rows] = await pool.execute<ItemDetails[]>(query, [id]);
            results = rows;
        }
        catch (detailsQueryError) {
            logEvents(`Item details primary query failed: ${JSON.stringify(detailsQueryError)}`, 'searchLog.log');
            const [fallbackRows] = await pool.execute<ItemDetails[]>(`
      WITH stock_info AS (
        SELECT 
          sd.id, sd.nac_code, sd.item_name, sd.part_numbers, sd.applicable_equipments,
          sd.current_balance, sd.location, sd.unit, sd.open_quantity, sd.open_amount,
          sd.image_url,
          CASE WHEN INSTR(sd.item_name, ',') > 0 THEN SUBSTRING_INDEX(sd.item_name, ',', 1) ELSE sd.item_name END as altText,
          COALESCE(sd.open_quantity, 0) as openQuantity,
          (SELECT COALESCE(SUM(rd.received_quantity), 0) FROM receive_details rd
           WHERE rd.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
             AND rd.approval_status = 'APPROVED') as receivedQuantity,
          (SELECT COALESCE(SUM(rd.received_quantity), 0) FROM receive_details rd
           WHERE rd.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
             AND rd.approval_status = 'APPROVED' AND rd.rrp_fk IS NOT NULL) as rrpQuantity,
          (SELECT COALESCE(SUM(id.issue_quantity), 0) FROM issue_details id
           WHERE id.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
             AND id.approval_status = 'APPROVED') as issueQuantity,
          (SELECT CASE WHEN EXISTS (
            SELECT 1 FROM receive_details rd2 JOIN rrp_details rrp2 ON rd2.rrp_fk = rrp2.id
            WHERE rd2.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
          ) THEN (SELECT COALESCE(SUM(rrp.total_amount), 0) FROM receive_details rd
            JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
            WHERE rd.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci AND rd.rrp_fk IS NOT NULL)
          ELSE COALESCE(sd.open_amount, 0) END) as totalCost
        FROM stock_details sd WHERE sd.id = ?
      )
      SELECT id, nac_code as nacCode, item_name as itemName, part_numbers as partNumber,
        applicable_equipments as equipmentNumber, applicable_equipments as equipmentDisplay,
        location, unit,
        openQuantity, open_amount as openAmount, image_url as imageUrl, altText,
        receivedQuantity, rrpQuantity, issueQuantity,
        (openQuantity + receivedQuantity - issueQuantity) as virtualBalance,
        (openQuantity + rrpQuantity - issueQuantity) as trueBalance,
        CASE WHEN rrpQuantity > 0 THEN totalCost / rrpQuantity
             WHEN openQuantity > 0 THEN totalCost / openQuantity ELSE 0 END as averageCostPerUnit
      FROM stock_info`, [id]);
            results = fallbackRows;
        }
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
        await enrichEquipmentDisplays(results);
        const primary = results[0];
        const [baseRow] = await pool.execute<RowDataPacket[]>(
            `SELECT COALESCE(NULLIF(base_nac_code, ''), nac_code) AS baseNac FROM stock_details WHERE id = ?`,
            [id]
        );
        const baseNacCode = baseRow.length
            ? String(baseRow[0].baseNac)
            : stripSuffixFromNac(primary.nacCode);

        const variantQuery = `
      WITH stock_info AS (
        SELECT 
          sd.id, sd.nac_code, sd.part_numbers, sd.image_url,
          COALESCE(sd.open_quantity, 0) as openQuantity,
          (SELECT COALESCE(SUM(rd.received_quantity), 0) FROM receive_details rd
           WHERE rd.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
             AND rd.approval_status = 'APPROVED') as receivedQuantity,
          (SELECT COALESCE(SUM(rd.received_quantity), 0) FROM receive_details rd
           WHERE rd.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
             AND rd.approval_status = 'APPROVED' AND rd.rrp_fk IS NOT NULL) as rrpQuantity,
          (SELECT COALESCE(SUM(id.issue_quantity), 0) FROM issue_details id
           WHERE id.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
             AND id.approval_status = 'APPROVED') as issueQuantity,
          (SELECT CASE WHEN EXISTS (
            SELECT 1 FROM receive_details rd2 JOIN rrp_details rrp2 ON rd2.rrp_fk = rrp2.id
            WHERE rd2.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
          ) THEN (SELECT COALESCE(SUM(rrp.total_amount), 0) FROM receive_details rd
            JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
            WHERE rd.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci AND rd.rrp_fk IS NOT NULL)
          ELSE COALESCE(sd.open_amount, 0) END) as totalCost
        FROM stock_details sd
        WHERE sd.base_nac_code = ? OR sd.nac_code = ?
        ORDER BY sd.nac_code ASC
      )
      SELECT id, nac_code as nacCode, part_numbers as partNumber,
        image_url as imageUrl,
        openQuantity, receivedQuantity, rrpQuantity, issueQuantity,
        (openQuantity + receivedQuantity - issueQuantity) as virtualBalance,
        (openQuantity + rrpQuantity - issueQuantity) as trueBalance,
        CASE WHEN rrpQuantity > 0 THEN totalCost / rrpQuantity
             WHEN openQuantity > 0 THEN totalCost / openQuantity ELSE 0 END as averageCostPerUnit
      FROM stock_info`;

        const [variantRows] = await pool.execute<RowDataPacket[]>(variantQuery, [baseNacCode, baseNacCode]);
        const variants = variantRows.map(v => ({
            id: v.id,
            nacCode: v.nacCode,
            partNumber: v.partNumber,
            virtualBalance: Number(v.virtualBalance),
            trueBalance: Number(v.trueBalance),
            averageCostPerUnit: Number(v.averageCostPerUnit),
            imageUrl: v.imageUrl || '',
        }));

        const partHint = String(req.query.partNumber || req.query.part || '').trim();
        const matchedVariant = pickVariantByHint(variants, partHint, Number(id));
        const displayVariant = matchedVariant ?? variants.find(v => v.id === Number(id)) ?? variants[0];
        const orderedVariants = matchedVariant
            ? [matchedVariant, ...variants.filter(v => v.id !== matchedVariant.id)]
            : variants;

        const totalVirtualBalance = variants.reduce((sum, v) => sum + v.virtualBalance, 0);
        const totalTrueBalance = variants.reduce((sum, v) => sum + v.trueBalance, 0);

        logEvents(`Successfully fetched item details for ID: ${id}`, "searchLog.log");
        res.json({
            ...primary,
            id: displayVariant?.id ?? primary.id,
            nacCode: baseNacCode,
            itemName: processItemName(primary.itemName),
            partNumber: displayVariant?.partNumber ?? primary.partNumber,
            imageUrl: displayVariant?.imageUrl || primary.imageUrl,
            virtualBalance: displayVariant?.virtualBalance ?? Number(primary.virtualBalance ?? totalVirtualBalance),
            trueBalance: displayVariant?.trueBalance ?? Number(primary.trueBalance ?? totalTrueBalance),
            averageCostPerUnit: displayVariant?.averageCostPerUnit ?? Number(primary.averageCostPerUnit ?? 0),
            totalVirtualBalance,
            totalTrueBalance,
            selectedVariantId: displayVariant?.id ?? primary.id,
            variants: orderedVariants,
        });
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
        const useSpareCompatibility = tableName === 'stock_details';
        const partSearchHint = resolvePartSearchHint(partNumber, universal);
        const hasPartHint = Boolean(partSearchHint);
        const partHintParams = hasPartHint ? [partHintLike(partSearchHint), partHintLike(partSearchHint)] : [];
        let query = useSpareCompatibility
            ? `
      SELECT 
        ${familyIdSelectSql(hasPartHint)} as id,
        ${STOCK_FAMILY_KEY_SQL} as nacCode,
        SUBSTRING_INDEX(MIN(sd.item_name), ',', 1) as itemName,
        ${familyPartSelectSql(hasPartHint)} as partNumber,
        ${SPARE_EQUIPMENT_CODES_SQL} as equipmentNumber,
        ${SPARE_EQUIPMENT_DISPLAY_SQL} as equipmentDisplay,
        MAX(sd.location) as location,
        MAX(sd.unit) as unit,
        COALESCE(SUM(sd.open_quantity), 0) as openQuantity,
        COALESCE(SUM(sd.open_amount), 0) as openAmount,
        COUNT(DISTINCT sd.id) as variantCount
      FROM ${tableName} sd
      ${SPARE_STOCK_JOIN}
      WHERE 1=1
    `
            : `
      SELECT 
        id as id,
        nac_code as nacCode,
        item_name as itemName,
        part_numbers as partNumber,
        applicable_equipments as equipmentNumber,
        applicable_equipments as equipmentDisplay,
        location as location,
        unit as unit,
        COALESCE(open_quantity, 0) as openQuantity,
        COALESCE(open_amount, 0) as openAmount
      FROM ${tableName}
      WHERE 1=1
    `;
        logEvents(`Base query: ${query}`, "searchLog.log");
        const params: any[] = [];
        let hasSearchConditions = false;
        if (universal && universal.toString().trim() !== '') {
            hasSearchConditions = true;
            if (useSpareCompatibility) {
                query += ` AND (
        sd.nac_code COLLATE utf8mb4_unicode_ci LIKE ? OR
        ${STOCK_FAMILY_KEY_SQL} COLLATE utf8mb4_unicode_ci LIKE ? OR
        sd.item_name COLLATE utf8mb4_unicode_ci LIKE ? OR
        sd.part_numbers COLLATE utf8mb4_unicode_ci LIKE ? OR
        sd.applicable_equipments COLLATE utf8mb4_unicode_ci LIKE ?`;
                params.push(`%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`);
                query = appendUniversalAssetNameFilter('sd', useSpareCompatibility, query, params);
                params.push(`%${universal}%`);
            }
            else {
                query += ` AND (
        nac_code COLLATE utf8mb4_unicode_ci LIKE ? OR
        item_name COLLATE utf8mb4_unicode_ci LIKE ? OR
        part_numbers COLLATE utf8mb4_unicode_ci LIKE ? OR
        applicable_equipments COLLATE utf8mb4_unicode_ci LIKE ?`;
                params.push(`%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`);
            }
            query += `)`;
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
            query = appendEquipmentFilter('sd', useSpareCompatibility, String(equipmentNumber), query, params);
        }
        if (partNumber && partNumber.toString().trim() !== '') {
            hasSearchConditions = true;
            query += ` AND ${useSpareCompatibility ? 'sd.part_numbers' : 'part_numbers'} LIKE ?`;
            params.push(`%${partNumber}%`);
        }
        const currentPage = parseInt(page.toString()) || 1;
        const limit = parseInt(pageSize.toString()) || 20;
        const offset = (currentPage - 1) * limit;
        if (useSpareCompatibility) {
            query += ` GROUP BY ${STOCK_FAMILY_KEY_SQL}`;
        }
        query += ` ORDER BY ${useSpareCompatibility ? 'MIN(sd.id)' : 'id'} ASC LIMIT ${limit} OFFSET ${offset}`;
        const executeParams =
            useSpareCompatibility && hasPartHint ? [...partHintParams, ...params] : params;
        logEvents(`Executing RRP search query: ${query} with params: ${JSON.stringify(executeParams)}`, "searchLog.log");
        let results: SearchResult[] = [];
        try {
            const [queryResults] = await pool.execute<SearchResult[]>(query, executeParams);
            results = queryResults;
            logEvents(`Search query returned ${results.length} results`, "searchLog.log");
            if (results.length > 0) {
                logEvents(`First result: ${JSON.stringify(results[0])}`, "searchLog.log");
            }
        }
        catch (queryError) {
            logEvents(`Main search query failed: ${JSON.stringify(queryError)}`, "searchLog.log");
            const hasFilters =
                Boolean(universal && universal.toString().trim()) ||
                Boolean(equipmentNumber && equipmentNumber.toString().trim()) ||
                Boolean(partNumber && partNumber.toString().trim());
            if (!hasFilters && useSpareCompatibility) {
                try {
                    logEvents('Attempting family-grouped stock list fallback (no filters)', 'searchLog.log');
                    const [fallbackResults] = await pool.execute<SearchResult[]>(
                        buildFamilyGroupedStockListSql(limit, offset)
                    );
                    results = fallbackResults;
                    logEvents(`Family grouped fallback returned ${results.length} results`, 'searchLog.log');
                }
                catch (fallbackError) {
                    logEvents(`Family grouped fallback failed: ${JSON.stringify(fallbackError)}`, 'searchLog.log');
                    results = [];
                }
            }
            else if (useSpareCompatibility) {
                try {
                    logEvents('Attempting family-grouped fallback with filters', 'searchLog.log');
                    const [fallbackResults] = await pool.execute<SearchResult[]>(
                        buildFamilyGroupedStockListSql(limit, offset)
                    );
                    results = fallbackResults;
                }
                catch {
                    results = [];
                }
            }
            else if (universal && universal.toString().trim() !== '') {
                try {
                    logEvents(`Attempting fallback search for: ${universal}`, "searchLog.log");
                    const [fallbackResults] = await pool.execute<SearchResult[]>(`SELECT 
              id,
              nac_code as nacCode,
              item_name as itemName,
              part_numbers as partNumber,
              applicable_equipments as equipmentNumber,
              applicable_equipments as equipmentDisplay,
              current_balance as currentBalance,
              COALESCE(open_quantity, 0) as openQuantity,
              COALESCE(open_amount, 0) as openAmount,
              unit,
              location
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
            let countQuery = useSpareCompatibility
                ? `SELECT COUNT(DISTINCT ${STOCK_FAMILY_KEY_SQL}) as total FROM ${tableName} sd WHERE 1=1`
                : `SELECT COUNT(*) as total FROM ${tableName} WHERE 1=1`;
            const countParams: any[] = [];
            if (universal && universal.toString().trim() !== '') {
                if (useSpareCompatibility) {
                    countQuery += ` AND (
          sd.nac_code COLLATE utf8mb4_unicode_ci LIKE ? OR
          ${STOCK_FAMILY_KEY_SQL} COLLATE utf8mb4_unicode_ci LIKE ? OR
          sd.item_name COLLATE utf8mb4_unicode_ci LIKE ? OR
          sd.part_numbers COLLATE utf8mb4_unicode_ci LIKE ? OR
          sd.applicable_equipments COLLATE utf8mb4_unicode_ci LIKE ?`;
                    countParams.push(`%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`);
                    countQuery = appendUniversalAssetNameFilter('sd', useSpareCompatibility, countQuery, countParams);
                    countParams.push(`%${universal}%`);
                }
                else {
                    countQuery += ` AND (
          nac_code COLLATE utf8mb4_unicode_ci LIKE ? OR
          item_name COLLATE utf8mb4_unicode_ci LIKE ? OR
          part_numbers COLLATE utf8mb4_unicode_ci LIKE ? OR
          applicable_equipments COLLATE utf8mb4_unicode_ci LIKE ?`;
                    countParams.push(`%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`);
                }
                countQuery += `)`;
            }
            if (equipmentNumber && equipmentNumber.toString().trim() !== '') {
                countQuery = appendEquipmentFilter('sd', useSpareCompatibility, String(equipmentNumber), countQuery, countParams);
            }
            if (partNumber && partNumber.toString().trim() !== '') {
                countQuery += ` AND ${useSpareCompatibility ? 'sd.part_numbers' : 'part_numbers'} LIKE ?`;
                countParams.push(`%${partNumber}%`);
            }
            const [countResult] = await pool.execute<CountResult[]>(countQuery, countParams);
            totalCount = (countResult as any)[0]?.total || 0;
        }
        catch (countError) {
            logEvents(`Count query failed: ${JSON.stringify(countError)}`, "searchLog.log");
            const hasFilters =
                Boolean(universal && universal.toString().trim()) ||
                Boolean(equipmentNumber && equipmentNumber.toString().trim()) ||
                Boolean(partNumber && partNumber.toString().trim());
            if (!hasFilters && useSpareCompatibility) {
                try {
                    const [simpleCount] = await pool.execute<CountResult[]>(buildFamilyGroupedStockCountSql());
                    totalCount = (simpleCount as CountResult[])[0]?.total || 0;
                }
                catch {
                    totalCount = results.length;
                }
            }
        }
        if (results.length > 0) {
            await enrichEquipmentDisplays(results);
            if (useSpareCompatibility) {
                await attachFamilyDetails(results);
            }
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
