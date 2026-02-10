'use client';
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Eye, Printer, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/utils/utils';
import { API } from '@/lib/api';
import { useCustomToast } from '@/components/ui/custom-toast';
import { getErrorMessage } from '@/lib/errorHandling';
interface ReceiveSearchResult {
    receiveNumber: string;
    receiveDate: string;
    receivedBy: string;
    approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
    items: {
        id: number;
        nacCode: string;
        partNumber: string;
        itemName: string;
        receiveQuantity: number;
        equipmentNumber: string;
        imageUrl: string;
        location: string;
        cardNumber: string;
        unit: string;
        remarks: string;
    }[];
}
interface PrintReceiveResultsTableProps {
    results: ReceiveSearchResult[] | null;
    currentPage: number;
    itemsPerPage: number;
    onPreview: (receive: ReceiveSearchResult) => void;
}
export const PrintReceiveResultsTable = ({ results, currentPage, itemsPerPage, onPreview }: PrintReceiveResultsTableProps) => {
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const { showErrorToast } = useCustomToast();
    if (!results || results.length === 0) {
        return (<div className="text-center py-4 text-gray-500">
        No receives found
      </div>);
    }
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentPageResults = results.slice(startIndex, endIndex);
    const toggleRow = (receiveNumber: string) => {
        const newExpandedRows = new Set(expandedRows);
        if (newExpandedRows.has(receiveNumber)) {
            newExpandedRows.delete(receiveNumber);
        }
        else {
            newExpandedRows.add(receiveNumber);
        }
        setExpandedRows(newExpandedRows);
    };
    const handlePrint = async (receive: ReceiveSearchResult) => {
        try {
            const response = await API.get(`/api/receive/${receive.receiveNumber}/print`, {
                responseType: 'blob'
            });
            const excelUrl = URL.createObjectURL(response.data);
            const link = document.createElement('a');
            link.href = excelUrl;
            link.download = `receive_${receive.receiveNumber}.xlsx`;
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
    return (<div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className="text-left px-4 py-3">Receive #</th>
            <th className="text-left px-4 py-3">Date</th>
            <th className="text-left px-4 py-3">Received By</th>
            <th className="text-left px-4 py-3">Status</th>
            <th className="text-left px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {currentPageResults.map((receive) => (<React.Fragment key={receive.receiveNumber}>
              <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => toggleRow(receive.receiveNumber)}>
                <td className="px-4 py-3 font-medium flex items-center">
                  {expandedRows.has(receive.receiveNumber) ? (<ChevronUp className="h-4 w-4 mr-2"/>) : (<ChevronDown className="h-4 w-4 mr-2"/>)}
                  {receive.receiveNumber}
                </td>
                <td className="px-4 py-3">
                  {new Date(receive.receiveDate).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  {receive.receivedBy}
                </td>
                <td className="px-4 py-3">
                  <span className={cn("px-2 py-1 rounded-full text-xs font-medium", receive.approvalStatus === 'APPROVED' && "bg-green-100 text-green-800", receive.approvalStatus === 'PENDING' && "bg-yellow-100 text-yellow-800", receive.approvalStatus === 'REJECTED' && "bg-red-100 text-red-800")}>
                    {receive.approvalStatus}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex space-x-2">
                    <Button variant="outline" size="sm" onClick={(e) => {
                e.stopPropagation();
                onPreview(receive);
            }}>
                      <Eye className="h-4 w-4 mr-1"/>
                      Preview
                    </Button>
                    {receive.approvalStatus === 'APPROVED' && (<Button variant="outline" size="sm" onClick={(e) => {
                    e.stopPropagation();
                    handlePrint(receive);
                }}>
                        <Printer className="h-4 w-4 mr-1"/>
                        Print
                      </Button>)}
                  </div>
                </td>
              </tr>
              {expandedRows.has(receive.receiveNumber) && (<tr className="bg-gray-50">
                  <td colSpan={5} className="px-4 py-3">
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium text-gray-500">Receive Date</p>
                          <p>{new Date(receive.receiveDate).toLocaleDateString()}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Received By</p>
                          <p>{receive.receivedBy}</p>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left p-2">Item Name</th>
                              <th className="text-left p-2">Part Number</th>
                              <th className="text-left p-2">Equipment Number</th>
                              <th className="text-left p-2">Quantity</th>
                              <th className="text-left p-2">Location</th>
                              <th className="text-left p-2">Card Number</th>
                            </tr>
                          </thead>
                          <tbody>
                            {receive.items.map((item) => (<tr key={item.id} className="border-b">
                                <td className="p-2">{item.itemName}</td>
                                <td className="p-2">{item.partNumber}</td>
                                <td className="p-2">{item.equipmentNumber}</td>
                                <td className="p-2">{item.receiveQuantity}</td>
                                <td className="p-2">{item.location}</td>
                                <td className="p-2">{item.cardNumber}</td>
                              </tr>))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </td>
                </tr>)}
            </React.Fragment>))}
        </tbody>
      </table>
    </div>);
};
