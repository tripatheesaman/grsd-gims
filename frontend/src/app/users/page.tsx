'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/context/AuthContext';
import { useCustomToast } from '@/components/ui/custom-toast';
import { API } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, } from '@/components/Card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, } from '@/components/ui/dropdown-menu';
import { Loader2, Plus, MoreVertical, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
interface User {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
    staffid: string;
    designation: string;
    can_reset_password: number;
    status: number;
    created_by: string | null;
    updated_by: string | null;
    created_at: string;
    updated_at: string;
    role_id: number;
    role_name: string;
    heirarchy: number;
}
export default function UsersPage() {
    const router = useRouter();
    const { permissions, user } = useAuthContext();
    const { showErrorToast, showSuccessToast } = useCustomToast();
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const canCreateUser = permissions?.includes('can_create_users');
    const canEditUser = permissions?.includes('can_edit_users');
    const canDeleteUser = permissions?.includes('can_delete_users');
    const canManagePermissions = permissions?.includes('can_manage_user_permissions');
    const fetchUsers = useCallback(async () => {
        try {
            const response = await API.get('/api/user', {
                params: {
                    currentUser: user?.UserInfo.username
                }
            });
            if (response.status === 200) {
                setUsers(response.data);
            }
        }
        catch {
            showErrorToast({
                title: 'Error',
                message: "Failed to fetch users",
                duration: 3000,
            });
        }
        finally {
            setIsLoading(false);
        }
    }, [showErrorToast, user?.UserInfo.username]);
    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);
    const handleDeleteUser = async (userId: number) => {
        if (!canDeleteUser) {
            showErrorToast({
                title: 'Error',
                message: "You don't have permission to delete users",
                duration: 3000,
            });
            return;
        }
        try {
            const response = await API.delete(`/api/user/${userId}`);
            if (response.status === 200) {
                setUsers(users.filter(user => user.id !== userId));
                showSuccessToast({
                    title: 'Success',
                    message: "User deleted successfully",
                    duration: 3000,
                });
            }
        }
        catch {
            showErrorToast({
                title: 'Error',
                message: "Failed to delete user",
                duration: 3000,
            });
        }
    };
    const filteredUsers = users.filter(user => user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.last_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.staffid.toLowerCase().includes(searchQuery.toLowerCase()));
    const canPerformAction = (targetUser: User) => {
        if (targetUser.username === user?.UserInfo.username) {
            return false;
        }
        if (targetUser.role_name === user?.UserInfo.role) {
            return false;
        }
        return true;
    };
    if (isLoading) {
        return (<div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#003594]"/>
      </div>);
    }
    return (<div className="container mx-auto px-4 py-8">
      <Card className="border-[#002a6e]/10 shadow-sm">
        <CardHeader className="bg-gray-50 border-b border-[#002a6e]/10">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl font-semibold text-[#002a6e]">User Management</CardTitle>
            {canCreateUser && (<Button onClick={() => router.push('/users/create')} className="bg-[#003594] text-white hover:bg-[#002a6e]">
                <Plus className="h-4 w-4 mr-2"/>
                Create User
              </Button>)}
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400"/>
              <Input placeholder="Search users..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 bg-white border-[#002a6e]/10 focus:border-[#002a6e] focus:ring-1 focus:ring-[#002a6e]"/>
            </div>
          </div>

          <div className="rounded-md border border-[#002a6e]/10">
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="font-semibold text-[#003594]">Username</TableHead>
                  <TableHead className="font-semibold text-[#003594]">Name</TableHead>
                  <TableHead className="font-semibold text-[#003594]">Staff ID</TableHead>
                  <TableHead className="font-semibold text-[#003594]">Role</TableHead>
                  <TableHead className="font-semibold text-[#003594]">Designation</TableHead>
                  <TableHead className="font-semibold text-[#003594]">Status</TableHead>
                  <TableHead className="font-semibold text-[#003594] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (<TableRow key={user.id} className="hover:bg-gray-50">
                    <TableCell>{user.username}</TableCell>
                    <TableCell>{`${user.first_name} ${user.last_name}`}</TableCell>
                    <TableCell>{user.staffid}</TableCell>
                    <TableCell>{user.role_name}</TableCell>
                    <TableCell>{user.designation}</TableCell>
                    <TableCell>
                      <Badge variant={user.status === 1 ? "success" : "destructive"} className="bg-[#003594]/10 text-[#003594] hover:bg-[#003594]/20">
                        {user.status === 1 ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {canPerformAction(user) && (<DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-[#003594]/10">
                            <MoreVertical className="h-4 w-4 text-[#003594]"/>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white">
                          {canEditUser && (<DropdownMenuItem onClick={() => router.push(`/users/edit/${user.id}`)} className="text-[#003594] hover:bg-[#003594]/10 cursor-pointer">
                              Edit
                            </DropdownMenuItem>)}
                          {canManagePermissions && (<DropdownMenuItem onClick={() => router.push(`/users/permissions/${user.id}`)} className="text-[#003594] hover:bg-[#003594]/10 cursor-pointer">
                              Manage Permissions
                            </DropdownMenuItem>)}
                          {canDeleteUser && (<DropdownMenuItem onClick={() => handleDeleteUser(user.id)} className="text-red-600 hover:bg-red-50 cursor-pointer">
                              Delete
                            </DropdownMenuItem>)}
                        </DropdownMenuContent>
                      </DropdownMenu>)}
                    </TableCell>
                  </TableRow>))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>);
}
