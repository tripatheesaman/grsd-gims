'use client';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/context/AuthContext';
import { API } from '@/lib/api';
import { usePendingIssuesQuery } from '@/hooks/api/usePendingApprovals';
import { invalidatePendingApprovals } from '@/lib/invalidatePendingApprovals';
import { isAxiosError } from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { FileText, AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalTrigger, ModalDescription, ModalTitle } from '@/components/ui/modal';
import { Label } from '@/components/ui/label';
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
    ApprovalModalHeaderSection,
    ApprovalModalBody,
    formatApprovalDate,
    personDetailsMetaBlock,
} from '@/components/approvals';
import type { ApprovalTableColumn } from '@/components/approvals';
import type { PersonDetails } from '@/types/personDetails';

interface PendingIssue {
    id: number;
    nac_code: string;
    part_number: string;
    issue_quantity: number;
    issue_cost: number;
    remaining_balance: number;
    issue_slip_number: string;
    issue_date: string;
    issued_by: PersonDetails;
    issued_for: string;
    item_name: string;
    extends_applicable_equipment?: boolean;
    items?: PendingIssue[];
}

function groupPendingIssues(issues: PendingIssue[]): PendingIssue[] {
    const nonFuelIssues = issues.filter((issue) => issue.nac_code !== 'GT 07986' && issue.nac_code !== 'GT 00000');
    const groupedIssues = nonFuelIssues.reduce((acc: Record<string, PendingIssue[]>, curr) => {
        if (!acc[curr.issue_slip_number]) {
            acc[curr.issue_slip_number] = [];
        }
        acc[curr.issue_slip_number].push(curr);
        return acc;
    }, {});
    return Object.values(groupedIssues).map((items) => ({
        ...items[0],
        items,
        extends_applicable_equipment: items.some((i) => i.extends_applicable_equipment),
    }));
}

const issueItemColumns: ApprovalTableColumn<PendingIssue>[] = [
    {
        id: 'item_name',
        header: 'Item Name',
        cell: (item) => (
            <span className="block max-w-[200px] truncate" title={item.item_name}>
                {item.item_name}
            </span>
        ),
    },
    {
        id: 'part_number',
        header: 'Part Number',
        cell: (item) => (
            <span className="block max-w-[150px] truncate" title={item.part_number}>
                {item.part_number}
            </span>
        ),
    },
    {
        id: 'nac_code',
        header: 'NAC Code',
        cell: (item) => (
            <span className="block max-w-[120px] truncate" title={item.nac_code}>
                {item.nac_code}
            </span>
        ),
    },
    {
        id: 'issue_quantity',
        header: 'Quantity',
        cell: (item) => item.issue_quantity,
    },
    {
        id: 'issue_cost',
        header: 'Cost',
        cell: (item) => `NPR ${item.issue_cost.toFixed(2)}`,
    },
    {
        id: 'remaining_balance',
        header: 'Balance',
        cell: (item) => item.remaining_balance,
    },
    {
        id: 'issued_for',
        header: 'Issued For',
        cell: (item) => (
            <div className="flex max-w-[180px] flex-col gap-1">
                <span className="truncate" title={item.issued_for}>
                    {item.issued_for}
                </span>
                {item.extends_applicable_equipment && (
                    <Badge variant="outline" className="w-fit border-amber-300 bg-amber-50 text-[10px] text-amber-800">
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        Will extend applicable list
                    </Badge>
                )}
            </div>
        ),
    },
];

