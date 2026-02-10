'use client';
import { createContext, useContext, useMemo, ReactNode } from 'react';
import { useApiQuery } from '@/hooks/api/useApiQuery';
import { useApiPut } from '@/hooks/api/useApiMutation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from './AuthContext';

interface Notification {
    id: number;
    referenceNumber: string;
    referenceType: string;
    message: string;
    createdAt: string;
    isRead: number;
}

interface NotificationContextType {
    notifications: Notification[];
    unreadCount: number;
    isLoading: boolean;
    error: string | null;
    fetchNotifications: () => Promise<void>;
    markAsRead: (notificationId: number) => Promise<void>;
    markAllAsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: {
    children: ReactNode;
}) {
    const queryClient = useQueryClient();
    const { user } = useAuthContext();
    const username = user?.UserInfo?.username;
    
    const { data: response, isLoading, error } = useApiQuery<Notification[]>(
        ['notifications', username],
        username ? `/api/notification/${username}` : '',
        undefined,
        {
            enabled: !!username,
            refetchInterval: 30000,
            staleTime: 1000 * 15,
        }
    );
    
    const notifications = response?.data || [];
    const unreadCount = useMemo(() => notifications.filter(n => n.isRead === 0).length, [notifications]);
    
    const markAsReadMutation = useApiPut({
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications', username] });
        },
    });
    
    const markAllAsReadMutation = useApiPut({
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications', username] });
        },
    });
    
    const fetchNotifications = async () => {
        await queryClient.invalidateQueries({ queryKey: ['notifications', username] });
    };
    
    const markAsRead = async (notificationId: number) => {
        markAsReadMutation.mutate({
            url: `/api/notification/read/${notificationId}`,
            data: {}
        });
    };
    
    const markAllAsRead = async () => {
            const unreadIds = notifications
                .filter(n => n.isRead === 0)
                .map(n => n.id);
        await Promise.all(unreadIds.map(id => 
            markAsReadMutation.mutateAsync({
                url: `/api/notification/read/${id}`,
                data: {}
            })
        ));
    };
    
    return (<NotificationContext.Provider value={{
            notifications,
            unreadCount,
            isLoading,
            error: error ? 'Failed to fetch notifications' : null,
            fetchNotifications,
            markAsRead,
            markAllAsRead,
        }}>
      {children}
    </NotificationContext.Provider>);
}

export function useNotification() {
    const context = useContext(NotificationContext);
    if (context === undefined) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
}
