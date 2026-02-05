import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { logEvents } from '../middlewares/logger';
const FUEL_NAC_CODES = new Set(['GT 07986', 'GT 00000']);
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
    const isFuelNac = FUEL_NAC_CODES.has(nacCode);
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
