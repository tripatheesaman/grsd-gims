export interface SearchResult {
    id: number;
    nacCode: string;
    itemName: string;
    partNumber: string;
    equipmentNumber: string;
    location: string;
    cardNumber: string;
    currentBalance: string;
    unit: string;
    specifications: string;
    imageUrl: string;
    previousRate: string;
    trueBalance: number;
    averageCostPerUnit: number;
}
export interface ReceiveSearchResult extends SearchResult {
    requestedQuantity: number;
    requestNumber: string;
    requestDate: string;
    requestedBy: string;
    approvalStatus: string;
}
