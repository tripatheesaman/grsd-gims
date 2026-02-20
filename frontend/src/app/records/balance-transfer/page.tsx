'use client';
import { useState, useEffect } from 'react';
import { API } from '@/lib/api';
import { useAuthContext } from '@/context/AuthContext';
import { useCustomToast } from '@/components/ui/custom-toast';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RotateCcw } from 'lucide-react';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription, } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
interface BalanceTransferRecord {
    id: number;
    rrpNumber: string;
    transferDate: string;
    transferAmount: number;
    transferredBy: string;
    fromNacCode: string;
    toNacCode: string;
    transferQuantity: number;
    partNumber: string;
    itemName: string;
}
export default function BalanceTransferRecordsPage() {
    const { permissions } = useAuthContext();
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const [records, setRecords] = useState<BalanceTransferRecord[]>([]);
    const [filteredRecords, setFilteredRecords] = useState<BalanceTransferRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRevertModalOpen, setIsRevertModalOpen] = useState(false);
    const [selectedRecord, setSelectedRecord] = useState<BalanceTransferRecord | null>(null);
    const [reverting, setReverting] = useState<boolean>(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [universalSearch, setUniversalSearch] = useState('');
    const [equipmentNumberSearch, setEquipmentNumberSearch] = useState('');
    const [partNumberSearch, setPartNumberSearch] = useState('');
    const [filterFromDate, setFilterFromDate] = useState<Date | undefined>(undefined);
    const [filterToDate, setFilterToDate] = useState<Date | undefined>(undefined);
    useEffect(() => {
        const fetchBalanceTransfers = async () => {
            try {
                setIsLoading(true);
                const response = await API.get('/api/balance-transfer/records');
                setRecords(response.data);
                setFilteredRecords(response.data);
            }
            catch {
            }
            finally {
                setIsLoading(false);
            }
        };
        fetchBalanceTransfers();
    }, []);
    useEffect(() => {
        let filtered = records;
        if (universalSearch) {
            filtered = filtered.filter(record => record.fromNacCode.toLowerCase().includes(universalSearch.toLowerCase()) ||
                record.toNacCode.toLowerCase().includes(universalSearch.toLowerCase()) ||
                record.itemName.toLowerCase().includes(universalSearch.toLowerCase()) ||
                record.partNumber.toLowerCase().includes(universalSearch.toLowerCase()) ||
                record.transferredBy.toLowerCase().includes(universalSearch.toLowerCase()));
        }
        if (equipmentNumberSearch) {
            filtered = filtered.filter(record => record.fromNacCode.toLowerCase().includes(equipmentNumberSearch.toLowerCase()) ||
                record.toNacCode.toLowerCase().includes(equipmentNumberSearch.toLowerCase()));
        }
        if (partNumberSearch) {
            filtered = filtered.filter(record => record.partNumber.toLowerCase().includes(partNumberSearch.toLowerCase()));
        }
        if (filterFromDate) {
            const fromBoundary = new Date(filterFromDate);
            fromBoundary.setHours(0, 0, 0, 0);
            filtered = filtered.filter(record => new Date(record.transferDate) >= fromBoundary);
        }
        if (filterToDate) {
            const toBoundary = new Date(filterToDate);
            toBoundary.setHours(23, 59, 59, 999);
            filtered = filtered.filter(record => new Date(record.transferDate) <= toBoundary);
        }
        setFilteredRecords(filtered);
        setCurrentPage(1);
    }, [records, universalSearch, equipmentNumberSearch, partNumberSearch, filterFromDate, filterToDate]);
    const totalPages = Math.ceil(filteredRecords.length / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const currentRecords = filteredRecords.slice(startIndex, endIndex);
    const handlePageChange = (page: number) => {
        setCurrentPage(page);
    };
    const handleRevert = async () => {
        if (!selectedRecord)
            return;
        setReverting(true);
        try {
            const response = await API.post(`/api/balance-transfer/revert/${selectedRecord.id}`);
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: "Balance transfer reverted successfully",
                    duration: 3000,
                });
                setRecords(prev => prev.filter(record => record.id !== selectedRecord.id));
                setFilteredRecords(prev => prev.filter(record => record.id !== selectedRecord.id));
                setIsRevertModalOpen(false);
                setSelectedRecord(null);
            }
            else {
                throw new Error('Revert failed');
            }
        }
        catch {
            showErrorToast({
                title: 'Error',
                message: "Failed to revert balance transfer. Please try again.",
                duration: 5000,
            });
        }
        finally {
            setReverting(false);
        }
    };
    if (!permissions.includes('can_see_all_balance_transfers_records')) {
        return (<div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600">You don&apos;t have permission to view balance transfer records.</p>
        </div>
      </div>);
    }
    return (<div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
                Balance Transfer Records
              </h1>
              <p className="text-gray-600 mt-1">View all balance transfers done to date</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[#d2293b] animate-pulse"></div>
              <span className="text-sm text-gray-600">Live Data</span>
            </div>
          </div>

          
          <div className="bg-white rounded-xl shadow-sm border border-[#002a6e]/10 p-6 hover:border-[#d2293b]/20 transition-colors">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
              
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4"/>
                <Input placeholder="Universal search..." value={universalSearch} onChange={(e) => setUniversalSearch(e.target.value)} className="pl-10 border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20"/>
              </div>
              
              
              <div>
                <Input placeholder="Equipment Number..." value={equipmentNumberSearch} onChange={(e) => setEquipmentNumberSearch(e.target.value)} className="border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20"/>
              </div>
              
              
              <div>
                <Input placeholder="Part number..." value={partNumberSearch} onChange={(e) => setPartNumberSearch(e.target.value)} className="border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20"/>
              </div>
              
              
              <div>
                <Input type="date" placeholder="From Date" value={filterFromDate ? format(filterFromDate, 'yyyy-MM-dd') : ''} onChange={(e) => setFilterFromDate(e.target.value ? new Date(e.target.value) : undefined)} className="border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20"/>
              </div>
              
              
              <div>
                <Input type="date" placeholder="To Date" value={filterToDate ? format(filterToDate, 'yyyy-MM-dd') : ''} onChange={(e) => setFilterToDate(e.target.value ? new Date(e.target.value) : undefined)} className="border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20"/>
              </div>
            </div>

            {isLoading ? (<div className="flex items-center justify-center h-24">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#003594] border-t-transparent"></div>
              </div>) : filteredRecords.length === 0 ? (<div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                <p className="text-gray-500">No balance transfer records found</p>
              </div>) : (<>
                <div className="overflow-x-auto">
                  <table className="w-full table-auto">
                    <thead>
                      <tr className="bg-[#003594]/5 border-b border-[#002a6e]/10">
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider">
                          From Code
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider">
                          To Code
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider">
                          Item
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider">
                          Part Number
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-[#003594] uppercase tracking-wider">
                          Quantity
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-[#003594] uppercase tracking-wider">
                          Amount (NPR)
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider">
                          Transferred By
                        </th>
                        {permissions.includes('can_revert_balance_transfers') && (<th className="px-4 py-3 text-center text-xs font-medium text-[#003594] uppercase tracking-wider">
                            Actions
                          </th>)}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-[#002a6e]/10">
                      {currentRecords.map((record) => (<tr key={record.id} className="hover:bg-[#003594]/5 transition-colors">
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                            {format(new Date(record.transferDate), 'dd/MM/yyyy')}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {record.fromNacCode}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              {record.toNacCode}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-900 max-w-xs" title={record.itemName}>
                            <div className="break-words">
                              {record.itemName || 'N/A'}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-900">
                            {record.partNumber || 'N/A'}
                          </td>
                          <td className="px-4 py-4 text-sm text-center font-medium text-[#003594]">
                            {record.transferQuantity}
                          </td>
                          <td className="px-4 py-4 text-sm text-center font-medium text-[#d2293b]">
                            NPR {record.transferAmount.toLocaleString()}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-900">
                            {record.transferredBy}
                          </td>
                          {permissions.includes('can_revert_balance_transfers') && (<td className="px-4 py-4 text-center">
                              <Button variant="outline" size="sm" onClick={() => {
                        setSelectedRecord(record);
                        setIsRevertModalOpen(true);
                    }} className="border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300">
                                <RotateCcw className="h-4 w-4 mr-2"/>
                                Revert
                              </Button>
                            </td>)}
                        </tr>))}
                    </tbody>
                  </table>
                </div>
                
                
                {totalPages > 1 && (<div className="flex items-center justify-between mt-6">
                    <div className="text-sm text-gray-700">
                      Showing {startIndex + 1} to {Math.min(endIndex, filteredRecords.length)} of {filteredRecords.length} results
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <select value={pageSize} onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }} className="px-2 py-1 border border-[#002a6e]/20 rounded text-sm bg-white">
                        <option value={10}>10 / page</option>
                        <option value={20}>20 / page</option>
                        <option value={50}>50 / page</option>
                        <option value={100}>100 / page</option>
                      </select>
                      <Button variant="outline" size="sm" onClick={() => handlePageChange(1)} disabled={currentPage === 1} className="border-[#002a6e]/20 hover:bg-[#003594]/5 hover:text-[#003594]">
                        <ChevronsLeft className="h-4 w-4"/>
                      </Button>
                      
                      <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="border-[#002a6e]/20 hover:bg-[#003594]/5 hover:text-[#003594]">
                        <ChevronLeft className="h-4 w-4"/>
                      </Button>
                      
                      <div className="flex items-center space-x-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                        pageNum = i + 1;
                    }
                    else if (currentPage <= 3) {
                        pageNum = i + 1;
                    }
                    else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                    }
                    else {
                        pageNum = currentPage - 2 + i;
                    }
                    return (<Button key={pageNum} variant={currentPage === pageNum ? "default" : "outline"} size="sm" onClick={() => handlePageChange(pageNum)} className={currentPage === pageNum
                            ? "bg-[#003594] hover:bg-[#003594]/90 text-white"
                            : "border-[#002a6e]/20 hover:bg-[#003594]/5 hover:text-[#003594]"}>
                              {pageNum}
                            </Button>);
                })}
                      </div>
                      
                      <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="border-[#002a6e]/20 hover:bg-[#003594]/5 hover:text-[#003594]">
                        <ChevronRight className="h-4 w-4"/>
                      </Button>
                      
                      <Button variant="outline" size="sm" onClick={() => handlePageChange(totalPages)} disabled={currentPage === totalPages} className="border-[#002a6e]/20 hover:bg-[#003594]/5 hover:text-[#003594]">
                        <ChevronsRight className="h-4 w-4"/>
                      </Button>
                    </div>
                  </div>)}
              </>)}
          </div>
        </div>
      </div>

      
      <Modal open={isRevertModalOpen} onOpenChange={setIsRevertModalOpen}>
        <ModalContent className="max-w-md bg-white rounded-lg shadow-xl border-[#002a6e]/10">
          <ModalHeader className="border-b border-[#002a6e]/10 pb-4">
            <ModalTitle className="text-xl font-semibold text-red-600">Confirm Revert</ModalTitle>
            <ModalDescription className="text-gray-600">
              This action cannot be undone. All records related to this balance transfer will be deleted.
            </ModalDescription>
          </ModalHeader>
          <div className="p-6 space-y-6">
            {selectedRecord && (<div className="space-y-4">
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <h4 className="font-medium text-red-800 mb-2">Balance Transfer Details:</h4>
                  <div className="text-sm text-red-700 space-y-1">
                    <p><strong>Date:</strong> {format(new Date(selectedRecord.transferDate), 'dd/MM/yyyy')}</p>
                    <p><strong>From:</strong> {selectedRecord.fromNacCode}</p>
                    <p><strong>To:</strong> {selectedRecord.toNacCode}</p>
                    <p><strong>Quantity:</strong> {selectedRecord.transferQuantity}</p>
                    <p><strong>Amount:</strong> NPR {selectedRecord.transferAmount.toLocaleString()}</p>
                  </div>
                </div>
                
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    <strong>Warning:</strong> This will delete all related records and revert stock balances.
                  </p>
                </div>
              </div>)}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => {
            setIsRevertModalOpen(false);
            setSelectedRecord(null);
        }} className="border-[#002a6e]/20 hover:bg-[#003594]/5 hover:text-[#003594]">
                Cancel
              </Button>
              <Button onClick={handleRevert} disabled={reverting} className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white">
                {reverting ? (<>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                    Reverting...
                  </>) : (<>
                    <RotateCcw className="h-4 w-4 mr-2"/>
                    Revert Transfer
                  </>)}
              </Button>
            </div>
          </div>
        </ModalContent>
      </Modal>
    </div>);
}
