'use client';
import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { API } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PrintReceiveResultsTable } from '@/components/print/PrintReceiveResultsTable';
import { PrintReceivePreviewModal } from '@/components/print/PrintReceivePreviewModal';
import { useCustomToast } from '@/components/ui/custom-toast';
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
    const [currentPage] = useState(1);
    const [previewReceive, setPreviewReceive] = useState<ReceiveSearchResult | null>(null);
    const itemsPerPage = 10;
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

        <div className="mt-6">
          <PrintReceiveResultsTable results={results} currentPage={currentPage} itemsPerPage={itemsPerPage} onPreview={handlePreview}/>
        </div>

        <PrintReceivePreviewModal receive={previewReceive} isOpen={!!previewReceive} onClose={() => setPreviewReceive(null)}/>
      </div>
    </div>);
}
