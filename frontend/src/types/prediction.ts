export type PredictionConfidence = 'LOW' | 'MEDIUM' | 'HIGH';
export interface PredictionStats {
    averageDays: number;
    weightedAverageDays: number;
    medianDays: number;
    percentile10Days: number | null;
    percentile90Days: number | null;
    standardDeviationDays: number | null;
    confidenceLevel: PredictionConfidence;
    latestRequestDate: string | null;
    latestReceiveDate: string | null;
    calculatedAt: string | null;
}
export interface PredictionSummary {
    nacCode: string;
    sampleSize: number;
    predictedDays: number;
    rangeLowerDays: number | null;
    rangeUpperDays: number | null;
    stats: PredictionStats;
}
export interface PredictionListItem extends PredictionSummary {
    stats: PredictionStats;
}
