'use client';
import { createContext, useContext, useMemo, ReactNode } from 'react';
import { useApiQuery } from '@/hooks/api/useApiQuery';
import { useApiPut } from '@/hooks/api/useApiMutation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from './AuthContext';
import { getErrorMessage } from '@/lib/errorHandling';
import { isNotificationUnread } from '@/lib/notifications';

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
    const { isAuthenticated, user } = useAuthContext();
    const userId = user?.UserInfo?.id;

    const { data: response, isLoading, error } = useApiQuery<Notification[]>(
        ['notifications', 'me', userId],
        '/api/notification/me',
        undefined,
        {
            enabled: isAuthenticated && !!userId,
            refetchInterval: 5000,
            staleTime: 2000,
            refetchOnMount: 'always',
            refetchOnWindowFocus: true,
        }
    );

    const notifications = useMemo(() => response?.data ?? [], [response?.data]);
    const unreadCount = useMemo(
        () => notifications.filter((n) => isNotificationUnread(n.isRead)).length,
        [notifications]
    );

    const markAsReadMutation = useApiPut({
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications', 'me'] });
        },
    });

    const fetchNotifications = async () => {
        await queryClient.invalidateQueries({ queryKey: ['notifications', 'me'] });
    };

    const markAsRead = async (notificationId: number) => {
        await markAsReadMutation.mutateAsync({
            url: `/api/notification/read/${notificationId}`,
            data: {}
        });
    };

    const markAllAsRead = async () => {
        const unreadIds = notifications
            .filter((n) => isNotificationUnread(n.isRead))
            .map((n) => n.id);
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
            error: error ? getErrorMessage(error, 'Failed to fetch notifications') : null,
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
