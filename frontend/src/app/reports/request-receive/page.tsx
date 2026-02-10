'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { API } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, Eye, ChevronLeft, ChevronRight, Download, Calendar as CalendarIcon } from 'lucide-react';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription, } from '@/components/ui/modal';
import Image from 'next/image';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/utils/utils';
import { format } from 'date-fns';
import { resolveImageUrl } from '@/lib/urls';
interface RequestReceiveData {
    requestId: number;
    requestNumber: string;
    requestDate: string;
    requestedBy: string;
    partNumber: string;
    itemName: string;
    equipmentNumber: string;
    requestedQuantity: number;
    requestStatus: string;
    nacCode: string;
    unit: string;
    currentBalance: number;
    previousRate: string;
    requestImage: string;
    specifications: string;
    remarks: string;
    isReceived: boolean | number;
    receiveFk: number | null;
    location: string;
    cardNumber: string;
    receiveId: number | null;
    receiveDate: string | null;
    receivedQuantity: number | null;
    receiveStatus: string | null;
    receivedTotalApproved?: number;
    remainingQuantity?: number;
    latestReceiveId?: number | null;
    receiveIdsCsv?: string | null;
    receiveImage: string | null;
    receiveLocation: string | null;
    receiveCardNumber: string | null;
    receivedBy: string | null;
    rejectedBy: string | null;
    rejectionReason: string | null;
    predictionSummary?: {
        predictedDays: number;
        rangeLowerDays: number | null;
        rangeUpperDays: number | null;
        confidence: string | null;
        sampleSize: number;
        calculatedAt: string | null;
    } | null;
}
type ReceiveDetailItem = {
    receiveId: number;
    requestNumber: string;
    requestDate: string;
    receiveDate: string;
    itemName: string;
    requestedPartNumber: string;
    receivedPartNumber: string;
    requestedQuantity: number;
    receivedQuantity: number;
    equipmentNumber: string;
    unit: string;
    requestedImage?: string;
    receivedImage?: string;
    location?: string;
    cardNumber?: string;
};
interface ReportResponse {
    data: RequestReceiveData[];
    pagination: {
        currentPage: number;
        pageSize: number;
        totalCount: number;
        totalPages: number;
    };
}
const FALLBACK_IMAGE = '/images/nepal_airlines_logo.jpeg';
export default function RequestReceiveReportPage() {
    const { user, permissions } = useAuthContext();
    const router = useRouter();
    const { showErrorToast, showSuccessToast } = useCustomToast();
    const [universal, setUniversal] = useState<string>('');
    const [equipmentNumber, setEquipmentNumber] = useState<string>('');
    const [partNumber, setPartNumber] = useState<string>('');
    const [page, setPage] = useState<number>(1);
    const [pageSize] = useState<number>(20);
    const [data, setData] = useState<RequestReceiveData[]>([]);
    const [totalCount, setTotalCount] = useState<number>(0);
    const [totalPages, setTotalPages] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(false);
    const [selectedItem, setSelectedItem] = useState<RequestReceiveData | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [receiveDetailsList, setReceiveDetailsList] = useState<ReceiveDetailItem[] | null>(null);
    const [loadingDetails, setLoadingDetails] = useState<boolean>(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportType, setExportType] = useState<string>('all');
    const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
    const [toDate, setToDate] = useState<Date | undefined>(undefined);
    const [exporting, setExporting] = useState<boolean>(false);
    const [receiveStatus, setReceiveStatus] = useState<string>('all');
    const [isFromOpen, setIsFromOpen] = useState<boolean>(false);
    const [isToOpen, setIsToOpen] = useState<boolean>(false);
    const fetchingRef = useRef<boolean>(false);
    const fetchDataRef = useRef<() => Promise<void> | null>(null);
    useEffect(() => {
        if (!user) {
            router.push('/login');
            return;
        }
        if (!permissions?.includes('can_access_request/receive_details')) {
            router.push('/unauthorized');
            return;
        }
    }, [user, permissions, router]);
    const canAccess = !!user && permissions?.includes('can_access_request/receive_details');
    const [itemName, setItemName] = useState<string>('');
    const [nacCode, setNacCode] = useState<string>('');
    const fetchData = useCallback(async () => {
        if (!canAccess || fetchingRef.current)
            return;
        fetchingRef.current = true;
        setLoading(true);
        try {
            const params: Record<string, string | number> = {};
            if (universal)
                params.universal = universal;
            if (equipmentNumber)
                params.equipmentNumber = equipmentNumber;
            if (partNumber)
                params.partNumber = partNumber;
            if (itemName)
                params.itemName = itemName;
            if (nacCode)
                params.nacCode = nacCode;
            if (receiveStatus && receiveStatus !== 'all')
                params.receiveStatus = receiveStatus;
            params.page = page;
            params.pageSize = pageSize;
            const res = await API.get<ReportResponse>('/api/report/request-receive', { params });
            setData(res.data.data || []);
            setTotalCount(res.data.pagination.totalCount);
            setTotalPages(res.data.pagination.totalPages);
        }
        catch {
            showErrorToast({
                title: "Error",
                message: "Failed to fetch report data",
                duration: 3000,
            });
        }
        finally {
            setLoading(false);
            fetchingRef.current = false;
        }
    }, [canAccess, universal, equipmentNumber, partNumber, itemName, nacCode, page, pageSize, receiveStatus, showErrorToast]);
    useEffect(() => {
        fetchDataRef.current = fetchData;
    }, [fetchData]);
    useEffect(() => {
        if (!canAccess)
            return;
        const fn = fetchDataRef.current;
        if (fn)
            fn();
    }, [canAccess, universal, equipmentNumber, partNumber, itemName, nacCode, page, receiveStatus]);
    const handleSearch = () => {
        setPage(1);
    };
    const handleClearSearch = () => {
        setUniversal('');
        setEquipmentNumber('');
        setPartNumber('');
        setItemName('');
        setNacCode('');
        setReceiveStatus('all');
        setPage(1);
    };
    const handlePageChange = (newPage: number) => {
        setPage(newPage);
    };
    const handleViewDetails = (item: RequestReceiveData) => {
        setSelectedItem(item);
        setIsDetailsOpen(true);
    };
    useEffect(() => {
        const loadDetails = async () => {
            if (!selectedItem) {
                setReceiveDetailsList(null);
                return;
            }
            const idsCsv = selectedItem.receiveIdsCsv;
            if (!idsCsv) {
                setReceiveDetailsList(null);
                return;
            }
            const ids = idsCsv.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
            if (ids.length === 0) {
                setReceiveDetailsList(null);
                return;
            }
            try {
                setLoadingDetails(true);
                const responses = await Promise.all(ids.map((id) => API.get(`/api/receive/${id}/details`)));
                const list: ReceiveDetailItem[] = responses.map((res) => res.data as ReceiveDetailItem);
                setReceiveDetailsList(list);
            }
            catch {
                setReceiveDetailsList(null);
            }
            finally {
                setLoadingDetails(false);
            }
        };
        if (isDetailsOpen) {
            loadDetails();
        }
    }, [isDetailsOpen, selectedItem]);
    const getImageSrc = (imagePath: string | null | undefined): string => {
        return resolveImageUrl(imagePath, FALLBACK_IMAGE);
    };
    if (!canAccess) {
        return null;
    }
    const handleExport = async () => {
        if (exportType === 'dateRange' && (!fromDate || !toDate)) {
            showErrorToast({
                title: "Error",
                message: "Please select both from and to dates for date range export",
                duration: 3000,
            });
            return;
        }
        setExporting(true);
        try {
            const exportData: {
                exportType: string;
                fromDate?: string;
                toDate?: string;
                page?: number;
                pageSize?: number;
                universal?: string;
                equipmentNumber?: string;
                partNumber?: string;
                itemName?: string;
                nacCode?: string;
                receiveStatus?: string;
            } = { exportType };
            if (exportType === 'dateRange') {
                exportData.fromDate = format(fromDate!, 'yyyy-MM-dd');
                exportData.toDate = format(toDate!, 'yyyy-MM-dd');
            }
            else if (exportType === 'currentPage') {
                exportData.page = page;
                exportData.pageSize = pageSize;
            }
            if (universal)
                exportData.universal = universal;
            if (equipmentNumber)
                exportData.equipmentNumber = equipmentNumber;
            if (partNumber)
                exportData.partNumber = partNumber;
            if (itemName)
                exportData.itemName = itemName;
            if (nacCode)
                exportData.nacCode = nacCode;
            if (receiveStatus && receiveStatus !== 'all')
                exportData.receiveStatus = receiveStatus;
            const response = await API.post('/api/report/request-receive/export', exportData, {
                responseType: 'blob'
            });
            if (response.status === 200) {
                const blob = new Blob([response.data]);
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Request_Receive_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                showSuccessToast({
                    title: "Success",
                    message: "Report exported successfully",
                    duration: 3000,
                });
                setIsExportModalOpen(false);
            }
            else {
                throw new Error('Export failed');
            }
        }
        catch {
            showErrorToast({
                title: "Error",
                message: "Failed to export report",
                duration: 3000,
            });
        }
        finally {
            setExporting(false);
        }
    };
    const getReceiveStatusDisplay = (item: RequestReceiveData) => {
        const label = (item.receiveStatus || '').toLowerCase();
        if (label === 'not received') {
            return { text: 'Not Received', class: 'bg-gray-100 text-gray-800' };
        }
        if (label === 'partially received') {
            return { text: 'Partially Received', class: 'bg-amber-100 text-amber-800' };
        }
        if (label === 'received') {
            return { text: 'Received', class: 'bg-green-100 text-green-800' };
        }
        const isReceived = Boolean(item.isReceived);
        if (!isReceived)
            return { text: 'Not Received', class: 'bg-gray-100 text-gray-800' };
        return { text: 'Received', class: 'bg-green-100 text-green-800' };
    };
    return (<div className="container mx-auto py-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-[#003594] mb-2">Request & Receive Report</h1>
          <p className="text-gray-600">Comprehensive view of all requests and their receive status</p>
        </div>
        <Button onClick={() => setIsExportModalOpen(true)} className="bg-[#003594] hover:bg-[#003594]/90 text-white">
          <Download className="h-4 w-4 mr-2"/>
          Export to Excel
        </Button>
      </div>

      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-[#003594]">Search & Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 mb-4">
            <div className="space-y-2 xl:col-span-2">
              <Label className="text-sm font-medium text-[#003594]">Universal Search</Label>
              <Input value={universal} onChange={(e) => setUniversal(e.target.value)} placeholder="Search by request number, item name, part number, equipment number, or NAC code" className="border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20"/>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#003594]">Equipment Number</Label>
              <Input value={equipmentNumber} onChange={(e) => setEquipmentNumber(e.target.value)} placeholder="Search by equipment number" className="border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20"/>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#003594]">Part Number</Label>
              <Input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} placeholder="Search by part number" className="border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20"/>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#003594]">Item Name</Label>
              <Input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Search by item name" className="border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20"/>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#003594]">NAC Code</Label>
              <Input value={nacCode} onChange={(e) => setNacCode(e.target.value)} placeholder="Search by NAC Code" className="border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20"/>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#003594]">Receive Status</Label>
              <Select value={receiveStatus} onValueChange={setReceiveStatus}>
                <SelectTrigger className="border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20">
                  <SelectValue placeholder="All Statuses"/>
                </SelectTrigger>
                <SelectContent className="bg-white rounded-md shadow-md border z-[100]">
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="not_received">Not Received</SelectItem>
                  <SelectItem value="partial">Partially Received</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2 lg:col-span-3 xl:col-span-1">
              <Label className="text-sm font-medium text-[#003594]">Actions</Label>
              <div className="flex gap-2">
                <Button onClick={handleSearch} className="bg-[#003594] hover:bg-[#003594]/90 text-white">
                  <Search className="h-4 w-4 mr-2"/>
                  Search
                </Button>
                <Button onClick={handleClearSearch} variant="outline" className="border-[#002a6e]/20 hover:bg-[#003594]/5 hover:text-[#003594]">
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-[#003594]">
            Results ({totalCount} total records)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (<div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-3 border-[#003594] border-t-transparent"></div>
            </div>) : data.length === 0 ? (<div className="text-center text-gray-500 py-8">No records found</div>) : (<>
              <div className="overflow-x-auto">
                <table className="w-full table-fixed">
                  <thead>
                    <tr className="bg-[#003594]/5 border-b border-[#002a6e]/10">
                      <th className="text-left p-3 font-semibold text-[#003594] w-28">Request #</th>
                      <th className="text-left p-3 font-semibold text-[#003594] w-20">Date</th>
                      <th className="text-left p-3 font-semibold text-[#003594] w-16">NAC Code</th>
                      <th className="text-left p-3 font-semibold text-[#003594] w-32">Lead Time (Predicted)</th>
                      <th className="text-left p-3 font-semibold text-[#003594] w-28">Item Name</th>
                      <th className="text-left p-3 font-semibold text-[#003594] w-20">Part #</th>
                      <th className="text-left p-3 font-semibold text-[#003594] w-16">Req Qty</th>
                      <th className="text-left p-3 font-semibold text-[#003594] w-16">Rec Qty</th>
                      <th className="text-left p-3 font-semibold text-[#003594] w-20">Request Status</th>
                      <th className="text-left p-3 font-semibold text-[#003594] w-20">Receive Status</th>
                      <th className="text-left p-3 font-semibold text-[#003594] w-16">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((item) => {
                const receiveStatusDisplay = getReceiveStatusDisplay(item);
                return (<tr key={item.requestId} className="border-b border-[#002a6e]/10 hover:bg-[#003594]/5 transition-colors">
                          <td className="p-3 text-sm break-words">{item.requestNumber}</td>
                          <td className="p-3 text-sm">{new Date(item.requestDate).toLocaleDateString()}</td>
                          <td className="p-3 text-sm break-words">{item.nacCode}</td>
                      <td className="p-3 text-sm break-words">
                        {item.predictionSummary ? (<div className="space-y-1 text-xs text-gray-600">
                            <span className="text-sm font-semibold text-gray-900">
                              ~{Math.round(item.predictionSummary.predictedDays)} days
                            </span>
                            {item.predictionSummary.rangeLowerDays !== null && item.predictionSummary.rangeUpperDays !== null ? (<span>
                                Range {Math.round(item.predictionSummary.rangeLowerDays)}–
                                {Math.round(item.predictionSummary.rangeUpperDays)} days
                              </span>) : (<span className="italic text-gray-400">Limited history</span>)}
                            <span className="text-[11px] uppercase tracking-wide text-[#003594]">
                              {item.predictionSummary.confidence ?? 'N/A'} confidence • {item.predictionSummary.sampleSize} samples
                            </span>
                          </div>) : (<span className="text-xs text-gray-400 italic">No prediction yet</span>)}
                      </td>
                          <td className="p-3 text-sm break-words">{item.itemName}</td>
                          <td className="p-3 text-sm break-words">{item.partNumber}</td>
                          <td className="p-3 text-sm">{item.requestedQuantity}</td>
                          <td className="p-3 text-sm">
                            {typeof item.receivedTotalApproved === 'number'
                        ? item.receivedTotalApproved
                        : (item.receivedQuantity ?? (Boolean(item.isReceived) ? 0 : 'N/A'))}
                          </td>
                          <td className="p-3 text-sm">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${item.requestStatus === 'APPROVED' ? 'bg-green-100 text-green-800' :
                        item.requestStatus === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'}`}>
                              {item.requestStatus}
                            </span>
                          </td>
                          <td className="p-3 text-sm">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${receiveStatusDisplay.class}`}>
                              {receiveStatusDisplay.text}
                            </span>
                          </td>
                          <td className="p-3 text-sm">
                            <Button variant="outline" size="sm" onClick={() => handleViewDetails(item)} className="border-[#002a6e]/20 hover:bg-[#003594]/5 hover:text-[#003594]">
                              <Eye className="h-4 w-4 mr-1"/>
                              View
                            </Button>
                          </td>
                        </tr>);
            })}
                  </tbody>
                </table>
              </div>

              
              {totalPages > 1 && (<div className="flex items-center justify-between mt-6">
                  <div className="text-sm text-gray-600">
                    Page {page} of {totalPages} ({totalCount} total records)
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handlePageChange(page - 1)} disabled={page <= 1} className="border-[#002a6e]/20 hover:bg-[#003594]/5 hover:text-[#003594] disabled:opacity-50">
                      <ChevronLeft className="h-4 w-4 mr-1"/>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages} className="border-[#002a6e]/20 hover:bg-[#003594]/5 hover:text-[#003594] disabled:opacity-50">
                      Next
                      <ChevronRight className="h-4 w-4 ml-1"/>
                    </Button>
                  </div>
                </div>)}
            </>)}
        </CardContent>
      </Card>

      
      <Modal open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <ModalContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-white rounded-lg shadow-xl border-[#002a6e]/10">
          <ModalHeader className="border-b border-[#002a6e]/10 pb-4">
            <ModalTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
              Request & Receive Details
            </ModalTitle>
            <ModalDescription className="text-gray-600">
              Request #{selectedItem?.requestNumber}
            </ModalDescription>
          </ModalHeader>
          
          {selectedItem && (<div className="mt-6 space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 bg-[#003594]/5 rounded-lg">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[#003594]">Request Date</p>
                  <p className="text-base font-semibold text-gray-900">
                    {new Date(selectedItem.requestDate).toLocaleDateString()}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[#003594]">Requested By</p>
                  <p className="text-base font-semibold text-gray-900">{selectedItem.requestedBy}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[#003594]">Equipment Number</p>
                  <p className="text-base font-semibold text-gray-900">{selectedItem.equipmentNumber}</p>
                </div>
              </div>

              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6 p-6 border border-[#002a6e]/10 rounded-lg bg-white">
                  <h3 className="text-lg font-semibold text-[#003594]">Request Details</h3>
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-[#003594]">Item Name</p>
                      <p className="text-base text-gray-900">{selectedItem.itemName}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-[#003594]">Part Number</p>
                      <p className="text-base text-gray-900">{selectedItem.partNumber}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-[#003594]">NAC Code</p>
                      <p className="text-base text-gray-900">{selectedItem.nacCode}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-[#003594]">Requested Quantity</p>
                      <p className="text-base text-gray-900">{selectedItem.requestedQuantity}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-[#003594]">Unit</p>
                      <p className="text-base text-gray-900">{selectedItem.unit}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-[#003594]">Current Balance</p>
                      <p className="text-base text-gray-900">{selectedItem.currentBalance}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-[#003594]">Previous Rate</p>
                      <p className="text-base text-gray-900">{selectedItem.previousRate}</p>
                    </div>
                    {selectedItem.specifications && (<div className="space-y-1">
                        <p className="text-sm font-medium text-[#003594]">Specifications</p>
                        <p className="text-base text-gray-900">{selectedItem.specifications}</p>
                      </div>)}
                    {selectedItem.remarks && (<div className="space-y-1">
                        <p className="text-sm font-medium text-[#003594]">Remarks</p>
                        <p className="text-base text-gray-900">{selectedItem.remarks}</p>
                      </div>)}
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-[#003594]">Request Image</p>
                      <div className="mt-2">
                        <Image src={getImageSrc(selectedItem.requestImage)} alt="Request Item" width={160} height={160} className="w-40 h-40 object-cover rounded-lg border border-[#002a6e]/10" unoptimized onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = FALLBACK_IMAGE;
            }}/>
                      </div>
                    </div>
                  </div>
                </div>

                
                <div className="space-y-6 p-6 border border-[#002a6e]/10 rounded-lg bg-white">
                  <h3 className="text-lg font-semibold text-[#003594]">Receive Details</h3>
                  {loadingDetails ? (<div className="text-gray-500">Loading details...</div>) : (selectedItem.receiveStatus && selectedItem.receiveStatus.toLowerCase() !== 'not received') ? (receiveDetailsList && receiveDetailsList.length > 0 ? (<div className="space-y-4">
                        <div className="text-sm text-gray-600 mb-4">
                          Showing {receiveDetailsList.length} receive record{receiveDetailsList.length > 1 ? 's' : ''}:
                        </div>
                        
                        

                        
                        {receiveDetailsList.map((rd) => (<div key={rd.receiveId} className="p-4 border border-[#002a6e]/10 rounded-md bg-gray-50">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                              <div>
                                <p className="text-sm font-medium text-[#003594]">Receive ID</p>
                                <p className="text-sm text-gray-900">{rd.receiveId}</p>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-[#003594]">Receive Date</p>
                                <p className="text-sm text-gray-900">{rd.receiveDate ? new Date(rd.receiveDate).toLocaleDateString() : 'N/A'}</p>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-[#003594]">Received Quantity</p>
                                <p className="text-sm text-gray-900">{rd.receivedQuantity}</p>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-[#003594]">Received Part Number</p>
                                <p className="text-sm text-gray-900">{rd.receivedPartNumber}</p>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-[#003594]">Location</p>
                                <p className="text-sm text-gray-900">{rd.location || 'N/A'}</p>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-[#003594]">Card Number</p>
                                <p className="text-sm text-gray-900">{rd.cardNumber || 'N/A'}</p>
                              </div>
                            </div>
                            
                            
                            <div className="mt-4 pt-4 border-t border-[#002a6e]/10">
                              <p className="text-sm font-medium text-[#003594] mb-2">Received Image</p>
                              <div className="flex justify-center">
                                <Image src={getImageSrc(rd.receivedImage)} alt="Received Item" width={120} height={120} className="w-30 h-30 object-cover rounded-lg border border-[#002a6e]/10" unoptimized onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = FALLBACK_IMAGE;
                    }}/>
                              </div>
                            </div>
                          </div>))}
                      </div>) : (<div className="space-y-4">
                        <div className="text-sm text-gray-600 mb-4">
                          Showing aggregated receive information:
                        </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-[#003594]">Receive Date</p>
                          <p className="text-base text-gray-900">{selectedItem.receiveDate ? new Date(selectedItem.receiveDate).toLocaleDateString() : 'Multiple / Various'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-[#003594]">Received Quantity</p>
                          <p className="text-base text-gray-900">{typeof selectedItem.receivedTotalApproved === 'number' ? selectedItem.receivedTotalApproved : (selectedItem.receivedQuantity || 'N/A')}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-[#003594]">Received By</p>
                          <p className="text-base text-gray-900">{selectedItem.receivedBy || 'Multiple / Various'}</p>
                      </div>
                        {selectedItem.receiveIdsCsv && (<div className="space-y-1">
                            <p className="text-sm font-medium text-[#003594]">Receive References</p>
                            <p className="text-base text-gray-900 break-words">{selectedItem.receiveIdsCsv}</p>
                          </div>)}
                      {selectedItem.receiveLocation && (<div className="space-y-1">
                          <p className="text-sm font-medium text-[#003594]">Receive Location</p>
                          <p className="text-base text-gray-900">{selectedItem.receiveLocation}</p>
                        </div>)}
                      {selectedItem.receiveCardNumber && (<div className="space-y-1">
                          <p className="text-sm font-medium text-[#003594]">Receive Card Number</p>
                          <p className="text-base text-gray-900">{selectedItem.receiveCardNumber}</p>
                        </div>)}
                      {selectedItem.rejectionReason && (<div className="space-y-1">
                          <p className="text-sm font-medium text-[#003594]">Rejection Reason</p>
                          <p className="text-base text-gray-900">{selectedItem.rejectionReason}</p>
                        </div>)}
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-[#003594]">Receive Image</p>
                        <div className="mt-2">
                          <Image src={getImageSrc(selectedItem.receiveImage)} alt="Received Item" width={160} height={160} className="w-40 h-40 object-cover rounded-lg border border-[#002a6e]/10" unoptimized onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = FALLBACK_IMAGE;
                }}/>
                        </div>
                      </div>
                    </div>)) : (<div className="text-center text-gray-500 py-8">
                      <p>This item has not been received yet.</p>
                    </div>)}
                </div>
              </div>
            </div>)}
        </ModalContent>
      </Modal>

      
      <Modal open={isExportModalOpen} onOpenChange={setIsExportModalOpen}>
        <ModalContent className="max-w-md bg-white rounded-lg shadow-xl border-[#002a6e]/10" onInteractOutside={(e) => e.preventDefault()}>
          <ModalHeader className="border-b border-[#002a6e]/10 pb-4">
            <ModalTitle className="text-xl font-semibold text-[#003594]">Export to Excel</ModalTitle>
            <ModalDescription className="text-gray-600">
              Choose your export option
            </ModalDescription>
          </ModalHeader>
          <div className="p-6 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-[#003594]">Export Type</Label>
                <Select value={exportType} onValueChange={setExportType}>
                  <SelectTrigger className="border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white rounded-md shadow-md border z-[100]">
                    <SelectItem value="all">Export Everything (No Filters)</SelectItem>
                    <SelectItem value="allWithFilters">Export Everything (With Current Filters)</SelectItem>
                    <SelectItem value="currentPage">Export Current Page Only</SelectItem>
                    <SelectItem value="dateRange">Export by Date Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {exportType === 'dateRange' && (<div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#003594]">From Date</Label>
                    <Popover open={isFromOpen} onOpenChange={setIsFromOpen} modal>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal border-[#002a6e]/20", !fromDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4"/>
                          {fromDate ? format(fromDate, "PPP") : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-[100] bg-white rounded-md shadow-md border">
                        <Calendar value={fromDate} onChange={(date) => {
                setFromDate(date || undefined);
                setIsFromOpen(false);
            }}/>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#003594]">To Date</Label>
                    <Popover open={isToOpen} onOpenChange={setIsToOpen} modal>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal border-[#002a6e]/20", !toDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4"/>
                          {toDate ? format(toDate, "PPP") : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-[100] bg-white rounded-md shadow-md border">
                        <Calendar value={toDate} onChange={(date) => {
                setToDate(date || undefined);
                setIsToOpen(false);
            }}/>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>)}

              {exportType === 'currentPage' && (<div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">
                    Will export {data.length} records from the current page (Page {page} of {totalPages})
                  </p>
                </div>)}

              {exportType === 'all' && (<div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-800">
                    Will export all records from the database (ignoring current filters)
                  </p>
                </div>)}

              {exportType === 'allWithFilters' && (<div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">
                    Will export all {totalCount} records matching current filters
                  </p>
                </div>)}
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setIsExportModalOpen(false)} className="border-[#002a6e]/20 hover:bg-[#003594]/5 hover:text-[#003594]">
                Cancel
              </Button>
              <Button onClick={handleExport} disabled={exporting || (exportType === 'dateRange' && (!fromDate || !toDate))} className="bg-[#003594] hover:bg-[#003594]/90 disabled:opacity-50">
                {exporting ? (<>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                    Exporting...
                  </>) : (<>
                    <Download className="h-4 w-4 mr-2"/>
                    Export
                  </>)}
              </Button>
            </div>
          </div>
        </ModalContent>
      </Modal>
    </div>);
}
