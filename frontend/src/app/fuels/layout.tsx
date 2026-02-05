'use client';
import { useAuthContext } from '@/context/AuthContext';
import { usePathname } from 'next/navigation';
import Unauthorized from '@/app/(fallback)/unauthorized/page';
export default function FuelsLayout({ children, }: {
    children: React.ReactNode;
}) {
    const { permissions } = useAuthContext();
    const pathname = usePathname();
    if (!permissions?.includes('can_access_fuel_menu')) {
        return <Unauthorized />;
    }
    const pathPermissionMap: Record<string, string> = {
        '/fuels/issue': 'can_issue_fuel',
        '/fuels/receive': 'can_receive_petrol',
    };
    const requiredPermission = Object.entries(pathPermissionMap).find(([path]) => pathname.startsWith(path))?.[1];
    if (requiredPermission && !permissions?.includes(requiredPermission)) {
        return <Unauthorized />;
    }
    return (<div className="container mx-auto px-4 py-8">
      {children}
    </div>);
}
