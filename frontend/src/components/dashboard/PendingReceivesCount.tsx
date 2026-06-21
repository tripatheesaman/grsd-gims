'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/context/AuthContext';
import { API } from '@/lib/api';
import { usePendingReceivesQuery } from '@/hooks/api/usePendingApprovals';
import { invalidatePendingApprovals } from '@/lib/invalidatePendingApprovals';
import { isAxiosError } from 'axios';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Check, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModalTitle } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCustomToast } from '@/components/ui/custom-toast';
import {
    ApprovalListModal,
    ApprovalListCard,
    ApprovalDetailModal,
    ApprovalActionBar,
    ApprovalMetaGrid,
    ApprovalRejectModal,
    ApprovalModalShell,
    ApprovalModalBody,
    ApprovalModalHeaderSection,
    formatApprovalDate,
    approvalTheme,
    type ApprovalMetaItem,
    personDetailsMetaBlock,
} from '@/components/approvals';
import type { PersonDetails } from '@/types/personDetails';
import { ApprovalImagePreviewModal } from '@/components/approvals/ApprovalImagePreviewModal';
import { resolveImageUrl, withBasePath } from '@/lib/urls';

interface PendingReceive {
    id: number;
    nacCode: string;
    itemName: string;
    partNumber: string;
    receivedQuantity: number;
    equipmentNumber?: string;
    receiveDate: string;
    receiveSource?: string;
    tenderReferenceNumber?: string;
    borrowReferenceNumber?: string;
    borrowDate?: string;
    borrowSourceName?: string;
    borrowSourceCode?: string;
    requestFk?: number;
}

interface ReceiveDetails {
    id: number;
    requestNumber: string;
    requestDate: string;
    receiveDate: string;
    itemName: string;
    requestedPartNumber: string;
    receivedPartNumber: string;
    requestedQuantity: number;
    receivedQuantity: number;
    equipmentNumber: string;
    unit: string;
    requestedUnit?: string | null;
    conversionBase?: number | null;
    requestedImage: string;
    receivedImage: string;
    nacCode: string;
    location?: string;
    receiveSource?: string;
    tenderReferenceNumber?: string;
    borrowReferenceNumber?: string;
    borrowDate?: string;
    borrowSourceName?: string;
    borrowSourceCode?: string;
    requestFk?: number;
    requestedByDetails?: PersonDetails;
    receivedByDetails?: PersonDetails;
}

interface EditData {
    receivedQuantity: number;
    receivedPartNumber: string;
    unit?: string;
    newRequestedImage?: File;
    newReceivedImage?: File;
}

const FALLBACK_IMAGE = '/images/nepal_airlines_logo.jpeg';

function buildHeaderSummaryItems(receive: ReceiveDetails): ApprovalMetaItem[] {
    if (receive.receiveSource === 'tender') {
        return [
            { label: 'Tender Reference', value: receive.tenderReferenceNumber || 'N/A' },
            { label: 'Receive Date', value: formatApprovalDate(receive.receiveDate) },
            { label: 'Equipment Number', value: receive.equipmentNumber || 'N/A' },
        ];
    }
    if (receive.receiveSource === 'borrow') {
        return [
            {
                label: 'Borrow Source',
                value: (
                    <>
                        {receive.borrowSourceName || 'N/A'}
                        {receive.borrowSourceCode && ` (${receive.borrowSourceCode})`}
                    </>
                ),
            },
            { label: 'Borrow Date', value: formatApprovalDate(receive.borrowDate) },
            { label: 'Borrow Reference', value: receive.borrowReferenceNumber || 'N/A' },
        ];
    }
    return [
        { label: 'Request Date', value: formatApprovalDate(receive.requestDate) },
        { label: 'Receive Date', value: formatApprovalDate(receive.receiveDate) },
        { label: 'Equipment Number', value: receive.equipmentNumber || 'N/A' },
        ...(receive.requestedByDetails
            ? [personDetailsMetaBlock('Requested By', receive.requestedByDetails, 'sm:col-span-2 lg:col-span-3')]
            : []),
    ];
}

