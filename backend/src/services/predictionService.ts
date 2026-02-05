import { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const RECENT_WINDOW = 30;
type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';
interface LeadTimeRow extends RowDataPacket {
    nac_code: string;
    request_date: string | Date;
    first_receive_date: string | Date;
}
export interface PredictionMetrics {
    nacCode: string;
    sampleSize: number;
    averageDays: number;
    weightedAverageDays: number;
    medianDays: number;
    percentile10Days: number | null;
    percentile90Days: number | null;
    standardDeviationDays: number | null;
    confidenceLevel: ConfidenceLevel;
    latestRequestDate: string | null;
    latestReceiveDate: string | null;
    calculatedAt: string | null;
}
interface ComputedMetrics {
    sampleSize: number;
    averageDays: number;
    weightedAverageDays: number;
    medianDays: number;
    percentile10Days: number | null;
    percentile90Days: number | null;
    standardDeviationDays: number | null;
    confidenceLevel: ConfidenceLevel;
    latestRequestDate: Date | null;
    latestReceiveDate: Date | null;
}
interface RefreshOptions {
    nacCode?: string;
    connection?: PoolConnection;
}
interface ListParams {
    page?: number;
    pageSize?: number;
    search?: string;
}
const computeDifferenceInDays = (receive: Date, request: Date): number => {
    const diff = (receive.getTime() - request.getTime()) / MS_PER_DAY;
    if (Number.isNaN(diff)) {
        return 0;
    }
    return Number.isFinite(diff) ? Math.max(0, diff) : 0;
};
const computeQuantile = (values: number[], percentile: number): number | null => {
    if (!values.length)
        return null;
    if (values.length === 1)
        return values[0];
    const sorted = [...values].sort((a, b) => a - b);
    const position = (sorted.length - 1) * percentile;
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.ceil(position);
    if (lowerIndex === upperIndex) {
        return sorted[lowerIndex];
    }
    const weight = position - lowerIndex;
    return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight;
};
const computeConfidenceLevel = (sampleSize: number): ConfidenceLevel => {
    if (sampleSize >= 20)
        return 'HIGH';
    if (sampleSize >= 10)
        return 'MEDIUM';
    return 'LOW';
};
const computeMetrics = (leadTimes: {
    leadDays: number;
    requestDate: Date;
    receiveDate: Date;
}[]): ComputedMetrics => {
    if (!leadTimes.length) {
        return {
            sampleSize: 0,
            averageDays: 0,
            weightedAverageDays: 0,
            medianDays: 0,
            percentile10Days: null,
            percentile90Days: null,
            standardDeviationDays: null,
            confidenceLevel: 'LOW',
            latestRequestDate: null,
            latestReceiveDate: null
        };
    }
    const leadValues = leadTimes.map(item => item.leadDays);
    const sampleSize = leadValues.length;
    const sum = leadValues.reduce((acc, value) => acc + value, 0);
    const averageDays = sum / sampleSize;
    const sortedByDate = [...leadTimes].sort((a, b) => a.receiveDate.getTime() - b.receiveDate.getTime());
    const recentWindow = sortedByDate.slice(-RECENT_WINDOW);
    const weights = recentWindow.map((_, index) => index + 1);
    const weightedSum = recentWindow.reduce((acc, item, index) => acc + item.leadDays * weights[index], 0);
    const totalWeights = weights.reduce((acc, value) => acc + value, 0);
    const weightedAverageDays = totalWeights ? weightedSum / totalWeights : averageDays;
    const sortedValues = [...leadValues].sort((a, b) => a - b);
    const midIndex = Math.floor(sortedValues.length / 2);
    const medianDays = sortedValues.length % 2 === 0
        ? (sortedValues[midIndex - 1] + sortedValues[midIndex]) / 2
        : sortedValues[midIndex];
    const percentile10Days = computeQuantile(sortedValues, 0.1);
    const percentile90Days = computeQuantile(sortedValues, 0.9);
    const variance = leadValues.reduce((acc, value) => acc + Math.pow(value - averageDays, 2), 0) /
        sampleSize;
    const standardDeviationDays = Math.sqrt(variance);
    const latestRequestDate = sortedByDate[sortedByDate.length - 1]?.requestDate ?? null;
    const latestReceiveDate = sortedByDate[sortedByDate.length - 1]?.receiveDate ?? null;
    return {
        sampleSize,
        averageDays,
        weightedAverageDays,
        medianDays,
        percentile10Days,
        percentile90Days,
        standardDeviationDays: Number.isFinite(standardDeviationDays) ? standardDeviationDays : null,
        confidenceLevel: computeConfidenceLevel(sampleSize),
        latestRequestDate,
        latestReceiveDate
    };
};
const fetchLeadTimes = async (connection: PoolConnection | Pool, nacCode?: string): Promise<Map<string, {
    leadDays: number;
    requestDate: Date;
    receiveDate: Date;
}[]>> => {
    const params: (string | number)[] = [];
    let query = `
    SELECT 
      req.nac_code,
      req.request_date,
      MIN(rd.receive_date) AS first_receive_date
    FROM request_details req
    INNER JOIN receive_details rd 
      ON rd.request_fk = req.id
      AND rd.approval_status = 'APPROVED'
      AND rd.receive_date IS NOT NULL
    WHERE req.request_date IS NOT NULL
  `;
    if (nacCode) {
        query += ' AND req.nac_code COLLATE utf8mb4_unicode_ci = ?';
        params.push(nacCode);
    }
    query += `
    GROUP BY req.id, req.nac_code, req.request_date
    HAVING first_receive_date IS NOT NULL
  `;
    const [rows] = await connection.execute<LeadTimeRow[]>(query, params);
    const map = new Map<string, {
        leadDays: number;
        requestDate: Date;
        receiveDate: Date;
    }[]>();
    for (const row of rows) {
        if (!row.nac_code)
            continue;
        const requestDate = new Date(row.request_date);
        const receiveDate = new Date(row.first_receive_date);
        if (Number.isNaN(requestDate.getTime()) || Number.isNaN(receiveDate.getTime())) {
            continue;
        }
        const leadDays = computeDifferenceInDays(receiveDate, requestDate);
        if (!map.has(row.nac_code)) {
            map.set(row.nac_code, []);
        }
        map.get(row.nac_code)!.push({
            leadDays,
            requestDate,
            receiveDate
        });
    }
    return map;
};
const persistMetrics = async (connection: PoolConnection | Pool, nacCode: string, metrics: ComputedMetrics): Promise<void> => {
    await connection.execute(`
    INSERT INTO prediction_metrics (
      nac_code,
      sample_size,
      average_days,
      weighted_average_days,
      median_days,
      percentile_10_days,
      percentile_90_days,
      standard_deviation_days,
      confidence_level,
      latest_request_date,
      latest_receive_date,
      calculated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    ON DUPLICATE KEY UPDATE
      sample_size = VALUES(sample_size),
      average_days = VALUES(average_days),
      weighted_average_days = VALUES(weighted_average_days),
      median_days = VALUES(median_days),
      percentile_10_days = VALUES(percentile_10_days),
      percentile_90_days = VALUES(percentile_90_days),
      standard_deviation_days = VALUES(standard_deviation_days),
      confidence_level = VALUES(confidence_level),
      latest_request_date = VALUES(latest_request_date),
      latest_receive_date = VALUES(latest_receive_date),
      calculated_at = NOW()
  `, [
        nacCode,
        metrics.sampleSize,
        metrics.averageDays,
        metrics.weightedAverageDays,
        metrics.medianDays,
        metrics.percentile10Days,
        metrics.percentile90Days,
        metrics.standardDeviationDays,
        metrics.confidenceLevel,
        metrics.latestRequestDate ? metrics.latestRequestDate.toISOString().slice(0, 10) : null,
        metrics.latestReceiveDate ? metrics.latestReceiveDate.toISOString().slice(0, 10) : null
    ]);
};
export const refreshPredictionMetrics = async ({ nacCode, connection }: RefreshOptions = {}): Promise<void> => {
    const db = connection ?? (await pool.getConnection());
    const releaseAfter = !connection;
    try {
        const leadTimeMap = await fetchLeadTimes(db, nacCode);
        if (nacCode) {
            if (!leadTimeMap.has(nacCode)) {
                await db.execute('DELETE FROM prediction_metrics WHERE nac_code COLLATE utf8mb4_unicode_ci = ?', [nacCode]);
                return;
            }
            const metrics = computeMetrics(leadTimeMap.get(nacCode)!);
            await persistMetrics(db, nacCode, metrics);
            logEvents(`Refreshed prediction metrics for NAC ${nacCode}`, 'predictionLog.log');
            return;
        }
        await db.execute('TRUNCATE TABLE prediction_metrics');
        for (const [code, entries] of leadTimeMap.entries()) {
            const metrics = computeMetrics(entries);
            await persistMetrics(db, code, metrics);
        }
        logEvents(`Refreshed prediction metrics for ${leadTimeMap.size} NAC codes`, 'predictionLog.log');
    }
    finally {
        if (releaseAfter) {
            db.release();
        }
    }
};
const mapRowToMetrics = (row: RowDataPacket): PredictionMetrics => ({
    nacCode: row.nac_code,
    sampleSize: row.sample_size,
    averageDays: row.average_days,
    weightedAverageDays: row.weighted_average_days,
    medianDays: row.median_days,
    percentile10Days: row.percentile_10_days,
    percentile90Days: row.percentile_90_days,
    standardDeviationDays: row.standard_deviation_days,
    confidenceLevel: row.confidence_level,
    latestRequestDate: row.latest_request_date,
    latestReceiveDate: row.latest_receive_date,
    calculatedAt: row.calculated_at
});
export const getPredictionMetrics = async (nacCode: string): Promise<PredictionMetrics | null> => {
    const [rows] = await pool.execute<RowDataPacket[]>(`
      SELECT 
        nac_code,
        sample_size,
        average_days,
        weighted_average_days,
        median_days,
        percentile_10_days,
        percentile_90_days,
        standard_deviation_days,
        confidence_level,
        latest_request_date,
        latest_receive_date,
        calculated_at
      FROM prediction_metrics
      WHERE nac_code COLLATE utf8mb4_unicode_ci = ?
    `, [nacCode]);
    if (!rows.length) {
        return null;
    }
    return mapRowToMetrics(rows[0]);
};
export const getPredictionMetricsBatch = async (nacCodes: string[]): Promise<PredictionMetrics[]> => {
    if (!nacCodes.length) {
        return [];
    }
    const placeholders = nacCodes.map(() => '?').join(', ');
    const [rows] = await pool.execute<RowDataPacket[]>(`
      SELECT 
        nac_code,
        sample_size,
        average_days,
        weighted_average_days,
        median_days,
        percentile_10_days,
        percentile_90_days,
        standard_deviation_days,
        confidence_level,
        latest_request_date,
        latest_receive_date,
        calculated_at
      FROM prediction_metrics
      WHERE nac_code COLLATE utf8mb4_unicode_ci IN (${placeholders})
    `, nacCodes);
    return rows.map(mapRowToMetrics);
};
export const listPredictionMetrics = async ({ page = 1, pageSize = 20, search }: ListParams): Promise<{
    data: PredictionMetrics[];
    pagination: {
        page: number;
        pageSize: number;
        total: number;
    };
}> => {
    const safePage = typeof page === 'number' && Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const safePageSize = typeof pageSize === 'number' && Number.isFinite(pageSize) && pageSize > 0
        ? Math.min(Math.floor(pageSize), 200)
        : 20;
    const offset = (safePage - 1) * safePageSize;
    const params: (string | number)[] = [];
    let baseQuery = `
    FROM prediction_metrics
  `;
    if (search) {
        baseQuery += ' WHERE nac_code COLLATE utf8mb4_unicode_ci LIKE ?';
        params.push(`%${search}%`);
    }
    const countParams = [...params];
    try {
        const [countRows] = await pool.execute<RowDataPacket[]>(`SELECT COUNT(*) as total ${baseQuery}`, countParams);
        const total = countRows[0]?.total ? Number(countRows[0].total) : 0;
        const [rows] = await pool.execute<RowDataPacket[]>(`
        SELECT 
          nac_code,
          sample_size,
          average_days,
          weighted_average_days,
          median_days,
          percentile_10_days,
          percentile_90_days,
          standard_deviation_days,
          confidence_level,
          latest_request_date,
          latest_receive_date,
          calculated_at
        ${baseQuery}
        ORDER BY calculated_at DESC
        LIMIT ${safePageSize} OFFSET ${offset}
      `, params);
        const data: PredictionMetrics[] = rows.map(row => ({
            nacCode: row.nac_code,
            sampleSize: row.sample_size,
            averageDays: row.average_days,
            weightedAverageDays: row.weighted_average_days,
            medianDays: row.median_days,
            percentile10Days: row.percentile_10_days,
            percentile90Days: row.percentile_90_days,
            standardDeviationDays: row.standard_deviation_days,
            confidenceLevel: row.confidence_level,
            latestRequestDate: row.latest_request_date,
            latestReceiveDate: row.latest_receive_date,
            calculatedAt: row.calculated_at
        }));
        return {
            data,
            pagination: {
                page: safePage,
                pageSize: safePageSize,
                total
            }
        };
    }
    catch (error) {
        const safeErrorMessage = error instanceof Error ? error.message : String(error);
        logEvents(`listPredictionMetrics failed page=${safePage} pageSize=${safePageSize} search=${search ?? ''} params=${JSON.stringify(params)} error=${safeErrorMessage}`, 'predictionLog.log');
        throw error;
    }
};
export const deletePredictionMetrics = async (nacCode: string): Promise<void> => {
    await pool.execute('DELETE FROM prediction_metrics WHERE nac_code COLLATE utf8mb4_unicode_ci = ?', [nacCode]);
};
