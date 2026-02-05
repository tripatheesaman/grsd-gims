export interface TenderReceiveCartItem {
    id: string;
    nacCode: string;
    itemName: string;
    receiveQuantity: number;
    partNumber: string;
    equipmentNumber: string;
    location: string;
    cardNumber: string;
    image: File | undefined;
    unit: string;
    isNewItem?: boolean;
}
export interface TenderReceiveData {
    receiveDate: string;
    tenderNumber: string;
    receivedBy: string;
    items: {
        nacCode: string;
        partNumber: string;
        itemName: string;
        receiveQuantity: number;
        equipmentNumber: string;
        imagePath: string;
        unit: string;
        location?: string;
        cardNumber?: string;
        isNewItem?: boolean;
    }[];
}
