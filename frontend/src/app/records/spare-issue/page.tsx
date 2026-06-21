'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Edit, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { FiscalYearFilterSelect } from '@/components/fiscal-year/FiscalYearFilterSelect';
import { useFiscalYear } from '@/hooks/useFiscalYear';
import { useCustomToast } from '@/components/ui/custom-toast';
import { API } from '@/lib/api';
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
    useRecordsPageAuth,
} from '@/components/records';
import {
    SpareIssueRecordFormBody,
    type SpareIssueFormData,
} from '@/components/records/forms/SpareIssueRecordFormBody';

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
}

interface FilterOptions {
    issueSlipNumbers: string[];
    nacCodes: Array<{ nac_code: string; item_name: string }>;
    equipmentNumbers: string[];
    approvalStatuses: string[];
}

const EMPTY_FORM: SpareIssueFormData = {
    issue_slip_number: '',
    issue_date: '',
    nac_code: '',
    part_number: '',
    issue_quantity: 0,
    issue_cost: 0,
    remaining_balance: 0,
    issued_for: '',
    issued_by: { name: '', staffId: '' },
    approval_status: 'PENDING',
};

const SORTABLE_COLUMNS: Array<{ key: string; label: string }> = [
    { key: 'issue_slip_number', label: 'Issue slip #' },
    { key: 'issue_date', label: 'Issue date' },
    { key: 'nac_code', label: 'NAC code' },
    { key: 'issue_quantity', label: 'Quantity' },
    { key: 'issue_cost', label: 'Cost' },
    { key: 'approval_status', label: 'Status' },
];

function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString();
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'NPR' }).format(amount);
}

