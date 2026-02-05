'use client';
import { useState } from 'react';
import { cn } from '@/utils/utils';
import { ChevronLeft, ChevronRight, Eye, Printer, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import React from 'react';
import { RRPSearchResult } from '@/types/rrp';
interface PrintRRPResultsTableProps {
    results: RRPSearchResult[];
    onPreview: (rrp: RRPSearchResult) => void;
    onPrint: (rrp: RRPSearchResult) => void;
    onUploadReferenceDoc: (rrp: RRPSearchResult, file: File) => void;
    onPreviewReferenceDoc: (rrp: RRPSearchResult) => void;
    isUploading: boolean;
    className?: string;
    canUploadRefDoc?: boolean;
    canEditRefDoc?: boolean;
    canDeleteRefDoc?: boolean;
    currentPage: number;
    totalPages: number;
    totalCount: number;
    onPageChange: (page: number) => void;
}
export const PrintRRPResultsTable = ({ results = [], onPreview, onPrint, onUploadReferenceDoc, onPreviewReferenceDoc, isUploading, className, canUploadRefDoc = false, canEditRefDoc = false, canDeleteRefDoc = false, currentPage, totalPages, totalCount, onPageChange }: PrintRRPResultsTableProps) => {
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const safeResults = Array.isArray(results) ? results : [];
    const toggleRow = (rrpNumber: string) => {
        setExpandedRows(prev => {
            const newSet = new Set(prev);
            if (newSet.has(rrpNumber)) {
                newSet.delete(rrpNumber);
            }
            else {
                newSet.add(rrpNumber);
            }
            return newSet;
        });
    };
    if (safeResults.length === 0) {
        return (<div className="text-center py-8 text-gray-500">
        No results found
      </div>);
    }
    const currentPageResults = safeResults;
    return (<div className="space-y-4">
      <div className={cn("relative overflow-x-auto", className)}>
        <table className="w-full text-sm text-left">
          <thead className="text-xs uppercase bg-[#003594]/5 sticky top-0 z-10">
            <tr>
              <th scope="col" className="px-6 py-4 font-semibold text-[#003594]">RRP Number</th>
              <th scope="col" className="px-6 py-4 font-semibold text-[#003594]">Date</th>
              <th scope="col" className="px-6 py-4 font-semibold text-[#003594]">Supplier</th>
              <th scope="col" className="px-6 py-4 font-semibold text-[#003594]">Type</th>
              <th scope="col" className="px-6 py-4 font-semibold text-[#003594]">Status</th>
              <th scope="col" className="px-6 py-4 font-semibold text-[#003594]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentPageResults.map((rrp) => (<React.Fragment key={rrp.rrpNumber}>
                <tr className="border-b border-[#002a6e]/10 hover:bg-[#003594]/5 transition-colors cursor-pointer" onClick={() => toggleRow(rrp.rrpNumber)}>
                  <td className="px-6 py-4 font-medium flex items-center">
                    {expandedRows.has(rrp.rrpNumber) ? (<ChevronUp className="h-4 w-4 mr-2 text-[#003594]"/>) : (<ChevronDown className="h-4 w-4 mr-2 text-[#003594]"/>)}
                    {rrp.rrpNumber}
                  </td>
                  <td className="px-6 py-4">
                    {new Date(rrp.rrpDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">{rrp.supplierName}</td>
                  <td className="px-6 py-4">
                    <span className={cn("px-3 py-1 rounded-full text-xs font-medium", rrp.type === 'local' ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800")}>
                      {rrp.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn("px-3 py-1 rounded-full text-xs font-medium", rrp.approvalStatus === 'APPROVED' && "bg-green-100 text-green-800", rrp.approvalStatus === 'PENDING' && "bg-yellow-100 text-yellow-800", rrp.approvalStatus === 'REJECTED' && "bg-red-100 text-red-800")}>
                      {rrp.approvalStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm" className="border-[#002a6e]/10 hover:bg-[#003594]/5 hover:text-[#003594]" onClick={(e) => {
                e.stopPropagation();
                onPreview(rrp);
            }}>
                        <Eye className="h-4 w-4 mr-1"/>
                        Preview
                      </Button>
                      {rrp.approvalStatus === 'APPROVED' && (<Button variant="outline" size="sm" className="border-[#002a6e]/10 hover:bg-[#003594]/5 hover:text-[#003594]" onClick={(e) => {
                    e.stopPropagation();
                    onPrint(rrp);
                }}>
                          <Printer className="h-4 w-4 mr-1"/>
                          Print
                        </Button>)}
                      {rrp.approvalStatus === 'APPROVED' && (<div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                          {rrp.referenceDoc ? (<>
                              <Button variant="outline" size="sm" className="border-green-500 text-green-600 hover:bg-green-50" onClick={(e) => {
                        e.stopPropagation();
                        onPreviewReferenceDoc(rrp);
                    }}>
                                View Doc
                              </Button>
                              {canEditRefDoc && (<>
                                  <input type="file" id={`rrp-edit-ref-${rrp.rrpNumber}`} accept="image/*,.pdf" className="hidden" onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                                onUploadReferenceDoc(rrp, file);
                            }
                        }} disabled={isUploading}/>
                                  <Button variant="outline" size="sm" className="border-blue-500 text-blue-600 hover:bg-blue-50" disabled={isUploading} onClick={(e) => {
                            e.stopPropagation();
                            const input = document.getElementById(`rrp-edit-ref-${rrp.rrpNumber}`) as HTMLInputElement | null;
                            input?.click();
                        }}>
                                    {isUploading ? 'Updating...' : 'Replace'}
                                  </Button>
                                </>)}
                              {canDeleteRefDoc && (<Button variant="outline" size="sm" className="border-red-500 text-red-600 hover:bg-red-50" onClick={(e) => {
                            e.stopPropagation();
                            window.dispatchEvent(new CustomEvent('delete-rrp-ref-doc', {
                                detail: { rrpNumber: rrp.rrpNumber },
                            }));
                        }}>
                                  Delete
                                </Button>)}
                            </>) : (canUploadRefDoc && (<>
                                <input type="file" accept="image/*,.pdf" className="hidden" id={`file-upload-${rrp.rrpNumber}`} onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                            onUploadReferenceDoc(rrp, file);
                        }
                    }} disabled={isUploading}/>
                                <Button variant="outline" size="sm" className="border-green-500 text-green-600 hover:bg-green-50" disabled={isUploading} onClick={(e) => {
                        e.stopPropagation();
                        document.getElementById(`file-upload-${rrp.rrpNumber}`)?.click();
                    }}>
                                  {isUploading ? (<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>) : ('Upload Doc')}
                                </Button>
                              </>))}
                        </div>)}
                    </div>
                  </td>
                </tr>
                {expandedRows.has(rrp.rrpNumber) && (<tr className="bg-[#f8fafc]">
                    <td colSpan={6} className="px-6 py-4">
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <p className="text-sm font-medium text-[#003594]">Invoice Number</p>
                            <p className="text-sm">{rrp.invoiceNumber}</p>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-[#003594]">Invoice Date</p>
                            <p className="text-sm">{new Date(rrp.invoiceDate).toLocaleDateString()}</p>
                            </div>
                            <div>
                            <p className="text-sm font-medium text-[#003594]">Currency</p>
                            <p className="text-sm">{rrp.currency}</p>
                            </div>
                            <div>
                            <p className="text-sm font-medium text-[#003594]">Forex Rate</p>
                            <p className="text-sm">{rrp.forexRate}</p>
                            </div>
                            </div>
                        <div className="border-t border-[#002a6e]/10 pt-4">
                          <h4 className="text-sm font-medium text-[#003594] mb-2">Items</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-[#003594]/5">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-[#003594]">Item Name</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-[#003594]">Part Number</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-[#003594]">Quantity</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-[#003594]">Unit Price</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-[#003594]">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rrp.items.map((item) => (<tr key={item.id} className="border-t border-[#002a6e]/10">
                                    <td className="px-4 py-2">{item.itemName}</td>
                              <td className="px-4 py-2">{item.partNumber}</td>
                              <td className="px-4 py-2">{item.receivedQuantity} {item.unit}</td>
                                    <td className="px-4 py-2">{item.itemPrice}</td>
                              <td className="px-4 py-2">{item.totalAmount}</td>
                            </tr>))}
                        </tbody>
                      </table>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>)}
              </React.Fragment>))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (<div className="flex justify-center space-x-2 mt-6">
          <Button variant="outline" size="sm" className="border-[#002a6e]/10 hover:bg-[#003594]/5 hover:text-[#003594]" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}>
            <ChevronLeft className="h-4 w-4"/>
          </Button>
          <span className="py-2 text-sm text-[#003594]">
            Page {currentPage} of {totalPages} ({totalCount} total)
          </span>
          <Button variant="outline" size="sm" className="border-[#002a6e]/10 hover:bg-[#003594]/5 hover:text-[#003594]" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}>
            <ChevronRight className="h-4 w-4"/>
          </Button>
        </div>)}
    </div>);
};
