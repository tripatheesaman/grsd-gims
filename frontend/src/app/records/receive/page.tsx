'use client';
import { useAuthContext } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { API } from '@/lib/api';
import { withBasePath } from '@/lib/urls';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Plus, Edit, Trash2 } from 'lucide-react';
interface ReceiveRecord {
    id: number;
    receive_number: string;
    receive_date: string;
    request_fk: number;
    request_number: string;
    receive_source?: string;
    tender_reference_number?: string;
    nac_code: string;
    part_number: string;
    item_name: string;
    received_quantity: number;
    requested_quantity: number;
    unit: string;
    approval_status: string;
    received_by: string;
    image_path: string | null;
    location: string | null;
    card_number: string | null;
    rejection_reason: string | null;
    rrp_fk: number | null;
    created_at: string;
    updated_at: string;
    prediction_summary?: {
        predicted_days: number;
        range_lower_days: number | null;
        range_upper_days: number | null;
        confidence: string | null;
        sample_size: number;
        calculated_at: string | null;
    } | null;
}
interface ReceiveRecordsResponse {
    data: ReceiveRecord[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
}
interface ReceiveFormData {
    receive_number: string;
    receive_date: string;
    request_fk: number;
    nac_code: string;
    part_number: string;
    item_name: string;
    received_quantity: number;
    requested_quantity: number;
    unit: string;
    approval_status: string;
    received_by: string;
    image_path: string;
    location: string;
    card_number: string;
}
interface FilterOptions {
    statuses: string[];
    receivedBy: string[];
}
export default function ReceiveRecordsPage() {
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
        if (!permissions.includes('can_access_receive_records')) {
            router.push('/unauthorized');
            return;
        }
    }, [user, permissions, router]);
    const canAccess = !!user && permissions.includes('can_access_receive_records');
    const canCreate = permissions.includes('can_create_receive_item');
    const canEdit = permissions.includes('can_edit_receive_item');
    const canDelete = permissions.includes('can_delete_receive_item');
    const [universal, setUniversal] = useState<string>('');
    const [equipmentNumber, setEquipmentNumber] = useState<string>('');
    const [partNumber, setPartNumber] = useState<string>('');
    const [status, setStatus] = useState<string>('all');
    const [receivedBy, setReceivedBy] = useState<string>('all');
    const [page, setPage] = useState<number>(1);
    const [pageSize] = useState<number>(20);
    const [records, setRecords] = useState<ReceiveRecord[]>([]);
    const [totalCount, setTotalCount] = useState<number>(0);
    const [totalPages, setTotalPages] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [filterOptions, setFilterOptions] = useState<FilterOptions>({ statuses: [], receivedBy: [] });
    const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
    const [showEditModal, setShowEditModal] = useState<boolean>(false);
    const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
    const [editingRecord, setEditingRecord] = useState<ReceiveRecord | null>(null);
    const [deletingRecord, setDeletingRecord] = useState<ReceiveRecord | null>(null);
    const [formData, setFormData] = useState<ReceiveFormData>({
        receive_number: '',
        receive_date: '',
        request_fk: 0,
        nac_code: '',
        part_number: '',
        item_name: '',
        received_quantity: 0,
        requested_quantity: 0,
        unit: '',
        approval_status: 'PENDING',
        received_by: '',
        image_path: '',
        location: '',
        card_number: ''
    });
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const fetchData = useCallback(async () => {
        const requestId = latestRequestRef.current + 1;
        latestRequestRef.current = requestId;
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
                ...(receivedBy && receivedBy !== 'all' && { receivedBy })
            });
            const response = await API.get(`/api/receive-records?${params}`);
            if (requestId !== latestRequestRef.current) {
                return;
            }
            if (response.status === 200) {
                const data: ReceiveRecordsResponse = response.data;
                setRecords(data.data);
                setTotalCount(data.totalCount);
                setTotalPages(data.totalPages);
            }
        }
        catch {
            if (requestId !== latestRequestRef.current) {
                return;
            }
            setError('Failed to fetch receive records');
            showErrorToastRef.current({
                title: "Error",
                message: "Failed to fetch receive records",
                duration: 3000,
            });
        }
        finally {
            if (requestId === latestRequestRef.current) {
                setLoading(false);
            }
        }
    }, [page, pageSize, universal, equipmentNumber, partNumber, status, receivedBy]);
    const fetchFilterOptions = useCallback(async () => {
        try {
            const response = await API.get('/api/receive-records/filters/options');
            if (response.status === 200) {
                setFilterOptions(response.data);
            }
        }
        catch {
        }
    }, []);
    useEffect(() => {
        if (canAccess) {
            fetchFilterOptions();
        }
    }, [canAccess, fetchFilterOptions]);
    useEffect(() => {
        if (canAccess) {
            fetchData();
        }
    }, [canAccess, page, universal, equipmentNumber, partNumber, status, receivedBy, fetchData]);
    const resetForm = () => {
        setFormData({
            receive_number: '',
            receive_date: '',
            request_fk: 0,
            nac_code: '',
            part_number: '',
            item_name: '',
            received_quantity: 0,
            requested_quantity: 0,
            unit: '',
            approval_status: 'PENDING',
            received_by: user?.UserInfo?.username || '',
            image_path: '',
            location: '',
            card_number: ''
        });
        setFormErrors({});
        setSelectedImage(null);
        setImagePreview(null);
    };
    const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setSelectedImage(file);
            const reader = new FileReader();
            reader.onload = (e) => {
                setImagePreview(e.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };
    const removeImage = () => {
        setSelectedImage(null);
        setImagePreview(null);
        setFormData({ ...formData, image_path: '' });
    };
    const validateForm = (): boolean => {
        const errors: Record<string, string> = {};
        if (!formData.nac_code.trim())
            errors.nac_code = 'NAC code is required';
        if (!formData.receive_date)
            errors.receive_date = 'Receive date is required';
        if (!formData.part_number.trim())
            errors.part_number = 'Part number is required';
        if (!formData.item_name.trim())
            errors.item_name = 'Item name is required';
        if (!formData.unit.trim())
            errors.unit = 'Unit is required';
        if (formData.received_quantity <= 0)
            errors.received_quantity = 'Received quantity must be greater than 0';
        const requiresRequestId = !!(editingRecord && editingRecord.request_fk > 0);
        if (requiresRequestId && formData.request_fk <= 0) {
            errors.request_fk = 'Request ID is required';
        }
        if (!formData.received_by.trim())
            errors.received_by = 'Received by is required';
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };
    const handleCreate = async () => {
        if (!validateForm())
            return;
        try {
            setSubmitting(true);
            let imagePath = formData.image_path;
            if (selectedImage) {
                const uploadFormData = new FormData();
                uploadFormData.append('file', selectedImage);
                uploadFormData.append('folder', 'receive');
                const uploadResponse = await fetch(withBasePath('/api/upload'), {
                    method: 'POST',
                    body: uploadFormData,
                });
                if (!uploadResponse.ok) {
                    const errorData = await uploadResponse.json();
                    throw new Error(errorData.error || 'Failed to upload image');
                }
                const uploadResult = await uploadResponse.json();
                imagePath = uploadResult.path;
            }
            const response = await API.post('/api/receive-records', {
                ...formData,
                image_path: imagePath
            });
            if (response.status === 201) {
                showSuccessToast({
                    title: 'Success',
                    message: "Receive record created successfully",
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
            const errorMessage = errorResponse?.response?.data?.message || errorResponse?.response?.data?.error || 'Failed to create receive record';
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
        if (!validateForm() || !editingRecord) {
            return;
        }
        try {
            setSubmitting(true);
            let imagePath = formData.image_path;
            if (selectedImage) {
                const uploadFormData = new FormData();
                uploadFormData.append('file', selectedImage);
                uploadFormData.append('folder', 'receive');
                const uploadResponse = await fetch(withBasePath('/api/upload'), {
                    method: 'POST',
                    body: uploadFormData,
                });
                if (!uploadResponse.ok) {
                    const errorData = await uploadResponse.json();
                    throw new Error(errorData.error || 'Failed to upload image');
                }
                const uploadResult = await uploadResponse.json();
                imagePath = uploadResult.path;
            }
            const response = await API.put(`/api/receive-records/${editingRecord.id}`, {
                ...formData,
                image_path: imagePath
            });
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: "Receive record updated successfully",
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
            const errorMessage = errorResponse?.response?.data?.message || errorResponse?.response?.data?.error || 'Failed to update receive record';
            if (errorResponse?.response?.data?.message?.includes('Received quantity cannot be more than the requested quantity')) {
                setFormErrors({ received_quantity: 'Received quantity cannot be more than the requested quantity' });
            }
            else if (errorResponse?.response?.data?.message?.includes('This would result in negative stock balance')) {
                setFormErrors({ received_quantity: errorResponse.response.data.message });
            }
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
            const response = await API.delete(`/api/receive-records/${deletingRecord.id}`);
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: "Receive record deleted successfully",
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
            const errorMessage = errorResponse?.response?.data?.message || errorResponse?.response?.data?.error || 'Failed to delete receive record';
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
    const openEditModal = (record: ReceiveRecord) => {
        setEditingRecord(record);
        const formDataToSet = {
            receive_number: record.receive_number,
            receive_date: record.receive_date.split('T')[0],
            request_fk: record.request_fk,
            nac_code: record.nac_code,
            part_number: record.part_number,
            item_name: record.item_name,
            received_quantity: record.received_quantity,
            requested_quantity: record.requested_quantity,
            unit: record.unit,
            approval_status: record.approval_status,
            received_by: record.received_by,
            image_path: record.image_path || '',
            location: record.location || '',
            card_number: record.card_number || ''
        };
        setFormData(formDataToSet);
        setSelectedImage(null);
        setImagePreview(record.image_path || null);
        setShowEditModal(true);
        setError(null);
    };
    const openDeleteModal = (record: ReceiveRecord) => {
        setDeletingRecord(record);
        setShowDeleteModal(true);
    };
    const openCreateModal = () => {
        resetForm();
        setShowCreateModal(true);
    };
    if (!canAccess)
        return null;
    return (<div className="container mx-auto p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
          Receive Records
        </h1>
          {canCreate && (<button onClick={openCreateModal} className="bg-[#003594] text-white px-4 py-2 rounded-md hover:bg-[#002a6e] transition-colors flex items-center gap-2">
              <Plus className="w-4 h-4"/>
              Add Receive
            </button>)}
        </div>

        
        <div className="bg-white p-4 rounded-lg shadow-sm border border-[#002a6e]/10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input value={universal} onChange={(e) => { setPage(1); setUniversal(e.target.value); }} placeholder="Search by Receive#, Request#, NAC, Name, Part..." className="border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none"/>
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
            <select value={receivedBy} onChange={(e) => { setPage(1); setReceivedBy(e.target.value); }} className="border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none">
              <option value="all">All users</option>
              {filterOptions.receivedBy.map((user) => (<option key={user} value={user}>
                  {user}
                </option>))}
            </select>
          </div>
        </div>


        
        <div className="bg-white p-4 rounded-lg shadow-sm border border-[#002a6e]/10 overflow-x-auto">
          {loading ? (<div className="text-sm text-gray-600">Loading...</div>) : error ? (<div className="text-sm text-red-600">{error}</div>) : records.length === 0 ? (<div className="text-sm text-gray-600">No records found.</div>) : (<table className="w-full text-sm">
              <thead>
                <tr className="bg-[#003594]/5">
                  <th className="text-left p-3">Receive #</th>
                  <th className="text-left p-3">Request #</th>
                  <th className="text-left p-3">NAC Code</th>
                  <th className="text-left p-3">Lead Time (Predicted)</th>
                  <th className="text-left p-3">Item Name</th>
                  <th className="text-left p-3">Part Number</th>
                  <th className="text-left p-3">Quantity</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Received By</th>
                  <th className="text-left p-3">Date</th>
                  {(canEdit || canDelete) && (<th className="text-left p-3">Actions</th>)}
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (<tr key={record.id} className="border-t border-[#002a6e]/10 hover:bg-[#003594]/5">
                    <td className="p-3 font-semibold text-gray-900">{record.receive_number}</td>
                    <td className="p-3 font-semibold text-blue-600">{record.request_number}</td>
                    <td className="p-3 font-mono">{record.nac_code}</td>
                    <td className="p-3">
                      {record.prediction_summary ? (<div className="flex flex-col gap-1 text-xs text-gray-600">
                          <span className="text-sm font-semibold text-gray-900">
                            ~{Math.round(record.prediction_summary.predicted_days)} days
                          </span>
                          {record.prediction_summary.range_lower_days !== null && record.prediction_summary.range_upper_days !== null ? (<span>
                              Range {Math.round(record.prediction_summary.range_lower_days)}–
                              {Math.round(record.prediction_summary.range_upper_days)} days
                            </span>) : (<span className="italic text-gray-400">Limited history</span>)}
                          <span className="text-[11px] uppercase tracking-wide text-[#003594]">
                            {record.prediction_summary.confidence ?? 'N/A'} confidence • {record.prediction_summary.sample_size} samples
                          </span>
                        </div>) : (<span className="text-xs text-gray-400 italic">No prediction yet</span>)}
                    </td>
                    <td className="p-3">{record.item_name}</td>
                    <td className="p-3 font-mono">{record.part_number}</td>
                    <td className="p-3">{record.received_quantity}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${record.approval_status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                    record.approval_status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'}`}>
                        {record.approval_status}
                      </span>
                    </td>
                    <td className="p-3">{record.received_by}</td>
                    <td className="p-3">{new Date(record.receive_date).toLocaleDateString()}</td>
                    {(canEdit || canDelete) && (<td className="p-3">
                        <div className="flex gap-2">
                          {canEdit && (<button onClick={() => openEditModal(record)} className="inline-flex items-center px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors">
                              <Edit className="w-3 h-3 mr-1"/>
                              Edit
                            </button>)}
                          {canDelete && (!record.rrp_fk || record.rrp_fk === 0) && (<button onClick={() => openDeleteModal(record)} className="inline-flex items-center px-2 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 transition-colors">
                              <Trash2 className="w-3 h-3 mr-1"/>
                              Delete
                            </button>)}
                          {canDelete && record.rrp_fk && record.rrp_fk > 0 && (<span className="inline-flex items-center px-2 py-1 text-xs font-medium text-gray-500 bg-gray-100 rounded">
                              <span className="w-3 h-3 mr-1">×</span>
                              Cannot Delete
                            </span>)}
                        </div>
                      </td>)}
                  </tr>))}
              </tbody>
            </table>)}
        </div>

        
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-600">
            Showing {totalCount > 0 ? ((page - 1) * pageSize) + 1 : 0} to {totalCount > 0 ? Math.min(page * pageSize, totalCount) : 0} of {totalCount} records
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
            <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] flex flex-col">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold">Add New Receive Record</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-3">
                
              
              <div>
                <label className="block text-sm font-medium mb-1">NAC Code *</label>
                <input type="text" value={formData.nac_code} onChange={(e) => setFormData({ ...formData, nac_code: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.nac_code ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter NAC Code"/>
                {formErrors.nac_code && (<p className="text-red-500 text-xs mt-1">{formErrors.nac_code}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Receive Date *</label>
                <input type="date" value={formData.receive_date} onChange={(e) => setFormData({ ...formData, receive_date: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.receive_date ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`}/>
                {formErrors.receive_date && (<p className="text-red-500 text-xs mt-1">{formErrors.receive_date}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Part Number *</label>
                <input type="text" value={formData.part_number} onChange={(e) => setFormData({ ...formData, part_number: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.part_number ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Part Number"/>
                {formErrors.part_number && (<p className="text-red-500 text-xs mt-1">{formErrors.part_number}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Item Name *</label>
                <input type="text" value={formData.item_name} onChange={(e) => setFormData({ ...formData, item_name: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.item_name ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Item Name"/>
                {formErrors.item_name && (<p className="text-red-500 text-xs mt-1">{formErrors.item_name}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Unit *</label>
                <input type="text" value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.unit ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Unit"/>
                {formErrors.unit && (<p className="text-red-500 text-xs mt-1">{formErrors.unit}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Received Quantity *</label>
                <input type="number" value={formData.received_quantity} onChange={(e) => setFormData({ ...formData, received_quantity: Number(e.target.value) || 0 })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.received_quantity ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Received Quantity" min="1"/>
                {formErrors.received_quantity && (<p className="text-red-500 text-xs mt-1">{formErrors.received_quantity}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Location *</label>
                <input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.location ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Location"/>
                {formErrors.location && (<p className="text-red-500 text-xs mt-1">{formErrors.location}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Received By *</label>
                <input type="text" value={formData.received_by} onChange={(e) => setFormData({ ...formData, received_by: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.received_by ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Requester Name"/>
                {formErrors.received_by && (<p className="text-red-500 text-xs mt-1">{formErrors.received_by}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Image</label>
                <div className="space-y-2">
                  <input type="file" accept="image/*" onChange={handleImageSelect} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none"/>
                  {imagePreview && (<div className="relative">
                      
                      <Image src={imagePreview} alt="Preview" width={400} height={128} className="w-full h-32 object-cover rounded-md border border-[#002a6e]/20"/>
                      <button type="button" onClick={removeImage} className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600">
                        <span className="w-4 h-4">×</span>
                      </button>
                    </div>)}
                </div>
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
          <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold">Edit Receive Record</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-3">
              
              {editingRecord.request_fk > 0 && (<div>
                <label className="block text-sm font-medium mb-1">Request ID *</label>
                <input type="number" value={formData.request_fk} onChange={(e) => setFormData({ ...formData, request_fk: parseInt(e.target.value) || 0 })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.request_fk ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Request ID"/>
                {formErrors.request_fk && (<p className="text-red-500 text-xs mt-1">{formErrors.request_fk}</p>)}
              </div>)}
              
              <div>
                <label className="block text-sm font-medium mb-1">NAC Code *</label>
                <input type="text" value={formData.nac_code} onChange={(e) => setFormData({ ...formData, nac_code: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.nac_code ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter NAC Code"/>
                {formErrors.nac_code && (<p className="text-red-500 text-xs mt-1">{formErrors.nac_code}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Receive Date *</label>
                <input type="date" value={formData.receive_date} onChange={(e) => setFormData({ ...formData, receive_date: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.receive_date ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`}/>
                {formErrors.receive_date && (<p className="text-red-500 text-xs mt-1">{formErrors.receive_date}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Part Number *</label>
                <input type="text" value={formData.part_number} onChange={(e) => setFormData({ ...formData, part_number: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.part_number ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Part Number"/>
                {formErrors.part_number && (<p className="text-red-500 text-xs mt-1">{formErrors.part_number}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Item Name *</label>
                <input type="text" value={formData.item_name} onChange={(e) => setFormData({ ...formData, item_name: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.item_name ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Item Name"/>
                {formErrors.item_name && (<p className="text-red-500 text-xs mt-1">{formErrors.item_name}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Unit *</label>
                <input type="text" value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.unit ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Unit"/>
                {formErrors.unit && (<p className="text-red-500 text-xs mt-1">{formErrors.unit}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Requested Quantity</label>
                <input type="number" value={formData.requested_quantity} disabled className="w-full border rounded-md px-3 py-2 text-sm bg-gray-100 border-[#002a6e]/20" placeholder="Requested Quantity"/>
                <p className="text-xs text-gray-500 mt-1">This is the original requested quantity from the request record</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Received Quantity *</label>
                <input type="number" value={formData.received_quantity} onChange={(e) => setFormData({ ...formData, received_quantity: Number(e.target.value) || 0 })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.received_quantity ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Received Quantity" min="1" max={formData.requested_quantity}/>
                {formErrors.received_quantity && (<p className="text-red-500 text-xs mt-1">{formErrors.received_quantity}</p>)}
                <p className="text-xs text-gray-500 mt-1">Cannot exceed the requested quantity ({formData.requested_quantity})</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Location *</label>
                <input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.location ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Location"/>
                {formErrors.location && (<p className="text-red-500 text-xs mt-1">{formErrors.location}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Received By *</label>
                <input type="text" value={formData.received_by} onChange={(e) => setFormData({ ...formData, received_by: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.received_by ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Requester Name"/>
                {formErrors.received_by && (<p className="text-red-500 text-xs mt-1">{formErrors.received_by}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Image</label>
                <div className="space-y-2">
                  <input type="file" accept="image/*" onChange={handleImageSelect} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none"/>
                  {imagePreview && (<div className="relative">
                      
                      <Image src={imagePreview} alt="Preview" width={400} height={128} className="w-full h-32 object-cover rounded-md border border-[#002a6e]/20"/>
                      <button type="button" onClick={removeImage} className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600">
                        <span className="w-4 h-4">×</span>
                      </button>
                    </div>)}
                  {formData.image_path && !imagePreview && (<div className="text-sm text-gray-600">
                      Current image: {formData.image_path}
                    </div>)}
                </div>
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
              <h3 className="text-lg font-medium text-gray-900 mb-2">Delete Receive Record</h3>
              <p className="text-sm text-gray-500">
                Are you sure you want to delete receive record <span className="font-semibold text-gray-900">{deletingRecord.receive_number}</span> 
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
