'use client';
import { useState, useEffect } from 'react';
import { toast } from '@/components/ui/use-toast';
import { Modal, ModalContent, ModalHeader, ModalTitle } from '@/components/ui/modal';
import { PrintRequestSearchControls } from '@/components/print/PrintRequestSearchControls';
import { PrintRequestResults } from '@/components/print/PrintRequestResults';
import { PrintRequestPreviewModal } from '@/components/print/PrintRequestPreviewModal';
import { RequestSearchResult } from '@/types/request';
import { API } from '@/lib/api';
import Image from 'next/image';
import { useRequestSearch } from '@/hooks/useRequestSearch';
import { useAuthContext } from '@/context/AuthContext';
import { resolveImageUrl, withBasePath } from '@/lib/urls';
export default function PrintRequestPage() {
    const { permissions } = useAuthContext();
    const canUploadRefDoc = permissions?.includes('can_upload_reference_documents');
    const canEditRefDoc = permissions?.includes('can_edit_reference_documents');
    const canDeleteRefDoc = permissions?.includes('can_delete_reference_documents');
    const [previewRequest, setPreviewRequest] = useState<RequestSearchResult | null>(null);
    const [referenceDocPreview, setReferenceDocPreview] = useState<{
        request: RequestSearchResult;
        imagePath: string;
    } | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const { results, isLoading, error, currentPage, totalCount, totalPages, handleSearch, handlePageChange, setResults, } = useRequestSearch();
    const handlePreview = (request: RequestSearchResult) => {
        setPreviewRequest(request);
    };
    const handlePrint = async (request: RequestSearchResult) => {
        try {
            const response = await API.get(`/api/request/${request.requestNumber}/print`, {
                responseType: 'blob'
            });
            const excelUrl = URL.createObjectURL(response.data);
            const link = document.createElement('a');
            link.href = excelUrl;
            link.download = `request_${request.requestNumber}.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(excelUrl);
        }
        catch {
            toast({
                title: 'Error',
                description: 'Failed to generate Excel file. Please try again.',
                variant: 'destructive',
                className: 'bg-red-600 text-white border-none',
            });
        }
    };
    const handleUploadReferenceDoc = async (request: RequestSearchResult, file: File) => {
        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder', 'request');
            formData.append('customName', `request-reference-${request.requestNumber}`);
            const uploadResponse = await fetch(withBasePath('/api/upload'), {
                method: 'POST',
                body: formData,
            });
            if (!uploadResponse.ok) {
                const errorData = await uploadResponse.json();
                throw new Error(errorData.error || 'Failed to upload image');
            }
            const uploadResult = await uploadResponse.json();
            const imagePath = uploadResult.path;
            const updateResponse = await API.post('/api/request/upload-ref-doc', {
                requestNumber: request.requestNumber,
                imagePath: imagePath
            });
            if (updateResponse.status === 200 || updateResponse.status === 201) {
                toast({
                    title: 'Success',
                    description: 'Reference document uploaded successfully.',
                    className: 'bg-green-600 text-white border-none',
                });
                setResults(prevResults => prevResults.map(result => result.requestNumber === request.requestNumber
                    ? { ...result, referenceDoc: imagePath }
                    : result));
            }
            else {
                throw new Error('Failed to update reference document');
            }
        }
        catch {
            toast({
                title: 'Error',
                description: 'Failed to upload reference document. Please try again.',
                variant: 'destructive',
                className: 'bg-red-600 text-white border-none',
            });
        }
        finally {
            setIsUploading(false);
        }
    };
    const handlePreviewReferenceDoc = (request: RequestSearchResult) => {
        if (request.referenceDoc) {
            const imagePath = resolveImageUrl(request.referenceDoc, '/images/nepal_airlines_logo.png');
            setReferenceDocPreview({ request, imagePath });
        }
    };
    useEffect(() => {
        if (typeof window === 'undefined')
            return;
        let isProcessing = false;
        const handleDeleteRefDoc = async (e: Event) => {
            if (isProcessing)
                return;
            const detail = (e as CustomEvent).detail as {
                requestNumber: string;
            };
            if (!detail?.requestNumber)
                return;
            isProcessing = true;
            try {
                await API.delete(`/api/request/${encodeURIComponent(detail.requestNumber)}/reference-doc`);
                toast({
                    title: 'Success',
                    description: 'Reference document deleted successfully.',
                    className: 'bg-green-600 text-white border-none',
                });
                setResults(prev => prev?.map(r => r.requestNumber === detail.requestNumber ? { ...r, referenceDoc: null } : r) ?? null);
            }
            catch {
                toast({
                    title: 'Error',
                    description: 'Failed to delete reference document.',
                    variant: 'destructive',
                    className: 'bg-red-600 text-white border-none',
                });
            }
            finally {
                isProcessing = false;
            }
        };
        window.addEventListener('delete-request-ref-doc', handleDeleteRefDoc);
        return () => {
            window.removeEventListener('delete-request-ref-doc', handleDeleteRefDoc);
        };
    }, [setResults]);
    return (<div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">Print Request</h1>
        <p className="text-gray-600 mt-2">Search and print request documents</p>
      </div>
      
      <div className="mb-8 bg-white rounded-lg shadow-xl border-[#002a6e]/10 p-6">
        <PrintRequestSearchControls onUniversalSearch={handleSearch('universal')} onEquipmentSearch={handleSearch('equipmentNumber')} onPartSearch={handleSearch('partNumber')}/>
      </div>

      <div className="bg-white rounded-lg shadow-xl border-[#002a6e]/10 overflow-hidden">
      <PrintRequestResults results={results} isLoading={isLoading} error={error} onPreview={handlePreview} onPrint={handlePrint} onUploadReferenceDoc={handleUploadReferenceDoc} onPreviewReferenceDoc={handlePreviewReferenceDoc} isUploading={isUploading} canUploadRefDoc={canUploadRefDoc} canEditRefDoc={canEditRefDoc} canDeleteRefDoc={canDeleteRefDoc} currentPage={currentPage} totalCount={totalCount} totalPages={totalPages} onPageChange={handlePageChange}/>
      </div>

      <PrintRequestPreviewModal request={previewRequest} isOpen={!!previewRequest} onClose={() => setPreviewRequest(null)}/>

      
      <Modal open={!!referenceDocPreview} onOpenChange={() => setReferenceDocPreview(null)}>
        <ModalContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <ModalHeader>
            <ModalTitle>Reference Document - {referenceDocPreview?.request.requestNumber}</ModalTitle>
          </ModalHeader>
          <div className="flex justify-center items-center p-4">
            {referenceDocPreview?.imagePath ? (referenceDocPreview.imagePath.endsWith('.pdf') ? (<iframe src={referenceDocPreview.imagePath} className="w-full h-[70vh] border rounded-lg shadow-lg" title="Reference Document PDF" onError={() => {
                toast({
                    title: 'Error',
                    description: 'Failed to load reference document PDF.',
                    variant: 'destructive',
                    className: 'bg-red-600 text-white border-none',
                });
            }}/>) : (<Image src={referenceDocPreview.imagePath} alt="Reference Document" width={800} height={600} className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg" onError={() => {
                toast({
                    title: 'Error',
                    description: 'Failed to load reference document image.',
                    variant: 'destructive',
                    className: 'bg-red-600 text-white border-none',
                });
            }}/>)) : (<div className="text-center text-gray-500 p-8">
                No reference document available
              </div>)}
          </div>
        </ModalContent>
      </Modal>
    </div>);
}
