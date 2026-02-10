'use client';
import { useState, useEffect } from 'react';
import { Modal, ModalContent, ModalHeader, ModalTitle } from '@/components/ui/modal';
import { PrintRRPSearchControls } from '@/components/print/PrintRRPSearchControls';
import { PrintRRPResultsTable } from '@/components/print/PrintRRPResultsTable';
import { PrintRRPPreviewModal } from '@/components/print/PrintRRPPreviewModal';
import { API } from '@/lib/api';
import Image from 'next/image';
import { useRRPSearch } from '@/hooks/useRRPSearch';
import { RRPSearchResult } from '@/types/rrp';
import { useAuthContext } from '@/context/AuthContext';
import { resolveImageUrl, withBasePath } from '@/lib/urls';
import { useCustomToast } from '@/components/ui/custom-toast';
import { getErrorMessage } from '@/lib/errorHandling';
export default function PrintRRPPage() {
    const { permissions } = useAuthContext();
    const [previewRRP, setPreviewRRP] = useState<RRPSearchResult | null>(null);
    const [referenceDocPreview, setReferenceDocPreview] = useState<{
        rrp: RRPSearchResult;
        imagePath: string;
    } | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const canUploadRefDoc = permissions?.includes('can_upload_reference_documents');
    const canEditRefDoc = permissions?.includes('can_edit_reference_documents');
    const canDeleteRefDoc = permissions?.includes('can_delete_reference_documents');
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const { results, isLoading, error, currentPage, pageSize, totalCount, totalPages, handleSearch, handlePageChange, handlePageSizeChange, setResults, } = useRRPSearch();
    const handlePreview = (rrp: RRPSearchResult) => {
        setPreviewRRP(rrp);
    };
    const handlePrint = async (rrp: RRPSearchResult) => {
        try {
            const response = await API.get(`/api/rrp/${rrp.rrpNumber}/print`, {
                responseType: 'blob'
            });
            const excelUrl = URL.createObjectURL(response.data);
            const link = document.createElement('a');
            link.href = excelUrl;
            link.download = `rrp_${rrp.rrpNumber}.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(excelUrl);
        }
        catch (error) {
            showErrorToast({
                title: 'Error',
                message: getErrorMessage(error, 'Failed to generate Excel file. Please try again.'),
            });
        }
    };
    const handleUploadReferenceDoc = async (rrp: RRPSearchResult, file: File) => {
        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder', 'rrp');
            formData.append('customName', `rrp-reference-${rrp.rrpNumber}`);
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
            const updateResponse = await API.post('/api/rrp/upload-ref-doc', {
                rrpNumber: rrp.rrpNumber,
                imagePath: imagePath
            });
            if (updateResponse.status === 200 || updateResponse.status === 201) {
                showSuccessToast({
                    title: 'Success',
                    message: 'Reference document uploaded successfully.',
                });
                setResults((prevResults: RRPSearchResult[] | null) => prevResults?.map(result => result.rrpNumber === rrp.rrpNumber
                    ? { ...result, referenceDoc: imagePath }
                    : result) ?? null);
            }
            else {
                throw new Error('Failed to update reference document');
            }
        }
        catch (error) {
            showErrorToast({
                title: 'Error',
                message: getErrorMessage(error, 'Failed to upload reference document. Please try again.'),
            });
        }
        finally {
            setIsUploading(false);
        }
    };
    const handlePreviewReferenceDoc = (rrp: RRPSearchResult) => {
        if (rrp.referenceDoc) {
            const imagePath = resolveImageUrl(rrp.referenceDoc, '/images/nepal_airlines_logo.png');
            setReferenceDocPreview({ rrp, imagePath });
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
                rrpNumber: string;
            };
            if (!detail?.rrpNumber)
                return;
            isProcessing = true;
            try {
                await API.delete(`/api/rrp/${encodeURIComponent(detail.rrpNumber)}/reference-doc`);
                showSuccessToast({
                    title: 'Success',
                    message: 'Reference document deleted successfully.',
                });
                setResults(prev => prev?.map(r => r.rrpNumber === detail.rrpNumber ? { ...r, referenceDoc: null } : r) ?? null);
            }
            catch (error) {
                showErrorToast({
                    title: 'Error',
                    message: getErrorMessage(error, 'Failed to delete reference document.'),
                });
            }
            finally {
                isProcessing = false;
            }
        };
        window.addEventListener('delete-rrp-ref-doc', handleDeleteRefDoc);
        return () => {
            window.removeEventListener('delete-rrp-ref-doc', handleDeleteRefDoc);
        };
    }, [setResults, showErrorToast, showSuccessToast]);
    return (<div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">Print RRP</h1>
        <p className="text-gray-600 mt-2">Search and print RRP documents</p>
      </div>
      
      <div className="mb-8 bg-white rounded-lg shadow-xl border-[#002a6e]/10 p-6">
        <PrintRRPSearchControls onUniversalSearch={handleSearch('universal')} onEquipmentSearch={handleSearch('equipmentNumber')} onPartSearch={handleSearch('partNumber')}/>
      </div>

      {error && (<div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>)}

      {isLoading ? (<div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#003594]"></div>
        </div>) : (<div className="bg-white rounded-lg shadow-xl border-[#002a6e]/10 overflow-hidden">
        
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-[#003594]">Items per page:</label>
            <select value={pageSize} onChange={(e) => handlePageSizeChange(Number(e.target.value))} className="border border-[#002a6e]/20 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#003594]/20">
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="text-sm text-gray-600">
            Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} results
          </div>
        </div>

        <PrintRRPResultsTable results={results || []} onPreview={handlePreview} onPrint={handlePrint} onUploadReferenceDoc={handleUploadReferenceDoc} onPreviewReferenceDoc={handlePreviewReferenceDoc} isUploading={isUploading} canUploadRefDoc={canUploadRefDoc} canEditRefDoc={canEditRefDoc} canDeleteRefDoc={canDeleteRefDoc} currentPage={currentPage} totalPages={totalPages} totalCount={totalCount} onPageChange={handlePageChange}/>
        </div>)}

      <PrintRRPPreviewModal rrp={previewRRP} isOpen={!!previewRRP} onClose={() => setPreviewRRP(null)}/>

      
      <Modal open={!!referenceDocPreview} onOpenChange={() => setReferenceDocPreview(null)}>
        <ModalContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <ModalHeader>
            <ModalTitle>Reference Document - {referenceDocPreview?.rrp.rrpNumber}</ModalTitle>
          </ModalHeader>
          <div className="flex justify-center items-center p-4">
            {referenceDocPreview?.imagePath ? (referenceDocPreview.imagePath.endsWith('.pdf') ? (<iframe key={referenceDocPreview.imagePath} src={referenceDocPreview.imagePath} className="w-full h-[70vh] border rounded-lg shadow-lg" title="Reference Document PDF" onError={() => {
                showErrorToast({
                    title: 'Error',
                    message: 'Failed to load reference document PDF.',
                });
            }}/>) : (<Image key={referenceDocPreview.imagePath} src={referenceDocPreview.imagePath} alt="Reference Document" width={800} height={600} className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg" onError={() => {
                showErrorToast({
                    title: 'Error',
                    message: 'Failed to load reference document image.',
                });
            }}/>)) : (<div className="text-center text-gray-500 p-8">
                No reference document available
              </div>)}
          </div>
        </ModalContent>
      </Modal>
    </div>);
}