export default function SpareIssueRecordsPage() {
    const { canAccess, permissions } = useRecordsPageAuth('can_access_spares_issue_records');
    const canCreate = permissions.includes('can_add_spares_issue_item');
    const canEdit = permissions.includes('can_edit_spares_issue_item');
    const canDelete = permissions.includes('can_delete_spares_issue_item');

    const { showSuccessToast, showErrorToast } = useCustomToast();
    const showErrorToastRef = useRef(showErrorToast);
    useEffect(() => {
        showErrorToastRef.current = showErrorToast;
    }, [showErrorToast]);

    const latestRequestRef = useRef(0);
    const { fiscalYear: currentFiscalYear } = useFiscalYear();

    const [fiscalYearFilter, setFiscalYearFilter] = useState('');
    const [records, setRecords] = useState<SpareIssueRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);

    const [searchTerm, setSearchTerm] = useState('');
    const [issueSlipNumber, setIssueSlipNumber] = useState('');
    const [partNumber, setPartNumber] = useState('');
    const [itemName, setItemName] = useState('');
    const [nacCode, setNacCode] = useState('');
    const [issuedFor, setIssuedFor] = useState('');
    const [status, setStatus] = useState('all');
    const [sortBy, setSortBy] = useState('issue_date');
    const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');

    const [filterOptions, setFilterOptions] = useState<FilterOptions>({
        issueSlipNumbers: [],
        nacCodes: [],
        equipmentNumbers: [],
        approvalStatuses: [],
    });

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [selectedRecord, setSelectedRecord] = useState<SpareIssueRecord | null>(null);
    const [formData, setFormData] = useState<SpareIssueFormData>(EMPTY_FORM);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (currentFiscalYear && !fiscalYearFilter) {
            setFiscalYearFilter(currentFiscalYear);
        }
    }, [currentFiscalYear, fiscalYearFilter]);

    const handleSort = (field: string) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
        } else {
            setSortBy(field);
            setSortOrder('ASC');
        }
    };

    const fetchData = useCallback(async () => {
        const requestId = latestRequestRef.current + 1;
        latestRequestRef.current = requestId;
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: pageSize.toString(),
                search: searchTerm,
                issueSlipNumber,
                partNumber,
                itemName,
                nacCode,
                issuedFor,
                status: status === 'all' ? '' : status,
                sortBy,
                sortOrder,
                ...(fiscalYearFilter && { fiscalYear: fiscalYearFilter }),
            });
            const response = await API.get(`/api/spare-issue-records?${params}`);
            if (requestId !== latestRequestRef.current) return;

            const data = response.data;
            setRecords(data.records);
            setTotalPages(data.pagination.totalPages);
            setTotalCount(data.pagination.total);
        } catch {
            if (requestId !== latestRequestRef.current) return;
            setError('Failed to fetch spare issue records');
            showErrorToastRef.current({
                title: 'Error',
                message: 'Failed to fetch spare issue records',
                duration: 3000,
            });
        } finally {
            if (requestId === latestRequestRef.current) {
                setLoading(false);
            }
        }
    }, [
        page,
        pageSize,
        searchTerm,
        issueSlipNumber,
        partNumber,
        itemName,
        nacCode,
        issuedFor,
        status,
        sortBy,
        sortOrder,
        fiscalYearFilter,
    ]);

    const fetchFilterOptions = useCallback(async () => {
        try {
            const response = await API.get('/api/spare-issue-records/filters/options');
            setFilterOptions(response.data.filters);
        } catch {
            /* ignore */
        }
    }, []);

    useEffect(() => {
        if (canAccess) fetchFilterOptions();
    }, [canAccess, fetchFilterOptions]);

    useEffect(() => {
        if (canAccess) fetchData();
    }, [canAccess, fetchData]);

    const resetForm = () => {
        setFormData(EMPTY_FORM);
        setFormErrors({});
    };

    const validateForm = (): boolean => {
        const errors: Record<string, string> = {};
        if (!formData.issue_slip_number.trim()) errors.issue_slip_number = 'Required';
        if (!formData.issue_date) errors.issue_date = 'Required';
        if (!formData.nac_code.trim()) errors.nac_code = 'Required';
        if (!formData.part_number.trim()) errors.part_number = 'Required';
        if (formData.issue_quantity <= 0) errors.issue_quantity = 'Must be greater than 0';
        if (!formData.issued_for.trim()) errors.issued_for = 'Required';
        if (!formData.issued_by.name.trim()) errors['issued_by.name'] = 'Required';
        if (!formData.issued_by.staffId.trim()) errors['issued_by.staffId'] = 'Required';
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleCreate = async () => {
        if (!validateForm()) return;
        try {
            setSubmitting(true);
            await API.post('/api/spare-issue-records', formData);
            showSuccessToast({
                title: 'Success',
                message: 'Spare issue record created successfully',
                duration: 3000,
            });
            setShowCreateModal(false);
            resetForm();
            fetchData();
        } catch {
            showErrorToast({
                title: 'Error',
                message: 'Failed to create spare issue record',
                duration: 3000,
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = async () => {
        if (!selectedRecord || !validateForm()) return;
        try {
            setSubmitting(true);
            await API.put(`/api/spare-issue-records/${selectedRecord.id}`, formData);
            let message = 'Spare issue record updated successfully';
            if (formData.issue_slip_number !== selectedRecord.issue_slip_number) {
                message += ' (Date auto-adjusted to match slip number)';
            } else if (formData.issue_date !== selectedRecord.issue_date.split('T')[0]) {
                message += ' (Slip number auto-generated for new date)';
            }
            showSuccessToast({ title: 'Success', message, duration: 4000 });
            setShowEditModal(false);
            setSelectedRecord(null);
            resetForm();
            fetchData();
        } catch {
            showErrorToast({
                title: 'Error',
                message: 'Failed to update spare issue record',
                duration: 3000,
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedRecord) return;
        try {
            setSubmitting(true);
            await API.delete(`/api/spare-issue-records/${selectedRecord.id}`);
            showSuccessToast({
                title: 'Success',
                message: 'Spare issue record deleted successfully (Stock balance updated)',
                duration: 3000,
            });
            setShowDeleteModal(false);
            setSelectedRecord(null);
            fetchData();
        } catch {
            showErrorToast({
                title: 'Error',
                message: 'Failed to delete spare issue record',
                duration: 3000,
            });
        } finally {
            setSubmitting(false);
        }
    };

    const openCreateModal = () => {
        resetForm();
        setShowCreateModal(true);
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
            approval_status: record.approval_status,
        });
        setFormErrors({});
        setShowEditModal(true);
    };

    const openDeleteModal = (record: SpareIssueRecord) => {
        setSelectedRecord(record);
        setShowDeleteModal(true);
    };

    if (!canAccess) return null;

    return (
        <RecordsPageShell
            title="Spare Issue Records"
            description="Manage spare parts issue slips and stock deductions"
            actions={
                <div className="flex flex-wrap items-center gap-2">
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
                            Add record
                        </button>
                    )}
                </div>
            }
            filters={
                <RecordsFilterPanel
                    fields={[
                        {
                            id: 'search',
                            label: 'Search',
                            element: (
                                <RecordsFilterInput
                                    id="search"
                                    value={searchTerm}
                                    onChange={(v) => {
                                        setPage(1);
                                        setSearchTerm(v);
                                    }}
                                    placeholder="Slip#, part#, item, equipment…"
                                />
                            ),
                            className: 'space-y-1.5 md:col-span-2 lg:col-span-3',
                        },
                        {
                            id: 'issueSlipNumber',
                            label: 'Issue slip number',
                            element: (
                                <RecordsFilterInput
                                    id="issueSlipNumber"
                                    value={issueSlipNumber}
                                    onChange={(v) => {
                                        setPage(1);
                                        setIssueSlipNumber(v);
                                    }}
                                    placeholder="Enter slip number"
                                />
                            ),
                        },
                        {
                            id: 'partNumber',
                            label: 'Part number',
                            element: (
                                <RecordsFilterInput
                                    id="partNumber"
                                    value={partNumber}
                                    onChange={(v) => {
                                        setPage(1);
                                        setPartNumber(v);
                                    }}
                                    placeholder="Enter part number"
                                />
                            ),
                        },
                        {
                            id: 'itemName',
                            label: 'Item name',
                            element: (
                                <RecordsFilterInput
                                    id="itemName"
                                    value={itemName}
                                    onChange={(v) => {
                                        setPage(1);
                                        setItemName(v);
                                    }}
                                    placeholder="Enter item name"
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
                                        setPage(1);
                                        setFiscalYearFilter(v);
                                    }}
                                />
                            ),
                        },
                        {
                            id: 'nacCode',
                            label: 'NAC code',
                            element: (
                                <RecordsFilterSelect
                                    id="nacCode"
                                    value={nacCode}
                                    onChange={(v) => {
                                        setPage(1);
                                        setNacCode(v);
                                    }}
                                    options={[
                                        { value: '', label: 'All NAC codes' },
                                        ...filterOptions.nacCodes.map((o) => ({
                                            value: o.nac_code,
                                            label: `${o.nac_code} — ${o.item_name}`,
                                        })),
                                    ]}
                                />
                            ),
                        },
                        {
                            id: 'issuedFor',
                            label: 'Issued for',
                            element: (
                                <RecordsFilterSelect
                                    id="issuedFor"
                                    value={issuedFor}
                                    onChange={(v) => {
                                        setPage(1);
                                        setIssuedFor(v);
                                    }}
                                    options={[
                                        { value: '', label: 'All equipment' },
                                        ...filterOptions.equipmentNumbers.map((eq) => ({
                                            value: eq,
                                            label: eq,
                                        })),
                                    ]}
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
                                        setPage(1);
                                        setStatus(v);
                                    }}
                                    options={[
                                        { value: 'all', label: 'All statuses' },
                                        ...filterOptions.approvalStatuses.map((s) => ({
                                            value: s,
                                            label: s,
                                        })),
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
                                    {SORTABLE_COLUMNS.slice(0, 3).map((col) => (
                                        <RecordsTableHeadCell key={col.key}>
                                            <button
                                                type="button"
                                                onClick={() => handleSort(col.key)}
                                                className="flex items-center gap-1 hover:text-white/90"
                                            >
                                                {col.label}
                                                {sortBy === col.key && (
                                                    <span className="text-xs">{sortOrder === 'ASC' ? '↑' : '↓'}</span>
                                                )}
                                            </button>
                                        </RecordsTableHeadCell>
                                    ))}
                                    <RecordsTableHeadCell>Item name</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Part number</RecordsTableHeadCell>
                                    {SORTABLE_COLUMNS.slice(3).map((col) => (
                                        <RecordsTableHeadCell key={col.key}>
                                            <button
                                                type="button"
                                                onClick={() => handleSort(col.key)}
                                                className="flex items-center gap-1 hover:text-white/90"
                                            >
                                                {col.label}
                                                {sortBy === col.key && (
                                                    <span className="text-xs">{sortOrder === 'ASC' ? '↑' : '↓'}</span>
                                                )}
                                            </button>
                                        </RecordsTableHeadCell>
                                    ))}
                                    <RecordsTableHeadCell>Equipment</RecordsTableHeadCell>
                                    {(canEdit || canDelete) && (
                                        <RecordsTableHeadCell>Actions</RecordsTableHeadCell>
                                    )}
                                </RecordsTableHeadRow>
                            </RecordsTableHead>
                            <RecordsTableBody>
                                {records.map((record) => (
                                    <RecordsTableRow key={record.id}>
                                        <RecordsTableCell className="font-medium">
                                            {record.issue_slip_number}
                                        </RecordsTableCell>
                                        <RecordsTableCell>{formatDate(record.issue_date)}</RecordsTableCell>
                                        <RecordsTableCell className="font-mono text-xs">
                                            {record.nac_code}
                                        </RecordsTableCell>
                                        <RecordsTableCell>{record.item_name}</RecordsTableCell>
                                        <RecordsTableCell className="font-mono text-xs">
                                            {record.part_number}
                                        </RecordsTableCell>
                                        <RecordsTableCell>{record.issue_quantity}</RecordsTableCell>
                                        <RecordsTableCell>{formatCurrency(record.issue_cost)}</RecordsTableCell>
                                        <RecordsTableCell>
                                            <RecordStatusBadge status={record.approval_status} />
                                        </RecordsTableCell>
                                        <RecordsTableCell>{record.issued_for}</RecordsTableCell>
                                        {(canEdit || canDelete) && (
                                            <RecordsTableCell>
                                                <div className="flex gap-1">
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
                                                    {canDelete && (
                                                        <button
                                                            type="button"
                                                            onClick={() => openDeleteModal(record)}
                                                            className={recordsTheme.iconBtnDanger}
                                                            title="Delete"
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

            {showCreateModal && (
                <RecordsModal
                    open={showCreateModal}
                    title="Create spare issue record"
                    description="Add a new spare parts issue with full details."
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
                    <SpareIssueRecordFormBody
                        formData={formData}
                        setFormData={setFormData}
                        errors={formErrors}
                        remainingBalanceReadOnly
                    />
                </RecordsModal>
            )}

            {showEditModal && selectedRecord && (
                <RecordsModal
                    open={showEditModal}
                    title="Edit spare issue record"
                    description={`Slip #${selectedRecord.issue_slip_number}`}
                    onClose={() => {
                        setShowEditModal(false);
                        setSelectedRecord(null);
                    }}
                    size="2xl"
                    submitting={submitting}
                    footer={
                        <RecordsModalActions
                            onCancel={() => {
                                setShowEditModal(false);
                                setSelectedRecord(null);
                            }}
                            onSubmit={handleEdit}
                            submitLabel="Save changes"
                            submitting={submitting}
                        />
                    }
                >
                    <SpareIssueRecordFormBody
                        formData={formData}
                        setFormData={setFormData}
                        errors={formErrors}
                        remainingBalanceReadOnly
                    />
                </RecordsModal>
            )}

            {showDeleteModal && selectedRecord && (
                <RecordsModal
                    open={showDeleteModal}
                    title="Delete spare issue record"
                    onClose={() => {
                        setShowDeleteModal(false);
                        setSelectedRecord(null);
                    }}
                    size="md"
                    submitting={submitting}
                    footer={
                        <RecordsModalActions
                            onCancel={() => {
                                setShowDeleteModal(false);
                                setSelectedRecord(null);
                            }}
                            onSubmit={handleDelete}
                            submitLabel="Delete"
                            submitting={submitting}
                            danger
                        />
                    }
                >
                    <p className="text-sm text-slate-600">
                        Delete spare issue slip <strong>{selectedRecord.issue_slip_number}</strong> for{' '}
                        <strong>{selectedRecord.item_name}</strong>? Stock balance will be restored.
                    </p>
                </RecordsModal>
            )}
        </RecordsPageShell>
    );
}
