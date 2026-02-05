export interface ReceiveCartItem {
    id: string;
    nacCode: string;
    itemName: string;
    receiveQuantity: number;
    partNumber: string;
    equipmentNumber: string;
    location: string;
    cardNumber: string;
    image: File | undefined;
    imagePath?: string;
    unit: string;
    requestedUnit?: string;
    conversionBase?: number;
    requestedQuantity: number;
    isLocationChanged: boolean;
    isCardNumberChanged: boolean;
}
export interface ReceiveData {
    receiveDate: string;
    remarks: string;
    receivedBy: string;
    items: {
        nacCode: string;
        partNumber: string;
        itemName: string;
        receiveQuantity: number;
        equipmentNumber: string;
        imagePath: string;
        unit: string;
        requestId: number;
        location?: string;
        cardNumber?: string;
    }[];
}
