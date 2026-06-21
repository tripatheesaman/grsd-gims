'use client';

import { useAuthContext } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useRef } from 'react';
import { Plus, Edit, Trash2, RefreshCw, X } from 'lucide-react';
import {
    RecordsPageShell,
    RecordsFilterPanel,
    RecordsFilterInput,
    RecordsFilterSelect,
    RecordsTable,
    RecordsTableScroll,
    RecordsTableElement,
    RecordsTableHead,
    RecordsTableHeadRow,
    RecordsTableHeadCell,
    RecordsTableBody,
    RecordsTableRow,
    RecordsTableCell,
    RecordsPagination,
    RecordsModal,
    RecordsModalActions,
    RecordStatusBadge,
    recordsTheme,
} from '@/components/records';
import {
    ReceiveRecordFormBody,
    type ReceiveFormData,
} from '@/components/records/forms/ReceiveRecordFormBody';
import { API } from '@/lib/api';
import { withBasePath } from '@/lib/urls';
import { useCustomToast } from '@/components/ui/custom-toast';

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

interface FilterOptions {
    statuses: string[];
    receivedBy: string[];
}

const EMPTY_FORM: ReceiveFormData = {
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
    receive_source: 'request',
    tender_reference_number: '',
    rejection_reason: '',
};

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
    const [pageSize, setPageSize] = useState<number>(20);
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
    const [formData, setFormData] = useState<ReceiveFormData>(EMPTY_FORM);
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
                ...(receivedBy && receivedBy !== 'all' && { receivedBy }),
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
                title: 'Error',
                message: 'Failed to fetch receive records',
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
            ...EMPTY_FORM,
            received_by: user?.UserInfo?.username || '',
        });
        setFormErrors({});
        setSelectedImage(null);
        setImagePreview(null);
    };

    const handleImageSelect = (file: File | null) => {
        if (!file) return;
        setSelectedImage(file);
        const reader = new FileReader();
        reader.onload = (e) => {
            setImagePreview(e.target?.result as string);
        };
        reader.readAsDataURL(file);
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
                image_path: imagePath,
            });
            if (response.status === 201) {
                showSuccessToast({
                    title: 'Success',
                    message: 'Receive record created successfully',
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
            const originalData = {
                request_fk: editingRecord.request_fk,
                receive_date: editingRecord.receive_date.split('T')[0],
                nac_code: editingRecord.nac_code,
                part_number: editingRecord.part_number,
                item_name: editingRecord.item_name,
                received_quantity: editingRecord.received_quantity,
                unit: editingRecord.unit,
                received_by: editingRecord.received_by,
                image_path: editingRecord.image_path || '',
                location: editingRecord.location || '',
                approval_status: editingRecord.approval_status,
                receive_source: editingRecord.receive_source || '',
                tender_reference_number: editingRecord.tender_reference_number || '',
                rejection_reason: editingRecord.rejection_reason || '',
            };
            const nextData = {
                request_fk: formData.request_fk,
                receive_date: formData.receive_date,
                nac_code: formData.nac_code,
                part_number: formData.part_number,
                item_name: formData.item_name,
                received_quantity: formData.received_quantity,
                unit: formData.unit,
                received_by: formData.received_by,
                image_path: imagePath,
                location: formData.location,
                approval_status: formData.approval_status,
                receive_source: formData.receive_source || '',
                tender_reference_number: formData.tender_reference_number || '',
                rejection_reason: formData.rejection_reason || '',
            };
            const payload: Partial<ReceiveFormData> = {};
            if (editingRecord.request_fk > 0 && nextData.request_fk !== originalData.request_fk) {
                payload.request_fk = nextData.request_fk;
            }
            if (nextData.receive_date !== originalData.receive_date) {
                payload.receive_date = nextData.receive_date;
            }
            if (nextData.nac_code !== originalData.nac_code) {
                payload.nac_code = nextData.nac_code;
            }
            if (nextData.part_number !== originalData.part_number) {
                payload.part_number = nextData.part_number;
            }
            if (nextData.item_name !== originalData.item_name) {
                payload.item_name = nextData.item_name;
            }
            if (nextData.received_quantity !== originalData.received_quantity) {
                payload.received_quantity = nextData.received_quantity;
            }
            if (nextData.unit !== originalData.unit) {
                payload.unit = nextData.unit;
            }
            if (nextData.received_by !== originalData.received_by) {
                payload.received_by = nextData.received_by;
            }
            if (nextData.image_path !== originalData.image_path) {
                payload.image_path = nextData.image_path;
            }
            if (nextData.location !== originalData.location) {
                payload.location = nextData.location;
            }
            if (nextData.approval_status !== originalData.approval_status) {
                payload.approval_status = nextData.approval_status;
            }
            if (nextData.receive_source !== originalData.receive_source) {
                payload.receive_source = nextData.receive_source;
            }
            if (nextData.tender_reference_number !== originalData.tender_reference_number) {
                payload.tender_reference_number = nextData.tender_reference_number;
            }
            if (nextData.rejection_reason !== originalData.rejection_reason) {
                payload.rejection_reason = nextData.rejection_reason;
            }
            if (Object.keys(payload).length === 0) {
                setShowEditModal(false);
                setEditingRecord(null);
                resetForm();
                return;
            }
            const response = await API.put(`/api/receive-records/${editingRecord.id}`, payload);
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: 'Receive record updated successfully',
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
                    message: 'Receive record deleted successfully',
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
        setFormData({
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
            receive_source: record.receive_source || 'request',
            tender_reference_number: record.tender_reference_number || '',
            rejection_reason: record.rejection_reason || '',
        });
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

    const filterOnChange = (setter: (v: string) => void) => (v: string) => {
        setPage(1);
        setter(v);
    };

    if (!canAccess)
        return null;

    return (
        <RecordsPageShell
            title="Receive Records"
            description="Manage and track all receive records"
            actions={
                <>
                    <button
                        type="button"
                        onClick={() => fetchData()}
                        disabled={loading}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-white/20 disabled:opacity-60"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                    {canCreate && (
                        <button type="button" onClick={openCreateModal} className={recordsTheme.primaryBtn}>
                            <Plus className="h-4 w-4" />
                            Add Receive
                        </button>
                    )}
                </>
            }
            filters={
                <RecordsFilterPanel
                    fields={[
                        {
                            id: 'universal',
                            label: 'Universal search',
                            element: (
                                <RecordsFilterInput
                                    id="universal"
                                    value={universal}
                                    onChange={filterOnChange(setUniversal)}
                                    placeholder="Receive#, Request#, NAC, Name, Part..."
                                />
                            ),
                        },
                        {
                            id: 'equipment',
                            label: 'Equipment number',
                            element: (
                                <RecordsFilterInput
                                    id="equipment"
                                    value={equipmentNumber}
                                    onChange={filterOnChange(setEquipmentNumber)}
                                    placeholder="Equipment number"
                                />
                            ),
                        },
                        {
                            id: 'part',
                            label: 'Part number',
                            element: (
                                <RecordsFilterInput
                                    id="part"
                                    value={partNumber}
                                    onChange={filterOnChange(setPartNumber)}
                                    placeholder="Part number"
                                />
                            ),
                        },
                        {
                            id: 'status',
                            label: 'Status',
                            element: (
                                <RecordsFilterSelect
                                    id="status"
                                    value={status}
                                    onChange={filterOnChange(setStatus)}
                                    options={[
                                        { value: 'all', label: 'All statuses' },
                                        ...filterOptions.statuses.map((s) => ({ value: s, label: s })),
                                    ]}
                                />
                            ),
                        },
                        {
                            id: 'receivedBy',
                            label: 'Received by',
                            element: (
                                <RecordsFilterSelect
                                    id="receivedBy"
                                    value={receivedBy}
                                    onChange={filterOnChange(setReceivedBy)}
                                    options={[
                                        { value: 'all', label: 'All users' },
                                        ...filterOptions.receivedBy.map((u) => ({ value: u, label: u })),
                                    ]}
                                />
                            ),
                        },
                    ]}
                />
            }
        >
            <RecordsTable loading={loading} error={error} emptyMessage="No records found.">
                {records.length > 0 && (
                    <RecordsTableScroll>
                        <RecordsTableElement>
                            <RecordsTableHead>
                                <RecordsTableHeadRow>
                                    <RecordsTableHeadCell>Receive #</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Request #</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>NAC Code</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Lead Time (Predicted)</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Item Name</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Part Number</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Quantity</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Status</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Received By</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Date</RecordsTableHeadCell>
                                    {(canEdit || canDelete) && (
                                        <RecordsTableHeadCell>Actions</RecordsTableHeadCell>
                                    )}
                                </RecordsTableHeadRow>
                            </RecordsTableHead>
                            <RecordsTableBody>
                                {records.map((record) => (
                                    <RecordsTableRow key={record.id}>
                                        <RecordsTableCell className="font-semibold text-slate-900">
                                            {record.receive_number}
                                        </RecordsTableCell>
                                        <RecordsTableCell className="font-semibold text-blue-600">
                                            {record.request_number}
                                        </RecordsTableCell>
                                        <RecordsTableCell className="font-mono">{record.nac_code}</RecordsTableCell>
                                        <RecordsTableCell className="whitespace-normal">
                                            {record.prediction_summary ? (
                                                <div className="flex flex-col gap-1 text-xs text-slate-600">
                                                    <span className="text-sm font-semibold text-slate-900">
                                                        ~{Math.round(record.prediction_summary.predicted_days)} days
                                                    </span>
                                                    {record.prediction_summary.range_lower_days !== null &&
                                                    record.prediction_summary.range_upper_days !== null ? (
                                                        <span>
                                                            Range {Math.round(record.prediction_summary.range_lower_days)}–
                                                            {Math.round(record.prediction_summary.range_upper_days)} days
                                                        </span>
                                                    ) : (
                                                        <span className="italic text-slate-400">Limited history</span>
                                                    )}
                                                    <span className="text-[11px] uppercase tracking-wide text-[#003594]">
                                                        {record.prediction_summary.confidence ?? 'N/A'} confidence •{' '}
                                                        {record.prediction_summary.sample_size} samples
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-xs italic text-slate-400">No prediction yet</span>
                                            )}
                                        </RecordsTableCell>
                                        <RecordsTableCell className="whitespace-normal">{record.item_name}</RecordsTableCell>
                                        <RecordsTableCell className="font-mono">{record.part_number}</RecordsTableCell>
                                        <RecordsTableCell>{record.received_quantity}</RecordsTableCell>
                                        <RecordsTableCell>
                                            <RecordStatusBadge status={record.approval_status} />
                                        </RecordsTableCell>
                                        <RecordsTableCell>{record.received_by}</RecordsTableCell>
                                        <RecordsTableCell>
                                            {new Date(record.receive_date).toLocaleDateString()}
                                        </RecordsTableCell>
                                        {(canEdit || canDelete) && (
                                            <RecordsTableCell>
                                                <div className="flex gap-2">
                                                    {canEdit && (
                                                        <button
                                                            type="button"
                                                            onClick={() => openEditModal(record)}
                                                            className={recordsTheme.iconBtn}
                                                            title="Edit"
                                                        >
                                                            <Edit className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                    {canDelete && (!record.rrp_fk || record.rrp_fk === 0) && (
                                                        <button
                                                            type="button"
                                                            onClick={() => openDeleteModal(record)}
                                                            className={recordsTheme.iconBtnDanger}
                                                            title="Delete"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                    {canDelete && record.rrp_fk && record.rrp_fk > 0 && (
                                                        <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500">
                                                            <X className="h-3 w-3" />
                                                            Cannot delete
                                                        </span>
                                                    )}
                                                </div>
                                            </RecordsTableCell>
                                        )}
                                    </RecordsTableRow>
                                ))}
                            </RecordsTableBody>
                        </RecordsTableElement>
                    </RecordsTableScroll>
                )}
            </RecordsTable>

            <RecordsPagination
                page={page}
                pageSize={pageSize}
                totalCount={totalCount}
                totalPages={totalPages}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                    setPage(1);
                    setPageSize(size);
                }}
            />

            {showCreateModal && (
                <RecordsModal
                    open={showCreateModal}
                    title="Add receive record"
                    description="Create a new receive record with full details."
                    onClose={() => setShowCreateModal(false)}
                    size="2xl"
                    submitting={submitting}
                    footer={
                        <RecordsModalActions
                            onCancel={() => setShowCreateModal(false)}
                            onSubmit={handleCreate}
                            submitLabel="Create"
                            submitting={submitting}
                        />
                    }
                >
                    <ReceiveRecordFormBody
                        formData={formData}
                        setFormData={setFormData}
                        errors={formErrors}
                        imagePreview={imagePreview}
                        onImageSelect={handleImageSelect}
                        onImageClear={removeImage}
                    />
                </RecordsModal>
            )}

            {showEditModal && editingRecord && (
                <RecordsModal
                    open={showEditModal}
                    title="Edit receive record"
                    description={`Receive #${editingRecord.receive_number}`}
                    onClose={() => {
                        setShowEditModal(false);
                        setEditingRecord(null);
                    }}
                    size="2xl"
                    submitting={submitting}
                    footer={
                        <RecordsModalActions
                            onCancel={() => {
                                setShowEditModal(false);
                                setEditingRecord(null);
                            }}
                            onSubmit={handleUpdate}
                            submitLabel="Save changes"
                            submitting={submitting}
                        />
                    }
                >
                    <ReceiveRecordFormBody
                        formData={formData}
                        setFormData={setFormData}
                        errors={formErrors}
                        imagePreview={imagePreview}
                        onImageSelect={handleImageSelect}
                        onImageClear={removeImage}
                        isEdit
                    />
                </RecordsModal>
            )}

            {showDeleteModal && deletingRecord && (
                <RecordsModal
                    open={showDeleteModal}
                    title="Delete receive record"
                    onClose={() => {
                        setShowDeleteModal(false);
                        setDeletingRecord(null);
                    }}
                    size="md"
                    submitting={submitting}
                    footer={
                        <RecordsModalActions
                            onCancel={() => {
                                setShowDeleteModal(false);
                                setDeletingRecord(null);
                            }}
                            onSubmit={handleDelete}
                            submitLabel="Delete"
                            submitting={submitting}
                            danger
                        />
                    }
                >
                    <p className="text-sm text-slate-600">
                        Delete receive record <strong>{deletingRecord.receive_number}</strong> for{' '}
                        <strong>{deletingRecord.item_name}</strong>? This cannot be undone.
                    </p>
                </RecordsModal>
            )}
        </RecordsPageShell>
    );
}
