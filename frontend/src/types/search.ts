export interface StockVariant {
    id: number;
    nacCode: string;
    partNumber: string;
    virtualBalance: number;
    trueBalance: number;
    openQuantity?: number;
    openAmount?: number;
    /** @deprecated Use virtualBalance */
    currentBalance?: number;
    averageCostPerUnit?: number;
    imageUrl?: string;
    location?: string;
    unit?: string;
}

export interface SearchResult {
    id: number;
    nacCode: string;
    itemName: string;
    partNumber: string;
    equipmentNumber: string;
    equipmentDisplay?: string | null;
    location: string;
    virtualBalance: number;
    trueBalance: number;
    /** @deprecated Use virtualBalance — kept for optimistic cart updates */
    currentBalance?: string | number;
    unit: string;
    specifications: string;
    imageUrl: string;
    previousRate: string;
    averageCostPerUnit: number;
    variantCount?: number;
    variants?: StockVariant[];
}
export interface ReceiveSearchResult extends SearchResult {
    requestedQuantity: number;
    remainingQuantity: number;
    requestNumber: string;
    requestDate: string;
    requestedBy: string;
    approvalStatus: string;
}