export function PendingIssuesCount() {
    const queryClient = useQueryClient();
    const { permissions, user } = useAuthContext();
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isRejectOpen, setIsRejectOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [selectedIssue, setSelectedIssue] = useState<PendingIssue | null>(null);
    const [editingItem, setEditingItem] = useState<{
        id: number;
        quantity: number;
    } | null>(null);
    const [editQuantity, setEditQuantity] = useState('');
    const [isApproving, setIsApproving] = useState(false);
    const [isRejecting, setIsRejecting] = useState(false);
    const isProcessing = isApproving || isRejecting;
    const shouldPoll = !isDetailsOpen && !isEditOpen && !isRejectOpen;
    const { data: pendingRes, isLoading } = usePendingIssuesQuery(
        Boolean(permissions?.includes('can_approve_issues') && shouldPoll)
    );
    const pendingIssues = useMemo(() => {
        const issues = (pendingRes?.data as { issues?: PendingIssue[] } | undefined)?.issues;
        if (!issues)
            return [];
        return groupPendingIssues(issues);
    }, [pendingRes?.data]);
    const pendingCount = pendingIssues.length;
    const refreshPendingIssues = () => {
        void invalidatePendingApprovals(queryClient, ['issue', 'fuel']);
    };
    const handleViewDetails = async (issueSlipNumber: string) => {
        const issue = pendingIssues.find(issue => issue.issue_slip_number === issueSlipNumber);
        if (issue) {
            setSelectedIssue(issue);
            setIsDetailsOpen(true);
        }
    };
    const handleApproveIssue = async () => {
        if (!selectedIssue?.items || isProcessing)
            return;
        setIsApproving(true);
        try {
            const itemIds = selectedIssue.items.map(item => item.id);
            const response = await API.put(`/api/issue/approve`, {
                itemIds,
                approvedBy: user?.UserInfo?.username
            });
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: "Issue approved successfully",
                    duration: 3000,
                });
                setIsDetailsOpen(false);
                refreshPendingIssues();
            }
            else {
                throw new Error(response.data?.message || 'Failed to approve issue');
            }
        }
        catch (error) {
            if (isAxiosError(error) && error.response?.status === 409) {
                setIsDetailsOpen(false);
                refreshPendingIssues();
                showSuccessToast({
                    title: 'Already processed',
                    message: 'This issue was already approved.',
                    duration: 3000,
                });
                return;
            }
            showErrorToast({
                title: 'Error',
                message: error instanceof Error ? error.message : "Failed to approve issue",
                duration: 5000,
            });
        }
        finally {
            setIsApproving(false);
        }
    };
    const handleRejectClick = () => {
        setIsRejectOpen(true);
    };
    const handleRejectIssue = async () => {
        if (!selectedIssue?.items || isProcessing)
            return;
        setIsRejecting(true);
        try {
            const itemIds = selectedIssue.items.map(item => item.id);
            const response = await API.put(`/api/issue/reject`, {
                itemIds,
                rejectedBy: user?.UserInfo?.username
            });
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: "Issue rejected successfully",
                    duration: 3000,
                });
                setIsDetailsOpen(false);
                setIsRejectOpen(false);
                refreshPendingIssues();
            }
            else {
                throw new Error(response.data?.message || 'Failed to reject issue');
            }
        }
        catch (error) {
            showErrorToast({
                title: 'Error',
                message: error instanceof Error ? error.message : "Failed to reject issue",
                duration: 5000,
            });
        }
        finally {
            setIsRejecting(false);
        }
    };
    const handleEditClick = (item: PendingIssue) => {
        setEditingItem({ id: item.id, quantity: item.issue_quantity });
        setEditQuantity(item.issue_quantity.toString());
        setIsEditOpen(true);
    };
    const handleDeleteItem = async (itemId: number) => {
        if (!selectedIssue)
            return;
        try {
            const response = await API.delete(`/api/issue/item/${itemId}`);
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: "Item deleted successfully",
                    duration: 3000,
                });
                await refreshPendingIssues();
            }
        }
        catch (error) {
            showErrorToast({
                title: 'Error',
                message: error instanceof Error ? error.message : "Failed to delete item",
                duration: 5000,
            });
        }
    };
    const handleUpdateQuantity = async () => {
        if (!editingItem || !editQuantity.trim() || !selectedIssue)
            return;
        const newQuantity = parseInt(editQuantity);
        if (isNaN(newQuantity) || newQuantity <= 0) {
            showErrorToast({
                title: 'Error',
                message: "Please enter a valid quantity",
                duration: 3000,
            });
            return;
        }
        try {
            const response = await API.put(`/api/issue/item/${editingItem.id}`, {
                quantity: newQuantity
            });
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: "Quantity updated successfully",
                    duration: 3000,
                });
                await refreshPendingIssues();
                setIsEditOpen(false);
                setEditingItem(null);
                setEditQuantity('');
            }
        }
        catch (error) {
            showErrorToast({
                title: 'Error',
                message: error instanceof Error ? error.message : "Failed to update quantity",
                duration: 5000,
            });
        }
    };
    if (!permissions?.includes('can_approve_issues')) {
        return null;
    }
    if (isLoading) {
        return (<div className="flex items-center justify-center h-24">
        <div className="animate-spin rounded-full h-8 w-8 border-3 border-[#003594] border-t-transparent"></div>
      </div>);
    }
    return (<>
      <Modal open={isOpen} onOpenChange={setIsOpen}>
        <ModalTrigger asChild>
          <Card className="cursor-pointer hover:bg-[#003594]/5 transition-colors border-[#002a6e]/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base font-semibold text-[#003594]">Pending Spares</CardTitle>
              <FileText className="h-5 w-5 text-[#003594]"/>
            </CardHeader>
            <CardContent>
              {isLoading ? (<div className="text-3xl font-bold text-[#003594]">...</div>) : (<div className="text-3xl font-bold text-[#003594]">{pendingCount ?? 0}</div>)}
              <p className="text-sm text-gray-500 mt-1">Spares awaiting approval</p>
            </CardContent>
          </Card>
        </ModalTrigger>
      </Modal>

      <ApprovalListModal
        open={isOpen}
        onOpenChange={setIsOpen}
        title="Pending Spares"
        description={`You have ${pendingCount ?? 0} pending spare${pendingCount !== 1 ? 's' : ''} that need your attention.`}
        count={pendingCount}
        isEmpty={!isLoading && pendingIssues.length === 0}
        emptyMessage="No pending spares"
        size="xl"
      >
        {pendingIssues.map((issue) => (
          <ApprovalListCard
            key={issue.id}
            onView={() => handleViewDetails(issue.issue_slip_number)}
            onClick={() => handleViewDetails(issue.issue_slip_number)}
            viewLabel="View Details"
            hint="Tap to review details"
            footer={
              issue.extends_applicable_equipment ? (
                <Badge variant="outline" className="shrink-0 border-amber-300 bg-amber-50 text-amber-800">
                  <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                  New equipment linkage
                </Badge>
              ) : undefined
            }
          >
            <ApprovalMetaGrid
              columns={3}
              items={[
                { label: 'Issue Slip #', value: issue.issue_slip_number },
                { label: 'Issue Date', value: formatApprovalDate(issue.issue_date) },
                { label: 'Item', value: issue.item_name },
                personDetailsMetaBlock('Issued By', issue.issued_by),
              ]}
            />
          </ApprovalListCard>
        ))}
      </ApprovalListModal>

      <ApprovalDetailModal
        open={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
        title={`Issue Details #${selectedIssue?.issue_slip_number ?? ''}`}
        meta={
          selectedIssue ? (
            <ApprovalMetaGrid
              columns={4}
              items={[
                personDetailsMetaBlock('Issued By', selectedIssue.issued_by),
                { label: 'Issue Date', value: formatApprovalDate(selectedIssue.issue_date) },
              ]}
              className="mt-1"
            />
          ) : undefined
        }
        alert={
          selectedIssue?.extends_applicable_equipment ? (
            <ApprovalAlertBanner variant="warning">
              One or more lines issue to equipment outside the applicable list.
              Approving will add that equipment to each item&apos;s applicable list.
            </ApprovalAlertBanner>
          ) : undefined
        }
        processing={isProcessing}
        processingLabel={isApproving ? 'Approving issue…' : 'Rejecting issue…'}
        size="full"
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
          columns={issueItemColumns}
          rows={selectedIssue?.items ?? []}
          getRowKey={(item) => item.id}
          emptyMessage="No line items"
          rowActions={(item) => (
            <div className="flex flex-wrap items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="flex h-8 items-center gap-1 px-2 text-[#003594] hover:bg-[#003594]/10"
                onClick={() => handleEditClick(item)}
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Edit</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex h-8 items-center gap-1 px-2 text-[#d2293b] hover:bg-[#d2293b]/10"
                onClick={() => handleDeleteItem(item.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Delete</span>
              </Button>
            </div>
          )}
        />
      </ApprovalDetailModal>

      <ApprovalModalShell open={isEditOpen} onOpenChange={setIsEditOpen} size="sm" layout="flex">
        <ApprovalModalHeaderSection>
          <ModalTitle className="text-lg font-bold text-[#003594]">Edit Quantity</ModalTitle>
          <ModalDescription className="mt-1 text-sm text-slate-600">
            Update the quantity for this item.
          </ModalDescription>
        </ApprovalModalHeaderSection>
        <ApprovalModalBody>
          <div className="space-y-2">
            <Label htmlFor="edit-issue-quantity" className="text-sm font-medium text-[#003594]">
              Quantity
            </Label>
            <input
              id="edit-issue-quantity"
              type="number"
              value={editQuantity}
              onChange={(e) => setEditQuantity(e.target.value)}
              className="w-full rounded-lg border border-[#002a6e]/10 p-3 transition-colors focus:border-[#003594] focus:ring-[#003594]/20"
              min="1"
              placeholder="Enter quantity..."
            />
          </div>
        </ApprovalModalBody>
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
          <Button
            variant="outline"
            onClick={() => {
              setIsEditOpen(false);
              setEditingItem(null);
              setEditQuantity('');
            }}
            className="w-full border-[#002a6e]/10 hover:bg-gray-50 sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpdateQuantity}
            className="w-full bg-[#003594] text-white transition-colors hover:bg-[#003594]/90 sm:w-auto"
          >
            Update Quantity
          </Button>
        </div>
      </ApprovalModalShell>

      <ApprovalConfirmModal
        open={isRejectOpen}
        onOpenChange={setIsRejectOpen}
        title="Reject Issue"
        description="Are you sure you want to reject this issue slip?"
        onConfirm={handleRejectIssue}
        isProcessing={isRejecting}
        confirmLabel="Reject Issue"
      />
    </>);
}
