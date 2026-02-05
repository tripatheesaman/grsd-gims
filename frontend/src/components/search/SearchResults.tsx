'use client';
import { SearchResult, ReceiveSearchResult } from '@/types/search';
interface SearchResultsProps {
    results: (SearchResult | ReceiveSearchResult)[] | null;
    isLoading: boolean;
    error: string | null;
    onRowClick?: (item: SearchResult | ReceiveSearchResult) => void;
    onRowDoubleClick?: (item: SearchResult | ReceiveSearchResult) => void;
    canViewFullDetails: boolean;
    selectedItemId?: number | null;
    currentPage?: number;
    totalCount?: number;
    totalPages?: number;
    onPageChange?: (page: number) => void;
}
export const SearchResults = ({ results, isLoading, error, onRowClick, onRowDoubleClick, canViewFullDetails, selectedItemId, currentPage = 1, totalCount = 0, totalPages = 0, onPageChange }: SearchResultsProps) => {
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
    return (<div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full table-fixed divide-y divide-[#002a6e]/10">
          <thead>
            <tr className="bg-[#003594]/5">
              <th scope="col" className="w-24 px-3 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider">
                NAC Code
              </th>
              <th scope="col" className="w-32 px-3 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider">
                Part Numbers
              </th>
              <th scope="col" className="w-48 px-3 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider">
                Item Name
              </th>
              <th scope="col" className="w-24 px-3 py-3 text-center text-xs font-medium text-[#003594] uppercase tracking-wider">
                Balance Quantity
              </th>
              <th scope="col" className="w-32 px-3 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider">
                Applicable Fleet
              </th>
              <th scope="col" className="w-24 px-3 py-3 text-center text-xs font-medium text-[#003594] uppercase tracking-wider">
                Item Location
              </th>
              <th scope="col" className="w-24 px-3 py-3 text-center text-xs font-medium text-[#003594] uppercase tracking-wider">
                Card Number
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-[#002a6e]/10">
            {results.map((item) => {
            const isSelected = selectedItemId === item.id;
            const isInteractive = Boolean(onRowClick || onRowDoubleClick);
            return (<tr key={item.id} onClick={() => onRowClick?.(item)} onDoubleClick={() => canViewFullDetails && onRowDoubleClick?.(item)} className={`transition-colors group ${isInteractive ? 'cursor-pointer' : ''} ${isSelected ? 'bg-[#003594]/10' : 'hover:bg-[#003594]/5'}`}>
                <td className="px-3 py-4">
                  <div className="text-sm font-medium text-[#003594] group-hover:text-[#d2293b] transition-colors break-words">
                    {item.nacCode}
                  </div>
                </td>
                <td className="px-3 py-4">
                  <div className="text-sm text-gray-900 break-words">
                    {item.partNumber}
                  </div>
                </td>
                <td className="px-3 py-4">
                  <div className="text-sm text-gray-900 break-words">
                    {item.itemName}
                  </div>
                </td>
                <td className="px-3 py-4">
                  <div className="text-sm text-center font-medium text-[#003594] group-hover:text-[#d2293b] transition-colors">
                    {item.currentBalance}
                  </div>
                </td>
                <td className="px-3 py-4">
                  <div className="text-sm text-gray-900 break-words">
                    {item.equipmentNumber}
                  </div>
                </td>
                <td className="px-3 py-4">
                  <div className="text-sm text-gray-900 text-center break-words">
                    {item.location}
                  </div>
                </td>
                <td className="px-3 py-4">
                  <div className="text-sm text-gray-900 text-center break-words">
                    {item.cardNumber}
                  </div>
                </td>
              </tr>);
        })}
          </tbody>
        </table>
      </div>

      
      {onPageChange && results && results.length > 0 && (<div className="flex items-center justify-between px-4 py-3 bg-white border-t border-[#002a6e]/10">
          <div className="flex items-center text-sm text-gray-700">
            <span>
              Page {currentPage} of {totalPages || 1} ({totalCount || results.length} total records)
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1} className="px-3 py-1 text-sm font-medium text-[#003594] bg-white border border-[#003594] rounded-md hover:bg-[#003594] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Previous
            </button>
            
            <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= (totalPages || 1)} className="px-3 py-1 text-sm font-medium text-[#003594] bg-white border border-[#003594] rounded-md hover:bg-[#003594] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Next
            </button>
          </div>
        </div>)}
    </div>);
};
