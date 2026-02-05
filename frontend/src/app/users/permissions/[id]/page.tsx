"use client";
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import UserPermissionsForm from './UserPermissionsForm';
import React from 'react';
export default function UserPermissionsPage({ params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    return (<Suspense fallback={<div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#003594]"/>
      </div>}>
      <AsyncUserPermissionsForm params={params}/>
    </Suspense>);
}
function AsyncUserPermissionsForm({ params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const [id, setId] = React.useState<string | null>(null);
    React.useEffect(() => {
        params.then(p => setId(p.id));
    }, [params]);
    if (!id)
        return null;
    return <UserPermissionsForm userId={id}/>;
}
