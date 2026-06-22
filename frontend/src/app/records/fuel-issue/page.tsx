'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Edit, Gauge, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { FiscalYearFilterSelect } from '@/components/fiscal-year/FiscalYearFilterSelect';
import { useFiscalYear } from '@/hooks/useFiscalYear';
import { useAuthContext } from '@/context/AuthContext';
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
    FuelIssueRecordFormBody,
    type FuelIssueFormData,
} from '@/components/records/forms/FuelIssueRecordFormBody';

interface FuelIssueRecord {
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
    issued_by: { name: string; staffId: string };
    approval_status: string;
    fuel_type: string;
    fuel_price: number;
    kilometers: number;
    is_kilometer_reset: boolean;
    week_number: number;
    fy: string;
}

interface FuelIssueFilters {
    search: string;
    fromDate: string;
    toDate: string;
    fuelType: string;
    weekNumber: string;
    equipmentNumber: string;
    issueSlipNumber: string;
    fiscalYear: string;
}

const EMPTY_FORM: FuelIssueFormData = {
    issue_slip_number: '',
    issue_date: '',
    nac_code: '',
    part_number: '',
    issue_quantity: 0,
    issued_for: '',
    issued_by: { name: '', staffId: '' },
    fuel_type: '',
    fuel_price: 0,
    kilometers: 0,
    is_kilometer_reset: false,
    approval_status: 'PENDING',
};

function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString();
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'NPR',
        maximumFractionDigits: 2,
    }).format(amount);
}

