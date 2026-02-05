export interface RRPSearchResult {
    rrpNumber: string;
    rrpDate: string;
    supplierName: string;
    type: 'local' | 'foreign';
    currency: string;
    forexRate: string;
    invoiceNumber: string;
    invoiceDate: string;
    poNumber: string | null;
    airwayBillNumber: string | null;
    customsNumber: string | null;
    inspectionDetails: {
        inspection_user: string;
        inspection_details: Record<string, unknown>;
    };
    approvalStatus: string;
    createdBy: string;
    customsDate: string | null;
    referenceDoc?: string | null;
    items: Array<{
        id: number;
        itemName: string;
        partNumber: string;
        equipmentNumber: string;
        receivedQuantity: string;
        unit: string;
        itemPrice: string;
        customsCharge: string;
        customsServiceCharge: string;
        vatPercentage: string;
        freightCharge: string;
        totalAmount: string;
    }>;
}
export interface RRPSearchParams {
    universal: string;
    equipmentNumber: string;
    partNumber: string;
}
