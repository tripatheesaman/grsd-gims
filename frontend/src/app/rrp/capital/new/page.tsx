'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Card, CardContent } from '@/components/Card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { CalendarIcon, Loader2, ArrowLeft } from 'lucide-react';
import { cn } from '@/utils/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { API } from '@/lib/api';
import { useAuthContext } from '@/context/AuthContext';

const RRP_PREFIX = 'C';
const RRP_NUMBER_PATTERN = /^C\d{3}$/i;

interface LatestRRPInfo {
    rrpNumber: string | null;
    rrpDate: string | null;
    nextRRPNumber: string;
}

interface RRPDates {
    rrpDate: Date | null;
    invoiceDate: Date | null;
    customsDate: Date | null;
    poDate: Date | null;
}

function toUTCDateString(date: Date | null): string | undefined {
    if (!date) return undefined;
    const localMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return new Date(Date.UTC(localMidnight.getFullYear(), localMidnight.getMonth(), localMidnight.getDate())).toISOString();
}

function isDateBefore(date1: Date, date2: Date): boolean {
    const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
    return d1 < d2;
}

function isDateAfter(date1: Date, date2: Date): boolean {
    const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
    return d1 > d2;
}

const parseParamDate = (value: string | null): Date | null => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
};

const resolveInspectionUserIdsFromParam = (
    inspectionUser: string,
    authorities: Array<{ id: number; name: string; designation: string }>
): string[] => {
    const value = inspectionUser.trim();
    if (!value) return [];
    if (/^[\d,\s]+$/.test(value)) {
        return value.split(',').map((s) => s.trim()).filter(Boolean);
    }
    const commaIdx = value.indexOf(',');
    if (commaIdx === -1) return [];
    const names = value
        .substring(0, commaIdx)
        .split(' / ')
        .map((s) => s.trim())
        .filter(Boolean);
    const designations = value
        .substring(commaIdx + 1)
        .split(' / ')
        .map((s) => s.trim())
        .filter(Boolean);
    const ids: string[] = [];
    names.forEach((name, index) => {
        const designation = designations[index] || designations[0] || '';
        const match = authorities.find((a) => a.name === name && a.designation === designation);
        if (match) ids.push(String(match.id));
    });
    return ids;
};

