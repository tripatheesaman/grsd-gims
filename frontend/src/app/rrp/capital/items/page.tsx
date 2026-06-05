'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { API } from '@/lib/api';
import { useCustomToast } from '@/components/ui/custom-toast';
import { useAuthContext } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowLeft, Plus, Trash2, Pencil } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';

interface ReceiveLine {
    id: number;
    model_name: string;
    remaining_quantity: number;
    receive_date: string;
}

interface CartItem {
    asset_receive_id: number;
    model_name: string;
    asset_type_id: number;
    equipment_name: string;
    servicability_status: string;
    purchase_currency: string;
    equipment_manufacturer_name: string;
    model_number: string;
    series: string;
    engine_number: string;
    engine_model_number: string;
    serial_number: string;
    transmission_model: string;
    vin_number: string;
    weight: string;
    weight_unit: string;
    size: string;
    size_unit: string;
    quantity: number;
    purchase_amount: number;
    equipment_code: string;
    unit: string;
    vat: boolean;
}

export default function CapitalRRPItemsPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, permissions } = useAuthContext();
    const { showErrorToast, showSuccessToast } = useCustomToast();
    const [isLoading, setIsLoading] = useState(true);
    const [receiveLines, setReceiveLines] = useState<ReceiveLine[]>([]);
    const [assetTypes, setAssetTypes] = useState<{ id: number; name: string }[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [settings, setSettings] = useState<Record<string, any>>({});
    const [vatRate, setVatRate] = useState(0);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [selectedLine, setSelectedLine] = useState<ReceiveLine | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingCartIndex, setEditingCartIndex] = useState<number | null>(null);
    const [draft, setDraft] = useState<Partial<CartItem>>({});

    const rrpDate = searchParams.get('rrpDate');
    const canCreateCapitalRrp = permissions?.includes('can_create_assets_rrp');

    useEffect(() => {
        if (!canCreateCapitalRrp) {
            setIsLoading(false);
            return;
        }
        const load = async () => {
            try {
                const [itemsRes, typesRes, configRes] = await Promise.all([
                    API.get('/api/capital-rrp/items', { params: rrpDate ? { rrpDate } : {} }),
                    API.get('/api/asset-types'),
                    API.get('/api/capital-rrp/config'),
                ]);
                setReceiveLines(itemsRes.data || []);
                setAssetTypes(typesRes.data || []);
                setSettings(configRes.data?.asset_settings || {});
                setVatRate(Number(configRes.data?.vat_rate) || 0);
            }
            catch {
                showErrorToast({ title: 'Error', message: 'Failed to load receive items', duration: 3000 });
            }
            finally {
                setIsLoading(false);
            }
        };
        load();
    }, [rrpDate, showErrorToast, canCreateCapitalRrp]);

    if (permissions && !canCreateCapitalRrp) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
                <h1 className="text-lg font-semibold text-[#003594]">Access Denied</h1>
                <p className="text-sm text-gray-600">You need the &quot;Create Assets RRP&quot; permission.</p>
            </div>
        );
    }

    const restoreReceiveLine = (item: CartItem) => {
        setReceiveLines((lines) => {
            const existing = lines.find((l) => l.id === item.asset_receive_id);
            if (existing) {
                return lines.map((l) =>
                    l.id === item.asset_receive_id
                        ? { ...l, remaining_quantity: Number(l.remaining_quantity) + Number(item.quantity) }
                        : l
                );
            }
            return [
                ...lines,
                {
                    id: item.asset_receive_id,
                    model_name: item.model_name,
                    remaining_quantity: Number(item.quantity),
                    receive_date: '',
                },
            ];
        });
    };

    const closeDialog = () => {
        setIsDialogOpen(false);
        setSelectedLine(null);
        setEditingCartIndex(null);
        setDraft({});
    };

    const openLine = (line: ReceiveLine) => {
        const receiveQty = Number(line.remaining_quantity);
        if (!Number.isFinite(receiveQty) || receiveQty <= 0) {
            showErrorToast({ title: 'Error', message: 'No remaining quantity on this receive line', duration: 3000 });
            return;
        }
        setEditingCartIndex(null);
        setSelectedLine(line);
        setDraft({
            asset_receive_id: line.id,
            model_name: line.model_name,
            equipment_name: line.model_name,
            model_number: line.model_name,
            purchase_currency: searchParams.get('currency') || 'USD',
            quantity: receiveQty,
            unit: (settings.quantity_units || ['EA'])[0],
            servicability_status: (settings.servicability_statuses || [''])[0] || '',
            weight_unit: (settings.weight_units || ['KG'])[0],
            size_unit: (settings.size_units || ['M'])[0],
            asset_type_id: settings.default_asset_type_id || assetTypes[0]?.id,
            vat: false,
        });
        setIsDialogOpen(true);
    };

    const openEditCartItem = (index: number) => {
        const item = cart[index];
        if (!item) return;
        setEditingCartIndex(index);
        setSelectedLine({
            id: item.asset_receive_id,
            model_name: item.model_name,
            remaining_quantity: item.quantity,
            receive_date: '',
        });
        setDraft({ ...item });
        setIsDialogOpen(true);
    };

    const removeFromCart = (index: number) => {
        const removed = cart[index];
        if (removed) {
            restoreReceiveLine(removed);
        }
        setCart((p) => p.filter((_, i) => i !== index));
        if (editingCartIndex === index) {
            closeDialog();
        }
    };

    const buildCartItem = (): CartItem | null => {
        if (!selectedLine || !draft.equipment_code?.trim() || !draft.serial_number?.trim()) {
            showErrorToast({ title: 'Error', message: 'GE number and serial number are required', duration: 3000 });
            return null;
        }
        const qty = Number(selectedLine.remaining_quantity);
        if (!Number.isFinite(qty) || qty <= 0) {
            showErrorToast({ title: 'Error', message: 'No remaining quantity on this receive line', duration: 3000 });
            return null;
        }
        const code = String(draft.equipment_code).trim();
        const duplicate = cart.findIndex(
            (c, i) => c.equipment_code === code && i !== editingCartIndex
        );
        if (duplicate >= 0) {
            showErrorToast({ title: 'Error', message: 'This GE number is already in the cart', duration: 3000 });
            return null;
        }
        return {
            asset_receive_id: selectedLine.id,
            model_name: selectedLine.model_name,
            asset_type_id: Number(draft.asset_type_id) || assetTypes[0]?.id,
            equipment_name: String(draft.equipment_name || selectedLine.model_name),
            servicability_status: String(draft.servicability_status || ''),
            purchase_currency: String(draft.purchase_currency || searchParams.get('currency') || 'NPR'),
            equipment_manufacturer_name: String(draft.equipment_manufacturer_name || ''),
            model_number: String(draft.model_number || ''),
            series: String(draft.series || ''),
            engine_number: String(draft.engine_number || ''),
            engine_model_number: String(draft.engine_model_number || ''),
            serial_number: String(draft.serial_number || ''),
            transmission_model: String(draft.transmission_model || ''),
            vin_number: String(draft.vin_number || ''),
            weight: String(draft.weight || ''),
            weight_unit: String(draft.weight_unit || ''),
            size: String(draft.size || ''),
            size_unit: String(draft.size_unit || ''),
            quantity: qty,
            purchase_amount: Number(draft.purchase_amount) || 0,
            equipment_code: code,
            unit: String(draft.unit || 'EA'),
            vat: Boolean(draft.vat),
        };
    };

    const saveToCart = () => {
        const item = buildCartItem();
        if (!item || !selectedLine) return;

        if (editingCartIndex !== null) {
            setCart((p) => p.map((c, i) => (i === editingCartIndex ? item : c)));
            showSuccessToast({ title: 'Updated', message: 'Cart item updated', duration: 2000 });
            closeDialog();
            return;
        }

        const qty = item.quantity;
        setCart((p) => [...p, item]);
        setReceiveLines((lines) =>
            lines
                .map((l) =>
                    l.id === selectedLine.id
                        ? { ...l, remaining_quantity: Number(l.remaining_quantity) - qty }
                        : l
                )
                .filter((l) => Number(l.remaining_quantity) > 0)
        );
        showSuccessToast({ title: 'Added', message: 'Item added to cart', duration: 2000 });
        closeDialog();
    };

    const handleSubmit = async () => {
        if (!user?.UserInfo?.username) return;
        if (cart.length === 0) {
            showErrorToast({ title: 'Error', message: 'Add at least one equipment item', duration: 3000 });
            return;
        }
        setIsSubmitting(true);
        try {
            await API.post('/api/capital-rrp/create', {
                rrp_number: searchParams.get('rrpNumber'),
                rrp_date: searchParams.get('rrpDate'),
                invoice_date: searchParams.get('invoiceDate'),
                invoice_number: searchParams.get('invoiceNumber'),
                po_number: searchParams.get('poNumber'),
                contract_identification_number: searchParams.get('contractId'),
                po_date: searchParams.get('poDate'),
                customs_date: searchParams.get('customsDate'),
                customs_number: searchParams.get('customsNumber'),
                supplier: searchParams.get('supplier'),
                forex_rate: parseFloat(searchParams.get('forexRate') || '1'),
                currency: searchParams.get('currency'),
                location: searchParams.get('location'),
                vat_rate: vatRate,
                customs_amount_npr: parseFloat(searchParams.get('customsAmountNpr') || '0'),
                transportation_other_charges: parseFloat(searchParams.get('transportCharges') || '0'),
                inspection_user: searchParams.get('inspectionUser'),
                created_by: user.UserInfo.username,
                items: cart.map((item) => ({
                    asset_receive_id: item.asset_receive_id,
                    asset_type_id: item.asset_type_id,
                    equipment_name: item.equipment_name,
                    servicability_status: item.servicability_status,
                    purchase_currency: item.purchase_currency,
                    equipment_manufacturer_name: item.equipment_manufacturer_name,
                    model_number: item.model_number,
                    series: item.series || undefined,
                    engine_number: item.engine_number || undefined,
                    engine_model_number: item.engine_model_number || undefined,
                    serial_number: item.serial_number,
                    transmission_model: item.transmission_model || undefined,
                    vin_number: item.vin_number || undefined,
                    weight: item.weight || undefined,
                    weight_unit: item.weight_unit || undefined,
                    size: item.size || undefined,
                    size_unit: item.size_unit || undefined,
                    quantity: item.quantity,
                    purchase_amount: item.purchase_amount,
                    equipment_code: item.equipment_code,
                    unit: item.unit,
                    vat_status: item.vat,
                })),
            });
            showSuccessToast({
                title: 'Submitted',
                message: 'Capital RRP submitted for approval. Assets will be added after approval.',
                duration: 5000,
            });
            router.push('/rrp');
        }
        catch (err: unknown) {
            const message = err && typeof err === 'object' && 'response' in err
                ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
                : 'Failed to create capital RRP';
            showErrorToast({ title: 'Error', message: message || 'Failed', duration: 5000 });
        }
        finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-[#003594]" />
            </div>
        );
    }

    const servicabilityOptions: string[] = settings.servicability_statuses || [];
    const weightUnits: string[] = settings.weight_units || ['KG'];
    const sizeUnits: string[] = settings.size_units || ['M'];
    const qtyUnits: string[] = settings.quantity_units || ['EA'];

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto px-4 py-8 space-y-6">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <h1 className="text-2xl font-bold text-[#003594]">Capital RRP — Equipment</h1>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Available receives (RRP pending)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Model</TableHead>
                                    <TableHead>Remaining</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {receiveLines.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center text-gray-500">
                                            No approved asset receives pending RRP
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    receiveLines.map((line) => (
                                        <TableRow key={line.id} className="cursor-pointer hover:bg-slate-50" onDoubleClick={() => openLine(line)}>
                                            <TableCell>{line.model_name}</TableCell>
                                            <TableCell>{line.remaining_quantity}</TableCell>
                                            <TableCell>{line.receive_date}</TableCell>
                                            <TableCell>
                                                <Button size="sm" variant="outline" onClick={() => openLine(line)}>
                                                    <Plus className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {cart.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Cart ({cart.length})</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto rounded-lg border border-[#002a6e]/10">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-[#003594]/5">
                                            <TableHead className="text-[#003594]">GE No.</TableHead>
                                            <TableHead className="text-[#003594]">Equipment</TableHead>
                                            <TableHead className="text-[#003594]">Serial</TableHead>
                                            <TableHead className="text-[#003594] text-right">Qty</TableHead>
                                            <TableHead className="text-[#003594] text-right">Amount</TableHead>
                                            <TableHead className="text-[#003594]">VAT</TableHead>
                                            <TableHead className="text-[#003594]">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {cart.map((c, i) => (
                                            <TableRow key={`${c.asset_receive_id}-${c.equipment_code}-${i}`}>
                                                <TableCell className="font-medium">{c.equipment_code}</TableCell>
                                                <TableCell>{c.equipment_name}</TableCell>
                                                <TableCell>{c.serial_number}</TableCell>
                                                <TableCell className="text-right">{c.quantity}</TableCell>
                                                <TableCell className="text-right">{c.purchase_amount}</TableCell>
                                                <TableCell>{c.vat ? `Yes (${vatRate}%)` : 'No'}</TableCell>
                                                <TableCell>
                                                    <div className="flex gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            title="Edit"
                                                            onClick={() => openEditCartItem(i)}
                                                        >
                                                            <Pencil className="h-4 w-4 text-[#003594]" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            title="Remove"
                                                            onClick={() => removeFromCart(i)}
                                                        >
                                                            <Trash2 className="h-4 w-4 text-red-600" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                            <Button className="mt-4 w-full bg-[#003594]" disabled={isSubmitting} onClick={handleSubmit}>
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                Submit Capital RRP
                            </Button>
                        </CardContent>
                    </Card>
                )}

                <Dialog
                    open={isDialogOpen}
                    onOpenChange={(open) => {
                        if (!open) closeDialog();
                    }}
                >
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white text-gray-900">
                        <DialogHeader>
                            <DialogTitle className="text-[#003594]">
                                {editingCartIndex !== null ? 'Edit equipment' : 'Add equipment'} — {selectedLine?.model_name}
                            </DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-3 md:grid-cols-2 py-2 text-gray-900">
                            <div>
                                <Label className="text-[#003594]">Asset type *</Label>
                                <Select value={String(draft.asset_type_id || '')} onValueChange={(v) => setDraft((d) => ({ ...d, asset_type_id: Number(v) }))}>
                                    <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-white">
                                        {assetTypes.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-[#003594]">GE Number *</Label>
                                <Input value={draft.equipment_code || ''} onChange={(e) => setDraft((d) => ({ ...d, equipment_code: e.target.value }))} />
                            </div>
                            <div>
                                <Label>Equipment name</Label>
                                <Input value={draft.equipment_name || ''} onChange={(e) => setDraft((d) => ({ ...d, equipment_name: e.target.value }))} />
                            </div>
                            <div>
                                <Label>Manufacturer *</Label>
                                <Input value={draft.equipment_manufacturer_name || ''} onChange={(e) => setDraft((d) => ({ ...d, equipment_manufacturer_name: e.target.value }))} />
                            </div>
                            <div>
                                <Label>Model number *</Label>
                                <Input value={draft.model_number || ''} onChange={(e) => setDraft((d) => ({ ...d, model_number: e.target.value }))} />
                            </div>
                            <div>
                                <Label>Serial number *</Label>
                                <Input value={draft.serial_number || ''} onChange={(e) => setDraft((d) => ({ ...d, serial_number: e.target.value }))} />
                            </div>
                            <div>
                                <Label>Series</Label>
                                <Input value={draft.series || ''} onChange={(e) => setDraft((d) => ({ ...d, series: e.target.value }))} />
                            </div>
                            <div>
                                <Label>Engine number</Label>
                                <Input value={draft.engine_number || ''} onChange={(e) => setDraft((d) => ({ ...d, engine_number: e.target.value }))} />
                            </div>
                            <div>
                                <Label>Engine model</Label>
                                <Input value={draft.engine_model_number || ''} onChange={(e) => setDraft((d) => ({ ...d, engine_model_number: e.target.value }))} />
                            </div>
                            <div>
                                <Label>Transmission model</Label>
                                <Input value={draft.transmission_model || ''} onChange={(e) => setDraft((d) => ({ ...d, transmission_model: e.target.value }))} />
                            </div>
                            <div>
                                <Label>Chassis (VIN)</Label>
                                <Input value={draft.vin_number || ''} onChange={(e) => setDraft((d) => ({ ...d, vin_number: e.target.value }))} />
                            </div>
                            <div>
                                <Label>Servicability *</Label>
                                <Select value={draft.servicability_status || ''} onValueChange={(v) => setDraft((d) => ({ ...d, servicability_status: v }))}>
                                    <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-white">
                                        {servicabilityOptions.map((s: string) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-[#003594]">Quantity (from receive)</Label>
                                <Input
                                    type="text"
                                    readOnly
                                    disabled
                                    className="bg-gray-50 text-gray-900"
                                    value={String(draft.quantity ?? selectedLine?.remaining_quantity ?? '')}
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Set when the asset was received — not editable during RRP.
                                </p>
                            </div>
                            <div>
                                <Label>Unit *</Label>
                                <Select value={draft.unit || 'EA'} onValueChange={(v) => setDraft((d) => ({ ...d, unit: v }))}>
                                    <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-white">
                                        {qtyUnits.map((u: string) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>Purchase amount (per unit) *</Label>
                                <Input type="number" step="any" value={draft.purchase_amount ?? ''} onChange={(e) => setDraft((d) => ({ ...d, purchase_amount: Number(e.target.value) }))} />
                            </div>
                            <div className="flex items-center space-x-2 md:col-span-2">
                                <Switch
                                    checked={Boolean(draft.vat)}
                                    onCheckedChange={(checked) => setDraft((d) => ({ ...d, vat: checked }))}
                                    className="data-[state=checked]:bg-[#003594]"
                                />
                                <Label className="text-sm font-medium text-[#003594]">Include VAT</Label>
                                {vatRate > 0 && (
                                    <span className="text-xs text-gray-500">({vatRate}% from RRP settings)</span>
                                )}
                            </div>
                            <div>
                                <Label>Weight</Label>
                                <div className="flex gap-2">
                                    <Input value={draft.weight || ''} onChange={(e) => setDraft((d) => ({ ...d, weight: e.target.value }))} />
                                    <Select value={draft.weight_unit || ''} onValueChange={(v) => setDraft((d) => ({ ...d, weight_unit: v }))}>
                                        <SelectTrigger className="w-24 bg-white"><SelectValue /></SelectTrigger>
                                        <SelectContent className="bg-white">{weightUnits.map((u: string) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div>
                                <Label>Size</Label>
                                <div className="flex gap-2">
                                    <Input value={draft.size || ''} onChange={(e) => setDraft((d) => ({ ...d, size: e.target.value }))} />
                                    <Select value={draft.size_unit || ''} onValueChange={(v) => setDraft((d) => ({ ...d, size_unit: v }))}>
                                        <SelectTrigger className="w-24 bg-white"><SelectValue /></SelectTrigger>
                                        <SelectContent className="bg-white">{sizeUnits.map((u: string) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                            <Button variant="outline" className="flex-1" onClick={closeDialog}>
                                Cancel
                            </Button>
                            <Button className="flex-1 bg-[#003594]" onClick={saveToCart}>
                                {editingCartIndex !== null ? 'Save changes' : 'Add to cart'}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}
