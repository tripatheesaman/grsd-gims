'use client';



import { useAuthContext } from '@/context/AuthContext';

import { usePathname } from 'next/navigation';

import Unauthorized from '@/app/(fallback)/unauthorized/page';

import { hasAnyPermission, SETTINGS_PERMISSIONS } from '@/config/permissionGroups';



const PATH_PERMISSION_MAP: Record<string, string> = {

    '/settings/app': 'can_access_app_settings',

    '/settings/request': 'can_access_request_settings',

    '/settings/receive': 'can_access_receive_settings',

    '/settings/issue': 'can_access_issue_settings',

    '/settings/rrp': 'can_access_rrp_settings',

    '/settings/fuel': 'can_access_fuel_settings',

    '/settings/authorities': 'can_access_rrp_settings',

};



function canAccessPath(pathname: string, permissions: string[] | undefined): boolean {

    const required = PATH_PERMISSION_MAP[pathname];

    if (!required) return true;

    if (permissions?.includes(required)) return true;

    if (pathname === '/settings/app' && permissions?.includes('can_access_settings')) return true;

    return false;

}



export default function SettingsLayout({

    children,

}: {

    children: React.ReactNode;

}) {

    const { permissions } = useAuthContext();

    const pathname = usePathname();



    if (!hasAnyPermission(permissions, SETTINGS_PERMISSIONS)) {

        return <Unauthorized />;

    }



    if (!canAccessPath(pathname, permissions)) {

        return <Unauthorized />;

    }



    return (

        <div className="container mx-auto px-4 py-8">

            <div className="mb-8">

                <h1 className="text-2xl font-semibold text-[#003594]">Settings</h1>

                <p className="mt-2 text-gray-600">Manage your application settings</p>

            </div>

            {children}

        </div>

    );

}

