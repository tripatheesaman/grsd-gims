export interface BorrowReceiveCartItem {
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
export interface BorrowReceiveData {
    receiveDate: string;
    borrowSourceId: number;
    borrowReferenceNumber?: string;
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
export interface BorrowSource {
    id: number;
    source_name: string;
    source_code: string | null;
    contact_person: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    address: string | null;
    is_active: number;
    created_at: string;
    updated_at: string;
    created_by: string | null;
}
