'use client';
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { API } from '@/lib/api';
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
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { user } = useAuthContext();
    const unreadCount = notifications.filter(n => n.isRead === 0).length;
    const fetchNotifications = useCallback(async () => {
        if (!user?.UserInfo?.username)
            return;
        try {
            setIsLoading(true);
            const response = await API.get(`/api/notification/${user.UserInfo.username}`);
            setNotifications(response.data);
            setError(null);
        }
        catch {
            setError('Failed to fetch notifications');
        }
        finally {
            setIsLoading(false);
        }
    }, [user?.UserInfo?.username]);
    const markAsRead = async (notificationId: number) => {
        try {
            await API.put(`/api/notification/read/${notificationId}`);
            setNotifications(prev => prev.map(notification => notification.id === notificationId
                ? { ...notification, isRead: 1 }
                : notification));
        }
        catch {
        }
    };
    const markAllAsRead = async () => {
        try {
            const unreadIds = notifications
                .filter(n => n.isRead === 0)
                .map(n => n.id);
            await Promise.all(unreadIds.map(id => API.put(`/api/notification/read/${id}`)));
            setNotifications(prev => prev.map(notification => ({ ...notification, isRead: 1 })));
        }
        catch {
        }
    };
    useEffect(() => {
        if (user?.UserInfo?.username) {
            fetchNotifications();
            const interval = setInterval(fetchNotifications, 30000);
            return () => clearInterval(interval);
        }
    }, [user?.UserInfo?.username, fetchNotifications]);
    return (<NotificationContext.Provider value={{
            notifications,
            unreadCount,
            isLoading,
            error,
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
