'use client';

import { useCallback, useState } from 'react';
import { API } from '@/lib/api';
import { withBasePath } from '@/lib/urls';

export function useRecordImageUpload(folder: 'request' | 'receive') {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const selectFile = useCallback((file: File | null) => {
        setSelectedFile(file);
        if (file) {
            setPreviewUrl(URL.createObjectURL(file));
        } else {
            setPreviewUrl(null);
        }
    }, []);

    const setExistingPath = useCallback((path: string | null) => {
        setSelectedFile(null);
        setPreviewUrl(path ? withBasePath(path) : null);
    }, []);

    const reset = useCallback(() => {
        setSelectedFile(null);
        setPreviewUrl(null);
    }, []);

    const uploadIfNeeded = useCallback(
        async (currentPath: string): Promise<string> => {
            if (!selectedFile) {
                return currentPath;
            }
            const uploadFormData = new FormData();
            uploadFormData.append('file', selectedFile);
            uploadFormData.append('folder', folder);
            const response = await API.post('/api/upload', uploadFormData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            return response.data?.path || response.data?.filePath || currentPath;
        },
        [folder, selectedFile]
    );

    return {
        selectedFile,
        previewUrl,
        selectFile,
        setExistingPath,
        reset,
        uploadIfNeeded,
    };
}
