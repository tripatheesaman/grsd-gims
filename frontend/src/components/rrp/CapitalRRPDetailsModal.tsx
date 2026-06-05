'use client';

import { useState, useMemo } from 'react';
import { useRRP } from '@/hooks/useRRP';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    calculateCapitalLineFinancials,
    calculateCapitalFinancialSummary,
    formatCurrencyAmount,
    formatMoney,
} from '@/utils/capitalRrpFinancials';

export interface CapitalEditItem {
    id: number;
    asset_receive_id: number;
    model_name: string;
    receive_date?: string;
    asset_type_id: number;
    equipment_code: string;
    equipment_name: string;
    servicability_status: string;
    purchase_currency: string;
    equipment_manufacturer_name: string;
    model_number: string;
    series?: string;
    engine_number?: string;
    engine_model_number?: string;
    serial_number: string;
    transmission_model?: string;
    vin_number?: string;
    weight?: string;
    weight_unit?: string;
    size?: string;
    size_unit?: string;
    quantity: number;
    purchase_amount: number;
    unit: string;
    vat_status: boolean;
    item_price: number;
    total_amount: number;
    vat_amount_purchase_currency?: number;
}

export interface CapitalRRPApprovalData {
    rrpNumber: string;
    rrpDate: string;
    supplier: string;
    invoiceNumber: string;
    invoiceDate: string;
    currency: string;
    forexRate: number;
    location: string;
    inspectionUser: string;
    poNumber?: string;
    poDate?: string;
    contractId?: string;
    customsDate?: string;
    customsNumber?: string;
    customsAmountNpr: number;
    transportCharges: number;
    items: CapitalEditItem[];
}

export interface CapitalRRPConfig {
    supplier_list_capital?: string[];
    currency_list?: string[];
    inspection_user_details?: Array<{ name: string; designation: string }>;
    vat_rate?: number;
    asset_settings?: {
        servicability_statuses?: string[];
        weight_units?: string[];
        size_units?: string[];
        quantity_units?: string[];
        locations?: string[];
    };
    asset_types?: Array<{ id: number; name: string }>;
}

interface CapitalRRPDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    rrpData: CapitalRRPApprovalData;
    config: CapitalRRPConfig;
    onApprove: () => void | Promise<void>;
    onReject: (reason: string) => void | Promise<void>;
    onEdit: (data: CapitalRRPApprovalData) => void | Promise<void>;
    onDeleteItem?: (itemId: number) => void | Promise<void>;
}

const formatDateForInput = (dateString: string | undefined): string => {
    if (!dateString) return '';
    if (dateString.includes('T')) return dateString.split('T')[0];
    return dateString.split(' ')[0];
};

const convertDateToISO = (dateString: string | undefined): string => {
    if (!dateString) return '';
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).toISOString();
};

