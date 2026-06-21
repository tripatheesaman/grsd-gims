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
    hasEnoughHistory: boolean;
    validTripCount: number;
    warningMessage: string | null;
}

export interface FuelConsumptionPreviewLine extends FuelConsumptionAnalysis {
    index: number;
}
