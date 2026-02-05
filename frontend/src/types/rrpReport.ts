export interface ReceiveRRPReportItem {
    receive_id: number;
    receive_date: string;
    nac_code: string | null;
    part_number: string | null;
    item_name: string | null;
    received_quantity: number;
    unit: string | null;
    received_by: string | null;
    approval_status: string;
    location: string | null;
    card_number: string | null;
    request_fk: number;
    rrp_fk: number | null;
    request_number: string | null;
    request_date: string | null;
    requested_by: string | null;
    equipment_number: string | null;
    rrp_id: number | null;
    rrp_number: string | null;
    supplier_name: string | null;
    rrp_date: string | null;
    currency: string | null;
    forex_rate: number | null;
    item_price: number | null;
    customs_charge: number | null;
    customs_service_charge: number | null;
    vat_percentage: number | null;
    invoice_number: string | null;
    invoice_date: string | null;
    po_number: string | null;
    airway_bill_number: string | null;
    inspection_details: string | null;
    total_amount: number | null;
    freight_charge: number | null;
    customs_date: string | null;
    customs_number: string | null;
    reference_doc: string | null;
    rrp_approval_status: string | null;
    rrp_created_by: string | null;
}
export interface ReceiveRRPReportResponse {
    data: ReceiveRRPReportItem[];
    pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
}
