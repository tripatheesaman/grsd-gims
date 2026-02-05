'use client';
import { useState } from 'react';
import { cn } from '@/utils/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
interface SearchResult {
    id: number;
    nacCode: string;
    itemName: string;
    partNumber: string;
    equipmentNumber: string;
    currentBalance: string;
    unit: string;
    specifications: string;
    imageUrl: string;
    remarks: string;
    requestedQuantity: number;
    previousRate: string;
}
interface SearchResultsTableProps {
    results: SearchResult[];
    onRowDoubleClick: (item: SearchResult) => void;
    className?: string;
}
const ITEMS_PER_PAGE = 10;
export const SearchResultsTable = ({ results, onRowDoubleClick, className }: SearchResultsTableProps) => {
    const [selectedRow, setSelectedRow] = useState<number | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const safeResults = Array.isArray(results) ? results : [];
    const totalPages = Math.ceil(safeResults.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const currentPageResults = safeResults.slice(startIndex, endIndex);
    const handlePageChange = (newPage: number) => {
        if (newPage >= 1 && newPage <= totalPages) {
            setCurrentPage(newPage);
        }
    };
    if (safeResults.length === 0) {
        return (<div className="text-center py-8 text-gray-500">
        No results found
      </div>);
    }
    return (<div className="space-y-4">
      <div className={cn("relative overflow-x-auto border rounded-lg", className)}>
        <table className="w-full text-sm text-left text-gray-900">
          <thead className="text-xs uppercase bg-gray-50 sticky top-0 z-10">
            <tr>
              <th scope="col" className="px-4 py-3 w-[120px]">NAC Code</th>
              <th scope="col" className="px-4 py-3 w-[250px]">Item Name</th>
              <th scope="col" className="px-4 py-3 w-[150px]">Part Number</th>
              <th scope="col" className="px-4 py-3 w-[150px]">Equipment Number</th>
              <th scope="col" className="px-4 py-3 w-[120px]">Unit</th>
              <th scope="col" className="px-4 py-3 w-[120px]">Requested Qty</th>
            </tr>
          </thead>
          <tbody>
            {currentPageResults.map((item) => (<tr key={item.id} className={cn("border-b hover:bg-gray-50 cursor-pointer", selectedRow === item.id && "bg-blue-50")} onClick={() => setSelectedRow(item.id)} onDoubleClick={() => onRowDoubleClick(item)}>
                <td className="px-4 py-3 font-medium">
                  {item.nacCode}
                </td>
                <td className="px-4 py-3 max-w-[250px] truncate" title={item.itemName}>
                  {item.itemName}
                </td>
                <td className="px-4 py-3 max-w-[150px] truncate" title={item.partNumber}>
                  {item.partNumber}
                </td>
                <td className="px-4 py-3 max-w-[150px] truncate" title={item.equipmentNumber}>
                  {item.equipmentNumber}
                </td>
                <td className="px-4 py-3">
                  {item.unit}
                </td>
                <td className="px-4 py-3">
                  {item.requestedQuantity}
                </td>
              </tr>))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (<div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
          <div className="flex-1 flex justify-between sm:hidden">
            <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
              Previous
            </button>
            <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
              Next
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                <span className="font-medium">{Math.min(endIndex, safeResults.length)}</span> of{' '}
                <span className="font-medium">{safeResults.length}</span> results
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                  <span className="sr-only">Previous</span>
                  <ChevronLeft className="h-5 w-5"/>
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (<button key={page} onClick={() => handlePageChange(page)} className={cn("relative inline-flex items-center px-4 py-2 border text-sm font-medium", currentPage === page
                    ? "z-10 bg-blue-50 border-blue-500 text-blue-600"
                    : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50")}>
                    {page}
                  </button>))}
                <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                  <span className="sr-only">Next</span>
                  <ChevronRight className="h-5 w-5"/>
                </button>
              </nav>
            </div>
          </div>
        </div>)}
    </div>);
};
