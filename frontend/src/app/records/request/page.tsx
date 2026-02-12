'use client';
import { useAuthContext } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { API } from '@/lib/api';
import { withBasePath } from '@/lib/urls';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Button } from '@/components/ui/button';
import { Plus, Edit, Trash2, RefreshCw, X, Search, Lock } from 'lucide-react';
interface RequestRecord {
    id: number;
    request_number: string;
    nac_code: string;
    request_date: string;
    part_number: string;
    item_name: string;
    unit: string;
    requested_quantity: number;
    current_balance: number;
    previous_rate: string;
    equipment_number: string;
    image_path: string | null;
    specifications: string | null;
    remarks: string | null;
    requested_by: string;
    approval_status: string;
    is_received: boolean;
    approved_by: string | null;
    rejected_by: string | null;
    rejection_reason: string | null;
    receive_fk: number | null;
    reference_doc: string | null;
    created_at: string;
    updated_at: string;
    total_approved?: number;
    total_pending_approved?: number;
    receive_status_label?: 'Not Received' | 'Partially Received' | 'Received';
    prediction_summary?: {
        predicted_days: number;
        range_lower_days: number | null;
        range_upper_days: number | null;
        confidence: string | null;
        sample_size: number;
        calculated_at: string | null;
    } | null;
}
interface RequestRecordsResponse {
    data: RequestRecord[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
}
interface RequestFormData {
    request_number: string;
    nac_code: string;
    request_date: string;
    part_number: string;
    item_name: string;
    unit: string;
    requested_quantity: number;
    current_balance: number;
    previous_rate: string;
    equipment_number: string;
    image_path: string;
    specifications: string;
    remarks: string;
    requested_by: string;
    approval_status: string;
    reference_doc: string;
}
interface FilterOptions {
    statuses: string[];
    requestedBy: string[];
}
export default function RequestRecordsPage() {
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
        if (!permissions.includes('can_access_request_records')) {
            router.push('/unauthorized');
            return;
        }
    }, [user, permissions, router]);
    const canAccess = !!user && permissions.includes('can_access_request_records');
    const canCreate = permissions.includes('can_create_request_item');
    const canEdit = permissions.includes('can_edit_request_item');
    const canDelete = permissions.includes('can_delete_request_item');
    const canForceClose = permissions.includes('can_force_close_request');
    const [universal, setUniversal] = useState<string>('');
    const [equipmentNumber, setEquipmentNumber] = useState<string>('');
    const [partNumber, setPartNumber] = useState<string>('');
    const [status, setStatus] = useState<string>('all');
    const [requestedBy, setRequestedBy] = useState<string>('all');
    const [page, setPage] = useState<number>(1);
    const [pageSize] = useState<number>(20);
    const [records, setRecords] = useState<RequestRecord[]>([]);
    const [totalCount, setTotalCount] = useState<number>(0);
    const [totalPages, setTotalPages] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [filterOptions, setFilterOptions] = useState<FilterOptions>({ statuses: [], requestedBy: [] });
    const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
    const [showEditModal, setShowEditModal] = useState<boolean>(false);
    const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
    const [showCloseModal, setShowCloseModal] = useState<boolean>(false);
    const [editingRecord, setEditingRecord] = useState<RequestRecord | null>(null);
    const [deletingRecord, setDeletingRecord] = useState<RequestRecord | null>(null);
    const [closingRecord, setClosingRecord] = useState<RequestRecord | null>(null);
    const [formData, setFormData] = useState<RequestFormData>({
        request_number: '',
        nac_code: '',
        request_date: '',
        part_number: '',
        item_name: '',
        unit: '',
        requested_quantity: 0,
        current_balance: 0,
        previous_rate: '',
        equipment_number: '',
        image_path: '',
        specifications: '',
        remarks: '',
        requested_by: '',
        approval_status: 'PENDING',
        reference_doc: ''
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
                ...(requestedBy && requestedBy !== 'all' && { requestedBy })
            });
            const response = await API.get(`/api/request-records?${params}`);
            if (requestId !== latestRequestRef.current) {
                return;
            }
            if (response.status === 200) {
                const data: RequestRecordsResponse = response.data;
                setRecords(data.data);
                setTotalCount(data.totalCount);
                setTotalPages(data.totalPages);
            }
        }
        catch {
            if (requestId !== latestRequestRef.current) {
                return;
            }
            setError('Failed to fetch request records');
            showErrorToastRef.current({
                title: "Error",
                message: "Failed to fetch request records",
                duration: 3000,
            });
        }
        finally {
            if (requestId === latestRequestRef.current) {
                setLoading(false);
            }
        }
    }, [page, pageSize, universal, equipmentNumber, partNumber, status, requestedBy]);
    const fetchFilterOptions = useCallback(async () => {
        try {
            const response = await API.get('/api/request-records/filters/options');
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
    }, [canAccess, page, universal, equipmentNumber, partNumber, status, requestedBy, fetchData]);
    const resetForm = () => {
        setFormData({
            request_number: '',
            nac_code: '',
            request_date: '',
            part_number: '',
            item_name: '',
            unit: '',
            requested_quantity: 0,
            current_balance: 0,
            previous_rate: '',
            equipment_number: '',
            image_path: '',
            specifications: '',
            remarks: '',
            requested_by: user?.UserInfo?.username || '',
            approval_status: 'PENDING',
            reference_doc: ''
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
        if (!formData.request_number.trim())
            errors.request_number = 'Request number is required';
        if (!formData.nac_code.trim())
            errors.nac_code = 'NAC code is required';
        if (!formData.request_date)
            errors.request_date = 'Request date is required';
        if (!formData.part_number.trim())
            errors.part_number = 'Part number is required';
        if (!formData.item_name.trim())
            errors.item_name = 'Item name is required';
        if (!formData.unit.trim())
            errors.unit = 'Unit is required';
        if (formData.requested_quantity <= 0)
            errors.requested_quantity = 'Requested quantity must be greater than 0';
        if (!formData.equipment_number.trim())
            errors.equipment_number = 'Equipment number is required';
        if (!formData.requested_by.trim())
            errors.requested_by = 'Requested by is required';
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
                uploadFormData.append('folder', 'request');
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
            const response = await API.post('/api/request-records', {
                ...formData,
                image_path: imagePath
            });
            if (response.status === 201) {
                showSuccessToast({
                    title: 'Success',
                    message: "Request record created successfully",
                    duration: 3000,
                });
                setShowCreateModal(false);
                resetForm();
                fetchData();
            }
        }
        catch (error: unknown) {
            const errorMessage = (error as {
                response?: {
                    data?: {
                        message?: string;
                    };
                };
            })?.response?.data?.message || 'Failed to create request record';
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
                uploadFormData.append('folder', 'request');
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
            const response = await API.put(`/api/request-records/${editingRecord.id}`, {
                ...formData,
                image_path: imagePath
            });
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: "Request record updated successfully",
                    duration: 3000,
                });
                setShowEditModal(false);
                setEditingRecord(null);
                resetForm();
                fetchData();
            }
        }
        catch (error: unknown) {
            const errorMessage = (error as {
                response?: {
                    data?: {
                        message?: string;
                    };
                };
            })?.response?.data?.message || 'Failed to update request record';
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
            const response = await API.delete(`/api/request-records/${deletingRecord.id}`);
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: "Request record deleted successfully",
                    duration: 3000,
                });
                setShowDeleteModal(false);
                setDeletingRecord(null);
                fetchData();
            }
        }
        catch (error: unknown) {
            const errorMessage = (error as {
                response?: {
                    data?: {
                        message?: string;
                    };
                };
            })?.response?.data?.message || 'Failed to delete request record';
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
    const handleForceClose = async () => {
        if (!closingRecord)
            return;
        try {
            setSubmitting(true);
            const response = await API.put(`/api/request/${closingRecord.request_number}/force-close`, {
                closedBy: user?.UserInfo?.username
            });
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: "Request force closed successfully",
                    duration: 3000,
                });
                setShowCloseModal(false);
                setClosingRecord(null);
                fetchData();
            }
        }
        catch (error: unknown) {
            const errorMessage = (error as {
                response?: {
                    data?: {
                        message?: string;
                    };
                };
            })?.response?.data?.message || 'Failed to force close request';
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
    const openEditModal = (record: RequestRecord) => {
        setEditingRecord(record);
        const formDataToSet = {
            request_number: record.request_number,
            nac_code: record.nac_code,
            request_date: record.request_date.split('T')[0],
            part_number: record.part_number,
            item_name: record.item_name,
            unit: record.unit,
            requested_quantity: record.requested_quantity,
            current_balance: record.current_balance,
            previous_rate: record.previous_rate,
            equipment_number: record.equipment_number,
            image_path: record.image_path || '',
            specifications: record.specifications || '',
            remarks: record.remarks || '',
            requested_by: record.requested_by,
            approval_status: record.approval_status,
            reference_doc: record.reference_doc || ''
        };
        setFormData(formDataToSet);
        setSelectedImage(null);
        setImagePreview(record.image_path || null);
        setShowEditModal(true);
        setError(null);
    };
    const openDeleteModal = (record: RequestRecord) => {
        setDeletingRecord(record);
        setShowDeleteModal(true);
    };
    const openCloseModal = (record: RequestRecord) => {
        setClosingRecord(record);
        setShowCloseModal(true);
    };
    const openCreateModal = () => {
        resetForm();
        setShowCreateModal(true);
    };
    if (!canAccess)
        return null;
    return (<div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
    <div className="container mx-auto p-6">
      <div className="max-w-7xl mx-auto space-y-8">
          
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent mb-2">
          Request Records
        </h1>
                <p className="text-gray-600 text-lg">Manage and track all request records</p>
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={() => fetchData()} variant="outline" size="sm" disabled={loading} className="border-[#002a6e]/20 hover:bg-[#003594]/5 hover:border-[#003594] transition-all duration-200">
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`}/>
                  Refresh
                </Button>
                {canCreate && (<button onClick={openCreateModal} className="bg-gradient-to-r from-[#003594] to-[#002a6e] text-white px-6 py-3 rounded-lg hover:from-[#002a6e] hover:to-[#001a5c] transition-all duration-200 flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
                    <Plus className="w-5 h-5"/>
                    Add Request
                  </button>)}
              </div>
            </div>
          </div>

        
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Search className="w-5 h-5 text-[#003594]"/>
            Search & Filter
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Universal Search</label>
              <input value={universal} onChange={(e) => { setPage(1); setUniversal(e.target.value); }} placeholder="Search by Request#, NAC, Name, Part, Equipment..." className="w-full border rounded-lg px-4 py-3 text-sm border-gray-300 focus:border-[#003594] focus:ring-2 focus:ring-[#003594]/20 focus:outline-none transition-all duration-200"/>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Equipment Number</label>
              <input value={equipmentNumber} onChange={(e) => { setPage(1); setEquipmentNumber(e.target.value); }} placeholder="Enter equipment number..." className="w-full border rounded-lg px-4 py-3 text-sm border-gray-300 focus:border-[#003594] focus:ring-2 focus:ring-[#003594]/20 focus:outline-none transition-all duration-200"/>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Part Number</label>
              <input value={partNumber} onChange={(e) => { setPage(1); setPartNumber(e.target.value); }} placeholder="Enter part number..." className="w-full border rounded-lg px-4 py-3 text-sm border-gray-300 focus:border-[#003594] focus:ring-2 focus:ring-[#003594]/20 focus:outline-none transition-all duration-200"/>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Status</label>
              <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} className="w-full border rounded-lg px-4 py-3 text-sm border-gray-300 focus:border-[#003594] focus:ring-2 focus:ring-[#003594]/20 focus:outline-none transition-all duration-200">
                <option value="all">All statuses</option>
                {filterOptions.statuses.map((statusOption) => (<option key={statusOption} value={statusOption}>
                    {statusOption}
                  </option>))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Requested By</label>
              <select value={requestedBy} onChange={(e) => { setPage(1); setRequestedBy(e.target.value); }} className="w-full border rounded-lg px-4 py-3 text-sm border-gray-300 focus:border-[#003594] focus:ring-2 focus:ring-[#003594]/20 focus:outline-none transition-all duration-200">
                <option value="all">All users</option>
                {filterOptions.requestedBy.map((user) => (<option key={user} value={user}>
                    {user}
                  </option>))}
              </select>
            </div>
          </div>
        </div>


        
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          {loading ? (<div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003594] mx-auto mb-4"></div>
                <p className="text-gray-600">Loading records...</p>
              </div>
            </div>) : error ? (<div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="text-red-500 text-4xl mb-4">⚠️</div>
                <p className="text-red-600 text-lg">{error}</p>
              </div>
            </div>) : records.length === 0 ? (<div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="text-gray-400 text-4xl mb-4">📋</div>
                <p className="text-gray-600 text-lg">No records found</p>
                <p className="text-gray-500 text-sm mt-2">Try adjusting your search criteria</p>
              </div>
            </div>) : (<div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-[#003594] to-[#002a6e] text-white">
                  <tr>
                    <th className="text-left p-4 font-semibold">Request #</th>
                    <th className="text-left p-4 font-semibold">NAC Code</th>
                    <th className="text-left p-4 font-semibold">Lead Time (Predicted)</th>
                    <th className="text-left p-4 font-semibold">Item Name</th>
                    <th className="text-left p-4 font-semibold">Part Number</th>
                    <th className="text-left p-4 font-semibold">Quantity</th>
                    <th className="text-left p-4 font-semibold">Status</th>
                    <th className="text-left p-4 font-semibold">Requested By</th>
                    <th className="text-left p-4 font-semibold">Date</th>
                    {(canEdit || canDelete || canForceClose) && (<th className="text-left p-4 font-semibold">Actions</th>)}
                  </tr>
                </thead>
                <tbody>
                  {records.map((record, index) => (<tr key={record.id} className={`border-b border-gray-100 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-200 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="p-4">
                        <div className="font-semibold text-gray-900">{record.request_number}</div>
                      </td>
                      <td className="p-4">
                        <div className="text-gray-700 font-mono text-sm">{record.nac_code}</div>
                      </td>
                      <td className="p-4">
                        {record.prediction_summary ? (<div className="space-y-1 text-sm">
                            <div className="font-semibold text-gray-900">
                              ~{Math.round(record.prediction_summary.predicted_days)} days
                            </div>
                            {record.prediction_summary.range_lower_days !== null && record.prediction_summary.range_upper_days !== null ? (<div className="text-xs text-gray-500">
                                Range {Math.round(record.prediction_summary.range_lower_days)}–{Math.round(record.prediction_summary.range_upper_days)} days
                              </div>) : (<div className="text-xs text-gray-400 italic">Limited history</div>)}
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <span className="inline-flex items-center rounded-full bg-[#003594]/10 px-2 py-0.5 text-[#003594]">
                                {record.prediction_summary.confidence ?? 'N/A'} confidence
                              </span>
                              <span className="text-gray-400">
                                {record.prediction_summary.sample_size} samples
                              </span>
                            </div>
                          </div>) : (<div className="text-xs text-gray-400 italic">No prediction yet</div>)}
                      </td>
                      <td className="p-4">
                        <div className="text-gray-900 font-medium">{record.item_name}</div>
                      </td>
                      <td className="p-4">
                        <div className="text-gray-700 font-mono text-sm">{record.part_number}</div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">{record.requested_quantity}</span>
                          {(() => {
                    const label = record.receive_status_label || (record.is_received ? 'Received' : 'Not Received');
                    const style = label === 'Received'
                        ? 'bg-green-100 text-green-700 border border-green-200'
                        : label === 'Partially Received'
                            ? 'bg-amber-100 text-amber-700 border border-amber-200'
                            : 'bg-gray-100 text-gray-700 border border-gray-200';
                    return (<span className={`px-2 py-1 text-xs rounded-full font-medium ${style}`}>
                                {label}
                            </span>);
                })()}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${record.approval_status === 'APPROVED' ? 'bg-green-100 text-green-800 border border-green-200' :
                    record.approval_status === 'REJECTED' ? 'bg-red-100 text-red-800 border border-red-200' :
                        'bg-yellow-100 text-yellow-800 border border-yellow-200'}`}>
                          {record.approval_status}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="text-gray-700">{record.requested_by}</div>
                      </td>
                      <td className="p-4">
                        <div className="text-gray-600 text-sm">{new Date(record.request_date).toLocaleDateString()}</div>
                      </td>
                      {(canEdit || canDelete || canForceClose) && (<td className="p-4">
                          <div className="flex gap-2">
                            {canEdit && (<button onClick={() => openEditModal(record)} className="inline-flex items-center px-3 py-2 text-xs font-medium text-white bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-700 hover:border-blue-700 transition-all duration-200 shadow-sm hover:shadow-md">
                                <Edit className="w-3 h-3 mr-1"/>
                                Edit
                              </button>)}
                            {canDelete && !record.is_received && (!record.receive_fk || record.receive_fk === 0) && (<button onClick={() => openDeleteModal(record)} className="inline-flex items-center px-3 py-2 text-xs font-medium text-white bg-red-600 border border-red-600 rounded-lg hover:bg-red-700 hover:border-red-700 transition-all duration-200 shadow-sm hover:shadow-md">
                                <Trash2 className="w-3 h-3 mr-1"/>
                                Delete
                              </button>)}
                            {canDelete && (record.is_received || (record.receive_fk && record.receive_fk > 0)) && (<span className="inline-flex items-center px-3 py-2 text-xs font-medium text-gray-500 bg-gray-100 border border-gray-300 rounded-lg">
                                <X className="w-3 h-3 mr-1"/>
                                Cannot Delete
                              </span>)}
                            {canForceClose && (record.approval_status === 'PENDING' || record.approval_status === 'APPROVED') && (<button onClick={() => openCloseModal(record)} className="inline-flex items-center px-3 py-2 text-xs font-medium text-white bg-orange-600 border border-orange-600 rounded-lg hover:bg-orange-700 hover:border-orange-700 transition-all duration-200 shadow-sm hover:shadow-md">
                                <Lock className="w-3 h-3 mr-1"/>
                                Close
                              </button>)}
                            {canForceClose && (record.approval_status === 'REJECTED' || record.approval_status === 'CLOSED') && (<span className="inline-flex items-center px-3 py-2 text-xs font-medium text-gray-500 bg-gray-100 border border-gray-300 rounded-lg">
                                <X className="w-3 h-3 mr-1"/>
                                Already Closed
                              </span>)}
                          </div>
                        </td>)}
                    </tr>))}
                </tbody>
              </table>
            </div>)}
        </div>

        
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing <span className="font-semibold text-gray-900">{totalCount > 0 ? ((page - 1) * pageSize) + 1 : 0}</span> to <span className="font-semibold text-gray-900">{totalCount > 0 ? Math.min(page * pageSize, totalCount) : 0}</span> of <span className="font-semibold text-gray-900">{totalCount}</span> records
            </div>
            <div className="flex items-center gap-2">
              <button className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                Previous
              </button>
              <div className="flex items-center gap-1">
                {(() => {
            const windowSize = 5;
            const visible = Math.min(windowSize, Math.max(1, totalPages));
            const start = Math.max(1, Math.min(Math.max(1, totalPages - visible + 1), page - Math.floor(visible / 2)));
            const pages = Array.from({ length: visible }, (_, i) => start + i);
            return pages.map((p) => (<button key={`page-${p}`} className={`px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${page === p
                    ? 'bg-[#003594] text-white shadow-md'
                    : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 hover:border-gray-400'}`} onClick={() => setPage(p)}>
                      {p}
                    </button>));
        })()}
              </div>
              <button className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                Next
              </button>
            </div>
          </div>
        </div>

        
        {showCreateModal && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] flex flex-col">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold">Add New Request Record</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Request Number *</label>
                  <input type="text" value={formData.request_number} onChange={(e) => setFormData({ ...formData, request_number: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.request_number ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Request Number"/>
                  {formErrors.request_number && (<p className="text-red-500 text-xs mt-1">{formErrors.request_number}</p>)}
                </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">NAC Code *</label>
                <input type="text" value={formData.nac_code} onChange={(e) => setFormData({ ...formData, nac_code: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.nac_code ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter NAC Code"/>
                {formErrors.nac_code && (<p className="text-red-500 text-xs mt-1">{formErrors.nac_code}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Request Date *</label>
                <input type="date" value={formData.request_date} onChange={(e) => setFormData({ ...formData, request_date: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.request_date ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`}/>
                {formErrors.request_date && (<p className="text-red-500 text-xs mt-1">{formErrors.request_date}</p>)}
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
                <label className="block text-sm font-medium mb-1">Requested Quantity *</label>
                <input type="number" value={formData.requested_quantity} onChange={(e) => setFormData({ ...formData, requested_quantity: Number(e.target.value) || 0 })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.requested_quantity ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Requested Quantity" min="1"/>
                {formErrors.requested_quantity && (<p className="text-red-500 text-xs mt-1">{formErrors.requested_quantity}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Equipment Number *</label>
                <input type="text" value={formData.equipment_number} onChange={(e) => setFormData({ ...formData, equipment_number: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.equipment_number ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Equipment Number"/>
                {formErrors.equipment_number && (<p className="text-red-500 text-xs mt-1">{formErrors.equipment_number}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Requested By *</label>
                <input type="text" value={formData.requested_by} onChange={(e) => setFormData({ ...formData, requested_by: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.requested_by ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Requester Name"/>
                {formErrors.requested_by && (<p className="text-red-500 text-xs mt-1">{formErrors.requested_by}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Image</label>
                <div className="space-y-2">
                  <input type="file" accept="image/*" onChange={handleImageSelect} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none"/>
                  {imagePreview && (<div className="relative">
                      
                      <Image src={imagePreview} alt="Preview" width={400} height={128} className="w-full h-32 object-cover rounded-md border border-[#002a6e]/20"/>
                      <button type="button" onClick={removeImage} className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600">
                        <X className="w-4 h-4"/>
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
              <h2 className="text-xl font-bold">Edit Request Record</h2>
              {editingRecord.is_received && (<div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <p className="text-amber-800 text-sm font-medium">
                    ⚠️ This record has been received. The requested quantity cannot be less than the received quantity.
                  </p>
                </div>)}
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Request Number *</label>
                <input type="text" value={formData.request_number} onChange={(e) => setFormData({ ...formData, request_number: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.request_number ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Request Number"/>
                {formErrors.request_number && (<p className="text-red-500 text-xs mt-1">{formErrors.request_number}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">NAC Code *</label>
                <input type="text" value={formData.nac_code} onChange={(e) => setFormData({ ...formData, nac_code: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.nac_code ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter NAC Code"/>
                {formErrors.nac_code && (<p className="text-red-500 text-xs mt-1">{formErrors.nac_code}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Request Date *</label>
                <input type="date" value={formData.request_date} onChange={(e) => setFormData({ ...formData, request_date: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.request_date ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`}/>
                {formErrors.request_date && (<p className="text-red-500 text-xs mt-1">{formErrors.request_date}</p>)}
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
                <label className="block text-sm font-medium mb-1">Requested Quantity *</label>
                <input type="number" value={formData.requested_quantity} onChange={(e) => setFormData({ ...formData, requested_quantity: Number(e.target.value) || 0 })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.requested_quantity ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Requested Quantity" min="1"/>
                {formErrors.requested_quantity && (<p className="text-red-500 text-xs mt-1">{formErrors.requested_quantity}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Equipment Number *</label>
                <input type="text" value={formData.equipment_number} onChange={(e) => setFormData({ ...formData, equipment_number: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.equipment_number ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Equipment Number"/>
                {formErrors.equipment_number && (<p className="text-red-500 text-xs mt-1">{formErrors.equipment_number}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Requested By *</label>
                <input type="text" value={formData.requested_by} onChange={(e) => setFormData({ ...formData, requested_by: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.requested_by ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Requester Name"/>
                {formErrors.requested_by && (<p className="text-red-500 text-xs mt-1">{formErrors.requested_by}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Image</label>
                <div className="space-y-2">
                  <input type="file" accept="image/*" onChange={handleImageSelect} className="w-full border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none"/>
                  {imagePreview && (<div className="relative">
                      
                      <Image src={imagePreview} alt="Preview" width={400} height={128} className="w-full h-32 object-cover rounded-md border border-[#002a6e]/20"/>
                      <button type="button" onClick={removeImage} className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600">
                        <X className="w-4 h-4"/>
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
              <h3 className="text-lg font-medium text-gray-900 mb-2">Delete Request Record</h3>
              {deletingRecord.is_received && (<div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-red-800 text-sm font-medium">
                    ⚠️ This record has been received and cannot be deleted.
                  </p>
                </div>)}
              <p className="text-sm text-gray-500">
                Are you sure you want to delete request record <span className="font-semibold text-gray-900">{deletingRecord.request_number}</span> 
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
              <button onClick={handleDelete} disabled={submitting || deletingRecord.is_received} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50">
                {submitting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>)}

      
      {showCloseModal && closingRecord && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center mb-4">
              <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-orange-100">
                <Lock className="h-6 w-6 text-orange-600"/>
              </div>
            </div>
            
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Force Close Request
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Are you sure you want to force close request <strong>{closingRecord.request_number}</strong>? 
                This action will permanently close the request and prevent new requests from being made.
              </p>
            </div>
            
            <div className="flex gap-3">
              <button onClick={() => { setShowCloseModal(false); setClosingRecord(null); }} className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors" disabled={submitting}>
                Cancel
              </button>
              <button onClick={handleForceClose} disabled={submitting} className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors disabled:opacity-50">
                {submitting ? 'Closing...' : 'Force Close'}
              </button>
            </div>
          </div>
        </div>)}
        </div>
      </div>
    </div>);
}
