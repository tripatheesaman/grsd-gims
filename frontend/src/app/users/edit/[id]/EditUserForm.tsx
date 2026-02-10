"use client";
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/context/AuthContext';
import { useCustomToast } from '@/components/ui/custom-toast';
import { API } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, } from '@/components/Card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { Loader2, ArrowLeft } from 'lucide-react';
interface Role {
    role_id: number;
    role_name: string;
    heirarchy: number;
}
interface User {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
    staffid: string;
    designation: string;
    can_reset_password: number;
    status: number;
    role_id: number;
    role_name: string;
    heirarchy: number;
}
interface EditUserFormProps {
    userId: string;
}
export default function EditUserForm({ userId }: EditUserFormProps) {
    const router = useRouter();
    const { user } = useAuthContext();
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
    const [formData, setFormData] = useState({
        username: '',
        firstName: '',
        lastName: '',
        staffId: '',
        role: '',
        designation: '',
        status: 1,
        can_reset_password: 0,
    });
    const fetchUserData = useCallback(async () => {
        try {
            const response = await API.get(`/api/user/${userId}`, {
                params: {
                    currentUser: user?.UserInfo.username
                }
            });
            if (response.status === 200) {
                const userData: User = response.data;
                setFormData({
                    username: userData.username,
                    firstName: userData.first_name,
                    lastName: userData.last_name,
                    staffId: userData.staffid,
                    role: userData.role_id.toString(),
                    designation: userData.designation,
                    status: userData.status,
                    can_reset_password: userData.can_reset_password,
                });
            }
        }
        catch {
            showErrorToast({
                title: 'Error',
                message: "Failed to fetch user data",
                duration: 3000,
            });
        }
        finally {
            setIsLoading(false);
        }
    }, [userId, showErrorToast, user?.UserInfo.username]);
    const fetchRoles = useCallback(async () => {
        try {
            const response = await API.get('/api/role', {
                params: {
                    currentUser: user?.UserInfo.username
                }
            });
            if (response.status === 200) {
                setAvailableRoles(response.data);
            }
        }
        catch {
            showErrorToast({
                title: 'Error',
                message: "Failed to fetch roles",
                duration: 3000,
            });
        }
    }, [showErrorToast, user?.UserInfo.username]);
    useEffect(() => {
        Promise.all([
            fetchUserData(),
            fetchRoles(),
        ]);
    }, [fetchUserData, fetchRoles]);
    const handleInputChange = (field: string, value: string | number) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const response = await API.put(`/api/user/${userId}`, {
                ...formData,
                id: parseInt(userId),
                updated_by: user?.UserInfo.username
            });
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: "User updated successfully",
                    duration: 3000,
                });
                router.push('/users');
            }
        }
        catch {
            showErrorToast({
                title: 'Error',
                message: "Failed to update user",
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
          <CardTitle className="text-xl font-semibold text-[#002a6e]">Edit User</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-sm font-medium text-gray-700">Username</Label>
                <Input id="username" value={formData.username} onChange={(e) => handleInputChange('username', e.target.value)} required className="h-10 bg-white border-[#002a6e]/10 focus:border-[#002a6e] focus:ring-1 focus:ring-[#002a6e]"/>
              </div>

              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-sm font-medium text-gray-700">First Name</Label>
                <Input id="firstName" value={formData.firstName} onChange={(e) => handleInputChange('firstName', e.target.value)} required className="h-10 bg-white border-[#002a6e]/10 focus:border-[#002a6e] focus:ring-1 focus:ring-[#002a6e]"/>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-sm font-medium text-gray-700">Last Name</Label>
                <Input id="lastName" value={formData.lastName} onChange={(e) => handleInputChange('lastName', e.target.value)} required className="h-10 bg-white border-[#002a6e]/10 focus:border-[#002a6e] focus:ring-1 focus:ring-[#002a6e]"/>
              </div>

              <div className="space-y-2">
                <Label htmlFor="staffId" className="text-sm font-medium text-gray-700">Staff ID</Label>
                <Input id="staffId" value={formData.staffId} onChange={(e) => handleInputChange('staffId', e.target.value)} required className="h-10 bg-white border-[#002a6e]/10 focus:border-[#002a6e] focus:ring-1 focus:ring-[#002a6e]"/>
              </div>

              <div className="space-y-2">
                <Label htmlFor="role" className="text-sm font-medium text-gray-700">Role</Label>
                <Select value={formData.role} onValueChange={(value) => handleInputChange('role', value)}>
                  <SelectTrigger className="h-10 bg-white border-[#002a6e]/10 focus:border-[#002a6e] focus:ring-1 focus:ring-[#002a6e]">
                    <SelectValue placeholder="Select role"/>
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {availableRoles.map((role) => (<SelectItem key={role.role_id} value={role.role_id.toString()}>
                        {role.role_name.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')}
                      </SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="designation" className="text-sm font-medium text-gray-700">Designation</Label>
                <Input id="designation" value={formData.designation} onChange={(e) => handleInputChange('designation', e.target.value)} required className="h-10 bg-white border-[#002a6e]/10 focus:border-[#002a6e] focus:ring-1 focus:ring-[#002a6e]"/>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Status</Label>
                <div className="flex items-center space-x-2 p-2 rounded-md border border-[#002a6e]/10 bg-white">
                  <Switch checked={formData.status === 1} onCheckedChange={(checked) => handleInputChange('status', checked ? 1 : 0)} className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003594] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=checked]:bg-[#003594] data-[state=unchecked]:bg-gray-200">
                    <span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-1"/>
                  </Switch>
                  <span className="text-sm font-medium text-gray-700">
                    {formData.status === 1 ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Force Password Reset</Label>
                <div className="flex items-center space-x-2 p-2 rounded-md border border-[#002a6e]/10 bg-white">
                  <Switch checked={formData.can_reset_password === 1} onCheckedChange={(checked) => handleInputChange('can_reset_password', checked ? 1 : 0)} className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003594] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=checked]:bg-[#003594] data-[state=unchecked]:bg-gray-200">
                    <span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-1"/>
                  </Switch>
                  <span className="text-sm font-medium text-gray-700">
                    {formData.can_reset_password === 1 ? 'Required' : 'Not Required'}
                  </span>
                </div>
              </div>
            </div>

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