export default function FuelIssueRecordsPage() {
    const { user } = useAuthContext();
    const { canAccess, permissions } = useRecordsPageAuth('can_access_fuel_issue_records');
    const canCreate = permissions.includes('can_add_fuel_issue_item');
    const canEdit = permissions.includes('can_edit_fuel_issue_item');
    const canDelete = permissions.includes('can_delete_fuel_issue_item');
    const isSuperAdmin = user?.UserInfo?.role?.toLowerCase() === 'superadmin';

    const { showSuccessToast, showErrorToast } = useCustomToast();
    const latestRequestRef = useRef(0);
    const { fiscalYear: currentFiscalYear } = useFiscalYear();

    const [records, setRecords] = useState<FuelIssueRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [totalPages, setTotalPages] = useState(0);
    const [totalCount, setTotalCount] = useState(0);
    const [sortBy] = useState('issue_date');
    const [sortOrder] = useState<'ASC' | 'DESC'>('DESC');

    const [search, setSearch] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [fuelType, setFuelType] = useState('');
    const [weekNumber, setWeekNumber] = useState('');
    const [equipmentNumber, setEquipmentNumber] = useState('');
    const [issueSlipNumber, setIssueSlipNumber] = useState('');
    const [fiscalYearFilter, setFiscalYearFilter] = useState('');

    const [appliedFilters, setAppliedFilters] = useState<FuelIssueFilters>({
        search: '',
        fromDate: '',
        toDate: '',
        fuelType: '',
        weekNumber: '',
        equipmentNumber: '',
        issueSlipNumber: '',
        fiscalYear: '',
    });

    const [fuelTypes, setFuelTypes] = useState<string[]>([]);
    const [nacCodes, setNacCodes] = useState<string[]>([]);

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [editingRecord, setEditingRecord] = useState<FuelIssueRecord | null>(null);
    const [deletingRecord, setDeletingRecord] = useState<FuelIssueRecord | null>(null);
    const [formData, setFormData] = useState<FuelIssueFormData>(EMPTY_FORM);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [showRebuildModal, setShowRebuildModal] = useState(false);
    const [rebuildingAverages, setRebuildingAverages] = useState(false);

    useEffect(() => {
        if (currentFiscalYear && !fiscalYearFilter) {
            setFiscalYearFilter(currentFiscalYear);
            setAppliedFilters((prev) => ({ ...prev, fiscalYear: currentFiscalYear }));
        }
    }, [currentFiscalYear, fiscalYearFilter]);

    const applyFilters = () => {
        setPage(1);
        setAppliedFilters({
            search,
            fromDate,
            toDate,
            fuelType,
            weekNumber,
            equipmentNumber,
            issueSlipNumber,
            fiscalYear: fiscalYearFilter,
        });
    };

    const clearFilters = () => {
        const fy = currentFiscalYear || '';
        setSearch('');
        setFromDate('');
        setToDate('');
        setFuelType('');
        setWeekNumber('');
        setEquipmentNumber('');
        setIssueSlipNumber('');
        setFiscalYearFilter(fy);
        setPage(1);
        setAppliedFilters({
            search: '',
            fromDate: '',
            toDate: '',
            fuelType: '',
            weekNumber: '',
            equipmentNumber: '',
            issueSlipNumber: '',
            fiscalYear: fy,
        });
    };

    const fetchData = useCallback(async () => {
        const requestId = latestRequestRef.current + 1;
        latestRequestRef.current = requestId;
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                page: String(page),
                limit: String(pageSize),
                sortBy,
                sortOrder,
                search: appliedFilters.search,
                fromDate: appliedFilters.fromDate,
                toDate: appliedFilters.toDate,
                fuelType: appliedFilters.fuelType,
                weekNumber: appliedFilters.weekNumber,
                equipmentNumber: appliedFilters.equipmentNumber,
                issueSlipNumber: appliedFilters.issueSlipNumber,
                ...(appliedFilters.fiscalYear && { fiscalYear: appliedFilters.fiscalYear }),
            });
            const { data } = await API.get(`/api/fuel-issue-records?${params.toString()}`);
            if (requestId !== latestRequestRef.current) return;

            setRecords(data.records || []);
            setTotalCount(data.pagination?.total ?? 0);
            setTotalPages(data.pagination?.totalPages ?? 0);
        } catch {
            if (requestId !== latestRequestRef.current) return;
            setError('Failed to fetch fuel issue records');
            showErrorToast({ title: 'Error', message: 'Failed to fetch fuel issue records' });
        } finally {
            if (requestId === latestRequestRef.current) {
                setLoading(false);
            }
        }
    }, [page, pageSize, sortBy, sortOrder, appliedFilters, showErrorToast]);

    const fetchFilterOptions = useCallback(async () => {
        try {
            const [{ data: fuelData }, { data: nacData }] = await Promise.all([
                API.get('/api/fuel-issue-records/filters/fuel-types'),
                API.get('/api/fuel-issue-records/filters/nac-codes'),
            ]);
            setFuelTypes(fuelData.fuelTypes || []);
            setNacCodes(nacData.nacCodes || []);
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

    const validateForm = (isEdit: boolean): boolean => {
        const errors: Record<string, string> = {};
        if (!formData.issue_date) errors.issue_date = 'Required';
        if (!formData.nac_code.trim()) errors.nac_code = 'Required';
        if (!formData.fuel_type.trim()) errors.fuel_type = 'Required';
        if (formData.issue_quantity <= 0) errors.issue_quantity = 'Must be greater than 0';
        if (formData.fuel_price < 0) errors.fuel_price = 'Invalid price';
        if (formData.kilometers < 0) errors.kilometers = 'Invalid kilometers';
        if (!formData.issued_for.trim()) errors.issued_for = 'Required';
        if (!isEdit) {
            if (!formData.issued_by.name.trim()) errors['issued_by.name'] = 'Required';
            if (!formData.issued_by.staffId.trim()) errors['issued_by.staffId'] = 'Required';
        }
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const buildSubmitPayload = () => {
        const payload = { ...formData };
        delete (payload as Partial<typeof formData>).approval_status;
        delete (payload as Partial<typeof formData>).issue_slip_number;
        return payload;
    };

    const handleCreate = async () => {
        if (!canCreate) {
            showErrorToast({ title: 'Error', message: 'You do not have permission to add fuel issue items' });
            return;
        }
        if (!validateForm(false)) return;
        try {
            setSubmitting(true);
            await API.post('/api/fuel-issue-records', buildSubmitPayload());
            showSuccessToast({ title: 'Success', message: 'Fuel issue record created successfully' });
            setShowCreateModal(false);
            resetForm();
            fetchData();
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : 'Failed to create fuel issue record';
            showErrorToast({ title: 'Error', message });
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = async () => {
        if (!canEdit) {
            showErrorToast({ title: 'Error', message: 'You do not have permission to edit fuel issue items' });
            return;
        }
        if (!editingRecord || !validateForm(true)) return;
        try {
            setSubmitting(true);
            await API.put(`/api/fuel-issue-records/${editingRecord.id}`, buildSubmitPayload());
            showSuccessToast({ title: 'Success', message: 'Fuel issue record updated successfully' });
            setShowEditModal(false);
            setEditingRecord(null);
            resetForm();
            fetchData();
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : 'Failed to update fuel issue record';
            showErrorToast({ title: 'Error', message });
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!canDelete) {
            showErrorToast({ title: 'Error', message: 'You do not have permission to delete fuel issue items' });
            return;
        }
        if (!deletingRecord) return;
        try {
            setSubmitting(true);
            await API.delete(`/api/fuel-issue-records/${deletingRecord.id}`);
            showSuccessToast({ title: 'Success', message: 'Fuel issue record deleted successfully' });
            setShowDeleteModal(false);
            setDeletingRecord(null);
            fetchData();
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : 'Failed to delete fuel issue record';
            showErrorToast({ title: 'Error', message });
        } finally {
            setSubmitting(false);
        }
    };

    const handleRebuildConsumptionAverages = async () => {
        setRebuildingAverages(true);
        try {
            const { data } = await API.post('/api/fuel-issue-records/rebuild-consumption-averages');
            showSuccessToast({
                title: 'Consumption averages rebuilt',
                message:
                    `${data.equipmentFamilies ?? 0} equipment families processed. ` +
                    `${data.withEnoughHistory ?? 0} have enough history for comparison ` +
                    `(${data.totalApprovedIssues ?? 0} approved fuel issues scanned).`,
                duration: 12000,
            });
            setShowRebuildModal(false);
        } catch (err: unknown) {
            const message =
                err && typeof err === 'object' && 'response' in err
                    ? String(
                          (err as { response?: { data?: { message?: string } } }).response?.data?.message
                          || 'Failed to rebuild consumption averages'
                      )
                    : 'Failed to rebuild consumption averages';
            showErrorToast({ title: 'Rebuild failed', message, duration: 6000 });
        } finally {
            setRebuildingAverages(false);
        }
    };

    const openCreateModal = () => {
        resetForm();
        setFormData({
            ...EMPTY_FORM,
            issue_date: new Date().toISOString().split('T')[0],
            issued_by: {
                name: user?.UserInfo?.name || '',
                staffId: user?.UserInfo?.username || '',
            },
        });
        setShowCreateModal(true);
    };

    const openEditModal = (record: FuelIssueRecord) => {
        setEditingRecord(record);
        const normalizedDate = record.issue_date.includes('T')
            ? record.issue_date.split('T')[0]
            : record.issue_date;
        setFormData({
            issue_slip_number: record.issue_slip_number,
            issue_date: normalizedDate,
            nac_code: record.nac_code,
            part_number: record.part_number,
            issue_quantity: record.issue_quantity,
            issued_for: record.issued_for,
            issued_by: record.issued_by,
            fuel_type: record.fuel_type,
            fuel_price: record.fuel_price,
            kilometers: record.kilometers,
            is_kilometer_reset: record.is_kilometer_reset,
            approval_status: record.approval_status,
        });
        setFormErrors({});
        setShowEditModal(true);
    };

    if (!canAccess) return null;

    return (
        <RecordsPageShell
            title="Fuel Issue Records"
            description="Manage diesel and petrol issue records"
            actions={
                <div className="flex flex-wrap items-center gap-2">
                    {isSuperAdmin && (
                        <button
                            type="button"
                            onClick={() => setShowRebuildModal(true)}
                            disabled={rebuildingAverages}
                            className={`${recordsTheme.outlineBtn} border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100`}
                        >
                            <Gauge className="h-4 w-4" />
                            Rebuild fuel averages
                        </button>
                    )}
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
                            Add fuel issue
                        </button>
                    )}
                </div>
            }
            filters={
                <div className="space-y-4">
                    <RecordsFilterPanel
                        fields={[
                            {
                                id: 'search',
                                label: 'Search',
                                element: (
                                    <RecordsFilterInput
                                        id="search"
                                        value={search}
                                        onChange={setSearch}
                                        placeholder="Search all fields…"
                                    />
                                ),
                                className: 'space-y-1.5 md:col-span-2 lg:col-span-3',
                            },
                            {
                                id: 'fiscalYear',
                                label: 'Fiscal year',
                                element: (
                                    <FiscalYearFilterSelect
                                        value={fiscalYearFilter}
                                        onChange={setFiscalYearFilter}
                                    />
                                ),
                            },
                            {
                                id: 'fromDate',
                                label: 'From date',
                                element: (
                                    <input
                                        id="fromDate"
                                        type="date"
                                        value={fromDate}
                                        onChange={(e) => setFromDate(e.target.value)}
                                        className={recordsTheme.input}
                                    />
                                ),
                            },
                            {
                                id: 'toDate',
                                label: 'To date',
                                element: (
                                    <input
                                        id="toDate"
                                        type="date"
                                        value={toDate}
                                        onChange={(e) => setToDate(e.target.value)}
                                        className={recordsTheme.input}
                                    />
                                ),
                            },
                            {
                                id: 'fuelType',
                                label: 'Fuel type',
                                element: (
                                    <RecordsFilterSelect
                                        id="fuelType"
                                        value={fuelType}
                                        onChange={setFuelType}
                                        options={[
                                            { value: '', label: 'All fuel types' },
                                            ...fuelTypes.map((t) => ({ value: t, label: t })),
                                        ]}
                                    />
                                ),
                            },
                            {
                                id: 'weekNumber',
                                label: 'Week number',
                                element: (
                                    <RecordsFilterInput
                                        id="weekNumber"
                                        value={weekNumber}
                                        onChange={setWeekNumber}
                                        placeholder="e.g. 12"
                                    />
                                ),
                            },
                            {
                                id: 'equipmentNumber',
                                label: 'Equipment number',
                                element: (
                                    <RecordsFilterInput
                                        id="equipmentNumber"
                                        value={equipmentNumber}
                                        onChange={setEquipmentNumber}
                                        placeholder="e.g. EXC-01"
                                    />
                                ),
                            },
                            {
                                id: 'issueSlipNumber',
                                label: 'Issue slip number',
                                element: (
                                    <RecordsFilterInput
                                        id="issueSlipNumber"
                                        value={issueSlipNumber}
                                        onChange={setIssueSlipNumber}
                                        placeholder="e.g. 2079-12-123"
                                    />
                                ),
                            },
                        ]}
                    />
                    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
                        <button type="button" onClick={applyFilters} className={recordsTheme.primaryBtn}>
                            Apply filters
                        </button>
                        <button type="button" onClick={clearFilters} className={recordsTheme.outlineBtn}>
                            Clear all
                        </button>
                    </div>
                </div>
            }
        >
            <RecordsTable loading={loading} error={error}>
                {records.length > 0 && (
                    <RecordsTableScroll>
                        <RecordsTableElement>
                            <RecordsTableHead>
                                <RecordsTableHeadRow>
                                    <RecordsTableHeadCell>Issue date</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Issue slip</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>NAC code</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Item name</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Fuel type</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Quantity</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Price</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Kilometers</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Issued for</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Status</RecordsTableHeadCell>
                                    {(canEdit || canDelete) && (
                                        <RecordsTableHeadCell>Actions</RecordsTableHeadCell>
                                    )}
                                </RecordsTableHeadRow>
                            </RecordsTableHead>
                            <RecordsTableBody>
                                {records.map((record) => (
                                    <RecordsTableRow key={record.id}>
                                        <RecordsTableCell>{formatDate(record.issue_date)}</RecordsTableCell>
                                        <RecordsTableCell className="font-medium">
                                            {record.issue_slip_number}
                                        </RecordsTableCell>
                                        <RecordsTableCell className="font-mono text-xs">
                                            {record.nac_code}
                                        </RecordsTableCell>
                                        <RecordsTableCell>{record.item_name}</RecordsTableCell>
                                        <RecordsTableCell>
                                            <span
                                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                                    record.fuel_type === 'Diesel'
                                                        ? 'bg-blue-50 text-blue-800'
                                                        : 'bg-emerald-50 text-emerald-800'
                                                }`}
                                            >
                                                {record.fuel_type}
                                            </span>
                                        </RecordsTableCell>
                                        <RecordsTableCell>{record.issue_quantity}L</RecordsTableCell>
                                        <RecordsTableCell>{formatCurrency(record.fuel_price)}</RecordsTableCell>
                                        <RecordsTableCell>
                                            {record.kilometers.toLocaleString()} km
                                        </RecordsTableCell>
                                        <RecordsTableCell>{record.issued_for}</RecordsTableCell>
                                        <RecordsTableCell>
                                            <RecordStatusBadge status={record.approval_status} />
                                        </RecordsTableCell>
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
                                                            onClick={() => {
                                                                setDeletingRecord(record);
                                                                setShowDeleteModal(true);
                                                            }}
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
                    title="Add fuel issue record"
                    description="Create a new fuel issue entry."
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
                    <FuelIssueRecordFormBody
                        formData={formData}
                        setFormData={setFormData}
                        errors={formErrors}
                        nacCodes={nacCodes}
                        fuelTypes={fuelTypes}
                    />
                </RecordsModal>
            )}

            {showEditModal && editingRecord && (
                <RecordsModal
                    open={showEditModal}
                    title="Edit fuel issue record"
                    description="Date changes will auto-adjust the slip number."
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
                            onSubmit={handleEdit}
                            submitLabel="Save changes"
                            submitting={submitting}
                        />
                    }
                >
                    <FuelIssueRecordFormBody
                        formData={formData}
                        setFormData={setFormData}
                        errors={formErrors}
                        nacCodes={nacCodes}
                        fuelTypes={fuelTypes}
                        itemName={editingRecord.item_name}
                        isEdit
                    />
                </RecordsModal>
            )}

            {showDeleteModal && deletingRecord && (
                <RecordsModal
                    open={showDeleteModal}
                    title="Delete fuel issue record"
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
                        Delete fuel issue for <strong>{deletingRecord.issued_for}</strong> on{' '}
                        <strong>{formatDate(deletingRecord.issue_date)}</strong>? This cannot be undone.
                    </p>
                </RecordsModal>
            )}

            {showRebuildModal && (
                <RecordsModal
                    open={showRebuildModal}
                    title="Rebuild fuel consumption averages"
                    onClose={() => !rebuildingAverages && setShowRebuildModal(false)}
                    size="md"
                    submitting={rebuildingAverages}
                    footer={
                        <RecordsModalActions
                            onCancel={() => setShowRebuildModal(false)}
                            onSubmit={handleRebuildConsumptionAverages}
                            submitLabel="Rebuild averages"
                            submitting={rebuildingAverages}
                        />
                    }
                >
                    <p className="text-sm text-slate-600">
                        Recalculate average fuel consumption history for every equipment family
                        (including variants like 344, 344T, and 344T14) using all approved fuel
                        issue records. This merges historical trips in chronological order and
                        refreshes the consumption cache used during fuel issuance.
                    </p>
                </RecordsModal>
            )}
        </RecordsPageShell>
    );
}
