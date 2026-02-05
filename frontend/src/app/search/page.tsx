'use client';
import { SearchControls, SearchResults, ItemDetailsModal } from '@/components/search';
import { useSearch } from '@/hooks/useSearch';
import { useItemDetails } from '@/hooks/useItemDetails';
import { useAuthContext } from '@/context/AuthContext';
export default function SearchPage() {
    const { permissions } = useAuthContext();
    const canViewFullDetails = permissions.includes('can_view_full_item_details_in_search');
    const { results, isLoading, error, currentPage, totalCount, totalPages, handleSearch, handlePageChange, } = useSearch();
    const { selectedItem, isModalOpen, fetchItemDetails, closeModal, } = useItemDetails();
    const handleRowDoubleClick = (item: {
        id: number;
    }) => {
        if (canViewFullDetails) {
            fetchItemDetails(item.id);
        }
    };
    return (<div className="min-h-screen bg-gray-50">
    <div className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">Search Inventory</h1>
              <p className="text-gray-600 mt-1">Find items by NAC code, part number, or equipment number</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[#d2293b] animate-pulse"></div>
              <span className="text-sm text-gray-600">Live Search</span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-[#002a6e]/10 p-6 hover:border-[#d2293b]/20 transition-colors">
        <SearchControls onUniversalSearch={handleSearch('universal')} onEquipmentSearch={handleSearch('equipmentNumber')} onPartSearch={handleSearch('partNumber')}/>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-[#002a6e]/10 p-6 hover:border-[#d2293b]/20 transition-colors">
            {isLoading ? (<div className="flex items-center justify-center h-24">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#003594] border-t-transparent"></div>
              </div>) : (<SearchResults results={results} isLoading={isLoading} error={error} onRowDoubleClick={handleRowDoubleClick} canViewFullDetails={canViewFullDetails} currentPage={currentPage} totalCount={totalCount} totalPages={totalPages} onPageChange={handlePageChange}/>)}
        </div>

          {canViewFullDetails && (<ItemDetailsModal isOpen={isModalOpen} onClose={closeModal} item={selectedItem}/>)}
        </div>
      </div>
      </div>);
}
