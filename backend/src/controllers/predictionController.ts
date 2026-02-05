import { Request, Response } from 'express';
import { getPredictionMetrics, getPredictionMetricsBatch, listPredictionMetrics, refreshPredictionMetrics, PredictionMetrics } from '../services/predictionService';
import { logEvents } from '../middlewares/logger';
const toNumber = (value: unknown, fallback = 0): number => {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return fallback;
};
const formatPredictionPayload = (metrics: PredictionMetrics) => {
    const averageDays = toNumber(metrics.averageDays);
    const weightedAverageDays = toNumber(metrics.weightedAverageDays, averageDays);
    const medianDays = toNumber(metrics.medianDays, averageDays);
    const percentile10 = metrics.percentile10Days !== null ? toNumber(metrics.percentile10Days, weightedAverageDays) : null;
    const percentile90 = metrics.percentile90Days !== null ? toNumber(metrics.percentile90Days, weightedAverageDays) : null;
    const standardDeviation = metrics.standardDeviationDays !== null ? toNumber(metrics.standardDeviationDays, 0) : null;
    const predictedDays = Math.round(weightedAverageDays);
    const rangeLowerDays = percentile10 ?? weightedAverageDays;
    const rangeUpperDays = percentile90 ?? weightedAverageDays;
    return {
        nacCode: metrics.nacCode,
        sampleSize: metrics.sampleSize,
        predictedDays,
        rangeLowerDays,
        rangeUpperDays,
        stats: {
            averageDays,
            weightedAverageDays,
            medianDays,
            percentile10Days: percentile10,
            percentile90Days: percentile90,
            standardDeviationDays: standardDeviation,
            confidenceLevel: metrics.confidenceLevel,
            latestRequestDate: metrics.latestRequestDate,
            latestReceiveDate: metrics.latestReceiveDate,
            calculatedAt: metrics.calculatedAt
        }
    };
};
export const getPredictionByNacCode = async (req: Request, res: Response): Promise<void> => {
    try {
        const { nacCode } = req.params;
        if (!nacCode) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'NAC code is required'
            });
            return;
        }
        const metrics = await getPredictionMetrics(nacCode);
        if (!metrics) {
            res.status(404).json({
                error: 'Not Found',
                message: `No prediction metrics found for NAC code: ${nacCode}`
            });
            return;
        }
        res.status(200).json(formatPredictionPayload(metrics));
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching prediction metrics: ${errorMessage}`, 'predictionLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'An error occurred while fetching prediction metrics'
        });
    }
};
export const getPredictionsBatch = async (req: Request, res: Response): Promise<void> => {
    try {
        const nacCodesInput: unknown[] = Array.isArray(req.body?.nacCodes) ? req.body.nacCodes : [];
        const sanitizedCodes = nacCodesInput
            .map((code): string => (typeof code === 'string' ? code.trim() : ''))
            .filter((code): code is string => code.length > 0);
        if (!sanitizedCodes.length) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'nacCodes array is required'
            });
            return;
        }
        const uniqueCodes = Array.from(new Set<string>(sanitizedCodes)).slice(0, 200);
        const metricsList = await getPredictionMetricsBatch(uniqueCodes);
        const payload = metricsList.map(formatPredictionPayload);
        res.status(200).json(payload);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching batch prediction metrics: ${errorMessage}`, 'predictionLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'An error occurred while fetching prediction metrics'
        });
    }
};
const parseInteger = (value: unknown, fallback: number, { min, max }: {
    min?: number;
    max?: number;
} = {}): number => {
    const parsed = typeof value === 'string' ? parseInt(value, 10) : typeof value === 'number' ? Math.trunc(value) : NaN;
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    let next = parsed;
    if (typeof min === 'number' && next < min) {
        next = min;
    }
    if (typeof max === 'number' && next > max) {
        next = max;
    }
    return next;
};
export const listPredictions = async (req: Request, res: Response): Promise<void> => {
    try {
        const page = parseInteger(req.query.page, 1, { min: 1 });
        const pageSize = parseInteger(req.query.pageSize, 20, { min: 1, max: 200 });
        const search = req.query.search ? String(req.query.search) : undefined;
        const result = await listPredictionMetrics({ page, pageSize, search });
        res.status(200).json({
            data: result.data.map(formatPredictionPayload),
            pagination: result.pagination
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error listing prediction metrics: ${errorMessage}`, 'predictionLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'An error occurred while listing prediction metrics'
        });
    }
};
export const refreshPredictions = async (req: Request, res: Response): Promise<void> => {
    try {
        const { nacCode } = req.body ?? {};
        await refreshPredictionMetrics({ nacCode: nacCode ? String(nacCode) : undefined });
        res.status(200).json({
            message: nacCode
                ? `Prediction metrics refreshed for NAC code ${nacCode}`
                : 'Prediction metrics refreshed for all NAC codes'
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error refreshing prediction metrics: ${errorMessage}`, 'predictionLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'An error occurred while refreshing prediction metrics'
        });
    }
};
