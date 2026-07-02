export type ConsumptionDeviationDirection = 'above' | 'below' | null;

export interface FuelConsumptionAnalysis {
    equipment: string;
    nacCode: string;
    previousKilometers: number;
    currentKilometers: number;
    quantityLiters: number;
    kmDelta: number;
    avgKmPerLiter: number;
    avgLitersPerKm: number;
    expectedKmForQuantity: number;
    exceedsAverage: boolean;
    belowAverage: boolean;
    deviatesFromAverage: boolean;
    deviationDirection: ConsumptionDeviationDirection;
    hasEnoughHistory: boolean;
    validTripCount: number;
    warningMessage: string | null;
}

export interface FuelConsumptionPreviewLine extends FuelConsumptionAnalysis {
    index: number;
}