export function CapitalRRPDetailsModal({
    isOpen,
    onClose,
    rrpData,
    config,
    onApprove,
    onReject,
    onEdit,
    onDeleteItem,
}: CapitalRRPDetailsModalProps) {
    const { getCurrencies } = useRRP();
    const { showErrorToast } = useCustomToast();
    const [isEditMode, setIsEditMode] = useState(false);
    const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [itemToDelete, setItemToDelete] = useState<number | null>(null);
    const [editData, setEditData] = useState<CapitalRRPApprovalData | null>(null);

    const vatRate = Number(config.vat_rate) || 0;
    const settings = config.asset_settings || {};
    const servicabilityOptions: string[] = settings.servicability_statuses || [];
    const weightUnits: string[] = settings.weight_units || ['KG'];
    const sizeUnits: string[] = settings.size_units || ['M'];
    const qtyUnits: string[] = settings.quantity_units || ['EA'];
    const locations: string[] = settings.locations || [];
    const suppliers = config.supplier_list_capital || [];
    const assetTypes = config.asset_types || [];
    const isImport = (editData?.currency ?? rrpData.currency) !== 'NPR';

    const handleEditClick = () => {
        setEditData({
            ...rrpData,
            rrpDate: formatDateForInput(rrpData.rrpDate),
            invoiceDate: formatDateForInput(rrpData.invoiceDate),
            poDate: formatDateForInput(rrpData.poDate),
            customsDate: formatDateForInput(rrpData.customsDate),
            items: rrpData.items.map((item) => ({
                ...item,
                purchase_amount: Number(item.purchase_amount) || Number(item.item_price) || 0,
                item_price: Number(item.item_price) || Number(item.purchase_amount) || 0,
            })),
        });
        setIsEditMode(true);
    };

    const handleSaveEdit = async () => {
        if (!editData) return;
        const forex = Number(editData.forexRate) || 1;
        const processed: CapitalRRPApprovalData = {
            ...editData,
            rrpDate: editData.rrpDate ? convertDateToISO(editData.rrpDate) : rrpData.rrpDate,
            invoiceDate: editData.invoiceDate ? convertDateToISO(editData.invoiceDate) : rrpData.invoiceDate,
            poDate: editData.poDate ? convertDateToISO(editData.poDate) : rrpData.poDate,
            customsDate: editData.customsDate ? convertDateToISO(editData.customsDate) : rrpData.customsDate,
            items: editData.items.map((item) => ({
                ...item,
                item_price: Number(item.purchase_amount) || 0,
                total_amount: calculateCapitalLineFinancials(item, forex, vatRate).lineTotalNpr,
            })),
        };
        try {
            await onEdit(processed);
            setIsEditMode(false);
            setEditData(null);
        }
        catch {
            showErrorToast({ title: 'Error', message: 'Failed to save capital RRP changes', duration: 3000 });
        }
    };

    const handleReject = async () => {
        if (!rejectionReason.trim()) {
            showErrorToast({ title: 'Error', message: 'Please provide a reason for rejection', duration: 3000 });
            return;
        }
        try {
            await onReject(rejectionReason);
            setIsRejectDialogOpen(false);
            setRejectionReason('');
        }
        catch {
            showErrorToast({ title: 'Error', message: 'Failed to reject capital RRP', duration: 3000 });
        }
    };

    const display = editData || rrpData;
    const currentItems = display.items;
    const forex = Number(display.forexRate) || 1;
    const purchaseCurrency = display.currency || 'NPR';
    const summary = useMemo(
        () =>
            calculateCapitalFinancialSummary(
                currentItems,
                purchaseCurrency,
                forex,
                vatRate,
                Number(display.customsAmountNpr) || 0,
                Number(display.transportCharges) || 0
            ),
        [
            currentItems,
            purchaseCurrency,
            forex,
            vatRate,
            display.customsAmountNpr,
            display.transportCharges,
        ]
    );

    const updateItem = (index: number, patch: Partial<CapitalEditItem>) => {
        if (!editData) return;
        const items = [...editData.items];
        items[index] = { ...items[index], ...patch };
        setEditData({ ...editData, items });
    };

    const fieldInput = (
        label: string,
        value: string | number,
        onChange?: (v: string) => void,
        opts?: { type?: string; readOnly?: boolean }
    ) => (
        <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">{label}</Label>
            <Input
                type={opts?.type || 'text'}
                value={value}
                onChange={onChange ? (e) => onChange(e.target.value) : undefined}
                disabled={!isEditMode || opts?.readOnly}
                readOnly={opts?.readOnly}
                className={`h-10 ${isEditMode && !opts?.readOnly ? 'bg-white border-[#002a6e]/10' : 'bg-gray-50'}`}
            />
        </div>
    );

    return (
        <>
            <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
                <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto bg-white text-gray-900">
                    <DialogHeader className="border-b pb-4">
                        <DialogTitle className="text-2xl font-bold text-[#002a6e]">
                            Capital RRP (RRCP) — {display.rrpNumber}
                        </DialogTitle>
                        <DialogDescription>
                            Review and edit RRCP details before approval. Approving registers equipment in Asset Management.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 py-2">
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-100">
                            <h3 className="text-lg font-bold text-gray-900 mb-4">RRP Information</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {fieldInput('RRP Number', display.rrpNumber, (v) =>
                                    editData && setEditData({ ...editData, rrpNumber: v })
                                )}
                                {fieldInput('RRP Date', display.rrpDate, (v) =>
                                    editData && setEditData({ ...editData, rrpDate: v })
                                , { type: 'date' })}
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium text-gray-700">Supplier</Label>
                                    {isEditMode && editData ? (
                                        <Select
                                            value={editData.supplier}
                                            onValueChange={(v) => setEditData({ ...editData, supplier: v })}
                                        >
                                            <SelectTrigger className="bg-white">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-white">
                                                {suppliers.map((s) => (
                                                    <SelectItem key={s} value={s}>
                                                        {s}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <Input value={display.supplier} disabled className="bg-gray-50" />
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium text-gray-700">Location</Label>
                                    {isEditMode && editData ? (
                                        <Select
                                            value={editData.location}
                                            onValueChange={(v) => setEditData({ ...editData, location: v })}
                                        >
                                            <SelectTrigger className="bg-white">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-white">
                                                {locations.map((loc) => (
                                                    <SelectItem key={loc} value={loc}>
                                                        {loc}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <Input value={display.location || '—'} disabled className="bg-gray-50" />
                                    )}
                                </div>
                                {fieldInput('Invoice Number', display.invoiceNumber, (v) =>
                                    editData && setEditData({ ...editData, invoiceNumber: v })
                                )}
                                {fieldInput('Invoice Date', display.invoiceDate, (v) =>
                                    editData && setEditData({ ...editData, invoiceDate: v })
                                , { type: 'date' })}
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium text-gray-700">Inspection User</Label>
                                    {isEditMode && editData ? (
                                        <Select
                                            value={editData.inspectionUser}
                                            onValueChange={(v) => setEditData({ ...editData, inspectionUser: v })}
                                        >
                                            <SelectTrigger className="bg-white">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-white max-h-48">
                                                {(config.inspection_user_details || []).map((u) => (
                                                    <SelectItem
                                                        key={`${u.name}-${u.designation}`}
                                                        value={`${u.name},${u.designation}`}
                                                    >
                                                        {u.name} — {u.designation}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <Input value={display.inspectionUser} disabled className="bg-gray-50" />
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium text-gray-700">Currency</Label>
                                    {isEditMode && editData ? (
                                        <Select
                                            value={editData.currency}
                                            onValueChange={(v) => setEditData({ ...editData, currency: v })}
                                        >
                                            <SelectTrigger className="bg-white">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-white">
                                                {getCurrencies().map((c) => (
                                                    <SelectItem key={c} value={c}>
                                                        {c}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <Input value={display.currency} disabled className="bg-gray-50" />
                                    )}
                                </div>
                                {fieldInput('Forex Rate', display.forexRate, (v) =>
                                    editData && setEditData({ ...editData, forexRate: parseFloat(v) || 1 })
                                , { type: 'number' })}
                                {fieldInput('PO Number', display.poNumber || '', (v) =>
                                    editData && setEditData({ ...editData, poNumber: v })
                                )}
                                {fieldInput('PO Date', display.poDate || '', (v) =>
                                    editData && setEditData({ ...editData, poDate: v })
                                , { type: 'date' })}
                                {fieldInput('Contract ID', display.contractId || '', (v) =>
                                    editData && setEditData({ ...editData, contractId: v })
                                )}
                                {fieldInput('Customs Number', display.customsNumber || '', (v) =>
                                    editData && setEditData({ ...editData, customsNumber: v })
                                )}
                                {fieldInput('Customs Date', display.customsDate || '', (v) =>
                                    editData && setEditData({ ...editData, customsDate: v })
                                , { type: 'date' })}
                                {fieldInput('Customs (NPR)', display.customsAmountNpr, (v) =>
                                    editData && setEditData({ ...editData, customsAmountNpr: parseFloat(v) || 0 })
                                , { type: 'number' })}
                                {fieldInput('Transport / Other (NPR)', display.transportCharges, (v) =>
                                    editData && setEditData({ ...editData, transportCharges: parseFloat(v) || 0 })
                                , { type: 'number' })}
                            </div>
                        </div>

                        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-4 border border-amber-100">
                            <h3 className="text-lg font-bold text-gray-900 mb-3">Items &amp; Pricing</h3>
                            <p className="text-sm text-gray-600 mb-3">
                                Unit prices in {purchaseCurrency}; converted to NPR at forex{' '}
                                {formatMoney(forex, 4)}. VAT rate: {vatRate}%.
                            </p>
                            <div className="overflow-x-auto rounded-lg border border-amber-200 bg-white">
                                <Table>
                                    <TableHeader className="bg-gray-50">
                                        <TableRow>
                                            <TableHead className="font-semibold text-[#002a6e]">#</TableHead>
                                            <TableHead className="min-w-[140px] font-semibold text-[#002a6e]">GE No</TableHead>
                                            <TableHead className="min-w-[180px] font-semibold text-[#002a6e]">Equipment</TableHead>
                                            <TableHead className="text-right font-semibold text-[#002a6e]">Qty</TableHead>
                                            <TableHead className="text-right font-semibold text-[#002a6e]">
                                                Unit ({purchaseCurrency})
                                            </TableHead>
                                            <TableHead className="text-right font-semibold text-[#002a6e]">
                                                Line ({purchaseCurrency})
                                            </TableHead>
                                            <TableHead className="text-right font-semibold text-[#002a6e]">
                                                VAT ({purchaseCurrency})
                                            </TableHead>
                                            <TableHead className="text-right font-semibold text-[#002a6e]">Forex</TableHead>
                                            <TableHead className="text-right font-semibold text-[#002a6e]">NPR (ex VAT)</TableHead>
                                            <TableHead className="text-right font-semibold text-[#002a6e]">VAT (NPR)</TableHead>
                                            <TableHead className="text-right font-semibold text-[#002a6e]">Line (NPR)</TableHead>
                                            {isEditMode && (
                                                <TableHead className="text-right font-semibold text-[#002a6e]">VAT</TableHead>
                                            )}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {currentItems.map((item, index) => {
                                            const line = summary.lines[index] ?? calculateCapitalLineFinancials(item, forex, vatRate);
                                            return (
                                                <TableRow key={item.id} className="hover:bg-gray-50">
                                                    <TableCell>{index + 1}</TableCell>
                                                    <TableCell>{item.equipment_code || '—'}</TableCell>
                                                    <TableCell>{item.equipment_name || '—'}</TableCell>
                                                    <TableCell className="text-right">{line.quantity}</TableCell>
                                                    <TableCell className="text-right">
                                                        {isEditMode ? (
                                                            <Input
                                                                type="number"
                                                                className="h-8 bg-white text-right"
                                                                value={item.purchase_amount}
                                                                onChange={(e) =>
                                                                    updateItem(index, {
                                                                        purchase_amount: parseFloat(e.target.value) || 0,
                                                                        item_price: parseFloat(e.target.value) || 0,
                                                                    })
                                                                }
                                                            />
                                                        ) : (
                                                            formatMoney(line.unitPrice)
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">{formatMoney(line.linePurchase)}</TableCell>
                                                    <TableCell className="text-right">
                                                        {line.vatRateApplied > 0 ? formatMoney(line.vatPurchase) : '—'}
                                                    </TableCell>
                                                    <TableCell className="text-right">{formatMoney(forex, 4)}</TableCell>
                                                    <TableCell className="text-right">{formatMoney(line.lineNpr)}</TableCell>
                                                    <TableCell className="text-right">
                                                        {line.vatRateApplied > 0 ? formatMoney(line.vatNpr) : '—'}
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium text-[#003594]">
                                                        {formatMoney(line.lineTotalNpr)}
                                                    </TableCell>
                                                    {isEditMode && (
                                                        <TableCell className="text-center">
                                                            <Switch
                                                                checked={item.vat_status}
                                                                onCheckedChange={(c) => updateItem(index, { vat_status: c })}
                                                            />
                                                        </TableCell>
                                                    )}
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 border border-green-100 space-y-4">
                            <h3 className="text-lg font-bold text-gray-900">Equipment Items ({currentItems.length})</h3>
                            {currentItems.map((item, index) => (
                                <div
                                    key={item.id}
                                    className="rounded-lg border border-green-200 bg-white p-4 space-y-3"
                                >
                                    <div className="flex items-center justify-between">
                                        <p className="font-semibold text-[#003594]">
                                            Line {index + 1}: {item.equipment_code || '—'} — {item.equipment_name}
                                        </p>
                                        {isEditMode && onDeleteItem && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-red-600"
                                                onClick={() => setItemToDelete(item.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        Asset receive: {item.model_name}
                                        {item.receive_date ? ` (${new Date(item.receive_date).toLocaleDateString()})` : ''}
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                        <div className="space-y-1">
                                            <Label className="text-xs">Asset type</Label>
                                            {isEditMode ? (
                                                <Select
                                                    value={String(item.asset_type_id)}
                                                    onValueChange={(v) =>
                                                        updateItem(index, { asset_type_id: Number(v) })
                                                    }
                                                >
                                                    <SelectTrigger className="h-9 bg-white">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-white">
                                                        {assetTypes.map((t) => (
                                                            <SelectItem key={t.id} value={String(t.id)}>
                                                                {t.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <Input
                                                    value={
                                                        assetTypes.find((t) => t.id === item.asset_type_id)?.name ||
                                                        String(item.asset_type_id)
                                                    }
                                                    disabled
                                                    className="h-9 bg-gray-50"
                                                />
                                            )}
                                        </div>
                                        {fieldInput('GE Number', item.equipment_code, (v) =>
                                            updateItem(index, { equipment_code: v })
                                        )}
                                        {fieldInput('Equipment name', item.equipment_name, (v) =>
                                            updateItem(index, { equipment_name: v })
                                        )}
                                        {fieldInput('Manufacturer', item.equipment_manufacturer_name, (v) =>
                                            updateItem(index, { equipment_manufacturer_name: v })
                                        )}
                                        {fieldInput('Model number', item.model_number, (v) =>
                                            updateItem(index, { model_number: v })
                                        )}
                                        {fieldInput('Serial number', item.serial_number, (v) =>
                                            updateItem(index, { serial_number: v })
                                        )}
                                        {fieldInput('Series', item.series || '', (v) =>
                                            updateItem(index, { series: v })
                                        )}
                                        {fieldInput('Engine number', item.engine_number || '', (v) =>
                                            updateItem(index, { engine_number: v })
                                        )}
                                        {fieldInput('Engine model', item.engine_model_number || '', (v) =>
                                            updateItem(index, { engine_model_number: v })
                                        )}
                                        {fieldInput('Transmission', item.transmission_model || '', (v) =>
                                            updateItem(index, { transmission_model: v })
                                        )}
                                        {fieldInput('Chassis (VIN)', item.vin_number || '', (v) =>
                                            updateItem(index, { vin_number: v })
                                        )}
                                        <div className="space-y-1">
                                            <Label className="text-xs">Servicability</Label>
                                            {isEditMode ? (
                                                <Select
                                                    value={item.servicability_status}
                                                    onValueChange={(v) =>
                                                        updateItem(index, { servicability_status: v })
                                                    }
                                                >
                                                    <SelectTrigger className="h-9 bg-white">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-white">
                                                        {servicabilityOptions.map((s) => (
                                                            <SelectItem key={s} value={s}>
                                                                {s}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <Input value={item.servicability_status} disabled className="h-9 bg-gray-50" />
                                            )}
                                        </div>
                                        {fieldInput('Quantity', item.quantity, undefined, { type: 'number', readOnly: true })}
                                        <div className="space-y-1">
                                            <Label className="text-xs">Unit</Label>
                                            {isEditMode ? (
                                                <Select
                                                    value={item.unit}
                                                    onValueChange={(v) => updateItem(index, { unit: v })}
                                                >
                                                    <SelectTrigger className="h-9 bg-white">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-white">
                                                        {qtyUnits.map((u) => (
                                                            <SelectItem key={u} value={u}>
                                                                {u}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <Input value={item.unit} disabled className="h-9 bg-gray-50" />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-100">
                            <h3 className="text-lg font-bold text-gray-900 mb-1">Totals Summary</h3>
                            <p className="text-sm text-gray-600 mb-4">Purchase currency ({purchaseCurrency}) and NPR (final)</p>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                <div className="p-4 bg-white/80 rounded-lg border border-purple-100">
                                    <Label className="text-sm text-gray-700">Items subtotal ({purchaseCurrency})</Label>
                                    <p className="text-lg font-semibold text-[#003594] mt-1">
                                        {formatCurrencyAmount(summary.totalLinePurchase, purchaseCurrency)}
                                    </p>
                                </div>
                                <div className="p-4 bg-white/80 rounded-lg border border-purple-100">
                                    <Label className="text-sm text-gray-700">VAT ({purchaseCurrency})</Label>
                                    <p className="text-lg font-semibold text-[#003594] mt-1">
                                        {formatCurrencyAmount(summary.totalVatPurchase, purchaseCurrency)}
                                    </p>
                                </div>
                                <div className="p-4 bg-white/80 rounded-lg border border-purple-100">
                                    <Label className="text-sm text-gray-700">Items + VAT ({purchaseCurrency})</Label>
                                    <p className="text-lg font-semibold text-[#003594] mt-1">
                                        {formatCurrencyAmount(summary.totalPurchaseWithVat, purchaseCurrency)}
                                    </p>
                                </div>
                                <div className="p-4 bg-white/80 rounded-lg border border-purple-100">
                                    <Label className="text-sm text-gray-700">Items NPR (ex VAT)</Label>
                                    <p className="text-lg font-semibold text-[#003594] mt-1">
                                        {formatCurrencyAmount(summary.totalLineNpr, 'NPR')}
                                    </p>
                                </div>
                                <div className="p-4 bg-white/80 rounded-lg border border-purple-100">
                                    <Label className="text-sm text-gray-700">VAT (NPR)</Label>
                                    <p className="text-lg font-semibold text-[#003594] mt-1">
                                        {formatCurrencyAmount(summary.totalVatNpr, 'NPR')}
                                    </p>
                                </div>
                                <div className="p-4 bg-white/80 rounded-lg border border-purple-100">
                                    <Label className="text-sm text-gray-700">All lines (NPR)</Label>
                                    <p className="text-lg font-semibold text-[#003594] mt-1">
                                        {formatCurrencyAmount(summary.totalLinesNpr, 'NPR')}
                                    </p>
                                </div>
                                <div className="p-4 bg-white/80 rounded-lg border border-purple-100">
                                    <Label className="text-sm text-gray-700">Customs (NPR)</Label>
                                    <p className="text-lg font-semibold text-[#003594] mt-1">
                                        {formatCurrencyAmount(summary.customsNpr, 'NPR')}
                                    </p>
                                </div>
                                <div className="p-4 bg-white/80 rounded-lg border border-purple-100">
                                    <Label className="text-sm text-gray-700">Transport / other (NPR)</Label>
                                    <p className="text-lg font-semibold text-[#003594] mt-1">
                                        {formatCurrencyAmount(summary.transportNpr, 'NPR')}
                                    </p>
                                </div>
                                <div className="p-4 bg-white rounded-lg border-2 border-[#003594] col-span-2 md:col-span-1">
                                    <Label className="text-sm font-medium text-gray-700">Grand total (NPR)</Label>
                                    <p className="text-2xl font-bold text-[#003594] mt-1">
                                        {formatCurrencyAmount(summary.grandTotalNpr, 'NPR')}
                                    </p>
                                </div>
                            </div>
                            {isImport && (
                                <p className="text-xs text-gray-500 mt-3">
                                    Import PO: {display.poNumber || '—'} · Contract: {display.contractId || '—'} ·
                                    Customs: {display.customsNumber || '—'}
                                    {display.customsDate
                                        ? ` (${new Date(display.customsDate).toLocaleDateString()})`
                                        : ''}
                                </p>
                            )}
                        </div>
                    </div>

                    <DialogFooter className="flex justify-end gap-2 border-t pt-4">
                        {!isEditMode ? (
                            <>
                                <Button variant="outline" onClick={() => setIsRejectDialogOpen(true)}>
                                    Reject
                                </Button>
                                <Button
                                    className="bg-[#003594] hover:bg-[#003594]/90"
                                    onClick={() => onApprove()}
                                >
                                    Approve &amp; add to assets
                                </Button>
                                <Button className="bg-[#003594] hover:bg-[#003594]/90" onClick={handleEditClick}>
                                    Edit
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button variant="outline" onClick={() => { setIsEditMode(false); setEditData(null); }}>
                                    Cancel
                                </Button>
                                <Button className="bg-[#003594] hover:bg-[#003594]/90" onClick={handleSaveEdit}>
                                    Save changes
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
                <DialogContent className="bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-[#002a6e]">Reject Capital RRP</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2 py-2">
                        <Label>Reason for rejection</Label>
                        <Input
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder="Enter reason"
                            className="bg-white"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button className="bg-[#003594]" onClick={handleReject}>
                            Confirm rejection
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={itemToDelete !== null} onOpenChange={() => setItemToDelete(null)}>
                <DialogContent className="bg-white">
                    <DialogHeader>
                        <DialogTitle>Delete equipment line</DialogTitle>
                        <DialogDescription>This cannot be undone. Receive quantity will be restored.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setItemToDelete(null)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={async () => {
                                if (itemToDelete !== null && editData && onDeleteItem) {
                                    const updated = editData.items.filter((i) => i.id !== itemToDelete);
                                    setEditData({ ...editData, items: updated });
                                    await onDeleteItem(itemToDelete);
                                    setItemToDelete(null);
                                }
                            }}
                        >
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
