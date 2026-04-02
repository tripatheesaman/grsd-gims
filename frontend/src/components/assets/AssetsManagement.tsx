'use client';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuthContext } from '@/context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API } from '@/lib/api';
import { Asset, AssetType, CreateAssetDTO, UpdateAssetDTO, VALID_PROPERTY_NAMES, PROPERTY_DISPLAY_LABELS } from '@/types/asset';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/utils/utils';
import { downloadAssetsExcel, type AssetExportRow } from '@/lib/assetsExport';
import { fetchAllAssetsMatchingFilters } from '@/lib/fetchAllAssets';
import {
    Plus,
    Pencil,
    Trash2,
    Loader2,
    Search,
    Download,
    Eye,
    Filter,
    RefreshCw,
    Package,
} from 'lucide-react';
import { AssetForm } from './AssetForm';

type TextFilterInput = {
    search: string;
    location: string;
    equipmentCode: string;
    servicability: string;
};

type SelectFilters = {
    assetTypeId: string;
    rrpStatus: string;
};

const defaultTextFilters: TextFilterInput = {
    search: '',
    location: '',
    equipmentCode: '',
    servicability: '',
};

const defaultSelectFilters: SelectFilters = {
    assetTypeId: 'all',
    rrpStatus: 'all',
};

function rrpRowTone(rrp: string | null | undefined): string {
    const v = String(rrp ?? '');
    if (v === '1') {
        return 'bg-emerald-50/95 border-l-[3px] border-l-emerald-500 hover:bg-emerald-100/80';
    }
    if (v === '0') {
        return 'bg-amber-50/95 border-l-[3px] border-l-amber-500 hover:bg-amber-100/80';
    }
    return 'hover:bg-slate-50/90';
}

function RrpBadge({ value }: { value: string | null | undefined }) {
    const v = String(value ?? '');
    if (v === '1') {
        return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 shadow-sm">1 · RRP made</Badge>;
    }
    if (v === '0') {
        return <Badge className="bg-amber-500 text-white hover:bg-amber-500 shadow-sm">0 · RRP pending</Badge>;
    }
    return <Badge variant="secondary" className="border border-slate-300 bg-slate-100 text-slate-800">{v || '—'}</Badge>;
}

