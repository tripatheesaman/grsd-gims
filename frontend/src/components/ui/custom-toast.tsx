'use client';
import { useCallback } from "react";
import { useToast } from "@/components/ui/use-toast";
interface ToastProps {
    title: string;
    message: string;
    duration?: number;
}
export function useCustomToast() {
    const { toast } = useToast();
    const showSuccessToast = useCallback(({ title, message, duration = 5000 }: ToastProps) => {
        toast({
            title,
            description: message,
            className: "bg-green-600 text-white border-none",
            duration,
        });
    }, [toast]);
    const showErrorToast = useCallback(({ title, message, duration = 5000 }: ToastProps) => {
        toast({
            title,
            description: message,
            variant: "destructive",
            className: "bg-red-600 text-white border-none",
            duration,
        });
    }, [toast]);
    const showInfoToast = useCallback(({ title, message, duration = 5000 }: ToastProps) => {
        toast({
            title,
            description: message,
            className: "bg-blue-600 text-white border-none",
            duration,
        });
    }, [toast]);
    const showWarningToast = useCallback(({ title, message, duration = 5000 }: ToastProps) => {
        toast({
            title,
            description: message,
            className: "bg-yellow-600 text-white border-none",
            duration,
        });
    }, [toast]);
    return {
        showSuccessToast,
        showErrorToast,
        showInfoToast,
        showWarningToast,
    };
}
