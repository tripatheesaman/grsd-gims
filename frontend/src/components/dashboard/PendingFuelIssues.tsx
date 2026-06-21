'use client';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/context/AuthContext';
import { API } from '@/lib/api';
import { usePendingFuelIssuesQuery } from '@/hooks/api/usePendingApprovals';
import { invalidatePendingApprovals } from '@/lib/invalidatePendingApprovals';
import { isAxiosError } from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Fuel, Edit, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModalDescription, ModalTitle } from '@/components/ui/modal';
import { useCustomToast } from '@/components/ui/custom-toast';
import {
    ApprovalListModal,
    ApprovalListCard,
    ApprovalDetailModal,
    ApprovalActionBar,
    ApprovalMetaGrid,
    ApprovalConfirmModal,
    ApprovalAlertBanner,
    ApprovalResponsiveTable,
    ApprovalModalShell,
    ApprovalModalBody,
    ApprovalModalHeaderSection,
    formatApprovalDate,
    approvalTheme,
    type ApprovalTableColumn,
    personDetailsMetaBlock,
} from '@/components/approvals';
import type { FuelConsumptionAnalysis } from '@/types/fuel';
import type { PersonDetails } from '@/types/personDetails';

interface PendingFuelIssue {
    id: number;
    nac_code: string;
    issue_date: string;
    issue_quantity: number;
    issue_cost: number;
    remaining_balance: number;
    issue_slip_number: string;
    issued_by: PersonDetails;
    issued_for: string;
    fuel_type?: string;
    fuel_rate?: number | string;
    previous_kilometers?: number | string;
    kilometers?: number | string;
    previous_issue_date?: string | null;
    consumption?: FuelConsumptionAnalysis | null;
    has_consumption_warning?: boolean;
    items?: PendingFuelIssue[];
}

function groupFuelIssues(issues: PendingFuelIssue[]): PendingFuelIssue[] {
    const groupedIssues = issues.reduce((acc: Record<string, PendingFuelIssue[]>, curr) => {
        if (!acc[curr.issue_slip_number]) {
            acc[curr.issue_slip_number] = [];
        }
        acc[curr.issue_slip_number].push(curr);
        return acc;
    }, {});
    return Object.values(groupedIssues).map((items) => ({
        ...items[0],
        items,
        has_consumption_warning: items.some((item) => item.consumption?.exceedsAverage),
    }));
}

function getFuelType(item: PendingFuelIssue): string {
    return item.fuel_type || (item.nac_code === 'GT 07986' ? 'Diesel' : 'Petrol');
}

function sortFuelIssueItems(items: PendingFuelIssue[]): PendingFuelIssue[] {
    return items.slice().sort((a, b) => {
        const balanceA =
            typeof a.remaining_balance === 'number'
                ? a.remaining_balance
                : typeof a.remaining_balance === 'string' && !isNaN(Number(a.remaining_balance))
                  ? Number(a.remaining_balance)
                  : -Infinity;
        const balanceB =
            typeof b.remaining_balance === 'number'
                ? b.remaining_balance
                : typeof b.remaining_balance === 'string' && !isNaN(Number(b.remaining_balance))
                  ? Number(b.remaining_balance)
                  : -Infinity;
        return balanceB - balanceA;
    });
}