function buildRequestedColumnItems(
    receive: ReceiveDetails,
    onImageClick: (url: string) => void
): ApprovalMetaItem[] {
    const imageAlt =
        receive.receiveSource === 'tender'
            ? 'Tender Item'
            : receive.receiveSource === 'borrow'
              ? 'Borrow Item'
              : 'Requested Item';

    if (receive.receiveSource === 'tender') {
        return [
            { label: 'Tender Reference', value: receive.tenderReferenceNumber || 'N/A' },
            { label: 'Item Name', value: receive.itemName },
            { label: 'Part Number', value: receive.receivedPartNumber },
            {
                label: 'Image',
                value: (
                    <Image
                        src={resolveImageUrl(receive.requestedImage, FALLBACK_IMAGE)}
                        alt={imageAlt}
                        width={160}
                        height={160}
                        className="h-40 w-40 cursor-pointer rounded-lg border border-slate-200 object-cover transition-opacity hover:opacity-80"
                        onClick={() => receive.requestedImage && onImageClick(receive.requestedImage)}
                        unoptimized
                    />
                ),
            },
        ];
    }

    if (receive.receiveSource === 'borrow') {
        return [
            {
                label: 'Borrow Source',
                value: (
                    <>
                        {receive.borrowSourceName || 'N/A'}
                        {receive.borrowSourceCode && ` (${receive.borrowSourceCode})`}
                    </>
                ),
            },
            { label: 'Borrow Date', value: formatApprovalDate(receive.borrowDate) },
            { label: 'Borrow Reference', value: receive.borrowReferenceNumber || 'N/A' },
            { label: 'Item Name', value: receive.itemName },
            { label: 'Part Number', value: receive.receivedPartNumber },
            {
                label: 'Image',
                value: (
                    <Image
                        src={resolveImageUrl(receive.requestedImage, FALLBACK_IMAGE)}
                        alt={imageAlt}
                        width={160}
                        height={160}
                        className="h-40 w-40 cursor-pointer rounded-lg border border-slate-200 object-cover transition-opacity hover:opacity-80"
                        onClick={() => receive.requestedImage && onImageClick(receive.requestedImage)}
                        unoptimized
                    />
                ),
            },
        ];
    }

    return [
        { label: 'Item Name', value: receive.itemName },
        { label: 'Part Number', value: receive.requestedPartNumber },
        {
            label: 'Quantity',
            value: (
                <>
                    {receive.requestedQuantity}
                    {receive.requestedUnit && (
                        <span className="ml-1 text-sm font-normal text-slate-600">
                            {receive.requestedUnit}
                        </span>
                    )}
                </>
            ),
        },
        {
            label: 'Image',
            value: (
                <Image
                    src={resolveImageUrl(receive.requestedImage, FALLBACK_IMAGE)}
                    alt={imageAlt}
                    width={160}
                    height={160}
                    className="h-40 w-40 cursor-pointer rounded-lg border border-slate-200 object-cover transition-opacity hover:opacity-80"
                    onClick={() => receive.requestedImage && onImageClick(receive.requestedImage)}
                    unoptimized
                />
            ),
        },
    ];
}

function buildReceivedColumnItems(
    receive: ReceiveDetails,
    onImageClick: (url: string) => void
): ApprovalMetaItem[] {
    const items: ApprovalMetaItem[] = [
        { label: 'Part Number', value: receive.receivedPartNumber },
        {
            label: 'Quantity',
            value: (
                <>
                    {receive.receivedQuantity}
                    {receive.unit && (
                        <span className="ml-1 text-sm font-normal text-slate-600">{receive.unit}</span>
                    )}
                </>
            ),
        },
        { label: 'Unit', value: receive.unit || 'N/A' },
    ];

    if (
        receive.requestedUnit &&
        receive.unit &&
        receive.requestedUnit !== receive.unit &&
        receive.conversionBase
    ) {
        items.push({
            label: 'Conversion',
            value: (
                <div className="space-y-1">
                    <p>
                        1 {receive.requestedUnit} = {receive.conversionBase} {receive.unit}
                    </p>
                    <p className="text-xs font-normal text-slate-500">
                        Effective stock added:{' '}
                        {(receive.receivedQuantity / (receive.conversionBase || 1)).toFixed(4)}{' '}
                        {receive.requestedUnit}
                    </p>
                </div>
            ),
        });
    }

    if (receive.location) {
        items.push({ label: 'Location', value: receive.location });
    }

    if (receive.receivedByDetails) {
        items.push(personDetailsMetaBlock('Received By', receive.receivedByDetails));
    }

    items.push({
        label: 'Image',
        value: (
            <Image
                src={resolveImageUrl(receive.receivedImage, FALLBACK_IMAGE)}
                alt="Received Item"
                width={160}
                height={160}
                className="h-40 w-40 cursor-pointer rounded-lg border border-slate-200 object-cover transition-opacity hover:opacity-80"
                onClick={() => receive.receivedImage && onImageClick(receive.receivedImage)}
                unoptimized
            />
        ),
    });

    return items;
}

