'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { API } from '@/lib/api';
import { useAuthContext } from '@/context/AuthContext';
import { useCustomToast } from '@/components/ui/custom-toast';
import { RotateCcw } from 'lucide-react';
import {
    RecordsPageShell,
    RecordsFilterPanel,
    RecordsFilterInput,
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
    recordsTheme,
} from '@/components/records';

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
    const [filterFromDate, setFilterFromDate] = useState('');
    const [filterToDate, setFilterToDate] = useState('');

    const canView = permissions.includes('can_see_all_balance_transfers_records');
    const canRevert = permissions.includes('can_revert_balance_transfers');

    useEffect(() => {
        const fetchBalanceTransfers = async () => {
            try {
                setIsLoading(true);
                const response = await API.get('/api/balance-transfer/records');
                setRecords(response.data);
                setFilteredRecords(response.data);
            } catch {
                // ignore
            } finally {
                setIsLoading(false);
            }
        };
        if (canView) {
            fetchBalanceTransfers();
        }
    }, [canView]);

    useEffect(() => {
        let filtered = records;
        if (universalSearch) {
            const q = universalSearch.toLowerCase();
            filtered = filtered.filter(
                (record) =>
                    record.fromNacCode.toLowerCase().includes(q) ||
                    record.toNacCode.toLowerCase().includes(q) ||
                    record.itemName.toLowerCase().includes(q) ||
                    record.partNumber.toLowerCase().includes(q) ||
                    record.transferredBy.toLowerCase().includes(q)
            );
        }
        if (equipmentNumberSearch) {
            const q = equipmentNumberSearch.toLowerCase();
            filtered = filtered.filter(
                (record) =>
                    record.fromNacCode.toLowerCase().includes(q) ||
                    record.toNacCode.toLowerCase().includes(q)
            );
        }
        if (partNumberSearch) {
            filtered = filtered.filter((record) =>
                record.partNumber.toLowerCase().includes(partNumberSearch.toLowerCase())
            );
        }
        if (filterFromDate) {
            const fromBoundary = new Date(filterFromDate);
            fromBoundary.setHours(0, 0, 0, 0);
            filtered = filtered.filter((record) => new Date(record.transferDate) >= fromBoundary);
        }
        if (filterToDate) {
            const toBoundary = new Date(filterToDate);
            toBoundary.setHours(23, 59, 59, 999);
            filtered = filtered.filter((record) => new Date(record.transferDate) <= toBoundary);
        }
        setFilteredRecords(filtered);
        setCurrentPage(1);
    }, [records, universalSearch, equipmentNumberSearch, partNumberSearch, filterFromDate, filterToDate]);

    const totalPages = Math.ceil(filteredRecords.length / pageSize) || 1;
    const startIndex = (currentPage - 1) * pageSize;
    const currentRecords = filteredRecords.slice(startIndex, startIndex + pageSize);

    const handleRevert = async () => {
        if (!selectedRecord) return;
        setReverting(true);
        try {
            const response = await API.post(`/api/balance-transfer/revert/${selectedRecord.id}`);
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: 'Balance transfer reverted successfully',
                    duration: 3000,
                });
                setRecords((prev) => prev.filter((record) => record.id !== selectedRecord.id));
                setFilteredRecords((prev) => prev.filter((record) => record.id !== selectedRecord.id));
                setIsRevertModalOpen(false);
                setSelectedRecord(null);
            } else {
                throw new Error('Revert failed');
            }
        } catch {
            showErrorToast({
                title: 'Error',
                message: 'Failed to revert balance transfer. Please try again.',
                duration: 5000,
            });
        } finally {
            setReverting(false);
        }
    };

    const resetPage = () => setCurrentPage(1);

    if (!canView) {
        return (
            <RecordsPageShell
                title="Balance Transfer Records"
                description="View all balance transfers done to date"
                badge="Records"
            >
                <div className={`${recordsTheme.card} ${recordsTheme.cardPadding} text-center`}>
                    <p className="text-red-600 font-semibold">Access denied</p>
                    <p className="mt-1 text-sm text-slate-600">
                        You don&apos;t have permission to view balance transfer records.
                    </p>
                </div>
            </RecordsPageShell>
        );
    }

    return (
        <RecordsPageShell
            title="Balance Transfer Records"
            description="View all balance transfers done to date. Revert transfers when permitted."
            badge="Records"
            filters={
                <RecordsFilterPanel
                    fields={[
                        {
                            id: 'universal',
                            label: 'Universal search',
                            element: (
                                <RecordsFilterInput
                                    id="universal"
                                    value={universalSearch}
                                    onChange={(v) => {
                                        resetPage();
                                        setUniversalSearch(v);
                                    }}
                                    placeholder="NAC code, item, part, user…"
                                />
                            ),
                        },
                        {
                            id: 'equipment',
                            label: 'Equipment / NAC code',
                            element: (
                                <RecordsFilterInput
                                    id="equipment"
                                    value={equipmentNumberSearch}
                                    onChange={(v) => {
                                        resetPage();
                                        setEquipmentNumberSearch(v);
                                    }}
                                    placeholder="From or to NAC code"
                                />
                            ),
                        },
                        {
                            id: 'part',
                            label: 'Part number',
                            element: (
                                <RecordsFilterInput
                                    id="part"
                                    value={partNumberSearch}
                                    onChange={(v) => {
                                        resetPage();
                                        setPartNumberSearch(v);
                                    }}
                                    placeholder="Part number"
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
                                    value={filterFromDate}
                                    onChange={(e) => {
                                        resetPage();
                                        setFilterFromDate(e.target.value);
                                    }}
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
                                    value={filterToDate}
                                    onChange={(e) => {
                                        resetPage();
                                        setFilterToDate(e.target.value);
                                    }}
                                    className={recordsTheme.input}
                                />
                            ),
                        },
                    ]}
                />
            }
        >
            <RecordsTable
                loading={isLoading}
                emptyMessage={filteredRecords.length === 0 ? 'No balance transfer records found' : undefined}
            >
                {currentRecords.length > 0 && (
                    <RecordsTableScroll>
                        <RecordsTableElement>
                            <RecordsTableHead>
                                <RecordsTableHeadRow>
                                    <RecordsTableHeadCell>Date</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>From code</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>To code</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Item</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Part number</RecordsTableHeadCell>
                                    <RecordsTableHeadCell className="text-center">Quantity</RecordsTableHeadCell>
                                    <RecordsTableHeadCell className="text-center">Amount (NPR)</RecordsTableHeadCell>
                                    <RecordsTableHeadCell>Transferred by</RecordsTableHeadCell>
                                    {canRevert && <RecordsTableHeadCell className="text-center">Actions</RecordsTableHeadCell>}
                                </RecordsTableHeadRow>
                            </RecordsTableHead>
                            <RecordsTableBody>
                                {currentRecords.map((record) => (
                                    <RecordsTableRow key={record.id}>
                                        <RecordsTableCell>
                                            {format(new Date(record.transferDate), 'dd/MM/yyyy')}
                                        </RecordsTableCell>
                                        <RecordsTableCell>
                                            <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                                                {record.fromNacCode}
                                            </span>
                                        </RecordsTableCell>
                                        <RecordsTableCell>
                                            <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                                                {record.toNacCode}
                                            </span>
                                        </RecordsTableCell>
                                        <RecordsTableCell className="max-w-xs whitespace-normal">
                                            {record.itemName || 'N/A'}
                                        </RecordsTableCell>
                                        <RecordsTableCell>{record.partNumber || 'N/A'}</RecordsTableCell>
                                        <RecordsTableCell className="text-center font-medium text-[#003594]">
                                            {record.transferQuantity}
                                        </RecordsTableCell>
                                        <RecordsTableCell className="text-center font-medium text-[#d2293b]">
                                            NPR {record.transferAmount.toLocaleString()}
                                        </RecordsTableCell>
                                        <RecordsTableCell>{record.transferredBy}</RecordsTableCell>
                                        {canRevert && (
                                            <RecordsTableCell className="text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedRecord(record);
                                                        setIsRevertModalOpen(true);
                                                    }}
                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                                                >
                                                    <RotateCcw className="h-3.5 w-3.5" />
                                                    Revert
                                                </button>
                                            </RecordsTableCell>
                                        )}
                                    </RecordsTableRow>
                                ))}
                            </RecordsTableBody>
                        </RecordsTableElement>
                    </RecordsTableScroll>
                )}
            </RecordsTable>

            {filteredRecords.length > 0 && (
                <RecordsPagination
                    page={currentPage}
                    pageSize={pageSize}
                    totalCount={filteredRecords.length}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={(size) => {
                        setCurrentPage(1);
                        setPageSize(size);
                    }}
                />
            )}

            <RecordsModal
                open={isRevertModalOpen && !!selectedRecord}
                title="Confirm revert"
                description="This action cannot be undone. All records related to this balance transfer will be deleted."
                onClose={() => {
                    setIsRevertModalOpen(false);
                    setSelectedRecord(null);
                }}
                size="md"
                submitting={reverting}
                footer={
                    <RecordsModalActions
                        onCancel={() => {
                            setIsRevertModalOpen(false);
                            setSelectedRecord(null);
                        }}
                        onSubmit={handleRevert}
                        submitLabel="Revert transfer"
                        submitting={reverting}
                        danger
                    />
                }
            >
                {selectedRecord && (
                    <div className="space-y-4">
                        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                            <p className="font-medium mb-2">Balance transfer details</p>
                            <ul className="space-y-1">
                                <li>
                                    <strong>Date:</strong> {format(new Date(selectedRecord.transferDate), 'dd/MM/yyyy')}
                                </li>
                                <li>
                                    <strong>From:</strong> {selectedRecord.fromNacCode}
                                </li>
                                <li>
                                    <strong>To:</strong> {selectedRecord.toNacCode}
                                </li>
                                <li>
                                    <strong>Quantity:</strong> {selectedRecord.transferQuantity}
                                </li>
                                <li>
                                    <strong>Amount:</strong> NPR {selectedRecord.transferAmount.toLocaleString()}
                                </li>
                            </ul>
                        </div>
                        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                            <strong>Warning:</strong> This will delete all related records and revert stock balances.
                        </p>
                    </div>
                )}
            </RecordsModal>
        </RecordsPageShell>
    );
}