const fuelIssueTableColumns: ApprovalTableColumn<PendingFuelIssue>[] = [
    {
        id: 'fuel_type',
        header: 'Fuel Type',
        mobileLabel: 'Fuel type',
        cell: (item) => getFuelType(item),
    },
    {
        id: 'fuel_rate',
        header: 'Fuel Rate',
        cell: (item) =>
            `NPR ${
                typeof item.fuel_rate === 'number'
                    ? item.fuel_rate.toFixed(2)
                    : typeof item.fuel_rate === 'string' && !isNaN(Number(item.fuel_rate))
                      ? Number(item.fuel_rate).toFixed(2)
                      : 'N/A'
            }`,
    },
    {
        id: 'previous_km',
        header: 'Previous KM',
        cell: (item) =>
            typeof item.previous_kilometers === 'number'
                ? item.previous_kilometers
                : typeof item.previous_kilometers === 'string' && !isNaN(Number(item.previous_kilometers))
                  ? Number(item.previous_kilometers)
                  : 'N/A',
    },
    {
        id: 'current_km',
        header: 'Current KM',
        cell: (item) =>
            typeof item.kilometers === 'number'
                ? item.kilometers
                : typeof item.kilometers === 'string' && !isNaN(Number(item.kilometers))
                  ? Number(item.kilometers)
                  : 'N/A',
    },
    {
        id: 'distance',
        header: 'Distance',
        cell: (item) =>
            item.consumption?.kmDelta != null ? `${item.consumption.kmDelta.toLocaleString()} km` : '—',
    },
    {
        id: 'consumption',
        header: 'Consumption',
        cell: (item) =>
            item.consumption?.exceedsAverage ? (
                <div className="space-y-1">
                    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[10px]">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Above average
                    </Badge>
                    <p className="text-xs text-amber-800">
                        {item.consumption.kmDelta.toLocaleString()} km vs{' '}
                        {item.consumption.expectedKmForQuantity.toFixed(1)} km expected
                    </p>
                </div>
            ) : item.consumption?.hasEnoughHistory ? (
                <span className="text-xs text-emerald-700">
                    Within avg ({item.consumption.avgKmPerLiter.toFixed(2)} km/L)
                </span>
            ) : (
                <span className="text-xs text-gray-400">Insufficient history</span>
            ),
    },
    {
        id: 'quantity',
        header: 'Quantity',
        cell: (item) => item.issue_quantity,
    },
    {
        id: 'total_cost',
        header: 'Total Cost',
        cell: (item) => {
            const rate =
                typeof item.fuel_rate === 'number'
                    ? item.fuel_rate
                    : typeof item.fuel_rate === 'string' && !isNaN(Number(item.fuel_rate))
                      ? Number(item.fuel_rate)
                      : 0;
            const qty =
                typeof item.issue_quantity === 'number'
                    ? item.issue_quantity
                    : typeof item.issue_quantity === 'string' && !isNaN(Number(item.issue_quantity))
                      ? Number(item.issue_quantity)
                      : 0;
            return `NPR ${rate > 0 && qty > 0 ? (rate * qty).toFixed(2) : 'N/A'}`;
        },
    },
    {
        id: 'remaining_balance',
        header: 'Remaining Balance',
        mobileLabel: 'Balance',
        cell: (item) =>
            typeof item.remaining_balance === 'number'
                ? item.remaining_balance
                : typeof item.remaining_balance === 'string' && !isNaN(Number(item.remaining_balance))
                  ? Number(item.remaining_balance)
                  : 'N/A',
    },
    {
        id: 'issued_for',
        header: 'Issued For',
        cell: (item) => (
            <span className="max-w-[150px] truncate block" title={item.issued_for}>
                {item.issued_for}
            </span>
        ),
    },
    {
        id: 'nac_code',
        header: 'NAC Code',
        cell: (item) => (
            <span className="max-w-[120px] truncate block" title={item.nac_code}>
                {item.nac_code}
            </span>
        ),
    },
    {
        id: 'previous_issue_date',
        header: 'Previous Issue Date',
        mobileLabel: 'Prev. issue',
        cell: (item) => formatApprovalDate(item.previous_issue_date),
    },
];

