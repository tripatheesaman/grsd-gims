'use client';
import { useEffect, useState, useMemo } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useApiQuery, useApiPost } from '@/hooks/api';
import { queryKeys } from '@/lib/queryKeys';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/utils/utils';
import { format } from 'date-fns';
import { BorrowSource } from '@/types/borrow-receive';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

interface BorrowHistoryData {
    receiveId: number;
    receiveDate: string;
    borrowDate: string;
    returnDate: string | null;
    receivedBy: string;
    partNumber: string;
    itemName: string;
    nacCode: string;
    receivedQuantity: number;
    unit: string;
    approvalStatus: string;
    borrowStatus: string;
    derivedReceiveStatus: string;
    derivedBorrowStatus: string;
    borrowReferenceNumber: string | null;
    borrowSourceName: string | null;
    borrowSourceCode: string | null;
    imagePath: string | null;
    location: string | null;
    cardNumber: string | null;
    createdAt: string;
    updatedAt: string;
}

interface ReportResponse {
    data: BorrowHistoryData[];
    pagination: {
        currentPage: number;
        pageSize: number;
        totalCount: number;
        totalPages: number;
    };
}

export default function BorrowHistoryReportPage() {
    const queryClient = useQueryClient();
    const { user } = useAuthContext();
    const router = useRouter();
    const { showErrorToast, showSuccessToast } = useCustomToast();
    const [universal, setUniversal] = useState<string>('');
    const [borrowSourceId, setBorrowSourceId] = useState<string>('all');
    const [borrowStatus, setBorrowStatus] = useState<string>('all');
    const [receiveStatus, setReceiveStatus] = useState<string>('all');
    const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
    const [toDate, setToDate] = useState<Date | undefined>(undefined);
    const [page, setPage] = useState<number>(1);
    const [pageSize] = useState<number>(20);
    const [isFromOpen, setIsFromOpen] = useState<boolean>(false);
    const [isToOpen, setIsToOpen] = useState<boolean>(false);
    const [isReturnModalOpen, setIsReturnModalOpen] = useState<boolean>(false);
    const [selectedReturnItem, setSelectedReturnItem] = useState<BorrowHistoryData | null>(null);
    const [returnDate, setReturnDate] = useState<Date | undefined>(undefined);
    const [isReturnDateOpen, setIsReturnDateOpen] = useState<boolean>(false);
    useEffect(() => {
        if (!user) {
            router.push('/login');
        }
    }, [user, router]);

    const params = useMemo(() => {
        const p: Record<string, string> = {
                page: page.toString(),
                pageSize: pageSize.toString(),
            };
            if (universal.trim())
            p.universal = universal.trim();
            if (borrowSourceId !== 'all')
            p.borrowSourceId = borrowSourceId;
            if (borrowStatus !== 'all')
            p.borrowStatus = borrowStatus;
            if (receiveStatus !== 'all')
            p.receiveStatus = receiveStatus;
            if (fromDate)
            p.fromDate = format(fromDate, 'yyyy-MM-dd');
            if (toDate)
            p.toDate = format(toDate, 'yyyy-MM-dd');
        return p;
    }, [page, pageSize, universal, borrowSourceId, borrowStatus, receiveStatus, fromDate, toDate]);
    
    const { data: response, isLoading: loading } = useApiQuery<ReportResponse>(
        queryKeys.reports.all,
        '/api/report/borrow-history',
        params,
        {
            enabled: !!user,
            staleTime: 1000 * 30,
        }
    );
    
    const { data: borrowSourcesRes } = useApiQuery<{ data: BorrowSource[] }>(
        queryKeys.borrowSources.active(),
        '/api/borrow-sources',
        undefined,
        {
            enabled: !!user,
            staleTime: 1000 * 60 * 10,
        }
    );
    
    const data = response?.data?.data || [];
    const totalCount = response?.data?.pagination?.totalCount || 0;
    const totalPages = response?.data?.pagination?.totalPages || 0;
    const borrowSources = borrowSourcesRes?.data?.data || [];
    
    const returnMutation = useApiPost({
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });
            showSuccessToast({
                title: "Success",
                message: "Item return submitted successfully. Awaiting approval.",
                duration: 3000,
            });
            setIsReturnModalOpen(false);
            setSelectedReturnItem(null);
            setReturnDate(undefined);
        },
        onError: (error: unknown) => {
            const err = error as {
                response?: {
                    data?: {
                        message?: string;
                    };
                };
            };
            showErrorToast({
                title: "Error",
                message: err?.response?.data?.message || 'Failed to return item',
                duration: 3000,
            });
        }
    });
    
    const handleSearch = () => {
        setPage(1);
    };
    
    const handleClear = () => {
        setUniversal('');
        setBorrowSourceId('all');
        setBorrowStatus('all');
        setReceiveStatus('all');
        setFromDate(undefined);
        setToDate(undefined);
        setPage(1);
    };
    
    const getStatusBadge = (status: string) => {
        const statusMap: Record<string, {
            bg: string;
            text: string;
        }> = {
            'ACTIVE': { bg: 'bg-blue-100', text: 'text-blue-800' },
            'RETURNED': { bg: 'bg-green-100', text: 'text-green-800' },
            'CANCELLED': { bg: 'bg-red-100', text: 'text-red-800' },
            'Pending Approval': { bg: 'bg-yellow-100', text: 'text-yellow-800' },
            'Approved': { bg: 'bg-green-100', text: 'text-green-800' },
            'Rejected': { bg: 'bg-red-100', text: 'text-red-800' },
        };
        const style = statusMap[status] || { bg: 'bg-gray-100', text: 'text-gray-800' };
        return (<span className={`px-2 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
        {status}
      </span>);
    };
    
    const handleReturnClick = (item: BorrowHistoryData) => {
        setSelectedReturnItem(item);
        setReturnDate(undefined);
        setIsReturnModalOpen(true);
    };
    
    const handleReturnItem = () => {
        if (!selectedReturnItem || !returnDate || !user) {
            showErrorToast({
                title: "Error",
                message: "Please select a return date",
                duration: 3000,
            });
            return;
        }
        returnMutation.mutate({
            url: '/api/borrow-receive/return',
            data: {
                borrowReceiveId: selectedReturnItem.receiveId,
                returnDate: format(returnDate, 'yyyy-MM-dd'),
                receivedBy: user.UserInfo.username
            }
        });
    };
    
    if (!user) {
        return null;
    }

    return (<div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
              Borrow History Report
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <Label>Universal Search</Label>
                  <Input placeholder="Search items, codes, reference..." value={universal} onChange={(e) => setUniversal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} className="mt-1"/>
                </div>
                <div>
                  <Label>Borrow Source</Label>
                  <Select value={borrowSourceId} onValueChange={setBorrowSourceId}>
                    <SelectTrigger className="mt-1 bg-white">
                      <SelectValue placeholder="All Sources"/>
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectItem value="all">All Sources</SelectItem>
                      {borrowSources.map((source) => (<SelectItem key={source.id} value={String(source.id)}>
                          {source.source_name} {source.source_code ? `(${source.source_code})` : ''}
                        </SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Borrow Status</Label>
                  <Select value={borrowStatus} onValueChange={setBorrowStatus}>
                    <SelectTrigger className="mt-1 bg-white">
                      <SelectValue placeholder="All Statuses"/>
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="RETURNED">Returned</SelectItem>
                      <SelectItem value="CANCELLED">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Receive Status</Label>
                  <Select value={receiveStatus} onValueChange={setReceiveStatus}>
                    <SelectTrigger className="mt-1 bg-white">
                      <SelectValue placeholder="All Statuses"/>
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>From Date</Label>
                  <Popover open={isFromOpen} onOpenChange={setIsFromOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full mt-1 justify-start text-left font-normal bg-white", !fromDate && "text-muted-foreground")}>
                        {fromDate ? format(fromDate, 'PPP') : 'Select date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-white" align="start">
                      <Calendar value={fromDate} onChange={(date) => {
            setFromDate(date || undefined);
            setIsFromOpen(false);
        }}/>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label>To Date</Label>
                  <Popover open={isToOpen} onOpenChange={setIsToOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full mt-1 justify-start text-left font-normal bg-white", !toDate && "text-muted-foreground")}>
                        {toDate ? format(toDate, 'PPP') : 'Select date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-white" align="start">
                      <Calendar value={toDate} onChange={(date) => {
            setToDate(date || undefined);
            setIsToOpen(false);
        }}/>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              
              <div className="flex gap-2">
                <Button onClick={handleSearch} className="bg-[#003594] text-white hover:bg-[#002a6e]">
                  <Search className="h-4 w-4 mr-2"/>
                  Search
                </Button>
                <Button variant="outline" onClick={handleClear}>
                  Clear
                </Button>
              </div>

              
              {loading ? (<div className="text-center py-8">Loading...</div>) : data.length === 0 ? (<div className="text-center py-8 text-gray-500">No borrow history found</div>) : (<>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-[#003594] text-white">
                          <th className="border p-2 text-left">Borrow Date</th>
                          <th className="border p-2 text-left">Item Name</th>
                          <th className="border p-2 text-left">NAC Code</th>
                          <th className="border p-2 text-left">Part Number</th>
                          <th className="border p-2 text-left">Quantity</th>
                          <th className="border p-2 text-left">Source</th>
                          <th className="border p-2 text-left">Borrow Status</th>
                          <th className="border p-2 text-left">Receive Status</th>
                          <th className="border p-2 text-left">Return Date</th>
                          <th className="border p-2 text-left">Received By</th>
                          <th className="border p-2 text-left">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.map((item) => (<tr key={item.receiveId} className="hover:bg-gray-50">
                            <td className="border p-2">{item.borrowDate || item.receiveDate}</td>
                            <td className="border p-2">{item.itemName}</td>
                            <td className="border p-2">{item.nacCode}</td>
                            <td className="border p-2">{item.partNumber || '-'}</td>
                            <td className="border p-2">{item.receivedQuantity} {item.unit}</td>
                            <td className="border p-2">
                              {item.borrowSourceName || '-'}
                              {item.borrowSourceCode && ` (${item.borrowSourceCode})`}
                            </td>
                            <td className="border p-2">{getStatusBadge(item.derivedBorrowStatus)}</td>
                            <td className="border p-2">{getStatusBadge(item.derivedReceiveStatus)}</td>
                            <td className="border p-2">{item.returnDate || '-'}</td>
                            <td className="border p-2">{item.receivedBy}</td>
                            <td className="border p-2">
                              {item.borrowStatus === 'ACTIVE' && item.approvalStatus === 'APPROVED' && (<Button variant="outline" size="sm" onClick={() => handleReturnClick(item)} className="flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                                  <RotateCcw className="h-4 w-4"/>
                                  Return
                                </Button>)}
                            </td>
                          </tr>))}
                      </tbody>
                    </table>
                  </div>

                  
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-gray-600">
                      Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} results
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading}>
                        <ChevronLeft className="h-4 w-4"/>
                        Previous
                      </Button>
                      <Button variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading}>
                        Next
                        <ChevronRight className="h-4 w-4"/>
                      </Button>
                    </div>
                  </div>
                </>)}
            </div>
          </CardContent>
        </Card>
      </div>

      
      <Dialog open={isReturnModalOpen} onOpenChange={setIsReturnModalOpen}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>Return Borrowed Item</DialogTitle>
            <DialogDescription>
              Return the borrowed item: {selectedReturnItem?.itemName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Item Details</p>
              <div className="bg-gray-50 p-3 rounded-lg space-y-1">
                <p className="text-sm"><span className="font-medium">Item:</span> {selectedReturnItem?.itemName}</p>
                <p className="text-sm"><span className="font-medium">NAC Code:</span> {selectedReturnItem?.nacCode}</p>
                <p className="text-sm"><span className="font-medium">Quantity:</span> {selectedReturnItem?.receivedQuantity} {selectedReturnItem?.unit}</p>
                <p className="text-sm"><span className="font-medium">Source:</span> {selectedReturnItem?.borrowSourceName}</p>
                <p className="text-sm"><span className="font-medium">Borrow Date:</span> {selectedReturnItem?.borrowDate && new Date(selectedReturnItem.borrowDate).toLocaleDateString()}</p>
              </div>
            </div>
            <div>
              <Label>Return Date *</Label>
              <Popover open={isReturnDateOpen} onOpenChange={setIsReturnDateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full mt-1 justify-start text-left font-normal bg-white", !returnDate && "text-muted-foreground")}>
                    {returnDate ? format(returnDate, 'PPP') : 'Select return date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-white" align="start">
                  <Calendar value={returnDate} onChange={(date) => {
            setReturnDate(date || undefined);
            setIsReturnDateOpen(false);
        }}/>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReturnModalOpen(false)} disabled={returnMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={handleReturnItem} disabled={!returnDate || returnMutation.isPending} className="bg-[#003594] text-white hover:bg-[#002a6e]">
              {returnMutation.isPending ? 'Returning...' : 'Submit Return'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>);
}
