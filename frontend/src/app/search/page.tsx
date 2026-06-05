'use client';

import { SearchControls, SearchResults, ItemDetailsModal } from '@/components/search';
import { useSearch } from '@/hooks/useSearch';
import { useItemDetails } from '@/hooks/useItemDetails';
import { useAuthContext } from '@/context/AuthContext';
import { InventoryPageHeader } from '@/components/inventory/InventoryPageHeader';
import { SearchResult, ReceiveSearchResult } from '@/types/search';

export default function SearchPage() {
    const { permissions } = useAuthContext();
    const canViewFullDetails = permissions.includes('can_view_full_item_details_in_search');
    const {
        searchParams,
        results,
        isLoading,
        error,
        currentPage,
        pageSize,
        totalCount,
        totalPages,
        handlePageChange,
        handlePageSizeChange,
        clearFilters,
        handleFilterChange,
        hasActiveFilters,
    } = useSearch();
    const {
        selectedItem,
        isModalOpen,
        isLoading: detailsLoading,
        error: detailsError,
        fetchItemDetails,
        closeModal,
    } = useItemDetails();

    const handleViewDetails = (item: SearchResult | ReceiveSearchResult) => {
        if (canViewFullDetails) {
            fetchItemDetails(item.id);
        }
    };

    return (
        <div className="bg-[#f6f8fc]">
            <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:py-8">
                <InventoryPageHeader
                    title="Search inventory"
                    description="Find spares by NAC code, part number, equipment code, or asset name. Browse all stock when filters are empty."
                    badge="Live search"
                />

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                    <SearchControls
                        values={{
                            universal: searchParams.universal,
                            equipment: searchParams.equipmentNumber,
                            part: searchParams.partNumber,
                        }}
                        onChange={handleFilterChange}
                        onClear={clearFilters}
                    />
                </section>

                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <SearchResults
                        results={results}
                        isLoading={isLoading}
                        error={error}
                        onViewDetails={handleViewDetails}
                        onRowDoubleClick={handleViewDetails}
                        canViewFullDetails={canViewFullDetails}
                        currentPage={currentPage}
                        totalCount={totalCount}
                        totalPages={totalPages}
                        pageSize={pageSize}
                        onPageChange={handlePageChange}
                        onPageSizeChange={handlePageSizeChange}
                        hasActiveFilters={hasActiveFilters}
                    />
                </section>

                {canViewFullDetails && (
                    <ItemDetailsModal
                        isOpen={isModalOpen}
                        onClose={closeModal}
                        item={selectedItem}
                        isLoading={detailsLoading}
                        error={detailsError}
                    />
                )}
            </div>
        </div>
    );
}