export function PendingFuelIssues() {
    const queryClient = useQueryClient();
    const { permissions, user } = useAuthContext();
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isRejectOpen, setIsRejectOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [selectedIssue, setSelectedIssue] = useState<PendingFuelIssue | null>(null);
    const [isApproving, setIsApproving] = useState(false);
    const [isRejecting, setIsRejecting] = useState(false);
    const isProcessing = isApproving || isRejecting;
    const [editingItem, setEditingItem] = useState<PendingFuelIssue | null>(null);
    const [editFormData, setEditFormData] = useState({
        fuel_rate: '',
        quantity: '',
        kilometers: '',
    });
    const shouldPoll = !isDetailsOpen && !isEditOpen && !isRejectOpen && !isDeleteOpen;
    const { data: pendingRes, isLoading } = usePendingFuelIssuesQuery(
        Boolean(permissions?.includes('can_approve_issues') && shouldPoll)
    );
    const pendingFuelIssues = useMemo(() => {
        const issues = (pendingRes?.data as { issues?: PendingFuelIssue[] } | undefined)?.issues;
        if (!issues) return [];
        return groupFuelIssues(issues);
    }, [pendingRes?.data]);
    const pendingCount = pendingFuelIssues.length;
    const sortedDetailItems = useMemo(
        () => (selectedIssue?.items ? sortFuelIssueItems(selectedIssue.items) : []),
        [selectedIssue?.items]
    );

    const refreshPendingFuelIssues = () => {
        void invalidatePendingApprovals(queryClient, ['fuel', 'issue']);
    };

    const handleViewDetails = async (issueSlipNumber: string) => {
        const issue = pendingFuelIssues.find((issue) => issue.issue_slip_number === issueSlipNumber);
        if (issue) {
            setSelectedIssue(issue);
            setIsDetailsOpen(true);
        }
    };

    const handleApproveIssue = async () => {
        if (!selectedIssue?.items || isProcessing) return;
        setIsApproving(true);
        try {
            const itemIds = selectedIssue.items.map((item) => item.id);
            const response = await API.put(`/api/issue/approve`, {
                itemIds,
                approvedBy: user?.UserInfo?.username,
            });
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: 'Fuel issue approved successfully',
                    duration: 3000,
                });
                setIsDetailsOpen(false);
                refreshPendingFuelIssues();
            } else {
                throw new Error(response.data?.message || 'Failed to approve fuel issue');
            }
        } catch (error) {
            if (isAxiosError(error) && error.response?.status === 409) {
                setIsDetailsOpen(false);
                refreshPendingFuelIssues();
                showSuccessToast({
                    title: 'Already processed',
                    message: 'This fuel issue was already approved.',
                    duration: 3000,
                });
                return;
            }
            showErrorToast({
                title: 'Error',
                message: error instanceof Error ? error.message : 'Failed to approve fuel issue',
                duration: 5000,
            });
        } finally {
            setIsApproving(false);
        }
    };

    const handleRejectClick = () => {
        setIsRejectOpen(true);
    };

    const handleRejectIssue = async () => {
        if (!selectedIssue?.items || isProcessing) return;
        setIsRejecting(true);
        try {
            const itemIds = selectedIssue.items.map((item) => item.id);
            const response = await API.put(`/api/issue/reject`, {
                itemIds,
                rejectedBy: user?.UserInfo?.username,
            });
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: 'Fuel issue rejected successfully',
                    duration: 3000,
                });
                setIsDetailsOpen(false);
                setIsRejectOpen(false);
                refreshPendingFuelIssues();
            } else {
                throw new Error(response.data?.message || 'Failed to reject fuel issue');
            }
        } catch (error) {
            showErrorToast({
                title: 'Error',
                message: error instanceof Error ? error.message : 'Failed to reject fuel issue',
                duration: 5000,
            });
        } finally {
            setIsRejecting(false);
        }
    };

    const handleEditClick = (item: PendingFuelIssue) => {
        setEditingItem(item);
        setEditFormData({
            fuel_rate: item.fuel_rate?.toString() || '',
            quantity: item.issue_quantity?.toString() || '',
            kilometers: item.kilometers?.toString() || '',
        });
        setIsEditOpen(true);
    };

    const handleEditSubmit = async () => {
        if (!editingItem) return;
        try {
            const response = await API.put(`/api/issue/item/${editingItem.id}`, {
                fuel_rate: Number(editFormData.fuel_rate),
                quantity: Number(editFormData.quantity),
                kilometers: Number(editFormData.kilometers),
            });
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: 'Fuel issue updated successfully',
                    duration: 3000,
                });
                await refreshPendingFuelIssues();
                if (selectedIssue && selectedIssue.id === editingItem.id) {
                    setIsDetailsOpen(false);
                    setSelectedIssue(null);
                }
                setIsEditOpen(false);
                setEditingItem(null);
                setEditFormData({ fuel_rate: '', quantity: '', kilometers: '' });
            } else {
                throw new Error(response.data?.message || 'Failed to update fuel issue');
            }
        } catch (error) {
            showErrorToast({
                title: 'Error',
                message: error instanceof Error ? error.message : 'Failed to update fuel issue',
                duration: 5000,
            });
        }
    };

    const handleDeleteClick = (item: PendingFuelIssue) => {
        setEditingItem(item);
        setIsDeleteOpen(true);
    };

    const handleDeleteSubmit = async () => {
        if (!editingItem) return;
        try {
            const response = await API.delete(`/api/issue/item/${editingItem.id}`);
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: 'Fuel issue deleted successfully',
                    duration: 3000,
                });
                await refreshPendingFuelIssues();
                if (selectedIssue && selectedIssue.id === editingItem.id) {
                    setIsDetailsOpen(false);
                    setSelectedIssue(null);
                }
                setIsDeleteOpen(false);
                setEditingItem(null);
            } else {
                throw new Error(response.data?.message || 'Failed to delete fuel issue');
            }
        } catch (error) {
            showErrorToast({
                title: 'Error',
                message: error instanceof Error ? error.message : 'Failed to delete fuel issue',
                duration: 5000,
            });
        }
    };

    if (!permissions?.includes('can_approve_issues')) {
        return null;
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-24">
                <div className="animate-spin rounded-full h-8 w-8 border-3 border-[#003594] border-t-transparent"></div>
            </div>
        );
    }

    return (
        <>
            <Card
                className="cursor-pointer hover:bg-[#003594]/5 transition-colors border-[#002a6e]/10"
                onClick={() => setIsOpen(true)}
            >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-base font-semibold text-[#003594]">Pending Fuel</CardTitle>
                    <Fuel className="h-5 w-5 text-[#003594]" />
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-3xl font-bold text-[#003594]">...</div>
                    ) : (
                        <div className="text-3xl font-bold text-[#003594]">{pendingCount ?? 0}</div>
                    )}
                    <p className="text-sm text-gray-500 mt-1">Fuel issues awaiting approval</p>
                </CardContent>
            </Card>

            <ApprovalListModal
                open={isOpen}
                onOpenChange={setIsOpen}
                title="Pending Fuel Issues"
                description={`You have ${pendingCount ?? 0} pending fuel issue${pendingCount !== 1 ? 's' : ''} that need your attention.`}
                count={pendingCount}
                isEmpty={!isLoading && pendingFuelIssues.length === 0}
                emptyMessage="No pending fuel issues"
                size="xl"
            >
                {pendingFuelIssues.map((issue) => (
                    <ApprovalListCard
                        key={issue.id}
                        onView={() => handleViewDetails(issue.issue_slip_number)}
                        onClick={() => handleViewDetails(issue.issue_slip_number)}
                        viewLabel="View Details"
                        hint="Tap to review details"
                        footer={
                            issue.has_consumption_warning ? (
                                <Badge
                                    variant="outline"
                                    className="border-amber-300 bg-amber-50 text-amber-800 shrink-0"
                                >
                                    <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                                    High KM vs avg
                                </Badge>
                            ) : undefined
                        }
                    >
                        <ApprovalMetaGrid
                            columns={3}
                            items={[
                                { label: 'Issue Slip #', value: issue.issue_slip_number },
                                { label: 'Issue Date', value: formatApprovalDate(issue.issue_date) },
                                { label: 'Fuel Type', value: getFuelType(issue) },
                                personDetailsMetaBlock('Issued By', issue.issued_by, 'sm:col-span-2 lg:col-span-3'),
                            ]}
                        />
                    </ApprovalListCard>
                ))}
            </ApprovalListModal>

            <ApprovalDetailModal
                open={isDetailsOpen}
                onOpenChange={setIsDetailsOpen}
                title={`Fuel Issue Details #${selectedIssue?.issue_slip_number ?? ''}`}
                processing={isProcessing}
                processingLabel={isApproving ? 'Approving fuel issue…' : 'Rejecting fuel issue…'}
                size="full"
                alert={
                    selectedIssue?.has_consumption_warning ? (
                        <ApprovalAlertBanner>
                            One or more lines show kilometers traveled above the historical average for
                            the fuel quantity issued.
                        </ApprovalAlertBanner>
                    ) : undefined
                }
                meta={
                    selectedIssue ? (
                        <ApprovalMetaGrid
                            columns={4}
                            items={[
                                personDetailsMetaBlock('Issued By', selectedIssue.issued_by),
                                { label: 'Issue Date', value: formatApprovalDate(selectedIssue.issue_date) },
                            ]}
                        />
                    ) : undefined
                }
                actions={
                    <ApprovalActionBar
                        onApprove={handleApproveIssue}
                        onReject={handleRejectClick}
                        isApproving={isApproving}
                        isRejecting={isRejecting}
                        approveLabel="Approve"
                    />
                }
            >
                <ApprovalResponsiveTable
                    columns={fuelIssueTableColumns}
                    rows={sortedDetailItems}
                    getRowKey={(item) => item.id}
                    emptyMessage="No line items"
                    rowActions={(item) => (
                        <>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditClick(item)}
                                className="h-8 w-8 p-0 border-[#003594]/20 hover:bg-[#003594]/5 hover:text-[#003594]"
                            >
                                <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteClick(item)}
                                className="h-8 w-8 p-0 border-red-500/20 hover:bg-red-500/5 hover:text-red-500"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </>
                    )}
                />
            </ApprovalDetailModal>

            <ApprovalConfirmModal
                open={isRejectOpen}
                onOpenChange={setIsRejectOpen}
                title="Reject Fuel Issue"
                description="Are you sure you want to reject this fuel issue slip?"
                onConfirm={handleRejectIssue}
                isProcessing={isRejecting}
                confirmLabel="Reject Fuel Issue"
            />

            <ApprovalModalShell
                open={isEditOpen}
                onOpenChange={setIsEditOpen}
                size="sm"
                layout="flex"
            >
                <ApprovalModalHeaderSection>
                    <ModalTitle className={`text-xl font-bold ${approvalTheme.titleGradient}`}>
                        Edit Fuel Issue
                    </ModalTitle>
                    <ModalDescription className="mt-1 text-sm text-slate-600">
                        Update the fuel issue details below. Total cost will be automatically calculated
                        as Fuel Rate × Quantity.
                    </ModalDescription>
                </ApprovalModalHeaderSection>
                <ApprovalModalBody>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="fuel_rate" className="text-sm font-medium text-[#003594]">
                                Fuel Rate (NPR per liter)
                            </Label>
                            <Input
                                id="fuel_rate"
                                type="number"
                                step="0.01"
                                value={editFormData.fuel_rate}
                                onChange={(e) =>
                                    setEditFormData((prev) => ({ ...prev, fuel_rate: e.target.value }))
                                }
                                className="mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20"
                                placeholder="Enter fuel rate"
                            />
                        </div>
                        <div>
                            <Label htmlFor="quantity" className="text-sm font-medium text-[#003594]">
                                Quantity
                            </Label>
                            <Input
                                id="quantity"
                                type="number"
                                step="0.01"
                                value={editFormData.quantity}
                                onChange={(e) =>
                                    setEditFormData((prev) => ({ ...prev, quantity: e.target.value }))
                                }
                                className="mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20"
                                placeholder="Enter quantity"
                            />
                        </div>
                        <div>
                            <Label htmlFor="kilometers" className="text-sm font-medium text-[#003594]">
                                Current Kilometers
                            </Label>
                            <Input
                                id="kilometers"
                                type="number"
                                value={editFormData.kilometers}
                                onChange={(e) =>
                                    setEditFormData((prev) => ({ ...prev, kilometers: e.target.value }))
                                }
                                className="mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20"
                                placeholder="Enter kilometers"
                            />
                        </div>
                    </div>
                </ApprovalModalBody>
                <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
                    <Button
                        variant="outline"
                        onClick={() => {
                            setIsEditOpen(false);
                            setEditingItem(null);
                            setEditFormData({ fuel_rate: '', quantity: '', kilometers: '' });
                        }}
                        className="w-full border-[#002a6e]/10 hover:bg-[#003594]/5 sm:w-auto"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleEditSubmit}
                        className="w-full bg-[#003594] hover:bg-[#003594]/90 text-white sm:w-auto"
                    >
                        Update
                    </Button>
                </div>
            </ApprovalModalShell>

            <ApprovalModalShell
                open={isDeleteOpen}
                onOpenChange={setIsDeleteOpen}
                size="sm"
                layout="flex"
            >
                <ApprovalModalHeaderSection>
                    <ModalTitle className={`text-xl font-bold ${approvalTheme.titleGradient}`}>
                        Delete Fuel Issue
                    </ModalTitle>
                    <ModalDescription className="mt-1 text-sm text-slate-600">
                        Are you sure you want to delete this fuel issue? This action cannot be undone.
                    </ModalDescription>
                </ApprovalModalHeaderSection>
                <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
                    <Button
                        variant="outline"
                        onClick={() => {
                            setIsDeleteOpen(false);
                            setEditingItem(null);
                        }}
                        className="w-full border-[#002a6e]/10 hover:bg-[#003594]/5 sm:w-auto"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleDeleteSubmit}
                        className="w-full bg-red-600 hover:bg-red-700 text-white sm:w-auto"
                    >
                        Delete
                    </Button>
                </div>
            </ApprovalModalShell>
        </>
    );
}
