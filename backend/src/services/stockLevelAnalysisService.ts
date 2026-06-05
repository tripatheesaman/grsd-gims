import { RowDataPacket } from 'mysql2/promise';
import pool from '../config/db';
import { refreshPredictionMetrics, getPredictionMetricsBatch } from './predictionService';
import {
    ensureHistoricalIssueTable,
    getHistoricalIssuePeriodAggs,
    getHistoricalIssueQtyLists
} from './historicalIssueService';
import {
    ensureHistoricalReceiveTable,
    getHistoricalReceiveGapDays,
    getHistoricalReceivePeriodAggs,
    getHistoricalReceiveQtyLists
} from './historicalReceiveService';

const FUEL_NAC_CODES = new Set(['GT 07986', 'GT 00000']);
const ANALYSIS_DAYS = 365;
const RECENT_DAYS = 90;
const Z_SCORE_95 = 1.65;
const DEFAULT_LEAD_TIME_DAYS = 30;

export interface StockLevelAnalysisRow {
    nacCode: string;
    itemCategory: 'Fuel' | 'Spare';
    fuelType: string;
    itemName: string;
    partNumbers: string;
    applicableEquipments: string;
    unit: string;
    location: string;
    currentBalance: number;
    minimumLevel: number;
    maximumLevel: number;
    reorderLevel: number;
    averageDailyUsage: number;
    weightedDailyUsage: number;
    leadTimeDays: number;
    safetyStock: number;
    demandDuringLeadTime: number;
    totalIssued365d: number;
    issueCount365d: number;
    totalReceived365d: number;
    receiveCount365d: number;
    avgReceiveQuantity: number;
    medianReceiveQuantity: number;
    avgRequestQuantity: number;
    requestCount365d: number;
    historicalIssuedTotal: number;
    historicalIssueCount: number;
    historicalReceivedTotal: number;
    historicalReceiveCount: number;
    daysOfStockRemaining: number | null;
    stockStatus: string;
    confidenceLevel: string;
    analysisNotes: string;
}

interface StockRow extends RowDataPacket {
    nac_code: string;
    item_name: string;
    part_numbers: string;
    applicable_equipments: string;
    unit: string;
    location: string;
    current_balance: number;
}

interface AggRow extends RowDataPacket {
    nac_code: string;
    total_qty: number;
    txn_count: number;
    avg_qty: number;
}

interface ReceiveQtyRow extends RowDataPacket {
    nac_code: string;
    received_quantity: number;
}

const roundUp = (value: number, minValue = 0): number => {
    if (!Number.isFinite(value) || value <= 0) {
        return minValue;
    }
    return Math.max(minValue, Math.ceil(value));
};

const median = (values: number[]): number => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
};

const stdDev = (values: number[]): number => {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
};

const buildAggMap = (rows: AggRow[]): Map<string, AggRow> => {
    const map = new Map<string, AggRow>();
    for (const row of rows) {
        map.set(row.nac_code, row);
    }
    return map;
};

const normalizeNacCode = (nacCode: string | null | undefined): string =>
    (nacCode ?? '').trim();

const getItemCategory = (nacCode: string | null | undefined): 'Fuel' | 'Spare' => {
    const code = normalizeNacCode(nacCode);
    return FUEL_NAC_CODES.has(code) ? 'Fuel' : 'Spare';
};

const getFuelTypeLabel = (nacCode: string | null | undefined): string => {
    const code = normalizeNacCode(nacCode);
    if (code === 'GT 07986') return 'Diesel';
    if (code === 'GT 00000') return 'Petrol';
    return '';
};

const buildReceiveQtyMap = (rows: ReceiveQtyRow[]): Map<string, number[]> => {
    const map = new Map<string, number[]>();
    for (const row of rows) {
        const qty = Number(row.received_quantity) || 0;
        if (qty <= 0) continue;
        if (!map.has(row.nac_code)) {
            map.set(row.nac_code, []);
        }
        map.get(row.nac_code)!.push(qty);
    }
    return map;
};

