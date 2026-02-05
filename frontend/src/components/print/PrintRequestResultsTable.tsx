'use client';
import { useState } from 'react';
import { Eye, Printer, ChevronDown, ChevronUp, Upload, FileText, Loader2 } from 'lucide-react';
import { RequestSearchResult } from '@/types/request';
import { Button } from '@/components/ui/button';
import React from 'react';
interface PrintRequestResultsTableProps {
    results: RequestSearchResult[];
    onPreview: (request: RequestSearchResult) => void;
    onPrint: (request: RequestSearchResult) => void;
    onUploadReferenceDoc: (request: RequestSearchResult, file: File) => void;
    onPreviewReferenceDoc: (request: RequestSearchResult) => void;
    isUploading?: boolean;
    canUploadRefDoc?: boolean;
    canEditRefDoc?: boolean;
    canDeleteRefDoc?: boolean;
    className?: string;
    currentPage?: number;
    totalCount?: number;
    totalPages?: number;
    onPageChange?: (page: number) => void;
}
export const PrintRequestResultsTable = ({ results = [], onPreview, onPrint, onUploadReferenceDoc, onPreviewReferenceDoc, isUploading, canUploadRefDoc = false, canEditRefDoc = false, canDeleteRefDoc = false, className, currentPage = 1, totalCount = 0, totalPages = 0, onPageChange, }: PrintRequestResultsTableProps) => {
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const safeResults = Array.isArray(results) ? results : [];
    const handlePageChange = (newPage: number) => {
        if (onPageChange && newPage >= 1 && newPage <= totalPages) {
            onPageChange(newPage);
        }
    };
    const toggleRow = (requestNumber: string) => {
        setExpandedRows(prev => {
            const newSet = new Set(prev);
            if (newSet.has(requestNumber)) {
                newSet.delete(requestNumber);
            }
            else {
                newSet.add(requestNumber);
            }
            return newSet;
        });
    };
    const handleFileUpload = (request: RequestSearchResult, event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onUploadReferenceDoc(request, file);
        }
    };
    if (safeResults.length === 0) {
        return (<div className="text-center py-8 text-gray-500">
        No results found
      </div>);
    }
    return (<div className="space-y-4">
      <div className={`relative overflow-x-auto border rounded-lg ${className || ''}`}>
        <table className="w-full text-sm text-left text-gray-900">
          <thead className="text-xs uppercase bg-gray-50 sticky top-0 z-10">
            <tr>
              <th scope="col" className="px-4 py-3">Request Number</th>
              <th scope="col" className="px-4 py-3">Request Date</th>
              <th scope="col" className="px-4 py-3">Requested By</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {safeResults.map((request) => (<React.Fragment key={request.requestNumber}>
                <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => toggleRow(request.requestNumber)}>
                  <td className="px-4 py-3 font-medium flex items-center">
                    {expandedRows.has(request.requestNumber) ? (<ChevronUp className="h-4 w-4 mr-2"/>) : (<ChevronDown className="h-4 w-4 mr-2"/>)}
                    {request.requestNumber}
                  </td>
                  <td className="px-4 py-3">
                    {new Date(request.requestDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {request.requestedBy}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`
                      px-2 py-1 rounded-full text-xs font-medium
                      ${request.approvalStatus === 'APPROVED' ? "bg-green-100 text-green-800" : ""}
                      ${request.approvalStatus === 'PENDING' ? "bg-yellow-100 text-yellow-800" : ""}
                      ${request.approvalStatus === 'REJECTED' ? "bg-red-100 text-red-800" : ""}
                    `}>
                      {request.approvalStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm" onClick={(e) => {
                e.stopPropagation();
                onPreview(request);
            }}>
                        <Eye className="h-4 w-4 mr-1"/>
                        Preview
                      </Button>
                      {request.approvalStatus === 'APPROVED' && (<>
                          <Button variant="outline" size="sm" onClick={(e) => {
                    e.stopPropagation();
                    onPrint(request);
                }}>
                            <Printer className="h-4 w-4 mr-1"/>
                            Print
                          </Button>
                          {request.referenceDoc ? (<div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                              <Button variant="outline" size="sm" className="border-green-500 text-green-600 hover:bg-green-50" onClick={(e) => {
                        e.stopPropagation();
                        onPreviewReferenceDoc(request);
                    }}>
                                <FileText className="h-4 w-4 mr-1"/>
                                View Ref Doc
                              </Button>
                              {canEditRefDoc && (<>
                                  <input type="file" id={`edit-ref-${request.requestNumber}`} accept="image/*,.pdf" className="hidden" onChange={(e) => {
                            e.stopPropagation();
                            handleFileUpload(request, e);
                        }} disabled={!!isUploading}/>
                                  <Button type="button" variant="outline" size="sm" className="border-blue-500 text-blue-600 hover:bg-blue-50" onClick={(e) => {
                            e.stopPropagation();
                            const input = document.getElementById(`edit-ref-${request.requestNumber}`) as HTMLInputElement | null;
                            input?.click();
                        }} disabled={!!isUploading}>
                                    {isUploading ? (<>
                                        Updating...
                                        <Loader2 className="ml-2 h-4 w-4 animate-spin"/>
                                      </>) : (<>
                                        Replace
                                        <Upload className="h-4 w-4 ml-2"/>
                                      </>)}
                                  </Button>
                                </>)}
                              {canDeleteRefDoc && (<Button variant="outline" size="sm" className="border-red-500 text-red-600 hover:bg-red-50" onClick={(e) => {
                            e.stopPropagation();
                            window.dispatchEvent(new CustomEvent('delete-request-ref-doc', {
                                detail: { requestNumber: request.requestNumber },
                            }));
                        }}>
                                  Delete
                                </Button>)}
                            </div>) : (canUploadRefDoc && (<div className="relative">
                                <input type="file" accept="image/*,.pdf" onChange={(e) => {
                        e.stopPropagation();
                        handleFileUpload(request, e);
                    }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" id={`upload-${request.requestNumber}`} disabled={!!isUploading}/>
                                <Button variant="outline" size="sm" className="border-blue-500 text-blue-600 hover:bg-blue-50" disabled={!!isUploading}>
                                  {isUploading ? (<>
                                      Uploading...
                                      <Loader2 className="ml-2 h-4 w-4 animate-spin"/>
                                    </>) : (<>
                                      Upload Ref Doc
                                    <Upload className="h-4 w-4 ml-2"/>
                                  </>)}
                              </Button>
                            </div>))}
                        </>)}
                    </div>
                  </td>
                </tr>
                {expandedRows.has(request.requestNumber) && (<tr className="bg-gray-50">
                    <td colSpan={5} className="px-4 py-3">
                      <table className="w-full">
                        <thead>
                          <tr className="text-xs uppercase text-gray-500">
                            <th className="px-4 py-2">NAC Code</th>
                            <th className="px-4 py-2">Part Number</th>
                            <th className="px-4 py-2">Item Name</th>
                            <th className="px-4 py-2">Quantity</th>
                            <th className="px-4 py-2">Equipment Number</th>
                          </tr>
                        </thead>
                        <tbody>
                          {request.items.map((item) => (<tr key={item.id} className="border-t">
                              <td className="px-4 py-2">{item.nacCode}</td>
                              <td className="px-4 py-2">{item.partNumber}</td>
                              <td className="px-4 py-2">{item.itemName}</td>
                              <td className="px-4 py-2">{item.requestedQuantity}</td>
                              <td className="px-4 py-2">{item.equipmentNumber}</td>
                            </tr>))}
                        </tbody>
                      </table>
                    </td>
                  </tr>)}
              </React.Fragment>))}
          </tbody>
        </table>
      </div>

      
      {onPageChange && totalPages > 1 && (<div className="flex items-center justify-between px-4 py-3 bg-white border-t border-[#002a6e]/10">
          <div className="flex items-center text-sm text-gray-700">
            <span>
              Page {currentPage} of {totalPages} ({totalCount} total records)
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1} className="px-3 py-1 text-sm font-medium text-[#003594] bg-white border border-[#003594] rounded-md hover:bg-[#003594] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Previous
            </button>
            
            <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= totalPages} className="px-3 py-1 text-sm font-medium text-[#003594] bg-white border border-[#003594] rounded-md hover:bg-[#003594] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Next
            </button>
          </div>
        </div>)}
    </div>);
};
