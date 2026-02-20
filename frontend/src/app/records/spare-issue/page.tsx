'use client';
import { useAuthContext } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useRef } from 'react';
import { API } from '@/lib/api';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Button } from '@/components/ui/button';
import { Plus, Edit, Trash2, RefreshCw, X, Search } from 'lucide-react';
interface SpareIssueRecord {
    id: number;
    issue_slip_number: string;
    issue_date: string;
    nac_code: string;
    part_number: string;
    item_name: string;
    issue_quantity: number;
    issue_cost: number;
    remaining_balance: number;
    issued_for: string;
    issued_by: {
        name: string;
        staffId: string;
    };
    approval_status: string;
    created_at: string;
    updated_at: string;
}
interface SpareIssueRecordsResponse {
    records: SpareIssueRecord[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}
interface SpareIssueFormData {
    issue_slip_number: string;
    issue_date: string;
    nac_code: string;
    part_number: string;
    issue_quantity: number;
    issue_cost: number;
    remaining_balance: number;
    issued_for: string;
    issued_by: {
        name: string;
        staffId: string;
    };
    approval_status: string;
}
interface FilterOptions {
    issueSlipNumbers: string[];
    nacCodes: Array<{
        nac_code: string;
        item_name: string;
    }>;
    equipmentNumbers: string[];
    approvalStatuses: string[];
}
export default function SpareIssueRecordsPage() {
    const { user, permissions } = useAuthContext();
    const router = useRouter();
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const showErrorToastRef = useRef(showErrorToast);
    useEffect(() => { showErrorToastRef.current = showErrorToast; }, [showErrorToast]);
    const latestRequestRef = useRef<number>(0);
    useEffect(() => {
        if (!user) {
            router.push('/login');
            return;
        }
        if (!permissions.includes('can_access_spares_issue_records')) {
            router.push('/unauthorized');
            return;
        }
    }, [user, permissions, router]);
    const [records, setRecords] = useState<SpareIssueRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [issueSlipNumber, setIssueSlipNumber] = useState('');
    const [partNumber, setPartNumber] = useState('');
    const [itemName, setItemName] = useState('');
    const [nacCode, setNacCode] = useState('');
    const [issuedFor, setIssuedFor] = useState('');
    const [status, setStatus] = useState('all');
    const [issuedBy, setIssuedBy] = useState('all');
    const [sortBy, setSortBy] = useState('issue_date');
    const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
    const [filterOptions, setFilterOptions] = useState<FilterOptions>({
        issueSlipNumbers: [],
        nacCodes: [],
        equipmentNumbers: [],
        approvalStatuses: []
    });
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selectedRecord, setSelectedRecord] = useState<SpareIssueRecord | null>(null);
    const [formData, setFormData] = useState<SpareIssueFormData>({
        issue_slip_number: '',
        issue_date: '',
        nac_code: '',
        part_number: '',
        issue_quantity: 0,
        issue_cost: 0,
        remaining_balance: 0,
        issued_for: '',
        issued_by: { name: '', staffId: '' },
        approval_status: 'PENDING'
    });
    const fetchData = useCallback(async () => {
        const requestId = latestRequestRef.current + 1;
        latestRequestRef.current = requestId;
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: currentPage.toString(),
                limit: pageSize.toString(),
                search: searchTerm,
                issueSlipNumber,
                partNumber,
                itemName,
                nacCode,
                issuedFor,
                status: status === 'all' ? '' : status,
                issuedBy: issuedBy === 'all' ? '' : issuedBy,
                sortBy,
                sortOrder
            });
            const response = await API.get(`/api/spare-issue-records?${params}`);
            if (requestId !== latestRequestRef.current) {
                return;
            }
            const data: SpareIssueRecordsResponse = response.data;
            setRecords(data.records);
            setTotalPages(data.pagination.totalPages);
            setTotalRecords(data.pagination.total);
        }
        catch {
            if (requestId !== latestRequestRef.current) {
                return;
            }
            showErrorToastRef.current({
                title: "Error",
                message: "Failed to fetch spare issue records",
                duration: 3000,
            });
        }
        finally {
            if (requestId === latestRequestRef.current) {
                setLoading(false);
            }
        }
    }, [currentPage, pageSize, searchTerm, issueSlipNumber, partNumber, itemName, nacCode, issuedFor, status, issuedBy, sortBy, sortOrder]);
    const fetchFilterOptions = useCallback(async () => {
        try {
            const response = await API.get('/api/spare-issue-records/filters/options');
            setFilterOptions(response.data.filters);
        }
        catch {
        }
    }, []);
    useEffect(() => {
        fetchData();
    }, [currentPage, searchTerm, issueSlipNumber, partNumber, itemName, nacCode, issuedFor, status, issuedBy, sortBy, sortOrder, fetchData]);
    useEffect(() => {
        fetchFilterOptions();
    }, [fetchFilterOptions]);
    const handleSort = (field: string) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
        }
        else {
            setSortBy(field);
            setSortOrder('ASC');
        }
    };
    const handleCreate = async () => {
        try {
            await API.post('/api/spare-issue-records', formData);
            showSuccessToast({
                title: 'Success',
                message: "Spare issue record created successfully",
                duration: 3000,
            });
            setIsCreateModalOpen(false);
            resetForm();
            fetchData();
        }
        catch {
            showErrorToast({
                title: 'Error',
                message: "Failed to create spare issue record",
                duration: 3000,
            });
        }
    };
    const handleEdit = async () => {
        if (!selectedRecord)
            return;
        try {
            await API.put(`/api/spare-issue-records/${selectedRecord.id}`, formData);
            let message = "Spare issue record updated successfully";
            if (formData.issue_slip_number && formData.issue_slip_number !== selectedRecord.issue_slip_number) {
                message += " (Date auto-adjusted to match slip number)";
            }
            else if (formData.issue_date && formData.issue_date !== selectedRecord.issue_date) {
                message += " (Slip number auto-generated for new date)";
            }
            showSuccessToast({
                title: 'Success',
                message: message,
                duration: 4000,
            });
            setIsEditModalOpen(false);
            resetForm();
            fetchData();
        }
        catch {
            showErrorToast({
                title: 'Error',
                message: "Failed to update spare issue record",
                duration: 3000,
            });
        }
    };
    const handleDelete = async () => {
        if (!selectedRecord)
            return;
        try {
            await API.delete(`/api/spare-issue-records/${selectedRecord.id}`);
            showSuccessToast({
                title: 'Success',
                message: "Spare issue record deleted successfully (Stock balance updated)",
                duration: 3000,
            });
            setIsDeleteModalOpen(false);
            setSelectedRecord(null);
            fetchData();
        }
        catch {
            showErrorToast({
                title: 'Error',
                message: "Failed to delete spare issue record",
                duration: 3000,
            });
        }
    };
    const openCreateModal = () => {
        resetForm();
        setIsCreateModalOpen(true);
    };
    const openEditModal = (record: SpareIssueRecord) => {
        setSelectedRecord(record);
        setFormData({
            issue_slip_number: record.issue_slip_number,
            issue_date: record.issue_date.split('T')[0],
            nac_code: record.nac_code,
            part_number: record.part_number,
            issue_quantity: record.issue_quantity,
            issue_cost: record.issue_cost,
            remaining_balance: record.remaining_balance,
            issued_for: record.issued_for,
            issued_by: record.issued_by,
            approval_status: record.approval_status
        });
        setIsEditModalOpen(true);
    };
    const openDeleteModal = (record: SpareIssueRecord) => {
        setSelectedRecord(record);
        setIsDeleteModalOpen(true);
    };
    const resetForm = () => {
        setFormData({
            issue_slip_number: '',
            issue_date: '',
            nac_code: '',
            part_number: '',
            issue_quantity: 0,
            issue_cost: 0,
            remaining_balance: 0,
            issued_for: '',
            issued_by: { name: '', staffId: '' },
            approval_status: 'PENDING'
        });
    };
    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString();
    };
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'NPR'
        }).format(amount);
    };
    if (!user || !permissions.includes('can_access_spares_issue_records')) {
        return null;
    }
    return (<div className="container mx-auto p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
            Spare Issue Records
          </h1>
          {permissions.includes('can_add_spares_issue_item') && (<Button onClick={openCreateModal} className="bg-[#003594] hover:bg-[#002a6e]">
              <Plus className="w-4 h-4 mr-2"/>
              Add Record
            </Button>)}
        </div>

        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-black/10">
          <div className="space-y-4">
            
            <div className="flex gap-4 mb-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-black/40 w-4 h-4"/>
                  <input type="text" placeholder="Search by Issue Slip#, Part#, Item Name, Equipment..." value={searchTerm} onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
        }} className="w-full pl-10 pr-4 py-2 border border-black/20 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"/>
                </div>
              </div>
              <Button type="button" variant="outline" onClick={() => {
            setSearchTerm('');
            setIssueSlipNumber('');
            setPartNumber('');
            setItemName('');
            setNacCode('');
            setIssuedFor('');
            setStatus('all');
            setIssuedBy('all');
            setCurrentPage(1);
        }} className="border-black/20 text-black hover:bg-black/5">
                <RefreshCw className="w-4 h-4 mr-2"/>
                Reset
              </Button>
            </div>

            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-black mb-1">Issue Slip Number</label>
                <input type="text" placeholder="Enter issue slip number" value={issueSlipNumber} onChange={(e) => {
            setIssueSlipNumber(e.target.value);
            setCurrentPage(1);
        }} className="w-full px-3 py-2 border border-black/20 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-black mb-1">Part Number</label>
                <input type="text" placeholder="Enter part number" value={partNumber} onChange={(e) => {
            setPartNumber(e.target.value);
            setCurrentPage(1);
        }} className="w-full px-3 py-2 border border-black/20 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-black mb-1">Item Name</label>
                <input type="text" placeholder="Enter item name" value={itemName} onChange={(e) => {
            setItemName(e.target.value);
            setCurrentPage(1);
        }} className="w-full px-3 py-2 border border-black/20 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"/>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-black mb-1">NAC Code</label>
                <select value={nacCode} onChange={(e) => {
            setNacCode(e.target.value);
            setCurrentPage(1);
        }} className="w-full px-3 py-2 border border-black/20 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent">
                  <option value="">All NAC Codes</option>
                  {filterOptions.nacCodes.map((option) => (<option key={option.nac_code} value={option.nac_code}>
                      {option.nac_code} - {option.item_name}
                    </option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-black mb-1">Issued For</label>
                <select value={issuedFor} onChange={(e) => {
            setIssuedFor(e.target.value);
            setCurrentPage(1);
        }} className="w-full px-3 py-2 border border-black/20 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent">
                  <option value="">All Equipment</option>
                  {filterOptions.equipmentNumbers.map((equipment) => (<option key={equipment} value={equipment}>
                      {equipment}
                    </option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-black mb-1">Status</label>
                <select value={status} onChange={(e) => {
            setStatus(e.target.value);
            setCurrentPage(1);
        }} className="w-full px-3 py-2 border border-black/20 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent">
                  <option value="all">All Statuses</option>
                  {filterOptions.approvalStatuses.map((statusOption) => (<option key={statusOption} value={statusOption}>
                      {statusOption}
                    </option>))}
                </select>
              </div>
            </div>
          </div>
        </div>

        
        <div className="bg-white rounded-lg shadow-sm border border-black/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-black/5">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-black/70 uppercase tracking-wider cursor-pointer hover:bg-black/10" onClick={() => handleSort('issue_slip_number')}>
                    Issue Slip #
                    {sortBy === 'issue_slip_number' && (<span className="ml-1">{sortOrder === 'ASC' ? '↑' : '↓'}</span>)}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-black/70 uppercase tracking-wider cursor-pointer hover:bg-black/10" onClick={() => handleSort('issue_date')}>
                    Issue Date
                    {sortBy === 'issue_date' && (<span className="ml-1">{sortOrder === 'ASC' ? '↑' : '↓'}</span>)}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-black/70 uppercase tracking-wider cursor-pointer hover:bg-black/10" onClick={() => handleSort('nac_code')}>
                    NAC Code
                    {sortBy === 'nac_code' && (<span className="ml-1">{sortOrder === 'ASC' ? '↑' : '↓'}</span>)}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-black/60 uppercase tracking-wider">
                    Item Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-black/60 uppercase tracking-wider">
                    Part Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-black/70 uppercase tracking-wider cursor-pointer hover:bg-black/10" onClick={() => handleSort('issue_quantity')}>
                    Quantity
                    {sortBy === 'issue_quantity' && (<span className="ml-1">{sortOrder === 'ASC' ? '↑' : '↓'}</span>)}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-black/70 uppercase tracking-wider cursor-pointer hover:bg-black/10" onClick={() => handleSort('issue_cost')}>
                    Cost
                    {sortBy === 'issue_cost' && (<span className="ml-1">{sortOrder === 'ASC' ? '↑' : '↓'}</span>)}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-black/60 uppercase tracking-wider">
                    Equipment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-black/70 uppercase tracking-wider cursor-pointer hover:bg-black/10" onClick={() => handleSort('approval_status')}>
                    Status
                    {sortBy === 'approval_status' && (<span className="ml-1">{sortOrder === 'ASC' ? '↑' : '↓'}</span>)}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-black/60 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-black/10">
                {loading ? (<tr>
                    <td colSpan={10} className="px-6 py-4 text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003594] mx-auto"></div>
                    </td>
                  </tr>) : records.length === 0 ? (<tr>
                    <td colSpan={10} className="px-6 py-4 text-center text-black/60">
                      No records found
                    </td>
                  </tr>) : (records.map((record) => (<tr key={record.id} className="hover:bg-black/5">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-black">
                        {record.issue_slip_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-black/60">
                        {formatDate(record.issue_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-black/60">
                        {record.nac_code}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-black/60">
                        {record.item_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-black/60">
                        {record.part_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-black/60">
                        {record.issue_quantity}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-black/60">
                        {formatCurrency(record.issue_cost)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-black/60">
                        {record.issued_for}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${record.approval_status === 'APPROVED'
                ? 'bg-green-100 text-green-800'
                : record.approval_status === 'PENDING'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'}`}>
                          {record.approval_status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          {permissions.includes('can_edit_spares_issue_item') && (<Button variant="outline" size="sm" onClick={() => openEditModal(record)}>
                              <Edit className="w-4 h-4"/>
                            </Button>)}
                          {permissions.includes('can_delete_spares_issue_item') && (<Button variant="outline" size="sm" onClick={() => openDeleteModal(record)} className="text-red-600 hover:text-red-700">
                              <Trash2 className="w-4 h-4"/>
                            </Button>)}
                        </div>
                      </td>
                    </tr>)))}
              </tbody>
            </table>
          </div>

          
          {totalPages > 1 && (<div className="bg-white px-4 py-3 flex items-center justify-between border-t border-black/10 sm:px-6">
              <div className="flex-1 flex justify-between sm:hidden">
                <Button variant="outline" onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1}>
                  Previous
                </Button>
                <Button variant="outline" onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}>
                  Next
                </Button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-black">
                    Showing <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                    <span className="font-medium">
                      {Math.min(currentPage * pageSize, totalRecords)}
                    </span>{' '}
                    of <span className="font-medium">{totalRecords}</span> results
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                    <select value={pageSize} onChange={(e) => {
            setPageSize(Number(e.target.value));
            setCurrentPage(1);
        }} className="mr-2 px-2 py-1 border border-black/20 rounded bg-white text-sm">
                      <option value={10}>10 / page</option>
                      <option value={25}>25 / page</option>
                      <option value={50}>50 / page</option>
                      <option value={100}>100 / page</option>
                    </select>
                    <Button variant="outline" onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="rounded-l-md">
                      Previous
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (<Button key={page} variant={currentPage === page ? "default" : "outline"} onClick={() => setCurrentPage(page)} className={`px-4 py-2 ${currentPage === page
                    ? 'bg-[#003594] text-white'
                    : 'bg-white text-black hover:bg-black/5'}`}>
                        {page}
                      </Button>))}
                    <Button variant="outline" onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="rounded-r-md">
                      Next
                    </Button>
                  </nav>
                </div>
              </div>
            </div>)}
        </div>

        
        {isCreateModalOpen && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Create Spare Issue Record</h2>
                <Button variant="outline" size="sm" onClick={() => setIsCreateModalOpen(false)}>
                  <X className="w-4 h-4"/>
                </Button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Issue Slip Number
                  </label>
                  <input type="text" value={formData.issue_slip_number} onChange={(e) => setFormData({ ...formData, issue_slip_number: e.target.value })} className="w-full px-3 py-2 border border-black/20 rounded-md focus:outline-none focus:ring-2 focus:ring-[#003594]" required/>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Issue Date
                  </label>
                  <input type="date" value={formData.issue_date} onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })} className="w-full px-3 py-2 border border-black/20 rounded-md focus:outline-none focus:ring-2 focus:ring-[#003594]" required/>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    NAC Code
                  </label>
                  <input type="text" value={formData.nac_code} onChange={(e) => setFormData({ ...formData, nac_code: e.target.value })} className="w-full px-3 py-2 border border-black/20 rounded-md focus:outline-none focus:ring-2 focus:ring-[#003594]" required/>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Part Number
                  </label>
                  <input type="text" value={formData.part_number} onChange={(e) => setFormData({ ...formData, part_number: e.target.value })} className="w-full px-3 py-2 border border-black/20 rounded-md focus:outline-none focus:ring-2 focus:ring-[#003594]" required/>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Issue Quantity
                  </label>
                  <input type="number" value={formData.issue_quantity} onChange={(e) => setFormData({ ...formData, issue_quantity: Number(e.target.value) })} className="w-full px-3 py-2 border border-black/20 rounded-md focus:outline-none focus:ring-2 focus:ring-[#003594]" required/>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Issue Cost
                  </label>
                  <input type="number" step="0.01" value={formData.issue_cost} onChange={(e) => setFormData({ ...formData, issue_cost: Number(e.target.value) })} className="w-full px-3 py-2 border border-black/20 rounded-md focus:outline-none focus:ring-2 focus:ring-[#003594]"/>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Equipment Number
                  </label>
                  <input type="text" value={formData.issued_for} onChange={(e) => setFormData({ ...formData, issued_for: e.target.value })} className="w-full px-3 py-2 border border-black/20 rounded-md focus:outline-none focus:ring-2 focus:ring-[#003594]" required/>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Approval Status
                  </label>
                  <select value={formData.approval_status} onChange={(e) => setFormData({ ...formData, approval_status: e.target.value })} className="w-full px-3 py-2 border border-black/20 rounded-md focus:outline-none focus:ring-2 focus:ring-[#003594]">
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Issued By Name
                  </label>
                  <input type="text" value={formData.issued_by.name} onChange={(e) => setFormData({
                ...formData,
                issued_by: { ...formData.issued_by, name: e.target.value }
            })} className="w-full px-3 py-2 border border-black/20 rounded-md focus:outline-none focus:ring-2 focus:ring-[#003594]" required/>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Staff ID
                  </label>
                  <input type="text" value={formData.issued_by.staffId} onChange={(e) => setFormData({
                ...formData,
                issued_by: { ...formData.issued_by, staffId: e.target.value }
            })} className="w-full px-3 py-2 border border-black/20 rounded-md focus:outline-none focus:ring-2 focus:ring-[#003594]" required/>
                </div>
              </div>
              
              <div className="flex justify-end space-x-2 mt-6">
                <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} className="bg-[#003594] hover:bg-[#002a6e]">
                  Create
                </Button>
              </div>
            </div>
          </div>)}

        
        {isEditModalOpen && selectedRecord && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Edit Spare Issue Record</h2>
                <Button variant="outline" size="sm" onClick={() => setIsEditModalOpen(false)}>
                  <X className="w-4 h-4"/>
                </Button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Issue Slip Number
                  </label>
                  <input type="text" value={formData.issue_slip_number} onChange={(e) => setFormData({ ...formData, issue_slip_number: e.target.value })} className="w-full px-3 py-2 border border-black/20 rounded-md focus:outline-none focus:ring-2 focus:ring-[#003594]" required/>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Issue Date
                  </label>
                  <input type="date" value={formData.issue_date} onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })} className="w-full px-3 py-2 border border-black/20 rounded-md focus:outline-none focus:ring-2 focus:ring-[#003594]" required/>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    NAC Code
                  </label>
                  <input type="text" value={formData.nac_code} onChange={(e) => setFormData({ ...formData, nac_code: e.target.value })} className="w-full px-3 py-2 border border-black/20 rounded-md focus:outline-none focus:ring-2 focus:ring-[#003594]" required/>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Part Number
                  </label>
                  <input type="text" value={formData.part_number} onChange={(e) => setFormData({ ...formData, part_number: e.target.value })} className="w-full px-3 py-2 border border-black/20 rounded-md focus:outline-none focus:ring-2 focus:ring-[#003594]" required/>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Issue Quantity
                  </label>
                  <input type="number" value={formData.issue_quantity} onChange={(e) => setFormData({ ...formData, issue_quantity: Number(e.target.value) })} className="w-full px-3 py-2 border border-black/20 rounded-md focus:outline-none focus:ring-2 focus:ring-[#003594]" required/>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Issue Cost
                  </label>
                  <input type="number" step="0.01" value={formData.issue_cost} onChange={(e) => setFormData({ ...formData, issue_cost: Number(e.target.value) })} className="w-full px-3 py-2 border border-black/20 rounded-md focus:outline-none focus:ring-2 focus:ring-[#003594]"/>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Equipment Number
                  </label>
                  <input type="text" value={formData.issued_for} onChange={(e) => setFormData({ ...formData, issued_for: e.target.value })} className="w-full px-3 py-2 border border-black/20 rounded-md focus:outline-none focus:ring-2 focus:ring-[#003594]" required/>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Approval Status
                  </label>
                  <select value={formData.approval_status} onChange={(e) => setFormData({ ...formData, approval_status: e.target.value })} className="w-full px-3 py-2 border border-black/20 rounded-md focus:outline-none focus:ring-2 focus:ring-[#003594]">
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Issued By Name
                  </label>
                  <input type="text" value={formData.issued_by.name} onChange={(e) => setFormData({
                ...formData,
                issued_by: { ...formData.issued_by, name: e.target.value }
            })} className="w-full px-3 py-2 border border-black/20 rounded-md focus:outline-none focus:ring-2 focus:ring-[#003594]" required/>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Staff ID
                  </label>
                  <input type="text" value={formData.issued_by.staffId} onChange={(e) => setFormData({
                ...formData,
                issued_by: { ...formData.issued_by, staffId: e.target.value }
            })} className="w-full px-3 py-2 border border-black/20 rounded-md focus:outline-none focus:ring-2 focus:ring-[#003594]" required/>
                </div>
              </div>
              
              <div className="flex justify-end space-x-2 mt-6">
                <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleEdit} className="bg-[#003594] hover:bg-[#002a6e]">
                  Update
                </Button>
              </div>
            </div>
          </div>)}

        
        {isDeleteModalOpen && selectedRecord && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-red-600">Delete Record</h2>
                <Button variant="outline" size="sm" onClick={() => setIsDeleteModalOpen(false)}>
                  <X className="w-4 h-4"/>
                </Button>
              </div>
              
              <p className="text-black/60 mb-6">
                Are you sure you want to delete this spare issue record? This action cannot be undone.
              </p>
              
              <div className="bg-black/5 p-4 rounded-lg mb-6">
                <p><strong>Issue Slip:</strong> {selectedRecord.issue_slip_number}</p>
                <p><strong>NAC Code:</strong> {selectedRecord.nac_code}</p>
                <p><strong>Item:</strong> {selectedRecord.item_name}</p>
                <p><strong>Quantity:</strong> {selectedRecord.issue_quantity}</p>
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                  Delete
                </Button>
              </div>
            </div>
          </div>)}
      </div>
    </div>);
}
