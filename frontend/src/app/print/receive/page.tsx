'use client';
import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { API } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PrintReceiveResultsTable } from '@/components/print/PrintReceiveResultsTable';
import { PrintReceivePreviewModal } from '@/components/print/PrintReceivePreviewModal';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Button } from '@/components/ui/button';
import { expandEquipmentNumbers } from '@/utils/equipmentNumbers';
import { getErrorMessage } from '@/lib/errorHandling';
interface ReceiveSearchParams {
    universal?: string;
    equipmentNumber?: string;
    partNumber?: string;
}
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
export default function PrintReceivePage() {
    const [searchParams, setSearchParams] = useState<ReceiveSearchParams>({});
    const [results, setResults] = useState<ReceiveSearchResult[] | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [previewReceive, setPreviewReceive] = useState<ReceiveSearchResult | null>(null);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const debouncedUniversal = useDebounce(searchParams.universal, 500);
    const debouncedEquipment = useDebounce(searchParams.equipmentNumber, 500);
    const debouncedPart = useDebounce(searchParams.partNumber, 500);
    const { showErrorToast } = useCustomToast();
    const searchReceives = useCallback(async (params: ReceiveSearchParams) => {
        try {
            const response = await API.get('/api/receive/search', { params });
            setResults(response.data);
        }
        catch (error) {
            showErrorToast({
                title: 'Error',
                message: getErrorMessage(error, 'Failed to search receives. Please try again.'),
            });
        }
    }, [showErrorToast]);
    useEffect(() => {
        if (debouncedUniversal || debouncedEquipment || debouncedPart) {
            const params = {
                universal: debouncedUniversal,
                equipmentNumber: debouncedEquipment,
                partNumber: debouncedPart,
            };
            searchReceives(params);
        }
        else {
            setResults(null);
        }
        setCurrentPage(1);
    }, [debouncedUniversal, debouncedEquipment, debouncedPart, searchReceives]);
    const handleUniversalSearch = (value: string) => {
        setSearchParams(prev => ({ ...prev, universal: value }));
    };
    const handleEquipmentSearch = (value: string) => {
        const expandedEquipmentNumbers = value
            ? Array.from(expandEquipmentNumbers(value)).join(',')
            : '';
        setSearchParams(prev => ({ ...prev, equipmentNumber: expandedEquipmentNumbers }));
    };
    const handlePartSearch = (value: string) => {
        setSearchParams(prev => ({ ...prev, partNumber: value }));
    };
    const handlePreview = (receive: ReceiveSearchResult) => {
        setPreviewReceive(receive);
    };
    const totalCount = results?.length || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));
    const canPaginate = totalCount > 0;
    return (<div className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Print Receives</h1>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="universal">Universal Search</Label>
            <Input id="universal" placeholder="Search by any field..." value={searchParams.universal || ''} onChange={(e) => handleUniversalSearch(e.target.value)}/>
          </div>
          <div className="space-y-2">
            <Label htmlFor="equipment">Equipment Number</Label>
            <Input id="equipment" placeholder="Search by equipment number..." value={searchParams.equipmentNumber || ''} onChange={(e) => handleEquipmentSearch(e.target.value)}/>
          </div>
          <div className="space-y-2">
            <Label htmlFor="part">Part Number</Label>
            <Input id="part" placeholder="Search by part number..." value={searchParams.partNumber || ''} onChange={(e) => handlePartSearch(e.target.value)}/>
          </div>
        </div>

        {canPaginate && (<div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount}
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="itemsPerPage">Items per page</Label>
              <select id="itemsPerPage" value={itemsPerPage} onChange={(e) => {
            setItemsPerPage(Number(e.target.value));
            setCurrentPage(1);
        }} className="border rounded px-2 py-1 text-sm">
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>)}

        <div className="mt-6">
          <PrintReceiveResultsTable results={results} currentPage={currentPage} itemsPerPage={itemsPerPage} onPreview={handlePreview}/>
        </div>

        {canPaginate && totalPages > 1 && (<div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}>
              Previous
            </Button>
            <span className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}>
              Next
            </Button>
          </div>)}

        <PrintReceivePreviewModal receive={previewReceive} isOpen={!!previewReceive} onClose={() => setPreviewReceive(null)}/>
      </div>
    </div>);
}
