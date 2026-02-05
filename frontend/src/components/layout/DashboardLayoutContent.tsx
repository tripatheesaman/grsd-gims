'use client';
import { lazy, Suspense } from 'react';
import TopBar from '@/components/layout/Topbar';
import ProtectedRoute from '@/lib/ProtectedRoute';
import { usePathname } from 'next/navigation';
import { ReactNode, useState, useEffect } from 'react';
import { getRouteConfig } from '@/config/routes';
import { ContentSpinner } from '@/components/ui/spinner';
import { ApprovalCountsProvider } from '@/context/ApprovalCountsContext';
interface DashboardLayoutContentProps {
    children: ReactNode;
}
const Sidebar = lazy(() => import('@/components/layout/Sidebar'));
export default function DashboardLayoutContent({ children }: DashboardLayoutContentProps) {
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const pathname = usePathname();
    const routeConfig = getRouteConfig(pathname);
    useEffect(() => {
        const timer = setTimeout(() => {
            setIsLoading(false);
        }, 500);
        return () => clearTimeout(timer);
    }, [pathname]);
    useEffect(() => {
        setMobileOpen(false);
    }, [pathname]);
    if (!routeConfig || !routeConfig.requiresAuth) {
        return children;
    }
    const handleToggleSidebar = () => {
        if (typeof window !== 'undefined' && window.innerWidth < 768) {
            setMobileOpen((prev) => !prev);
        }
        else {
            setCollapsed((prev) => !prev);
        }
    };
    return (<ProtectedRoute>
      <ApprovalCountsProvider>
        <div className="flex h-screen bg-gray-100">
          <Suspense fallback={<ContentSpinner />}>
            <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)}/>
          </Suspense>
          <div className="flex-1 flex flex-col">
            <TopBar onToggleSidebar={handleToggleSidebar}/>
            <main className="p-6 overflow-y-auto">
              {isLoading ? <ContentSpinner /> : children}
            </main>
          </div>
        </div>
      </ApprovalCountsProvider>
    </ProtectedRoute>);
}
