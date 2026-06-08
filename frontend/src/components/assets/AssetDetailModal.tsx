'use client';

import type { ComponentType, ReactNode } from 'react';
import {
    Asset,
    AssetCapitalRrpLine,
    PROPERTY_DISPLAY_LABELS,
} from '@/types/asset';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import Image from 'next/image';
import { cn } from '@/utils/utils';
import { resolveImageUrl } from '@/lib/urls';
import {
    formatNprAmount,
    formatUsdAmount,
    getAssetOriginalPurchaseCostNpr,
    getAssetBookValueNpr,
    getAssetOriginalInsuranceAmountUsd,
    getAssetInsuranceBookValueUsd,
} from '@/utils/assetValue';
import {
    Banknote,
    Calendar,
    FileText,
    ImageIcon,
    Loader2,
    MapPin,
    Pencil,
    Settings2,
    Wrench,
} from 'lucide-react';

const CORE_COLUMN_FIELDS = new Set([
    'equipment_code',
    'location',
    'rrp_status',
    'current_value',
    'insurance_amount',
    'servicability_status',
    'purchase_currency',
    'purchase_fx_rate',
    'purchase_amount',
]);

const EQUIPMENT_PROPERTY_GROUPS: { title: string; keys: string[] }[] = [
    {
        title: 'Manufacturer & model',
        keys: ['equipment_manufacturer_name', 'model_name', 'series'],
    },
    {
        title: 'Identification',
        keys: [
            'serial_number',
            'vin_number',
            'engine_number',
            'engine_model_number',
            'transmission_model',
        ],
    },
    {
        title: 'Physical',
        keys: ['weight', 'size', 'quantity'],
    },
    {
        title: 'Purchase (recorded)',
        keys: ['purchase_year', 'purchase_amount'],
    },
];

function RrpBadge({ value }: { value: string | null | undefined }) {
    const v = String(value ?? '');
    if (v === '1') {
        return (
            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 shadow-sm">
                1 · RRP made
            </Badge>
        );
    }
    if (v === '0') {
        return (
            <Badge className="bg-amber-500 text-white hover:bg-amber-500 shadow-sm">
                0 · RRP pending
            </Badge>
        );
    }
    return (
        <Badge variant="secondary" className="border border-slate-300 bg-slate-100 text-slate-800">
            {v || '—'}
        </Badge>
    );
}

