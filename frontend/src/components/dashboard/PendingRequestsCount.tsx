'use client';
import { useState, useCallback, useMemo } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { usePendingRequestsQuery, useRequestItemsQuery } from '@/hooks/api/usePendingRequests';
import { useApiPut } from '@/hooks/api/useApiMutation';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { invalidatePendingApprovals } from '@/lib/invalidatePendingApprovals';
import { isAxiosError } from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal, ModalTrigger, ModalTitle } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRequestingAuthorities } from '@/app/request/useRequestingAuthorities';
import Image from 'next/image';
import { resolveImageUrl, withBasePath } from '@/lib/urls';
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
    ApprovalResponsiveTable,
    ApprovalImagePreviewModal,
    ApprovalAlertBanner,
    formatApprovalDate,
    type ApprovalTableColumn,
    personDetailsMetaBlock,
} from '@/components/approvals';
import type { PersonDetails } from '@/types/personDetails';

interface PendingRequest {
    requestId: number;
    nacCode: string;
    requestNumber: string;
    requestDate: string;
    requestedBy: string;
    requestedByDetails?: PersonDetails;
}
interface RequestItem {
    id: number;
    requestNumber: string;
    itemName: string;
    partNumber: string;
    nacCode: string;
    equipmentNumber: string;
    requestedQuantity: number;
    imageUrl: string;
    specifications: string;
    remarks: string;
    unit?: string;
    requestedById?: number | null;
    requestedByEmail?: string | null;
    requestedBy?: string | null;
    requestedByDetails?: PersonDetails;
}
interface EditItemData {
    id: number;
    itemName: string;
    partNumber: string;
    nacCode: string;
    equipmentNumber: string;
    requestedQuantity: number;
    unit?: string;
    specifications: string;
    remarks: string;
    imageUrl: string;
    newImage?: File;
    requestedById?: number | null;
    requestedByEmail?: string | null;
}
export function PendingRequestsCount() {
    const queryClient = useQueryClient();
    const { permissions, user } = useAuthContext();
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const { data: authorityOptions, isLoading: isLoadingAuthorities } = useRequestingAuthorities();
    const [isOpen, setIsOpen] = useState(false);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isRejectOpen, setIsRejectOpen] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [selectedImage, setSelectedImage] = useState<string>('');
    const [selectedRequestNumber, setSelectedRequestNumber] = useState<string | null>(null);
    const [selectedRequestDate, setSelectedRequestDate] = useState<string>('');
    const [editData, setEditData] = useState<{
        requestNumber: string;
        requestDate: Date;
        remarks: string;
        items: EditItemData[];
    } | null>(null);
    
    const shouldPoll = !isDetailsOpen && !isEditOpen && !isRejectOpen;
    const { data: pendingRes, isLoading } = usePendingRequestsQuery(
        permissions?.includes('can_approve_request') && shouldPoll
    );
    
    const pendingRequestsData = pendingRes?.data as PendingRequest[] | undefined;
    const pendingRequests = useMemo(() => {
        if (!pendingRequestsData) return [];
        return pendingRequestsData.reduce((acc: PendingRequest[], curr: PendingRequest) => {
            if (!acc.find(req => req.requestNumber === curr.requestNumber)) {
                acc.push(curr);
            }
            return acc;
        }, []);
    }, [pendingRequestsData]);
    
    const pendingCount = pendingRequests.length;
    
    const { data: requestItemsRes } = useRequestItemsQuery(selectedRequestNumber, isDetailsOpen && selectedRequestNumber !== null);
    const requestItems = requestItemsRes?.data as RequestItem[] | undefined;
    
    const selectedRequest = useMemo(() => {
        if (!requestItems || !selectedRequestNumber) return null;
        const pendingRequest = pendingRequests.find(req => req.requestNumber === selectedRequestNumber);
        return {
            items: requestItems,
            requestNumber: selectedRequestNumber,
            requestDate: selectedRequestDate,
            remarks: requestItems[0]?.remarks || '',
            requestedBy:
                pendingRequest?.requestedByDetails?.name ||
                requestItems[0]?.requestedByDetails?.name ||
                pendingRequest?.requestedBy ||
                requestItems[0]?.requestedBy ||
                '',
            requestedByDetails:
                pendingRequest?.requestedByDetails ||
                requestItems[0]?.requestedByDetails ||
                null,
        };
    }, [requestItems, selectedRequestNumber, selectedRequestDate, pendingRequests]);
    
    const updateRequestMutation = useApiPut({
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.request.pending() });
            queryClient.invalidateQueries({ queryKey: queryKeys.request.items(selectedRequestNumber!) });
            showSuccessToast({
                title: 'Success',
                message: "Request updated successfully",
                duration: 3000,
            });
            setIsEditOpen(false);
            if (selectedRequestNumber) {
                queryClient.invalidateQueries({ queryKey: queryKeys.request.items(selectedRequestNumber) });
            }
        },
        onError: (error: unknown) => {
            showErrorToast({
                title: 'Error',
                message: error instanceof Error ? error.message : "Failed to update request",
                duration: 5000,
            });
        }
    });
    
    const approveRequestMutation = useApiPut({
        onSuccess: () => {
            void invalidatePendingApprovals(queryClient, ['request']);
            showSuccessToast({
                title: 'Success',
                message: "Request approved successfully",
                duration: 3000,
            });
            setIsDetailsOpen(false);
        },
        onError: async (error: unknown) => {
            if (isAxiosError(error) && error.response?.status === 409) {
                void invalidatePendingApprovals(queryClient, ['request']);
                setIsDetailsOpen(false);
                showSuccessToast({
                    title: 'Already processed',
                    message: 'This request was already approved.',
                    duration: 3000,
                });
                return;
            }
            showErrorToast({
                title: 'Error',
                message: error instanceof Error ? error.message : "Failed to approve request",
                duration: 5000,
            });
        }
    });
    
    const rejectRequestMutation = useApiPut({
        onSuccess: () => {
            void invalidatePendingApprovals(queryClient, ['request']);
            showSuccessToast({
                title: 'Success',
                message: "Request rejected successfully",
                duration: 3000,
            });
            setIsDetailsOpen(false);
            setIsRejectOpen(false);
            setRejectionReason('');
        },
        onError: (error: unknown) => {
            showErrorToast({
                title: 'Error',
                message: error instanceof Error ? error.message : "Failed to reject request",
                duration: 5000,
            });
        }
    });
    
    const handleViewDetails = useCallback((requestNumber: string, requestDate: string) => {
        setSelectedRequestNumber(requestNumber);
        setSelectedRequestDate(requestDate);
        setIsDetailsOpen(true);
    }, []);
    const handleImageClick = (imageUrl: string) => {
        setSelectedImage(resolveImageUrl(imageUrl, '/images/nepal_airlines_logo.png'));
        setIsImagePreviewOpen(true);
    };
    const handleEditClick = useCallback(() => {
        if (!selectedRequest)
            return;
        setEditData({
            requestNumber: selectedRequest.requestNumber,
            requestDate: new Date(selectedRequest.requestDate),
            remarks: selectedRequest.remarks,
            items: selectedRequest.items.map(item => ({
                ...item,
                newImage: undefined
            }))
        });
        setIsEditOpen(true);
    }, [selectedRequest]);
    const handleImageChange = (itemId: number, file: File) => {
        if (!editData)
            return;
        setEditData({
            ...editData,
            items: editData.items.map(item => item.id === itemId ? { ...item, newImage: file } : item)
        });
    };
    const handleSaveEdit = useCallback(() => {
        if (!editData || !selectedRequestNumber)
            return;
        const formatDateForAPI = (date: Date): string => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };
        const requestData = {
            requestNumber: editData.requestNumber,
            requestDate: formatDateForAPI(editData.requestDate),
            remarks: editData.remarks,
            items: editData.items.map(item => ({
                id: item.id,
                itemName: item.itemName,
                partNumber: item.partNumber,
                nacCode: item.nacCode,
                equipmentNumber: item.equipmentNumber,
                requestedQuantity: item.requestedQuantity,
                unit: item.unit,
                specifications: item.specifications,
                remarks: item.remarks,
                imageUrl: item.imageUrl,
                requestedById: item.requestedById ?? null,
                requestedByEmail: item.requestedByEmail ?? null
            }))
        };
        updateRequestMutation.mutate({ url: `/api/request/${selectedRequestNumber}`, data: requestData });
    }, [editData, selectedRequestNumber, updateRequestMutation]);
    
    const handleApproveRequest = useCallback(() => {
        if (!selectedRequestNumber)
            return;
        approveRequestMutation.mutate({
            url: `/api/request/${selectedRequestNumber}/approve`,
            data: { approvedBy: user?.UserInfo?.username }
        });
    }, [selectedRequestNumber, user?.UserInfo?.username, approveRequestMutation]);
    const handleRejectClick = () => {
        setIsRejectOpen(true);
    };
    const handleRejectRequest = useCallback(() => {
        if (!selectedRequestNumber || !rejectionReason.trim()) {
            showErrorToast({
                title: 'Error',
                message: "Please provide a reason for rejection",
                duration: 3000,
            });
            return;
        }
        rejectRequestMutation.mutate({
            url: `/api/request/${selectedRequestNumber}/reject`,
            data: {
                rejectedBy: user?.UserInfo?.username,
                rejectionReason: rejectionReason.trim()
            }
        });
    }, [selectedRequestNumber, rejectionReason, user?.UserInfo?.username, rejectRequestMutation, showErrorToast]);
    const isApprovingRequest = approveRequestMutation.isPending;
    const isRejectingRequest = rejectRequestMutation.isPending;
    const isProcessingRequest = isApprovingRequest || isRejectingRequest;

    const requestItemColumns = useMemo<ApprovalTableColumn<RequestItem>[]>(() => [
        { id: 'nacCode', header: 'NAC Code', cell: (item) => item.nacCode },
        { id: 'itemName', header: 'Item Name', cell: (item) => item.itemName },
        { id: 'partNumber', header: 'Part Number', cell: (item) => item.partNumber },
        { id: 'equipmentNumber', header: 'Equipment Number', cell: (item) => item.equipmentNumber },
        { id: 'quantity', header: 'Quantity', cell: (item) => item.requestedQuantity },
        { id: 'unit', header: 'Unit', cell: (item) => item.unit || '—' },
        { id: 'specifications', header: 'Specifications', cell: (item) => item.specifications || '—' },
        {
            id: 'image',
            header: 'Image',
            cell: (item) => (
                <Image
                    src={resolveImageUrl(item.imageUrl, '/images/nepal_airlines_logo.png')}
                    alt={item.itemName}
                    width={64}
                    height={64}
                    className="h-16 w-16 cursor-pointer rounded-lg border border-slate-200 object-cover transition-opacity hover:opacity-80"
                    onClick={() => item.imageUrl && handleImageClick(item.imageUrl)}
                    onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = withBasePath('/images/nepal_airlines_logo.png');
                    }}
                    unoptimized
                />
            ),
        },
    ], []);

    if (!permissions?.includes('can_approve_request')) {
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
              <CardTitle className="text-base font-semibold text-[#003594]">Pending Requests</CardTitle>
              <FileText className="h-5 w-5 text-[#003594]"/>
            </CardHeader>
            <CardContent>
              {isLoading ? (<div className="text-3xl font-bold text-[#003594]">...</div>) : (<div className="text-3xl font-bold text-[#003594]">{pendingCount ?? 0}</div>)}
              <p className="text-sm text-gray-500 mt-1">Requests awaiting approval</p>
            </CardContent>
          </Card>
        </ModalTrigger>
      </Modal>

      <ApprovalListModal
        open={isOpen}
        onOpenChange={setIsOpen}
        title="Pending Requests"
        description={`You have ${pendingCount ?? 0} pending request${pendingCount !== 1 ? 's' : ''} that need your attention.`}
        count={pendingCount}
        isEmpty={!isLoading && pendingRequests.length === 0}
        emptyMessage="No pending requests"
        size="xl"
      >
        {pendingRequests.map((request) => (
          <ApprovalListCard
            key={request.requestId}
            onView={() => handleViewDetails(request.requestNumber, request.requestDate)}
            onClick={() => handleViewDetails(request.requestNumber, request.requestDate)}
            viewLabel="View Details"
            hint="Tap to review request details"
          >
            <ApprovalMetaGrid
              columns={4}
              items={[
                { label: 'Request #', value: request.requestNumber },
                { label: 'NAC Code', value: request.nacCode },
                { label: 'Date', value: formatApprovalDate(request.requestDate) },
                personDetailsMetaBlock('Requested By', request.requestedByDetails),
              ]}
            />
          </ApprovalListCard>
        ))}
      </ApprovalListModal>

      <ApprovalDetailModal
        open={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
        title={`Request Details #${selectedRequest?.requestNumber ?? ''}`}
        description={
          selectedRequest ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Request date: {formatApprovalDate(selectedRequest.requestDate)}</span>
            </span>
          ) : undefined
        }
        meta={
          selectedRequest?.requestedByDetails ? (
            <ApprovalMetaGrid
              columns={4}
              items={[personDetailsMetaBlock('Requested By', selectedRequest.requestedByDetails)]}
              className="mt-1"
            />
          ) : undefined
        }
        alert={
          selectedRequest?.remarks ? (
            <ApprovalAlertBanner variant="info">
              <span className="font-medium">Remarks: </span>
              {selectedRequest.remarks}
            </ApprovalAlertBanner>
          ) : undefined
        }
        processing={isProcessingRequest}
        processingLabel={isApprovingRequest ? 'Approving request…' : 'Rejecting request…'}
        size="full"
        actions={
          <ApprovalActionBar
            onEdit={handleEditClick}
            onApprove={handleApproveRequest}
            onReject={handleRejectClick}
            isApproving={isApprovingRequest}
            isRejecting={isRejectingRequest}
            editLabel="Edit Details"
          />
        }
      >
        <ApprovalResponsiveTable
          columns={requestItemColumns}
          rows={selectedRequest?.items ?? []}
          getRowKey={(item) => item.id}
          emptyMessage="No items in this request"
        />
      </ApprovalDetailModal>

      <ApprovalModalShell open={isEditOpen} onOpenChange={setIsEditOpen} size="xl" layout="flex">
        <ApprovalModalHeaderSection>
          <ModalTitle className="text-xl font-semibold text-[#003594]">Edit Request Details</ModalTitle>
        </ApprovalModalHeaderSection>
        <ApprovalModalBody>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="requestNumber" className="text-[#003594] font-medium">Request Number</Label>
                <Input id="requestNumber" value={editData?.requestNumber || ''} onChange={(e) => setEditData(prev => prev ? { ...prev, requestNumber: e.target.value } : null)} className="border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20 transition-colors"/>
              </div>
              <div className="space-y-2">
                <Label className="text-[#003594] font-medium">Request Date</Label>
                <Calendar value={editData?.requestDate} onChange={(date: Date | null) => setEditData(prev => prev ? { ...prev, requestDate: date || prev.requestDate } : null)} className="rounded-lg border border-[#002a6e]/10 transition-colors hover:border-[#003594]/30"/>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="remarks" className="text-[#003594] font-medium">Remarks</Label>
              <Textarea id="remarks" value={editData?.remarks || ''} onChange={(e) => setEditData(prev => prev ? { ...prev, remarks: e.target.value } : null)} className="min-h-[100px] border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20 transition-colors"/>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-[#003594]">Items</h3>
              <div className="space-y-6">
                {editData?.items.map((item) => (<div key={item.id} className="border border-[#002a6e]/10 rounded-lg p-6 space-y-6 bg-white hover:shadow-md transition-all duration-200">
                                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div className="space-y-2">
                         <Label className="text-[#003594] font-medium">Item Name</Label>
                         <Input value={item.itemName || ''} onChange={(e) => setEditData(prev => prev ? {
                ...prev,
                items: prev.items.map(i => i.id === item.id ? { ...i, itemName: e.target.value } : i)
            } : null)} className="border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20 transition-colors"/>
                       </div>
                       <div className="space-y-2">
                         <Label className="text-[#003594] font-medium">NAC Code</Label>
                         <Input value={item.nacCode || ''} onChange={(e) => setEditData(prev => prev ? {
                ...prev,
                items: prev.items.map(i => i.id === item.id ? { ...i, nacCode: e.target.value } : i)
            } : null)} className="border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20 transition-colors"/>
                       </div>
                       <div className="space-y-2">
                         <Label className="text-[#003594] font-medium">Part Number</Label>
                         <Input value={item.partNumber} onChange={(e) => setEditData(prev => prev ? {
                ...prev,
                items: prev.items.map(i => i.id === item.id ? { ...i, partNumber: e.target.value } : i)
            } : null)} className="border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20 transition-colors"/>
                       </div>
                       <div className="space-y-2">
                         <Label className="text-[#003594] font-medium">Equipment Number</Label>
                         <Input value={item.equipmentNumber} onChange={(e) => setEditData(prev => prev ? {
                ...prev,
                items: prev.items.map(i => i.id === item.id ? { ...i, equipmentNumber: e.target.value } : i)
            } : null)} className="border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20 transition-colors"/>
                       </div>
                       <div className="space-y-2">
                         <Label className="text-[#003594] font-medium">Quantity</Label>
                         <Input type="number" min="1" value={item.requestedQuantity} onChange={(e) => setEditData(prev => prev ? {
                ...prev,
                items: prev.items.map(i => i.id === item.id ? { ...i, requestedQuantity: parseInt(e.target.value) || 0 } : i)
            } : null)} className="border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20 transition-colors"/>
                       </div>
                       <div className="space-y-2">
                         <Label className="text-[#003594] font-medium">Unit</Label>
                         <Input value={item.unit || ''} onChange={(e) => setEditData(prev => prev ? {
                ...prev,
                items: prev.items.map(i => i.id === item.id ? { ...i, unit: e.target.value } : i)
            } : null)} className="border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20 transition-colors"/>
                       </div>
                       <div className="space-y-2">
                         <Label className="text-[#003594] font-medium">Requested By *</Label>
                         <Select value={item.requestedById?.toString() || ''} onValueChange={(value) => {
                const selected = authorityOptions?.find(a => a.id.toString() === value);
                if (selected) {
                    setEditData(prev => prev ? {
                        ...prev,
                        items: prev.items.map(i => i.id === item.id ? {
                            ...i,
                            requestedById: selected.id,
                            requestedByEmail: selected.email || null
                        } : i)
                    } : null);
                }
                else {
                    setEditData(prev => prev ? {
                        ...prev,
                        items: prev.items.map(i => i.id === item.id ? {
                            ...i,
                            requestedById: null,
                            requestedByEmail: null
                        } : i)
                    } : null);
                }
            }}>
                           <SelectTrigger className="border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20 transition-colors">
                             <SelectValue placeholder="Select requesting authority"/>
                           </SelectTrigger>
                           <SelectContent>
                             {isLoadingAuthorities ? (<SelectItem value="loading" disabled>Loading...</SelectItem>) : authorityOptions && authorityOptions.length > 0 ? (authorityOptions.map((authority) => (<SelectItem key={authority.id} value={authority.id.toString()}>
                                   {authority.name} {authority.designation ? `(${authority.designation})` : ''}
                                 </SelectItem>))) : (<SelectItem value="none" disabled>No authorities available</SelectItem>)}
                           </SelectContent>
                         </Select>
                       </div>
                     </div>
                    
                    <div className="space-y-2">
                      <Label className="text-[#003594] font-medium">Specifications</Label>
                      <Textarea value={item.specifications} onChange={(e) => setEditData(prev => prev ? {
                ...prev,
                items: prev.items.map(i => i.id === item.id ? { ...i, specifications: e.target.value } : i)
            } : null)} className="min-h-[80px] border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20 transition-colors"/>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[#003594] font-medium">Image</Label>
                      <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                        {item.imageUrl && (<Image src={resolveImageUrl(item.imageUrl, '/images/nepal_airlines_logo.png')} alt={item.itemName} width={96} height={96} className="w-24 h-24 object-cover rounded-lg border border-[#002a6e]/10 hover:opacity-80 transition-opacity" unoptimized={item.imageUrl.startsWith('http')}/>)}
                        <div className="flex-1 w-full">
                          <Input type="file" accept="image/*" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                    handleImageChange(item.id, file);
            }} className="w-full border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20 transition-colors"/>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button variant="destructive" size="sm" onClick={() => setEditData(prev => prev ? {
                ...prev,
                items: prev.items.filter(i => i.id !== item.id)
            } : null)} className="bg-[#d2293b] hover:bg-[#d2293b]/90 transition-colors">
                        Delete Item
                      </Button>
                    </div>
                  </div>))}
              </div>
            </div>
          </div>
        </ApprovalModalBody>
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
          <Button variant="outline" onClick={() => setIsEditOpen(false)} className="w-full border-[#002a6e]/20 hover:bg-[#003594]/5 hover:text-[#003594] sm:w-auto">
            Cancel
          </Button>
          <Button onClick={handleSaveEdit} className="w-full bg-[#003594] hover:bg-[#003594]/90 text-white sm:w-auto">
            Save Changes
          </Button>
        </div>
      </ApprovalModalShell>

      <ApprovalImagePreviewModal
        open={isImagePreviewOpen}
        onOpenChange={setIsImagePreviewOpen}
        src={selectedImage || withBasePath('/images/nepal_airlines_logo.png')}
        alt="Preview"
        title="Image Preview"
      />

      <ApprovalRejectModal
        open={isRejectOpen}
        onOpenChange={setIsRejectOpen}
        title="Reject Request"
        description="Please provide a reason for rejecting this request."
        reason={rejectionReason}
        onReasonChange={setRejectionReason}
        onConfirm={handleRejectRequest}
        onCancel={() => setRejectionReason('')}
        isRejecting={isRejectingRequest}
        confirmLabel="Confirm Rejection"
      />
    </>);
}
