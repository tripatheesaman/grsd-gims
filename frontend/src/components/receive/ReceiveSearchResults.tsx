'use client';
import { ReceiveSearchResult } from '@/types/search';
import { format } from 'date-fns';
interface ReceiveSearchResultsProps {
    results: ReceiveSearchResult[] | null;
    isLoading: boolean;
    error: string | null;
    onRowDoubleClick: (item: ReceiveSearchResult) => void;
    canViewFullDetails: boolean;
    currentPage?: number;
    totalCount?: number;
    totalPages?: number;
    onPageChange?: (page: number) => void;
}
export const ReceiveSearchResults = ({ results, isLoading, error, onRowDoubleClick, canViewFullDetails, currentPage = 1, totalCount = 0, totalPages = 0, onPageChange }: ReceiveSearchResultsProps) => {
    if (isLoading) {
        return (<div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003594]"></div>
      </div>);
    }
    if (error) {
        return (<div className="bg-red-50 border border-[#d2293b]/20 rounded-lg p-4 text-[#d2293b] text-center">
        <p className="font-medium">Error loading results</p>
        <p className="text-sm mt-1">{error}</p>
      </div>);
    }
    if (!results || results.length === 0) {
        return (<div className="bg-gray-50 border border-[#002a6e]/10 rounded-lg p-8 text-center">
        <p className="text-gray-500">No items found matching your search criteria</p>
      </div>);
    }
    return (<div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-[#002a6e]/10">
        <thead>
          <tr className="bg-[#003594]/5">
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider">
              Request Number
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider">
              Request Date
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider">
              NAC Code
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider">
              Item Name
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider">
              Part Number
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider">
              Requested Quantity
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider">
              Equipment Number
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-[#002a6e]/10">
          {results.map((item) => (<tr key={item.id} onDoubleClick={() => canViewFullDetails && onRowDoubleClick(item)} className={`hover:bg-[#003594]/5 transition-colors group ${canViewFullDetails ? 'cursor-pointer' : ''}`}>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-[#003594] group-hover:text-[#d2293b] transition-colors">
                  {item.requestNumber}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">
                  {format(new Date(item.requestDate), 'PPP')}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">{item.nacCode}</div>
              </td>
              <td className="px-6 py-4">
                <div className="text-sm text-gray-900">{item.itemName}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">{item.partNumber || 'NA'}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-center font-medium text-[#003594] group-hover:text-[#d2293b] transition-colors">
                  {item.requestedQuantity}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">{item.equipmentNumber}</div>
              </td>
            </tr>))}
        </tbody>
      </table>
      
      
      {onPageChange && totalPages > 1 && (<div className="flex items-center justify-between px-4 py-3 bg-white border-t border-[#002a6e]/10">
          <div className="flex items-center text-sm text-gray-700">
            <span>
              Page {currentPage} of {totalPages} ({totalCount} total records)
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1} className="px-3 py-1 text-sm font-medium text-[#003594] bg-white border border-[#003594] rounded-md hover:bg-[#003594] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Previous
            </button>
            
            <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= totalPages} className="px-3 py-1 text-sm font-medium text-[#003594] bg-white border border-[#003594] rounded-md hover:bg-[#003594] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Next
            </button>
          </div>
        </div>)}
    </div>);
};