function formatDisplayDate(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

function formatDisplayDateTime(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatPlainNumber(value: number | null | undefined, decimals = 2): string {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    return Number(value).toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

function approvalBadge(status: string | null | undefined) {
    const s = String(status ?? '').toUpperCase();
    if (s === 'APPROVED') {
        return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Approved</Badge>;
    }
    if (s === 'PENDING') {
        return <Badge className="bg-amber-500 text-white hover:bg-amber-500">Pending</Badge>;
    }
    if (s === 'REJECTED') {
        return <Badge variant="destructive">Rejected</Badge>;
    }
    return <Badge variant="secondary">{status || '—'}</Badge>;
}

function buildPropertyMap(asset: Asset): Map<string, string> {
    const map = new Map<string, string>();
    for (const pv of asset.property_values ?? []) {
        if (pv.property_value != null && String(pv.property_value).trim() !== '') {
            map.set(pv.property_name, String(pv.property_value));
        }
    }
    return map;
}

function getPropertyLabel(name: string): string {
    return PROPERTY_DISPLAY_LABELS[name] ?? name.replace(/_/g, ' ');
}

function DetailField({
    label,
    value,
    mono,
    className,
}: {
    label: string;
    value: ReactNode;
    mono?: boolean;
    className?: string;
}) {
    return (
        <div className={cn('min-w-0', className)}>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
            <dd
                className={cn(
                    'mt-0.5 text-sm text-slate-900 break-words',
                    mono && 'font-mono text-xs'
                )}
            >
                {value ?? '—'}
            </dd>
        </div>
    );
}

function SectionCard({
    title,
    icon: Icon,
    children,
    className,
}: {
    title: string;
    icon: ComponentType<{ className?: string }>;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section
            className={cn(
                'rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden',
                className
            )}
        >
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
                <Icon className="h-4 w-4 shrink-0 text-[#003594]" />
                <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            </div>
            <div className="p-4">{children}</div>
        </section>
    );
}

interface AssetDetailModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    asset: Asset | null | undefined;
    isLoading?: boolean;
    onEdit?: (assetId: number) => void;
}

export function AssetDetailModal({
    open,
    onOpenChange,
    asset,
    isLoading,
    onEdit,
}: AssetDetailModalProps) {
    const propertyMap = asset ? buildPropertyMap(asset) : new Map<string, string>();
    const purchaseCostNpr = asset ? getAssetOriginalPurchaseCostNpr(asset) : null;
    const bookValueNpr = asset ? getAssetBookValueNpr(asset) : null;
    const originalInsuranceUsd = asset ? getAssetOriginalInsuranceAmountUsd(asset) : null;
    const insuranceBookValueUsd = asset ? getAssetInsuranceBookValueUsd(asset) : null;
    const hasApprovedRrp = Number(asset?.rrp_total_npr) > 0;
    const estimatedNprFromBase =
        asset?.purchase_amount_base != null &&
        asset?.purchase_fx_rate != null &&
        Number.isFinite(Number(asset.purchase_amount_base)) &&
        Number.isFinite(Number(asset.purchase_fx_rate))
            ? Number(asset.purchase_amount_base) * Number(asset.purchase_fx_rate)
            : null;

    const groupedEquipment = EQUIPMENT_PROPERTY_GROUPS.map((group) => ({
        title: group.title,
        items: group.keys
            .filter((key) => propertyMap.has(key))
            .map((key) => ({
                label: getPropertyLabel(key),
                value: propertyMap.get(key)!,
            })),
    })).filter((g) => g.items.length > 0);

    const schemaPropertyNames = new Set(
        (asset?.asset_type?.properties ?? []).map((p) => p.property_name)
    );
    const groupedKeys = new Set(EQUIPMENT_PROPERTY_GROUPS.flatMap((g) => g.keys));
    const otherProperties: { label: string; value: string }[] = [];

    for (const [name, value] of propertyMap.entries()) {
        if (CORE_COLUMN_FIELDS.has(name) || groupedKeys.has(name)) continue;
        otherProperties.push({ label: getPropertyLabel(name), value });
    }

    const missingFromMap = (asset?.asset_type?.properties ?? [])
        .filter((p) => !CORE_COLUMN_FIELDS.has(p.property_name) && !propertyMap.has(p.property_name))
        .map((p) => ({
            label: getPropertyLabel(p.property_name),
            value: '—',
            required: p.is_required,
        }));

    const capitalLines: AssetCapitalRrpLine[] = asset?.capital_rrp_lines ?? [];
    const equipmentImageUrl = asset?.image_path
        ? resolveImageUrl(asset.image_path, '/images/nepal_airlines_logo.png')
        : null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[92vh] max-w-4xl gap-0 overflow-hidden border border-slate-200 bg-slate-50 p-0 text-slate-900 shadow-xl [&>button]:right-5 [&>button]:top-5 [&>button]:text-white [&>button]:opacity-90 [&>button]:hover:bg-white/20 [&>button]:hover:text-white [&>button]:focus:ring-white/40">
                {isLoading && (
                    <>
                        <DialogTitle className="sr-only">Loading asset details</DialogTitle>
                        <div className="flex min-h-[320px] items-center justify-center bg-white">
                            <Loader2 className="h-10 w-10 animate-spin text-[#003594]" />
                        </div>
                    </>
                )}

                {!isLoading && asset && (
                    <>
                        <div className="border-b border-slate-200 bg-gradient-to-r from-[#003594] to-[#0d4a9e] px-6 py-5 text-white">
                            <DialogHeader className="space-y-1 text-left">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <DialogTitle className="text-xl font-bold tracking-tight text-white">
                                            {asset.name}
                                        </DialogTitle>
                                        <p className="mt-1 text-sm text-white/85">
                                            {asset.asset_type?.name ?? '—'}
                                            {asset.asset_type?.description ? (
                                                <span className="text-white/70">
                                                    {' '}
                                                    · {asset.asset_type.description}
                                                </span>
                                            ) : null}
                                        </p>
                                    </div>
                                    <RrpBadge value={asset.rrp_status} />
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                    <span className="rounded-md bg-white/15 px-2 py-1 font-mono">
                                        ID {asset.id}
                                    </span>
                                    {asset.equipment_code && (
                                        <span className="rounded-md bg-white/15 px-2 py-1 font-mono">
                                            {asset.equipment_code}
                                        </span>
                                    )}
                                </div>
                            </DialogHeader>
                        </div>

                        <div className="max-h-[calc(92vh-11rem)] overflow-y-auto px-6 py-5 space-y-4">
                            <div className="grid gap-4 lg:grid-cols-[minmax(200px,260px)_1fr]">
                                <SectionCard title="Equipment photo" icon={ImageIcon}>
                                    {equipmentImageUrl ? (
                                        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                                            <Image
                                                src={equipmentImageUrl}
                                                alt={asset.name}
                                                fill
                                                className="object-contain p-1"
                                                sizes="260px"
                                                unoptimized
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center px-3">
                                            <ImageIcon className="h-10 w-10 text-slate-300" />
                                            <p className="mt-2 text-xs text-slate-500">
                                                No photo on file. Images are captured when equipment is received.
                                            </p>
                                        </div>
                                    )}
                                </SectionCard>
                                <div className="grid gap-4 sm:grid-cols-2">
                                <div className="grid gap-3 sm:grid-cols-2 sm:col-span-2">
                                    <div className="rounded-xl border border-[#003594]/20 bg-white p-4 shadow-sm">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                            Purchase cost (NPR)
                                        </p>
                                        <p className="mt-1 text-2xl font-bold tabular-nums text-[#003594]">
                                            {formatNprAmount(purchaseCostNpr)}
                                        </p>
                                        <p className="mt-2 text-xs text-slate-600">
                                            {hasApprovedRrp
                                                ? 'Original cost from approved RRCP'
                                                : 'Original cost at registration'}
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                            Current value (NPR)
                                        </p>
                                        <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-900">
                                            {formatNprAmount(bookValueNpr)}
                                        </p>
                                        <p className="mt-2 text-xs text-slate-600">
                                            {asset.elapsed_fiscal_years != null && asset.purchase_fy
                                                ? `FY ${asset.purchase_fy} → now · ${asset.elapsed_fiscal_years} FY @ 20% reducing balance`
                                                : '20% reducing balance per FY (min NPR 0.10)'}
                                        </p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:col-span-2">
                                    <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 shadow-sm">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                            Insurance base (USD)
                                        </p>
                                        <p className="mt-1 text-2xl font-bold tabular-nums text-violet-900">
                                            {formatUsdAmount(originalInsuranceUsd)}
                                        </p>
                                        <p className="mt-2 text-xs text-slate-600">
                                            Purchase amount in foreign currency (USD)
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 shadow-sm">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                            Insurance value (USD)
                                        </p>
                                        <p className="mt-1 text-2xl font-bold tabular-nums text-violet-900">
                                            {formatUsdAmount(insuranceBookValueUsd)}
                                        </p>
                                        <p className="mt-2 text-xs text-slate-600">
                                            {asset.insurance_baseline_fy
                                                ? `Baseline FY ${asset.insurance_baseline_fy} · 10% reducing balance (min USD 0.10)`
                                                : 'Baseline FY 2081/82 · 10% reducing balance (min USD 0.10)'}
                                        </p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:col-span-2">
                                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                                        <p className="text-[10px] font-semibold uppercase text-slate-500">
                                            RRCP lines
                                        </p>
                                        <p className="mt-1 text-sm font-semibold">{capitalLines.length}</p>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                                        <p className="text-[10px] font-semibold uppercase text-slate-500">
                                            Approved NPR
                                        </p>
                                        <p className="mt-1 text-sm font-semibold tabular-nums">
                                            {formatNprAmount(
                                                asset.rrp_total_npr != null
                                                    ? Number(asset.rrp_total_npr)
                                                    : null
                                            )}
                                        </p>
                                    </div>
                                </div>
                                </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <SectionCard title="Identification & location" icon={MapPin}>
                                    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <DetailField
                                            label="Equipment code"
                                            value={asset.equipment_code ?? '—'}
                                            mono
                                        />
                                        <DetailField label="Location" value={asset.location ?? '—'} />
                                        <DetailField
                                            label="Asset type"
                                            value={asset.asset_type?.name ?? '—'}
                                        />
                                        <DetailField
                                            label="Servicability"
                                            value={asset.servicability_status ?? '—'}
                                        />
                                    </dl>
                                </SectionCard>

                                <SectionCard title="Purchase & currency" icon={Banknote}>
                                    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <DetailField
                                            label="Purchase currency"
                                            value={asset.purchase_currency ?? '—'}
                                        />
                                        <DetailField
                                            label="FX rate"
                                            value={formatPlainNumber(asset.purchase_fx_rate, 4)}
                                        />
                                        <DetailField
                                            label="Purchase amount (base)"
                                            value={
                                                asset.purchase_amount_base != null
                                                    ? `${formatPlainNumber(Number(asset.purchase_amount_base))} ${asset.purchase_currency ?? ''}`.trim()
                                                    : '—'
                                            }
                                        />
                                        <DetailField
                                            label="Est. NPR (base × FX)"
                                            value={
                                                estimatedNprFromBase != null
                                                    ? formatNprAmount(estimatedNprFromBase)
                                                    : '—'
                                            }
                                        />
                                    </dl>
                                </SectionCard>
                            </div>

                            {groupedEquipment.length > 0 && (
                                <SectionCard title="Equipment specifications" icon={Wrench}>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        {groupedEquipment.map((group) => (
                                            <div key={group.title}>
                                                <p className="mb-2 text-xs font-semibold text-[#003594]">
                                                    {group.title}
                                                </p>
                                                <dl className="space-y-2">
                                                    {group.items.map((item) => (
                                                        <DetailField
                                                            key={item.label}
                                                            label={item.label}
                                                            value={item.value}
                                                            mono={
                                                                item.label.includes('Number') ||
                                                                item.label.includes('Code')
                                                            }
                                                        />
                                                    ))}
                                                </dl>
                                            </div>
                                        ))}
                                    </div>
                                </SectionCard>
                            )}

                            {(otherProperties.length > 0 || missingFromMap.length > 0) && (
                                <SectionCard title="Additional properties" icon={Settings2}>
                                    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {otherProperties.map((p) => (
                                            <DetailField key={p.label} label={p.label} value={p.value} />
                                        ))}
                                        {missingFromMap.map((p) => (
                                            <DetailField
                                                key={p.label}
                                                label={`${p.label}${p.required ? ' *' : ''}`}
                                                value={
                                                    <span className="text-slate-400">{p.value}</span>
                                                }
                                            />
                                        ))}
                                    </dl>
                                </SectionCard>
                            )}

                            <SectionCard title="RRCP history" icon={FileText}>
                                {capitalLines.length === 0 ? (
                                    <p className="text-sm text-slate-600">
                                        No capital RRCP records are linked to this asset yet.
                                    </p>
                                ) : (
                                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="bg-slate-50 hover:bg-slate-50">
                                                    <TableHead className="font-semibold whitespace-nowrap">RRCP #</TableHead>
                                                    <TableHead className="font-semibold whitespace-nowrap">Date</TableHead>
                                                    <TableHead className="font-semibold whitespace-nowrap">Supplier</TableHead>
                                                    <TableHead className="font-semibold whitespace-nowrap">Currency</TableHead>
                                                    <TableHead className="font-semibold whitespace-nowrap text-right">FX</TableHead>
                                                    <TableHead className="font-semibold whitespace-nowrap">PO</TableHead>
                                                    <TableHead className="font-semibold whitespace-nowrap">Invoice</TableHead>
                                                    <TableHead className="font-semibold whitespace-nowrap">Status</TableHead>
                                                    <TableHead className="font-semibold whitespace-nowrap text-right">Item price</TableHead>
                                                    <TableHead className="font-semibold whitespace-nowrap text-right">VAT %</TableHead>
                                                    <TableHead className="text-right font-semibold whitespace-nowrap">
                                                        Total (NPR)
                                                    </TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {capitalLines.map((line) => (
                                                    <TableRow key={line.id}>
                                                        <TableCell className="font-mono text-xs font-medium whitespace-nowrap">
                                                            {line.rrp_number}
                                                        </TableCell>
                                                        <TableCell className="text-sm whitespace-nowrap">
                                                            {formatDisplayDate(line.rrp_date)}
                                                        </TableCell>
                                                        <TableCell className="max-w-[120px] truncate text-sm" title={line.supplier_name ?? ''}>
                                                            {line.supplier_name ?? '—'}
                                                        </TableCell>
                                                        <TableCell className="text-sm whitespace-nowrap">
                                                            {line.currency ?? '—'}
                                                        </TableCell>
                                                        <TableCell className="text-right tabular-nums text-xs whitespace-nowrap">
                                                            {formatPlainNumber(line.forex_rate, 4)}
                                                        </TableCell>
                                                        <TableCell className="font-mono text-xs whitespace-nowrap">
                                                            {line.po_number ?? '—'}
                                                        </TableCell>
                                                        <TableCell className="text-sm whitespace-nowrap">
                                                            <span className="font-mono text-xs">
                                                                {line.invoice_number ?? '—'}
                                                            </span>
                                                            {line.invoice_date && (
                                                                <span className="block text-xs text-slate-500">
                                                                    {formatDisplayDate(line.invoice_date)}
                                                                </span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap">
                                                            {approvalBadge(line.approval_status)}
                                                        </TableCell>
                                                        <TableCell className="text-right tabular-nums text-sm whitespace-nowrap">
                                                            {line.item_price != null
                                                                ? formatPlainNumber(Number(line.item_price))
                                                                : '—'}
                                                        </TableCell>
                                                        <TableCell className="text-right tabular-nums text-sm whitespace-nowrap">
                                                            {line.vat_percentage != null
                                                                ? `${formatPlainNumber(Number(line.vat_percentage), 0)}%`
                                                                : '—'}
                                                        </TableCell>
                                                        <TableCell className="text-right tabular-nums text-sm font-medium whitespace-nowrap">
                                                            {formatNprAmount(
                                                                line.total_amount != null
                                                                    ? Number(line.total_amount)
                                                                    : null
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </SectionCard>

                            <SectionCard title="Record metadata" icon={Calendar}>
                                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                    <DetailField
                                        label="Created"
                                        value={formatDisplayDateTime(asset.created_at)}
                                    />
                                    <DetailField
                                        label="Last updated"
                                        value={formatDisplayDateTime(asset.updated_at)}
                                    />
                                    <DetailField
                                        label="Created by (user id)"
                                        value={asset.created_by != null ? String(asset.created_by) : '—'}
                                        mono
                                    />
                                    <DetailField
                                        label="Type schema fields"
                                        value={
                                            schemaPropertyNames.size > 0
                                                ? `${schemaPropertyNames.size} defined`
                                                : 'None'
                                        }
                                    />
                                </dl>
                            </SectionCard>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">
                            <Button
                                type="button"
                                variant="outline"
                                className="border-slate-300"
                                onClick={() => onOpenChange(false)}
                            >
                                Close
                            </Button>
                            {onEdit && (
                                <Button
                                    type="button"
                                    className="bg-[#003594] text-white hover:bg-[#002a6e]"
                                    onClick={() => {
                                        onOpenChange(false);
                                        onEdit(asset.id);
                                    }}
                                >
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit asset
                                </Button>
                            )}
                        </div>
                    </>
                )}

                {!isLoading && !asset && open && (
                    <>
                        <DialogTitle className="sr-only">Asset details</DialogTitle>
                        <div className="flex min-h-[200px] items-center justify-center bg-white p-8 text-sm text-slate-600">
                            Asset details could not be loaded.
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
