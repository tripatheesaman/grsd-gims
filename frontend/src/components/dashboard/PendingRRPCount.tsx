'use client';
import React from 'react';
import { useEffect, useState, useCallback } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { API } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { FileText, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription, ModalTrigger, } from '@/components/ui/modal';
import { useCustomToast } from '@/components/ui/custom-toast';
import { RRPDetailsModal } from '@/components/rrp/RRPDetailsModal';
import {
    CapitalRRPDetailsModal,
    type CapitalRRPApprovalData,
    type CapitalRRPConfig,
    type CapitalEditItem,
} from '@/components/rrp/CapitalRRPDetailsModal';
import { useNotification } from '@/context/NotificationContext';
interface PendingRRP {
    id: number;
    rrp_number: string;
    supplier_name: string;
    date: string;
    currency: string;
    forex_rate: string;
    item_price: string;
    customs_charge: string;
    customs_service_charge: string;
    vat_percentage: string;
    invoice_number: string;
    invoice_date: string;
    po_number: string | null;
    airway_bill_number: string | null;
    customs_number: string | null;
    inspection_details: {
        inspection_user: string;
        inspection_details: Record<string, unknown>;
    };
    approval_status: string;
    created_by: string;
    total_amount: string;
    receive_fk: number;
    item_name: string;
    nac_code: string;
    part_number: string;
    received_quantity: string;
    unit: string;
    received_by: string | null;
    receive_date: string;
    request_number: string;
    request_date: string;
    requested_by: string;
    equipment_number: string;
    freight_charge: string;
    customs_date: string;
}
interface Config {
    supplier_list_local: string[] | string;
    currency_list: string[] | string;
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
}
interface PendingRRPResponse {
    config: Config;
    pendingRRPs: PendingRRP[];
}
interface PendingCapitalRRP {
    id: number;
    rrp_number: string;
    supplier_name: string;
    date: string;
    currency: string;
    forex_rate: string;
    invoice_number: string;
    invoice_date: string;
    po_number: string | null;
    contract_identification_number: string | null;
    customs_number: string | null;
    inspection_details: {
        inspection_user?: string;
        inspection_details?: Record<string, unknown>;
    };
    created_by: string;
    total_amount: string;
    item_price: string;
    model_name: string;
    receive_date?: string;
    asset_receive_fk?: number;
    customs_charge?: string;
    transportation_other_charges?: string;
    po_date?: string | null;
    capital_item?: Record<string, unknown> | null;
    capital_item_data?: unknown;
    equipment_code?: string;
    equipment_name?: string;
    location?: string;
}
type PendingRRPListEntry = {
    rrp_number: string;
    date: string;
    created_by: string;
    category: 'spare' | 'capital';
};
export function PendingRRPCount() {
    const { permissions, user } = useAuthContext();
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const { markAsRead } = useNotification();
    const [pendingCount, setPendingCount] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isOpen, setIsOpen] = useState(false);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isCapitalDetailsOpen, setIsCapitalDetailsOpen] = useState(false);
    const [pendingRRPs, setPendingRRPs] = useState<PendingRRPListEntry[]>([]);
    const [allRRPItems, setAllRRPItems] = useState<PendingRRP[]>([]);
    const [allCapitalRRPItems, setAllCapitalRRPItems] = useState<PendingCapitalRRP[]>([]);
    const [config, setConfig] = useState<Config | null>(null);
    const [selectedCapitalRRP, setSelectedCapitalRRP] = useState<CapitalRRPApprovalData | null>(null);
    const [capitalConfig, setCapitalConfig] = useState<CapitalRRPConfig | null>(null);
    const [activeCapitalConfig, setActiveCapitalConfig] = useState<CapitalRRPConfig | null>(null);
    const [selectedRRP, setSelectedRRP] = useState<{
        items: PendingRRPItem[];
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
    } | null>(null);
    interface PendingRRPItem {
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
    const fetchPendingCount = useCallback(async () => {
        try {
            setIsLoading(true);
            if (!permissions?.includes('can_approve_rrp')) {
                setIsLoading(false);
                return;
            }
            const [spareRes, capitalRes] = await Promise.all([
                API.get('/api/rrp/pending'),
                API.get('/api/capital-rrp/pending'),
            ]);
            const data = spareRes.data as PendingRRPResponse;
            setConfig(data.config);
            setAllRRPItems(data.pendingRRPs);
            const capitalPayload = capitalRes.data as { pendingRRPs?: PendingCapitalRRP[]; config?: CapitalRRPConfig };
            const capitalItems = capitalPayload?.pendingRRPs || [];
            setAllCapitalRRPItems(capitalItems);
            if (capitalPayload?.config) {
                setCapitalConfig(capitalPayload.config);
            }
            const listEntries: PendingRRPListEntry[] = [];
            const seen = new Set<string>();
            for (const item of data.pendingRRPs) {
                if (!seen.has(item.rrp_number)) {
                    seen.add(item.rrp_number);
                    listEntries.push({
                        rrp_number: item.rrp_number,
                        date: item.date,
                        created_by: item.created_by,
                        category: 'spare',
                    });
                }
            }
            for (const item of capitalItems) {
                if (!seen.has(item.rrp_number)) {
                    seen.add(item.rrp_number);
                    listEntries.push({
                        rrp_number: item.rrp_number,
                        date: item.date,
                        created_by: item.created_by,
                        category: 'capital',
                    });
                }
            }
            setPendingRRPs(listEntries);
            setPendingCount(listEntries.length);
        }
        catch {
        }
        finally {
            setIsLoading(false);
        }
    }, [permissions]);
    useEffect(() => {
        fetchPendingCount();
    }, [fetchPendingCount]);
    useEffect(() => {
        if (isDetailsOpen || isCapitalDetailsOpen)
            return;
        const interval = setInterval(() => {
            fetchPendingCount();
        }, 30000);
        return () => clearInterval(interval);
    }, [fetchPendingCount, isDetailsOpen, isCapitalDetailsOpen]);
    const parseCapitalItemFromRow = (item: PendingCapitalRRP): Record<string, unknown> => {
        if (item.capital_item && typeof item.capital_item === 'object') {
            return item.capital_item as Record<string, unknown>;
        }
        const raw = item.capital_item_data;
        if (!raw) return {};
        try {
            if (typeof raw === 'string') {
                const trimmed = raw.trim();
                return trimmed ? (JSON.parse(trimmed) as Record<string, unknown>) : {};
            }
            if (typeof raw === 'object') {
                return raw as Record<string, unknown>;
            }
        }
        catch {
            return {};
        }
        return {};
    };

    const mapCapitalItem = (item: PendingCapitalRRP): CapitalEditItem => {
        const c = parseCapitalItemFromRow(item);
        return {
            id: item.id,
            asset_receive_id: Number(item.asset_receive_fk) || 0,
            model_name: item.model_name,
            receive_date: item.receive_date,
            asset_type_id: Number(c.asset_type_id) || 0,
            equipment_code: String(c.equipment_code || item.equipment_code || ''),
            equipment_name: String(c.equipment_name || item.equipment_name || item.model_name || ''),
            servicability_status: String(c.servicability_status || ''),
            purchase_currency: String(c.purchase_currency || item.currency || 'NPR'),
            equipment_manufacturer_name: String(c.equipment_manufacturer_name || ''),
            model_number: String(c.model_number || ''),
            series: c.series ? String(c.series) : undefined,
            engine_number: c.engine_number ? String(c.engine_number) : undefined,
            engine_model_number: c.engine_model_number ? String(c.engine_model_number) : undefined,
            serial_number: String(c.serial_number || ''),
            transmission_model: c.transmission_model ? String(c.transmission_model) : undefined,
            vin_number: c.vin_number ? String(c.vin_number) : undefined,
            weight: c.weight ? String(c.weight) : undefined,
            weight_unit: c.weight_unit ? String(c.weight_unit) : undefined,
            size: c.size ? String(c.size) : undefined,
            size_unit: c.size_unit ? String(c.size_unit) : undefined,
            quantity: Number(c.quantity) || 1,
            purchase_amount: Number(c.purchase_amount) || parseFloat(item.item_price) || 0,
            unit: String(c.unit || 'EA'),
            vat_status: Boolean(c.vat_status ?? (parseFloat(item.vat_percentage) > 0)),
            item_price: parseFloat(item.item_price) || 0,
            total_amount: parseFloat(item.total_amount) || 0,
            vat_amount_purchase_currency: parseFloat(String(c.vat_amount_purchase_currency ?? item.vat_amount ?? 0)) || undefined,
        };
    };

    const handleViewCapitalDetails = async (rrpNumber: string) => {
        let cfg = capitalConfig;
        if (!cfg?.supplier_list_capital?.length) {
            try {
                const cfgRes = await API.get('/api/capital-rrp/config');
                const typesRes = await API.get('/api/asset-types');
                cfg = {
                    ...cfgRes.data,
                    asset_types: typesRes.data || [],
                };
                setCapitalConfig(cfg);
            }
            catch {
                showErrorToast({ title: 'Error', message: 'Failed to load capital RRP config', duration: 3000 });
                return;
            }
        }
        setActiveCapitalConfig(cfg);
        const rrpItems = allCapitalRRPItems.filter((r) => r.rrp_number === rrpNumber);
        if (rrpItems.length === 0) return;
        const first = rrpItems[0];
        const inspectionUser =
            first.inspection_details?.inspection_user ||
            (typeof first.inspection_details === 'object' &&
            first.inspection_details &&
            'inspection_user' in first.inspection_details
                ? String((first.inspection_details as { inspection_user?: string }).inspection_user)
                : '');
        const storedLoc = (first.capital_item as Record<string, unknown> | null)?.location;
        setSelectedCapitalRRP({
            rrpNumber: first.rrp_number,
            rrpDate: first.date,
            supplier: first.supplier_name,
            invoiceNumber: first.invoice_number,
            invoiceDate: first.invoice_date,
            currency: first.currency,
            forexRate: parseFloat(String(first.forex_rate)) || 1,
            location: String(first.location || storedLoc || ''),
            inspectionUser,
            poNumber: first.po_number || undefined,
            poDate: first.po_date || undefined,
            contractId: first.contract_identification_number || undefined,
            customsDate: first.customs_date || undefined,
            customsNumber: first.customs_number || undefined,
            customsAmountNpr: parseFloat(String(first.customs_charge)) || 0,
            transportCharges: parseFloat(String(first.transportation_other_charges)) || 0,
            items: rrpItems.map(mapCapitalItem),
        });
        setIsCapitalDetailsOpen(true);
    };
    const handleViewDetails = (rrpNumber: string, category: 'spare' | 'capital') => {
        if (category === 'capital') {
            handleViewCapitalDetails(rrpNumber);
            return;
        }
        const rrpItems = allRRPItems.filter(rrp => rrp.rrp_number === rrpNumber);
        if (rrpItems.length === 0)
            return;
        const firstItem = rrpItems[0];
        const isForeign = firstItem.currency !== 'NPR';
        setSelectedRRP({
            items: rrpItems.map(item => ({
                id: item.id,
                item_name: item.item_name,
                part_number: item.part_number,
                nac_code: item.nac_code,
                equipment_number: item.equipment_number,
                received_quantity: parseFloat(item.received_quantity) || 0,
                unit: item.unit,
                item_price: parseFloat(item.item_price) || 0,
                vat_percentage: parseFloat(item.vat_percentage) || 0,
                customs_charge: parseFloat(item.customs_charge) || 0,
                currency: item.currency,
                forex_rate: parseFloat(item.forex_rate?.toString?.() || '1') || 1,
                freight_charge: parseFloat(item.freight_charge) || 0,
                customs_service_charge: parseFloat(item.customs_service_charge) || 0,
                total_amount: parseFloat(item.total_amount) || 0
            })),
            rrpNumber: firstItem.rrp_number,
            rrpDate: firstItem.date,
            requestNumber: firstItem.request_number,
            requestDate: firstItem.request_date,
            type: isForeign ? 'foreign' : 'local',
            supplier: firstItem.supplier_name,
            inspectionUser: firstItem.inspection_details.inspection_user,
            invoiceNumber: firstItem.invoice_number,
            invoiceDate: firstItem.invoice_date,
            freightCharge: parseFloat(firstItem.freight_charge) || 0,
            customsDate: isForeign ? firstItem.customs_date : undefined,
            poNumber: isForeign ? (firstItem.po_number || undefined) : undefined,
            airwayBillNumber: isForeign ? (firstItem.airway_bill_number || undefined) : undefined,
            customsNumber: isForeign ? (firstItem.customs_number || undefined) : undefined,
            currency: isForeign ? firstItem.currency : undefined,
            forexRate: isForeign ? parseFloat(firstItem.forex_rate) : undefined
        });
        setIsDetailsOpen(true);
    };
    const handleApproveRRP = useCallback(async () => {
        if (!selectedRRP || !user?.UserInfo?.username)
            return;
        try {
            await API.post(`/api/rrp/approve/${selectedRRP.rrpNumber}`, {
                approved_by: user.UserInfo.username
            });
            const searchParams = new URLSearchParams(window.location.search);
            const notificationId = searchParams.get('notificationId');
            if (notificationId) {
                await markAsRead(Number(notificationId));
            }
            showSuccessToast({
                title: 'Success',
                message: "RRP approved successfully",
                duration: 3000,
            });
            setIsDetailsOpen(false);
            fetchPendingCount();
        }
        catch (error: unknown) {
            let message = 'Failed to approve RRP';
            if (error && typeof error === 'object' && 'response' in error && error.response && typeof error.response === 'object' && 'data' in error.response && error.response.data && typeof error.response.data === 'object' && 'message' in error.response.data) {
                message = (error.response.data as {
                    message?: string;
                }).message || message;
            }
            else if (error instanceof Error) {
                message = error.message;
            }
            showErrorToast({
                title: 'Error',
                message,
                duration: 3000,
            });
        }
    }, [selectedRRP, user?.UserInfo?.username, markAsRead, showSuccessToast, showErrorToast, fetchPendingCount]);
    const handleApproveCapitalRRP = useCallback(async () => {
        if (!selectedCapitalRRP || !user?.UserInfo?.username) return;
        try {
            await API.post(`/api/capital-rrp/approve/${selectedCapitalRRP.rrpNumber}`, {
                approved_by: user.UserInfo.username,
            });
            showSuccessToast({
                title: 'Success',
                message: 'Capital RRP approved — assets added to inventory',
                duration: 3000,
            });
            setIsCapitalDetailsOpen(false);
            setSelectedCapitalRRP(null);
            fetchPendingCount();
        }
        catch (error: unknown) {
            let message = 'Failed to approve capital RRP';
            if (
                error &&
                typeof error === 'object' &&
                'response' in error &&
                error.response &&
                typeof error.response === 'object' &&
                'data' in error.response &&
                error.response.data &&
                typeof error.response.data === 'object' &&
                'message' in error.response.data
            ) {
                message = (error.response.data as { message?: string }).message || message;
            }
            showErrorToast({ title: 'Error', message, duration: 3000 });
        }
    }, [selectedCapitalRRP, user?.UserInfo?.username, showSuccessToast, showErrorToast, fetchPendingCount]);
    const handleEditCapitalRRP = useCallback(
        async (data: CapitalRRPApprovalData) => {
            try {
                await API.put(`/api/capital-rrp/update/${data.rrpNumber}`, {
                    rrp_number: data.rrpNumber,
                    date: data.rrpDate,
                    supplier_name: data.supplier,
                    invoice_number: data.invoiceNumber,
                    invoice_date: data.invoiceDate,
                    po_number: data.poNumber,
                    po_date: data.poDate,
                    contract_identification_number: data.contractId,
                    customs_date: data.customsDate,
                    customs_number: data.customsNumber,
                    currency: data.currency,
                    forex_rate: data.forexRate,
                    location: data.location,
                    inspection_user: data.inspectionUser,
                    customs_amount_npr: data.customsAmountNpr,
                    transportation_other_charges: data.transportCharges,
                    items: data.items.map((item) => ({
                        id: item.id,
                        asset_receive_id: item.asset_receive_id,
                        asset_type_id: item.asset_type_id,
                        equipment_name: item.equipment_name,
                        servicability_status: item.servicability_status,
                        purchase_currency: item.purchase_currency,
                        equipment_manufacturer_name: item.equipment_manufacturer_name,
                        model_number: item.model_number,
                        series: item.series,
                        engine_number: item.engine_number,
                        engine_model_number: item.engine_model_number,
                        serial_number: item.serial_number,
                        transmission_model: item.transmission_model,
                        vin_number: item.vin_number,
                        weight: item.weight,
                        weight_unit: item.weight_unit,
                        size: item.size,
                        size_unit: item.size_unit,
                        quantity: item.quantity,
                        purchase_amount: item.purchase_amount,
                        equipment_code: item.equipment_code,
                        unit: item.unit,
                        vat_status: item.vat_status,
                    })),
                });
                showSuccessToast({
                    title: 'Success',
                    message: 'Capital RRP updated successfully',
                    duration: 3000,
                });
                setIsCapitalDetailsOpen(false);
                setSelectedCapitalRRP(null);
                fetchPendingCount();
            }
            catch (error: unknown) {
                let message = 'Failed to update capital RRP';
                if (
                    error &&
                    typeof error === 'object' &&
                    'response' in error &&
                    error.response &&
                    typeof error.response === 'object' &&
                    'data' in error.response &&
                    error.response.data &&
                    typeof error.response.data === 'object' &&
                    'message' in error.response.data
                ) {
                    message = (error.response.data as { message?: string }).message || message;
                }
                showErrorToast({ title: 'Error', message, duration: 5000 });
                throw error;
            }
        },
        [showSuccessToast, showErrorToast, fetchPendingCount]
    );

    const handleDeleteCapitalItem = useCallback(
        async (itemId: number) => {
            try {
                await API.delete(`/api/capital-rrp/item/${itemId}`);
                setSelectedCapitalRRP((prev) =>
                    prev ? { ...prev, items: prev.items.filter((i) => i.id !== itemId) } : null
                );
                showSuccessToast({
                    title: 'Success',
                    message: 'Equipment line removed',
                    duration: 3000,
                });
                await fetchPendingCount();
            }
            catch (error: unknown) {
                let message = 'Failed to delete item';
                if (
                    error &&
                    typeof error === 'object' &&
                    'response' in error &&
                    error.response &&
                    typeof error.response === 'object' &&
                    'data' in error.response &&
                    error.response.data &&
                    typeof error.response.data === 'object' &&
                    'message' in error.response.data
                ) {
                    message = (error.response.data as { message?: string }).message || message;
                }
                showErrorToast({ title: 'Error', message, duration: 3000 });
            }
        },
        [showSuccessToast, showErrorToast, fetchPendingCount]
    );

    const handleRejectCapitalRRP = useCallback(
        async (reason: string) => {
            if (!selectedCapitalRRP || !user?.UserInfo?.username) return;
            try {
                await API.post(`/api/capital-rrp/reject/${selectedCapitalRRP.rrpNumber}`, {
                    rejected_by: user.UserInfo.username,
                    rejection_reason: reason,
                });
                showSuccessToast({
                    title: 'Success',
                    message: 'Capital RRP rejected',
                    duration: 3000,
                });
                setIsCapitalDetailsOpen(false);
                setSelectedCapitalRRP(null);
                fetchPendingCount();
            }
            catch (error: unknown) {
                let message = 'Failed to reject capital RRP';
                if (
                    error &&
                    typeof error === 'object' &&
                    'response' in error &&
                    error.response &&
                    typeof error.response === 'object' &&
                    'data' in error.response &&
                    error.response.data &&
                    typeof error.response.data === 'object' &&
                    'message' in error.response.data
                ) {
                    message = (error.response.data as { message?: string }).message || message;
                }
                showErrorToast({ title: 'Error', message, duration: 3000 });
            }
        },
        [selectedCapitalRRP, user?.UserInfo?.username, showSuccessToast, showErrorToast, fetchPendingCount]
    );
    const handleRejectRRP = useCallback(async (reason: string) => {
        if (!selectedRRP || !user?.UserInfo?.username)
            return;
        try {
            await API.post(`/api/rrp/reject/${selectedRRP.rrpNumber}`, {
                rejected_by: user.UserInfo.username,
                rejection_reason: reason
            });
            const searchParams = new URLSearchParams(window.location.search);
            const notificationId = searchParams.get('notificationId');
            if (notificationId) {
                await markAsRead(Number(notificationId));
            }
            showSuccessToast({
                title: 'Success',
                message: "RRP rejected successfully",
                duration: 3000,
            });
            setIsDetailsOpen(false);
            fetchPendingCount();
        }
        catch (error: unknown) {
            let message = 'Failed to reject RRP';
            if (error && typeof error === 'object' && 'response' in error && error.response && typeof error.response === 'object' && 'data' in error.response && error.response.data && typeof error.response.data === 'object' && 'message' in error.response.data) {
                message = (error.response.data as {
                    message?: string;
                }).message || message;
            }
            else if (error instanceof Error) {
                message = error.message;
            }
            showErrorToast({
                title: 'Error',
                message,
                duration: 3000,
            });
        }
    }, [selectedRRP, user?.UserInfo?.username, markAsRead, showSuccessToast, showErrorToast, fetchPendingCount]);
    const handleEditRRP = useCallback(async (data: unknown) => {
        if (!selectedRRP)
            return;
        if (!data || typeof data !== 'object' || !('rrpNumber' in data))
            return;
        const safeData = data as {
            rrpNumber: string;
            rrpDate: string;
            requestNumber: string;
            requestDate: string;
            type: string;
            supplier: string;
            inspectionUser: string;
            invoiceNumber: string;
            invoiceDate: string;
            freightCharge: number;
            customsNumber?: string;
            customsDate?: string;
            poNumber?: string;
            airwayBillNumber?: string;
            currency?: string;
            forexRate?: number;
            items: PendingRRPItem[];
        };
        try {
            const transformedData = {
                rrp_number: safeData.rrpNumber,
                date: safeData.rrpDate,
                request_number: safeData.requestNumber,
                request_date: safeData.requestDate,
                type: safeData.type,
                supplier_name: safeData.supplier,
                inspection_user: safeData.inspectionUser,
                invoice_number: safeData.invoiceNumber,
                invoice_date: safeData.invoiceDate,
                freight_charge: safeData.freightCharge,
                customs_number: safeData.customsNumber,
                customs_date: safeData.customsDate,
                po_number: safeData.poNumber,
                airway_bill_number: safeData.airwayBillNumber,
                currency: safeData.currency,
                forex_rate: safeData.forexRate,
                items: safeData.items.map((item) => ({
                    id: item.id,
                    item_name: item.item_name,
                    part_number: item.part_number,
                    nac_code: item.nac_code,
                    equipment_number: item.equipment_number,
                    received_quantity: item.received_quantity,
                    unit: item.unit,
                    item_price: item.item_price,
                    vat_percentage: item.vat_percentage,
                    customs_charge: item.customs_charge,
                    customs_service_charge: item.customs_service_charge,
                    currency: item.currency,
                    forex_rate: item.forex_rate,
                    freight_charge: item.freight_charge,
                    total_amount: item.total_amount
                }))
            };
            const response = await API.put(`/api/rrp/update/${selectedRRP.rrpNumber}`, transformedData);
            if (response.status === 200) {
                const searchParams = new URLSearchParams(window.location.search);
                const notificationId = searchParams.get('notificationId');
                if (notificationId) {
                    await markAsRead(Number(notificationId));
                }
                showSuccessToast({
                    title: 'Success',
                    message: "RRP updated successfully",
                    duration: 3000,
                });
                setIsDetailsOpen(false);
                fetchPendingCount();
            }
            else {
                throw new Error('Failed to update RRP');
            }
        }
        catch (error: unknown) {
            let message = 'Failed to update RRP';
            if (error && typeof error === 'object' && 'response' in error && error.response && typeof error.response === 'object' && 'data' in error.response && error.response.data && typeof error.response.data === 'object' && 'message' in error.response.data) {
                message = (error.response.data as {
                    message?: string;
                }).message || message;
            }
            else if (error instanceof Error) {
                message = error.message;
            }
            showErrorToast({
                title: 'Error',
                message,
                duration: 3000,
            });
        }
    }, [selectedRRP, markAsRead, showSuccessToast, showErrorToast, fetchPendingCount]);
    const handleDeleteItem = useCallback(async (itemId: number) => {
        if (!selectedRRP)
            return;
        try {
            await API.delete(`/api/rrp/item/${itemId}`);
            showSuccessToast({
                title: 'Success',
                message: "Item deleted successfully",
                duration: 3000,
            });
            fetchPendingCount();
        }
        catch (error: unknown) {
            let message = 'Failed to delete item';
            if (error && typeof error === 'object' && 'response' in error && error.response && typeof error.response === 'object' && 'data' in error.response && error.response.data && typeof error.response.data === 'object' && 'message' in error.response.data) {
                message = (error.response.data as {
                    message?: string;
                }).message || message;
            }
            else if (error instanceof Error) {
                message = error.message;
            }
            showErrorToast({
                title: 'Error',
                message,
                duration: 3000,
            });
        }
    }, [selectedRRP, showSuccessToast, showErrorToast, fetchPendingCount]);
    if (!permissions?.includes('can_approve_rrp')) {
        return null;
    }
    if (isLoading) {
        return (<div className="flex items-center justify-center h-24">
        <div className="animate-spin rounded-full h-8 w-8 border-3 border-[#003594] border-t-transparent"></div>
      </div>);
    }
    return (<>
      <Modal open={isOpen} onOpenChange={setIsOpen}>
        <ModalTrigger asChild>
          <Card className="cursor-pointer hover:bg-[#003594]/5 transition-colors border-[#002a6e]/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base font-semibold text-[#003594]">Pending RRP</CardTitle>
              <FileText className="h-5 w-5 text-[#003594]"/>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-[#003594]">{pendingCount}</div>
              <p className="text-sm text-gray-500 mt-1">RRP awaiting approval</p>
            </CardContent>
          </Card>
        </ModalTrigger>
        <ModalContent className="max-w-3xl bg-white rounded-lg shadow-xl border-[#002a6e]/10">
          <ModalHeader className="border-b border-[#002a6e]/10 pb-4">
            <ModalTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
              Pending RRP
            </ModalTitle>
            <ModalDescription className="text-gray-600">
              Review and manage pending RRP requests
            </ModalDescription>
          </ModalHeader>
          <div className="mt-6 space-y-4">
            {pendingRRPs.map((rrp) => (<div key={`${rrp.category}-${rrp.rrp_number}`} className="rounded-lg border border-[#002a6e]/10 p-6 hover:bg-[#003594]/5 transition-colors">
                <div className="grid grid-cols-4 gap-6 items-center">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#003594]">RRP #</p>
                    <p className="text-lg font-semibold text-gray-900">{rrp.rrp_number}</p>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${rrp.category === 'capital' ? 'bg-violet-100 text-violet-800' : 'bg-sky-100 text-sky-800'}`}>
                      {rrp.category === 'capital' ? 'Capital (RRCP)' : 'Spare'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#003594]">Date</p>
                    <p className="text-lg font-semibold text-gray-900">{new Date(rrp.date).toLocaleDateString()}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#003594]">Created By</p>
                    <p className="text-lg font-semibold text-gray-900">{rrp.created_by}</p>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => handleViewDetails(rrp.rrp_number, rrp.category)} className="flex items-center gap-2 bg-[#003594] hover:bg-[#003594]/90 text-white">
                      <Eye className="h-4 w-4"/>
                      View Details
                    </Button>
                  </div>
                </div>
              </div>))}
          </div>
        </ModalContent>
      </Modal>

      {selectedRRP && (<RRPDetailsModal isOpen={isDetailsOpen} onClose={() => setIsDetailsOpen(false)} rrpData={selectedRRP} onApprove={handleApproveRRP} onReject={handleRejectRRP} onEdit={handleEditRRP} onDeleteItem={handleDeleteItem} config={config!}/>)}
      {selectedCapitalRRP && (
        <CapitalRRPDetailsModal
          isOpen={isCapitalDetailsOpen}
          onClose={() => {
            setIsCapitalDetailsOpen(false);
            setSelectedCapitalRRP(null);
          }}
          rrpData={selectedCapitalRRP}
          config={activeCapitalConfig || capitalConfig || {}}
          onApprove={handleApproveCapitalRRP}
          onReject={handleRejectCapitalRRP}
          onEdit={handleEditCapitalRRP}
          onDeleteItem={handleDeleteCapitalItem}
        />
      )}
    </>);
}