const computeMonthlyIssues = async (): Promise<Map<string, number[]>> => {
    await ensureHistoricalIssueTable();
    const [[liveRows], [histRows]] = await Promise.all([
        pool.execute<RowDataPacket[]>(`
            SELECT
                i.nac_code COLLATE utf8mb4_unicode_ci AS nac_code,
                DATE_FORMAT(i.issue_date, '%Y-%m') AS issue_month,
                SUM(i.issue_quantity) AS monthly_qty
            FROM issue_details i
            WHERE i.approval_status = 'APPROVED'
              AND i.issue_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            GROUP BY i.nac_code, DATE_FORMAT(i.issue_date, '%Y-%m')
        `, [ANALYSIS_DAYS]),
        pool.execute<RowDataPacket[]>(`
            SELECT
                h.nac_code COLLATE utf8mb4_unicode_ci AS nac_code,
                DATE_FORMAT(h.issue_date, '%Y-%m') AS issue_month,
                SUM(h.issue_quantity) AS monthly_qty
            FROM historical_issue_details h
            GROUP BY h.nac_code, DATE_FORMAT(h.issue_date, '%Y-%m')
        `)
    ]);

    const map = new Map<string, number[]>();
    const addRows = (rows: RowDataPacket[]) => {
        for (const row of rows) {
            const qty = Number(row.monthly_qty) || 0;
            if (!map.has(row.nac_code)) map.set(row.nac_code, []);
            map.get(row.nac_code)!.push(qty);
        }
    };
    addRows(liveRows);
    addRows(histRows);
    return map;
};

/** Blend consumption rates without summing entire history into one inflated ADU */
const computeDailyUsage = (
    liveIssued90: number,
    liveIssued365: number,
    histIssued: number,
    histPeriodDays: number
): number => {
    const liveADU90 = liveIssued90 / RECENT_DAYS;
    const liveADU365 = liveIssued365 / ANALYSIS_DAYS;
    const histADU = histPeriodDays > 0 ? histIssued / histPeriodDays : 0;

    let adu = 0;
    if (liveADU90 > 0 || liveADU365 > 0) {
        adu = liveADU90 * 0.7 + liveADU365 * 0.3;
        if (histADU > 0) {
            const cappedHist = Math.min(histADU, Math.max(liveADU90, liveADU365) * 1.25);
            adu = adu * 0.85 + cappedHist * 0.15;
        }
        const cap = Math.max(liveADU90, liveADU365) * 2;
        if (cap > 0) adu = Math.min(adu, cap);
    } else if (histADU > 0) {
        adu = histADU;
    }

    return adu;
};

const computeLeadTimeDays = (
    prediction: Awaited<ReturnType<typeof getPredictionMetricsBatch>>[0] | undefined,
    histReceiveGap: number,
    liveReceiveCount365: number,
    histReceiveCount: number
): { leadTimeDays: number; confidenceLevel: string } => {
    let leadTimeDays = DEFAULT_LEAD_TIME_DAYS;
    let confidenceLevel = 'LOW';

    if (prediction && prediction.sampleSize > 0) {
        leadTimeDays = prediction.weightedAverageDays > 0
            ? prediction.weightedAverageDays
            : prediction.medianDays > 0
                ? prediction.medianDays
                : DEFAULT_LEAD_TIME_DAYS;
        confidenceLevel = prediction.confidenceLevel;
    } else if (histReceiveGap > 0 && histReceiveCount >= 2) {
        leadTimeDays = histReceiveGap;
        confidenceLevel = 'MEDIUM';
    } else if (liveReceiveCount365 >= 2) {
        leadTimeDays = Math.max(14, Math.min(60, 365 / liveReceiveCount365));
        confidenceLevel = 'MEDIUM';
    }

    return {
        leadTimeDays: Math.max(7, Math.min(90, leadTimeDays)),
        confidenceLevel
    };
};

