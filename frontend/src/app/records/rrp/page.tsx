'use client';

import { useAuthContext } from '@/context/AuthContext';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API } from '@/lib/api';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Plus, Edit, Trash2, RefreshCw } from 'lucide-react';
import { FiscalYearFilterSelect } from '@/components/fiscal-year/FiscalYearFilterSelect';
import { useFiscalYear } from '@/hooks/useFiscalYear';
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
import { RRPRecordFormBody, type RRPFormData } from '@/components/records/forms/RRPRecordFormBody';
import { useRecordsPageAuth } from '@/components/records/useRecordsPageAuth';

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

interface FilterOptions {
    statuses: string[];
    createdBy: string[];
}

function formatDate(value: string) {
    return value ? value.split('T')[0] : '';
}

export default function RRPRecordsPage() {
    const { user, permissions } = useAuthContext();
    const { canAccess } = useRecordsPageAuth('can_access_rrp_records');
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const showErrorToastRef = useRef(showErrorToast);
    useEffect(() => {
        showErrorToastRef.current = showErrorToast;
    }, [showErrorToast]);
    const latestRequestRef = useRef<number>(0);
    const { fiscalYear: currentFiscalYear } = useFiscalYear();
    const [fiscalYearFilter, setFiscalYearFilter] = useState<string>('');

    useEffect(() => {
        if (currentFiscalYear && !fiscalYearFilter) {
            setFiscalYearFilter(currentFiscalYear);
        }
    }, [currentFiscalYear, fiscalYearFilter]);

    const canCreate = permissions.includes('can_create_rrp_item');
    const canEdit = permissions.includes('can_edit_rrp_item');
    const canDelete = permissions.includes('can_delete_rrp_item');

    const [universal, setUniversal] = useState<string>('');
    const [equipmentNumber, setEquipmentNumber] = useState<string>('');
    const [partNumber, setPartNumber] = useState<string>('');
    const [status, setStatus] = useState<string>('all');
    const [createdBy, setCreatedBy] = useState<string>('all');
    const [page, setPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(20);
    const [records, setRecords] = useState<RRPRecord[]>([]);
    const [totalCount, setTotalCount] = useState<number>(0);
    const [totalPages, setTotalPages] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [filterOptions, setFilterOptions] = useState<FilterOptions>({ statuses: [], createdBy: [] });
    const [suppliers, setSuppliers] = useState<{ local: string[]; foreign: string[] }>({ local: [], foreign: [] });
    const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
    const [showEditModal, setShowEditModal] = useState<boolean>(false);
    const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
    const [editingRecord, setEditingRecord] = useState<RRPRecord | null>(null);
    const [deletingRecord, setDeletingRecord] = useState<RRPRecord | null>(null);
    const [showStatusModal, setShowStatusModal] = useState<boolean>(false);
    const [statusEditingRecord, setStatusEditingRecord] = useState<RRPRecord | null>(null);
    const [newStatus, setNewStatus] = useState<string>('');
    const [statusReason, setStatusReason] = useState<string>('');
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
        created_by: user?.UserInfo?.username || '',
    });
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState<boolean>(false);

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
                ...(createdBy && createdBy !== 'all' && { createdBy }),
                ...(fiscalYearFilter && { fiscalYear: fiscalYearFilter }),
            });
            const response = await API.get(`/api/rrp-records?${params}`);
            if (requestId !== latestRequestRef.current) return;
            if (response.status === 200) {
                const data: RRPRecordsResponse = response.data;
                setRecords(data.data);
                setTotalCount(data.totalCount);
                setTotalPages(data.totalPages);
            }
        } catch {
            if (requestId !== latestRequestRef.current) return;
            setError('Failed to fetch RRP records');
            showErrorToastRef.current({
                title: 'Error',
                message: 'Failed to fetch RRP records',
                duration: 3000,
            });
        } finally {
            if (requestId === latestRequestRef.current) {
                setLoading(false);
            }
        }
    }, [page, pageSize, universal, equipmentNumber, partNumber, status, createdBy, fiscalYearFilter]);

    const fetchFilterOptions = useCallback(async () => {
        try {
            const response = await API.get('/api/rrp-records/filters/options');
            if (response.status === 200) {
                setFilterOptions(response.data);
            }
        } catch {
            // ignore
        }
    }, []);

    const fetchSuppliers = useCallback(async () => {
        try {
            const response = await API.get('/api/rrp-records/suppliers/list');
            if (response.status === 200) {
                setSuppliers(response.data.suppliers);
            }
        } catch {
            // ignore
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
    }, [canAccess, page, universal, equipmentNumber, partNumber, status, createdBy, fiscalYearFilter, fetchData]);

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
            created_by: user?.UserInfo?.username || '',
        });
        setFormErrors({});
    };

    const validateDates = (rrpDate: string, invoiceDate: string) => {
        setFormErrors((prev) => {
            const next = { ...prev };
            if (rrpDate && invoiceDate) {
                const rrp = new Date(rrpDate);
                const invoice = new Date(invoiceDate);
                if (rrp > invoice) {
                    next.date = 'RRP date cannot be greater than invoice date';
                } else {
                    delete next.date;
                }
            }
            return next;
        });
    };

    const validateForm = (): boolean => {
        const errors: Record<string, string> = {};
        if (!formData.rrp_number.trim()) errors.rrp_number = 'RRP number is required';
        if (!formData.supplier_name.trim()) errors.supplier_name = 'Supplier name is required';
        if (!formData.date) errors.date = 'Date is required';
        if (!formData.invoice_number.trim()) errors.invoice_number = 'Invoice number is required';
        if (!formData.invoice_date) errors.invoice_date = 'Invoice date is required';
        if (formData.item_price <= 0) errors.item_price = 'Item price must be greater than 0';
        if (!formData.created_by.trim()) errors.created_by = 'Created by is required';
        if (formData.date && formData.invoice_date) {
            const rrp = new Date(formData.date);
            const invoice = new Date(formData.invoice_date);
            if (rrp > invoice) {
                errors.date = 'RRP date cannot be greater than invoice date';
            }
        }
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleCreate = async () => {
        if (!validateForm()) return;
        try {
            setSubmitting(true);
            const response = await API.post('/api/rrp-records', formData);
            if (response.status === 201) {
                showSuccessToast({ title: 'Success', message: 'RRP record created successfully', duration: 3000 });
                setShowCreateModal(false);
                resetForm();
                fetchData();
            }
        } catch (error: unknown) {
            const errorResponse = error as { response?: { data?: { message?: string; error?: string } } };
            showErrorToast({
                title: 'Error',
                message:
                    errorResponse?.response?.data?.message ||
                    errorResponse?.response?.data?.error ||
                    'Failed to create RRP record',
                duration: 3000,
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdate = async () => {
        if (!validateForm() || !editingRecord) return;
        try {
            setSubmitting(true);
            const response = await API.put(`/api/rrp-records/${editingRecord.id}`, formData);
            if (response.status === 200) {
                showSuccessToast({ title: 'Success', message: 'RRP record updated successfully', duration: 3000 });
                setShowEditModal(false);
                setEditingRecord(null);
                resetForm();
                fetchData();
            }
        } catch (error: unknown) {
            const errorResponse = error as { response?: { data?: { message?: string; error?: string } } };
            showErrorToast({
                title: 'Error',
                message:
                    errorResponse?.response?.data?.message ||
                    errorResponse?.response?.data?.error ||
                    'Failed to update RRP record',
                duration: 3000,
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingRecord) return;
        try {
            setSubmitting(true);
            const response = await API.delete(`/api/rrp-records/${deletingRecord.id}`);
            if (response.status === 200) {
                showSuccessToast({ title: 'Success', message: 'RRP record deleted successfully', duration: 3000 });
                setShowDeleteModal(false);
                setDeletingRecord(null);
                fetchData();
            }
        } catch (error: unknown) {
            const errorResponse = error as { response?: { data?: { message?: string; error?: string } } };
            showErrorToast({
                title: 'Error',
                message:
                    errorResponse?.response?.data?.message ||
                    errorResponse?.response?.data?.error ||
                    'Failed to delete RRP record',
                duration: 5000,
            });
        } finally {
            setSubmitting(false);
        }
    };

    const openEditModal = (record: RRPRecord) => {
        setEditingRecord(record);
        setFormData({
            rrp_number: record.rrp_number,
            supplier_name: record.supplier_name,
            date: formatDate(record.date),
            currency: record.currency,
            forex_rate: record.forex_rate,
            item_price: record.item_price,
            customs_charge: record.customs_charge,
            customs_date: formatDate(record.customs_date || ''),
            customs_number: record.customs_number || '',
            freight_charge: record.freight_charge,
            customs_service_charge: record.customs_service_charge,
            vat_percentage: record.vat_percentage,
            invoice_number: record.invoice_number,
            invoice_date: formatDate(record.invoice_date),
            po_number: record.po_number || '',
            total_amount: record.total_amount,
            airway_bill_number: record.airway_bill_number || '',
            inspection_details: record.inspection_details || '',
            reference_doc: record.reference_doc || '',
            approval_status: record.approval_status,
            created_by: record.created_by,
        });
        setFormErrors({});
        setShowEditModal(true);
    };

    const openDeleteModal = (record: RRPRecord) => {
        setDeletingRecord(record);
        setShowDeleteModal(true);
    };

    const openStatusModal = (record: RRPRecord) => {
        setStatusEditingRecord(record);
        setNewStatus(record.approval_status);
        setStatusReason('');
        setShowStatusModal(true);
    };

    const updateStatus = async () => {
        if (!statusEditingRecord || !newStatus) return;
        const needsReason = newStatus === 'REJECTED' || newStatus === 'VOID';
        if (needsReason && !statusReason.trim()) {
            showErrorToast({
                title: 'Reason required',
                message: `Please enter a reason to mark this RRP as ${newStatus}.`,
                duration: 4000,
            });
            return;
        }
        try {
            const response = await API.patch(`/api/rrp-records/${statusEditingRecord.id}/status`, {
                status: newStatus,
                reason: needsReason ? statusReason.trim() : undefined,
                updated_by: user?.UserInfo?.username,
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
                setStatusReason('');
            }
        } catch (error: unknown) {
            let message = 'Failed to update status';
            const maybeAxios = error as { response?: { data?: { message?: string } } };
            if (typeof maybeAxios?.response?.data?.message === 'string') {
                message = maybeAxios.response.data.message;
            } else if (error instanceof Error && error.message) {
                message = error.message;
            }
            showErrorToast({ title: 'Error', message, duration: 3000 });
        }
    };

    const openCreateModal = () => {
        resetForm();
        setShowCreateModal(true);
    };

    const resetPage = () => setPage(1);

    if (!canAccess) return null;

    return (
        <RecordsPageShell
            title="RRP Records"
            description="Manage rate review and payment records linked to receives."
            badge="Records"
            actions={
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => fetchData()}
                        disabled={loading}
                        className={recordsTheme.outlineBtn}
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                    {canCreate && (
                        <button type="button" onClick={openCreateModal} className={recordsTheme.primaryBtn}>
                            <Plus className="h-4 w-4" />
                            Add RRP
                        </button>
                    )}
                </div>
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
                                    onChange={(v) => {
                                        resetPage();
                                        setUniversal(v);
                                    }}
                                    placeholder="RRP#, Request#, Item Name, Part…"
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
                                    onChange={(v) => {
                                        resetPage();
                                        setEquipmentNumber(v);
                                    }}
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
                                    onChange={(v) => {
                                        resetPage();
                                        setPartNumber(v);
                                    }}
                                    placeholder="Part number"
                                />
                            ),
                        },
                        {
                            id: 'fiscalYear',
                            label: 'Fiscal year',
                            element: (
                                <FiscalYearFilterSelect
                                    value={fiscalYearFilter}
                                    onChange={(v) => {
                                        resetPage();
                                        setFiscalYearFilter(v);
                                    }}
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
                                    onChange={(v) => {
                                        resetPage();
                                        setStatus(v);
                                    }}
                                    options={[
                                        { value: 'all', label: 'All statuses' },
                                        ...filterOptions.statuses.map((s) => ({ value: s, label: s })),
                                    ]}
                                />
                            ),
                        },
                        {
                            id: 'createdBy',
                            label: 'Created by',
                            element: (
                                <RecordsFilterSelect
                                    id="createdBy"
                                    value={createdBy}
                                    onChange={(v) => {
                                        resetPage();
                                        setCreatedBy(v);
                                    }}
                                    options={[
                                        { value: 'all', label: 'All users' },
                                        ...filterOptions.createdBy.map((u) => ({ value: u, label: u })),
                                    ]}
                                />
                            ),
                        },
                    ]}
                />
            }
        >
            <RecordsTable loading={loading} error={error} emptyMessage={records.length === 0 ? 'No records found.' : undefined}>
                {records.length > 0 && (
                    <RecordsTableScroll>
                        <RecordsTableElement>
                            <RecordsTableHead>
                                <RecordsTableHeadRow>
                                    <RecordsTableHeadCell>RRP #</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Request #</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Receive #</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Item name</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Part number</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Supplier</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Amount</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Status</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Created by</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Date</RecordsTableHeadCell>
                                    {(canEdit || canDelete) && <RecordsTableHeadCell>Actions</RecordsTableHeadCell>}
                                </RecordsTableHeadRow>
                            </RecordsTableHead>
                            <RecordsTableBody>
                                {records.map((record) => (
                                    <RecordsTableRow key={record.id}>
                                        <RecordsTableCell>
                                            <span className="font-semibold text-slate-900">{record.rrp_number}</span>
                                        </RecordsTableCell>
                                        <RecordsTableCell>
                                            <span className="font-semibold text-blue-600">{record.request_number}</span>
                                        </RecordsTableCell>
                                        <RecordsTableCell>
                                            <span className="font-semibold text-emerald-600">{record.receive_number}</span>
                                        </RecordsTableCell>
                                        <RecordsTableCell>{record.item_name}</RecordsTableCell>
                                        <RecordsTableCell>
                                            <span className="font-mono text-xs">{record.part_number}</span>
                                        </RecordsTableCell>
                                        <RecordsTableCell>{record.supplier_name}</RecordsTableCell>
                                        <RecordsTableCell>
                                            <span className="font-semibold">
                                                {record.currency} {record.total_amount.toLocaleString()}
                                            </span>
                                        </RecordsTableCell>
                                        <RecordsTableCell>
                                            <RecordStatusBadge status={record.approval_status} />
                                        </RecordsTableCell>
                                        <RecordsTableCell>{record.created_by}</RecordsTableCell>
                                        <RecordsTableCell>{new Date(record.date).toLocaleDateString()}</RecordsTableCell>
                                        {(canEdit || canDelete) && (
                                            <RecordsTableCell>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {canEdit && (
                                                        <button
                                                            type="button"
                                                            onClick={() => openEditModal(record)}
                                                            className={recordsTheme.iconBtn}
                                                            title="Edit record"
                                                        >
                                                            <Edit className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                    {canEdit && (
                                                        <button
                                                            type="button"
                                                            onClick={() => openStatusModal(record)}
                                                            className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                                                            title="Bulk update status by RRP number"
                                                        >
                                                            Status
                                                        </button>
                                                    )}
                                                    {canDelete && (
                                                        <button
                                                            type="button"
                                                            onClick={() => openDeleteModal(record)}
                                                            className={recordsTheme.iconBtnDanger}
                                                            title="Delete record"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
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
                onPageSizeChange={(size) => {
                    setPage(1);
                    setPageSize(size);
                }}
            />

            <RecordsModal
                open={showCreateModal}
                title="Add RRP record"
                description="Create a new rate review and payment record."
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
                <RRPRecordFormBody
                    formData={formData}
                    setFormData={setFormData}
                    errors={formErrors}
                    suppliers={suppliers}
                    onValidateDates={validateDates}
                />
            </RecordsModal>

            <RecordsModal
                open={showEditModal && !!editingRecord}
                title="Edit RRP record"
                description={editingRecord ? `RRP #${editingRecord.rrp_number} · ${editingRecord.item_name}` : undefined}
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
                {editingRecord && (
                    <RRPRecordFormBody
                        formData={formData}
                        setFormData={setFormData}
                        errors={formErrors}
                        suppliers={suppliers}
                        onValidateDates={validateDates}
                        initialSupplierName={editingRecord.supplier_name}
                    />
                )}
            </RecordsModal>

            <RecordsModal
                open={showStatusModal && !!statusEditingRecord}
                title="Update status"
                description={
                    statusEditingRecord
                        ? `Updates all records with RRP number ${statusEditingRecord.rrp_number}`
                        : undefined
                }
                onClose={() => {
                    setShowStatusModal(false);
                    setStatusEditingRecord(null);
                    setNewStatus('');
                    setStatusReason('');
                }}
                size="md"
                footer={
                    <RecordsModalActions
                        onCancel={() => {
                            setShowStatusModal(false);
                            setStatusEditingRecord(null);
                            setNewStatus('');
                            setStatusReason('');
                        }}
                        onSubmit={updateStatus}
                        submitLabel="Update status"
                    />
                }
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className={recordsTheme.filterLabel} htmlFor="rrp-status-select">
                            New status
                        </label>
                        <select
                            id="rrp-status-select"
                            value={newStatus}
                            onChange={(e) => setNewStatus(e.target.value)}
                            className={recordsTheme.select}
                        >
                            <option value="PENDING">PENDING</option>
                            <option value="APPROVED">APPROVED</option>
                            <option value="REJECTED">REJECTED</option>
                            <option value="VOID">VOID</option>
                        </select>
                    </div>
                    {(newStatus === 'REJECTED' || newStatus === 'VOID') && (
                        <div className="space-y-2">
                            <label className={recordsTheme.filterLabel} htmlFor="rrp-status-reason">
                                Reason {newStatus === 'VOID' ? '(required to void)' : '(required)'}
                            </label>
                            <textarea
                                id="rrp-status-reason"
                                value={statusReason}
                                onChange={(e) => setStatusReason(e.target.value)}
                                rows={3}
                                className={recordsTheme.input}
                                placeholder={
                                    newStatus === 'VOID'
                                        ? 'Explain why this RRP is being voided. Items will be released for a new RRP and amounts will not count toward inventory.'
                                        : 'Explain why this RRP is being rejected.'
                                }
                            />
                        </div>
                    )}
                    {newStatus === 'VOID' && (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                            Voiding keeps the RRP record for audit but releases linked receives (clears{' '}
                            <code className="text-[11px]">rrp_fk</code>), removes RRP value from inventory
                            calculations, and allows those items to be included in a new RRP.
                        </p>
                    )}
                </div>
            </RecordsModal>

            <RecordsModal
                open={showDeleteModal && !!deletingRecord}
                title="Delete RRP record"
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
                {deletingRecord && (
                    <p className="text-sm text-slate-600">
                        Delete RRP record <strong>{deletingRecord.rrp_number}</strong> for item{' '}
                        <strong>{deletingRecord.item_name}</strong>? This cannot be undone.
                    </p>
                )}
            </RecordsModal>
        </RecordsPageShell>
    );
}