export function PendingReceivesCount() {
    const queryClient = useQueryClient();
    const { permissions, user } = useAuthContext();
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isRejectOpen, setIsRejectOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [selectedImage, setSelectedImage] = useState<string>('');
    const [selectedReceive, setSelectedReceive] = useState<ReceiveDetails | null>(null);
    const [editData, setEditData] = useState<EditData | null>(null);
    const [isApproving, setIsApproving] = useState(false);
    const [isRejecting, setIsRejecting] = useState(false);
    const isProcessing = isApproving || isRejecting;

    const refreshPendingReceives = () => {
        void invalidatePendingApprovals(queryClient, ['receive']);
    };

    const shouldPoll = !isDetailsOpen && !isEditOpen && !isRejectOpen && !isImagePreviewOpen;
    const { data: pendingRes, isLoading } = usePendingReceivesQuery(
        Boolean(permissions?.includes('can_approve_receive') && shouldPoll)
    );
    const pendingReceives = (pendingRes?.data as PendingReceive[] | undefined) ?? [];
    const pendingCount = pendingReceives.length;

    const handleViewDetails = async (receiveId: number) => {
        try {
            const response = await API.get(`/api/receive/${receiveId}/details`);
            if (response.status === 200) {
                const receiveData: ReceiveDetails = {
                    id: response.data.receiveId,
                    requestNumber: response.data.requestNumber,
                    requestDate: response.data.requestDate,
                    receiveDate: response.data.receiveDate,
                    itemName: response.data.itemName,
                    requestedPartNumber: response.data.requestedPartNumber,
                    receivedPartNumber: response.data.receivedPartNumber,
                    requestedQuantity: response.data.requestedQuantity,
                    receivedQuantity: Number(response.data.receivedQuantity),
                    equipmentNumber: response.data.equipmentNumber,
                    unit: response.data.unit,
                    requestedUnit: response.data.requestedUnit,
                    conversionBase: response.data.conversionBase,
                    requestedImage: response.data.requestedImage,
                    receivedImage: response.data.receivedImage,
                    nacCode: response.data.nacCode || 'N/A',
                    location: response.data.location,
                    receiveSource: response.data.receiveSource,
                    tenderReferenceNumber: response.data.tenderReferenceNumber,
                    borrowReferenceNumber: response.data.borrowReferenceNumber,
                    borrowDate: response.data.borrowDate,
                    borrowSourceName: response.data.borrowSourceName,
                    borrowSourceCode: response.data.borrowSourceCode,
                    requestFk: response.data.requestFk,
                };
                setSelectedReceive(receiveData);
                setIsDetailsOpen(true);
            }
        } catch {
            showErrorToast({
                title: 'Error',
                message: 'Failed to fetch receive details',
                duration: 3000,
            });
        }
    };

    const handleImageClick = (imageUrl: string) => {
        setSelectedImage(resolveImageUrl(imageUrl, FALLBACK_IMAGE));
        setIsImagePreviewOpen(true);
    };

    const handleEditClick = () => {
        if (!selectedReceive) return;
        setEditData({
            receivedQuantity: selectedReceive.receivedQuantity,
            receivedPartNumber: selectedReceive.receivedPartNumber,
            unit: selectedReceive.unit,
            newRequestedImage: undefined,
            newReceivedImage: undefined,
        });
        setIsEditOpen(true);
    };

    const handleSaveEdit = async () => {
        if (!editData || !selectedReceive) return;
        setIsSaving(true);
        try {
            let newRequestedImagePath: string | undefined;
            let newReceivedImagePath: string | undefined;
            if (editData.newRequestedImage) {
                try {
                    const formData = new FormData();
                    formData.append('file', editData.newRequestedImage);
                    formData.append('folder', 'request');
                    const uploadResponse = await fetch(withBasePath('/api/upload'), {
                        method: 'POST',
                        body: formData,
                    });
                    if (!uploadResponse.ok) {
                        const errorData = await uploadResponse.json();
                        throw new Error(
                            `Failed to upload requested image: ${errorData.error || uploadResponse.statusText}`
                        );
                    }
                    const uploadResult = await uploadResponse.json();
                    newRequestedImagePath = uploadResult.path;
                } catch (error) {
                    throw new Error(
                        `Failed to upload requested image: ${error instanceof Error ? error.message : 'Unknown error'}`
                    );
                }
            }
            if (editData.newReceivedImage) {
                try {
                    const formData = new FormData();
                    formData.append('file', editData.newReceivedImage);
                    formData.append('folder', 'receive');
                    const uploadResponse = await fetch(withBasePath('/api/upload'), {
                        method: 'POST',
                        body: formData,
                    });
                    if (!uploadResponse.ok) {
                        const errorData = await uploadResponse.json();
                        throw new Error(
                            `Failed to upload received image: ${errorData.error || uploadResponse.statusText}`
                        );
                    }
                    const uploadResult = await uploadResponse.json();
                    newReceivedImagePath = uploadResult.path;
                } catch (error) {
                    throw new Error(
                        `Failed to upload received image: ${error instanceof Error ? error.message : 'Unknown error'}`
                    );
                }
            }
            const updatePayload: {
                receivedQuantity: number;
                receivedPartNumber: string;
                unit?: string;
                nacCode?: string;
            } = {
                receivedQuantity: editData.receivedQuantity,
                receivedPartNumber: editData.receivedPartNumber,
            };
            const trimmedNacCode = selectedReceive.nacCode?.trim();
            if (trimmedNacCode && trimmedNacCode !== 'N/A') {
                updatePayload.nacCode = trimmedNacCode;
            }
            const trimmedUnit = editData.unit?.trim();
            if (trimmedUnit) {
                updatePayload.unit = trimmedUnit;
            }
            const response = await API.put(`/api/receive/${selectedReceive.id}/update`, updatePayload);
            if (response.status === 200) {
                if (newRequestedImagePath || newReceivedImagePath) {
                    try {
                        await API.put(`/api/receive/${selectedReceive.id}/update-images`, {
                            requestedImagePath: newRequestedImagePath,
                            receivedImagePath: newReceivedImagePath,
                        });
                    } catch {
                        showErrorToast({
                            title: 'Error',
                            message:
                                'Details updated but image update failed. Please try updating images again.',
                            duration: 5000,
                        });
                    }
                }
                showSuccessToast({
                    title: 'Success',
                    message: 'Receive details updated successfully',
                    duration: 3000,
                });
                setIsEditOpen(false);
                handleViewDetails(selectedReceive.id);
            } else {
                throw new Error(response.data?.message || 'Failed to update receive details');
            }
        } catch (error) {
            showErrorToast({
                title: 'Error',
                message: error instanceof Error ? error.message : 'Failed to update receive details',
                duration: 5000,
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleRejectClick = () => {
        setIsRejectOpen(true);
    };

    const handleRejectReceive = async () => {
        if (!selectedReceive || !rejectionReason.trim() || isProcessing) {
            if (!rejectionReason.trim()) {
                showErrorToast({
                    title: 'Error',
                    message: 'Please provide a reason for rejection',
                    duration: 3000,
                });
            }
            return;
        }
        setIsRejecting(true);
        try {
            const response = await API.put(`/api/receive/${selectedReceive.id}/reject`, {
                rejectedBy: user?.UserInfo?.username,
                rejectionReason: rejectionReason.trim(),
            });
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: 'Receive rejected successfully',
                    duration: 3000,
                });
                setIsDetailsOpen(false);
                setIsRejectOpen(false);
                setRejectionReason('');
                refreshPendingReceives();
            } else {
                throw new Error(response.data?.message || 'Failed to reject receive');
            }
        } catch (error) {
            showErrorToast({
                title: 'Error',
                message: error instanceof Error ? error.message : 'Failed to reject receive',
                duration: 5000,
            });
        } finally {
            setIsRejecting(false);
        }
    };

    const handleApproveReceive = async () => {
        if (!selectedReceive || isProcessing) return;
        setIsApproving(true);
        try {
            const response = await API.put(`/api/receive/${selectedReceive.id}/approve`);
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: 'Receive approved successfully',
                    duration: 3000,
                });
                setIsDetailsOpen(false);
                refreshPendingReceives();
            } else {
                throw new Error(response.data?.message || 'Failed to approve receive');
            }
        } catch (error) {
            if (isAxiosError(error) && error.response?.status === 409) {
                setIsDetailsOpen(false);
                refreshPendingReceives();
                showSuccessToast({
                    title: 'Already processed',
                    message: 'This receive was already approved.',
                    duration: 3000,
                });
                return;
            }
            showErrorToast({
                title: 'Error',
                message: error instanceof Error ? error.message : 'Failed to approve receive',
                duration: 5000,
            });
        } finally {
            setIsApproving(false);
        }
    };

    const handleApproveAndClose = async () => {
        if (!selectedReceive || isProcessing) return;
        setIsApproving(true);
        try {
            const response = await API.put(`/api/receive/${selectedReceive.id}/approve-and-close`);
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: 'Receive approved and request force-closed',
                    duration: 3000,
                });
                setIsDetailsOpen(false);
                refreshPendingReceives();
            } else {
                throw new Error(response.data?.message || 'Failed to approve and close');
            }
        } catch (error) {
            if (isAxiosError(error) && error.response?.status === 409) {
                setIsDetailsOpen(false);
                refreshPendingReceives();
                showSuccessToast({
                    title: 'Already processed',
                    message: 'This receive was already approved.',
                    duration: 3000,
                });
                return;
            }
            showErrorToast({
                title: 'Error',
                message: error instanceof Error ? error.message : 'Failed to approve and close',
                duration: 5000,
            });
        } finally {
            setIsApproving(false);
        }
    };

    const handleCloseEditModal = () => {
        setIsEditOpen(false);
        setEditData(null);
        setIsSaving(false);
    };

    const handleImageChange = (type: 'requested' | 'received', file: File) => {
        if (!editData) return;
        setEditData((prev) =>
            prev
                ? {
                      ...prev,
                      [type === 'requested' ? 'newRequestedImage' : 'newReceivedImage']: file,
                  }
                : null
        );
    };

    const showApproveAndClose =
        Boolean(selectedReceive?.requestFk) &&
        (selectedReceive?.requestFk ?? 0) > 0 &&
        selectedReceive?.receiveSource !== 'tender';

    const requestedColumnTitle =
        selectedReceive?.receiveSource === 'tender'
            ? 'Tender Details'
            : selectedReceive?.receiveSource === 'borrow'
              ? 'Borrow Details'
              : 'Requested Details';

    if (!permissions?.includes('can_approve_receive')) {
        return null;
    }

    if (isLoading) {
        return (
            <div className="flex h-24 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-3 border-[#003594] border-t-transparent" />
            </div>
        );
    }

    return (
        <>
            <Card
                className="cursor-pointer border-[#002a6e]/10 transition-colors hover:bg-[#003594]/5"
                onClick={() => setIsOpen(true)}
            >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-base font-semibold text-[#003594]">
                        Pending Receives
                    </CardTitle>
                    <Package className="h-5 w-5 text-[#003594]" />
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-3xl font-bold text-[#003594]">...</div>
                    ) : (
                        <div className="text-3xl font-bold text-[#003594]">{pendingCount ?? 0}</div>
                    )}
                    <p className="mt-1 text-sm text-gray-500">Items awaiting approval</p>
                </CardContent>
            </Card>

            <ApprovalListModal
                open={isOpen}
                onOpenChange={setIsOpen}
                title="Pending Receives"
                description="Review and manage pending receives"
                count={pendingCount}
                isEmpty={!isLoading && pendingReceives.length === 0}
                emptyMessage="No pending receives"
                size="xl"
            >
                {pendingReceives.map((receive) => (
                    <ApprovalListCard
                        key={receive.id}
                        onView={() => handleViewDetails(receive.id)}
                        onClick={() => handleViewDetails(receive.id)}
                        hint="Double-click or tap to view full details"
                    >
                        <ApprovalMetaGrid
                            columns={3}
                            items={[
                                { label: 'NAC Code', value: receive.nacCode },
                                { label: 'Item Name', value: receive.itemName },
                                { label: 'Part Number', value: receive.partNumber },
                                { label: 'Received Quantity', value: receive.receivedQuantity },
                                { label: 'Equipment Number', value: receive.equipmentNumber || 'N/A' },
                                {
                                    label: 'Received Date',
                                    value: formatApprovalDate(receive.receiveDate),
                                },
                            ]}
                        />
                    </ApprovalListCard>
                ))}
            </ApprovalListModal>

            <ApprovalDetailModal
                open={isDetailsOpen}
                onOpenChange={setIsDetailsOpen}
                title="Receive Details"
                description={
                    selectedReceive?.receiveSource === 'tender'
                        ? `Tender Reference: ${selectedReceive?.tenderReferenceNumber || 'N/A'}`
                        : selectedReceive?.receiveSource === 'borrow'
                          ? `Borrowed from: ${selectedReceive?.borrowSourceName || 'N/A'}`
                          : `Request #${selectedReceive?.requestNumber}`
                }
                badges={
                    selectedReceive?.receiveSource === 'borrow' ? (
                        <span className="rounded-full border border-blue-200 bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                            BORROWED
                        </span>
                    ) : undefined
                }
                meta={
                    selectedReceive ? (
                        <ApprovalMetaGrid
                            columns={3}
                            items={buildHeaderSummaryItems(selectedReceive)}
                            className="mt-1"
                        />
                    ) : undefined
                }
                processing={isProcessing}
                processingLabel={isApproving ? 'Approving receive…' : 'Rejecting receive…'}
                size="xl"
                actions={
                    <ApprovalActionBar
                        onEdit={handleEditClick}
                        onApprove={handleApproveReceive}
                        onReject={handleRejectClick}
                        isApproving={isApproving}
                        isRejecting={isRejecting}
                        editLabel="Edit Details"
                        extraActions={
                            showApproveAndClose ? (
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={isProcessing}
                                    onClick={handleApproveAndClose}
                                    className="w-full bg-emerald-600 hover:bg-emerald-700 sm:w-auto"
                                >
                                    <Check className="mr-1.5 h-4 w-4" />
                                    Approve & Close Request
                                </Button>
                            ) : undefined
                        }
                    />
                }
            >
                {selectedReceive && (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
                        <div className="space-y-3">
                            <h3 className="text-base font-semibold text-[#003594]">
                                {requestedColumnTitle}
                            </h3>
                            <ApprovalMetaGrid
                                columns={1}
                                items={buildRequestedColumnItems(selectedReceive, handleImageClick)}
                            />
                        </div>
                        <div className="space-y-3">
                            <h3 className="text-base font-semibold text-[#003594]">Received Details</h3>
                            <ApprovalMetaGrid
                                columns={1}
                                items={buildReceivedColumnItems(selectedReceive, handleImageClick)}
                            />
                        </div>
                    </div>
                )}
            </ApprovalDetailModal>

            <ApprovalModalShell
                open={isEditOpen}
                onOpenChange={setIsEditOpen}
                size="md"
                layout="flex"
            >
                <ApprovalModalHeaderSection>
                    <ModalTitle className={`text-xl font-semibold ${approvalTheme.titleGradient}`}>
                        Edit Receive Details
                    </ModalTitle>
                </ApprovalModalHeaderSection>
                <ApprovalModalBody>
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="receivedPartNumber" className="text-[#003594]">
                                Received Part Number
                            </Label>
                            <Input
                                id="receivedPartNumber"
                                value={editData?.receivedPartNumber || ''}
                                onChange={(e) =>
                                    setEditData((prev) =>
                                        prev ? { ...prev, receivedPartNumber: e.target.value } : null
                                    )
                                }
                                className="border-slate-200 focus:border-[#003594] focus:ring-[#003594]/20"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="receivedQuantity" className="text-[#003594]">
                                Received Quantity
                            </Label>
                            <Input
                                id="receivedQuantity"
                                type="number"
                                value={editData?.receivedQuantity || ''}
                                onChange={(e) =>
                                    setEditData((prev) =>
                                        prev
                                            ? { ...prev, receivedQuantity: parseInt(e.target.value) || 0 }
                                            : null
                                    )
                                }
                                className="border-slate-200 focus:border-[#003594] focus:ring-[#003594]/20"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="unit" className="text-[#003594]">
                                Unit
                            </Label>
                            <Input
                                id="unit"
                                value={editData?.unit || ''}
                                onChange={(e) =>
                                    setEditData((prev) => (prev ? { ...prev, unit: e.target.value } : null))
                                }
                                className="border-slate-200 focus:border-[#003594] focus:ring-[#003594]/20"
                            />
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-[#003594]">Update Images</h3>

                            <div className="space-y-3">
                                <Label className="font-medium text-[#003594]">Requested Image</Label>
                                <div className="flex items-center gap-4">
                                    {selectedReceive?.requestedImage && (
                                        <div className="relative">
                                            <Image
                                                src={resolveImageUrl(
                                                    selectedReceive.requestedImage,
                                                    FALLBACK_IMAGE
                                                )}
                                                alt="Current Requested Image"
                                                width={80}
                                                height={80}
                                                className="h-20 w-20 rounded-lg border border-slate-200 object-cover"
                                                unoptimized
                                                onError={(e) => {
                                                    const target = e.target as HTMLImageElement;
                                                    target.src = withBasePath(FALLBACK_IMAGE);
                                                }}
                                            />
                                            <div className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs text-white">
                                                Current
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex-1">
                                        <Input
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) handleImageChange('requested', file);
                                            }}
                                            className="border-slate-200 focus:border-[#003594] focus:ring-[#003594]/20"
                                        />
                                        <p className="mt-1 text-xs text-slate-500">
                                            {editData?.newRequestedImage
                                                ? `New image: ${editData.newRequestedImage.name}`
                                                : 'Select new image to replace current'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <Label className="font-medium text-[#003594]">Received Image</Label>
                                <div className="flex items-center gap-4">
                                    {selectedReceive?.receivedImage && (
                                        <div className="relative">
                                            <Image
                                                src={resolveImageUrl(
                                                    selectedReceive.receivedImage,
                                                    FALLBACK_IMAGE
                                                )}
                                                alt="Current Received Image"
                                                width={80}
                                                height={80}
                                                className="h-20 w-20 rounded-lg border border-slate-200 object-cover"
                                                unoptimized
                                                onError={(e) => {
                                                    const target = e.target as HTMLImageElement;
                                                    target.src = withBasePath(FALLBACK_IMAGE);
                                                }}
                                            />
                                            <div className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-xs text-white">
                                                Current
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex-1">
                                        <Input
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) handleImageChange('received', file);
                                            }}
                                            className="border-slate-200 focus:border-[#003594] focus:ring-[#003594]/20"
                                        />
                                        <p className="mt-1 text-xs text-slate-500">
                                            {editData?.newReceivedImage
                                                ? `New image: ${editData.newReceivedImage.name}`
                                                : 'Select new image to replace current'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </ApprovalModalBody>
                <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
                    <Button
                        variant="outline"
                        onClick={handleCloseEditModal}
                        className="w-full border-slate-200 hover:bg-[#003594]/5 hover:text-[#003594] sm:w-auto"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSaveEdit}
                        disabled={isSaving}
                        className="w-full bg-[#003594] hover:bg-[#003594]/90 disabled:opacity-50 sm:w-auto"
                    >
                        {isSaving ? (
                            <>
                                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                Saving...
                            </>
                        ) : (
                            'Save Changes'
                        )}
                    </Button>
                </div>
            </ApprovalModalShell>

            <ApprovalRejectModal
                open={isRejectOpen}
                onOpenChange={setIsRejectOpen}
                title="Reject Receive"
                description="Please provide a reason for rejecting this receive."
                reason={rejectionReason}
                onReasonChange={setRejectionReason}
                onConfirm={handleRejectReceive}
                onCancel={() => setRejectionReason('')}
                isRejecting={isRejecting}
                confirmLabel="Reject Receive"
            />

            <ApprovalImagePreviewModal
                open={isImagePreviewOpen}
                onOpenChange={setIsImagePreviewOpen}
                src={selectedImage || withBasePath(FALLBACK_IMAGE)}
                title="Image Preview"
            />
        </>
    );
}