export default function NewCapitalRRPPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { showErrorToast } = useCustomToast();
    const { permissions } = useAuthContext();
    const rrpNumberFromParams = searchParams.get('rrpNumber');
    const notificationId = searchParams.get('notificationId');
    const isFromNotification = !!(rrpNumberFromParams && notificationId);
    const [isLoading, setIsLoading] = useState(true);
    const [config, setConfig] = useState<any>(null);
    const [previousRRPDate, setPreviousRRPDate] = useState<Date | null>(null);
    const [latestRRPInfo, setLatestRRPInfo] = useState<LatestRRPInfo | null>(null);
    const [rrpNumber, setRrpNumber] = useState(isFromNotification ? (rrpNumberFromParams || '') : '');
    const [dateError, setDateError] = useState<string | null>(null);
    const [allowManualRRPNumberEdit, setAllowManualRRPNumberEdit] = useState(false);
    const canEditRRPNumber = permissions?.includes('can_edit_rrp_number');
    const [dates, setDates] = useState<RRPDates>({
        rrpDate: parseParamDate(searchParams.get('rrpDate')),
        invoiceDate: parseParamDate(searchParams.get('invoiceDate')),
        customsDate: parseParamDate(searchParams.get('customsDate')),
        poDate: parseParamDate(searchParams.get('poDate')),
    });
    const [selectedSupplier, setSelectedSupplier] = useState(searchParams.get('supplier') || '');
    const [selectedInspectionUserIds, setSelectedInspectionUserIds] = useState<string[]>([]);
    const [invoiceNumber, setInvoiceNumber] = useState(searchParams.get('invoiceNumber') || '');
    const [poNumber, setPoNumber] = useState(searchParams.get('poNumber') || '');
    const [contractId, setContractId] = useState(searchParams.get('contractId') || '');
    const [customsNumber, setCustomsNumber] = useState(searchParams.get('customsNumber') || '');
    const [selectedCurrency, setSelectedCurrency] = useState(searchParams.get('currency') || 'NPR');
    const [forexRate, setForexRate] = useState(searchParams.get('forexRate') || '1');
    const [location, setLocation] = useState(searchParams.get('location') || '');
    const [customsAmountNpr, setCustomsAmountNpr] = useState(searchParams.get('customsAmountNpr') || '0');
    const [transportCharges, setTransportCharges] = useState(searchParams.get('transportCharges') || '0');

    const isImportPurchase = selectedCurrency !== 'NPR';

    const suppliers: string[] = useMemo(() => {
        const list = config?.supplier_list_capital ?? config?.supplier_list;
        return Array.isArray(list) ? list : [];
    }, [config]);

    useEffect(() => {
        if (permissions && !permissions.includes('can_create_assets_rrp')) {
            showErrorToast({ title: 'Error', message: "You don't have permission to create capital RRP", duration: 3000 });
            router.push('/dashboard');
        }
    }, [permissions, router, showErrorToast]);

    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            try {
                const [configRes, latestRes] = await Promise.all([
                    API.get('/api/capital-rrp/config'),
                    API.get('/api/capital-rrp/latest'),
                ]);
                setConfig(configRes.data);
                const latest = latestRes.data;
                const nextNumber = latest.nextRRPNumber || `${RRP_PREFIX}001`;
                setLatestRRPInfo({
                    rrpNumber: latest.rrpNumber ?? null,
                    rrpDate: latest.rrpDate ?? null,
                    nextRRPNumber: nextNumber,
                });
                if (!isFromNotification) {
                    setRrpNumber(nextNumber);
                }
                if (latest.rrpDate) setPreviousRRPDate(new Date(latest.rrpDate));
                else setPreviousRRPDate(null);
                const locations: string[] = configRes.data?.asset_settings?.locations || [];
                if (!isFromNotification && locations.length && !searchParams.get('location')) {
                    setLocation(locations[0]);
                }
                const inspectionParam = searchParams.get('inspectionUser');
                if (isFromNotification && inspectionParam) {
                    const authorities = configRes.data?.inspection_user_details || [];
                    const ids = resolveInspectionUserIdsFromParam(inspectionParam, authorities);
                    if (ids.length) setSelectedInspectionUserIds(ids);
                }
            }
            catch {
                const fallback = `${RRP_PREFIX}001`;
                setLatestRRPInfo({ rrpNumber: null, rrpDate: null, nextRRPNumber: fallback });
                setRrpNumber(fallback);
                setPreviousRRPDate(null);
            }
            finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

    useEffect(() => {
        if (!isFromNotification && latestRRPInfo?.nextRRPNumber && !allowManualRRPNumberEdit) {
            setRrpNumber(latestRRPInfo.nextRRPNumber);
        }
    }, [latestRRPInfo?.nextRRPNumber, allowManualRRPNumberEdit, isFromNotification]);

    useEffect(() => {
        if (dateError) {
            showErrorToast({ title: 'Error', message: dateError, duration: 3000 });
            setDateError(null);
        }
    }, [dateError, showErrorToast]);

    useEffect(() => {
        if (selectedCurrency === 'NPR') {
            setForexRate('1');
        }
    }, [selectedCurrency]);

    const handleDateChange = (field: keyof RRPDates, date: Date | null) => {
        setDates((prev) => {
            const next = { ...prev, [field]: date };
            if (field === 'rrpDate' && date) {
                if (previousRRPDate && isDateBefore(date, previousRRPDate)) {
                    setDateError('RRP date cannot be less than the previous capital RRP date');
                    return prev;
                }
                next.invoiceDate = null;
                next.customsDate = null;
                next.poDate = null;
            }
            if (field === 'invoiceDate' && date && next.rrpDate && isDateAfter(date, next.rrpDate)) {
                setDateError('Invoice date cannot be greater than RRP date');
                return prev;
            }
            if (field === 'customsDate' && date && next.rrpDate && isDateAfter(date, next.rrpDate)) {
                setDateError('Customs date cannot be greater than RRP date');
                return prev;
            }
            if (field === 'poDate' && date && next.rrpDate && isDateAfter(date, next.rrpDate)) {
                setDateError('PO date cannot be greater than RRP date');
                return prev;
            }
            return next;
        });
    };

    const toggleInspectionUser = (id: string, checked: boolean) => {
        setSelectedInspectionUserIds((prev) =>
            checked ? [...prev, id] : prev.filter((x) => x !== id)
        );
    };

    const handleNext = async () => {
        if (!dates.rrpDate || !dates.invoiceDate || !selectedSupplier || !invoiceNumber || !rrpNumber || !location) {
            showErrorToast({ title: 'Error', message: 'Please fill in all required fields', duration: 3000 });
            return;
        }
        if (!suppliers.includes(selectedSupplier)) {
            showErrorToast({ title: 'Error', message: 'Please select a valid Capital (RRCP) supplier', duration: 3000 });
            return;
        }
        if (selectedInspectionUserIds.length === 0) {
            showErrorToast({ title: 'Error', message: 'Select at least one inspection user', duration: 3000 });
            return;
        }
        if (isImportPurchase) {
            if (!poNumber || !contractId || !customsNumber || !dates.customsDate || !dates.poDate || !forexRate) {
                showErrorToast({ title: 'Error', message: 'Please fill in all import purchase fields', duration: 3000 });
                return;
            }
            const fx = parseFloat(forexRate);
            if (!Number.isFinite(fx) || fx <= 0) {
                showErrorToast({ title: 'Error', message: 'Forex rate must be greater than zero', duration: 3000 });
                return;
            }
        }
        if (!/^C\d{3}$/i.test(rrpNumber)) {
            showErrorToast({
                title: 'Error',
                message: `Invalid RRP number format. Must be ${RRP_PREFIX}001 (sequence resets each fiscal year)`,
                duration: 3000,
            });
            return;
        }
        if (previousRRPDate && dates.rrpDate && isDateBefore(dates.rrpDate, previousRRPDate)) {
            showErrorToast({ title: 'Error', message: 'RRP date cannot be less than the previous capital RRP date', duration: 3000 });
            return;
        }
        if (dates.rrpDate && dates.invoiceDate && isDateAfter(dates.invoiceDate, dates.rrpDate)) {
            showErrorToast({ title: 'Error', message: 'Invoice date cannot be greater than RRP date', duration: 3000 });
            return;
        }
        if (isImportPurchase) {
            if (dates.customsDate && dates.rrpDate && isDateAfter(dates.customsDate, dates.rrpDate)) {
                showErrorToast({ title: 'Error', message: 'Customs date cannot be greater than RRP date', duration: 3000 });
                return;
            }
            if (dates.poDate && dates.rrpDate && isDateAfter(dates.poDate, dates.rrpDate)) {
                showErrorToast({ title: 'Error', message: 'PO date cannot be greater than RRP date', duration: 3000 });
                return;
            }
        }

        try {
            await API.post('/api/capital-rrp/validate-step1', {
                rrp_date: toUTCDateString(dates.rrpDate),
                invoice_date: toUTCDateString(dates.invoiceDate),
                invoice_number: invoiceNumber,
                supplier: selectedSupplier,
                inspection_user: selectedInspectionUserIds.join(','),
                location,
                currency: selectedCurrency,
                forex_rate: isImportPurchase ? parseFloat(forexRate) : 1,
                customs_amount_npr: parseFloat(customsAmountNpr) || 0,
                transportation_other_charges: parseFloat(transportCharges) || 0,
                po_number: isImportPurchase ? poNumber : undefined,
                contract_identification_number: isImportPurchase ? contractId : undefined,
                customs_number: isImportPurchase ? customsNumber : undefined,
                po_date: isImportPurchase ? toUTCDateString(dates.poDate) : undefined,
                customs_date: isImportPurchase ? toUTCDateString(dates.customsDate) : undefined,
            });
        }
        catch (err: unknown) {
            const message = err && typeof err === 'object' && 'response' in err
                ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
                : 'Validation failed';
            showErrorToast({ title: 'Error', message: message || 'Validation failed', duration: 3000 });
            return;
        }

        let verifiedNumber = rrpNumber;
        try {
            const verifyRes = await API.get(`/api/capital-rrp/verify/${rrpNumber}?date=${toUTCDateString(dates.rrpDate)}`);
            const responseData = verifyRes.data || {};
            const isEmptyResponse = Object.keys(responseData).length === 0;
            if (isEmptyResponse) {
                if (previousRRPDate && dates.rrpDate && isDateBefore(dates.rrpDate, previousRRPDate)) {
                    setDateError('RRP date cannot be less than the previous capital RRP date');
                    return;
                }
                if (!allowManualRRPNumberEdit && latestRRPInfo?.nextRRPNumber) {
                    setRrpNumber(latestRRPInfo.nextRRPNumber);
                }
            }
            verifiedNumber = (responseData.rrpNumber || rrpNumber).toString();
        }
        catch (err: unknown) {
            const message = err && typeof err === 'object' && 'response' in err
                ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
                : 'Failed to verify RRP number';
            showErrorToast({ title: 'Error', message: message || 'Failed to verify RRP number', duration: 3000 });
            return;
        }

        const queryParams = new URLSearchParams({
            rrpDate: toUTCDateString(dates.rrpDate)!,
            invoiceDate: toUTCDateString(dates.invoiceDate)!,
            supplier: selectedSupplier,
            inspectionUser: selectedInspectionUserIds.join(','),
            invoiceNumber,
            rrpNumber: verifiedNumber,
            location,
            currency: selectedCurrency,
            forexRate: isImportPurchase ? forexRate : '1',
            customsAmountNpr,
            transportCharges,
        });
        if (isImportPurchase) {
            queryParams.set('poDate', toUTCDateString(dates.poDate)!);
            queryParams.set('customsDate', toUTCDateString(dates.customsDate)!);
            queryParams.set('poNumber', poNumber);
            queryParams.set('contractId', contractId);
            queryParams.set('customsNumber', customsNumber);
        }
        router.push(`/rrp/capital/items?${queryParams.toString()}`);
    };

    const DatePicker = ({
        label,
        field,
        required,
        disabled,
    }: {
        label: string;
        field: keyof RRPDates;
        required?: boolean;
        disabled?: boolean;
    }) => (
        <div>
            <Label className="text-[#003594]">{label}{required ? ' *' : ''}</Label>
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        disabled={disabled}
                        className={cn('mt-1 h-10 w-full justify-start border-[#002a6e]/15 bg-white', !dates[field] && 'text-gray-500')}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4 text-[#003594]" />
                        {dates[field] ? format(dates[field]!, 'PPP') : 'Select date'}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto overflow-hidden bg-white p-2" align="start">
                    <Calendar value={dates[field] || undefined} onChange={(d) => handleDateChange(field, d ?? null)} />
                </PopoverContent>
            </Popover>
        </div>
    );

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-[#003594]" />
            </div>
        );
    }

    const currencies: string[] = config?.currency_list || ['NPR', 'USD'];
    const locations: string[] = config?.asset_settings?.locations || [];
    const authorities = config?.inspection_user_details || [];

    return (
        <div className="min-h-screen bg-[#f6f8fc]">
            <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/rrp')} className="text-[#003594]">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
                            Capital RRP (RRCP)
                        </h1>
                        <p className="text-sm text-gray-600 mt-1">
                            Receiving receipt for capital equipment — RRCP numbering {RRP_PREFIX}001, {RRP_PREFIX}002, …
                        </p>
                    </div>
                </div>

                {latestRRPInfo && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                        <h3 className="text-sm font-medium text-blue-800">Latest Capital RRP</h3>
                        <p className="mt-1 text-sm text-blue-600">
                            <span className="mr-4">
                                Number: <span className="font-semibold">{latestRRPInfo.rrpNumber ?? 'N/A'}</span>
                            </span>
                            <span className="mr-4">
                                Date:{' '}
                                <span className="font-semibold">
                                    {latestRRPInfo.rrpDate ? format(new Date(latestRRPInfo.rrpDate), 'PPP') : 'N/A'}
                                </span>
                            </span>
                            <span>
                                Next: <span className="font-semibold">{latestRRPInfo.nextRRPNumber}</span>
                            </span>
                        </p>
                    </div>
                )}

                <Card className="border-[#002a6e]/10 shadow-sm">
                    <CardContent className="p-6 grid gap-6 md:grid-cols-2">
                        <div>
                            <div className="flex items-center justify-between">
                                <Label className="text-[#003594]">RRP Number *</Label>
                                {canEditRRPNumber && (
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            id="manual-capital-rrp-number"
                                            checked={allowManualRRPNumberEdit}
                                            onCheckedChange={(checked) => {
                                                setAllowManualRRPNumberEdit(checked);
                                                if (!checked && latestRRPInfo?.nextRRPNumber) {
                                                    setRrpNumber(latestRRPInfo.nextRRPNumber);
                                                }
                                            }}
                                        />
                                        <Label htmlFor="manual-capital-rrp-number" className="text-xs font-normal text-gray-600">
                                            Enable manual edit
                                        </Label>
                                    </div>
                                )}
                            </div>
                            <Input
                                className="mt-1 border-[#002a6e]/15 disabled:bg-gray-100 disabled:text-gray-500"
                                value={rrpNumber}
                                disabled={!allowManualRRPNumberEdit}
                                onChange={(e) => {
                                    if (!allowManualRRPNumberEdit) return;
                                    const value = e.target.value.toUpperCase();
                                    if (value.match(/^C?\d{0,3}(T\d*)?$/)) {
                                        setRrpNumber(value);
                                    }
                                }}
                                placeholder={`Auto-generated (e.g., ${RRP_PREFIX}001)`}
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                Format: {RRP_PREFIX} followed by 3 digits (e.g., {RRP_PREFIX}001). Numbering restarts each fiscal year.
                            </p>
                            {!canEditRRPNumber && (
                                <p className="text-xs text-gray-400">Contact an administrator if you need to edit RRP numbers.</p>
                            )}
                        </div>
                        <DatePicker label="RRP Date" field="rrpDate" required />
                        <DatePicker label="Invoice Date" field="invoiceDate" required disabled={!dates.rrpDate} />
                        <div>
                            <Label className="text-[#003594]">Supplier *</Label>
                            <Select value={selectedSupplier} onValueChange={setSelectedSupplier} disabled={suppliers.length === 0}>
                                <SelectTrigger className="mt-1 border-[#002a6e]/15 bg-white">
                                    <SelectValue placeholder={suppliers.length === 0 ? 'Add RRCP suppliers in Settings → RRP' : 'Select supplier'} />
                                </SelectTrigger>
                                <SelectContent className="bg-white">
                                    {suppliers.map((s: string) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            {suppliers.length === 0 && (
                                <p className="mt-1 text-xs text-amber-700">Configure Capital (RRCP) suppliers under Settings → RRP.</p>
                            )}
                        </div>
                        <div className="md:col-span-2">
                            <Label className="text-[#003594]">Inspection users *</Label>
                            <p className="mt-1 text-xs text-gray-500">Select one or more users (same as configured RRP inspection authorities).</p>
                            <div className="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-md border border-[#002a6e]/15 bg-white p-3">
                                {authorities.length === 0 ? (
                                    <p className="text-sm text-gray-500">No inspection users configured in Settings → RRP.</p>
                                ) : (
                                    authorities.map((a: { id: number; name: string; designation: string }) => (
                                        <label
                                            key={a.id}
                                            className="flex cursor-pointer items-start gap-2 text-sm text-gray-800"
                                        >
                                            <input
                                                type="checkbox"
                                                className="mt-1 h-4 w-4 rounded border-gray-300 text-[#003594]"
                                                checked={selectedInspectionUserIds.includes(String(a.id))}
                                                onChange={(e) => toggleInspectionUser(String(a.id), e.target.checked)}
                                            />
                                            <span>
                                                <span className="font-medium">{a.name}</span>
                                                {a.designation ? (
                                                    <span className="text-gray-600"> — {a.designation}</span>
                                                ) : null}
                                            </span>
                                        </label>
                                    ))
                                )}
                            </div>
                        </div>
                        <div>
                            <Label className="text-[#003594]">Invoice number *</Label>
                            <Input className="mt-1 border-[#002a6e]/15" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
                        </div>
                        <div>
                            <Label className="text-[#003594]">Purchase currency *</Label>
                            <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
                                <SelectTrigger className="mt-1 border-[#002a6e]/15 bg-white"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {currencies.map((c: string) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="text-[#003594]">Forex rate {isImportPurchase ? '*' : ''}</Label>
                            <Input
                                type="number"
                                step="any"
                                className="mt-1 border-[#002a6e]/15"
                                value={forexRate}
                                onChange={(e) => setForexRate(e.target.value)}
                                disabled={!isImportPurchase}
                            />
                        </div>
                        <div>
                            <Label className="text-[#003594]">Location *</Label>
                            <Select value={location} onValueChange={setLocation}>
                                <SelectTrigger className="mt-1 border-[#002a6e]/15 bg-white"><SelectValue placeholder="Select location" /></SelectTrigger>
                                <SelectContent>
                                    {locations.map((l: string) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="text-[#003594]">Customs amount (NPR)</Label>
                            <Input type="number" step="any" className="mt-1 border-[#002a6e]/15" value={customsAmountNpr} onChange={(e) => setCustomsAmountNpr(e.target.value)} />
                        </div>
                        <div className="md:col-span-2">
                            <Label className="text-[#003594]">Transportation & other (NPR)</Label>
                            <Input type="number" step="any" className="mt-1 border-[#002a6e]/15" value={transportCharges} onChange={(e) => setTransportCharges(e.target.value)} />
                        </div>
                    </CardContent>
                </Card>

                {isImportPurchase && (
                    <Card className="border-[#002a6e]/10 shadow-sm">
                        <CardContent className="p-6 grid gap-4 md:grid-cols-2">
                            <p className="md:col-span-2 text-sm font-medium text-[#003594]">
                                Import purchase details (required when currency is not NPR)
                            </p>
                            <DatePicker label="PO Date" field="poDate" required disabled={!dates.rrpDate} />
                            <DatePicker label="Customs Date" field="customsDate" required disabled={!dates.rrpDate} />
                            <div>
                                <Label className="text-[#003594]">PO number *</Label>
                                <Input className="mt-1 border-[#002a6e]/15" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
                            </div>
                            <div>
                                <Label className="text-[#003594]">Contract ID *</Label>
                                <Input className="mt-1 border-[#002a6e]/15" value={contractId} onChange={(e) => setContractId(e.target.value)} />
                            </div>
                            <div className="md:col-span-2">
                                <Label className="text-[#003594]">Customs number *</Label>
                                <Input className="mt-1 border-[#002a6e]/15" value={customsNumber} onChange={(e) => setCustomsNumber(e.target.value)} />
                            </div>
                        </CardContent>
                    </Card>
                )}

                <Button className="h-12 w-full rounded-xl bg-[#003594] text-base font-semibold hover:bg-[#d2293b]" onClick={handleNext}>
                    Next: Select equipment
                </Button>
            </div>
        </div>
    );
}
