'use client';
import { useState, useRef, useEffect } from 'react';
import { Bell, Check } from 'lucide-react';
import { useNotification } from '@/context/NotificationContext';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';
import { API } from '@/lib/api';
import { cn } from '@/utils/utils';
import { useToast } from '@/components/ui/use-toast';
export function NotificationBell() {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { notifications, unreadCount, markAsRead, markAllAsRead, fetchNotifications } = useNotification();
    const router = useRouter();
    const { toast } = useToast();
    type NotificationType = {
        id: number;
        referenceType: string;
        referenceNumber: string;
        message: string;
        isRead: number;
        createdAt: string;
    };
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    const handleNotificationClick = async (notification: NotificationType) => {
        try {
            await markAsRead(notification.id);
            switch (notification.referenceType) {
                case 'request':
                    router.push(`/request/${notification.referenceNumber}?notificationId=${notification.id}`);
                    break;
                case 'issue':
                    await API.delete(`/api/notification/delete/${notification.id}`);
                    toast({
                        title: "Success",
                        description: "Notification deleted successfully",
                        duration: 3000,
                    });
                    break;
                case 'receive':
                    await API.delete(`/api/notification/delete/${notification.id}`);
                    toast({
                        title: "Success",
                        description: "Notification deleted successfully",
                        duration: 3000,
                    });
                    break;
                case 'rrp':
                    const response = await API.get(`/api/rrp/items/${notification.referenceNumber}`);
                    if (response.status === 200) {
                        const rrpData = response.data.rrpDetails[0];
                        const type = rrpData.rrp_number.startsWith('L') ? 'local' : 'foreign';
                        const queryParams = new URLSearchParams({
                            type: String(type),
                            rrpNumber: String(rrpData.rrp_number),
                            rrpDate: String(rrpData.date),
                            invoiceDate: String(rrpData.invoice_date),
                            supplier: String(rrpData.supplier_name),
                            inspectionUser: String(rrpData.inspection_details.inspection_user),
                            invoiceNumber: String(rrpData.invoice_number),
                            freightCharge: rrpData.freight_charge?.toString() || '0',
                            notificationId: String(notification.id),
                            ...(type === 'foreign' && {
                                customsDate: rrpData.customs_date ? String(rrpData.customs_date) : '',
                                customsNumber: rrpData.customs_number ? String(rrpData.customs_number) : '',
                                poNumber: rrpData.po_number ? String(rrpData.po_number) : '',
                                airwayBillNumber: rrpData.airway_bill_number ? String(rrpData.airway_bill_number) : '',
                                currency: rrpData.currency ? String(rrpData.currency) : '',
                                forexRate: rrpData.forex_rate?.toString() || '1'
                            })
                        });
                        router.push(`/rrp/new?${queryParams.toString()}`);
                    }
                    break;
                default:
                    break;
            }
            fetchNotifications();
        }
        catch {
            toast({
                title: "Error",
                description: "Failed to process notification",
                duration: 3000,
                variant: "destructive"
            });
        }
        setIsOpen(false);
    };
    return (<div className="relative" ref={dropdownRef}>
      <Button variant="ghost" size="icon" className={cn("relative hover:bg-[#003594]/5 transition-colors", isOpen && "bg-[#003594]/5")} onClick={() => setIsOpen(!isOpen)}>
        <Bell className="h-5 w-5 text-[#003594]"/>
        {unreadCount > 0 && (<span className="absolute -top-1 -right-1 bg-[#d2293b] text-white text-xs rounded-full h-4 w-4 flex items-center justify-center font-medium">
            {unreadCount}
          </span>)}
      </Button>

      {isOpen && (<div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl z-50 border border-[#002a6e]/10">
          <div className="p-4 border-b border-[#002a6e]/10 flex justify-between items-center">
            <h3 className="font-semibold text-[#003594]">Notifications</h3>
            {unreadCount > 0 && (<Button variant="ghost" size="sm" className="text-xs text-[#003594] hover:bg-[#003594]/5 hover:text-[#003594]" onClick={markAllAsRead}>
                Mark all as read
              </Button>)}
          </div>
          
          <div className="max-h-[480px] overflow-y-auto">
            {notifications.length === 0 ? (<div className="p-6 text-center text-gray-500">
                No notifications
              </div>) : (notifications.map((notification) => (<div key={notification.id} className={cn("p-4 hover:bg-[#003594]/5 cursor-pointer transition-colors border-b border-[#002a6e]/10 last:border-b-0", notification.isRead === 0 && "bg-[#003594]/5")} onClick={() => handleNotificationClick(notification)}>
                  <div className="flex justify-between items-start gap-4">
                    <p className="text-sm text-gray-700">{notification.message}</p>
                    {notification.isRead === 0 && (<Check className="h-4 w-4 text-[#003594] flex-shrink-0"/>)}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                  </p>
                </div>)))}
          </div>
        </div>)}
    </div>);
}
