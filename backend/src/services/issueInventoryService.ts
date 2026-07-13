import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { logEvents } from '../middlewares/logger';
import { isFuelNacCode } from './issueValidationService';
import { VARIANT_TRUE_BALANCE_SQL, VARIANT_VIRTUAL_BALANCE_SQL } from './spareEquipmentDisplay';
interface ReceiveLot {
    id: number;
    totalQuantity: number;
    remainingQuantity: number;
    unitCost: number;
    dateStr: string;
}
interface IssueUpdate {
    id: number;
    newCost: number;
    newRemainingBalance: number;
}
const normalizeDateString = (value: Date | string | null): string => {
    if (!value)
        return '1970-01-01';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return '1970-01-01';
    }
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
export const rebuildNacInventoryState = async (connection: PoolConnection, nacCode: string): Promise<void> => {
    const [stockRows] = await connection.execute<RowDataPacket[]>(`SELECT open_quantity, open_amount, COALESCE(open_remaining_quantity, open_quantity) as open_remaining_quantity
     FROM stock_details
     WHERE nac_code = ?
     FOR UPDATE`, [nacCode]);
    if (stockRows.length === 0) {
        logEvents(`rebuildNacInventoryState skipped - No stock_details found for NAC: ${nacCode}`, 'issueLog.log');
        return;
    }
    const stock = stockRows[0];
    const openingUnitCost = Number(stock.open_quantity || 0) > 0 && Number(stock.open_amount || 0) > 0
        ? Number(stock.open_amount) / Number(stock.open_quantity)
        : 0;
    let openingRemaining = Number(stock.open_quantity || 0);
    const [receiveRows] = await connection.execute<RowDataPacket[]>(`SELECT 
        rd.id,
        rd.receive_date,
        rd.received_quantity,
        rd.rrp_fk,
        COALESCE(
          rrp.total_amount,
          rrp.item_price * rd.received_quantity,
          0
        ) AS rrp_total_amount
     FROM receive_details rd
     LEFT JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
     WHERE rd.nac_code = ?
       AND rd.approval_status = 'APPROVED'
     ORDER BY rd.receive_date ASC, rd.id ASC
     FOR UPDATE`, [nacCode]);
    const receiveLots: ReceiveLot[] = receiveRows.map((row) => {
        const totalQuantity = Number(row.received_quantity || 0);
        const totalAmount = Number(row.rrp_total_amount || 0);
        const unitCost = totalQuantity > 0 && totalAmount > 0 ? totalAmount / totalQuantity : 0;
        return {
            id: Number(row.id),
            totalQuantity,
            remainingQuantity: totalQuantity,
            unitCost,
            dateStr: normalizeDateString(row.receive_date),
        };
    });
    const [issueRows] = await connection.execute<RowDataPacket[]>(`SELECT 
        id,
        issue_date,
        issue_quantity,
        issue_cost,
        approval_status
     FROM issue_details
     WHERE nac_code = ?
     ORDER BY issue_date ASC, id ASC
     FOR UPDATE`, [nacCode]);
    const timeline = [
        ...receiveLots.map((lot) => ({
            type: 'receive' as const,
            dateStr: lot.dateStr,
            id: lot.id,
            lot,
        })),
        ...issueRows.map((issue) => ({
            type: 'issue' as const,
            dateStr: normalizeDateString(issue.issue_date),
            id: Number(issue.id),
            issue,
        })),
    ].sort((a, b) => {
        const dateDiff = a.dateStr.localeCompare(b.dateStr);
        if (dateDiff !== 0)
            return dateDiff;
        if (a.type !== b.type) {
            return a.type === 'receive' ? -1 : 1;
        }
        return a.id - b.id;
    });
    const activeReceiveLots: ReceiveLot[] = [];
    let runningBalance = openingRemaining;
    const issueUpdates: IssueUpdate[] = [];
    const isFuelNac = isFuelNacCode(nacCode);
    for (const event of timeline) {
        if (event.type === 'receive') {
            activeReceiveLots.push(event.lot);
            runningBalance += event.lot.totalQuantity;
            continue;
        }
        const issue = event.issue;
        const issueQuantity = Number(issue.issue_quantity || 0);
        if (issueQuantity <= 0) {
            issueUpdates.push({
                id: Number(issue.id),
                newCost: Number(issue.issue_cost || 0),
                newRemainingBalance: Math.max(0, runningBalance),
            });
            continue;
        }
        let qtyNeeded = issueQuantity;
        let issueCost = 0;
        if (openingRemaining > 0) {
            const consumed = Math.min(openingRemaining, qtyNeeded);
            if (consumed > 0) {
                issueCost += consumed * openingUnitCost;
                openingRemaining -= consumed;
                qtyNeeded -= consumed;
            }
        }
        if (qtyNeeded > 0) {
            for (const lot of activeReceiveLots) {
                if (lot.remainingQuantity <= 0)
                    continue;
                const consumed = Math.min(lot.remainingQuantity, qtyNeeded);
                if (consumed <= 0)
                    continue;
                issueCost += consumed * lot.unitCost;
                lot.remainingQuantity -= consumed;
                qtyNeeded -= consumed;
                if (qtyNeeded <= 0)
                    break;
            }
        }
        if (qtyNeeded > 0) {
            logEvents(`Warning: NAC ${nacCode} issue ${issue.id} could not be fully allocated (${qtyNeeded} short)`, 'issueLog.log');
        }
        runningBalance -= issueQuantity;
        const newRemainingBalance = Math.max(0, runningBalance);
        const resolvedCost = isFuelNac && Number(issue.issue_cost || 0) > 0 ? Number(issue.issue_cost) : Number(issueCost.toFixed(4));
        issueUpdates.push({
            id: Number(issue.id),
            newCost: resolvedCost,
            newRemainingBalance,
        });
    }
    for (const lot of receiveLots) {
        await connection.execute(`UPDATE receive_details SET remaining_quantity = ? WHERE id = ?`, [Math.max(0, Number(lot.remainingQuantity.toFixed(4))), lot.id]);
    }
    for (const item of issueUpdates) {
        await connection.execute(`UPDATE issue_details SET issue_cost = ?, remaining_balance = ? WHERE id = ?`, [item.newCost, item.newRemainingBalance, item.id]);
    }
    await connection.execute(`UPDATE stock_details SET open_remaining_quantity = ? WHERE nac_code = ?`, [Math.max(0, Number(openingRemaining.toFixed(4))), nacCode]);
};
export const rebuildAllNacInventoryStates = async (connection: PoolConnection): Promise<number> => {
    const [rows] = await connection.execute<RowDataPacket[]>(`SELECT DISTINCT nac_code FROM stock_details WHERE nac_code IS NOT NULL AND nac_code != '' ORDER BY nac_code ASC`);
    let processed = 0;
    for (const row of rows) {
        const nacCode = String(row.nac_code);
        await rebuildNacInventoryState(connection, nacCode);
        processed += 1;
    }
    return processed;
};