export function AssetsManagement() {
    const { permissions } = useAuthContext();
    const canAccessAssets = permissions?.includes('can_access_asset_management_system');
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const queryClient = useQueryClient();

    const [textFilterInput, setTextFilterInput] = useState<TextFilterInput>(defaultTextFilters);
    const [selectFilters, setSelectFilters] = useState<SelectFilters>(defaultSelectFilters);
    const debouncedTextFilters = useDebounce(textFilterInput, 400);
    const filterKey = useMemo(
        () => ({
            search: debouncedTextFilters.search.trim(),
            location: debouncedTextFilters.location.trim(),
            equipmentCode: debouncedTextFilters.equipmentCode.trim(),
            servicability: debouncedTextFilters.servicability.trim(),
            assetTypeId: selectFilters.assetTypeId,
            rrpStatus: selectFilters.rrpStatus,
        }),
        [debouncedTextFilters, selectFilters]
    );
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
    const [detailId, setDetailId] = useState<number | null>(null);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [selectedImportFile, setSelectedImportFile] = useState<File | null>(null);

    const listQueryKey = useMemo(
        () => ['assets', 'list', filterKey, page, pageSize] as const,
        [filterKey, page, pageSize]
    );

    useEffect(() => {
        setPage(1);
    }, [filterKey.search, filterKey.location, filterKey.equipmentCode, filterKey.servicability, filterKey.assetTypeId, filterKey.rrpStatus]);

    const assetTypesQuery = useQuery({
        queryKey: ['asset-types'],
        queryFn: async () => {
            const res = await API.get<AssetType[]>('/api/asset-types');
            return Array.isArray(res.data) ? res.data : [];
        },
        enabled: Boolean(canAccessAssets),
    });

    const listQuery = useQuery({
        queryKey: listQueryKey,
        queryFn: async () => {
            const params: Record<string, string | number> = { page, pageSize };
            if (filterKey.search) params.search = filterKey.search;
            if (filterKey.assetTypeId !== 'all') params.asset_type_id = filterKey.assetTypeId;
            if (filterKey.rrpStatus !== 'all') params.rrp_status = filterKey.rrpStatus;
            if (filterKey.location) params.location = filterKey.location;
            if (filterKey.equipmentCode) params.equipment_code = filterKey.equipmentCode;
            if (filterKey.servicability) params.servicability_status = filterKey.servicability;
            const res = await API.get<{
                data: AssetExportRow[];
                pagination: { page: number; pageSize: number; total: number; totalPages: number };
            }>('/api/assets', { params });
            return res.data;
        },
        enabled: Boolean(canAccessAssets),
    });

    const detailQuery = useQuery({
        queryKey: ['assets', 'detail', detailId],
        queryFn: async () => {
            const res = await API.get<Asset>(`/api/assets/${detailId}`);
            return res.data;
        },
        enabled: detailId !== null,
    });

    const invalidateAssets = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['assets'] });
    }, [queryClient]);

    const createMutation = useMutation({
        mutationFn: (data: CreateAssetDTO) => API.post('/api/assets', data),
        onSuccess: () => {
            invalidateAssets();
            showSuccessToast({ title: 'Success', message: 'Asset created successfully', duration: 3000 });
            setIsCreateOpen(false);
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: UpdateAssetDTO }) => API.put(`/api/assets/${id}`, data),
        onSuccess: () => {
            invalidateAssets();
            queryClient.invalidateQueries({ queryKey: ['assets', 'detail'] });
            showSuccessToast({ title: 'Success', message: 'Asset updated successfully', duration: 3000 });
            setIsEditOpen(false);
            setSelectedAsset(null);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => API.delete(`/api/assets/${id}`),
        onSuccess: () => {
            invalidateAssets();
            showSuccessToast({ title: 'Success', message: 'Asset deleted successfully', duration: 3000 });
        },
    });

    const deleteAllMutation = useMutation({
        mutationFn: () => API.delete('/api/assets/all'),
        onSuccess: () => {
            invalidateAssets();
            showSuccessToast({ title: 'Success', message: 'All assets deleted successfully', duration: 3000 });
        },
    });

    const importMutation = useMutation({
        mutationFn: async (file: File) => {
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.onload = () => resolve(String(reader.result || ''));
                reader.readAsDataURL(file);
            });
            const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
            const apiBase = String(API.defaults.baseURL || '').replace(/\/+$/, '');
            return API.post(`${apiBase}/api/assets/import`, { fileBase64: base64 });
        },
        onSuccess: (res) => {
            invalidateAssets();
            const body = res.data as { insertedCount?: number; failedCount?: number };
            const insertedCount = body.insertedCount ?? 0;
            const failedCount = body.failedCount ?? 0;
            showSuccessToast({
                title: 'Import finished',
                message: `Inserted: ${insertedCount}, Failed: ${failedCount}`,
                duration: 5000,
            });
            setIsImportOpen(false);
            setSelectedImportFile(null);
        },
    });

    const assets = listQuery.data?.data ?? [];
    const pagination = listQuery.data?.pagination;
    const assetTypes = assetTypesQuery.data ?? [];

    const handleResetFilters = () => {
        setTextFilterInput(defaultTextFilters);
        setSelectFilters(defaultSelectFilters);
        setPage(1);
    };

    const handleDownloadTemplate = async () => {
        try {
            const ExcelJS = (await import('exceljs')).default;
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Assets Import Template');
            const templateBaseHeaders = new Set([
                'equipment_code',
                'location',
                'rrp_status',
                'current_value',
                'insurance_amount',
                'servicability_status',
                'purchase_currency',
                'purchase_fx_rate',
            ]);
            const propertyHeaders = VALID_PROPERTY_NAMES.filter(p => p !== 'purchase_amount' && !templateBaseHeaders.has(p));
            const headers = [
                'equipment_code',
                'asset_type_name',
                'name',
                'location',
                'rrp_status',
                'current_value',
                'insurance_amount',
                'servicability_status',
                ...propertyHeaders,
                'purchase_currency',
                'purchase_fx_rate',
                'purchase_amount',
            ];
            worksheet.addRow(headers);
            worksheet.getRow(1).font = { bold: true };
            worksheet.columns = headers.map(() => ({ width: 20 }));
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const objectUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = 'assets_import_template.xlsx';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(objectUrl);
            document.body.removeChild(a);
            showSuccessToast({ title: 'Success', message: 'Template downloaded', duration: 3000 });
        }
        catch {
            showErrorToast({ title: 'Error', message: 'Failed to download template', duration: 5000 });
        }
    };

    const buildExportFilterPayload = useCallback(() => {
        return {
            search: filterKey.search || undefined,
            asset_type_id: filterKey.assetTypeId !== 'all' ? filterKey.assetTypeId : undefined,
            rrp_status: filterKey.rrpStatus !== 'all' ? filterKey.rrpStatus : undefined,
            location: filterKey.location || undefined,
            equipment_code: filterKey.equipmentCode || undefined,
            servicability_status: filterKey.servicability || undefined,
        };
    }, [filterKey]);

    const handleExportCurrentPage = async () => {
        try {
            await downloadAssetsExcel(assets as AssetExportRow[], `assets-page-${page}.xlsx`);
            showSuccessToast({ title: 'Exported', message: 'Current page exported', duration: 3000 });
        }
        catch {
            showErrorToast({ title: 'Error', message: 'Export failed', duration: 5000 });
        }
    };

    const handleExportAllFiltered = async () => {
        try {
            const rows = await fetchAllAssetsMatchingFilters(buildExportFilterPayload());
            await downloadAssetsExcel(rows as AssetExportRow[], 'assets-filtered-all.xlsx');
            showSuccessToast({ title: 'Exported', message: 'All matching rows exported', duration: 3000 });
        }
        catch {
            showErrorToast({ title: 'Error', message: 'Export failed', duration: 5000 });
        }
    };

    const handleExportEverything = async () => {
        try {
            const rows = await fetchAllAssetsMatchingFilters({});
            await downloadAssetsExcel(rows as AssetExportRow[], 'assets-all.xlsx');
            showSuccessToast({ title: 'Exported', message: 'All assets exported', duration: 3000 });
        }
        catch {
            showErrorToast({ title: 'Error', message: 'Export failed', duration: 5000 });
        }
    };

    const handleEditClick = async (id: number) => {
        try {
            const res = await API.get<Asset>(`/api/assets/${id}`);
            setSelectedAsset(res.data);
            setIsEditOpen(true);
        }
        catch {
            showErrorToast({ title: 'Error', message: 'Failed to fetch asset details', duration: 3000 });
        }
    };

    const onDelete = (id: number) => {
        if (!confirm('Delete this asset? This cannot be undone.')) return;
        deleteMutation.mutate(id);
    };

    const onDeleteAll = () => {
        if (!confirm('Delete ALL assets? This cannot be undone.')) return;
        deleteAllMutation.mutate();
    };

    if (!canAccessAssets) {
        return null;
    }

    const tableLoading = listQuery.isPending;
    const totalPages = pagination?.totalPages ?? 1;
    const total = pagination?.total ?? 0;

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#003594]/10 text-[#003594] ring-1 ring-[#003594]/20">
                            <Package className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Assets</h2>
                            <p className="mt-0.5 text-sm text-slate-600">Equipment registry, filters, and exports</p>
                            {total > 0 && (
                                <p className="mt-2 text-xs font-medium text-slate-500">
                                    {total} record{total === 1 ? '' : 's'}
                                    {listQuery.isFetching && !listQuery.isPending ? ' · Updating…' : ''}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            className="border-slate-300 bg-white text-slate-900 shadow-sm hover:bg-slate-50 active:scale-[0.98]"
                            onClick={() => listQuery.refetch()}
                            disabled={listQuery.isFetching}
                        >
                            {listQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Refresh
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="border-slate-300 bg-white text-slate-900 shadow-sm hover:bg-slate-50 active:scale-[0.98]"
                                >
                                    <Download className="mr-2 h-4 w-4" />
                                    Export
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 border border-slate-200 bg-white text-slate-900 shadow-lg">
                                <DropdownMenuLabel className="text-slate-700">Spreadsheet (.xlsx)</DropdownMenuLabel>
                                <DropdownMenuItem className="cursor-pointer focus:bg-slate-100 focus:text-slate-900" onClick={() => void handleExportCurrentPage()} disabled={!assets.length}>
                                    Current page
                                </DropdownMenuItem>
                                <DropdownMenuItem className="cursor-pointer focus:bg-slate-100 focus:text-slate-900" onClick={() => void handleExportAllFiltered()}>
                                    All with current filters
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-slate-200" />
                                <DropdownMenuItem className="cursor-pointer focus:bg-slate-100 focus:text-slate-900" onClick={() => void handleExportEverything()}>
                                    All assets (no filters)
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                            type="button"
                            variant="outline"
                            className="border-slate-300 bg-white text-slate-900 shadow-sm hover:bg-slate-50 active:scale-[0.98]"
                            onClick={handleDownloadTemplate}
                        >
                            Template
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="border-slate-300 bg-white text-slate-900 shadow-sm hover:bg-slate-50 active:scale-[0.98]"
                            onClick={() => setIsImportOpen(true)}
                        >
                            Import
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            className="bg-red-600 text-white shadow-sm hover:bg-red-700 active:scale-[0.98]"
                            onClick={onDeleteAll}
                            disabled={deleteAllMutation.isPending}
                        >
                            {deleteAllMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            Delete all
                        </Button>
                        <Button
                            type="button"
                            className="bg-[#003594] text-white shadow-md hover:bg-[#002a6e] active:scale-[0.98]"
                            onClick={() => setIsCreateOpen(true)}
                        >
                            <Plus className="mr-2 h-4 w-4" />
                            Create asset
                        </Button>
                    </div>
                </div>
            </div>

            <Card className="overflow-hidden border-slate-200 bg-white shadow-md">
                <CardContent className="p-0">
                    <div className="border-b border-slate-200 bg-slate-50 p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                                <Filter className="h-4 w-4 text-[#003594]" />
                                Filters
                                <span className="font-normal text-slate-500">(apply automatically)</span>
                            </div>
                            <button
                                type="button"
                                onClick={handleResetFilters}
                                className="text-sm font-medium text-[#003594] underline-offset-2 hover:underline"
                            >
                                Reset filters
                            </button>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                            <div className="relative lg:col-span-2">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                                <Input
                                    placeholder="Search name, type, equipment…"
                                    value={textFilterInput.search}
                                    onChange={(e) => setTextFilterInput((f) => ({ ...f, search: e.target.value }))}
                                    className="h-10 border-slate-300 bg-white pl-9 text-slate-900 placeholder:text-slate-500 shadow-sm focus-visible:ring-[#003594]/30"
                                />
                            </div>
                            <Select
                                value={selectFilters.assetTypeId}
                                onValueChange={(v) => setSelectFilters((f) => ({ ...f, assetTypeId: v }))}
                            >
                                <SelectTrigger className="h-10 border-slate-300 bg-white text-slate-900 shadow-sm">
                                    <SelectValue placeholder="Asset type" />
                                </SelectTrigger>
                                <SelectContent className="border border-slate-200 bg-white text-slate-900">
                                    <SelectItem value="all">All types</SelectItem>
                                    {assetTypes.map((t) => (
                                        <SelectItem key={t.id} value={String(t.id)}>
                                            {t.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select
                                value={selectFilters.rrpStatus}
                                onValueChange={(v) => setSelectFilters((f) => ({ ...f, rrpStatus: v }))}
                            >
                                <SelectTrigger className="h-10 border-slate-300 bg-white text-slate-900 shadow-sm">
                                    <SelectValue placeholder="RRP status" />
                                </SelectTrigger>
                                <SelectContent className="border border-slate-200 bg-white text-slate-900">
                                    <SelectItem value="all">All RRP</SelectItem>
                                    <SelectItem value="0">0 · Pending</SelectItem>
                                    <SelectItem value="1">1 · Made</SelectItem>
                                </SelectContent>
                            </Select>
                            <Input
                                placeholder="Equipment code contains…"
                                value={textFilterInput.equipmentCode}
                                onChange={(e) => setTextFilterInput((f) => ({ ...f, equipmentCode: e.target.value }))}
                                className="h-10 border-slate-300 bg-white text-slate-900 placeholder:text-slate-500 shadow-sm focus-visible:ring-[#003594]/30"
                            />
                            <Input
                                placeholder="Location contains…"
                                value={textFilterInput.location}
                                onChange={(e) => setTextFilterInput((f) => ({ ...f, location: e.target.value }))}
                                className="h-10 border-slate-300 bg-white text-slate-900 placeholder:text-slate-500 shadow-sm focus-visible:ring-[#003594]/30"
                            />
                            <Input
                                placeholder="Servicability contains…"
                                value={textFilterInput.servicability}
                                onChange={(e) => setTextFilterInput((f) => ({ ...f, servicability: e.target.value }))}
                                className="h-10 border-slate-300 bg-white text-slate-900 placeholder:text-slate-500 shadow-sm focus-visible:ring-[#003594]/30"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                            <span className="font-medium text-slate-900">Page size</span>
                            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                                <SelectTrigger className="h-9 w-[88px] border-slate-300 bg-white text-slate-900 shadow-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="border border-slate-200 bg-white text-slate-900">
                                    {[10, 20, 50, 100].map((n) => (
                                        <SelectItem key={n} value={String(n)}>
                                            {n}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <span className="text-slate-600">
                                Showing {assets.length ? (page - 1) * pageSize + 1 : 0}–
                                {(page - 1) * pageSize + assets.length} of {total}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="border-slate-300 bg-white text-slate-900 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                                disabled={page <= 1 || listQuery.isFetching}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                            >
                                Previous
                            </Button>
                            <span className="min-w-[100px] text-center text-sm font-medium text-slate-800">
                                {page} / {totalPages || 1}
                            </span>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="border-slate-300 bg-white text-slate-900 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                                disabled={page >= totalPages || listQuery.isFetching}
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            >
                                Next
                            </Button>
                        </div>
                    </div>

                    <div className="max-h-[min(70vh,720px)] overflow-auto">
                        {tableLoading ? (
                            <div className="flex h-64 items-center justify-center">
                                <Loader2 className="h-10 w-10 animate-spin text-[#003594]" />
                            </div>
                        ) : (
                            <Table>
                                <TableHeader className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 shadow-sm [&_tr]:border-slate-200">
                                    <TableRow className="border-0 hover:bg-transparent">
                                        <TableHead className="min-w-[140px] font-semibold text-slate-900">Name</TableHead>
                                        <TableHead className="min-w-[120px] font-semibold text-slate-900">Equipment</TableHead>
                                        <TableHead className="min-w-[120px] font-semibold text-slate-900">Type</TableHead>
                                        <TableHead className="min-w-[100px] font-semibold text-slate-900">Location</TableHead>
                                        <TableHead className="min-w-[140px] font-semibold text-slate-900">RRP</TableHead>
                                        <TableHead className="min-w-[90px] text-right font-semibold text-slate-900">Value</TableHead>
                                        <TableHead className="w-[200px] text-right font-semibold text-slate-900">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {assets.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-40 bg-white text-center text-slate-600">
                                                No assets match these filters.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        assets.map((asset) => (
                                            <TableRow key={asset.id} className={cn('border-[#002a6e]/10', rrpRowTone(asset.rrp_status))}>
                                                <TableCell className="font-medium text-slate-900">{asset.name}</TableCell>
                                                <TableCell className="font-mono text-xs text-slate-800">{asset.equipment_code ?? '—'}</TableCell>
                                                <TableCell className="text-slate-700">
                                                    {asset.asset_type?.name ?? asset.asset_type_name ?? '—'}
                                                </TableCell>
                                                <TableCell className="max-w-[160px] truncate text-slate-600" title={asset.location ?? ''}>
                                                    {asset.location ?? '—'}
                                                </TableCell>
                                                <TableCell>
                                                    <RrpBadge value={asset.rrp_status} />
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums text-slate-800">
                                                    {asset.current_value != null ? Number(asset.current_value).toLocaleString() : '—'}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-1.5">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 border-slate-300 bg-white text-slate-900 shadow-sm hover:bg-slate-50 active:scale-[0.98]"
                                                            onClick={() => setDetailId(asset.id)}
                                                        >
                                                            <Eye className="mr-1 h-3.5 w-3.5" />
                                                            View
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="secondary"
                                                            className="h-8 border border-slate-300 bg-white text-slate-900 shadow-sm hover:bg-slate-50 active:scale-[0.98]"
                                                            onClick={() => void handleEditClick(asset.id)}
                                                        >
                                                            <Pencil className="mr-1 h-3.5 w-3.5" />
                                                            Edit
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="destructive"
                                                            className="h-8 bg-red-600 text-white shadow-sm hover:bg-red-700 active:scale-[0.98]"
                                                            disabled={deleteMutation.isPending && deleteMutation.variables === asset.id}
                                                            onClick={() => onDelete(asset.id)}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto border border-slate-200 bg-white text-slate-900 shadow-xl">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900">Create asset</DialogTitle>
                    </DialogHeader>
                    <AssetForm
                        key="create-asset"
                        assetTypes={assetTypes}
                        onSubmit={(data) => createMutation.mutate(data as CreateAssetDTO)}
                        onCancel={() => setIsCreateOpen(false)}
                    />
                </DialogContent>
            </Dialog>

            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto border border-slate-200 bg-white text-slate-900 shadow-xl">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900">Edit asset</DialogTitle>
                    </DialogHeader>
                    {selectedAsset && (
                        <AssetForm
                            key={selectedAsset.id}
                            assetTypes={assetTypes}
                            initialData={selectedAsset}
                            onSubmit={(data) => updateMutation.mutate({ id: selectedAsset.id, data: data as UpdateAssetDTO })}
                            onCancel={() => {
                                setIsEditOpen(false);
                                setSelectedAsset(null);
                            }}
                        />
                    )}
                </DialogContent>
            </Dialog>

            <Dialog
                open={detailId !== null}
                onOpenChange={(open) => {
                    if (!open) setDetailId(null);
                }}
            >
                <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border border-slate-200 bg-white text-slate-900 shadow-xl">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900">Asset details</DialogTitle>
                    </DialogHeader>
                    {detailQuery.isPending && (
                        <div className="flex justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-[#003594]" />
                        </div>
                    )}
                    {detailQuery.data && !detailQuery.isPending && (
                        <div className="space-y-4 text-sm">
                            <div className={cn('rounded-lg border border-slate-200 p-3', rrpRowTone(detailQuery.data.rrp_status))}>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold text-slate-900">{detailQuery.data.name}</span>
                                    <RrpBadge value={detailQuery.data.rrp_status} />
                                </div>
                                <p className="mt-1 text-xs text-slate-600">
                                    {detailQuery.data.asset_type?.name ?? (detailQuery.data as AssetExportRow).asset_type_name ?? '—'}
                                </p>
                            </div>
                            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <div>
                                    <dt className="text-xs font-medium text-slate-500">Equipment code</dt>
                                    <dd className="font-mono text-slate-900">{detailQuery.data.equipment_code ?? '—'}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-medium text-slate-500">Location</dt>
                                    <dd className="text-slate-900">{detailQuery.data.location ?? '—'}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-medium text-slate-500">Servicability</dt>
                                    <dd className="text-slate-900">{detailQuery.data.servicability_status ?? '—'}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-medium text-slate-500">Current value</dt>
                                    <dd className="tabular-nums text-slate-900">{detailQuery.data.current_value ?? '—'}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-medium text-slate-500">Insurance</dt>
                                    <dd className="tabular-nums text-slate-900">{detailQuery.data.insurance_amount ?? '—'}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-medium text-slate-500">Currency / FX / Purchase</dt>
                                    <dd className="text-slate-900">
                                        {detailQuery.data.purchase_currency ?? '—'} · {detailQuery.data.purchase_fx_rate ?? '—'} ·{' '}
                                        {detailQuery.data.purchase_amount_base ?? '—'}
                                    </dd>
                                </div>
                            </dl>
                            {detailQuery.data.property_values && detailQuery.data.property_values.length > 0 && (
                                <div>
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Properties</p>
                                    <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-slate-200 bg-white p-2">
                                        {detailQuery.data.property_values.map((pv) => (
                                            <div key={pv.id} className="flex justify-between gap-2 text-xs">
                                                <span className="text-slate-600">{PROPERTY_DISPLAY_LABELS[pv.property_name] || pv.property_name}</span>
                                                <span className="text-right font-medium text-slate-900">{pv.property_value ?? '—'}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog
                open={isImportOpen}
                onOpenChange={(open) => {
                    setIsImportOpen(open);
                    if (!open) {
                        setSelectedImportFile(null);
                    }
                }}
            >
                <DialogContent className="max-w-2xl border border-slate-200 bg-white text-slate-900 shadow-xl">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900">Import assets</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 text-sm text-slate-600">
                        <p>Use the template, fill rows, then upload the .xlsx file.</p>
                        <Input
                            type="file"
                            accept=".xlsx"
                            className="cursor-pointer border-slate-300 bg-white text-slate-900 file:text-slate-900"
                            onChange={(e) => setSelectedImportFile(e.target.files?.[0] ?? null)}
                        />
                        {selectedImportFile && <p className="text-slate-800">Selected: {selectedImportFile.name}</p>}
                    </div>
                    <div className="mt-6 flex justify-end gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            className="border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
                            onClick={() => setIsImportOpen(false)}
                            disabled={importMutation.isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            className="bg-[#003594] text-white shadow-md hover:bg-[#002a6e] active:scale-[0.98]"
                            disabled={!selectedImportFile || importMutation.isPending}
                            onClick={() => selectedImportFile && importMutation.mutate(selectedImportFile)}
                        >
                            {importMutation.isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Importing…
                                </>
                            ) : (
                                'Import'
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
