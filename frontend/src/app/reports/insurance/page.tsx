'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { API } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Search,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Download,
    X,
    ChevronDown,
    ChevronUp,
} from 'lucide-react';
import { useCustomToast } from '@/components/ui/custom-toast';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { FiscalYearFilterSelect } from '@/components/fiscal-year/FiscalYearFilterSelect';
import { useFiscalYear } from '@/hooks/useFiscalYear';
import { InsuranceReportResponse, InsuranceReportRow } from '@/types/insuranceReport';
import { PROPERTY_DISPLAY_LABELS } from '@/types/asset';
import type { ReportSortOrder } from '@/lib/reportSortOptions';

const sortableHeadClass =
    'cursor-pointer select-none hover:bg-violet-50 transition-colors';

const formatUsd = (value: number) =>
    `USD ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InsuranceReportPage() {
    const { permissions } = useAuthContext();
    const canAccessReport = permissions?.includes('can_access_insurance_report') || permissions?.includes('can_access_report');
    const { fiscalYear, loading: fyLoading } = useFiscalYear();
    const { showErrorToast, showSuccessToast } = useCustomToast();

    const [selectedFy, setSelectedFy] = useState('');
    const [insuranceBaselineFy, setInsuranceBaselineFy] = useState('2081/82');
    const [data, setData] = useState<InsuranceReportRow[]>([]);
    const [fiscalYearColumns, setFiscalYearColumns] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState('');
    const [equipmentCode, setEquipmentCode] = useState('');
    const [assetTypeId, setAssetTypeId] = useState<string>('all');
    const [sortBy, setSortBy] = useState('equipment_code');
    const [sortOrder, setSortOrder] = useState<ReportSortOrder>('ASC');
    const [assetTypes, setAssetTypes] = useState<{ id: number; name: string }[]>([]);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportType, setExportType] = useState('all');
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        if (fiscalYear && !selectedFy) {
            setSelectedFy(fiscalYear);
        }
    }, [fiscalYear, selectedFy]);

    useEffect(() => {
        API.get('/api/asset-types')
            .then((res) => {
                const types = Array.isArray(res.data) ? res.data : [];
                setAssetTypes(types.map((t: { id: number; name: string }) => ({ id: t.id, name: t.name })));
            })
            .catch(() => setAssetTypes([]));
    }, []);

    const fetchReport = useCallback(async () => {
        if (!canAccessReport || !selectedFy) return;
        setIsLoading(true);
        try {
            const params: Record<string, string> = {
                fiscalYear: selectedFy,
                page: page.toString(),
                pageSize: '20',
            };
            if (search.trim()) params.search = search.trim();
            if (equipmentCode.trim()) params.equipment_code = equipmentCode.trim();
            if (assetTypeId !== 'all') params.asset_type_id = assetTypeId;
            params.sortBy = sortBy;
            params.sortOrder = sortOrder;

            const response = await API.get<InsuranceReportResponse>('/api/report/insurance', { params });
            setData(response.data.data);
            setInsuranceBaselineFy(response.data.insuranceBaselineFy || '2081/82');
            setFiscalYearColumns(response.data.fiscalYearColumns || []);
            setTotalPages(response.data.pagination.totalPages);
            setTotal(response.data.pagination.total);
        } catch {
            showErrorToast({
                title: 'Error',
                message: 'Failed to fetch insurance report',
                duration: 5000,
            });
            setData([]);
        } finally {
            setIsLoading(false);
        }
    }, [canAccessReport, selectedFy, page, search, equipmentCode, assetTypeId, sortBy, sortOrder, showErrorToast]);

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
    };

    const handleClearSearch = () => {
        setSearch('');
        setEquipmentCode('');
        setAssetTypeId('all');
        setSortBy('equipment_code');
        setSortOrder('ASC');
        setPage(1);
    };

    const handleSort = (field: string) => {
        setPage(1);
        if (sortBy === field) {
            setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
        } else {
            setSortBy(field);
            setSortOrder('ASC');
        }
    };

    const sortIndicator = (field: string) =>
        sortBy === field ? (
            <span className="ml-1 text-[#7c3aed]">{sortOrder === 'ASC' ? '↑' : '↓'}</span>
        ) : null;

    const handleExport = async () => {
        if (!selectedFy) return;
        setExporting(true);
        try {
            const payload = {
                fiscalYear: selectedFy,
                exportType,
                page,
                pageSize: 20,
                search: search.trim() || undefined,
                equipment_code: equipmentCode.trim() || undefined,
                asset_type_id: assetTypeId !== 'all' ? Number(assetTypeId) : undefined,
                sortBy,
                sortOrder,
            };
            const response = await API.post('/api/report/insurance/export', payload, {
                responseType: 'blob',
            });
            const blob = new Blob([response.data]);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Insurance_Report_${selectedFy.replace('/', '-')}.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            showSuccessToast({
                title: 'Exported',
                message: 'Insurance report downloaded successfully',
                duration: 3000,
            });
            setIsExportModalOpen(false);
        } catch {
            showErrorToast({
                title: 'Error',
                message: 'Failed to export insurance report',
                duration: 5000,
            });
        } finally {
            setExporting(false);
        }
    };

    if (!canAccessReport) {
        return (
            <div className="container mx-auto px-4 py-8">
                <p className="text-gray-600">You do not have permission to access reports.</p>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8 space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-[#003594] to-[#7c3aed] bg-clip-text text-transparent">
                        Insurance Report
                    </h1>
                    <p className="text-gray-600 mt-1">
                        Insurance valuation in USD as of the selected fiscal year. Depreciation starts from FY {insuranceBaselineFy} at 10% reducing balance on USD purchase amounts.
                    </p>
                </div>
                <Button
                    onClick={() => setIsExportModalOpen(true)}
                    className="bg-[#7c3aed] hover:bg-[#6d28d9]"
                    disabled={!selectedFy || total === 0}
                >
                    <Download className="h-4 w-4 mr-2" />
                    Export Excel
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg text-[#7c3aed]">Filters</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSearch} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <FiscalYearFilterSelect
                            value={selectedFy}
                            onChange={(value) => {
                                setSelectedFy(value);
                                setPage(1);
                            }}
                            showAllOption={false}
                        />
                        <div>
                            <Label className="text-xs font-medium text-slate-600">Asset type</Label>
                            <Select value={assetTypeId} onValueChange={(v) => { setAssetTypeId(v); setPage(1); }}>
                                <SelectTrigger className="mt-1.5 h-10">
                                    <SelectValue placeholder="All types" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All types</SelectItem>
                                    {assetTypes.map((t) => (
                                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="search">Search</Label>
                            <Input
                                id="search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Name, type, equipment..."
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="equipmentCode">Equipment code</Label>
                            <Input
                                id="equipmentCode"
                                value={equipmentCode}
                                onChange={(e) => setEquipmentCode(e.target.value)}
                                placeholder="Equipment code"
                                className="mt-1"
                            />
                        </div>
                        <div className="flex items-end gap-2 md:col-span-2 lg:col-span-4">
                            <Button type="submit" className="bg-[#7c3aed] hover:bg-[#6d28d9]">
                                <Search className="h-4 w-4 mr-2" />
                                Apply
                            </Button>
                            <Button type="button" variant="outline" onClick={handleClearSearch}>
                                <X className="h-4 w-4 mr-2" />
                                Clear
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg text-[#7c3aed]">
                        Insurance as of FY {selectedFy || '—'}
                    </CardTitle>
                    <span className="text-sm text-gray-500">{total} equipment(s)</span>
                </CardHeader>
                <CardContent>
                    {isLoading || fyLoading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-[#7c3aed]" />
                        </div>
                    ) : data.length === 0 ? (
                        <p className="text-center text-gray-500 py-12">No insurance records found for the selected fiscal year.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-8" />
                                        <TableHead
                                            className={sortableHeadClass}
                                            onClick={() => handleSort('equipment_code')}
                                        >
                                            Equipment{sortIndicator('equipment_code')}
                                        </TableHead>
                                        <TableHead
                                            className={sortableHeadClass}
                                            onClick={() => handleSort('name')}
                                        >
                                            Name{sortIndicator('name')}
                                        </TableHead>
                                        <TableHead
                                            className={sortableHeadClass}
                                            onClick={() => handleSort('asset_type_name')}
                                        >
                                            Type{sortIndicator('asset_type_name')}
                                        </TableHead>
                                        <TableHead
                                            className={sortableHeadClass}
                                            onClick={() => handleSort('insurance_baseline_fy')}
                                        >
                                            Baseline FY{sortIndicator('insurance_baseline_fy')}
                                        </TableHead>
                                        <TableHead
                                            className={`text-right ${sortableHeadClass}`}
                                            onClick={() => handleSort('original_insurance_amount_usd')}
                                        >
                                            Insurance Base{sortIndicator('original_insurance_amount_usd')}
                                        </TableHead>
                                        <TableHead
                                            className={`text-right ${sortableHeadClass}`}
                                            onClick={() => handleSort('total_insurance_depreciation_usd')}
                                        >
                                            Total Depreciation{sortIndicator('total_insurance_depreciation_usd')}
                                        </TableHead>
                                        <TableHead
                                            className={`text-right ${sortableHeadClass}`}
                                            onClick={() => handleSort('current_insurance_value_usd')}
                                        >
                                            Insurance Value{sortIndicator('current_insurance_value_usd')}
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.map((row) => {
                                        const isExpanded = expandedId === row.id;
                                        return (
                                            <Fragment key={row.id}>
                                                <TableRow className="hover:bg-slate-50">
                                                    <TableCell>
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedId(isExpanded ? null : row.id)}
                                                            className="text-[#7c3aed]"
                                                        >
                                                            {isExpanded ? (
                                                                <ChevronUp className="h-4 w-4" />
                                                            ) : (
                                                                <ChevronDown className="h-4 w-4" />
                                                            )}
                                                        </button>
                                                    </TableCell>
                                                    <TableCell className="font-medium">{row.equipment_code}</TableCell>
                                                    <TableCell>{row.name}</TableCell>
                                                    <TableCell>{row.asset_type_name}</TableCell>
                                                    <TableCell>{row.insurance_baseline_fy}</TableCell>
                                                    <TableCell className="text-right">
                                                        {formatUsd(row.original_insurance_amount_usd)}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {formatUsd(row.total_insurance_depreciation_usd)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-semibold text-[#7c3aed]">
                                                        {formatUsd(row.current_insurance_value_usd)}
                                                    </TableCell>
                                                </TableRow>
                                                {isExpanded && (
                                                    <TableRow className="bg-violet-50/50">
                                                        <TableCell colSpan={8} className="p-4">
                                                            <div className="grid gap-4 md:grid-cols-2">
                                                                <div>
                                                                    <h4 className="text-sm font-semibold text-[#7c3aed] mb-2">
                                                                        Equipment details
                                                                    </h4>
                                                                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                                                        <dt className="text-gray-500">Purchase FY</dt>
                                                                        <dd>{row.purchase_fy}</dd>
                                                                        <dt className="text-gray-500">Location</dt>
                                                                        <dd>{row.location || '—'}</dd>
                                                                        {Object.entries(row.property_values).map(([key, val]) => (
                                                                            <Fragment key={key}>
                                                                                <dt className="text-gray-500">
                                                                                    {PROPERTY_DISPLAY_LABELS[key] || key}
                                                                                </dt>
                                                                                <dd>{val}</dd>
                                                                            </Fragment>
                                                                        ))}
                                                                    </dl>
                                                                </div>
                                                                <div>
                                                                    <h4 className="text-sm font-semibold text-[#7c3aed] mb-2">
                                                                        Insurance depreciation by FY (from {row.insurance_baseline_fy})
                                                                    </h4>
                                                                    <div className="overflow-x-auto">
                                                                        <Table>
                                                                            <TableHeader>
                                                                                <TableRow>
                                                                                    <TableHead>FY</TableHead>
                                                                                    <TableHead className="text-right">Annual Dep. (10%)</TableHead>
                                                                                    <TableHead className="text-right">Insurance Value</TableHead>
                                                                                </TableRow>
                                                                            </TableHeader>
                                                                            <TableBody>
                                                                                {row.depreciation_by_fy.map((d) => (
                                                                                    <TableRow key={d.fy}>
                                                                                        <TableCell>{d.fy}</TableCell>
                                                                                        <TableCell className="text-right">
                                                                                            {d.annualDepreciationNpr > 0
                                                                                                ? formatUsd(d.annualDepreciationNpr)
                                                                                                : '—'}
                                                                                        </TableCell>
                                                                                        <TableCell className="text-right">
                                                                                            {formatUsd(d.bookValueEndOfFy)}
                                                                                        </TableCell>
                                                                                    </TableRow>
                                                                                ))}
                                                                            </TableBody>
                                                                        </Table>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </Fragment>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}

                    {totalPages > 1 && (
                        <div className="flex items-center justify-between mt-4">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page <= 1}
                            >
                                <ChevronLeft className="h-4 w-4" />
                                Previous
                            </Button>
                            <span className="text-sm text-gray-600">
                                Page {page} of {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                            >
                                Next
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {fiscalYearColumns.length > 0 && (
                <p className="text-xs text-gray-500 text-center">
                    Excel export includes insurance depreciation columns for FY{' '}
                    {fiscalYearColumns[0]} through {fiscalYearColumns[fiscalYearColumns.length - 1]}.
                </p>
            )}

            <Dialog open={isExportModalOpen} onOpenChange={setIsExportModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Export Insurance Report</DialogTitle>
                        <DialogDescription>
                            Download equipment insurance details, per-FY 10% depreciation from FY {insuranceBaselineFy}, and insurance values for FY {selectedFy}.
                        </DialogDescription>
                    </DialogHeader>
                    <RadioGroup value={exportType} onValueChange={setExportType} className="space-y-3">
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="all" id="export-all" />
                            <Label htmlFor="export-all">All matching equipment ({total})</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="currentPage" id="export-page" />
                            <Label htmlFor="export-page">Current page only</Label>
                        </div>
                    </RadioGroup>
                    <div className="flex justify-end gap-2 mt-4">
                        <Button variant="outline" onClick={() => setIsExportModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleExport}
                            disabled={exporting}
                            className="bg-[#7c3aed] hover:bg-[#6d28d9]"
                        >
                            {exporting ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <Download className="h-4 w-4 mr-2" />
                            )}
                            Download
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