const computeReorderQuantity = (
    dailyUsage: number,
    leadTimeDays: number,
    liveReceiveQtys: number[],
    histReceiveQtys: number[],
    histIssueQtys: number[],
    liveAvgIssueQty: number
): number => {
    const allReceives = [...liveReceiveQtys, ...histReceiveQtys].filter(q => q > 0);
    if (allReceives.length > 0) {
        return roundUp(median(allReceives));
    }

    const allIssueTx = [...histIssueQtys];
    if (liveAvgIssueQty > 0) {
        for (let i = 0; i < 3; i++) allIssueTx.push(liveAvgIssueQty);
    }
    if (allIssueTx.length > 0) {
        const fromIssues = roundUp(median(allIssueTx));
        const fromDemand = dailyUsage > 0 ? roundUp(dailyUsage * leadTimeDays) : 0;
        return fromDemand > 0 ? Math.min(fromIssues, fromDemand) : fromIssues;
    }

    if (dailyUsage > 0) {
        return roundUp(dailyUsage * leadTimeDays);
    }

    return 0;
};

export const analyzeStockLevels = async (): Promise<StockLevelAnalysisRow[]> => {
    await refreshPredictionMetrics();
    await ensureHistoricalIssueTable();
    await ensureHistoricalReceiveTable();

    const [stockRows] = await pool.execute<StockRow[]>(`
        SELECT
            s.nac_code,
            s.item_name,
            s.part_numbers,
            COALESCE(s.applicable_equipments, '') AS applicable_equipments,
            COALESCE(
                (SELECT nu.unit FROM nac_units nu
                 WHERE nu.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
                   AND nu.is_default = 1
                 LIMIT 1),
                s.unit,
                ''
            ) AS unit,
            s.location,
            COALESCE(s.current_balance, 0) AS current_balance
        FROM stock_details s
        WHERE s.nac_code IS NOT NULL AND TRIM(s.nac_code) <> ''
        ORDER BY s.nac_code ASC
    `);

    const issueParams = [ANALYSIS_DAYS];
    const recentParams = [RECENT_DAYS];

    const [
        histIssuePeriodMap,
        histReceivePeriodMap,
        histReceiveQtyMap,
        histIssueQtyMap,
        histReceiveGapMap,
        monthlyIssueMap
    ] = await Promise.all([
        getHistoricalIssuePeriodAggs(),
        getHistoricalReceivePeriodAggs(),
        getHistoricalReceiveQtyLists(),
        getHistoricalIssueQtyLists(),
        getHistoricalReceiveGapDays(),
        computeMonthlyIssues()
    ]);

    const [[issue365], [issueRecent], [receive365], [request365], [receiveQtyRows]] = await Promise.all([
        pool.execute<AggRow[]>(`
            SELECT
                i.nac_code COLLATE utf8mb4_unicode_ci AS nac_code,
                COALESCE(SUM(i.issue_quantity), 0) AS total_qty,
                COUNT(*) AS txn_count,
                COALESCE(AVG(i.issue_quantity), 0) AS avg_qty
            FROM issue_details i
            WHERE i.approval_status = 'APPROVED'
              AND i.issue_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            GROUP BY i.nac_code
        `, issueParams),
        pool.execute<AggRow[]>(`
            SELECT
                i.nac_code COLLATE utf8mb4_unicode_ci AS nac_code,
                COALESCE(SUM(i.issue_quantity), 0) AS total_qty,
                COUNT(*) AS txn_count,
                COALESCE(AVG(i.issue_quantity), 0) AS avg_qty
            FROM issue_details i
            WHERE i.approval_status = 'APPROVED'
              AND i.issue_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            GROUP BY i.nac_code
        `, recentParams),
        pool.execute<AggRow[]>(`
            SELECT
                rd.nac_code,
                COALESCE(SUM(rd.received_quantity), 0) AS total_qty,
                COUNT(*) AS txn_count,
                COALESCE(AVG(rd.received_quantity), 0) AS avg_qty
            FROM receive_details rd
            WHERE rd.approval_status = 'APPROVED'
              AND rd.receive_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            GROUP BY rd.nac_code
        `, issueParams),
        pool.execute<AggRow[]>(`
            SELECT
                req.nac_code,
                COALESCE(SUM(req.requested_quantity), 0) AS total_qty,
                COUNT(*) AS txn_count,
                COALESCE(AVG(req.requested_quantity), 0) AS avg_qty
            FROM request_details req
            WHERE req.approval_status = 'APPROVED'
              AND req.request_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            GROUP BY req.nac_code
        `, issueParams),
        pool.execute<ReceiveQtyRow[]>(`
            SELECT rd.nac_code COLLATE utf8mb4_unicode_ci AS nac_code, rd.received_quantity
            FROM receive_details rd
            WHERE rd.approval_status = 'APPROVED'
              AND rd.receive_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
              AND rd.received_quantity > 0
            ORDER BY rd.receive_date DESC
        `, issueParams)
    ]);

    const issueMap = buildAggMap(issue365);
    const issueRecentMap = buildAggMap(issueRecent);
    const receiveMap = buildAggMap(receive365);
    const requestMap = buildAggMap(request365);
    const receiveQtyMap = buildReceiveQtyMap(receiveQtyRows);

    const nacCodes = stockRows.map(s => s.nac_code);
    const predictions = await getPredictionMetricsBatch(nacCodes);
    const predictionMap = new Map(predictions.map(p => [p.nacCode, p]));

    const results: StockLevelAnalysisRow[] = [];

    for (const stock of stockRows) {
        const nacCode = normalizeNacCode(stock.nac_code);
        if (!nacCode) continue;

        const currentBalance = Number(stock.current_balance) || 0;

        const issueAgg = issueMap.get(nacCode);
        const issueRecentAgg = issueRecentMap.get(nacCode);
        const histIssue = histIssuePeriodMap.get(nacCode);
        const histReceive = histReceivePeriodMap.get(nacCode);
        const receiveAgg = receiveMap.get(nacCode);
        const requestAgg = requestMap.get(nacCode);
        const prediction = predictionMap.get(nacCode);
        const liveReceiveQtys = receiveQtyMap.get(nacCode) ?? [];
        const histReceiveQtys = histReceiveQtyMap.get(nacCode) ?? [];
        const histIssueQtys = histIssueQtyMap.get(nacCode) ?? [];
        const monthlyIssues = monthlyIssueMap.get(nacCode) ?? [];

        const totalIssued365d = Number(issueAgg?.total_qty) || 0;
        const issueCount365d = Number(issueAgg?.txn_count) || 0;
        const recentIssued = Number(issueRecentAgg?.total_qty) || 0;
        const historicalIssuedTotal = Number(histIssue?.total_qty) || 0;
        const historicalIssueCount = Number(histIssue?.txn_count) || 0;
        const histPeriodDays = Number(histIssue?.period_days) || 0;
        const historicalReceivedTotal = Number(histReceive?.total_qty) || 0;
        const historicalReceiveCount = Number(histReceive?.txn_count) || 0;
        const totalReceived365d = Number(receiveAgg?.total_qty) || 0;
        const receiveCount365d = Number(receiveAgg?.txn_count) || 0;
        const avgReceiveQuantity = Number(receiveAgg?.avg_qty) || 0;
        const medianReceiveQuantity = median([...liveReceiveQtys, ...histReceiveQtys]);
        const avgRequestQuantity = Number(requestAgg?.avg_qty) || 0;
        const requestCount365d = Number(requestAgg?.txn_count) || 0;

        const weightedDailyUsage = computeDailyUsage(
            recentIssued,
            totalIssued365d,
            historicalIssuedTotal,
            histPeriodDays
        );
        const annualADU = weightedDailyUsage;
        const recentADU = recentIssued / RECENT_DAYS;

        const monthlyStdDev = stdDev(monthlyIssues);
        const dailyDemandStdDev = monthlyStdDev / Math.sqrt(30);

        const { leadTimeDays, confidenceLevel } = computeLeadTimeDays(
            prediction,
            histReceiveGapMap.get(nacCode) ?? 0,
            receiveCount365d,
            historicalReceiveCount
        );

        const demandDuringLeadTime = weightedDailyUsage * leadTimeDays;

        let safetyStock = Z_SCORE_95 * dailyDemandStdDev * Math.sqrt(leadTimeDays);
        const safetyCap = demandDuringLeadTime * 0.2;
        safetyStock = Math.min(safetyStock, safetyCap > 0 ? safetyCap : weightedDailyUsage * leadTimeDays * 0.15);
        if (issueCount365d + historicalIssueCount < 5) {
            safetyStock = Math.max(safetyStock, weightedDailyUsage * leadTimeDays * 0.1);
        }

        let minimumLevel = roundUp(demandDuringLeadTime + safetyStock);
        const medianMonthlyUse = monthlyIssues.length ? median(monthlyIssues) : 0;
        if (medianMonthlyUse > 0) {
            minimumLevel = Math.min(minimumLevel, roundUp(medianMonthlyUse * 1.25));
        }
        const maxSingleReceiveEarly = histReceiveQtys.length
            ? Math.max(...histReceiveQtys)
            : liveReceiveQtys.length
                ? Math.max(...liveReceiveQtys)
                : 0;
        if (getItemCategory(nacCode) === 'Fuel' && maxSingleReceiveEarly > 0) {
            minimumLevel = Math.min(
                minimumLevel,
                roundUp(Math.min(maxSingleReceiveEarly * 0.25, weightedDailyUsage * 21))
            );
        } else if (maxSingleReceiveEarly > 0 && historicalReceiveCount > 0) {
            minimumLevel = Math.min(
                minimumLevel,
                roundUp(Math.max(maxSingleReceiveEarly * 0.35, medianMonthlyUse * 1.1 || demandDuringLeadTime))
            );
        }
        if (weightedDailyUsage === 0 && historicalReceivedTotal === 0 && totalReceived365d === 0) {
            minimumLevel = currentBalance > 0 ? 1 : 0;
        } else if (minimumLevel === 0 && (weightedDailyUsage > 0 || currentBalance > 0)) {
            minimumLevel = 1;
        }

        const reorderLevel = computeReorderQuantity(
            weightedDailyUsage,
            leadTimeDays,
            liveReceiveQtys,
            histReceiveQtys,
            histIssueQtys,
            Number(issueAgg?.avg_qty) || 0
        );

        let maximumLevel = minimumLevel + reorderLevel;
        const maxSingleReceive = maxSingleReceiveEarly;
        if (maxSingleReceive > 0) {
            maximumLevel = Math.min(maximumLevel, roundUp(maxSingleReceive * 1.2));
        }
        if (maximumLevel < minimumLevel) {
            maximumLevel = minimumLevel + (reorderLevel || 1);
        }

        const daysOfStockRemaining = weightedDailyUsage > 0
            ? Math.round(currentBalance / weightedDailyUsage)
            : null;

        let stockStatus = 'NO_USAGE_DATA';
        if (weightedDailyUsage > 0) {
            if (currentBalance <= minimumLevel) {
                stockStatus = 'REORDER_NOW';
            } else if (currentBalance <= minimumLevel * 1.25) {
                stockStatus = 'APPROACHING_MINIMUM';
            } else if (maximumLevel > 0 && currentBalance >= maximumLevel) {
                stockStatus = 'AT_OR_ABOVE_MAXIMUM';
            } else {
                stockStatus = 'ADEQUATE';
            }
        } else if (currentBalance > 0) {
            stockStatus = 'DORMANT_STOCK';
        }

        const notes: string[] = [];
        if (issueCount365d === 0 && historicalIssueCount === 0) {
            notes.push('No issue/consumption data');
        } else if (issueCount365d === 0 && historicalIssueCount > 0) {
            notes.push('Consumption estimated from imported historical issues only');
        }
        if (historicalIssueCount > 0) {
            notes.push(`${historicalIssueCount} historical issue(s) in prior-year import`);
        }
        if (historicalReceiveCount > 0) {
            notes.push(`${historicalReceiveCount} historical receive(s) in prior-year import`);
        } else if (historicalIssueCount > 0) {
            notes.push('No historical receives — reorder qty from issue batch sizes');
        }
        if (receiveCount365d === 0 && historicalReceiveCount === 0) {
            notes.push('No receive history in live or historical data');
        }
        if (prediction?.sampleSize) {
            notes.push(`Lead time from ${prediction.sampleSize} request-receive cycle(s)`);
        } else if (histReceiveGapMap.get(nacCode)) {
            notes.push('Lead time from average gap between historical receives');
        }

        results.push({
            nacCode,
            itemCategory: getItemCategory(nacCode),
            fuelType: getFuelTypeLabel(nacCode),
            itemName: stock.item_name || '',
            partNumbers: stock.part_numbers || '',
            applicableEquipments: stock.applicable_equipments || '',
            unit: stock.unit || '',
            location: stock.location || '',
            currentBalance,
            minimumLevel,
            maximumLevel,
            reorderLevel,
            averageDailyUsage: Number(annualADU.toFixed(4)),
            weightedDailyUsage: Number(weightedDailyUsage.toFixed(4)),
            leadTimeDays: Number(leadTimeDays.toFixed(1)),
            safetyStock: Number(safetyStock.toFixed(2)),
            demandDuringLeadTime: Number(demandDuringLeadTime.toFixed(2)),
            totalIssued365d,
            issueCount365d,
            totalReceived365d,
            receiveCount365d,
            avgReceiveQuantity: Number(avgReceiveQuantity.toFixed(2)),
            medianReceiveQuantity: Number(medianReceiveQuantity.toFixed(2)),
            avgRequestQuantity: Number(avgRequestQuantity.toFixed(2)),
            requestCount365d,
            historicalIssuedTotal,
            historicalIssueCount,
            historicalReceivedTotal,
            historicalReceiveCount,
            daysOfStockRemaining,
            stockStatus,
            confidenceLevel,
            analysisNotes: notes.join('; ')
        });
    }

    return results;
};

