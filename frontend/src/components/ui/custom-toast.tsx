'use client';
import { useToast } from "@/components/ui/use-toast";
interface ToastProps {
    title: string;
    message: string;
    duration?: number;
}
export function useCustomToast() {
    const { toast } = useToast();
    const showSuccessToast = ({ title, message, duration = 5000 }: ToastProps) => {
        toast({
            title,
            description: message,
            className: "bg-green-600 text-white border-none",
            duration,
        });
    };
    const showErrorToast = ({ title, message, duration = 5000 }: ToastProps) => {
        toast({
            title,
            description: message,
            variant: "destructive",
            className: "bg-red-600 text-white border-none",
            duration,
        });
    };
    const showInfoToast = ({ title, message, duration = 5000 }: ToastProps) => {
        toast({
            title,
            description: message,
            className: "bg-blue-600 text-white border-none",
            duration,
        });
    };
    const showWarningToast = ({ title, message, duration = 5000 }: ToastProps) => {
        toast({
            title,
            description: message,
            className: "bg-yellow-600 text-white border-none",
            duration,
        });
    };
    return {
        showSuccessToast,
        showErrorToast,
        showInfoToast,
        showWarningToast,
    };
}
