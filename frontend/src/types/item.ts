import type { StockVariant } from '@/types/search';

export interface ItemDetails {
    id: number;
    nacCode: string;
    itemName: string;
    partNumber: string;
    equipmentNumber: string;
    equipmentDisplay?: string | null;
    location: string;
    unit: string;
    openQuantity: string;
    openAmount: number;
    imageUrl: string;
    altText: string;
    virtualBalance: number;
    trueBalance: number;
    averageCostPerUnit: number;
    totalVirtualBalance?: number;
    totalTrueBalance?: number;
    selectedVariantId?: number;
    variants?: StockVariant[];
}
