'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/context/AuthContext';
import { API } from '@/lib/api';
import { usePendingAssetReceivesQuery } from '@/hooks/api/usePendingApprovals';
import { invalidatePendingApprovals } from '@/lib/invalidatePendingApprovals';
import { isAxiosError } from 'axios';
import { resolveImageUrl } from '@/lib/urls';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Package } from 'lucide-react';
import { useCustomToast } from '@/components/ui/custom-toast';
import {
    ApprovalListModal,
    ApprovalListCard,
    ApprovalDetailModal,
    ApprovalActionBar,
    ApprovalMetaGrid,
    ApprovalRejectModal,
    formatApprovalDate,
    personDetailsMetaBlock,
} from '@/components/approvals';
import type { PersonDetails } from '@/types/personDetails';

interface PendingAssetReceive {
    id: number;
    nacCode: string;
    itemName: string;
    partNumber: string;
    receivedQuantity: number;
    receiveDate: string;
    receiveSource: string;
}

interface AssetReceiveDetails {
    receiveId: number;
    itemName: string;
    receivedQuantity: number;
    receiveDate: string;
    receivedBy?: string;
    receivedByDetails?: PersonDetails;
    receiveSource: string;
    imagePath?: string;
}

export function PendingAssetReceivesCount() {
    const queryClient = useQueryClient();
    const { permissions, user } = useAuthContext();
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isRejectOpen, setIsRejectOpen] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [selectedReceive, setSelectedReceive] = useState<AssetReceiveDetails | null>(null);
    const [isApproving, setIsApproving] = useState(false);
    const [isRejecting, setIsRejecting] = useState(false);
    const isProcessing = isApproving || isRejecting;

    const refreshPendingAssetReceives = () => {
        void invalidatePendingApprovals(queryClient, ['assetReceive']);
    };

    const shouldPoll = !isDetailsOpen && !isRejectOpen;
    const { data: pendingRes, isLoading } = usePendingAssetReceivesQuery(
        Boolean(permissions?.includes('can_approve_assets_receive') && shouldPoll)
    );
    const pendingReceives = (pendingRes?.data as PendingAssetReceive[] | undefined) ?? [];
    const pendingCount = pendingReceives.length;

    const handleViewDetails = async (receiveId: number) => {
        try {
            const response = await API.get(`/api/asset-receive/${receiveId}/details`);
            if (response.status === 200) {
                setSelectedReceive(response.data);
                setIsDetailsOpen(true);
            }
        } catch {
            showErrorToast({ title: 'Error', message: 'Failed to load details', duration: 3000 });
        }
    };

    const handleApprove = async () => {
        if (!selectedReceive || isApproving) return;
        setIsApproving(true);
        try {
            await API.put(`/api/asset-receive/${selectedReceive.receiveId}/approve`, {
                approvedBy: user?.UserInfo?.username,
            });
            showSuccessToast({ title: 'Success', message: 'Assets receive approved', duration: 3000 });
            setIsDetailsOpen(false);
            refreshPendingAssetReceives();
        } catch (error: unknown) {
            if (isAxiosError(error) && error.response?.status === 409) {
                setIsDetailsOpen(false);
                refreshPendingAssetReceives();
                showSuccessToast({
                    title: 'Already processed',
                    message: 'This asset receive was already approved.',
                    duration: 3000,
                });
                return;
            }
            const message =
                error && typeof error === 'object' && 'response' in error
                    ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
                    : 'Failed to approve';
            showErrorToast({ title: 'Error', message: message || 'Failed to approve', duration: 5000 });
        } finally {
            setIsApproving(false);
        }
    };

    const handleReject = async () => {
        if (!selectedReceive || !rejectionReason.trim() || isProcessing) {
            if (!rejectionReason.trim()) {
                showErrorToast({ title: 'Error', message: 'Please provide a rejection reason', duration: 3000 });
            }
            return;
        }
        setIsRejecting(true);
        try {
            await API.put(`/api/asset-receive/${selectedReceive.receiveId}/reject`, {
                rejectedBy: user?.UserInfo?.username,
                rejectionReason: rejectionReason.trim(),
            });
            showSuccessToast({ title: 'Success', message: 'Assets receive rejected', duration: 3000 });
            setIsDetailsOpen(false);
            setIsRejectOpen(false);
            setRejectionReason('');
            refreshPendingAssetReceives();
        } catch (error: unknown) {
            const message =
                error && typeof error === 'object' && 'response' in error
                    ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
                    : 'Failed to reject';
            showErrorToast({ title: 'Error', message: message || 'Failed to reject', duration: 5000 });
        } finally {
            setIsRejecting(false);
        }
    };

    if (!permissions?.includes('can_approve_assets_receive')) {
        return null;
    }

    return (
        <>
            <Card
                className="cursor-pointer border-[#002a6e]/10 transition-shadow hover:bg-[#003594]/5 hover:shadow-md"
                onClick={() => setIsOpen(true)}
            >
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold text-[#003594]">
                        <Package className="h-4 w-4" />
                        Assets Receive
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-3xl font-bold text-[#003594]">{isLoading ? '…' : pendingCount}</p>
                    <p className="mt-1 text-xs text-slate-500">Pending approval</p>
                </CardContent>
            </Card>

            <ApprovalListModal
                open={isOpen}
                onOpenChange={setIsOpen}
                title="Pending Assets Receive"
                description="Capital equipment receives awaiting approval before RRP"
                count={pendingCount}
                isEmpty={!isLoading && pendingReceives.length === 0}
                emptyMessage="No pending assets receives"
                size="xl"
            >
                {pendingReceives.map((receive) => (
                    <ApprovalListCard
                        key={receive.id}
                        onView={() => handleViewDetails(receive.id)}
                        onClick={() => handleViewDetails(receive.id)}
                        hint="Tap to review details"
                    >
                        <ApprovalMetaGrid
                            columns={3}
                            items={[
                                { label: 'Model', value: receive.itemName },
                                { label: 'Quantity', value: receive.receivedQuantity },
                                { label: 'Receive date', value: formatApprovalDate(receive.receiveDate) },
                            ]}
                        />
                    </ApprovalListCard>
                ))}
            </ApprovalListModal>

            <ApprovalDetailModal
                open={isDetailsOpen}
                onOpenChange={setIsDetailsOpen}
                title="Assets Receive Details"
                description={selectedReceive ? `Model: ${selectedReceive.itemName}` : undefined}
                processing={isProcessing}
                processingLabel={isApproving ? 'Approving assets receive…' : 'Rejecting assets receive…'}
                size="lg"
                actions={
                    <ApprovalActionBar
                        onApprove={handleApprove}
                        onReject={() => setIsRejectOpen(true)}
                        isApproving={isApproving}
                        isRejecting={isRejecting}
                        approveLabel="Approve"
                    />
                }
            >
                {selectedReceive && (
                    <div className="space-y-6">
                        {selectedReceive.imagePath ? (
                            <div className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                                <Image
                                    src={resolveImageUrl(
                                        selectedReceive.imagePath,
                                        '/images/nepal_airlines_logo.png'
                                    )}
                                    alt={selectedReceive.itemName}
                                    fill
                                    className="object-contain p-3"
                                    unoptimized
                                />
                            </div>
                        ) : null}
                        <ApprovalMetaGrid
                            columns={2}
                            items={[
                                { label: 'Quantity', value: selectedReceive.receivedQuantity },
                                { label: 'Receive date', value: formatApprovalDate(selectedReceive.receiveDate) },
                                ...(selectedReceive.receivedByDetails
                                    ? [personDetailsMetaBlock('Received by', selectedReceive.receivedByDetails, 'sm:col-span-2')]
                                    : selectedReceive.receivedBy
                                      ? [{ label: 'Received by', value: selectedReceive.receivedBy, className: 'sm:col-span-2' }]
                                      : []),
                                {
                                    label: 'Source',
                                    value: (
                                        <span className="capitalize">
                                            {selectedReceive.receiveSource || 'assets'}
                                        </span>
                                    ),
                                    className: 'sm:col-span-2',
                                },
                            ]}
                        />
                    </div>
                )}
            </ApprovalDetailModal>

            <ApprovalRejectModal
                open={isRejectOpen}
                onOpenChange={setIsRejectOpen}
                title="Reject Assets Receive"
                description="Please provide a reason for rejecting this assets receive."
                reason={rejectionReason}
                onReasonChange={setRejectionReason}
                onConfirm={handleReject}
                onCancel={() => setRejectionReason('')}
                isRejecting={isRejecting}
                confirmLabel="Reject receive"
            />
        </>
    );
}