const BALANCE_SYNC_EPSILON = 0.0001;

export async function readComputedVirtualBalance(
    connection: PoolConnection,
    nacCode: string
): Promise<number> {
    const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT ${VARIANT_VIRTUAL_BALANCE_SQL} AS virtualBalance
         FROM stock_details sd
         WHERE sd.nac_code = ?`,
        [nacCode]
    );
    return Number(rows[0]?.virtualBalance ?? 0);
}

export async function readComputedTrueBalance(
    connection: PoolConnection,
    nacCode: string
): Promise<number> {
    const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT ${VARIANT_TRUE_BALANCE_SQL} AS trueBalance
         FROM stock_details sd
         WHERE sd.nac_code = ?`,
        [nacCode]
    );
    return Number(rows[0]?.trueBalance ?? 0);
}

/** Sync stored current_balance to computed virtual balance (open + receives − issues). */
export async function syncStockCurrentBalance(
    connection: PoolConnection,
    nacCode: string
): Promise<boolean> {
    const [stockRows] = await connection.execute<RowDataPacket[]>(
        `SELECT current_balance FROM stock_details WHERE nac_code = ?`,
        [nacCode]
    );
    if (!stockRows.length) {
        return false;
    }
    const expected = await readComputedVirtualBalance(connection, nacCode);
    const stored = Number(stockRows[0].current_balance ?? 0);
    if (Math.abs(stored - expected) <= BALANCE_SYNC_EPSILON) {
        return false;
    }
    await connection.execute(
        `UPDATE stock_details SET current_balance = ? WHERE nac_code = ?`,
        [expected, nacCode]
    );
    return true;
}

