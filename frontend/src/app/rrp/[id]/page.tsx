'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { API } from '@/lib/api';
import { useCustomToast } from '@/components/ui/custom-toast';
import { RRPDetailsModal } from '@/components/rrp/RRPDetailsModal';
import { useNotification } from '@/context/NotificationContext';
import { useAuthContext } from '@/context/AuthContext';
import { use } from 'react';
interface RRPItem {
    id: number;
    item_name: string;
    part_number: string;
    nac_code: string;
    equipment_number: string;
    received_quantity: number;
    unit: string;
    item_price: number;
    vat_percentage: number;
    customs_charge: number;
    currency: string;
    forex_rate: number;
    freight_charge: number;
    customs_service_charge: number;
    total_amount: number;
}
interface RRPDetails {
    items: RRPItem[];
    rrpNumber: string;
    rrpDate: string;
    requestNumber: string;
    requestDate: string;
    type: 'local' | 'foreign';
    supplier: string;
    inspectionUser: string;
    invoiceNumber: string;
    invoiceDate: string;
    freightCharge: number;
    customsDate?: string;
    poNumber?: string;
    airwayBillNumber?: string;
    customsNumber?: string;
    currency?: string;
    forexRate?: number;
}
interface Config {
    supplier_list_local: string[] | string;
    supplier_list_foreign: string[] | string;
    inspection_user_details: Array<{
        name: string;
        designation: string;
        staff_id?: string | null;
        section_name?: string | null;
        email?: string | null;
    }>;
    requesting_and_receiving_authority?: Array<{
        name: string;
        designation: string;
        staff_id?: string | null;
        section_name?: string | null;
        email?: string | null;
    }>;
    vat_rate: number;
    customServiceCharge?: number;
}
export default function RRPDetailsPage({ params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const resolvedParams = use(params);
    const searchParams = useSearchParams();
    const notificationId = searchParams.get('notificationId');
    const router = useRouter();
    const { showErrorToast, showSuccessToast } = useCustomToast();
    const { markAsRead } = useNotification();
    const { user } = useAuthContext();
    const [isLoading, setIsLoading] = useState(true);
    const [rrpDetails, setRRPDetails] = useState<RRPDetails | null>(null);
    const [config, setConfig] = useState<Config | null>(null);
    useEffect(() => {
        const fetchRRPDetails = async () => {
            try {
                const response = await API.get(`/api/rrp/items/${resolvedParams.id}`);
                const data = response.data;
                if (!data.rrpDetails || !Array.isArray(data.rrpDetails) || data.rrpDetails.length === 0) {
                    throw new Error('No RRP details found');
                }
                const firstItem = data.rrpDetails[0];
                const isForeign = typeof firstItem.rrp_number === 'string' && firstItem.rrp_number.startsWith('F');
                const items: RRPItem[] = data.rrpDetails.map((item: unknown) => {
                    if (typeof item === 'object' && item !== null && 'id' in item) {
                        const typedItem = item as Record<string, unknown>;
                        return {
                            id: Number(typedItem.id),
                            item_name: String(typedItem.item_name),
                            part_number: String(typedItem.part_number),
                            nac_code: String(typedItem.nac_code),
                            equipment_number: String(typedItem.equipment_number),
                            received_quantity: Number(typedItem.received_quantity),
                            unit: String(typedItem.unit),
                            item_price: Number(typedItem.item_price),
                            vat_percentage: Number(typedItem.vat_percentage),
                            customs_charge: Number(typedItem.customs_charge),
                            currency: String(typedItem.currency),
                            forex_rate: Number(typedItem.forex_rate),
                            freight_charge: parseFloat(String(typedItem.freight_charge)) || 0,
                            customs_service_charge: parseFloat(String(typedItem.customs_service_charge)) || 0,
                            total_amount: parseFloat(String(typedItem.total_amount)) || 0,
                        };
                    }
                    throw new Error('Invalid item structure');
                });
                const inspectionDetails = firstItem.inspection_details;
                let inspectionUser = '';
                if (inspectionDetails && typeof inspectionDetails === 'object') {
                    if (inspectionDetails.names && inspectionDetails.designations) {
                        const names = Array.isArray(inspectionDetails.names)
                            ? inspectionDetails.names.join(' / ')
                            : inspectionDetails.names;
                        const designations = Array.isArray(inspectionDetails.designations)
                            ? inspectionDetails.designations.join(' / ')
                            : inspectionDetails.designations;
                        inspectionUser = `${names},${designations}`;
                    }
                    else if (inspectionDetails.inspection_user) {
                        inspectionUser = inspectionDetails.inspection_user;
                    }
                }
                const transformedData: RRPDetails = {
                    items,
                    rrpNumber: String(firstItem.rrp_number),
                    rrpDate: String(firstItem.date),
                    requestNumber: String(firstItem.request_number || ''),
                    requestDate: String(firstItem.request_date || ''),
                    type: isForeign ? 'foreign' : 'local',
                    supplier: String(firstItem.supplier_name),
                    inspectionUser,
                    invoiceNumber: String(firstItem.invoice_number),
                    invoiceDate: String(firstItem.invoice_date),
                    freightCharge: parseFloat(String(firstItem.freight_charge)) || 0,
                    customsDate: isForeign ? String(firstItem.customs_date) : undefined,
                    poNumber: isForeign ? (firstItem.po_number ? String(firstItem.po_number) : undefined) : undefined,
                    airwayBillNumber: isForeign ? (firstItem.airway_bill_number ? String(firstItem.airway_bill_number) : undefined) : undefined,
                    customsNumber: isForeign ? (firstItem.customs_number ? String(firstItem.customs_number) : undefined) : undefined,
                    currency: isForeign ? String(firstItem.currency) : undefined,
                    forexRate: isForeign ? parseFloat(String(firstItem.forex_rate)) : undefined
                };
                setRRPDetails(transformedData);
                setConfig(data.config);
                setIsLoading(false);
            }
            catch {
                showErrorToast({
                    title: 'Error',
                    message: "Failed to fetch RRP details",
                    duration: 3000,
                });
                setIsLoading(false);
            }
        };
        fetchRRPDetails();
    }, [resolvedParams.id, showErrorToast]);
    const handleDeleteItem = async (itemId: number) => {
        if (!rrpDetails)
            return;
        const updatedItems = rrpDetails.items.filter(item => item.id !== itemId);
        setRRPDetails({
            ...rrpDetails,
            items: updatedItems
        });
    };
    const handleEdit = async (data: RRPDetails) => {
        try {
            const transformedData = {
                rrp_number: data.rrpNumber,
                supplier_name: data.supplier,
                date: data.rrpDate,
                currency: data.currency || 'NPR',
                forex_rate: data.forexRate || 1.0,
                invoice_number: data.invoiceNumber,
                invoice_date: data.invoiceDate,
                customs_date: data.customsDate,
                customs_number: data.customsNumber,
                po_number: data.poNumber,
                airway_bill_number: data.airwayBillNumber,
                inspection_user: data.inspectionUser,
                created_by: user?.UserInfo?.username || '',
                approval_status: 'PENDING',
                items: data.items.map((item) => ({
                    id: item.id,
                    item_price: parseFloat(item.item_price?.toString() || '0'),
                    customs_charge: parseFloat(item.customs_charge?.toString() || '0'),
                    customs_service_charge: parseFloat(item.customs_service_charge?.toString() || '0'),
                    vat_percentage: parseFloat(item.vat_percentage?.toString() || '0'),
                    freight_charge: parseFloat(item.freight_charge?.toString() || '0'),
                    total_amount: parseFloat(item.total_amount?.toString() || '0'),
                    approval_status: 'PENDING'
                }))
            };
            const response = await API.put(`/api/rrp/update/${data.rrpNumber}`, transformedData);
            if (response.status === 200 && response.data) {
                if (notificationId) {
                    await markAsRead(Number(notificationId));
                    await API.delete(`/api/notifications/delete/${notificationId}`);
                    const newUrl = window.location.pathname;
                    window.history.replaceState({}, '', newUrl);
                }
                showSuccessToast({
                    title: 'Success',
                    message: "RRP updated successfully",
                    duration: 3000,
                });
                router.push('/dashboard');
            }
            else {
                throw new Error('Failed to update RRP');
            }
        }
        catch {
            showErrorToast({
                title: 'Error',
                message: "Failed to update RRP",
                duration: 3000,
            });
        }
    };
    if (isLoading) {
        return (<div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>);
    }
    if (!rrpDetails || !config) {
        return (<div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">RRP not found</p>
      </div>);
    }
    return (<div className="container mx-auto py-6">
      <RRPDetailsModal isOpen={true} onClose={() => router.push('/dashboard')} rrpData={rrpDetails} onEdit={handleEdit} onDeleteItem={handleDeleteItem} config={config} isEditOnly={true}/>
    </div>);
}
