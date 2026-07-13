'use client';
import { useAuthContext } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useRef } from 'react';
import { Plus, Edit, Trash2, RefreshCw, Lock } from 'lucide-react';
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
import { RequestRecordFormBody } from '@/components/records/forms/RequestRecordFormBody';
import { API } from '@/lib/api';
import { withBasePath } from '@/lib/urls';
import { useCustomToast } from '@/components/ui/custom-toast';
import { isAbsentPartNumber } from '@/utils/partNumberUtils';

const toDateInputValue = (value: string | null | undefined): string => {
    if (!value) {
        return '';
    }
    const raw = String(value);
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
};

const asFormString = (value: unknown): string => {
    if (value == null) {
        return '';
    }
    return String(value);
};
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
    const [pageSize, setPageSize] = useState<number>(20);
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
        if (!asFormString(formData.request_number).trim()) {
            errors.request_number = 'Request number is required';
        }
        if (!asFormString(formData.nac_code).trim()) {
            errors.nac_code = 'NAC code is required';
        }
        if (!asFormString(formData.request_date).trim()) {
            errors.request_date = 'Request date is required';
        }
        if (!asFormString(formData.item_name).trim()) {
            errors.item_name = 'Item name is required';
        }
        if (!asFormString(formData.unit).trim()) {
            errors.unit = 'Unit is required';
        }
        if (!Number.isFinite(Number(formData.requested_quantity)) || Number(formData.requested_quantity) <= 0) {
            errors.requested_quantity = 'Requested quantity must be greater than 0';
        }
        if (!asFormString(formData.equipment_number).trim()) {
            errors.equipment_number = 'Equipment number is required';
        }
        if (!asFormString(formData.requested_by).trim()) {
            errors.requested_by = 'Requested by is required';
        }
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
        if (!editingRecord) {
            return;
        }
        if (!validateForm()) {
            showErrorToast({
                title: 'Error',
                message: 'Please fix the highlighted fields before saving.',
                duration: 3000,
            });
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
            const partNumber = asFormString(formData.part_number).trim();
            const response = await API.put(`/api/request-records/${editingRecord.id}`, {
                ...formData,
                request_number: asFormString(formData.request_number).trim(),
                nac_code: asFormString(formData.nac_code).trim(),
                request_date: toDateInputValue(formData.request_date),
                part_number: isAbsentPartNumber(partNumber) ? 'N/A' : partNumber,
                item_name: asFormString(formData.item_name).trim(),
                unit: asFormString(formData.unit).trim(),
                requested_quantity: Number(formData.requested_quantity),
                current_balance: Number(formData.current_balance) || 0,
                previous_rate: asFormString(formData.previous_rate).trim() || 'N/A',
                equipment_number: asFormString(formData.equipment_number).trim(),
                requested_by: asFormString(formData.requested_by).trim(),
                approval_status: asFormString(formData.approval_status).trim() || 'PENDING',
                image_path: imagePath || '',
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
                message?: string;
            })?.response?.data?.message
                || (error as { message?: string })?.message
                || 'Failed to update request record';
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
            const response = await API.put(`/api/request/items/${closingRecord.id}/force-close`, {
                closedBy: user?.UserInfo?.username
            });
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: 'Request line item force closed successfully',
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
            request_number: asFormString(record.request_number),
            nac_code: asFormString(record.nac_code),
            request_date: toDateInputValue(record.request_date),
            part_number: asFormString(record.part_number) || 'N/A',
            item_name: asFormString(record.item_name),
            unit: asFormString(record.unit),
            requested_quantity: Number(record.requested_quantity) || 0,
            current_balance: Number(record.current_balance) || 0,
            previous_rate: asFormString(record.previous_rate) || 'N/A',
            equipment_number: asFormString(record.equipment_number),
            image_path: asFormString(record.image_path),
            specifications: asFormString(record.specifications),
            remarks: asFormString(record.remarks),
            requested_by: asFormString(record.requested_by),
            approval_status: asFormString(record.approval_status) || 'PENDING',
            reference_doc: asFormString(record.reference_doc),
        };
        setFormData(formDataToSet);
        setFormErrors({});
        setSelectedImage(null);
        setImagePreview(
            record.image_path
                ? withBasePath(record.image_path.startsWith('/') ? record.image_path : `/${record.image_path}`)
                : null
        );
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
    return (
        <RecordsPageShell
            title="Request Records"
            description="Manage and track all purchase request records with full edit support."
            actions={
                <>
                    <button
                        type="button"
                        onClick={() => fetchData()}
                        disabled={loading}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-60"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                    {canCreate && (
                        <button type="button" onClick={openCreateModal} className={recordsTheme.primaryBtn}>
                            <Plus className="h-4 w-4" />
                            Add request
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
                                    onChange={(v) => { setPage(1); setUniversal(v); }}
                                    placeholder="Request #, NAC, name, part, equipment…"
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
                                    onChange={(v) => { setPage(1); setEquipmentNumber(v); }}
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
                                    onChange={(v) => { setPage(1); setPartNumber(v); }}
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
                                    onChange={(v) => { setPage(1); setStatus(v); }}
                                    options={[
                                        { value: 'all', label: 'All statuses' },
                                        ...filterOptions.statuses.map((s) => ({ value: s, label: s })),
                                    ]}
                                />
                            ),
                        },
                        {
                            id: 'requestedBy',
                            label: 'Requested by',
                            element: (
                                <RecordsFilterSelect
                                    id="requestedBy"
                                    value={requestedBy}
                                    onChange={(v) => { setPage(1); setRequestedBy(v); }}
                                    options={[
                                        { value: 'all', label: 'All users' },
                                        ...filterOptions.requestedBy.map((u) => ({ value: u, label: u })),
                                    ]}
                                />
                            ),
                        },
                    ]}
                />
            }
        >
        <RecordsTable loading={loading} error={error} emptyMessage={records.length === 0 && !loading ? 'No records found' : undefined}>
            {records.length > 0 && (
                <RecordsTableScroll>
                    <RecordsTableElement>
                        <RecordsTableHead>
                            <RecordsTableHeadRow>
                                <RecordsTableHeadCell>Request #</RecordsTableHeadCell>
                                <RecordsTableHeadCell>NAC</RecordsTableHeadCell>
                                <RecordsTableHeadCell>Lead time</RecordsTableHeadCell>
                                <RecordsTableHeadCell>Item</RecordsTableHeadCell>
                                <RecordsTableHeadCell>Part #</RecordsTableHeadCell>
                                <RecordsTableHeadCell>Qty</RecordsTableHeadCell>
                                <RecordsTableHeadCell>Status</RecordsTableHeadCell>
                                <RecordsTableHeadCell>Requested by</RecordsTableHeadCell>
                                <RecordsTableHeadCell>Date</RecordsTableHeadCell>
                                {(canEdit || canDelete || canForceClose) && <RecordsTableHeadCell>Actions</RecordsTableHeadCell>}
                            </RecordsTableHeadRow>
                        </RecordsTableHead>
                        <RecordsTableBody>
                            {records.map((record) => (
                                <RecordsTableRow key={record.id}>
                                    <RecordsTableCell>
                                        <span className="font-semibold">{record.request_number}</span>
                                    </RecordsTableCell>
                                    <RecordsTableCell className="font-mono text-xs">{record.nac_code}</RecordsTableCell>
                                    <RecordsTableCell>
                                        {record.prediction_summary ? (
                                            <div className="space-y-0.5 text-xs">
                                                <div className="font-medium">~{Math.round(record.prediction_summary.predicted_days)} days</div>
                                                <div className="text-slate-500">{record.prediction_summary.confidence ?? 'N/A'} · {record.prediction_summary.sample_size} samples</div>
                                            </div>
                                        ) : (
                                            <span className="text-slate-400 italic">—</span>
                                        )}
                                    </RecordsTableCell>
                                    <RecordsTableCell>{record.item_name}</RecordsTableCell>
                                    <RecordsTableCell className="font-mono text-xs">{record.part_number}</RecordsTableCell>
                                    <RecordsTableCell>
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">{record.requested_quantity}</span>
                                            {(() => {
                                                const label = record.receive_status_label || (record.is_received ? 'Received' : 'Not Received');
                                                const style =
                                                    label === 'Received'
                                                        ? 'bg-emerald-50 text-emerald-700'
                                                        : label === 'Partially Received'
                                                          ? 'bg-amber-50 text-amber-700'
                                                          : 'bg-slate-100 text-slate-600';
                                                return (
                                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${style}`}>
                                                        {label}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                    </RecordsTableCell>
                                    <RecordsTableCell>
                                        <RecordStatusBadge status={record.approval_status} />
                                    </RecordsTableCell>
                                    <RecordsTableCell>{record.requested_by}</RecordsTableCell>
                                    <RecordsTableCell>{new Date(record.request_date).toLocaleDateString()}</RecordsTableCell>
                                    {(canEdit || canDelete || canForceClose) && (
                                        <RecordsTableCell>
                                            <div className="flex gap-1">
                                                {canEdit && (
                                                    <button type="button" onClick={() => openEditModal(record)} className={recordsTheme.iconBtn} title="Edit">
                                                        <Edit className="h-4 w-4" />
                                                    </button>
                                                )}
                                                {canDelete && !record.is_received && (!record.receive_fk || record.receive_fk === 0) && (
                                                    <button type="button" onClick={() => openDeleteModal(record)} className={recordsTheme.iconBtnDanger} title="Delete">
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                )}
                                                {canForceClose &&
                                                    (record.approval_status === 'PENDING' || record.approval_status === 'APPROVED') &&
                                                    record.receive_status_label !== 'Received' && (
                                                    <button type="button" onClick={() => openCloseModal(record)} className={recordsTheme.iconBtn} title="Force close line item">
                                                        <Lock className="h-4 w-4" />
                                                    </button>
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
            onPageSizeChange={(size) => { setPage(1); setPageSize(size); }}
        />{showCreateModal && (
            <RecordsModal
                open={showCreateModal}
                title="Add request record"
                description="Create a new purchase request record with full details."
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
                <RequestRecordFormBody
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
                title="Edit request record"
                description={`Request #${editingRecord.request_number}`}
                onClose={() => { setShowEditModal(false); setEditingRecord(null); }}
                size="2xl"
                submitting={submitting}
                footer={
                    <RecordsModalActions
                        onCancel={() => { setShowEditModal(false); setEditingRecord(null); }}
                        onSubmit={handleUpdate}
                        submitLabel="Save changes"
                        submitting={submitting}
                    />
                }
            >
                {editingRecord.is_received && (
                    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        This record has been received. Requested quantity cannot be less than the received quantity.
                    </div>
                )}
                <RequestRecordFormBody
                    formData={formData}
                    setFormData={setFormData}
                    errors={formErrors}
                    imagePreview={imagePreview}
                    onImageSelect={handleImageSelect}
                    onImageClear={removeImage}
                />
            </RecordsModal>
        )}

        {showDeleteModal && deletingRecord && (
            <RecordsModal
                open={showDeleteModal}
                title="Delete request record"
                onClose={() => { setShowDeleteModal(false); setDeletingRecord(null); }}
                size="md"
                submitting={submitting}
                footer={
                    <RecordsModalActions
                        onCancel={() => { setShowDeleteModal(false); setDeletingRecord(null); }}
                        onSubmit={handleDelete}
                        submitLabel="Delete"
                        submitting={submitting}
                        danger
                    />
                }
            >
                {deletingRecord.is_received && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                        This record has been received and cannot be deleted.
                    </div>
                )}
                <p className="text-sm text-slate-600">
                    Delete request <strong>{deletingRecord.request_number}</strong> for{' '}
                    <strong>{deletingRecord.item_name}</strong>? This cannot be undone.
                </p>
            </RecordsModal>
        )}

        {showCloseModal && closingRecord && (
            <RecordsModal
                open={showCloseModal}
                title="Force close line item"
                onClose={() => { setShowCloseModal(false); setClosingRecord(null); }}
                size="md"
                submitting={submitting}
                footer={
                    <RecordsModalActions
                        onCancel={() => { setShowCloseModal(false); setClosingRecord(null); }}
                        onSubmit={handleForceClose}
                        submitLabel="Force close line"
                        submitting={submitting}
                    />
                }
            >
                <p className="text-sm text-slate-600">
                    Force close line item <strong>{closingRecord.item_name}</strong> on request{' '}
                    <strong>{closingRecord.request_number}</strong>? Only this line will be closed; other items on the
                    same request stay open unless closed separately.
                </p>
            </RecordsModal>
        )}
        </RecordsPageShell>
    );
}
