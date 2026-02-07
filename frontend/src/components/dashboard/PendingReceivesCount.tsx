'use client';
import { useEffect, useState, useCallback } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { API } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Eye, X, Pencil, Check, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription, ModalTrigger, } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/utils/utils';
import { useCustomToast } from '@/components/ui/custom-toast';
import Image from 'next/image';
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
    cardNumber?: string;
    receiveSource?: string;
    tenderReferenceNumber?: string;
    borrowReferenceNumber?: string;
    borrowDate?: string;
    borrowSourceName?: string;
    borrowSourceCode?: string;
    requestFk?: number;
}
interface EditData {
    receivedQuantity: number;
    receivedPartNumber: string;
    nacCode?: string;
    unit?: string;
    newRequestedImage?: File;
    newReceivedImage?: File;
}
const FALLBACK_IMAGE = '/images/nepal_airlines_logo.jpeg';
export function PendingReceivesCount() {
    const { permissions, user } = useAuthContext();
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const [pendingCount, setPendingCount] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isOpen, setIsOpen] = useState(false);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isRejectOpen, setIsRejectOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [selectedImage, setSelectedImage] = useState<string>('');
    const [pendingReceives, setPendingReceives] = useState<PendingReceive[]>([]);
    const [selectedReceive, setSelectedReceive] = useState<ReceiveDetails | null>(null);
    const [editData, setEditData] = useState<EditData | null>(null);
    const [nacCodeError, setNacCodeError] = useState<string>('');
    const fetchPendingCount = useCallback(async () => {
        if (!permissions?.includes('can_approve_receive')) {
            setIsLoading(false);
            return;
        }
        try {
            const response = await API.get('/api/receive/pending');
            setPendingReceives(response.data);
            setPendingCount(response.data.length);
        }
        catch {
        }
        finally {
            setIsLoading(false);
        }
    }, [permissions]);
    useEffect(() => {
        fetchPendingCount();
    }, [fetchPendingCount]);
    useEffect(() => {
        if (isDetailsOpen || isEditOpen || isRejectOpen || isImagePreviewOpen)
            return;
        const interval = setInterval(() => {
            fetchPendingCount();
        }, 30000);
        return () => clearInterval(interval);
    }, [fetchPendingCount, isDetailsOpen, isEditOpen, isRejectOpen, isImagePreviewOpen]);
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
                    nacCode: response.data.nacCode,
                    location: response.data.location,
                    cardNumber: response.data.cardNumber,
                    receiveSource: response.data.receiveSource,
                    tenderReferenceNumber: response.data.tenderReferenceNumber,
                    borrowReferenceNumber: response.data.borrowReferenceNumber,
                    borrowDate: response.data.borrowDate,
                    borrowSourceName: response.data.borrowSourceName,
                    borrowSourceCode: response.data.borrowSourceCode,
                    requestFk: response.data.requestFk
                };
                setSelectedReceive(receiveData);
                setIsDetailsOpen(true);
            }
        }
        catch {
            showErrorToast({
                title: "Error",
                message: "Failed to fetch receive details",
                duration: 3000,
            });
        }
    };
    const handleImageClick = (imageUrl: string) => {
        setSelectedImage(resolveImageUrl(imageUrl, FALLBACK_IMAGE));
        setIsImagePreviewOpen(true);
    };
    const validateNacCode = (code: string): boolean => {
        const nacCodeRegex = /^(GT|TW|GS) \d{5}$/;
        return nacCodeRegex.test(code);
    };
    const handleEditClick = () => {
        if (!selectedReceive)
            return;
        setEditData({
            receivedQuantity: selectedReceive.receivedQuantity,
            receivedPartNumber: selectedReceive.receivedPartNumber,
            nacCode: selectedReceive.nacCode === 'N/A' ? '' : selectedReceive.nacCode,
            unit: selectedReceive.unit,
            newRequestedImage: undefined,
            newReceivedImage: undefined
        });
        setNacCodeError('');
        setIsEditOpen(true);
    };
    const handleSaveEdit = async () => {
        if (!editData || !selectedReceive)
            return;
        if (selectedReceive.nacCode === 'N/A' && editData.nacCode) {
            if (!validateNacCode(editData.nacCode)) {
                setNacCodeError('NAC Code must be in format: GT 12345, TW 12345, or GS 12345');
                return;
            }
        }
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
                        throw new Error(`Failed to upload requested image: ${errorData.error || uploadResponse.statusText}`);
                    }
                    const uploadResult = await uploadResponse.json();
                    newRequestedImagePath = uploadResult.path;
                }
                catch (error) {
                    throw new Error(`Failed to upload requested image: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
                        throw new Error(`Failed to upload received image: ${errorData.error || uploadResponse.statusText}`);
                    }
                    const uploadResult = await uploadResponse.json();
                    newReceivedImagePath = uploadResult.path;
                }
                catch (error) {
                    throw new Error(`Failed to upload received image: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
            const updatePayload: {
                receivedQuantity: number;
                receivedPartNumber: string;
                nacCode?: string;
                unit?: string;
            } = {
                receivedQuantity: editData.receivedQuantity,
                receivedPartNumber: editData.receivedPartNumber
            };
            const trimmedNac = editData.nacCode?.trim();
            if (trimmedNac) {
                updatePayload.nacCode = trimmedNac;
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
                            receivedImagePath: newReceivedImagePath
                        });
                    }
                    catch {
                        showErrorToast({
                            title: "Warning",
                            message: "Details updated but image update failed. Please try updating images again.",
                            duration: 5000,
                        });
                    }
                }
                showSuccessToast({
                    title: "Success",
                    message: "Receive details updated successfully",
                    duration: 3000,
                });
                setIsEditOpen(false);
                handleViewDetails(selectedReceive.id);
            }
            else {
                throw new Error(response.data?.message || 'Failed to update receive details');
            }
        }
        catch (error) {
            showErrorToast({
                title: "Error",
                message: error instanceof Error ? error.message : "Failed to update receive details",
                duration: 5000,
            });
        }
        finally {
            setIsSaving(false);
        }
    };
    const handleRejectClick = () => {
        setIsRejectOpen(true);
    };
    const handleRejectReceive = async () => {
        if (!selectedReceive || !rejectionReason.trim()) {
            showErrorToast({
                title: "Error",
                message: "Please provide a reason for rejection",
                duration: 3000,
            });
            return;
        }
        try {
            const response = await API.put(`/api/receive/${selectedReceive.id}/reject`, {
                rejectedBy: user?.UserInfo?.username,
                rejectionReason: rejectionReason.trim()
            });
            if (response.status === 200) {
                showSuccessToast({
                    title: "Success",
                    message: "Receive rejected successfully",
                    duration: 3000,
                });
                const pendingResponse = await API.get('/api/receive/pending');
                setPendingReceives(pendingResponse.data);
                setPendingCount(pendingResponse.data.length);
                setIsDetailsOpen(false);
                setIsRejectOpen(false);
                setRejectionReason('');
            }
            else {
                throw new Error(response.data?.message || 'Failed to reject receive');
            }
        }
        catch (error) {
            showErrorToast({
                title: "Error",
                message: error instanceof Error ? error.message : "Failed to reject receive",
                duration: 5000,
            });
        }
    };
    const handleApproveReceive = async () => {
        if (!selectedReceive)
            return;
        try {
            const response = await API.put(`/api/receive/${selectedReceive.id}/approve`);
            if (response.status === 200) {
                showSuccessToast({
                    title: "Success",
                    message: "Receive approved successfully",
                    duration: 3000,
                });
                const pendingResponse = await API.get('/api/receive/pending');
                setPendingReceives(pendingResponse.data);
                setPendingCount(pendingResponse.data.length);
                setIsDetailsOpen(false);
            }
            else {
                throw new Error(response.data?.message || 'Failed to approve receive');
            }
        }
        catch (error) {
            showErrorToast({
                title: "Error",
                message: error instanceof Error ? error.message : "Failed to approve receive",
                duration: 5000,
            });
        }
    };
    const handleCloseEditModal = () => {
        setIsEditOpen(false);
        setEditData(null);
        setNacCodeError('');
        setIsSaving(false);
    };
    const handleImageChange = (type: 'requested' | 'received', file: File) => {
        if (!editData)
            return;
        setEditData(prev => prev ? {
            ...prev,
            [type === 'requested' ? 'newRequestedImage' : 'newReceivedImage']: file
        } : null);
    };
    if (!permissions?.includes('can_approve_receive')) {
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
              <CardTitle className="text-base font-semibold text-[#003594]">Pending Receives</CardTitle>
              <Package className="h-5 w-5 text-[#003594]"/>
            </CardHeader>
            <CardContent>
              {isLoading ? (<div className="text-3xl font-bold text-[#003594]">...</div>) : (<div className="text-3xl font-bold text-[#003594]">{pendingCount ?? 0}</div>)}
              <p className="text-sm text-gray-500 mt-1">Items awaiting approval</p>
            </CardContent>
          </Card>
        </ModalTrigger>
        <ModalContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white rounded-lg shadow-xl border-[#002a6e]/10">
          <ModalHeader className="border-b border-[#002a6e]/10 pb-4">
            <ModalTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
              Pending Receives
            </ModalTitle>
            <ModalDescription className="text-gray-600">
              Review and manage pending receives
            </ModalDescription>
          </ModalHeader>

          <div className="mt-6 space-y-4">
            {pendingReceives.map((receive) => (<div key={receive.id} className="rounded-lg border border-[#002a6e]/10 p-6 hover:bg-[#003594]/5 cursor-pointer transition-colors" onDoubleClick={() => handleViewDetails(receive.id)}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#003594]">NAC Code</p>
                    <p className="text-base font-semibold text-gray-900">{receive.nacCode}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#003594]">Item Name</p>
                    <p className="text-base font-semibold text-gray-900">{receive.itemName}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#003594]">Part Number</p>
                    <p className="text-base font-semibold text-gray-900">{receive.partNumber}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#003594]">Received Quantity</p>
                    <p className="text-base font-semibold text-gray-900">{receive.receivedQuantity}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#003594]">Equipment Number</p>
                    <p className="text-base font-semibold text-gray-900">{receive.equipmentNumber || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#003594]">Received Date</p>
                    <p className="text-base font-semibold text-gray-900">{new Date(receive.receiveDate).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="mt-4 text-xs text-gray-500 flex items-center gap-1">
                  <Eye className="h-3 w-3"/>
                  Double-click to view full details
                </div>
              </div>))}
          </div>
        </ModalContent>
      </Modal>

      <Modal open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <ModalContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-white rounded-lg shadow-xl border-[#002a6e]/10">
          <ModalHeader className="border-b border-[#002a6e]/10 pb-4">
            <div className="flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2">
                  <ModalTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
                    Receive Details
                  </ModalTitle>
                  {selectedReceive?.receiveSource === 'borrow' && (<span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                      BORROWED
                    </span>)}
                </div>
                <ModalDescription className="mt-1 text-gray-600">
                  {selectedReceive?.receiveSource === 'tender'
            ? `Tender Reference: ${selectedReceive?.tenderReferenceNumber || 'N/A'}`
            : selectedReceive?.receiveSource === 'borrow'
                ? `Borrowed from: ${selectedReceive?.borrowSourceName || 'N/A'}`
                : `Request #${selectedReceive?.requestNumber}`}
                </ModalDescription>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" size="sm" className="flex items-center gap-2 border-[#002a6e]/20 hover:bg-[#003594]/5 hover:text-[#003594]" onClick={handleEditClick}>
                  <Pencil className="h-4 w-4"/>
                  Edit Details
                </Button>
                <Button variant="default" size="sm" className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white" onClick={handleApproveReceive}>
                  <Check className="h-4 w-4"/>
                  Approve
                </Button>
                {selectedReceive?.requestFk && selectedReceive.requestFk > 0 && selectedReceive.receiveSource !== 'tender' && (<Button variant="default" size="sm" className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={async () => {
                try {
                    const response = await API.put(`/api/receive/${selectedReceive.id}/approve-and-close`);
                    if (response.status === 200) {
                        showSuccessToast({
                            title: 'Success',
                            message: 'Receive approved and request force-closed',
                            duration: 3000,
                        });
                        const pendingResponse = await API.get('/api/receive/pending');
                        setPendingReceives(pendingResponse.data);
                        setPendingCount(pendingResponse.data.length);
                        setIsDetailsOpen(false);
                    }
                    else {
                        throw new Error(response.data?.message || 'Failed to approve and close');
                    }
                }
                catch (error) {
                    showErrorToast({
                        title: 'Error',
                        message: error instanceof Error ? error.message : 'Failed to approve and close',
                        duration: 5000,
                    });
                }
            }}>
                    <Check className="h-4 w-4"/>
                    Approve & Close Request
                  </Button>)}
                <Button variant="destructive" size="sm" className="flex items-center gap-2 bg-[#d2293b] hover:bg-[#d2293b]/90" onClick={handleRejectClick}>
                  <X className="h-4 w-4"/>
                  Reject
                </Button>
              </div>
            </div>
          </ModalHeader>
          <div className="mt-6 space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 bg-[#003594]/5 rounded-lg">
              {selectedReceive?.receiveSource === 'tender' ? (<>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#003594]">Tender Reference</p>
                    <p className="text-base font-semibold text-gray-900">
                      {selectedReceive?.tenderReferenceNumber || 'N/A'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#003594]">Receive Date</p>
                    <p className="text-base font-semibold text-gray-900">
                      {selectedReceive?.receiveDate && new Date(selectedReceive.receiveDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#003594]">Equipment Number</p>
                    <p className="text-base font-semibold text-gray-900">{selectedReceive?.equipmentNumber || 'N/A'}</p>
                  </div>
                </>) : selectedReceive?.receiveSource === 'borrow' ? (<>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#003594]">Borrow Source</p>
                    <p className="text-base font-semibold text-gray-900">
                      {selectedReceive?.borrowSourceName || 'N/A'}
                      {selectedReceive?.borrowSourceCode && ` (${selectedReceive.borrowSourceCode})`}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#003594]">Borrow Date</p>
                    <p className="text-base font-semibold text-gray-900">
                      {selectedReceive?.borrowDate && new Date(selectedReceive.borrowDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#003594]">Borrow Reference</p>
                    <p className="text-base font-semibold text-gray-900">
                      {selectedReceive?.borrowReferenceNumber || 'N/A'}
                    </p>
                  </div>
                </>) : (<>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#003594]">Request Date</p>
                    <p className="text-base font-semibold text-gray-900">
                      {selectedReceive?.requestDate && new Date(selectedReceive.requestDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#003594]">Receive Date</p>
                    <p className="text-base font-semibold text-gray-900">
                      {selectedReceive?.receiveDate && new Date(selectedReceive.receiveDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#003594]">Equipment Number</p>
                    <p className="text-base font-semibold text-gray-900">{selectedReceive?.equipmentNumber || 'N/A'}</p>
                  </div>
                </>)}
            </div>

            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              <div className="space-y-6 p-6 border border-[#002a6e]/10 rounded-lg bg-white">
                <h3 className="text-lg font-semibold text-[#003594]">
                  {selectedReceive?.receiveSource === 'tender' ? 'Tender Details'
            : selectedReceive?.receiveSource === 'borrow' ? 'Borrow Details'
                : 'Requested Details'}
                </h3>
                <div className="space-y-6">
                  {selectedReceive?.receiveSource === 'tender' ? (<>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-[#003594]">Tender Reference</p>
                        <p className="text-base text-gray-900">{selectedReceive?.tenderReferenceNumber || 'N/A'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-[#003594]">Item Name</p>
                        <p className="text-base text-gray-900">{selectedReceive?.itemName}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-[#003594]">Part Number</p>
                        <p className="text-base text-gray-900">{selectedReceive?.receivedPartNumber}</p>
                      </div>
                    </>) : selectedReceive?.receiveSource === 'borrow' ? (<>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-[#003594]">Borrow Source</p>
                        <p className="text-base text-gray-900">
                          {selectedReceive?.borrowSourceName || 'N/A'}
                          {selectedReceive?.borrowSourceCode && ` (${selectedReceive.borrowSourceCode})`}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-[#003594]">Borrow Date</p>
                        <p className="text-base text-gray-900">
                          {selectedReceive?.borrowDate && new Date(selectedReceive.borrowDate).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-[#003594]">Borrow Reference</p>
                        <p className="text-base text-gray-900">{selectedReceive?.borrowReferenceNumber || 'N/A'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-[#003594]">Item Name</p>
                        <p className="text-base text-gray-900">{selectedReceive?.itemName}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-[#003594]">Part Number</p>
                        <p className="text-base text-gray-900">{selectedReceive?.receivedPartNumber}</p>
                      </div>
                    </>) : (<>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-[#003594]">Item Name</p>
                        <p className="text-base text-gray-900">{selectedReceive?.itemName}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-[#003594]">Part Number</p>
                        <p className="text-base text-gray-900">{selectedReceive?.requestedPartNumber}</p>
                      </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#003594]">Quantity</p>
                    <p className="text-base text-gray-900">
                      {selectedReceive?.requestedQuantity}
                      {selectedReceive?.requestedUnit && (<span className="ml-1 text-sm text-gray-600">
                          {selectedReceive.requestedUnit}
                        </span>)}
                    </p>
                  </div>
                    </>)}
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#003594]">Image</p>
                    <div className="mt-2">
                      <Image src={resolveImageUrl(selectedReceive?.requestedImage, FALLBACK_IMAGE)} alt={selectedReceive?.receiveSource === 'tender' ? 'Tender Item' : 'Requested Item'} width={160} height={160} className="w-40 h-40 object-cover rounded-lg border border-[#002a6e]/10 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => selectedReceive?.requestedImage && handleImageClick(selectedReceive.requestedImage)} unoptimized/>
                    </div>
                  </div>
                </div>
              </div>

              
              <div className="space-y-6 p-6 border border-[#002a6e]/10 rounded-lg bg-white">
                <h3 className="text-lg font-semibold text-[#003594]">Received Details</h3>
                <div className="space-y-6">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#003594]">Part Number</p>
                    <p className="text-base text-gray-900">{selectedReceive?.receivedPartNumber}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#003594]">Quantity</p>
                    <p className="text-base text-gray-900">
                      {selectedReceive?.receivedQuantity}
                      {selectedReceive?.unit && (<span className="ml-1 text-sm text-gray-600">
                          {selectedReceive.unit}
                        </span>)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#003594]">Unit</p>
                    <p className="text-base text-gray-900">
                      {selectedReceive?.unit || 'N/A'}
                    </p>
                  </div>
                  {selectedReceive?.requestedUnit &&
            selectedReceive.unit &&
            selectedReceive.requestedUnit !== selectedReceive.unit &&
            selectedReceive.conversionBase && (<div className="space-y-1">
                        <p className="text-sm font-medium text-[#003594]">Conversion</p>
                        <p className="text-sm text-gray-900">
                          1 {selectedReceive.requestedUnit} ={' '}
                          {selectedReceive.conversionBase} {selectedReceive.unit}
                        </p>
                        <p className="text-xs text-gray-500">
                          Effective stock added:{' '}
                          {(selectedReceive.receivedQuantity /
                (selectedReceive.conversionBase || 1)).toFixed(4)}{' '}
                          {selectedReceive.requestedUnit}
                        </p>
                      </div>)}
                  {selectedReceive?.location && (<div className="space-y-1">
                      <p className="text-sm font-medium text-[#003594]">Location</p>
                      <p className="text-base text-gray-900">{selectedReceive.location}</p>
                    </div>)}
                  {selectedReceive?.cardNumber && (<div className="space-y-1">
                      <p className="text-sm font-medium text-[#003594]">Card Number</p>
                      <p className="text-base text-gray-900">{selectedReceive.cardNumber}</p>
                    </div>)}
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#003594]">Image</p>
                    <div className="mt-2">
                      <Image src={resolveImageUrl(selectedReceive?.receivedImage, FALLBACK_IMAGE)} alt="Received Item" width={160} height={160} className="w-40 h-40 object-cover rounded-lg border border-[#002a6e]/10 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => selectedReceive?.receivedImage && handleImageClick(selectedReceive.receivedImage)} unoptimized/>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ModalContent>
      </Modal>

      <Modal open={isEditOpen} onOpenChange={setIsEditOpen}>
        <ModalContent className="max-w-2xl bg-white rounded-lg shadow-xl border-[#002a6e]/10">
          <ModalHeader className="border-b border-[#002a6e]/10 pb-4">
            <ModalTitle className="text-xl font-semibold text-[#003594]">Edit Receive Details</ModalTitle>
          </ModalHeader>
          <div className="p-6 space-y-6">
            {selectedReceive?.nacCode === 'N/A' && (<div className="space-y-2">
                <Label htmlFor="nacCode" className="text-[#003594]">NAC Code</Label>
                <Input id="nacCode" value={editData?.nacCode || ''} onChange={(e) => {
                setEditData(prev => prev ? { ...prev, nacCode: e.target.value } : null);
                setNacCodeError('');
            }} placeholder="Enter NAC Code (e.g., GT 12345)" className={cn("border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20", nacCodeError && "border-red-500 focus:border-red-500 focus:ring-red-500/20")}/>
                {nacCodeError && (<p className="text-sm text-red-500">{nacCodeError}</p>)}
              </div>)}
            <div className="space-y-2">
              <Label htmlFor="receivedPartNumber" className="text-[#003594]">Received Part Number</Label>
              <Input id="receivedPartNumber" value={editData?.receivedPartNumber || ''} onChange={(e) => setEditData(prev => prev ? { ...prev, receivedPartNumber: e.target.value } : null)} className="border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20"/>
            </div>
            <div className="space-y-2">
              <Label htmlFor="receivedQuantity" className="text-[#003594]">Received Quantity</Label>
              <Input id="receivedQuantity" type="number" value={editData?.receivedQuantity || ''} onChange={(e) => setEditData(prev => prev ? { ...prev, receivedQuantity: parseInt(e.target.value) || 0 } : null)} className="border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20"/>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit" className="text-[#003594]">Unit</Label>
              <Input id="unit" value={editData?.unit || ''} onChange={(e) => setEditData(prev => prev ? { ...prev, unit: e.target.value } : null)} className="border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20"/>
            </div>

            
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-[#003594]">Update Images</h3>
              
              
              <div className="space-y-3">
                <Label className="text-[#003594] font-medium">Requested Image</Label>
                <div className="flex items-center gap-4">
                  {selectedReceive?.requestedImage && (<div className="relative">
                      <Image src={resolveImageUrl(selectedReceive.requestedImage, FALLBACK_IMAGE)} alt="Current Requested Image" width={80} height={80} className="w-20 h-20 object-cover rounded-lg border border-[#002a6e]/10" unoptimized onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = withBasePath(FALLBACK_IMAGE);
            }}/>
                      <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        Current
                      </div>
                    </div>)}
                  <div className="flex-1">
                    <Input type="file" accept="image/*" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file)
                handleImageChange('requested', file);
        }} className="border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20"/>
                    <p className="text-xs text-gray-500 mt-1">
                      {editData?.newRequestedImage ? `New image: ${editData.newRequestedImage.name}` : 'Select new image to replace current'}
                    </p>
                  </div>
                </div>
              </div>

              
              <div className="space-y-3">
                <Label className="text-[#003594] font-medium">Received Image</Label>
                <div className="flex items-center gap-4">
                  {selectedReceive?.receivedImage && (<div className="relative">
                      <Image src={resolveImageUrl(selectedReceive.receivedImage, FALLBACK_IMAGE)} alt="Current Received Image" width={80} height={80} className="w-20 h-20 object-cover rounded-lg border border-[#002a6e]/10" unoptimized onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = withBasePath(FALLBACK_IMAGE);
            }}/>
                      <div className="absolute -top-2 -right-2 bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        Current
                      </div>
                    </div>)}
                  <div className="flex-1">
                    <Input type="file" accept="image/*" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file)
                handleImageChange('received', file);
        }} className="border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20"/>
                    <p className="text-xs text-gray-500 mt-1">
                      {editData?.newReceivedImage ? `New image: ${editData.newReceivedImage.name}` : 'Select new image to replace current'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={handleCloseEditModal} className="border-[#002a6e]/20 hover:bg-[#003594]/5 hover:text-[#003594]">
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={isSaving} className="bg-[#003594] hover:bg-[#003594]/90 disabled:opacity-50">
                {isSaving ? (<>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                    Saving...
                  </>) : ('Save Changes')}
              </Button>
            </div>
          </div>
        </ModalContent>
      </Modal>

      <Modal open={isRejectOpen} onOpenChange={setIsRejectOpen}>
        <ModalContent className="max-w-md bg-white rounded-lg shadow-xl border-[#002a6e]/10">
          <ModalHeader className="border-b border-[#002a6e]/10 pb-4">
            <ModalTitle className="text-xl font-semibold text-[#003594]">Reject Receive</ModalTitle>
            <ModalDescription className="text-gray-600">
              Please provide a reason for rejecting this receive.
            </ModalDescription>
          </ModalHeader>
          <div className="p-6 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="rejectionReason" className="text-[#003594]">Reason for Rejection</Label>
              <Textarea id="rejectionReason" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Enter the reason for rejection" className="min-h-[100px] border-[#002a6e]/20 focus:border-[#003594] focus:ring-[#003594]/20" required/>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => {
            setIsRejectOpen(false);
            setRejectionReason('');
        }} className="border-[#002a6e]/20 hover:bg-[#003594]/5 hover:text-[#003594]">
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleRejectReceive} disabled={!rejectionReason.trim()} className="bg-[#d2293b] hover:bg-[#d2293b]/90 disabled:opacity-50">
                Confirm Rejection
              </Button>
            </div>
          </div>
        </ModalContent>
      </Modal>

      <Modal open={isImagePreviewOpen} onOpenChange={setIsImagePreviewOpen}>
        <ModalContent className="max-w-3xl bg-white rounded-lg shadow-xl border-[#002a6e]/10">
          <ModalHeader className="border-b border-[#002a6e]/10 pb-4">
            <ModalTitle className="text-xl font-semibold text-[#003594]">Image Preview</ModalTitle>
          </ModalHeader>
          <div className="p-6 flex justify-center">
            <Image src={selectedImage || withBasePath(FALLBACK_IMAGE)} alt="Preview" width={400} height={400} className="max-w-full max-h-[80vh] object-contain rounded-lg border border-[#002a6e]/10" unoptimized/>
          </div>
        </ModalContent>
      </Modal>
    </>);
}
