'use client';
import { useAuthContext } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
export default function IssueRecordsPage() {
    const { user, permissions } = useAuthContext();
    const router = useRouter();
    useEffect(() => {
        if (!user) {
            router.push('/login');
            return;
        }
        if (!permissions.includes('can_access_issue_records')) {
            router.push('/unauthorized');
            return;
        }
    }, [user, permissions, router]);
    if (!user || !permissions.includes('can_access_issue_records')) {
        return null;
    }
    return (<div className="container mx-auto p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
          Issue Records
        </h1>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-[#002a6e]/10">
          <p className="text-gray-600">
            Issue Records functionality will be implemented here.
          </p>
        </div>
      </div>
    </div>);
}
