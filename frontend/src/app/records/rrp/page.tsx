'use client';
import { useAuthContext } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useRef } from 'react';
import { API } from '@/lib/api';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Plus, Edit, Trash2 } from 'lucide-react';
interface RRPRecord {
    id: number;
    rrp_number: string;
    request_number: string;
    receive_number: string;
    supplier_name: string;
    date: string;
    currency: string;
    forex_rate: number;
    item_price: number;
    customs_charge: number;
    customs_date: string | null;
    customs_number: string | null;
    freight_charge: number;
    customs_service_charge: number;
    vat_percentage: number;
    invoice_number: string;
    invoice_date: string;
    po_number: string | null;
    total_amount: number;
    airway_bill_number: string | null;
    inspection_details: string | null;
    reference_doc: string | null;
    current_fy: string;
    approval_status: string;
    created_by: string;
    approved_by: string | null;
    rejected_by: string | null;
    rejection_reason: string | null;
    created_at: string;
    updated_at: string;
    item_name: string;
    nac_code: string;
    part_number: string;
    received_quantity: number;
    unit: string;
    received_by: string;
    receive_date: string;
    requested_by: string;
    request_date: string;
    equipment_number: string;
}
interface RRPRecordsResponse {
    data: RRPRecord[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
}
interface RRPFormData {
    receive_fk?: number;
    rrp_number: string;
    supplier_name: string;
    date: string;
    currency: string;
    forex_rate: number;
    item_price: number;
    customs_charge: number;
    customs_date: string;
    customs_number: string;
    freight_charge: number;
    customs_service_charge: number;
    vat_percentage: number;
    invoice_number: string;
    invoice_date: string;
    po_number: string;
    total_amount: number;
    airway_bill_number: string;
    inspection_details: string;
    reference_doc: string;
    approval_status: string;
    created_by: string;
}
interface FilterOptions {
    statuses: string[];
    createdBy: string[];
}
export default function RRPRecordsPage() {
    const { user, permissions } = useAuthContext();
    const router = useRouter();
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const showErrorToastRef = useRef(showErrorToast);
    useEffect(() => { showErrorToastRef.current = showErrorToast; }, [showErrorToast]);
    const fetchingRef = useRef<boolean>(false);
    useEffect(() => {
        if (!user) {
            router.push('/login');
            return;
        }
        if (!permissions.includes('can_access_rrp_records')) {
            router.push('/unauthorized');
            return;
        }
    }, [user, permissions, router]);
    const canAccess = !!user && permissions.includes('can_access_rrp_records');
    const canCreate = permissions.includes('can_create_rrp_item');
    const canEdit = permissions.includes('can_edit_rrp_item');
    const canDelete = permissions.includes('can_delete_rrp_item');
    const [universal, setUniversal] = useState<string>('');
    const [equipmentNumber, setEquipmentNumber] = useState<string>('');
    const [partNumber, setPartNumber] = useState<string>('');
    const [status, setStatus] = useState<string>('all');
    const [createdBy, setCreatedBy] = useState<string>('all');
    const [page, setPage] = useState<number>(1);
    const [pageSize] = useState<number>(20);
    const [records, setRecords] = useState<RRPRecord[]>([]);
    const [totalCount, setTotalCount] = useState<number>(0);
    const [totalPages, setTotalPages] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [filterOptions, setFilterOptions] = useState<FilterOptions>({ statuses: [], createdBy: [] });
    const [suppliers, setSuppliers] = useState<{
        local: string[];
        foreign: string[];
    }>({ local: [], foreign: [] });
    const [showSupplierDropdown, setShowSupplierDropdown] = useState<boolean>(false);
    const [supplierSearchTerm, setSupplierSearchTerm] = useState<string>('');
    const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
    const [showEditModal, setShowEditModal] = useState<boolean>(false);
    const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
    const [editingRecord, setEditingRecord] = useState<RRPRecord | null>(null);
    const [deletingRecord, setDeletingRecord] = useState<RRPRecord | null>(null);
    const [showStatusModal, setShowStatusModal] = useState<boolean>(false);
    const [statusEditingRecord, setStatusEditingRecord] = useState<RRPRecord | null>(null);
    const [newStatus, setNewStatus] = useState<string>('');
    const [formData, setFormData] = useState<RRPFormData>({
        rrp_number: '',
        supplier_name: '',
        date: '',
        currency: 'NPR',
        forex_rate: 1,
        item_price: 0,
        customs_charge: 0,
        customs_date: '',
        customs_number: '',
        freight_charge: 0,
        customs_service_charge: 0,
        vat_percentage: 0,
        invoice_number: '',
        invoice_date: '',
        po_number: '',
        total_amount: 0,
        airway_bill_number: '',
        inspection_details: '',
        reference_doc: '',
        approval_status: 'PENDING',
        created_by: user?.UserInfo?.username || ''
    });
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState<boolean>(false);
    const fetchData = useCallback(async () => {
        if (fetchingRef.current)
            return;
        fetchingRef.current = true;
        try {
            setLoading(true);
            setError(null);
            const params = new URLSearchParams({
                page: page.toString(),
                pageSize: pageSize.toString(),
                ...(universal && { universal }),
                ...(equipmentNumber && { equipmentNumber }),
                ...(partNumber && { partNumber }),
                ...(status && status !== 'all' && { status }),
                ...(createdBy && createdBy !== 'all' && { createdBy })
            });
            const response = await API.get(`/api/rrp-records?${params}`);
            if (response.status === 200) {
                const data: RRPRecordsResponse = response.data;
                setRecords(data.data);
                setTotalCount(data.totalCount);
                setTotalPages(data.totalPages);
            }
        }
        catch {
            setError('Failed to fetch RRP records');
            showErrorToastRef.current({
                title: "Error",
                message: "Failed to fetch RRP records",
                duration: 3000,
            });
        }
        finally {
            setLoading(false);
            fetchingRef.current = false;
        }
    }, [page, pageSize, universal, equipmentNumber, partNumber, status, createdBy]);
    const fetchFilterOptions = useCallback(async () => {
        try {
            const response = await API.get('/api/rrp-records/filters/options');
            if (response.status === 200) {
                setFilterOptions(response.data);
            }
        }
        catch {
        }
    }, []);
    const fetchSuppliers = useCallback(async () => {
        try {
            const response = await API.get('/api/rrp-records/suppliers/list');
            if (response.status === 200) {
                setSuppliers(response.data.suppliers);
            }
        }
        catch {
        }
    }, []);
    useEffect(() => {
        if (canAccess) {
            fetchFilterOptions();
            fetchSuppliers();
        }
    }, [canAccess, fetchFilterOptions, fetchSuppliers]);
    useEffect(() => {
        if (canAccess) {
            fetchData();
        }
    }, [canAccess, page, universal, equipmentNumber, partNumber, status, createdBy, fetchData]);
    const resetForm = () => {
        setFormData({
            rrp_number: '',
            supplier_name: '',
            date: '',
            currency: 'NPR',
            forex_rate: 1,
            item_price: 0,
            customs_charge: 0,
            customs_date: '',
            customs_number: '',
            freight_charge: 0,
            customs_service_charge: 0,
            vat_percentage: 0,
            invoice_number: '',
            invoice_date: '',
            po_number: '',
            total_amount: 0,
            airway_bill_number: '',
            inspection_details: '',
            reference_doc: '',
            approval_status: 'PENDING',
            created_by: user?.UserInfo?.username || ''
        });
        setFormErrors({});
        setSupplierSearchTerm('');
    };
    const validateDates = (rrpDate: string, invoiceDate: string): Record<string, string> => {
        const errors: Record<string, string> = {};
        if (rrpDate && invoiceDate) {
            const rrp = new Date(rrpDate);
            const invoice = new Date(invoiceDate);
            if (rrp > invoice) {
                errors.date = 'RRP date cannot be greater than invoice date';
            }
        }
        return errors;
    };
    const validateForm = (): boolean => {
        const errors: Record<string, string> = {};
        if (!formData.rrp_number.trim())
            errors.rrp_number = 'RRP number is required';
        if (!formData.supplier_name.trim())
            errors.supplier_name = 'Supplier name is required';
        if (!formData.date)
            errors.date = 'Date is required';
        if (!formData.invoice_number.trim())
            errors.invoice_number = 'Invoice number is required';
        if (!formData.invoice_date)
            errors.invoice_date = 'Invoice date is required';
        if (formData.item_price <= 0)
            errors.item_price = 'Item price must be greater than 0';
        if (!formData.created_by.trim())
            errors.created_by = 'Created by is required';
        const dateErrors = validateDates(formData.date, formData.invoice_date);
        Object.assign(errors, dateErrors);
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };
    const handleCreate = async () => {
        if (!validateForm())
            return;
        try {
            setSubmitting(true);
            const response = await API.post('/api/rrp-records', formData);
            if (response.status === 201) {
                showSuccessToast({
                    title: 'Success',
                    message: "RRP record created successfully",
                    duration: 3000,
                });
                setShowCreateModal(false);
                resetForm();
                fetchData();
            }
        }
        catch (error: unknown) {
            const errorResponse = error as {
                response?: {
                    data?: {
                        message?: string;
                        error?: string;
                    };
                };
            };
            const errorMessage = errorResponse?.response?.data?.message || errorResponse?.response?.data?.error || 'Failed to create RRP record';
            showErrorToast({
                title: 'Error',
                message: errorMessage,
                duration: 3000,
            });
        }
        finally {
            setSubmitting(false);
        }
    };
    const handleUpdate = async () => {
        if (!validateForm() || !editingRecord)
            return;
        try {
            setSubmitting(true);
            const response = await API.put(`/api/rrp-records/${editingRecord.id}`, formData);
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: "RRP record updated successfully",
                    duration: 3000,
                });
                setShowEditModal(false);
                setEditingRecord(null);
                resetForm();
                fetchData();
            }
        }
        catch (error: unknown) {
            const errorResponse = error as {
                response?: {
                    data?: {
                        message?: string;
                        error?: string;
                    };
                };
            };
            const errorMessage = errorResponse?.response?.data?.message || errorResponse?.response?.data?.error || 'Failed to update RRP record';
            showErrorToast({
                title: 'Error',
                message: errorMessage,
                duration: 3000,
            });
        }
        finally {
            setSubmitting(false);
        }
    };
    const handleDelete = async () => {
        if (!deletingRecord)
            return;
        try {
            setSubmitting(true);
            const response = await API.delete(`/api/rrp-records/${deletingRecord.id}`);
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: "RRP record deleted successfully",
                    duration: 3000,
                });
                setShowDeleteModal(false);
                setDeletingRecord(null);
                fetchData();
            }
        }
        catch (error: unknown) {
            const errorResponse = error as {
                response?: {
                    data?: {
                        message?: string;
                        error?: string;
                    };
                };
            };
            const errorMessage = errorResponse?.response?.data?.message || errorResponse?.response?.data?.error || 'Failed to delete RRP record';
            showErrorToast({
                title: 'Error',
                message: errorMessage,
                duration: 5000,
            });
        }
        finally {
            setSubmitting(false);
        }
    };
    const openDeleteModal = (record: RRPRecord) => {
        setDeletingRecord(record);
        setShowDeleteModal(true);
    };
    const openStatusModal = (record: RRPRecord) => {
        setStatusEditingRecord(record);
        setNewStatus(record.approval_status);
        setShowStatusModal(true);
    };
    const updateStatus = async () => {
        if (!statusEditingRecord || !newStatus)
            return;
        try {
            const response = await API.patch(`/api/rrp-records/${statusEditingRecord.id}/status`, {
                status: newStatus
            });
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: `Status updated successfully for ${response.data.affectedRows} records with RRP number ${response.data.rrpNumber}`,
                    duration: 3000,
                });
                fetchData();
                setShowStatusModal(false);
                setStatusEditingRecord(null);
                setNewStatus('');
            }
        }
        catch (error: unknown) {
            let message = 'Failed to update status';
            interface AxiosLikeError {
                response?: {
                    data?: {
                        message?: string;
                    };
                };
            }
            const maybeAxios = error as AxiosLikeError;
            const potentialMessage = maybeAxios?.response?.data?.message;
            if (typeof potentialMessage === 'string') {
                message = potentialMessage;
            }
            else if (error instanceof Error && error.message) {
                message = error.message;
            }
            showErrorToast({
                title: 'Error',
                message,
                duration: 3000,
            });
        }
    };
    const openCreateModal = () => {
        resetForm();
        setShowCreateModal(true);
    };
    const getRRPType = (rrpNumber: string): 'local' | 'foreign' => {
        const firstChar = rrpNumber.charAt(0).toUpperCase();
        return firstChar === 'L' ? 'local' : 'foreign';
    };
    const getAvailableSuppliers = useCallback((): string[] => {
        if (!formData.rrp_number) {
            return [...(suppliers.local || []), ...(suppliers.foreign || [])];
        }
        const rrpType = getRRPType(formData.rrp_number);
        return rrpType === 'local' ? (suppliers.local || []) : (suppliers.foreign || []);
    }, [formData.rrp_number, suppliers]);
    const filteredSuppliers = getAvailableSuppliers().filter(supplier => supplier.toLowerCase().includes(supplierSearchTerm.toLowerCase()));
    const handleSupplierSelect = (supplier: string) => {
        setFormData({ ...formData, supplier_name: supplier });
        setSupplierSearchTerm(supplier);
        setShowSupplierDropdown(false);
    };
    const handleSupplierInputChange = (value: string) => {
        setSupplierSearchTerm(value);
        setFormData({ ...formData, supplier_name: value });
        setShowSupplierDropdown(true);
    };
    useEffect(() => {
        if (formData.rrp_number && supplierSearchTerm) {
            const availableSuppliers = getAvailableSuppliers();
            if (!availableSuppliers.includes(supplierSearchTerm)) {
                setSupplierSearchTerm('');
                setFormData((prev) => ({ ...prev, supplier_name: '' }));
            }
        }
    }, [formData.rrp_number, supplierSearchTerm, suppliers, getAvailableSuppliers]);
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (showSupplierDropdown) {
                const target = event.target as Element;
                if (!target.closest('.supplier-dropdown')) {
                    setShowSupplierDropdown(false);
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showSupplierDropdown]);
    if (!canAccess)
        return null;
    return (<div className="container mx-auto p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
          RRP Records
        </h1>
          {canCreate && (<button onClick={openCreateModal} className="bg-[#003594] text-white px-4 py-2 rounded-md hover:bg-[#002a6e] transition-colors flex items-center gap-2">
              <Plus className="w-4 h-4"/>
              Add RRP
            </button>)}
        </div>

        
        <div className="bg-white p-4 rounded-lg shadow-sm border border-[#002a6e]/10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input value={universal} onChange={(e) => { setPage(1); setUniversal(e.target.value); }} placeholder="Search by RRP#, Request#, Item Name, Part..." className="border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none"/>
            <input value={equipmentNumber} onChange={(e) => { setPage(1); setEquipmentNumber(e.target.value); }} placeholder="Equipment Number" className="border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none"/>
            <input value={partNumber} onChange={(e) => { setPage(1); setPartNumber(e.target.value); }} placeholder="Part Number" className="border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none"/>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} className="border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none">
              <option value="all">All statuses</option>
              {filterOptions.statuses.map((statusOption) => (<option key={statusOption} value={statusOption}>
                  {statusOption}
                </option>))}
            </select>
            <select value={createdBy} onChange={(e) => { setPage(1); setCreatedBy(e.target.value); }} className="border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none">
              <option value="all">All users</option>
              {filterOptions.createdBy.map((user) => (<option key={user} value={user}>
                  {user}
                </option>))}
            </select>
          </div>
        </div>

        
        <div className="bg-white p-4 rounded-lg shadow-sm border border-[#002a6e]/10 overflow-x-auto">
          {loading ? (<div className="text-sm text-gray-600">Loading...</div>) : error ? (<div className="text-sm text-red-600">{error}</div>) : records.length === 0 ? (<div className="text-sm text-gray-600">No records found.</div>) : (<table className="w-full text-sm">
              <thead>
                <tr className="bg-[#003594]/5">
                  <th className="text-left p-3">RRP #</th>
                  <th className="text-left p-3">Request #</th>
                  <th className="text-left p-3">Receive #</th>
                  <th className="text-left p-3">Item Name</th>
                  <th className="text-left p-3">Part Number</th>
                  <th className="text-left p-3">Supplier</th>
                  <th className="text-left p-3">Amount</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Created By</th>
                  <th className="text-left p-3">Date</th>
                  {(canEdit || canDelete) && (<th className="text-left p-3">Actions</th>)}
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (<tr key={record.id} className="border-t border-[#002a6e]/10 hover:bg-[#003594]/5">
                    <td className="p-3 font-semibold text-gray-900">{record.rrp_number}</td>
                    <td className="p-3 font-semibold text-blue-600">{record.request_number}</td>
                    <td className="p-3 font-semibold text-green-600">{record.receive_number}</td>
                    <td className="p-3">{record.item_name}</td>
                    <td className="p-3 font-mono">{record.part_number}</td>
                    <td className="p-3">{record.supplier_name}</td>
                    <td className="p-3 font-semibold">{record.currency} {record.total_amount.toLocaleString()}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${record.approval_status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                    record.approval_status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'}`}>
                        {record.approval_status}
                      </span>
                    </td>
                    <td className="p-3">{record.created_by}</td>
                    <td className="p-3">{new Date(record.date).toLocaleDateString()}</td>
                    {(canEdit || canDelete) && (<td className="p-3">
                        <div className="flex gap-2">
                          {canEdit && (<button onClick={() => openStatusModal(record)} className="inline-flex items-center px-2 py-1 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700 transition-colors">
                              <Edit className="w-3 h-3 mr-1"/>
                              Update Status
                            </button>)}
                          {canDelete && (<button onClick={() => openDeleteModal(record)} className="inline-flex items-center px-2 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 transition-colors">
                              <Trash2 className="w-3 h-3 mr-1"/>
                              Delete
                            </button>)}
                        </div>
                      </td>)}
                  </tr>))}
              </tbody>
            </table>)}
        </div>

        
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-600">
            Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} records
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1 rounded border border-[#002a6e]/20 hover:bg-[#003594]/5" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
              Previous
            </button>
            <div className="flex gap-1">
              {(() => {
            const pages = [];
            const startPage = Math.max(1, page - 2);
            const endPage = Math.min(totalPages, page + 2);
            for (let i = startPage; i <= endPage; i++) {
                pages.push(<button key={i} className={`px-3 py-1 rounded ${page === i
                        ? 'bg-[#003594] text-white'
                        : 'border border-[#002a6e]/20 hover:bg-[#003594]/5'}`} onClick={() => setPage(i)}>
                      {i}
                    </button>);
            }
            return pages;
        })()}
            </div>
            <button className="px-3 py-1 rounded border border-[#002a6e]/20 hover:bg-[#003594]/5" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              Next
            </button>
          </div>
        </div>

        
        {showCreateModal && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold">Add New RRP Record</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">RRP Number *</label>
                    <input type="text" value={formData.rrp_number} onChange={(e) => setFormData({ ...formData, rrp_number: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.rrp_number ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter RRP Number"/>
                    {formErrors.rrp_number && (<p className="text-red-500 text-xs mt-1">{formErrors.rrp_number}</p>)}
                  </div>
                  
                  <div className="relative">
                    <label className="block text-sm font-medium mb-1">Supplier Name *</label>
                    <input type="text" value={supplierSearchTerm} onChange={(e) => handleSupplierInputChange(e.target.value)} onFocus={() => setShowSupplierDropdown(true)} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.supplier_name ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Search or enter supplier name"/>
                    {showSupplierDropdown && filteredSuppliers.length > 0 && (<div className="supplier-dropdown absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                        {filteredSuppliers.map((supplier, index) => (<div key={index} className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm" onClick={() => handleSupplierSelect(supplier)}>
                            {supplier}
                          </div>))}
                      </div>)}
                    {formErrors.supplier_name && (<p className="text-red-500 text-xs mt-1">{formErrors.supplier_name}</p>)}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Date *</label>
                    <input type="date" value={formData.date} onChange={(e) => {
                const newDate = e.target.value;
                setFormData({ ...formData, date: newDate });
                const dateErrors = validateDates(newDate, formData.invoice_date);
                setFormErrors(prev => ({ ...prev, ...dateErrors }));
            }} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.date ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`}/>
                    {formErrors.date && (<p className="text-red-500 text-xs mt-1">{formErrors.date}</p>)}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Currency</label>
                    <select value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none">
                      <option value="NPR">NPR</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Forex Rate</label>
                    <input type="number" step="0.01" value={formData.forex_rate} onChange={(e) => setFormData({ ...formData, forex_rate: Number(e.target.value) || 1 })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none" placeholder="1.00"/>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Item Price *</label>
                    <input type="number" step="0.01" value={formData.item_price} onChange={(e) => setFormData({ ...formData, item_price: Number(e.target.value) || 0 })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.item_price ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="0.00"/>
                    {formErrors.item_price && (<p className="text-red-500 text-xs mt-1">{formErrors.item_price}</p>)}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Invoice Number *</label>
                    <input type="text" value={formData.invoice_number} onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.invoice_number ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Invoice Number"/>
                    {formErrors.invoice_number && (<p className="text-red-500 text-xs mt-1">{formErrors.invoice_number}</p>)}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Invoice Date *</label>
                    <input type="date" value={formData.invoice_date} onChange={(e) => {
                const newInvoiceDate = e.target.value;
                setFormData({ ...formData, invoice_date: newInvoiceDate });
                const dateErrors = validateDates(formData.date, newInvoiceDate);
                setFormErrors(prev => ({ ...prev, ...dateErrors }));
            }} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.invoice_date ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`}/>
                    {formErrors.invoice_date && (<p className="text-red-500 text-xs mt-1">{formErrors.invoice_date}</p>)}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Total Amount</label>
                    <input type="number" step="0.01" value={formData.total_amount} onChange={(e) => setFormData({ ...formData, total_amount: Number(e.target.value) || 0 })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none" placeholder="0.00"/>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Created By *</label>
                    <input type="text" value={formData.created_by} onChange={(e) => setFormData({ ...formData, created_by: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.created_by ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Created By"/>
                    {formErrors.created_by && (<p className="text-red-500 text-xs mt-1">{formErrors.created_by}</p>)}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Customs Charge</label>
                    <input type="number" step="0.01" value={formData.customs_charge} onChange={(e) => setFormData({ ...formData, customs_charge: Number(e.target.value) || 0 })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none" placeholder="0.00"/>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Customs Date</label>
                    <input type="date" value={formData.customs_date} onChange={(e) => setFormData({ ...formData, customs_date: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none"/>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Customs Number</label>
                    <input type="text" value={formData.customs_number} onChange={(e) => setFormData({ ...formData, customs_number: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none" placeholder="Enter Customs Number"/>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Freight Charge</label>
                    <input type="number" step="0.01" value={formData.freight_charge} onChange={(e) => setFormData({ ...formData, freight_charge: Number(e.target.value) || 0 })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none" placeholder="0.00"/>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Customs Service Charge</label>
                    <input type="number" step="0.01" value={formData.customs_service_charge} onChange={(e) => setFormData({ ...formData, customs_service_charge: Number(e.target.value) || 0 })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none" placeholder="0.00"/>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">VAT Percentage</label>
                    <input type="number" step="0.01" value={formData.vat_percentage} onChange={(e) => setFormData({ ...formData, vat_percentage: Number(e.target.value) || 0 })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none" placeholder="0.00"/>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">PO Number</label>
                    <input type="text" value={formData.po_number} onChange={(e) => setFormData({ ...formData, po_number: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none" placeholder="Enter PO Number"/>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Airway Bill Number</label>
                    <input type="text" value={formData.airway_bill_number} onChange={(e) => setFormData({ ...formData, airway_bill_number: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none" placeholder="Enter Airway Bill Number"/>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Inspection Details</label>
                    <textarea value={formData.inspection_details} onChange={(e) => setFormData({ ...formData, inspection_details: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none" placeholder="Enter Inspection Details" rows={3}/>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Reference Document</label>
                    <input type="text" value={formData.reference_doc} onChange={(e) => setFormData({ ...formData, reference_doc: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none" placeholder="Enter Reference Document"/>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Approval Status</label>
                    <select value={formData.approval_status} onChange={(e) => setFormData({ ...formData, approval_status: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none">
                      <option value="PENDING">PENDING</option>
                      <option value="APPROVED">APPROVED</option>
                      <option value="REJECTED">REJECTED</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <div className="p-6 border-t border-gray-200">
                <div className="flex gap-3">
                  <button onClick={() => setShowCreateModal(false)} className="flex-1 px-4 py-2 border border-[#002a6e]/20 rounded-md hover:bg-[#003594]/5" disabled={submitting}>
                    Cancel
                  </button>
                  <button onClick={handleCreate} disabled={submitting} className="flex-1 bg-[#003594] text-white px-4 py-2 rounded-md hover:bg-[#002a6e] transition-colors disabled:opacity-50">
                    {submitting ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          </div>)}

        
        {showEditModal && editingRecord && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold">Edit RRP Record</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">RRP Number *</label>
                    <input type="text" value={formData.rrp_number} onChange={(e) => setFormData({ ...formData, rrp_number: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.rrp_number ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter RRP Number"/>
                    {formErrors.rrp_number && (<p className="text-red-500 text-xs mt-1">{formErrors.rrp_number}</p>)}
                  </div>
                  
                  <div className="relative">
                    <label className="block text-sm font-medium mb-1">Supplier Name *</label>
                    <input type="text" value={supplierSearchTerm} onChange={(e) => handleSupplierInputChange(e.target.value)} onFocus={() => setShowSupplierDropdown(true)} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.supplier_name ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Search or enter supplier name"/>
                    {showSupplierDropdown && filteredSuppliers.length > 0 && (<div className="supplier-dropdown absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                        {filteredSuppliers.map((supplier, index) => (<div key={index} className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm" onClick={() => handleSupplierSelect(supplier)}>
                            {supplier}
                          </div>))}
                      </div>)}
                    {formErrors.supplier_name && (<p className="text-red-500 text-xs mt-1">{formErrors.supplier_name}</p>)}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Date *</label>
                    <input type="date" value={formData.date} onChange={(e) => {
                const newDate = e.target.value;
                setFormData({ ...formData, date: newDate });
                const dateErrors = validateDates(newDate, formData.invoice_date);
                setFormErrors(prev => ({ ...prev, ...dateErrors }));
            }} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.date ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`}/>
                    {formErrors.date && (<p className="text-red-500 text-xs mt-1">{formErrors.date}</p>)}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Currency</label>
                    <select value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none">
                      <option value="NPR">NPR</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Forex Rate</label>
                    <input type="number" step="0.01" value={formData.forex_rate} onChange={(e) => setFormData({ ...formData, forex_rate: Number(e.target.value) || 1 })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none" placeholder="1.00"/>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Item Price *</label>
                    <input type="number" step="0.01" value={formData.item_price} onChange={(e) => setFormData({ ...formData, item_price: Number(e.target.value) || 0 })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.item_price ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="0.00"/>
                    {formErrors.item_price && (<p className="text-red-500 text-xs mt-1">{formErrors.item_price}</p>)}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Invoice Number *</label>
                    <input type="text" value={formData.invoice_number} onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.invoice_number ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Invoice Number"/>
                    {formErrors.invoice_number && (<p className="text-red-500 text-xs mt-1">{formErrors.invoice_number}</p>)}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Invoice Date *</label>
                    <input type="date" value={formData.invoice_date} onChange={(e) => {
                const newInvoiceDate = e.target.value;
                setFormData({ ...formData, invoice_date: newInvoiceDate });
                const dateErrors = validateDates(formData.date, newInvoiceDate);
                setFormErrors(prev => ({ ...prev, ...dateErrors }));
            }} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.invoice_date ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`}/>
                    {formErrors.invoice_date && (<p className="text-red-500 text-xs mt-1">{formErrors.invoice_date}</p>)}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Total Amount</label>
                    <input type="number" step="0.01" value={formData.total_amount} onChange={(e) => setFormData({ ...formData, total_amount: Number(e.target.value) || 0 })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none" placeholder="0.00"/>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Created By *</label>
                    <input type="text" value={formData.created_by} onChange={(e) => setFormData({ ...formData, created_by: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.created_by ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Created By"/>
                    {formErrors.created_by && (<p className="text-red-500 text-xs mt-1">{formErrors.created_by}</p>)}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Customs Charge</label>
                    <input type="number" step="0.01" value={formData.customs_charge} onChange={(e) => setFormData({ ...formData, customs_charge: Number(e.target.value) || 0 })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none" placeholder="0.00"/>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Customs Date</label>
                    <input type="date" value={formData.customs_date} onChange={(e) => setFormData({ ...formData, customs_date: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none"/>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Customs Number</label>
                    <input type="text" value={formData.customs_number} onChange={(e) => setFormData({ ...formData, customs_number: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none" placeholder="Enter Customs Number"/>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Freight Charge</label>
                    <input type="number" step="0.01" value={formData.freight_charge} onChange={(e) => setFormData({ ...formData, freight_charge: Number(e.target.value) || 0 })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none" placeholder="0.00"/>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Customs Service Charge</label>
                    <input type="number" step="0.01" value={formData.customs_service_charge} onChange={(e) => setFormData({ ...formData, customs_service_charge: Number(e.target.value) || 0 })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none" placeholder="0.00"/>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">VAT Percentage</label>
                    <input type="number" step="0.01" value={formData.vat_percentage} onChange={(e) => setFormData({ ...formData, vat_percentage: Number(e.target.value) || 0 })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none" placeholder="0.00"/>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">PO Number</label>
                    <input type="text" value={formData.po_number} onChange={(e) => setFormData({ ...formData, po_number: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none" placeholder="Enter PO Number"/>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Airway Bill Number</label>
                    <input type="text" value={formData.airway_bill_number} onChange={(e) => setFormData({ ...formData, airway_bill_number: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none" placeholder="Enter Airway Bill Number"/>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Inspection Details</label>
                    <textarea value={formData.inspection_details} onChange={(e) => setFormData({ ...formData, inspection_details: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none" placeholder="Enter Inspection Details" rows={3}/>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Reference Document</label>
                    <input type="text" value={formData.reference_doc} onChange={(e) => setFormData({ ...formData, reference_doc: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none" placeholder="Enter Reference Document"/>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Approval Status</label>
                    <select value={formData.approval_status} onChange={(e) => setFormData({ ...formData, approval_status: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none">
                      <option value="PENDING">PENDING</option>
                      <option value="APPROVED">APPROVED</option>
                      <option value="REJECTED">REJECTED</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <div className="p-6 border-t border-gray-200">
                <div className="flex gap-3">
                  <button onClick={() => { setShowEditModal(false); setEditingRecord(null); }} className="flex-1 px-4 py-2 border border-[#002a6e]/20 rounded-md hover:bg-[#003594]/5" disabled={submitting}>
                    Cancel
                  </button>
                  <button onClick={handleUpdate} disabled={submitting} className="flex-1 bg-[#003594] text-white px-4 py-2 rounded-md hover:bg-[#002a6e] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    {submitting && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                    {submitting ? 'Updating...' : 'Update'}
                  </button>
                </div>
        </div>
            </div>
          </div>)}

        
        {showStatusModal && statusEditingRecord && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
              <div className="flex items-center mb-4">
                <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
                  <Edit className="h-6 w-6 text-green-600"/>
                </div>
              </div>
              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Update Status
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  This will update the status for <strong>all records</strong> with RRP number: <strong>{statusEditingRecord.rrp_number}</strong>
                </p>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    New Status
                  </label>
                  <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500">
                    <option value="PENDING">PENDING</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="REJECTED">REJECTED</option>
                  </select>
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button onClick={() => {
                setShowStatusModal(false);
                setStatusEditingRecord(null);
                setNewStatus('');
            }} className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button onClick={updateStatus} className="flex-1 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors">
                  Update Status
                </button>
              </div>
            </div>
          </div>)}

        
        {showDeleteModal && deletingRecord && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
              <div className="flex items-center mb-4">
                <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                  <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/>
                  </svg>
                </div>
              </div>
              
              <div className="text-center mb-6">
                <h3 className="text-lg font-medium text-gray-900 mb-2">Delete RRP Record</h3>
                <p className="text-sm text-gray-500">
                  Are you sure you want to delete RRP record <span className="font-semibold text-gray-900">{deletingRecord.rrp_number}</span> 
                  for item <span className="font-semibold text-gray-900">{deletingRecord.item_name}</span>?
                </p>
                <p className="text-xs text-red-600 mt-2">
                  This action cannot be undone and will permanently remove this record from the system.
                </p>
              </div>
              
              <div className="flex gap-3">
                <button onClick={() => { setShowDeleteModal(false); setDeletingRecord(null); }} className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors" disabled={submitting}>
                  Cancel
                </button>
                <button onClick={handleDelete} disabled={submitting} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50">
                  {submitting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>)}
      </div>
    </div>);
}
