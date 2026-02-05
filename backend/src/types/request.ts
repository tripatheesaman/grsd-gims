export interface RequestItem {
    nacCode: string;
    partNumber: string;
    itemName: string;
    requestQuantity: number;
    equipmentNumber: string;
    specifications: string;
    imagePath: string;
    unit?: string;
    requestedById?: number | null;
    requestedByEmail?: string | null;
}
export interface CreateRequestDTO {
    requestDate: string;
    requestNumber: string;
    remarks: string;
    requestedBy: string;
    items: RequestItem[];
}
export interface RequestDetail {
    request_number: string;
    request_date: Date;
    part_number: string;
    item_name: string;
    unit: string;
    requested_quantity: number;
    current_balance: number | string;
    previous_rate: number | string;
    equipment_number: string;
    image_path: string;
    specifications: string;
    remarks: string;
    requested_by: string;
    requested_by_id?: number | null;
    requested_by_email?: string | null;
    approval_status: string;
    nac_code: string;
}