export const generateStockLevelsExcel = async (rows: StockLevelAnalysisRow[]): Promise<Buffer> => {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GRSD-GIMS';
    workbook.created = new Date();

    const summarySheet = workbook.addWorksheet('Stock Levels Summary');
    const detailSheet = workbook.addWorksheet('Analysis Details');

    const summaryHeaders = [
        'NAC Code',
        'Category',
        'Fuel Type',
        'Item Name',
        'Part Number(s)',
        'Applicable Equipment(s)',
        'Unit',
        'Location',
        'Current Balance',
        'Minimum Level',
        'Maximum Level',
        'Reorder Quantity',
        'Stock Status',
        'Days of Stock Remaining',
        'Confidence'
    ];

    const detailHeaders = [
        ...summaryHeaders.slice(0, 12),
        'Avg Daily Usage',
        'Weighted Daily Usage',
        'Lead Time (Days)',
        'Safety Stock',
        'Demand During Lead Time',
        'Total Issued (365d)',
        'Issue Count (365d)',
        'Total Received (365d)',
        'Receive Count (365d)',
        'Avg Receive Qty',
        'Median Receive Qty',
        'Avg Request Qty',
        'Request Count (365d)',
        'Historical Issued Qty',
        'Historical Issue Count',
        'Historical Received Qty',
        'Historical Receive Count',
        'Analysis Notes'
    ];

    const styleHeader = (sheet: typeof summarySheet, headers: string[]) => {
        sheet.addRow(headers);
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF003594' }
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    };

    styleHeader(summarySheet, summaryHeaders);
    styleHeader(detailSheet, detailHeaders);

    const statusColors: Record<string, string> = {
        REORDER_NOW: 'FFFFC7CE',
        APPROACHING_MINIMUM: 'FFFFEB9C',
        AT_OR_ABOVE_MAXIMUM: 'FFBDD7EE',
        ADEQUATE: 'FFC6EFCE',
        DORMANT_STOCK: 'FFE7E6E6',
        NO_USAGE_DATA: 'FFF2F2F2'
    };

    for (const row of rows) {
        const summaryRow = summarySheet.addRow([
            row.nacCode,
            row.itemCategory,
            row.fuelType,
            row.itemName,
            row.partNumbers,
            row.applicableEquipments,
            row.unit,
            row.location,
            row.currentBalance,
            row.minimumLevel,
            row.maximumLevel,
            row.reorderLevel,
            row.stockStatus,
            row.daysOfStockRemaining ?? 'N/A',
            row.confidenceLevel
        ]);

        const fillColor = statusColors[row.stockStatus] || 'FFFFFFFF';
        summaryRow.eachCell((cell: { fill?: object }) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: fillColor }
            };
        });

        detailSheet.addRow([
            row.nacCode,
            row.itemCategory,
            row.fuelType,
            row.itemName,
            row.partNumbers,
            row.applicableEquipments,
            row.unit,
            row.location,
            row.currentBalance,
            row.minimumLevel,
            row.maximumLevel,
            row.reorderLevel,
            row.averageDailyUsage,
            row.weightedDailyUsage,
            row.leadTimeDays,
            row.safetyStock,
            row.demandDuringLeadTime,
            row.totalIssued365d,
            row.issueCount365d,
            row.totalReceived365d,
            row.receiveCount365d,
            row.avgReceiveQuantity,
            row.medianReceiveQuantity,
            row.avgRequestQuantity,
            row.requestCount365d,
            row.historicalIssuedTotal,
            row.historicalIssueCount,
            row.historicalReceivedTotal,
            row.historicalReceiveCount,
            row.analysisNotes
        ]);
    }

    const autoSize = (sheet: typeof summarySheet) => {
        sheet.columns.forEach((column: { eachCell?: Function; width?: number }) => {
            if (!column?.eachCell) return;
            let maxLength = 12;
            column.eachCell({ includeEmpty: true }, (cell: { value?: unknown }) => {
                const len = cell.value != null ? String(cell.value).length : 10;
                if (len > maxLength) maxLength = len;
            });
            column.width = Math.min(maxLength + 2, 45);
        });
    };

    autoSize(summarySheet);
    autoSize(detailSheet);

    const metaSheet = workbook.addWorksheet('Methodology');
    metaSheet.addRow(['Stock Level Analysis — Methodology']);
    metaSheet.getRow(1).font = { bold: true, size: 14 };
    const methodology = [
        '',
        'Generated from approved issue, receive, and request records plus lead-time prediction metrics.',
        '',
        'Minimum Level: Reorder point = (weighted daily usage × lead time) + safety stock.',
        '  Weighted daily usage blends 65% recent 90-day consumption and 35% 365-day average.',
        '  Lead time uses request-to-receive prediction metrics when available (p90 blended for safety).',
        '  Safety stock uses demand variability (monthly issue σ) and lead-time uncertainty at 95% service level.',
        '',
        'Reorder Quantity: Typical order size from median receive qty, avg receive, avg request, avg issue, or 1.5× lead-time demand.',
        '',
        'Maximum Level: Minimum level + reorder quantity, adjusted upward if peak monthly usage exceeds normal replenishment.',
        '',
        `Live window: last ${ANALYSIS_DAYS} days. Prior-year imports use each item's own issue/receive date span (not summed blindly).`,
        'Minimum = daily usage × lead time + capped safety stock. Reorder qty = typical receive batch, or typical issue batch if no receives.',
        'Maximum = minimum + reorder (capped near largest historical receive). Includes spares and fuels.',
        `Generated at: ${new Date().toISOString()}`
    ];
    methodology.forEach(line => metaSheet.addRow([line]));
    metaSheet.getColumn(1).width = 100;

    return workbook.xlsx.writeBuffer();
};
