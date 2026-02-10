'use client';
import { useCallback } from 'react';
import {
    showErrorToast as fireErrorToast,
    showInfoToast as fireInfoToast,
    showSuccessToast as fireSuccessToast,
    showWarningToast as fireWarningToast,
} from '@/lib/appToast';

interface ToastProps {
    title?: string;
    message: string;
    duration?: number;
}
export function useCustomToast() {
    const showSuccessToast = useCallback(({ title, message, duration = 5000 }: ToastProps) => {
        fireSuccessToast({ title, message, duration });
    }, []);
    const showErrorToast = useCallback(({ title, message, duration = 5000 }: ToastProps) => {
        fireErrorToast({ title, message, duration });
    }, []);
    const showInfoToast = useCallback(({ title, message, duration = 5000 }: ToastProps) => {
        fireInfoToast({ title, message, duration });
    }, []);
    const showWarningToast = useCallback(({ title, message, duration = 5000 }: ToastProps) => {
        fireWarningToast({ title, message, duration });
    }, []);
    return {
        showSuccessToast,
        showErrorToast,
        showInfoToast,
        showWarningToast,
    };
}
