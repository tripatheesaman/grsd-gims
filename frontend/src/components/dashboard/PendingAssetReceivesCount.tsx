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
import { Eye, Check, X, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription } from '@/components/ui/modal';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCustomToast } from '@/components/ui/custom-toast';

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
    receiveSource: string;
    imagePath?: string;
}

const modalPanelClass =
    'bg-white rounded-lg shadow-xl border border-[#002a6e]/10 text-gray-900';

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
        }
        catch {
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
            await invalidatePendingApprovals(queryClient);
            setIsDetailsOpen(false);
        }
        catch (error: unknown) {
            if (isAxiosError(error) && error.response?.status === 409) {
                await invalidatePendingApprovals(queryClient);
                setIsDetailsOpen(false);
                showSuccessToast({ title: 'Already processed', message: 'This asset receive was already approved.', duration: 3000 });
                return;
            }
            const message = error && typeof error === 'object' && 'response' in error
                ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
                : 'Failed to approve';
            showErrorToast({ title: 'Error', message: message || 'Failed to approve', duration: 5000 });
        }
        finally {
            setIsApproving(false);
        }
    };

    const handleReject = async () => {
        if (!selectedReceive || !rejectionReason.trim()) {
            showErrorToast({ title: 'Error', message: 'Please provide a rejection reason', duration: 3000 });
            return;
        }
        try {
            await API.put(`/api/asset-receive/${selectedReceive.receiveId}/reject`, {
                rejectedBy: user?.UserInfo?.username,
                rejectionReason: rejectionReason.trim(),
            });
            showSuccessToast({ title: 'Success', message: 'Assets receive rejected', duration: 3000 });
            await invalidatePendingApprovals(queryClient);
            setIsDetailsOpen(false);
            setIsRejectOpen(false);
            setRejectionReason('');
        }
        catch (error: unknown) {
            const message = error && typeof error === 'object' && 'response' in error
                ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
                : 'Failed to reject';
            showErrorToast({ title: 'Error', message: message || 'Failed to reject', duration: 5000 });
        }
    };

    if (!permissions?.includes('can_approve_assets_receive')) {
        return null;
    }

    return (
        <>
            <Card
                className="border-[#002a6e]/10 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setIsOpen(true)}
            >
                <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold text-[#003594] flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Assets Receive
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-3xl font-bold text-[#003594]">
                        {isLoading ? '…' : pendingCount ?? 0}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Pending approval</p>
                </CardContent>
            </Card>

            <Modal open={isOpen} onOpenChange={setIsOpen}>
                <ModalContent className={`max-w-4xl max-h-[90vh] overflow-y-auto ${modalPanelClass}`}>
                    <ModalHeader className="border-b border-[#002a6e]/10 pb-4">
                        <ModalTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
                            Pending Assets Receive
                        </ModalTitle>
                        <ModalDescription className="text-gray-600">
                            Capital equipment receives awaiting approval
                        </ModalDescription>
                    </ModalHeader>
                    <div className="mt-6 space-y-4">
                        {pendingReceives.length === 0 ? (
                            <p className="text-center text-gray-500 py-8">No pending assets receives</p>
                        ) : (
                            pendingReceives.map((receive) => (
                                <div
                                    key={receive.id}
                                    className="rounded-lg border border-[#002a6e]/10 p-6 hover:bg-[#003594]/5 cursor-pointer transition-colors"
                                    onDoubleClick={() => handleViewDetails(receive.id)}
                                >
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium text-[#003594]">Model</p>
                                            <p className="text-base font-semibold text-gray-900">{receive.itemName}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium text-[#003594]">Quantity</p>
                                            <p className="text-base font-semibold text-gray-900">{receive.receivedQuantity}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium text-[#003594]">Receive date</p>
                                            <p className="text-base font-semibold text-gray-900">{receive.receiveDate}</p>
                                        </div>
                                    </div>
                                    <div className="mt-4 text-xs text-gray-500 flex items-center gap-1">
                                        <Eye className="h-3 w-3" />
                                        Double-click to view full details
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </ModalContent>
            </Modal>

            <Modal open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                <ModalContent className={`max-w-2xl max-h-[90vh] overflow-y-auto ${modalPanelClass}`}>
                    <ModalHeader className="border-b border-[#002a6e]/10 pb-4">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <ModalTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
                                    Assets Receive Details
                                </ModalTitle>
                                <ModalDescription className="mt-1 text-gray-600">
                                    Model: {selectedReceive?.itemName}
                                </ModalDescription>
                            </div>
                            <div className="flex flex-wrap gap-2 shrink-0">
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    className="flex items-center gap-2 bg-[#d2293b] hover:bg-[#d2293b]/90 text-white"
                                    onClick={() => setIsRejectOpen(true)}
                                >
                                    <X className="h-4 w-4" />
                                    Reject
                                </Button>
                                <Button
                                    size="sm"
                                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white"
                                    disabled={isApproving}
                                    onClick={handleApprove}
                                >
                                    <Check className="h-4 w-4" />
                                    Approve
                                </Button>
                            </div>
                        </div>
                    </ModalHeader>
                    {selectedReceive && (
                        <div className="mt-6 space-y-6">
                            {selectedReceive.imagePath ? (
                                <div className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-xl border border-[#002a6e]/10 bg-white">
                                    <Image
                                        src={resolveImageUrl(selectedReceive.imagePath, '/images/nepal_airlines_logo.png')}
                                        alt={selectedReceive.itemName}
                                        fill
                                        className="object-contain p-2"
                                        unoptimized
                                    />
                                </div>
                            ) : null}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-6 bg-[#003594]/5 rounded-lg">
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-[#003594]">Quantity</p>
                                <p className="text-base font-semibold text-gray-900">{selectedReceive.receivedQuantity}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-[#003594]">Receive date</p>
                                <p className="text-base font-semibold text-gray-900">{selectedReceive.receiveDate}</p>
                            </div>
                            {selectedReceive.receivedBy && (
                                <div className="space-y-1 sm:col-span-2">
                                    <p className="text-sm font-medium text-[#003594]">Received by</p>
                                    <p className="text-base font-semibold text-gray-900">{selectedReceive.receivedBy}</p>
                                </div>
                            )}
                            <div className="space-y-1 sm:col-span-2">
                                <p className="text-sm font-medium text-[#003594]">Source</p>
                                <p className="text-base font-semibold text-gray-900 capitalize">
                                    {selectedReceive.receiveSource || 'assets'}
                                </p>
                            </div>
                        </div>
                        </div>
                    )}
                </ModalContent>
            </Modal>

            <Modal open={isRejectOpen} onOpenChange={setIsRejectOpen}>
                <ModalContent className={`max-w-md ${modalPanelClass}`}>
                    <ModalHeader className="border-b border-[#002a6e]/10 pb-4">
                        <ModalTitle className="text-xl font-semibold text-[#003594]">Reject Assets Receive</ModalTitle>
                        <ModalDescription className="text-gray-600">
                            Please provide a reason for rejecting this assets receive.
                        </ModalDescription>
                    </ModalHeader>
                    <div className="space-y-6 pt-2">
                        <div className="space-y-2">
                            <Label htmlFor="assetRejectionReason" className="text-[#003594]">
                                Reason for rejection
                            </Label>
                            <Textarea
                                id="assetRejectionReason"
                                placeholder="Enter the reason for rejection"
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                className="min-h-[100px] border-[#002a6e]/20 bg-white text-gray-900 placeholder:text-gray-400 focus:border-[#003594] focus:ring-[#003594]/20"
                            />
                        </div>
                        <div className="flex justify-end gap-3">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setIsRejectOpen(false);
                                    setRejectionReason('');
                                }}
                                className="border-[#002a6e]/20 text-gray-700 hover:bg-[#003594]/5 hover:text-[#003594]"
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={handleReject}
                                disabled={!rejectionReason.trim()}
                                className="bg-[#d2293b] hover:bg-[#d2293b]/90 text-white disabled:opacity-50"
                            >
                                Confirm rejection
                            </Button>
                        </div>
                    </div>
                </ModalContent>
            </Modal>
        </>
    );
}
