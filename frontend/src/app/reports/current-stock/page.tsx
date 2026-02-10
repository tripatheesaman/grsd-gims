'use client';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { API } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger, } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem, } from '@/components/ui/radio-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, } from '@/components/ui/card';
import { format, startOfDay } from 'date-fns';
import { CalendarIcon, Download, Loader2, Search, X, ChevronLeft, ChevronRight, Eye, Package, ArrowDownCircle, ArrowUpCircle, TrendingUp, FileText, Clock, ChevronDown, ChevronUp, List, ShoppingCart, DollarSign, Building2, Receipt } from 'lucide-react';
import { cn } from '@/utils/utils';
import { TimeSeriesChart } from '@/components/dashboard/TimeSeriesChart';
interface StockReportItem {
    nac_code: string;
    item_name: string;
    part_number: string;
    alternate_part_numbers: string;
    equipment_number: string;
    alternate_equipment_numbers: string;
    open_quantity: number;
    open_amount: number;
    received_quantity: number;
    rrp_quantity: number;
    rrp_amount: number;
    issue_quantity: number;
    issue_amount: number;
    balance_quantity: number;
    true_balance_quantity: number;
    true_balance_amount: number;
    location: string;
    card_number: string;
}
interface StockHistoryItem {
    transaction_type: 'RECEIVE' | 'ISSUE';
    transaction_date: string;
    transaction_number: string;
    quantity: number;
    amount: number;
    received_by?: string;
    issued_by?: string | {
        name: string;
    };
    issued_for?: string;
    approval_status: string;
    request_number?: string;
    rrp_fk?: number;
    part_number?: string;
    equipment_number?: string;
    received_quantity?: number;
    issue_quantity?: number;
    issue_cost?: number;
    rrp_amount?: number;
}
interface RRPDetail {
    id: number;
    rrp_number: string | null;
    approval_status: string;
    supplier_name: string | null;
    date: string;
    currency: string | null;
    item_price: number;
    total_amount: number;
    received_quantity: number;
    unit: string | null;
    invoice_number?: string | null;
    invoice_date?: string | null;
    po_number?: string | null;
    request_number?: string | null;
    part_number?: string | null;
    item_name?: string | null;
    customs_charge: number;
    freight_charge: number;
    customs_service_charge: number;
    forex_rate?: string | null;
    vat_percentage?: string | null;
    airway_bill_number?: string | null;
    entry_type?: string | null;
    location?: string | null;
    card_number?: string | null;
    tender_reference_number?: string | null;
}
interface IssueDetail {
    id: number;
    issue_slip_number: string | null;
    issue_date: string;
    issued_for: string | null;
    issued_by: string | {
        name: string;
    };
    issue_quantity: number;
    issue_cost: number;
    remaining_balance: number;
    approval_status: string;
    part_number?: string | null;
    request_number?: string | null;
    equipment_number?: string | null;
    issue_type?: string | null;
}
interface ReceiveDetail {
    id: number;
    receive_number: string | null;
    receive_date: string;
    received_by: string | null;
    request_number?: string | null;
    receive_source?: string | null;
    approval_status: string;
    received_quantity: number;
    unit?: string | null;
    location?: string | null;
    card_number?: string | null;
    item_name?: string | null;
    part_number?: string | null;
    equipment_number?: string | null;
    tender_reference_number?: string | null;
}
type FilteredRecord = RRPDetail | IssueDetail | ReceiveDetail;
type ExportType = 'currentPage' | 'dateRange' | 'all';
const isIssueDetailRecord = (record: IssueDetail | StockHistoryItem): record is IssueDetail => 'issue_cost' in record;
const isReceiveDetailRecord = (record: ReceiveDetail | StockHistoryItem): record is ReceiveDetail => 'received_quantity' in record;
interface ExportPayload {
    exportType: ExportType;
    page?: number;
    pageSize?: number;
    fromDate?: string;
    toDate?: string;
    nacCode?: string;
    itemName?: string;
    partNumber?: string;
    equipmentNumber?: string;
    createdDateFrom?: string;
    createdDateTo?: string;
}
interface ApiErrorResponse {
    response?: {
        data?: {
            message?: string;
        };
    };
}
const getErrorMessage = (error: unknown, fallback: string): string => {
    if (typeof error === 'object' && error !== null) {
        const apiError = error as ApiErrorResponse;
        if (apiError.response?.data?.message) {
            return apiError.response.data.message;
        }
    }
    if (error instanceof Error) {
        return error.message;
    }
    return fallback;
};
type ChartPoint = {
    date: string;
    value: number;
};
export default function CurrentStockReportPage() {
    const { permissions } = useAuthContext();
    const canAccessReport = permissions?.includes('can_generate_current_stock_report');
    const canSeeStockHistory = permissions?.includes('can_see_stock_history');
    const { toast } = useToast();
    const [data, setData] = useState<StockReportItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const defaultFromDate = new Date('2025-07-17');
    const defaultToDate = new Date();
    const [nacCode, setNacCode] = useState('');
    const [itemName, setItemName] = useState('');
    const [partNumber, setPartNumber] = useState('');
    const [equipmentNumber, setEquipmentNumber] = useState('');
    const [fromDate, setFromDate] = useState<Date | undefined>(defaultFromDate);
    const [toDate, setToDate] = useState<Date | undefined>(defaultToDate);
    const [createdDateFrom, setCreatedDateFrom] = useState<Date | undefined>(undefined);
    const [createdDateTo, setCreatedDateTo] = useState<Date | undefined>(undefined);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportType, setExportType] = useState<ExportType>('currentPage');
    const [exportFromDate, setExportFromDate] = useState<Date | undefined>(defaultFromDate);
    const [exportToDate, setExportToDate] = useState<Date | undefined>(defaultToDate);
    const [exporting, setExporting] = useState(false);
    const [previewItem, setPreviewItem] = useState<StockReportItem | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [stockHistory, setStockHistory] = useState<StockHistoryItem[]>([]);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [exportingHistory, setExportingHistory] = useState(false);
    const [showReceivesDetails, setShowReceivesDetails] = useState(false);
    const [showIssuesDetails, setShowIssuesDetails] = useState(false);
    const [showAllReceives, setShowAllReceives] = useState(false);
    const [showAllIssues, setShowAllIssues] = useState(false);
    const [recordsToShow] = useState(5);
    const [rrpDetails, setRrpDetails] = useState<RRPDetail[]>([]);
    const [isRRPModalOpen, setIsRRPModalOpen] = useState(false);
    const [isLoadingRRP, setIsLoadingRRP] = useState(false);
    const [selectedRRPRecord, setSelectedRRPRecord] = useState<RRPDetail | null>(null);
    const [isRRPRecordModalOpen, setIsRRPRecordModalOpen] = useState(false);
    const [issueDetails, setIssueDetails] = useState<IssueDetail[]>([]);
    const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
    const [isLoadingIssue, setIsLoadingIssue] = useState(false);
    const [selectedIssueRecord, setSelectedIssueRecord] = useState<IssueDetail | null>(null);
    const [isIssueRecordModalOpen, setIsIssueRecordModalOpen] = useState(false);
    const [receiveDetails, setReceiveDetails] = useState<ReceiveDetail[]>([]);
    const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
    const [isLoadingReceive, setIsLoadingReceive] = useState(false);
    const [selectedReceiveRecord, setSelectedReceiveRecord] = useState<ReceiveDetail | null>(null);
    const [isReceiveRecordModalOpen, setIsReceiveRecordModalOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [selectedDateType, setSelectedDateType] = useState<'rrps' | 'issues' | 'receives' | 'requests' | null>(null);
    const [isDateFilterModalOpen, setIsDateFilterModalOpen] = useState(false);
    const [filteredRecords, setFilteredRecords] = useState<FilteredRecord[]>([]);
    const receiveTransactions = useMemo(() => stockHistory.filter((h) => h.transaction_type === 'RECEIVE'), [stockHistory]);
    const issueTransactions = useMemo(() => stockHistory.filter((h) => h.transaction_type === 'ISSUE'), [stockHistory]);
    const priceChartSeries = useMemo<ChartPoint[]>(() => {
        return (rrpDetails.length > 0 ? rrpDetails : [])
            .filter((r) => r?.date && Number(r.item_price ?? 0) > 0)
            .map((r) => ({
            date: r.date,
            value: Number(r.item_price ?? 0) || 0,
        }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [rrpDetails]);
    const issueCostSeries = useMemo<ChartPoint[]>(() => {
        const source = issueDetails.length > 0 ? issueDetails : issueTransactions;
        return source
            .filter((i) => {
            const date = 'issue_date' in i ? i.issue_date : i.transaction_date;
            const value = Number(isIssueDetailRecord(i) ? i.issue_cost : (i.amount ?? 0));
            return date && value > 0;
        })
            .map((i) => {
            const date = 'issue_date' in i ? i.issue_date : i.transaction_date;
            const value = Number(isIssueDetailRecord(i) ? i.issue_cost : (i.amount ?? 0)) || 0;
            return { date, value };
        })
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [issueDetails, issueTransactions]);
    const issueQuantitySeries = useMemo<ChartPoint[]>(() => {
        const source = issueDetails.length > 0 ? issueDetails : issueTransactions;
        return source
            .filter((i) => {
            const date = 'issue_date' in i ? i.issue_date : i.transaction_date;
            const value = Number(isIssueDetailRecord(i) ? i.issue_quantity : (i.quantity ?? 0));
            return date && value > 0;
        })
            .map((i) => {
            const date = 'issue_date' in i ? i.issue_date : i.transaction_date;
            const value = Number(isIssueDetailRecord(i) ? i.issue_quantity : (i.quantity ?? 0)) || 0;
            return { date, value };
        })
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [issueDetails, issueTransactions]);
    const receiveQuantitySeries = useMemo<ChartPoint[]>(() => {
        const source = receiveDetails.length > 0 ? receiveDetails : receiveTransactions;
        return source
            .filter((r) => {
            const date = 'receive_date' in r ? r.receive_date : r.transaction_date;
            const value = Number(isReceiveDetailRecord(r) ? r.received_quantity : (r.quantity ?? 0));
            return date && value > 0;
        })
            .map((r) => {
            const date = 'receive_date' in r ? r.receive_date : r.transaction_date;
            const value = Number(isReceiveDetailRecord(r) ? r.received_quantity : (r.quantity ?? 0)) || 0;
            return { date, value };
        })
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [receiveDetails, receiveTransactions]);
    const issueDetailGroups = useMemo(() => {
        const grouped = new Map<string, {
            dateKey: string;
            dateLabel: string;
            totalQuantity: number;
            totalCost: number;
            statusCounts: Record<string, number>;
        }>();
        issueDetails.forEach((issue) => {
            const dateObj = new Date(issue.issue_date);
            const dateKey = format(dateObj, 'yyyy-MM-dd');
            const dateLabel = format(dateObj, 'MMM dd, yyyy');
            if (!grouped.has(dateKey)) {
                grouped.set(dateKey, {
                    dateKey,
                    dateLabel,
                    totalQuantity: 0,
                    totalCost: 0,
                    statusCounts: {},
                });
            }
            const entry = grouped.get(dateKey)!;
            entry.totalQuantity += issue.issue_quantity;
            entry.totalCost += issue.issue_cost;
            const status = issue.approval_status || 'UNKNOWN';
            entry.statusCounts[status] = (entry.statusCounts[status] || 0) + 1;
        });
        return Array.from(grouped.values()).sort((a, b) => new Date(b.dateKey).getTime() - new Date(a.dateKey).getTime());
    }, [issueDetails]);
    const summaryStats = useMemo(() => {
        const totalReceivedQty = receiveTransactions.reduce((sum, r) => sum + (Number(r.quantity ?? r.received_quantity ?? 0) || 0), 0);
        const totalIssuedQty = issueTransactions.reduce((sum, i) => sum + (Number(i.quantity ?? i.issue_quantity ?? 0) || 0), 0);
        const totalReceivedAmt = receiveTransactions.reduce((sum, r) => sum + (Number(r.amount ?? r.rrp_amount ?? 0) || 0), 0);
        const totalIssuedAmt = issueTransactions.reduce((sum, i) => sum + (Number(i.amount ?? i.issue_cost ?? 0) || 0), 0);
        const approvedReceives = receiveTransactions.filter((r) => r.approval_status === 'APPROVED').length;
        const pendingReceives = receiveTransactions.filter((r) => r.approval_status === 'PENDING').length;
        const approvedIssues = issueTransactions.filter((i) => i.approval_status === 'APPROVED').length;
        const pendingIssues = issueTransactions.filter((i) => i.approval_status === 'PENDING').length;
        return {
            receivesCount: receiveTransactions.length,
            issuesCount: issueTransactions.length,
            totalReceivedQty,
            totalIssuedQty,
            totalReceivedAmt,
            totalIssuedAmt,
            netQuantity: totalReceivedQty - totalIssuedQty,
            netAmount: totalReceivedAmt - totalIssuedAmt,
            approvedReceives,
            pendingReceives,
            approvedIssues,
            pendingIssues,
        };
    }, [receiveTransactions, issueTransactions]);
    const displayReceives = useMemo(() => (showAllReceives ? receiveTransactions : receiveTransactions.slice(0, recordsToShow)), [receiveTransactions, showAllReceives, recordsToShow]);
    const displayIssues = useMemo(() => (showAllIssues ? issueTransactions : issueTransactions.slice(0, recordsToShow)), [issueTransactions, showAllIssues, recordsToShow]);
    const hasMoreReceives = receiveTransactions.length > recordsToShow;
    const hasMoreIssues = issueTransactions.length > recordsToShow;
    const receivesHaveRRP = useMemo(() => receiveTransactions.some((r) => r.rrp_fk), [receiveTransactions]);
    const fetchReport = useCallback(async () => {
        if (!canAccessReport)
            return;
        if (!fromDate || !toDate)
            return;
        setIsLoading(true);
        try {
            const response = await API.get('/api/report/current-stock', {
                params: {
                    fromDate: format(startOfDay(fromDate), 'yyyy-MM-dd'),
                    toDate: format(startOfDay(toDate), 'yyyy-MM-dd'),
                    nacCode: nacCode || undefined,
                    itemName: itemName || undefined,
                    partNumber: partNumber || undefined,
                    equipmentNumber: equipmentNumber || undefined,
                    createdDateFrom: createdDateFrom ? format(startOfDay(createdDateFrom), 'yyyy-MM-dd') : undefined,
                    createdDateTo: createdDateTo ? format(startOfDay(createdDateTo), 'yyyy-MM-dd') : undefined,
                    page,
                    pageSize: 20,
                },
            });
            if (response.status === 200) {
                setData(response.data.data || []);
                setTotal(response.data.pagination?.totalCount || 0);
                setTotalPages(response.data.pagination?.totalPages || 1);
            }
        }
        catch (error: unknown) {
            const description = getErrorMessage(error, 'Failed to fetch report');
            toast({
                title: 'Error',
                description,
                variant: 'destructive',
                duration: 3000,
            });
        }
        finally {
            setIsLoading(false);
        }
    }, [canAccessReport, fromDate, toDate, nacCode, itemName, partNumber, equipmentNumber, createdDateFrom, createdDateTo, page, toast]);
    useEffect(() => {
        if (fromDate && toDate) {
            fetchReport();
        }
    }, [fetchReport, fromDate, toDate]);
    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        fetchReport();
    };
    const handleClearSearch = () => {
        setNacCode('');
        setItemName('');
        setPartNumber('');
        setEquipmentNumber('');
        setFromDate(defaultFromDate);
        setToDate(defaultToDate);
        setCreatedDateFrom(undefined);
        setCreatedDateTo(undefined);
        setPage(1);
    };
    const handleExport = async () => {
        if (exportType === 'dateRange' && (!exportFromDate || !exportToDate)) {
            toast({
                title: 'Error',
                description: 'Please select both from and to dates for date range export',
                variant: 'destructive',
                duration: 3000,
            });
            return;
        }
        setExporting(true);
        try {
            const exportPayload: ExportPayload = { exportType };
            if (exportType === 'dateRange' && exportFromDate && exportToDate) {
                exportPayload.fromDate = format(exportFromDate, 'yyyy-MM-dd');
                exportPayload.toDate = format(exportToDate, 'yyyy-MM-dd');
            }
            else if (exportType === 'currentPage') {
                exportPayload.page = page;
                exportPayload.pageSize = 20;
            }
            else if (exportType === 'all') {
                exportPayload.page = 1;
                exportPayload.pageSize = 10000;
            }
            if (nacCode)
                exportPayload.nacCode = nacCode;
            if (itemName)
                exportPayload.itemName = itemName;
            if (partNumber)
                exportPayload.partNumber = partNumber;
            if (equipmentNumber)
                exportPayload.equipmentNumber = equipmentNumber;
            if (fromDate)
                exportPayload.fromDate = format(startOfDay(fromDate), 'yyyy-MM-dd');
            if (toDate)
                exportPayload.toDate = format(startOfDay(toDate), 'yyyy-MM-dd');
            if (createdDateFrom)
                exportPayload.createdDateFrom = format(startOfDay(createdDateFrom), 'yyyy-MM-dd');
            if (createdDateTo)
                exportPayload.createdDateTo = format(startOfDay(createdDateTo), 'yyyy-MM-dd');
            const response = await API.post('/api/report/current-stock/export', exportPayload, {
                responseType: 'blob'
            });
            if (response.status === 200) {
                const blob = new Blob([response.data]);
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Current_Stock_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                toast({
                    title: 'Success',
                    description: 'Report exported successfully',
                    duration: 3000,
                });
                setIsExportModalOpen(false);
            }
            else {
                throw new Error('Export failed');
            }
        }
        catch (error: unknown) {
            const description = getErrorMessage(error, 'Failed to export report. Please try again.');
            toast({
                title: 'Export Failed',
                description,
                variant: 'destructive',
                duration: 5000,
            });
        }
        finally {
            setExporting(false);
        }
    };
    const handleGetStockHistory = async () => {
        if (!previewItem || !fromDate || !toDate)
            return;
        setIsLoadingHistory(true);
        setShowReceivesDetails(false);
        setShowIssuesDetails(false);
        setShowAllReceives(false);
        setShowAllIssues(false);
        try {
            const response = await API.get('/api/report/stock-history', {
                params: {
                    nacCode: previewItem.nac_code,
                    fromDate: format(startOfDay(fromDate), 'yyyy-MM-dd'),
                    toDate: format(startOfDay(toDate), 'yyyy-MM-dd'),
                },
            });
            if (response.status === 200) {
                setStockHistory(response.data.history || []);
                setIsHistoryModalOpen(true);
            }
        }
        catch (error: unknown) {
            const description = getErrorMessage(error, 'Failed to fetch stock history');
            toast({
                title: 'Error',
                description,
                variant: 'destructive',
                duration: 3000,
            });
        }
        finally {
            setIsLoadingHistory(false);
        }
    };
    const handleExportHistory = async () => {
        if (!previewItem || !fromDate || !toDate)
            return;
        setExportingHistory(true);
        try {
            const response = await API.post('/api/report/stock-history/export', {
                nacCode: previewItem.nac_code,
                fromDate: format(startOfDay(fromDate), 'yyyy-MM-dd'),
                toDate: format(startOfDay(toDate), 'yyyy-MM-dd'),
            }, {
                responseType: 'blob',
            });
            if (response.status === 200) {
                const blob = new Blob([response.data]);
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Stock_History_${previewItem.nac_code}_${new Date().toISOString().split('T')[0]}.xlsx`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                toast({
                    title: 'Success',
                    description: 'Stock history exported successfully',
                    duration: 3000,
                });
            }
            else {
                throw new Error('Export failed');
            }
        }
        catch (error: unknown) {
            const description = getErrorMessage(error, 'Failed to export stock history. Please try again.');
            toast({
                title: 'Export Failed',
                description,
                variant: 'destructive',
                duration: 5000,
            });
        }
        finally {
            setExportingHistory(false);
        }
    };
    const handleViewPurchaseDetails = async () => {
        if (!previewItem || !fromDate || !toDate)
            return;
        setIsLoadingRRP(true);
        try {
            const response = await API.get('/api/report/rrp-details', {
                params: {
                    nacCode: previewItem.nac_code,
                    fromDate: format(startOfDay(fromDate), 'yyyy-MM-dd'),
                    toDate: format(startOfDay(toDate), 'yyyy-MM-dd'),
                },
            });
            if (response.status === 200) {
                setRrpDetails(response.data.rrpDetails || []);
                setIsRRPModalOpen(true);
            }
        }
        catch (error: unknown) {
            const description = getErrorMessage(error, 'Failed to fetch purchase details');
            toast({
                title: 'Error',
                description,
                variant: 'destructive',
                duration: 3000,
            });
        }
        finally {
            setIsLoadingRRP(false);
        }
    };
    const handleViewRRPRecord = (rrpRecord: RRPDetail) => {
        setSelectedRRPRecord(rrpRecord);
        setIsRRPRecordModalOpen(true);
    };
    const handleViewIssueDetails = async () => {
        if (!previewItem || !fromDate || !toDate)
            return;
        setIsLoadingIssue(true);
        try {
            const response = await API.get('/api/report/issue-details', {
                params: {
                    nacCode: previewItem.nac_code,
                    fromDate: format(startOfDay(fromDate), 'yyyy-MM-dd'),
                    toDate: format(startOfDay(toDate), 'yyyy-MM-dd'),
                },
            });
            if (response.status === 200) {
                setIssueDetails(response.data.issueDetails || []);
                setIsIssueModalOpen(true);
            }
        }
        catch (error: unknown) {
            const description = getErrorMessage(error, 'Failed to fetch issue details');
            toast({
                title: 'Error',
                description,
                variant: 'destructive',
                duration: 3000,
            });
        }
        finally {
            setIsLoadingIssue(false);
        }
    };
    const handleViewReceiveDetails = async () => {
        if (!previewItem || !fromDate || !toDate)
            return;
        setIsLoadingReceive(true);
        try {
            const response = await API.get('/api/report/receive-details', {
                params: {
                    nacCode: previewItem.nac_code,
                    fromDate: format(startOfDay(fromDate), 'yyyy-MM-dd'),
                    toDate: format(startOfDay(toDate), 'yyyy-MM-dd'),
                },
            });
            if (response.status === 200) {
                setReceiveDetails(response.data.receiveDetails || []);
                setIsReceiveModalOpen(true);
            }
        }
        catch (error: unknown) {
            const description = getErrorMessage(error, 'Failed to fetch receive details');
            toast({
                title: 'Error',
                description,
                variant: 'destructive',
                duration: 3000,
            });
        }
        finally {
            setIsLoadingReceive(false);
        }
    };
    const handleViewReceiveRecord = (receiveRecord: ReceiveDetail) => {
        setSelectedReceiveRecord(receiveRecord);
        setIsReceiveRecordModalOpen(true);
    };
    const handleDateClick = (date: string, type: 'rrps' | 'issues' | 'receives' | 'requests') => {
        setSelectedDate(date);
        setSelectedDateType(type);
        let filtered: FilteredRecord[] = [];
        try {
            const selectedDateObj = new Date(date);
            const selectedDateStr = format(selectedDateObj, 'yyyy-MM-dd');
            if (type === 'rrps') {
                filtered = rrpDetails.filter(r => {
                    if (!r.date)
                        return false;
                    try {
                        const recordDate = format(new Date(r.date), 'yyyy-MM-dd');
                        return recordDate === selectedDateStr;
                    }
                    catch {
                        return false;
                    }
                });
            }
            else if (type === 'issues') {
                filtered = issueDetails.filter(i => {
                    if (!i.issue_date)
                        return false;
                    try {
                        const recordDate = format(new Date(i.issue_date), 'yyyy-MM-dd');
                        return recordDate === selectedDateStr;
                    }
                    catch {
                        return false;
                    }
                });
            }
            else if (type === 'receives') {
                filtered = receiveDetails.filter(r => {
                    if (!r.receive_date)
                        return false;
                    try {
                        const recordDate = format(new Date(r.receive_date), 'yyyy-MM-dd');
                        return recordDate === selectedDateStr;
                    }
                    catch {
                        return false;
                    }
                });
            }
            else if (type === 'requests') {
                filtered = [];
            }
        }
        catch {
            filtered = [];
        }
        setFilteredRecords(filtered);
        setIsDateFilterModalOpen(true);
    };
    if (!canAccessReport) {
        return (<div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 bg-[#f6f8fc]/80 p-6 text-center">
        <h1 className="text-lg font-semibold text-[#003594]">Access Denied</h1>
        <p className="max-w-md text-sm text-gray-600">
          You do not have permission to access this report. If you believe this is a mistake, please contact an administrator.
        </p>
      </div>);
    }
    const getDisplayPartNumbers = (item: StockReportItem): string => {
        const parts = [item.part_number, item.alternate_part_numbers].filter(Boolean);
        return parts.join(', ') || '';
    };
    const getDisplayEquipmentNumbers = (item: StockReportItem): string => {
        const parts = [item.equipment_number, item.alternate_equipment_numbers].filter(Boolean);
        return parts.join(', ') || '';
    };
    return (<div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-2 py-6 max-w-full">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
           Stock Report
          </h1>
          <p className="text-gray-600 mt-1">View comprehensive stock report with balances and transactions</p>
        </div>
        <Button onClick={() => setIsExportModalOpen(true)} className="bg-[#003594] hover:bg-[#003594]/90 text-white">
          <Download className="h-4 w-4 mr-2"/>
          Export to Excel
        </Button>
      </div>

          <Card className="border-[#002a6e]/10">
            <CardHeader>
              <CardTitle>Search & Filter</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSearch} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#003594]">NAC Code</Label>
                    <Input value={nacCode} onChange={(e) => setNacCode(e.target.value)} placeholder="Search by NAC code" className="bg-white border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20"/>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#003594]">Item Name</Label>
                    <Input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Search by item name" className="bg-white border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20"/>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#003594]">Part Number</Label>
                    <Input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} placeholder="Search by part number" className="bg-white border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20"/>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#003594]">Equipment Number</Label>
                    <Input value={equipmentNumber} onChange={(e) => setEquipmentNumber(e.target.value)} placeholder="Search by equipment number" className="bg-white border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20"/>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#003594]">From Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn('w-full justify-start text-left font-normal bg-white border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20', !fromDate && 'text-muted-foreground')}>
                          <CalendarIcon className="mr-2 h-4 w-4"/>
                          {fromDate ? format(fromDate, 'PPP') : 'Select date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 bg-white" align="start">
                        <Calendar value={fromDate} onChange={(date) => setFromDate(date || undefined)}/>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#003594]">To Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn('w-full justify-start text-left font-normal bg-white border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20', !toDate && 'text-muted-foreground')}>
                          <CalendarIcon className="mr-2 h-4 w-4"/>
                          {toDate ? format(toDate, 'PPP') : 'Select date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 bg-white" align="start">
                        <Calendar value={toDate} onChange={(date) => setToDate(date || undefined)}/>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#003594]">Created Date From</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn('w-full justify-start text-left font-normal bg-white border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20', !createdDateFrom && 'text-muted-foreground')}>
                          <CalendarIcon className="mr-2 h-4 w-4"/>
                          {createdDateFrom ? format(createdDateFrom, 'PPP') : 'Select date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 bg-white" align="start">
                        <Calendar value={createdDateFrom} onChange={(date) => setCreatedDateFrom(date || undefined)}/>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#003594]">Created Date To</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn('w-full justify-start text-left font-normal bg-white border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20', !createdDateTo && 'text-muted-foreground')}>
                          <CalendarIcon className="mr-2 h-4 w-4"/>
                          {createdDateTo ? format(createdDateTo, 'PPP') : 'Select date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 bg-white" align="start">
                        <Calendar value={createdDateTo} onChange={(date) => setCreatedDateTo(date || undefined)}/>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" onClick={handleClearSearch} variant="outline" className="border-[#002a6e]/20 hover:bg-[#003594]/5 hover:text-[#003594]">
                    <X className="h-4 w-4 mr-2"/>
                    Clear
                  </Button>
                  <Button type="submit" className="bg-[#003594] hover:bg-[#003594]/90 text-white">
                    <Search className="h-4 w-4 mr-2"/>
                    Search
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="border-[#002a6e]/10">
            <CardHeader>
              <CardTitle>
                Report Results ({total} total)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (<div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-[#003594]"/>
                </div>) : data.length === 0 ? (<div className="text-center py-12 text-gray-500">
                  <p>No data found. Try adjusting your filters.</p>
                </div>) : (<div className="overflow-x-auto -mx-4 px-4">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px] px-2">NAC Code</TableHead>
                        <TableHead className="w-[150px] px-2">Item Name</TableHead>
                        <TableHead className="w-[120px] px-2">Part Number</TableHead>
                        <TableHead className="w-[120px] px-2">Equipment</TableHead>
                        <TableHead className="w-[70px] px-2 text-right">Open Qty</TableHead>
                        <TableHead className="w-[80px] px-2 text-right">Open Amt</TableHead>
                        <TableHead className="w-[75px] px-2 text-right">Recv Qty</TableHead>
                        <TableHead className="w-[70px] px-2 text-right">RRP Qty</TableHead>
                        <TableHead className="w-[80px] px-2 text-right">RRP Amt</TableHead>
                        <TableHead className="w-[70px] px-2 text-right">Issue Qty</TableHead>
                        <TableHead className="w-[80px] px-2 text-right">Issue Amt</TableHead>
                        <TableHead className="w-[75px] px-2 text-right">Bal Qty</TableHead>
                        <TableHead className="w-[85px] px-2 text-right">True Bal Qty</TableHead>
                        <TableHead className="w-[90px] px-2 text-right">True Bal Amt</TableHead>
                        <TableHead className="w-[100px] px-2">Location</TableHead>
                        <TableHead className="w-[90px] px-2">Card #</TableHead>
                        <TableHead className="w-[60px] px-2 text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.map((item, index) => (<TableRow key={`${item.nac_code}-${index}`}>
                          <TableCell className="px-2 font-medium text-xs">{item.nac_code || ''}</TableCell>
                          <TableCell className="px-2 text-xs truncate max-w-[150px]" title={item.item_name || ''}>{item.item_name || ''}</TableCell>
                          <TableCell className="px-2 text-xs truncate max-w-[120px]" title={getDisplayPartNumbers(item) || ''}>{getDisplayPartNumbers(item) || ''}</TableCell>
                          <TableCell className="px-2 text-xs truncate max-w-[120px]" title={getDisplayEquipmentNumbers(item) || ''}>{getDisplayEquipmentNumbers(item) || ''}</TableCell>
                          <TableCell className="px-2 text-xs text-right">{item.open_quantity?.toFixed(2) || '0.00'}</TableCell>
                          <TableCell className="px-2 text-xs text-right">{item.open_amount?.toFixed(2) || '0.00'}</TableCell>
                          <TableCell className="px-2 text-xs text-right">{item.received_quantity?.toFixed(2) || '0.00'}</TableCell>
                          <TableCell className="px-2 text-xs text-right">{item.rrp_quantity?.toFixed(2) || '0.00'}</TableCell>
                          <TableCell className="px-2 text-xs text-right">{item.rrp_amount?.toFixed(2) || '0.00'}</TableCell>
                          <TableCell className="px-2 text-xs text-right">{item.issue_quantity?.toFixed(2) || '0.00'}</TableCell>
                          <TableCell className="px-2 text-xs text-right">{item.issue_amount?.toFixed(2) || '0.00'}</TableCell>
                          <TableCell className="px-2 text-xs text-right">{item.balance_quantity?.toFixed(2) || '0.00'}</TableCell>
                          <TableCell className="px-2 text-xs text-right">{item.true_balance_quantity?.toFixed(2) || '0.00'}</TableCell>
                          <TableCell className="px-2 text-xs text-right">{item.true_balance_amount?.toFixed(2) || '0.00'}</TableCell>
                          <TableCell className="px-2 text-xs truncate max-w-[100px]" title={item.location || ''}>{item.location || ''}</TableCell>
                          <TableCell className="px-2 text-xs">{item.card_number || ''}</TableCell>
                          <TableCell className="px-2 text-center">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-[#003594]/10" onClick={() => {
                    setPreviewItem(item);
                    setIsPreviewOpen(true);
                }} title="Preview Details">
                              <Eye className="h-4 w-4 text-[#003594]"/>
                            </Button>
                          </TableCell>
                        </TableRow>))}
                    </TableBody>
                  </Table>
                </div>)}

              {totalPages > 1 && (<div className="flex justify-center items-center gap-2 mt-6">
                  <Button variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || isLoading} className="border-[#002a6e]/10">
                    <ChevronLeft className="h-4 w-4"/>
                    Previous
                  </Button>
                  <span className="text-sm text-gray-600">
                    Page {page} of {totalPages}
                  </span>
                  <Button variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages || isLoading} className="border-[#002a6e]/10">
                    Next
                    <ChevronRight className="h-4 w-4"/>
                  </Button>
                </div>)}
            </CardContent>
          </Card>
        </div>
      </div>

      
      <Dialog open={isExportModalOpen} onOpenChange={setIsExportModalOpen}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>Export Report</DialogTitle>
            <DialogDescription>
              Choose how you want to export the report
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <RadioGroup value={exportType} onValueChange={(value) => setExportType(value as ExportType)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="currentPage" id="currentPage"/>
                <Label htmlFor="currentPage" className="cursor-pointer">Current Page</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="all"/>
                <Label htmlFor="all" className="cursor-pointer">All Records (with current filters)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="dateRange" id="dateRange"/>
                <Label htmlFor="dateRange" className="cursor-pointer">Date Range</Label>
              </div>
            </RadioGroup>

            {exportType === 'dateRange' && (<div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>From Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn('w-full justify-start text-left font-normal bg-white', !exportFromDate && 'text-muted-foreground')}>
                        {exportFromDate ? format(exportFromDate, 'PPP') : 'Select date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-white" align="start">
                      <Calendar value={exportFromDate} onChange={(date) => setExportFromDate(date || undefined)}/>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>To Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn('w-full justify-start text-left font-normal bg-white', !exportToDate && 'text-muted-foreground')}>
                        {exportToDate ? format(exportToDate, 'PPP') : 'Select date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-white" align="start">
                      <Calendar value={exportToDate} onChange={(date) => setExportToDate(date || undefined)}/>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>)}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsExportModalOpen(false)} disabled={exporting}>
                Cancel
              </Button>
              <Button onClick={handleExport} disabled={exporting} className="bg-[#003594] hover:bg-[#003594]/90 text-white">
                {exporting ? (<>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin"/>
                    Exporting...
                  </>) : (<>
                    <Download className="h-4 w-4 mr-2"/>
                    Export
                  </>)}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
                  Stock Report Details - {previewItem?.nac_code}
                </DialogTitle>
                <DialogDescription>Complete details for this stock item</DialogDescription>
              </div>
              {canSeeStockHistory && previewItem && (<Button onClick={handleGetStockHistory} size="sm" variant="outline" className="h-8 gap-1 border-[#003594]/30 text-[#003594] hover:bg-[#003594]/10" disabled={isLoadingHistory}>
                  {isLoadingHistory ? (<>
                      <Loader2 className="h-3.5 w-3.5 animate-spin"/>
                      Loading
                    </>) : (<>
                      <Eye className="h-3.5 w-3.5"/>
                      Stock History
                    </>)}
                </Button>)}
            </div>
          </DialogHeader>
          {previewItem && (<div className="space-y-6 py-4">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-[#003594]">NAC Code</Label>
                  <p className="text-sm font-semibold">{previewItem.nac_code || '-'}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-[#003594]">Item Name</Label>
                  <p className="text-sm">{previewItem.item_name || '-'}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-[#003594]">Part Number</Label>
                  <p className="text-sm">{previewItem.part_number || '-'}</p>
                </div>
                {previewItem.alternate_part_numbers && (<div className="space-y-1">
                    <Label className="text-sm font-medium text-[#003594]">Alternate Part Numbers</Label>
                    <p className="text-sm">{previewItem.alternate_part_numbers}</p>
                  </div>)}
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-[#003594]">Equipment Number</Label>
                  <p className="text-sm">{previewItem.equipment_number || '-'}</p>
                </div>
                {previewItem.alternate_equipment_numbers && (<div className="space-y-1">
                    <Label className="text-sm font-medium text-[#003594]">Alternate Equipment Numbers</Label>
                    <p className="text-sm">{previewItem.alternate_equipment_numbers}</p>
                  </div>)}
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-[#003594]">Location</Label>
                  <p className="text-sm">{previewItem.location || '-'}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-[#003594]">Card Number</Label>
                  <p className="text-sm">{previewItem.card_number || '-'}</p>
                </div>
              </div>

              
              <div className="border-t border-[#002a6e]/10 pt-4">
                <h3 className="text-lg font-semibold text-[#003594] mb-4">Quantities & Amounts</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-[#003594]">Open Quantity</Label>
                    <p className="text-sm font-semibold">{previewItem.open_quantity?.toFixed(2) || '0.00'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-[#003594]">Open Amount</Label>
                    <p className="text-sm font-semibold">{previewItem.open_amount?.toFixed(2) || '0.00'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-[#003594]">Received Quantity</Label>
                    <p className="text-sm font-semibold">{previewItem.received_quantity?.toFixed(2) || '0.00'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-[#003594]">RRP Quantity</Label>
                    <p className="text-sm font-semibold">{previewItem.rrp_quantity?.toFixed(2) || '0.00'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-[#003594]">RRP Amount</Label>
                    <p className="text-sm font-semibold">{previewItem.rrp_amount?.toFixed(2) || '0.00'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-[#003594]">Issue Quantity</Label>
                    <p className="text-sm font-semibold">{previewItem.issue_quantity?.toFixed(2) || '0.00'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-[#003594]">Issue Amount</Label>
                    <p className="text-sm font-semibold">{previewItem.issue_amount?.toFixed(2) || '0.00'}</p>
                  </div>
                </div>
              </div>

              
              <div className="border-t border-[#002a6e]/10 pt-4">
                <h3 className="text-lg font-semibold text-[#003594] mb-4">Balance Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1 bg-blue-50 p-3 rounded-lg border border-blue-200">
                    <Label className="text-sm font-medium text-[#003594]">Balance Quantity</Label>
                    <p className="text-lg font-bold text-[#003594]">{previewItem.balance_quantity?.toFixed(2) || '0.00'}</p>
                    <p className="text-xs text-gray-600">Open + Received - Issued</p>
                  </div>
                  <div className="space-y-1 bg-green-50 p-3 rounded-lg border border-green-200">
                    <Label className="text-sm font-medium text-[#003594]">True Balance Quantity</Label>
                    <p className="text-lg font-bold text-[#003594]">{previewItem.true_balance_quantity?.toFixed(2) || '0.00'}</p>
                    <p className="text-xs text-gray-600">Open + RRP - Issued</p>
                  </div>
                  <div className="space-y-1 bg-purple-50 p-3 rounded-lg border border-purple-200">
                    <Label className="text-sm font-medium text-[#003594]">True Balance Amount</Label>
                    <p className="text-lg font-bold text-[#003594]">{previewItem.true_balance_amount?.toFixed(2) || '0.00'}</p>
                    <p className="text-xs text-gray-600">Open Amount + RRP Amount - Issue Amount</p>
                  </div>
                </div>
              </div>

            </div>)}
        </DialogContent>
      </Dialog>

      
      <Dialog open={isHistoryModalOpen} onOpenChange={setIsHistoryModalOpen}>
        <DialogContent className="max-w-7xl bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-[#002a6e]/10 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent flex items-center gap-2">
                  <Package className="h-6 w-6 text-[#003594]"/>
                  Stock Transaction History
                </DialogTitle>
                <DialogDescription className="mt-2 text-gray-600">
                  Complete transaction history for {previewItem?.nac_code} - {previewItem?.item_name}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                {stockHistory.length > 0 && (<Button variant="outline" size="sm" onClick={() => {
                const allVisible = showReceivesDetails && showIssuesDetails;
                setShowReceivesDetails(!allVisible);
                setShowIssuesDetails(!allVisible);
            }} className="border-[#002a6e]/20 hover:bg-[#003594]/5">
                    <List className="h-4 w-4 mr-2"/>
                    {showReceivesDetails && showIssuesDetails ? 'Hide All' : 'Show All'}
                  </Button>)}
                <Button onClick={handleExportHistory} disabled={exportingHistory} className="bg-[#003594] hover:bg-[#003594]/90 text-white">
                  {exportingHistory ? (<>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin"/>
                      Exporting...
                    </>) : (<>
                      <Download className="h-4 w-4 mr-2"/>
                      Export
                    </>)}
                </Button>
              </div>
            </div>
          </DialogHeader>

          {isLoadingHistory ? (<div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#003594]"/>
            </div>) : stockHistory.length === 0 ? (<div className="text-center py-12 text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-4 text-gray-400"/>
              <p className="text-lg font-medium">No history found</p>
              <p className="text-sm">No transactions found for the selected date range.</p>
            </div>) : (<div className="space-y-6 py-4">
              
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-100">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-[#003594] to-[#d2293b] rounded-lg flex items-center justify-center">
                    <Package className="w-6 h-6 text-white"/>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Stock Item Information</h3>
                    <p className="text-sm text-gray-600">Basic item details</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-[#003594] uppercase">NAC Code</p>
                    <p className="text-base font-semibold text-gray-900">{previewItem?.nac_code || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-[#003594] uppercase">Item Name</p>
                    <p className="text-base font-semibold text-gray-900 truncate" title={previewItem?.item_name}>{previewItem?.item_name || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-[#003594] uppercase">Location</p>
                    <p className="text-base font-semibold text-gray-900">{previewItem?.location || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-[#003594] uppercase">Card Number</p>
                    <p className="text-base font-semibold text-gray-900">{previewItem?.card_number || '-'}</p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-blue-200">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Clock className="h-4 w-4"/>
                    <span className="font-medium">Date Range:</span>
                    <span>{format(fromDate || new Date(), 'PPP')} to {format(toDate || new Date(), 'PPP')}</span>
                  </div>
                </div>
              </div>

            
            <div className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-[#003594]"/>
                <h3 className="text-lg font-bold text-gray-900">Transaction Summary</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-5 border-2 border-green-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                        <ArrowDownCircle className="h-5 w-5 text-white"/>
                      </div>
                      <p className="text-sm font-semibold text-green-800">Total Receives</p>
                    </div>
                    <span className="text-xs bg-green-500 text-white px-2.5 py-1 rounded-full font-bold">
                      {summaryStats.receivesCount}
                    </span>
                  </div>
                  <p className="text-3xl font-bold text-green-900 mb-1">{summaryStats.totalReceivedQty.toFixed(2)}</p>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-green-700 font-medium">✓ {summaryStats.approvedReceives} approved</span>
                    {summaryStats.pendingReceives > 0 && (<span className="text-yellow-700 font-medium">⏳ {summaryStats.pendingReceives} pending</span>)}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-lg p-5 border-2 border-red-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center">
                        <ArrowUpCircle className="h-5 w-5 text-white"/>
                      </div>
                      <p className="text-sm font-semibold text-red-800">Total Issues</p>
                    </div>
                    <span className="text-xs bg-red-500 text-white px-2.5 py-1 rounded-full font-bold">
                      {summaryStats.issuesCount}
                    </span>
                  </div>
                  <p className="text-3xl font-bold text-red-900 mb-1">{summaryStats.totalIssuedQty.toFixed(2)}</p>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-red-700 font-medium">✓ {summaryStats.approvedIssues} approved</span>
                    {summaryStats.pendingIssues > 0 && (<span className="text-yellow-700 font-medium">⏳ {summaryStats.pendingIssues} pending</span>)}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-5 border-2 border-blue-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                        <TrendingUp className="h-5 w-5 text-white"/>
                      </div>
                      <p className="text-sm font-semibold text-blue-800">Net Quantity</p>
                    </div>
                  </div>
                  <p className={`text-3xl font-bold mb-1 ${summaryStats.netQuantity >= 0 ? 'text-blue-900' : 'text-red-600'}`}>
                    {summaryStats.netQuantity >= 0 ? '+' : ''}{summaryStats.netQuantity.toFixed(2)}
                  </p>
                  <p className="text-xs text-blue-700 font-medium">Received - Issued</p>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-5 border-2 border-purple-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                        <FileText className="h-5 w-5 text-white"/>
                      </div>
                      <p className="text-sm font-semibold text-purple-800">Net Amount</p>
                    </div>
                  </div>
                  <p className={`text-3xl font-bold mb-1 ${summaryStats.netAmount >= 0 ? 'text-purple-900' : 'text-red-600'}`}>
                    {summaryStats.netAmount >= 0 ? '+' : ''}{summaryStats.netAmount.toFixed(2)}
                  </p>
                  <p className="text-xs text-purple-700 font-medium">Received Amount - Issued Amount</p>
                </div>
              </div>
            </div>

            
            {receiveTransactions.length > 0 && (<div className="space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b-2 border-green-200">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                          <ArrowDownCircle className="h-6 w-6 text-green-600"/>
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">Receive Transactions</h3>
                          <p className="text-sm text-gray-600">All receive records for this item</p>
                        </div>
                        <span className="text-sm bg-green-100 text-green-800 px-3 py-1 rounded-full font-medium">
                          {receiveTransactions.length} {receiveTransactions.length === 1 ? 'record' : 'records'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                      {receiveTransactions.length > 0 && (<Button variant="outline" size="sm" onClick={handleViewReceiveDetails} className="border-green-200 hover:bg-green-50 text-green-700">
                            <ArrowDownCircle className="h-4 w-4 mr-1"/>
                            View Receive Details
                          </Button>)}
                      {receivesHaveRRP && (<Button variant="outline" size="sm" onClick={handleViewPurchaseDetails} className="border-purple-200 hover:bg-purple-50 text-purple-700">
                            <ShoppingCart className="h-4 w-4 mr-1"/>
                            View Purchase Details
                          </Button>)}
                        <Button variant="outline" size="sm" onClick={() => setShowReceivesDetails(!showReceivesDetails)} className="border-green-200 hover:bg-green-50 text-green-700">
                          {showReceivesDetails ? (<>
                              <ChevronUp className="h-4 w-4 mr-1"/>
                              Hide Details
                            </>) : (<>
                              <ChevronDown className="h-4 w-4 mr-1"/>
                              Show Details
                            </>)}
                        </Button>
                      </div>
                    </div>

                    {!showReceivesDetails && (<div className="bg-green-50/50 rounded-lg p-4 border border-green-200 text-center">
                        <p className="text-sm text-gray-600">Click &quot;Show Details&quot; to view receive transactions</p>
                      </div>)}
                    {showReceivesDetails && (<div className="bg-white rounded-lg border border-green-100 overflow-hidden shadow-sm transition-all duration-300 animate-in fade-in slide-in-from-top-2">
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-gradient-to-r from-green-50 to-emerald-50">
                                <TableHead className="min-w-[120px] font-semibold text-green-900">Date</TableHead>
                                <TableHead className="min-w-[150px] font-semibold text-green-900">Transaction #</TableHead>
                                <TableHead className="min-w-[120px] text-right font-semibold text-green-900">Quantity</TableHead>
                                <TableHead className="min-w-[150px] font-semibold text-green-900">Request #</TableHead>
                                <TableHead className="min-w-[120px] font-semibold text-green-900">Part Number</TableHead>
                                <TableHead className="min-w-[150px] font-semibold text-green-900">Equipment</TableHead>
                                <TableHead className="min-w-[120px] font-semibold text-green-900">Received By</TableHead>
                                <TableHead className="min-w-[100px] font-semibold text-green-900">Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {displayReceives.map((item, index) => (<TableRow key={`receive-${item.transaction_number}-${index}`} className="hover:bg-green-50/50 transition-colors border-b border-green-50">
                                  <TableCell className="font-medium text-gray-900">
                                    {format(new Date(item.transaction_date), 'MMM dd, yyyy')}
                                  </TableCell>
                                  <TableCell>
                                    <span className="font-semibold text-green-700 bg-green-50 px-2 py-1 rounded">
                                      {item.transaction_number}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <span className="font-semibold text-green-700 text-lg">
                                      {item.quantity.toFixed(2)}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-gray-700">{item.request_number || '-'}</TableCell>
                                  <TableCell className="text-gray-700">{item.part_number || '-'}</TableCell>
                                  <TableCell className="text-gray-700">{item.equipment_number || '-'}</TableCell>
                                  <TableCell className="text-gray-700">{item.received_by || '-'}</TableCell>
                                  <TableCell>
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${item.approval_status === 'APPROVED'
                            ? 'bg-green-100 text-green-800 border border-green-200'
                            : item.approval_status === 'PENDING'
                                ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                                : 'bg-red-100 text-red-800 border border-red-200'}`}>
                                      {item.approval_status}
                                    </span>
                                  </TableCell>
                                </TableRow>))}
                            </TableBody>
                          </Table>
                        </div>
                        {hasMoreReceives && (<div className="border-t border-green-100 bg-green-50/50 p-4 flex justify-center">
                            <Button variant="ghost" size="sm" onClick={() => setShowAllReceives(!showAllReceives)} className="text-green-700 hover:text-green-800 hover:bg-green-100">
                              {showAllReceives ? (<>
                                  <ChevronUp className="h-4 w-4 mr-1"/>
                                  Show Less ({recordsToShow} records)
                                </>) : (<>
                                  <ChevronDown className="h-4 w-4 mr-1"/>
                                  Show All ({receiveTransactions.length} records)
                                </>)}
                            </Button>
                          </div>)}
                      </div>)}
                  </div>)}

              
              {issueTransactions.length > 0 && (<div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b-2 border-red-200">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                        <ArrowUpCircle className="h-6 w-6 text-red-600"/>
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">Issue Transactions</h3>
                        <p className="text-sm text-gray-600">All issue records for this item</p>
                      </div>
                      <span className="text-sm bg-red-100 text-red-800 px-3 py-1 rounded-full font-medium">
                        {issueTransactions.length} {issueTransactions.length === 1 ? 'record' : 'records'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={handleViewIssueDetails} className="border-red-200 hover:bg-red-50 text-red-700">
                        <ArrowUpCircle className="h-4 w-4 mr-1"/>
                        View Issue Details
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setShowIssuesDetails(!showIssuesDetails)} className="border-red-200 hover:bg-red-50 text-red-700">
                        {showIssuesDetails ? (<>
                            <ChevronUp className="h-4 w-4 mr-1"/>
                            Hide Details
                          </>) : (<>
                            <ChevronDown className="h-4 w-4 mr-1"/>
                            Show Details
                          </>)}
                      </Button>
                    </div>
                  </div>

                  {!showIssuesDetails && (<div className="bg-red-50/50 rounded-lg p-4 border border-red-200 text-center">
                      <p className="text-sm text-gray-600">Click &quot;Show Details&quot; to view issue transactions</p>
                    </div>)}

                  {showIssuesDetails && (<div className="bg-white rounded-lg border border-red-100 overflow-hidden shadow-sm transition-all duration-300 animate-in fade-in slide-in-from-top-2">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-gradient-to-r from-red-50 to-rose-50">
                              <TableHead className="min-w-[120px] font-semibold text-red-900">Date</TableHead>
                              <TableHead className="min-w-[150px] font-semibold text-red-900">Transaction #</TableHead>
                              <TableHead className="min-w-[120px] text-right font-semibold text-red-900">Quantity</TableHead>
                              <TableHead className="min-w-[120px] text-right font-semibold text-red-900">Amount</TableHead>
                              <TableHead className="min-w-[120px] font-semibold text-red-900">Part Number</TableHead>
                              <TableHead className="min-w-[150px] font-semibold text-red-900">Issued For</TableHead>
                              <TableHead className="min-w-[120px] font-semibold text-red-900">Issued By</TableHead>
                              <TableHead className="min-w-[100px] font-semibold text-red-900">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {displayIssues.map((item, index) => (<TableRow key={`issue-${item.transaction_number}-${index}`} className="hover:bg-red-50/50 transition-colors border-b border-red-50">
                                <TableCell className="font-medium text-gray-900">
                                  {format(new Date(item.transaction_date), 'MMM dd, yyyy')}
                                </TableCell>
                                <TableCell>
                                  <span className="font-semibold text-red-700 bg-red-50 px-2 py-1 rounded">
                                    {item.transaction_number}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  <span className="font-semibold text-red-700 text-lg">
                                    {Number(item.quantity ?? 0).toFixed(2)}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  <span className="font-semibold text-gray-900">
                                    {Number(item.amount ?? 0).toFixed(2)}
                                  </span>
                                </TableCell>
                                <TableCell className="text-gray-700">{item.part_number || '-'}</TableCell>
                                <TableCell className="text-gray-700">{item.issued_for || '-'}</TableCell>
                                <TableCell className="text-gray-700">
                                  {item.issued_by
                            ? typeof item.issued_by === 'object'
                                ? item.issued_by.name
                                : String(item.issued_by)
                            : '-'}
                                </TableCell>
                                <TableCell>
                                  <span className={cn('px-2 py-1 rounded text-xs font-medium', item.approval_status === 'APPROVED'
                            ? 'bg-green-100 text-green-800 border border-green-200'
                            : item.approval_status === 'PENDING'
                                ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                                : 'bg-red-100 text-red-800 border border-red-200')}>
                                    {item.approval_status}
                                  </span>
                                </TableCell>
                              </TableRow>))}
                          </TableBody>
                        </Table>
                      </div>
                      {hasMoreIssues && (<div className="border-t border-red-100 bg-red-50/50 p-4 flex justify-center">
                          <Button variant="ghost" size="sm" onClick={() => setShowAllIssues(!showAllIssues)} className="text-red-700 hover:text-red-800 hover:bg-red-100">
                            {showAllIssues ? (<>
                                <ChevronUp className="h-4 w-4 mr-1"/>
                                Show Less ({recordsToShow} records)
                              </>) : (<>
                                <ChevronDown className="h-4 w-4 mr-1"/>
                                Show All ({issueTransactions.length} records)
                              </>)}
                          </Button>
                        </div>)}
                    </div>)}
                </div>)}
            </div>)}
        </DialogContent>
      </Dialog>

      
      <Dialog open={isRRPModalOpen} onOpenChange={setIsRRPModalOpen}>
        <DialogContent className="max-w-7xl bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-[#002a6e]/10 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent flex items-center gap-2">
                  <ShoppingCart className="h-6 w-6 text-[#003594]"/>
                  Purchase Details (RRP)
                </DialogTitle>
                <DialogDescription className="mt-2 text-gray-600">
                  Purchase history and pricing information for {previewItem?.nac_code} - {previewItem?.item_name}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {isLoadingRRP ? (<div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#003594]"/>
            </div>) : rrpDetails.length === 0 ? (<div className="text-center py-12 text-gray-500">
              <ShoppingCart className="h-12 w-12 mx-auto mb-4 text-gray-400"/>
              <p className="text-lg font-medium">No purchase details found</p>
              <p className="text-sm">No RRP records found for the selected date range.</p>
            </div>) : (<div className="space-y-6 py-4">
              
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-200 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-white"/>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Price Trend</h3>
                    <p className="text-sm text-gray-600">Item price over time</p>
                  </div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-purple-100">
                  <TimeSeriesChart title="Item Price History" data={priceChartSeries} color="#8b5cf6" onDateClick={handleDateClick} chartType="rrps"/>
                </div>
              </div>

              
              <div className="space-y-4">
                <div className="flex items-center gap-3 pb-2 border-b-2 border-purple-200">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Receipt className="h-6 w-6 text-purple-600"/>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Purchase Records</h3>
                    <p className="text-sm text-gray-600">All RRP records for this item</p>
                  </div>
                  <span className="text-sm bg-purple-100 text-purple-800 px-3 py-1 rounded-full font-medium">
                    {rrpDetails.length} {rrpDetails.length === 1 ? 'record' : 'records'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {rrpDetails.map((rrp, index) => (<Card key={`rrp-${rrp.id}-${index}`} className="border-purple-200 hover:shadow-lg transition-shadow">
                      <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-200">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg font-bold text-purple-900">
                            {rrp.rrp_number || `RRP-${rrp.id}`}
                          </CardTitle>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${rrp.approval_status === 'APPROVED'
                    ? 'bg-green-100 text-green-800'
                    : rrp.approval_status === 'PENDING'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'}`}>
                            {rrp.approval_status}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs font-medium text-gray-500 uppercase">Supplier</p>
                            <p className="text-sm font-semibold text-gray-900 truncate" title={rrp.supplier_name ?? undefined}>
                              {rrp.supplier_name || '-'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500 uppercase">Date</p>
                            <p className="text-sm font-semibold text-gray-900">
                              {format(new Date(rrp.date), 'MMM dd, yyyy')}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500 uppercase">Item Price</p>
                            <p className="text-sm font-semibold text-purple-700">
                              {rrp.currency || 'NPR'} {rrp.item_price.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500 uppercase">Total Amount</p>
                            <p className="text-sm font-semibold text-purple-700">
                              {rrp.currency || 'NPR'} {rrp.total_amount.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500 uppercase">Quantity</p>
                            <p className="text-sm font-semibold text-gray-900">
                              {rrp.received_quantity.toFixed(2)} {rrp.unit || ''}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500 uppercase">Unit Price</p>
                            <p className="text-sm font-semibold text-purple-700">
                              {rrp.received_quantity > 0
                    ? `${rrp.currency || 'NPR'} ${(rrp.total_amount / rrp.received_quantity).toFixed(2)}`
                    : '-'}
                            </p>
                          </div>
                        </div>
                        <Button onClick={() => handleViewRRPRecord(rrp)} className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white">
                          <Eye className="h-4 w-4 mr-2"/>
                          View Full Details
                        </Button>
                      </CardContent>
                    </Card>))}
                </div>
              </div>
            </div>)}
        </DialogContent>
      </Dialog>

      
      <Dialog open={isRRPRecordModalOpen} onOpenChange={setIsRRPRecordModalOpen}>
        <DialogContent className="max-w-5xl bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-[#002a6e]/10 pb-4">
            <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent flex items-center gap-2">
              <Receipt className="h-6 w-6 text-[#003594]"/>
              RRP Record Details
            </DialogTitle>
            <DialogDescription>
              Complete purchase details for {selectedRRPRecord?.rrp_number || `RRP-${selectedRRPRecord?.id}`}
            </DialogDescription>
          </DialogHeader>

          {selectedRRPRecord && (<div className="space-y-6 py-4">
              
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-6 border border-purple-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-white"/>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Purchase Information</h3>
                    <p className="text-sm text-gray-600">Basic purchase details</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-purple-700 uppercase">RRP Number</p>
                    <p className="text-base font-semibold text-gray-900">{selectedRRPRecord.rrp_number || `RRP-${selectedRRPRecord.id}`}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-purple-700 uppercase">Supplier</p>
                    <p className="text-base font-semibold text-gray-900">{selectedRRPRecord.supplier_name || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-purple-700 uppercase">Date</p>
                    <p className="text-base font-semibold text-gray-900">
                      {format(new Date(selectedRRPRecord.date), 'PPP')}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-purple-700 uppercase">Invoice Number</p>
                    <p className="text-base font-semibold text-gray-900">{selectedRRPRecord.invoice_number || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-purple-700 uppercase">Invoice Date</p>
                    <p className="text-base font-semibold text-gray-900">
                      {selectedRRPRecord.invoice_date ? format(new Date(selectedRRPRecord.invoice_date), 'PPP') : '-'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-purple-700 uppercase">PO Number</p>
                    <p className="text-base font-semibold text-gray-900">{selectedRRPRecord.po_number || '-'}</p>
                  </div>
                </div>
              </div>

              
              <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg p-6 border border-blue-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-white"/>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Pricing Details</h3>
                    <p className="text-sm text-gray-600">Cost breakdown and amounts</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-lg p-4 border border-blue-100">
                    <p className="text-xs font-medium text-blue-700 uppercase mb-1">Item Price</p>
                    <p className="text-xl font-bold text-blue-900">
                      {selectedRRPRecord.currency || 'NPR'} {selectedRRPRecord.item_price.toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-blue-100">
                    <p className="text-xs font-medium text-blue-700 uppercase mb-1">Quantity</p>
                    <p className="text-xl font-bold text-blue-900">
                      {selectedRRPRecord.received_quantity.toFixed(2)} {selectedRRPRecord.unit || ''}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-blue-100">
                    <p className="text-xs font-medium text-blue-700 uppercase mb-1">Unit Price</p>
                    <p className="text-xl font-bold text-blue-900">
                      {selectedRRPRecord.received_quantity > 0
                ? `${selectedRRPRecord.currency || 'NPR'} ${(selectedRRPRecord.total_amount / selectedRRPRecord.received_quantity).toFixed(2)}`
                : '-'}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-blue-100">
                    <p className="text-xs font-medium text-blue-700 uppercase mb-1">Total Amount</p>
                    <p className="text-xl font-bold text-blue-900">
                      {selectedRRPRecord.currency || 'NPR'} {selectedRRPRecord.total_amount.toFixed(2)}
                    </p>
                  </div>
                </div>
                {(selectedRRPRecord.customs_charge || selectedRRPRecord.freight_charge || selectedRRPRecord.customs_service_charge) && (<div className="mt-4 pt-4 border-t border-blue-200">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Additional Charges</h4>
                    <div className="grid grid-cols-3 gap-3">
                      {selectedRRPRecord.customs_charge > 0 && (<div>
                          <p className="text-xs text-gray-600">Customs Charge</p>
                          <p className="text-sm font-semibold">{selectedRRPRecord.currency || 'NPR'} {selectedRRPRecord.customs_charge.toFixed(2)}</p>
                        </div>)}
                      {selectedRRPRecord.freight_charge > 0 && (<div>
                          <p className="text-xs text-gray-600">Freight Charge</p>
                          <p className="text-sm font-semibold">{selectedRRPRecord.currency || 'NPR'} {selectedRRPRecord.freight_charge.toFixed(2)}</p>
                        </div>)}
                      {selectedRRPRecord.customs_service_charge > 0 && (<div>
                          <p className="text-xs text-gray-600">Customs Service</p>
                          <p className="text-sm font-semibold">{selectedRRPRecord.currency || 'NPR'} {selectedRRPRecord.customs_service_charge.toFixed(2)}</p>
                        </div>)}
                    </div>
                  </div>)}
              </div>

              
              <div className="bg-gradient-to-r from-gray-50 to-slate-50 rounded-lg p-6 border border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Additional Information</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-600 uppercase">Currency</p>
                    <p className="text-sm font-semibold text-gray-900">{selectedRRPRecord.currency || 'NPR'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-600 uppercase">Forex Rate</p>
                    <p className="text-sm font-semibold text-gray-900">{selectedRRPRecord.forex_rate || '1.00'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-600 uppercase">VAT %</p>
                    <p className="text-sm font-semibold text-gray-900">{selectedRRPRecord.vat_percentage || '0'}%</p>
                  </div>
                  {selectedRRPRecord.airway_bill_number && (<div className="space-y-1">
                      <p className="text-xs font-medium text-gray-600 uppercase">Airway Bill</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedRRPRecord.airway_bill_number}</p>
                    </div>)}
                  {selectedRRPRecord.request_number && (<div className="space-y-1">
                      <p className="text-xs font-medium text-gray-600 uppercase">Request #</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedRRPRecord.request_number}</p>
                    </div>)}
                  {selectedRRPRecord.part_number && (<div className="space-y-1">
                      <p className="text-xs font-medium text-gray-600 uppercase">Part Number</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedRRPRecord.part_number}</p>
                    </div>)}
                </div>
              </div>
            </div>)}
        </DialogContent>
      </Dialog>

      
      <Dialog open={isIssueModalOpen} onOpenChange={setIsIssueModalOpen}>
        <DialogContent className="max-w-7xl bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-[#002a6e]/10 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent flex items-center gap-2">
                  <ArrowUpCircle className="h-6 w-6 text-[#003594]"/>
                  Issue Details
                </DialogTitle>
                <DialogDescription className="mt-2 text-gray-600">
                  Issue history and cost analysis for {previewItem?.nac_code} - {previewItem?.item_name}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {isLoadingIssue ? (<div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#003594]"/>
            </div>) : issueDetails.length === 0 ? (<div className="text-center py-12 text-gray-500">
              <ArrowUpCircle className="h-12 w-12 mx-auto mb-4 text-gray-400"/>
              <p className="text-lg font-medium">No issue details found</p>
              <p className="text-sm">No issue records found for the selected date range.</p>
            </div>) : (<div className="space-y-6 py-4">
              
              <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-xl p-6 border border-red-200 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-red-500 to-rose-500 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-white"/>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Issue Cost Trend</h3>
                    <p className="text-sm text-gray-600">Issue cost over time</p>
                  </div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-red-100">
                  <TimeSeriesChart title="Issue Cost History" data={issueCostSeries} color="#ef4444" onDateClick={handleDateClick} chartType="issues"/>
                </div>
              </div>

              
              <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-6 border border-orange-200 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg flex items-center justify-center">
                    <Package className="w-6 h-6 text-white"/>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Issue Quantity Trend</h3>
                    <p className="text-sm text-gray-600">Quantity issued over time</p>
                  </div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-orange-100">
                  <TimeSeriesChart title="Issue Quantity History" data={issueQuantitySeries} color="#f97316" onDateClick={handleDateClick} chartType="issues"/>
                </div>
              </div>

              
              <div className="space-y-4">
                <div className="flex items-center gap-3 pb-2 border-b-2 border-red-200">
                  <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                    <Receipt className="h-6 w-6 text-red-600"/>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Issue Records</h3>
                    <p className="text-sm text-gray-600">All issue records for this item</p>
                  </div>
                  <span className="text-sm bg-red-100 text-red-800 px-3 py-1 rounded-full font-medium">
                    {issueDetails.length} {issueDetails.length === 1 ? 'record' : 'records'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {issueDetailGroups.map((group) => {
                const approved = group.statusCounts.APPROVED || 0;
                const pending = group.statusCounts.PENDING || 0;
                const rejected = group.statusCounts.REJECTED || 0;
                return (<Card key={`issue-group-${group.dateKey}`} className="border-red-200 hover:shadow-lg transition-shadow">
                      <CardHeader className="bg-gradient-to-r from-red-50 to-rose-50 border-b border-red-200">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg font-bold text-red-900">
                              {group.dateLabel}
                          </CardTitle>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${approved > 0
                        ? 'bg-green-100 text-green-800'
                        : pending > 0
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'}`}>
                              {group.totalQuantity.toFixed(2)} qty
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs font-medium text-gray-500 uppercase">Quantity</p>
                            <p className="text-sm font-semibold text-red-700">
                                {group.totalQuantity.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500 uppercase">Cost</p>
                            <p className="text-sm font-semibold text-red-700">
                                NPR {group.totalCost.toFixed(2)}
                            </p>
                          </div>
                          <div className="col-span-2 flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full bg-green-50 px-2 py-0.5 text-green-700 font-medium">
                              Approved: {approved}
                            </span>
                            {pending > 0 && (<span className="rounded-full bg-yellow-50 px-2 py-0.5 text-yellow-700 font-medium">
                                Pending: {pending}
                              </span>)}
                            {rejected > 0 && (<span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700 font-medium">
                                Rejected: {rejected}
                              </span>)}
                          </div>
                        </div>
                        <Button onClick={() => handleDateClick(group.dateKey, 'issues')} className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white">
                          <Eye className="h-4 w-4 mr-2"/>
                          View Full Details
                        </Button>
                      </CardContent>
                      </Card>);
            })}
                </div>
              </div>
            </div>)}
        </DialogContent>
      </Dialog>

      
      <Dialog open={isIssueRecordModalOpen} onOpenChange={setIsIssueRecordModalOpen}>
        <DialogContent className="max-w-5xl bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-[#002a6e]/10 pb-4">
            <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent flex items-center gap-2">
              <ArrowUpCircle className="h-6 w-6 text-[#003594]"/>
              Issue Record Details
            </DialogTitle>
            <DialogDescription>
              Complete issue details for {selectedIssueRecord?.issue_slip_number || `ISSUE-${selectedIssueRecord?.id}`}
            </DialogDescription>
          </DialogHeader>

          {selectedIssueRecord && (<div className="space-y-6 py-4">
              
              <div className="bg-gradient-to-r from-red-50 to-rose-50 rounded-lg p-6 border border-red-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-red-500 to-rose-500 rounded-lg flex items-center justify-center">
                    <Receipt className="w-6 h-6 text-white"/>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Issue Information</h3>
                    <p className="text-sm text-gray-600">Basic issue details</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-red-700 uppercase">Issue Slip Number</p>
                    <p className="text-base font-semibold text-gray-900">{selectedIssueRecord.issue_slip_number || `ISSUE-${selectedIssueRecord.id}`}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-red-700 uppercase">Issue Date</p>
                    <p className="text-base font-semibold text-gray-900">
                      {format(new Date(selectedIssueRecord.issue_date), 'PPP')}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-red-700 uppercase">Status</p>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${selectedIssueRecord.approval_status === 'APPROVED'
                ? 'bg-green-100 text-green-800'
                : selectedIssueRecord.approval_status === 'PENDING'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'}`}>
                      {selectedIssueRecord.approval_status}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-red-700 uppercase">Issued For</p>
                    <p className="text-base font-semibold text-gray-900">{selectedIssueRecord.issued_for || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-red-700 uppercase">Issued By</p>
                    <p className="text-base font-semibold text-gray-900">
                      {typeof selectedIssueRecord.issued_by === 'object'
                ? selectedIssueRecord.issued_by.name
                : (selectedIssueRecord.issued_by || '-')}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-red-700 uppercase">Part Number</p>
                    <p className="text-base font-semibold text-gray-900">{selectedIssueRecord.part_number || '-'}</p>
                  </div>
                </div>
              </div>

              
              <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg p-6 border border-orange-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-white"/>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Quantity & Cost Details</h3>
                    <p className="text-sm text-gray-600">Issue quantities and costs</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-lg p-4 border border-orange-100">
                    <p className="text-xs font-medium text-orange-700 uppercase mb-1">Issue Quantity</p>
                    <p className="text-xl font-bold text-orange-900">
                      {selectedIssueRecord.issue_quantity.toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-orange-100">
                    <p className="text-xs font-medium text-orange-700 uppercase mb-1">Issue Cost</p>
                    <p className="text-xl font-bold text-orange-900">
                      NPR {selectedIssueRecord.issue_cost.toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-orange-100">
                    <p className="text-xs font-medium text-orange-700 uppercase mb-1">Unit Cost</p>
                    <p className="text-xl font-bold text-orange-900">
                      {selectedIssueRecord.issue_quantity > 0
                ? `NPR ${(selectedIssueRecord.issue_cost / selectedIssueRecord.issue_quantity).toFixed(2)}`
                : '-'}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-orange-100">
                    <p className="text-xs font-medium text-orange-700 uppercase mb-1">Remaining Balance</p>
                    <p className="text-xl font-bold text-orange-900">
                      {selectedIssueRecord.remaining_balance.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            </div>)}
        </DialogContent>
      </Dialog>

      
      <Dialog open={isReceiveModalOpen} onOpenChange={setIsReceiveModalOpen}>
        <DialogContent className="max-w-7xl bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-[#002a6e]/10 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent flex items-center gap-2">
                  <ArrowDownCircle className="h-6 w-6 text-[#003594]"/>
                  Receive Details
                </DialogTitle>
                <DialogDescription className="mt-2 text-gray-600">
                  Receive history and quantity analysis for {previewItem?.nac_code} - {previewItem?.item_name}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {isLoadingReceive ? (<div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#003594]"/>
            </div>) : receiveDetails.length === 0 ? (<div className="text-center py-12 text-gray-500">
              <ArrowDownCircle className="h-12 w-12 mx-auto mb-4 text-gray-400"/>
              <p className="text-lg font-medium">No receive details found</p>
              <p className="text-sm">No receive records found for the selected date range.</p>
            </div>) : (<div className="space-y-6 py-4">
              
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-white"/>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Receive Quantity Trend</h3>
                    <p className="text-sm text-gray-600">Quantity received over time</p>
                  </div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-green-100">
                  <TimeSeriesChart title="Receive Quantity History" data={receiveQuantitySeries} color="#10b981" onDateClick={handleDateClick} chartType="receives"/>
                </div>
              </div>

              
              <div className="space-y-4">
                <div className="flex items-center gap-3 pb-2 border-b-2 border-green-200">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <Receipt className="h-6 w-6 text-green-600"/>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Receive Records</h3>
                    <p className="text-sm text-gray-600">All receive records for this item</p>
                  </div>
                  <span className="text-sm bg-green-100 text-green-800 px-3 py-1 rounded-full font-medium">
                    {receiveDetails.length} {receiveDetails.length === 1 ? 'record' : 'records'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {receiveDetails.map((receive, index) => (<Card key={`receive-${receive.id}-${index}`} className="border-green-200 hover:shadow-lg transition-shadow">
                      <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 border-b border-green-200">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg font-bold text-green-900">
                            {receive.receive_number || `REC-${receive.id}`}
                          </CardTitle>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${receive.approval_status === 'APPROVED'
                    ? 'bg-green-100 text-green-800'
                    : receive.approval_status === 'PENDING'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'}`}>
                            {receive.approval_status}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs font-medium text-gray-500 uppercase">Date</p>
                            <p className="text-sm font-semibold text-gray-900">
                              {format(new Date(receive.receive_date), 'MMM dd, yyyy')}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500 uppercase">Quantity</p>
                            <p className="text-sm font-semibold text-green-700">
                              {receive.received_quantity.toFixed(2)} {receive.unit || ''}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500 uppercase">Received By</p>
                            <p className="text-sm font-semibold text-gray-900 truncate" title={receive.received_by ?? undefined}>
                              {receive.received_by || '-'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500 uppercase">Request #</p>
                            <p className="text-sm font-semibold text-gray-900 truncate" title={receive.request_number ?? undefined}>
                              {receive.request_number || '-'}
                            </p>
                          </div>
                          {receive.part_number && (<div>
                              <p className="text-xs font-medium text-gray-500 uppercase">Part Number</p>
                              <p className="text-sm font-semibold text-gray-900">{receive.part_number}</p>
                            </div>)}
                          {receive.equipment_number && (<div>
                              <p className="text-xs font-medium text-gray-500 uppercase">Equipment</p>
                              <p className="text-sm font-semibold text-gray-900">{receive.equipment_number}</p>
                            </div>)}
                        </div>
                        <Button onClick={() => handleViewReceiveRecord(receive)} className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white">
                          <Eye className="h-4 w-4 mr-2"/>
                          View Full Details
                        </Button>
                      </CardContent>
                    </Card>))}
                </div>
              </div>
            </div>)}
        </DialogContent>
      </Dialog>

      
      <Dialog open={isReceiveRecordModalOpen} onOpenChange={setIsReceiveRecordModalOpen}>
        <DialogContent className="max-w-5xl bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-[#002a6e]/10 pb-4">
            <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent flex items-center gap-2">
              <ArrowDownCircle className="h-6 w-6 text-[#003594]"/>
              Receive Record Details
            </DialogTitle>
            <DialogDescription>
              Complete receive details for {selectedReceiveRecord?.receive_number || `REC-${selectedReceiveRecord?.id}`}
            </DialogDescription>
          </DialogHeader>

          {selectedReceiveRecord && (<div className="space-y-6 py-4">
              
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-6 border border-green-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg flex items-center justify-center">
                    <Receipt className="w-6 h-6 text-white"/>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Receive Information</h3>
                    <p className="text-sm text-gray-600">Basic receive details</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-green-700 uppercase">Receive Number</p>
                    <p className="text-base font-semibold text-gray-900">{selectedReceiveRecord.receive_number || `REC-${selectedReceiveRecord.id}`}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-green-700 uppercase">Receive Date</p>
                    <p className="text-base font-semibold text-gray-900">
                      {format(new Date(selectedReceiveRecord.receive_date), 'PPP')}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-green-700 uppercase">Status</p>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${selectedReceiveRecord.approval_status === 'APPROVED'
                ? 'bg-green-100 text-green-800'
                : selectedReceiveRecord.approval_status === 'PENDING'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'}`}>
                      {selectedReceiveRecord.approval_status}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-green-700 uppercase">Received By</p>
                    <p className="text-base font-semibold text-gray-900">{selectedReceiveRecord.received_by || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-green-700 uppercase">Request Number</p>
                    <p className="text-base font-semibold text-gray-900">{selectedReceiveRecord.request_number || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-green-700 uppercase">Source</p>
                    <p className="text-base font-semibold text-gray-900">{selectedReceiveRecord.receive_source || '-'}</p>
                  </div>
                </div>
              </div>

              
              <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg p-6 border border-blue-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                    <Package className="w-6 h-6 text-white"/>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Quantity & Location Details</h3>
                    <p className="text-sm text-gray-600">Receive quantities and storage information</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-lg p-4 border border-blue-100">
                    <p className="text-xs font-medium text-blue-700 uppercase mb-1">Received Quantity</p>
                    <p className="text-xl font-bold text-blue-900">
                      {selectedReceiveRecord.received_quantity.toFixed(2)} {selectedReceiveRecord.unit || ''}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-blue-100">
                    <p className="text-xs font-medium text-blue-700 uppercase mb-1">Location</p>
                    <p className="text-sm font-semibold text-blue-900">
                      {selectedReceiveRecord.location || '-'}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-blue-100">
                    <p className="text-xs font-medium text-blue-700 uppercase mb-1">Card Number</p>
                    <p className="text-sm font-semibold text-blue-900">
                      {selectedReceiveRecord.card_number || '-'}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-blue-100">
                    <p className="text-xs font-medium text-blue-700 uppercase mb-1">Item Name</p>
                            <p className="text-sm font-semibold text-blue-900 truncate" title={selectedReceiveRecord.item_name ?? undefined}>
                      {selectedReceiveRecord.item_name || '-'}
                    </p>
                  </div>
                </div>
              </div>

              
              <div className="bg-gradient-to-r from-gray-50 to-slate-50 rounded-lg p-6 border border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Additional Information</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {selectedReceiveRecord.part_number && (<div className="space-y-1">
                      <p className="text-xs font-medium text-gray-600 uppercase">Part Number</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedReceiveRecord.part_number}</p>
                    </div>)}
                  {selectedReceiveRecord.equipment_number && (<div className="space-y-1">
                      <p className="text-xs font-medium text-gray-600 uppercase">Equipment Number</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedReceiveRecord.equipment_number}</p>
                    </div>)}
                  {selectedReceiveRecord.tender_reference_number && (<div className="space-y-1">
                      <p className="text-xs font-medium text-gray-600 uppercase">Tender Reference</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedReceiveRecord.tender_reference_number}</p>
                    </div>)}
                </div>
              </div>
            </div>)}
        </DialogContent>
      </Dialog>

      
      <Dialog open={isDateFilterModalOpen} onOpenChange={setIsDateFilterModalOpen}>
        <DialogContent className="max-w-6xl bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-[#002a6e]/10 pb-4">
            <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent flex items-center gap-2">
              <Clock className="h-6 w-6 text-[#003594]"/>
              Records for {selectedDate ? format(new Date(selectedDate), 'PPP') : ''}
            </DialogTitle>
            <DialogDescription>
              {selectedDateType === 'rrps' && 'All RRP records'}
              {selectedDateType === 'issues' && 'All issue records'}
              {selectedDateType === 'receives' && 'All receive records'}
              {' '}on this date
            </DialogDescription>
          </DialogHeader>

          {filteredRecords.length === 0 ? (<div className="text-center py-12 text-gray-500">
              <Clock className="h-12 w-12 mx-auto mb-4 text-gray-400"/>
              <p className="text-lg font-medium">No records found</p>
              <p className="text-sm">No records found for the selected date.</p>
            </div>) : (<div className="space-y-4 py-4">
              
              {selectedDateType === 'rrps' && (<div className="space-y-4">
                  <div className="flex items-center gap-3 pb-2 border-b-2 border-purple-200">
                    <ShoppingCart className="h-6 w-6 text-purple-600"/>
                    <h3 className="text-xl font-bold text-gray-900">RRP Records</h3>
                    <span className="text-sm bg-purple-100 text-purple-800 px-3 py-1 rounded-full font-medium">
                      {filteredRecords.length} {filteredRecords.length === 1 ? 'record' : 'records'}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gradient-to-r from-purple-50 to-pink-50">
                          <TableHead className="font-semibold text-purple-900">RRP Number</TableHead>
                          <TableHead className="font-semibold text-purple-900">Supplier</TableHead>
                          <TableHead className="font-semibold text-purple-900 text-right">Item Price</TableHead>
                          <TableHead className="font-semibold text-purple-900 text-right">Quantity</TableHead>
                          <TableHead className="font-semibold text-purple-900 text-right">Total Amount</TableHead>
                          <TableHead className="font-semibold text-purple-900">Status</TableHead>
                          <TableHead className="font-semibold text-purple-900">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(filteredRecords as RRPDetail[]).map((record, index) => (<TableRow key={`rrp-${record.id}-${index}`} className="hover:bg-purple-50/50">
                            <TableCell className="font-medium">{record.rrp_number || `RRP-${record.id}`}</TableCell>
                            <TableCell>{record.supplier_name || '-'}</TableCell>
                            <TableCell className="text-right font-semibold text-purple-700">
                              {record.currency || 'NPR'} {record.item_price.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right">{record.received_quantity.toFixed(2)} {record.unit || ''}</TableCell>
                            <TableCell className="text-right font-semibold text-purple-700">
                              {record.currency || 'NPR'} {record.total_amount.toFixed(2)}
                            </TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${record.approval_status === 'APPROVED'
                        ? 'bg-green-100 text-green-800'
                        : record.approval_status === 'PENDING'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'}`}>
                                {record.approval_status}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" onClick={() => {
                        setSelectedRRPRecord(record);
                        setIsRRPRecordModalOpen(true);
                        setIsDateFilterModalOpen(false);
                    }} className="text-purple-700 hover:text-purple-800 hover:bg-purple-50">
                                <Eye className="h-4 w-4 mr-1"/>
                                View
                              </Button>
                            </TableCell>
                          </TableRow>))}
                      </TableBody>
                    </Table>
                  </div>
                </div>)}

              
              {selectedDateType === 'issues' && (<div className="space-y-4">
                  <div className="flex items-center gap-3 pb-2 border-b-2 border-red-200">
                    <ArrowUpCircle className="h-6 w-6 text-red-600"/>
                    <h3 className="text-xl font-bold text-gray-900">Issue Records</h3>
                    <span className="text-sm bg-red-100 text-red-800 px-3 py-1 rounded-full font-medium">
                      {filteredRecords.length} {filteredRecords.length === 1 ? 'record' : 'records'}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gradient-to-r from-red-50 to-rose-50">
                          <TableHead className="font-semibold text-red-900">Issue Slip #</TableHead>
                          <TableHead className="font-semibold text-red-900">Issued For</TableHead>
                          <TableHead className="font-semibold text-red-900">Issued By</TableHead>
                          <TableHead className="font-semibold text-red-900 text-right">Quantity</TableHead>
                          <TableHead className="font-semibold text-red-900 text-right">Cost</TableHead>
                          <TableHead className="font-semibold text-red-900">Status</TableHead>
                          <TableHead className="font-semibold text-red-900">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(filteredRecords as IssueDetail[]).map((record, index) => (<TableRow key={`issue-${record.id}-${index}`} className="hover:bg-red-50/50">
                            <TableCell className="font-medium">{record.issue_slip_number || `ISSUE-${record.id}`}</TableCell>
                            <TableCell>{record.issued_for || '-'}</TableCell>
                            <TableCell>
                              {typeof record.issued_by === 'object' ? record.issued_by.name : (record.issued_by || '-')}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-red-700">{record.issue_quantity.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-semibold text-red-700">NPR {record.issue_cost.toFixed(2)}</TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${record.approval_status === 'APPROVED'
                        ? 'bg-green-100 text-green-800'
                        : record.approval_status === 'PENDING'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'}`}>
                                {record.approval_status}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" onClick={() => {
                        setSelectedIssueRecord(record);
                        setIsIssueRecordModalOpen(true);
                        setIsDateFilterModalOpen(false);
                    }} className="text-red-700 hover:text-red-800 hover:bg-red-50">
                                <Eye className="h-4 w-4 mr-1"/>
                                View
                              </Button>
                            </TableCell>
                          </TableRow>))}
                      </TableBody>
                    </Table>
                  </div>
                </div>)}

              
              {selectedDateType === 'receives' && (<div className="space-y-4">
                  <div className="flex items-center gap-3 pb-2 border-b-2 border-green-200">
                    <ArrowDownCircle className="h-6 w-6 text-green-600"/>
                    <h3 className="text-xl font-bold text-gray-900">Receive Records</h3>
                    <span className="text-sm bg-green-100 text-green-800 px-3 py-1 rounded-full font-medium">
                      {filteredRecords.length} {filteredRecords.length === 1 ? 'record' : 'records'}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gradient-to-r from-green-50 to-emerald-50">
                          <TableHead className="font-semibold text-green-900">Receive #</TableHead>
                          <TableHead className="font-semibold text-green-900">Request #</TableHead>
                          <TableHead className="font-semibold text-green-900">Received By</TableHead>
                          <TableHead className="font-semibold text-green-900 text-right">Quantity</TableHead>
                          <TableHead className="font-semibold text-green-900">Part Number</TableHead>
                          <TableHead className="font-semibold text-green-900">Status</TableHead>
                          <TableHead className="font-semibold text-green-900">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(filteredRecords as ReceiveDetail[]).map((record, index) => (<TableRow key={`receive-${record.id}-${index}`} className="hover:bg-green-50/50">
                            <TableCell className="font-medium">{record.receive_number || `REC-${record.id}`}</TableCell>
                            <TableCell>{record.request_number || '-'}</TableCell>
                            <TableCell>{record.received_by || '-'}</TableCell>
                            <TableCell className="text-right font-semibold text-green-700">
                              {record.received_quantity.toFixed(2)} {record.unit || ''}
                            </TableCell>
                            <TableCell>{record.part_number || '-'}</TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${record.approval_status === 'APPROVED'
                        ? 'bg-green-100 text-green-800'
                        : record.approval_status === 'PENDING'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'}`}>
                                {record.approval_status}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" onClick={() => {
                        setSelectedReceiveRecord(record);
                        setIsReceiveRecordModalOpen(true);
                        setIsDateFilterModalOpen(false);
                    }} className="text-green-700 hover:text-green-800 hover:bg-green-50">
                                <Eye className="h-4 w-4 mr-1"/>
                                View
                              </Button>
                            </TableCell>
                          </TableRow>))}
                      </TableBody>
                    </Table>
                  </div>
                </div>)}
            </div>)}
        </DialogContent>
      </Dialog>
    </div>);
}
