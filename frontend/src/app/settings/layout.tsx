'use client';
import { useAuthContext } from '@/context/AuthContext';
import { usePathname } from 'next/navigation';
import Unauthorized from '@/app/(fallback)/unauthorized/page';
export default function SettingsLayout({ children, }: {
    children: React.ReactNode;
}) {
    const { permissions } = useAuthContext();
    const pathname = usePathname();
    if (!permissions?.includes('can_access_settings')) {
        return <Unauthorized />;
    }
    const pathPermissionMap: Record<string, string> = {
        '/settings/request': 'can_access_request_settings',
        '/settings/receive': 'can_access_receive_settings',
        '/settings/issue': 'can_access_issue_settings',
        '/settings/rrp': 'can_access_rrp_settings',
    };
    const requiredPermission = pathPermissionMap[pathname];
    if (requiredPermission && !permissions?.includes(requiredPermission)) {
        return <Unauthorized />;
    }
    return (<div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#003594]">Settings</h1>
        <p className="text-gray-600 mt-2">Manage your application settings</p>
      </div>
      {children}
    </div>);
}
