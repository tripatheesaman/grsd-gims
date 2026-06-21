export interface IssueItem {
    id: string;
    nacCode: string;
    itemName: string;
    quantity: number;
    equipmentNumber: string;
    currentBalance: number;
    partNumber: string;
}
export interface IssueCartItem extends IssueItem {
    selectedEquipment: string;
    issueQuantity: number;
    virtualBalance?: number;
    trueBalance?: number;
    /** Part number hint from search — pre-select matching variant */
    preferredPartNumber?: string;
}
export interface IssueRequest {
    issueDate: string;
    items: {
        nacCode: string;
        quantity: number;
        equipmentNumber: string;
        partNumber: string;
    }[];
    issuedBy: {
        name: string;
        staffId: string;
    };
}
export interface EquipmentSuggestion {
    value: string;
    label: string;
}
