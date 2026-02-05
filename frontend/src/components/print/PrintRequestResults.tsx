'use client';
import { RequestSearchResult } from '@/types/request';
import { PrintRequestResultsTable } from './PrintRequestResultsTable';
export interface PrintRequestResultsProps {
    results: RequestSearchResult[] | null;
    isLoading: boolean;
    error: string | null;
    onPreview: (request: RequestSearchResult) => void;
    onPrint: (request: RequestSearchResult) => void;
    onUploadReferenceDoc: (request: RequestSearchResult, file: File) => void;
    onPreviewReferenceDoc: (request: RequestSearchResult) => void;
    isUploading?: boolean;
    canUploadRefDoc?: boolean;
    canEditRefDoc?: boolean;
    canDeleteRefDoc?: boolean;
    currentPage?: number;
    totalCount?: number;
    totalPages?: number;
    onPageChange?: (page: number) => void;
}
export function PrintRequestResults({ results, isLoading, error, onPreview, onPrint, onUploadReferenceDoc, onPreviewReferenceDoc, isUploading, canUploadRefDoc = false, canEditRefDoc = false, canDeleteRefDoc = false, currentPage = 1, totalCount = 0, totalPages = 0, onPageChange, }: PrintRequestResultsProps) {
    if (error) {
        return (<div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        {error}
      </div>);
    }
    if (isLoading) {
        return (<div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#003594]"></div>
      </div>);
    }
    if (!results || results.length === 0) {
        return (<div className="text-center py-12 text-gray-500">
        <p className="text-lg font-medium text-[#003594]">Welcome to Print Request</p>
        <p className="mt-2">Enter search terms to find requests</p>
      </div>);
    }
    if (Array.isArray(results) && results.length === 0) {
        return (<div className="text-center py-12 text-gray-500">
        <p className="text-lg font-medium text-[#003594]">No Results Found</p>
        <p className="mt-2">Try adjusting your search criteria</p>
      </div>);
    }
    if (results && results.length > 0) {
        return (<PrintRequestResultsTable results={results} onPreview={onPreview} onPrint={onPrint} onUploadReferenceDoc={onUploadReferenceDoc} onPreviewReferenceDoc={onPreviewReferenceDoc} isUploading={isUploading} canUploadRefDoc={canUploadRefDoc} canEditRefDoc={canEditRefDoc} canDeleteRefDoc={canDeleteRefDoc} currentPage={currentPage} totalCount={totalCount} totalPages={totalPages} onPageChange={onPageChange}/>);
    }
    return null;
}
