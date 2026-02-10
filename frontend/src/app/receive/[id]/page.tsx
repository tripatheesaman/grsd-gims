'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { API } from '@/lib/api';
import { useCustomToast } from '@/components/ui/custom-toast';
export default function ReceiveDetailsPage() {
    const searchParams = useSearchParams();
    const notificationId = searchParams.get('notificationId');
    const router = useRouter();
    const { showErrorToast } = useCustomToast();
    const [isLoading, setIsLoading] = useState(true);
    useEffect(() => {
        const handleNotification = async () => {
            if (!notificationId) {
                setIsLoading(false);
                return;
            }
            try {
                await API.delete(`/api/notification/delete/${notificationId}`);
            }
            catch {
                showErrorToast({
                    title: "Error",
                    message: "Failed to delete notification",
                    duration: 3000,
                });
            }
            finally {
                setIsLoading(false);
                router.push('/dashboard');
            }
        };
        handleNotification();
    }, [notificationId, router]);
    if (isLoading) {
        return (<div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>);
    }
    return null;
}
