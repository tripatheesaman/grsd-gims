'use client';
import { useState, useCallback, useMemo } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { usePendingRequestsQuery, useRequestItemsQuery } from '@/hooks/api/usePendingRequests';
import { useApiPut } from '@/hooks/api/useApiMutation';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { FileText, Eye, X, Pencil, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription, ModalTrigger, } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRequestingAuthorities } from '@/app/request/useRequestingAuthorities';
import Image from 'next/image';
import { resolveImageUrl, withBasePath } from '@/lib/urls';
interface PendingRequest {
    requestId: number;
    nacCode: string;
    requestNumber: string;
    requestDate: string;
    requestedBy: string;
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
            requestedBy: pendingRequest?.requestedBy || requestItems[0]?.requestedBy || ''
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
            queryClient.invalidateQueries({ queryKey: queryKeys.request.pending() });
            showSuccessToast({
                title: 'Success',
                message: "Request approved successfully",
                duration: 3000,
            });
            setIsDetailsOpen(false);
        },
        onError: (error: unknown) => {
            showErrorToast({
                title: 'Error',
                message: error instanceof Error ? error.message : "Failed to approve request",
                duration: 5000,
            });
        }
    });
    
    const rejectRequestMutation = useApiPut({
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.request.pending() });
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
        <ModalContent className="max-w-3xl bg-white rounded-xl shadow-xl border-[#002a6e]/10">
          <ModalHeader className="border-b border-[#002a6e]/10 pb-4">
            <ModalTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
              Pending Requests
            </ModalTitle>
            <ModalDescription className="text-gray-600 mt-2">
              You have {pendingCount ?? 0} pending request{pendingCount !== 1 ? 's' : ''} that need your attention.
            </ModalDescription>
          </ModalHeader>
                        <div className="mt-6 space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {pendingRequests.map((request) => (<div key={request.requestId} className="rounded-lg border border-[#002a6e]/10 p-6 hover:bg-[#003594]/5 transition-all duration-200 hover:shadow-md">
                    <div className="grid grid-cols-5 gap-4 items-center">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-[#003594]">Request #</p>
                        <p className="text-lg font-semibold text-gray-900">{request.requestNumber}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-[#003594]">NAC Code</p>
                        <p className="text-lg font-semibold text-gray-900">{request.nacCode}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-[#003594]">Date</p>
                        <p className="text-lg font-semibold text-gray-900">{new Date(request.requestDate).toLocaleDateString()}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-[#003594]">Requested By</p>
                        <p className="text-lg font-semibold text-gray-900">{request.requestedBy}</p>
                      </div>
                      <div className="flex justify-end">
                        <Button onClick={() => handleViewDetails(request.requestNumber, request.requestDate)} className="flex items-center gap-2 bg-[#003594] hover:bg-[#003594]/90 text-white transition-colors">
                          <Eye className="h-4 w-4"/>
                          View Details
                        </Button>
                      </div>
                    </div>
                  </div>))}
              </div>
        </ModalContent>
      </Modal>

      <Modal open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <ModalContent className="max-w-5xl bg-white rounded-xl shadow-xl border-[#002a6e]/10">
          <ModalHeader className="border-b border-[#002a6e]/10 pb-4">
            <div className="flex justify-between items-center">
              <div>
                <ModalTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
                  Request Details #{selectedRequest?.requestNumber}
                </ModalTitle>
                <div className="mt-2 text-gray-600 space-y-2">
                  <div className="flex items-center gap-4">
                    <span>Request Date: {selectedRequest?.requestDate && new Date(selectedRequest.requestDate).toLocaleDateString()}</span>
                    <span className="h-1 w-1 rounded-full bg-gray-400"></span>
                    <span>Requested By: {selectedRequest?.requestedBy}</span>
                  </div>
                  {selectedRequest?.remarks && (<div className="mt-2 p-3 bg-gray-50 rounded-lg border border-[#002a6e]/10">
                      <span className="font-medium text-[#003594]">Remarks: </span>
                      {selectedRequest.remarks}
                    </div>)}
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" size="sm" className="flex items-center gap-2 border-[#002a6e]/20 hover:bg-[#003594]/5 hover:text-[#003594] transition-colors" onClick={handleEditClick}>
                  <Pencil className="h-4 w-4"/>
                  Edit Details
                </Button>
                <Button variant="default" size="sm" className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white transition-colors" onClick={handleApproveRequest}>
                  <Check className="h-4 w-4"/>
                  Approve
                </Button>
                <Button variant="destructive" size="sm" className="flex items-center gap-2 bg-[#d2293b] hover:bg-[#d2293b]/90 transition-colors" onClick={handleRejectClick}>
                  <X className="h-4 w-4"/>
                  Reject
                </Button>
              </div>
            </div>
          </ModalHeader>
          <div className="mt-6">
            <div className="overflow-x-auto rounded-lg border border-[#002a6e]/10">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#003594]/5">
                    <th className="text-left p-4 font-semibold text-[#003594]">NAC Code</th>
                    <th className="text-left p-4 font-semibold text-[#003594]">Item Name</th>
                    <th className="text-left p-4 font-semibold text-[#003594]">Part Number</th>
                    <th className="text-left p-4 font-semibold text-[#003594]">Equipment Number</th>
                    <th className="text-left p-4 font-semibold text-[#003594]">Quantity</th>
                    <th className="text-left p-4 font-semibold text-[#003594]">Unit</th>
                    <th className="text-left p-4 font-semibold text-[#003594]">Specifications</th>
                    <th className="text-left p-4 font-semibold text-[#003594]">Image</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRequest?.items.map((item) => (<tr key={item.id} className="border-t border-[#002a6e]/10 hover:bg-[#003594]/5 transition-colors">
                      <td className="p-4 text-gray-900">{item.nacCode}</td>
                      <td className="p-4 text-gray-900">{item.itemName}</td>
                      <td className="p-4 text-gray-900">{item.partNumber}</td>
                      <td className="p-4 text-gray-900">{item.equipmentNumber}</td>
                      <td className="p-4 text-gray-900">{item.requestedQuantity}</td>
                      <td className="p-4 text-gray-900">{item.unit || '-'}</td>
                      <td className="p-4 text-gray-900">{item.specifications || '-'}</td>
                      <td className="p-4">
                        <Image src={resolveImageUrl(item.imageUrl, '/images/nepal_airlines_logo.png')} alt={item.itemName} width={64} height={64} className="w-16 h-16 object-cover rounded-lg border border-[#002a6e]/10 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => item.imageUrl && handleImageClick(item.imageUrl)} onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = withBasePath('/images/nepal_airlines_logo.png');
            }} unoptimized/>
                      </td>
                    </tr>))}
                </tbody>
              </table>
            </div>
          </div>
        </ModalContent>
      </Modal>

      <Modal open={isEditOpen} onOpenChange={setIsEditOpen}>
        <ModalContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-xl border-[#002a6e]/10">
          <ModalHeader className="border-b border-[#002a6e]/10 pb-4">
            <ModalTitle className="text-xl font-semibold text-[#003594]">Edit Request Details</ModalTitle>
          </ModalHeader>
          <div className="p-6 space-y-6">
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
                             {isLoadingAuthorities ? (<SelectItem value="" disabled>Loading...</SelectItem>) : authorityOptions && authorityOptions.length > 0 ? (authorityOptions.map((authority) => (<SelectItem key={authority.id} value={authority.id.toString()}>
                                   {authority.name} {authority.designation ? `(${authority.designation})` : ''}
                                 </SelectItem>))) : (<SelectItem value="" disabled>No authorities available</SelectItem>)}
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

            <div className="flex justify-end gap-3 pt-6 border-t border-[#002a6e]/10">
              <Button variant="outline" onClick={() => setIsEditOpen(false)} className="border-[#002a6e]/20 hover:bg-[#003594]/5 hover:text-[#003594] transition-colors">
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} className="bg-[#003594] hover:bg-[#003594]/90 text-white transition-colors">
                Save Changes
              </Button>
            </div>
          </div>
        </ModalContent>
      </Modal>

      <Modal open={isImagePreviewOpen} onOpenChange={setIsImagePreviewOpen}>
        <ModalContent className="max-w-4xl bg-white rounded-xl shadow-xl border-[#002a6e]/10">
          <ModalHeader className="border-b border-[#002a6e]/10 pb-4">
            <ModalTitle className="text-xl font-semibold text-[#003594]">Image Preview</ModalTitle>
          </ModalHeader>
          <div className="p-6 relative">
            <Button variant="ghost" size="icon" className="absolute right-2 top-2 z-10 hover:bg-[#003594]/5 transition-colors" onClick={() => setIsImagePreviewOpen(false)}>
              <X className="h-4 w-4 text-[#003594]"/>
            </Button>
            <Image src={selectedImage || withBasePath('/images/nepal_airlines_logo.png')} alt="Preview" width={800} height={600} className="w-full h-auto max-h-[80vh] object-contain rounded-lg border border-[#002a6e]/10" unoptimized/>
          </div>
        </ModalContent>
      </Modal>

      <Modal open={isRejectOpen} onOpenChange={setIsRejectOpen}>
        <ModalContent className="max-w-md bg-white rounded-xl shadow-xl border-[#002a6e]/10">
          <ModalHeader className="border-b border-[#002a6e]/10 pb-4">
            <ModalTitle className="text-xl font-semibold text-[#003594]">Reject Request</ModalTitle>
            <ModalDescription className="text-gray-600 mt-2">
              Please provide a reason for rejecting this request.
            </ModalDescription>
          </ModalHeader>
          <div className="p-6 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="rejectionReason" className="text-[#003594] font-medium">Reason for Rejection</Label>
              <Textarea id="rejectionReason" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Enter the reason for rejection" className="min-h-[100px] border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20 transition-colors" required/>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => {
            setIsRejectOpen(false);
            setRejectionReason('');
        }} className="border-[#002a6e]/20 hover:bg-[#003594]/5 hover:text-[#003594] transition-colors">
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleRejectRequest} disabled={!rejectionReason.trim()} className="bg-[#d2293b] hover:bg-[#d2293b]/90 disabled:opacity-50 transition-colors">
                Confirm Rejection
              </Button>
            </div>
          </div>
        </ModalContent>
      </Modal>
    </>);
}
