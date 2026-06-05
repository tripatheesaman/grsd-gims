export interface ItemDetails {
    id: number;
    nacCode: string;
    itemName: string;
    partNumber: string;
    equipmentNumber: string;
    equipmentDisplay?: string | null;
    currentBalance: number;
    location: string;
    unit: string;
    openQuantity: string;
    openAmount: number;
    imageUrl: string;
    altText: string;
    trueBalance: number;
    averageCostPerUnit: number;
}