/**
 * Merge duplicate stock_details rows that share the same nac_code.
 *
 * Two rows with an identical NAC code double-count in family totals because every balance
 * query keys off nac_code (both rows resolve to the same transactions). Transactions are
 * keyed by nac_code — not by stock_details.id — so collapsing the duplicates onto a single
 * survivor row never loses any issue / receive / RRP history. The survivor keeps the largest
 * opening figures found across the duplicate set (handles both true duplicates and
 * consolidation leftovers where the opening lives on one row and 0 on the others).
 */
export async function mergeDuplicateStockNacCodes(
    connection: PoolConnection
): Promise<number> {
    const [dupRows] = await connection.execute<RowDataPacket[]>(
        `SELECT nac_code, COUNT(*) AS cnt, MIN(id) AS keep_id
         FROM stock_details
         WHERE nac_code IS NOT NULL AND TRIM(nac_code) != ''
         GROUP BY nac_code
         HAVING COUNT(*) > 1`
    );
    let removed = 0;
    for (const row of dupRows) {
        const nacCode = String(row.nac_code);
        const keepId = Number(row.keep_id);
        const [aggRows] = await connection.execute<RowDataPacket[]>(
            `SELECT
                MAX(COALESCE(open_quantity, 0)) AS open_quantity,
                MAX(COALESCE(open_amount, 0)) AS open_amount,
                MAX(COALESCE(open_remaining_quantity, open_quantity, 0)) AS open_remaining_quantity
             FROM stock_details
             WHERE nac_code = ?`,
            [nacCode]
        );
        const agg = aggRows[0] || {};
        await connection.execute(
            `UPDATE stock_details
             SET open_quantity = ?, open_amount = ?, open_remaining_quantity = ?
             WHERE id = ?`,
            [
                Number(agg.open_quantity || 0),
                Number(agg.open_amount || 0),
                Number(agg.open_remaining_quantity || 0),
                keepId,
            ]
        );
        const [del] = await connection.execute(
            `DELETE FROM stock_details WHERE nac_code = ? AND id <> ?`,
            [nacCode, keepId]
        );
        removed += Number((del as { affectedRows?: number }).affectedRows || 0);
        if (removed) {
            logEvents(
                `Merged duplicate stock row(s) for NAC ${nacCode} (kept id=${keepId})`,
                'stockLog.log'
            );
        }
    }
    return removed;
}

export type ReconcileAllBalancesResult = {
    variantsProcessed: number;
    balanceFixes: number;
    duplicatesRemoved: number;
};

/** Rebuild FIFO/issue costs for every variant and sync current_balance to virtual balance. */
export async function reconcileAllStockBalances(
    connection: PoolConnection
): Promise<ReconcileAllBalancesResult> {
    const duplicatesRemoved = await mergeDuplicateStockNacCodes(connection);
    const variantsProcessed = await rebuildAllNacInventoryStates(connection);
    const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT nac_code FROM stock_details WHERE nac_code IS NOT NULL AND TRIM(nac_code) != '' ORDER BY nac_code ASC`
    );
    let balanceFixes = 0;
    for (const row of rows) {
        const nacCode = String(row.nac_code);
        const fixed = await syncStockCurrentBalance(connection, nacCode);
        if (fixed) {
            balanceFixes += 1;
        }
    }
    return { variantsProcessed, balanceFixes, duplicatesRemoved };
};
