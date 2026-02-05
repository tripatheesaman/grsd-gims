export interface RequestCartItem {
    id: string;
    nacCode: string;
    itemName: string;
    requestQuantity: number;
    partNumber: string;
    equipmentNumber: string;
    specifications: string;
    image?: File;
    unit: string;
    requestedById?: number | null;
    requestedByEmail?: string | null;
}
export interface RequestData {
    requestDate: string;
    requestNumber: string;
    items: {
        nacCode: string;
        partNumber: string;
        itemName: string;
        requestQuantity: number;
        equipmentNumber: string;
        specifications: string;
    }[];
    remarks: string;
    requestedBy: string;
}
export interface RequestItem {
    id: number;
    partNumber: string;
    itemName: string;
    equipmentNumber: string;
    requestedQuantity: number;
    nacCode: string;
}
export interface RequestSearchResult {
    requestNumber: string;
    requestDate: string;
    requestedBy: string;
    approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
    items: RequestItem[];
    referenceDoc?: string | null;
}
export interface RequestSearchParams {
    universal: string;
    equipmentNumber: string;
    partNumber: string;
}
