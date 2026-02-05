'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/context/AuthContext';
import { useCustomToast } from '@/components/ui/custom-toast';
import { API } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, } from '@/components/Card';
import { Loader2, ArrowLeft } from 'lucide-react';
interface Permission {
    id: number;
    permission_name: string;
    permission_readable: string;
    permission_type: string;
    hasAccess: number;
}
interface PermissionGroup {
    type: string;
    permissions: Permission[];
}
interface UserPermissionsFormProps {
    userId: string;
}
export default function UserPermissionsForm({ userId }: UserPermissionsFormProps) {
    const router = useRouter();
    const { user } = useAuthContext();
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>([]);
    const fetchPermissions = useCallback(async () => {
        try {
            const response = await API.get('/api/permission', {
                params: {
                    currentUser: user?.UserInfo.username,
                    userId: userId
                }
            });
            if (response.status === 200) {
                const permissions: Permission[] = response.data;
                const groupedPermissions = permissions.reduce((groups: PermissionGroup[], permission) => {
                    const existingGroup = groups.find(group => group.type === permission.permission_type);
                    if (existingGroup) {
                        existingGroup.permissions.push(permission);
                    }
                    else {
                        groups.push({
                            type: permission.permission_type,
                            permissions: [permission]
                        });
                    }
                    return groups;
                }, []);
                setPermissionGroups(groupedPermissions);
            }
        }
        catch {
            showErrorToast({
                title: "Error",
                message: "Failed to fetch permissions",
                duration: 3000,
            });
        }
        finally {
            setIsLoading(false);
        }
    }, [showErrorToast, user?.UserInfo.username, userId]);
    useEffect(() => {
        if (user?.UserInfo.username && userId) {
            fetchPermissions();
        }
    }, [user?.UserInfo.username, userId, fetchPermissions]);
    const handlePermissionToggle = (permissionId: number, checked: boolean) => {
        setPermissionGroups(prevGroups => {
            const newGroups = prevGroups.map(group => ({
                ...group,
                permissions: group.permissions.map(permission => permission.id === permissionId
                    ? { ...permission, hasAccess: checked ? 1 : 0 }
                    : permission)
            }));
            return newGroups;
        });
    };
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const permissionsToUpdate = permissionGroups.flatMap(group => group.permissions.map(permission => ({
                permission_id: permission.id,
                hasAccess: permission.hasAccess
            })));
            const response = await API.put(`/api/user/${userId}/permissions`, {
                permissions: permissionsToUpdate,
                updated_by: user?.UserInfo.username,
                user_id: parseInt(userId)
            });
            if (response.status === 200) {
                showSuccessToast({
                    title: "Success",
                    message: "User permissions updated successfully",
                    duration: 3000,
                });
                router.push('/users');
            }
        }
        catch {
            showErrorToast({
                title: "Error",
                message: "Failed to update user permissions",
                duration: 3000,
            });
        }
        finally {
            setIsSaving(false);
        }
    };
    if (isLoading) {
        return (<div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#003594]"/>
      </div>);
    }
    return (<div className="container mx-auto px-4 py-8">
      <Button variant="ghost" onClick={() => router.back()} className="mb-6 text-[#003594] hover:bg-[#003594]/10">
        <ArrowLeft className="h-4 w-4 mr-2"/>
        Back to Users
      </Button>

      <Card className="border-[#002a6e]/10 shadow-sm">
        <CardHeader className="bg-gray-50 border-b border-[#002a6e]/10">
          <CardTitle className="text-xl font-semibold text-[#002a6e]">
            Manage User Permissions
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {permissionGroups.map((group) => (<div key={group.type} className="space-y-4">
                <h3 className="text-lg font-medium text-[#002a6e] capitalize">
                  {group.type}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {group.permissions.map((permission) => (<div key={permission.id} className="flex items-center space-x-2 p-2 rounded-md border border-[#002a6e]/10 bg-white">
                      <Switch checked={permission.hasAccess === 1} onCheckedChange={(checked) => handlePermissionToggle(permission.id, checked)} className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003594] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=checked]:bg-[#003594] data-[state=unchecked]:bg-gray-200">
                        <span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-1"/>
                      </Switch>
                      <div className="space-y-1">
                        <Label className="text-sm font-medium text-gray-700">
                          {permission.permission_readable}
                        </Label>
                      </div>
                    </div>))}
                </div>
              </div>))}

            <div className="flex justify-end space-x-4 pt-6 border-t">
              <Button type="button" variant="outline" onClick={() => router.back()} className="border-[#002a6e]/20 text-[#002a6e] hover:bg-[#002a6e]/10">
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving} className="bg-[#003594] text-white hover:bg-[#002a6e]">
                {isSaving ? (<>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin"/>
                    Saving...
                  </>) : ('Save Changes')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>);
}
