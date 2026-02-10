'use client';
import { useEffect, useState, useCallback } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { API } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, ChevronLeft, ChevronRight, Loader2, Download, X } from 'lucide-react';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/utils/utils';
import { format } from 'date-fns';
import { ReceiveRRPReportItem, ReceiveRRPReportResponse } from '@/types/rrpReport';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
export default function ReceiveRRPReportPage() {
    const { permissions } = useAuthContext();
    const canAccessReport = permissions?.includes('can_access_rrp_reports');
    const { showErrorToast, showSuccessToast } = useCustomToast();
    const [data, setData] = useState<ReceiveRRPReportItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [itemName, setItemName] = useState('');
    const [partNumber, setPartNumber] = useState('');
    const [nacCode, setNacCode] = useState('');
    const [equipmentNumber, setEquipmentNumber] = useState('');
    const [supplierName, setSupplierName] = useState('');
    const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
    const [toDate, setToDate] = useState<Date | undefined>(undefined);
    const [hasRRP, setHasRRP] = useState<string>('all');
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportType, setExportType] = useState('currentPage');
    const [exportFromDate, setExportFromDate] = useState<Date | undefined>(undefined);
    const [exportToDate, setExportToDate] = useState<Date | undefined>(undefined);
    const [exporting, setExporting] = useState(false);
    const fetchReport = useCallback(async () => {
        if (!canAccessReport)
            return;
        setIsLoading(true);
        try {
            const params: Record<string, string> = {
                page: page.toString(),
                pageSize: '20',
            };
            if (fromDate) {
                params.fromDate = format(fromDate, 'yyyy-MM-dd');
            }
            if (toDate) {
                params.toDate = format(toDate, 'yyyy-MM-dd');
            }
            if (itemName) {
                params.itemName = itemName;
            }
            if (partNumber) {
                params.partNumber = partNumber;
            }
            if (nacCode) {
                params.nacCode = nacCode;
            }
            if (equipmentNumber) {
                params.equipmentNumber = equipmentNumber;
            }
            if (supplierName) {
                params.supplierName = supplierName;
            }
            if (hasRRP !== 'all') {
                params.hasRRP = hasRRP;
            }
            const response = await API.get<ReceiveRRPReportResponse>('/api/report/receive-rrp', { params });
            setData(response.data.data);
            setTotalPages(response.data.pagination.totalPages);
            setTotal(response.data.pagination.total);
        }
        catch {
            showErrorToast({
                title: 'Error',
                message: 'Failed to fetch receive and RRP report',
                duration: 5000,
            });
            setData([]);
        }
        finally {
            setIsLoading(false);
        }
    }, [canAccessReport, page, fromDate, toDate, itemName, partNumber, nacCode, equipmentNumber, supplierName, hasRRP, showErrorToast]);
    useEffect(() => {
        fetchReport();
    }, [page, fromDate, toDate, itemName, partNumber, nacCode, equipmentNumber, supplierName, hasRRP, fetchReport]);
    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
    };
    const handleClearSearch = () => {
        setItemName('');
        setPartNumber('');
        setNacCode('');
        setEquipmentNumber('');
        setSupplierName('');
        setFromDate(undefined);
        setToDate(undefined);
        setHasRRP('all');
        setPage(1);
    };
    const handleExport = async () => {
        if (exportType === 'dateRange' && (!exportFromDate || !exportToDate)) {
            showErrorToast({
                title: 'Error',
                message: 'Please select both from and to dates for date range export',
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
                itemName?: string;
                partNumber?: string;
                nacCode?: string;
                equipmentNumber?: string;
                supplierName?: string;
                hasRRP?: string;
            } = { exportType };
            if (exportType === 'dateRange') {
                exportData.fromDate = format(exportFromDate!, 'yyyy-MM-dd');
                exportData.toDate = format(exportToDate!, 'yyyy-MM-dd');
            }
            else if (exportType === 'currentPage') {
                exportData.page = page;
                exportData.pageSize = 20;
            }
            else if (exportType === 'all') {
                exportData.page = 1;
                exportData.pageSize = 10000;
            }
            if (itemName)
                exportData.itemName = itemName;
            if (partNumber)
                exportData.partNumber = partNumber;
            if (nacCode)
                exportData.nacCode = nacCode;
            if (equipmentNumber)
                exportData.equipmentNumber = equipmentNumber;
            if (supplierName)
                exportData.supplierName = supplierName;
            if (hasRRP !== 'all')
                exportData.hasRRP = hasRRP;
            const response = await API.post('/api/report/receive-rrp/export', exportData, {
                responseType: 'blob'
            });
            if (response.status === 200) {
                const blob = new Blob([response.data]);
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Receive_RRP_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                showSuccessToast({
                    title: 'Success',
                    message: 'Report exported successfully',
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
                title: 'Export Failed',
                message: 'Failed to export report. Please try again.',
                duration: 5000,
            });
        }
        finally {
            setExporting(false);
        }
    };
    if (!canAccessReport) {
        return (<div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 bg-[#f6f8fc]/80 p-6 text-center">
        <h1 className="text-lg font-semibold text-[#003594]">Access Denied</h1>
        <p className="max-w-md text-sm text-gray-600">
          You do not have permission to access this report. If you believe this is a mistake, please contact an administrator.
        </p>
      </div>);
    }
    return (<div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
                Receive and RRP Report
              </h1>
              <p className="text-gray-600 mt-1">View received items and their associated RRP details</p>
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
                    <Label className="text-sm font-medium text-[#003594]">Item Name</Label>
                    <Input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Search by item name" className="bg-white border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20"/>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#003594]">Part Number</Label>
                    <Input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} placeholder="Search by part number" className="bg-white border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20"/>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#003594]">NAC Code</Label>
                    <Input value={nacCode} onChange={(e) => setNacCode(e.target.value)} placeholder="Search by NAC code" className="bg-white border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20"/>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#003594]">Equipment Number</Label>
                    <Input value={equipmentNumber} onChange={(e) => setEquipmentNumber(e.target.value)} placeholder="Search by equipment number" className="bg-white border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20"/>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#003594]">Supplier Name</Label>
                    <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Search by supplier name" className="bg-white border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20"/>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#003594]">From Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn('w-full justify-start text-left font-normal bg-white border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20', !fromDate && 'text-muted-foreground')}>
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
                          {toDate ? format(toDate, 'PPP') : 'Select date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 bg-white" align="start">
                        <Calendar value={toDate} onChange={(date) => setToDate(date || undefined)}/>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#003594]">RRP Status</Label>
                    <Select value={hasRRP} onValueChange={setHasRRP}>
                      <SelectTrigger className="bg-white border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white rounded-md shadow-md border z-[100]">
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="true">Has RRP</SelectItem>
                        <SelectItem value="false">No RRP</SelectItem>
                      </SelectContent>
                    </Select>
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
                </div>) : (<div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Receive Date</TableHead>
                        <TableHead>Item Name</TableHead>
                        <TableHead>Part Number</TableHead>
                        <TableHead>NAC Code</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Request #</TableHead>
                        <TableHead>RRP Number</TableHead>
                        <TableHead>RRP Date</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Total Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.map((item) => (<TableRow key={item.receive_id}>
                          <TableCell>
                            {item.receive_date ? format(new Date(item.receive_date), 'MMM dd, yyyy') : 'N/A'}
                          </TableCell>
                          <TableCell>{item.item_name || 'N/A'}</TableCell>
                          <TableCell>{item.part_number || 'N/A'}</TableCell>
                          <TableCell>{item.nac_code || 'N/A'}</TableCell>
                          <TableCell>
                            {item.received_quantity} {item.unit || ''}
                          </TableCell>
                          <TableCell>{item.request_number || 'N/A'}</TableCell>
                          <TableCell>
                            {item.rrp_number || (<span className="text-gray-400 italic">Not created</span>)}
                          </TableCell>
                          <TableCell>
                            {item.rrp_date ? (format(new Date(item.rrp_date), 'MMM dd, yyyy')) : (<span className="text-gray-400 italic">-</span>)}
                          </TableCell>
                          <TableCell>
                            {item.supplier_name || (<span className="text-gray-400 italic">-</span>)}
                          </TableCell>
                          <TableCell>
                            {item.total_amount !== null && item.total_amount !== undefined ? (`${item.currency || ''} ${Number(item.total_amount).toFixed(2)}`) : (<span className="text-gray-400 italic">-</span>)}
                          </TableCell>
                          <TableCell>
                            {item.rrp_approval_status ? (<span className={cn('px-2 py-1 rounded text-xs font-medium', item.rrp_approval_status === 'APPROVED' && 'bg-green-100 text-green-800', item.rrp_approval_status === 'PENDING' && 'bg-yellow-100 text-yellow-800', item.rrp_approval_status === 'REJECTED' && 'bg-red-100 text-red-800')}>
                                {item.rrp_approval_status}
                              </span>) : (<span className="text-gray-400 italic">-</span>)}
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
            <RadioGroup value={exportType} onValueChange={setExportType}>
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
    </div>);
}
