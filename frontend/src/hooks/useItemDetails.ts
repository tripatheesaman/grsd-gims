import { useState, useCallback } from 'react';
import { useItemDetailsQuery } from '@/hooks/api/useItemDetails';
import { getErrorMessage } from '@/lib/errorHandling';

export const useItemDetails = () => {
    const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
    const [partHint, setPartHint] = useState<string>('');
    const [isModalOpen, setIsModalOpen] = useState(false);

    const { data: response, isLoading, error } = useItemDetailsQuery(
        selectedItemId,
        partHint,
        isModalOpen && selectedItemId !== null
    );

    const selectedItem = response?.data || null;

    const fetchItemDetails = useCallback((id: number, options?: { partNumber?: string }) => {
        setPartHint(options?.partNumber?.trim() || '');
        setSelectedItemId(id);
        setIsModalOpen(true);
    }, []);

    const closeModal = useCallback(() => {
        setIsModalOpen(false);
        setSelectedItemId(null);
        setPartHint('');
    }, []);

    return {
        selectedItem,
        isModalOpen,
        isLoading,
        error: error ? getErrorMessage(error, 'Failed to fetch item details. Please try again.') : null,
        fetchItemDetails,
        closeModal,
    };
};
