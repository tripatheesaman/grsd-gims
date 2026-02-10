'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/ui/button';
import { useCustomToast } from '@/components/ui/custom-toast';
import { useAuthContext } from '@/context/AuthContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { API } from '@/lib/api';
import { useState, useEffect } from 'react';
import { Search, Plus, Edit, Trash2, X, Save } from 'lucide-react';
interface AuthorityDetails {
    id: number;
    authority_type: string;
    level_1_authority_name: string;
    level_1_authority_staffid: string;
    level_1_authority_designation: string;
    level_2_authority_name: string;
    level_2_authority_staffid: string;
    level_2_authority_designation: string;
    level_3_authority_name: string;
    level_3_authority_staffid: string;
    level_3_authority_designation: string;
    quality_check_authority_name: string;
    quality_check_authority_staffid: string;
    quality_check_authority_designation: string;
}
interface Supplier {
    id: number;
    name: string;
    type: 'foreign' | 'local';
}
interface InspectionUser {
    id: number;
    name: string;
    designation: string;
    staff_id?: string | null;
    section_name?: string | null;
    email?: string | null;
}
export default function RRPSettingsPage() {
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const { permissions } = useAuthContext();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState<AuthorityDetails[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [supplierPage, setSupplierPage] = useState(1);
    const [supplierTotalPages, setSupplierTotalPages] = useState(1);
    const supplierPageSize = 20;
    const [inspectionUsers, setInspectionUsers] = useState<InspectionUser[]>([]);
    const [newSupplierName, setNewSupplierName] = useState('');
    const [newSupplierType, setNewSupplierType] = useState<'foreign' | 'local'>('foreign');
    const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
    const [newInspectionUserName, setNewInspectionUserName] = useState('');
    const [newInspectionUserDesignation, setNewInspectionUserDesignation] = useState('');
    const [newInspectionUserStaffId, setNewInspectionUserStaffId] = useState('');
    const [newInspectionUserSectionName, setNewInspectionUserSectionName] = useState('');
    const [newInspectionUserEmail, setNewInspectionUserEmail] = useState('');
    const [editingInspectionUser, setEditingInspectionUser] = useState<InspectionUser | null>(null);
    const [inspectionUserSearchTerm, setInspectionUserSearchTerm] = useState('');
    const [supplierSearchTerm, setSupplierSearchTerm] = useState('');
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [authorityResponse, suppliersResponse, inspectionUsersResponse] = await Promise.all([
                    API.get('/api/settings/rrp/authority-details'),
                    API.get('/api/settings/rrp/suppliers', { params: { page: supplierPage, pageSize: supplierPageSize } }),
                    API.get('/api/settings/rrp/inspection-users')
                ]);
                if (authorityResponse.status === 200) {
                    setFormData(authorityResponse.data);
                }
                if (suppliersResponse.status === 200) {
                    setSuppliers(suppliersResponse.data?.data || []);
                    if (suppliersResponse.data?.pagination) {
                        setSupplierTotalPages(suppliersResponse.data.pagination.totalPages || 1);
                    }
                    else {
                        setSupplierTotalPages(1);
                    }
                }
                if (inspectionUsersResponse.status === 200) {
                    setInspectionUsers(inspectionUsersResponse.data);
                }
            }
            catch {
                showErrorToast({
                    title: "Error",
                    message: "Failed to fetch data",
                    duration: 3000,
                });
            }
            finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [supplierPage, supplierPageSize]);
    const refetchSuppliers = async (nextPage?: number) => {
        try {
            const pageToFetch = nextPage ?? supplierPage;
            const response = await API.get('/api/settings/rrp/suppliers', {
                params: { page: pageToFetch, pageSize: supplierPageSize },
            });
            if (response.status === 200) {
                setSuppliers(response.data?.data || []);
                if (response.data?.pagination) {
                    setSupplierTotalPages(response.data.pagination.totalPages || 1);
                    setSupplierPage(response.data.pagination.page || pageToFetch);
                }
                else {
                    setSupplierTotalPages(1);
                    setSupplierPage(1);
                }
            }
        }
        catch {
            showErrorToast({
                title: "Error",
                message: "Failed to fetch suppliers",
                duration: 3000,
            });
        }
    };
    const refetchInspectionUsers = async () => {
        try {
            const response = await API.get('/api/settings/rrp/inspection-users');
            if (response.status === 200) {
                setInspectionUsers(response.data || []);
            }
        }
        catch {
            showErrorToast({
                title: "Error",
                message: "Failed to fetch inspection users",
                duration: 3000,
            });
        }
    };
    const handleSave = async () => {
        if (!permissions?.includes('can_edit_rrp_authority_details')) {
            showErrorToast({
                title: "Access Denied",
                message: "You don't have permission to edit authority details",
                duration: 3000,
            });
            return;
        }
        try {
            setIsSaving(true);
            const response = await API.put('/api/settings/rrp/authority-details', {
                authorityDetails: formData
            });
            if (response.status === 200) {
                showSuccessToast({
                    title: "Success",
                    message: "Authority details updated successfully",
                    duration: 3000,
                });
            }
        }
        catch {
            showErrorToast({
                title: "Error",
                message: "Failed to update authority details",
                duration: 3000,
            });
        }
        finally {
            setIsSaving(false);
        }
    };
    const handleAuthorityChange = (id: number, field: keyof AuthorityDetails, value: string) => {
        setFormData(prev => prev.map(auth => auth.id === id ? { ...auth, [field]: value } : auth));
    };
    const handleAddSupplier = async () => {
        if (!newSupplierName.trim()) {
            showErrorToast({
                title: "Error",
                message: "Supplier name cannot be empty",
                duration: 3000,
            });
            return;
        }
        try {
            setIsSaving(true);
            const response = await API.post('/api/settings/rrp/suppliers', {
                name: newSupplierName,
                type: newSupplierType
            });
            if (response.status === 201) {
                setNewSupplierName('');
                await refetchSuppliers(1);
                showSuccessToast({
                    title: "Success",
                    message: "Supplier added successfully",
                    duration: 3000,
                });
            }
        }
        catch {
            showErrorToast({
                title: "Error",
                message: "Failed to add supplier",
                duration: 3000,
            });
        }
        finally {
            setIsSaving(false);
        }
    };
    const handleUpdateSupplier = async (supplier: Supplier) => {
        try {
            setIsSaving(true);
            const response = await API.put(`/api/settings/rrp/suppliers/${supplier.id}`, {
                name: supplier.name,
                type: supplier.type
            });
            if (response.status === 200) {
                setEditingSupplier(null);
                await refetchSuppliers(supplierPage);
                showSuccessToast({
                    title: "Success",
                    message: "Supplier updated successfully",
                    duration: 3000,
                });
            }
        }
        catch {
            showErrorToast({
                title: "Error",
                message: "Failed to update supplier",
                duration: 5000,
            });
        }
        finally {
            setIsSaving(false);
        }
    };
    const handleDeleteSupplier = async (id: number) => {
        try {
            setIsSaving(true);
            const supplierToDelete = suppliers.find(s => s.id === id);
            if (!supplierToDelete) {
                throw new Error('Supplier not found');
            }
            const response = await API.delete(`/api/settings/rrp/suppliers/${id}`, {
                data: {
                    name: supplierToDelete.name,
                    type: supplierToDelete.type
                }
            });
            if (response.status === 200) {
                await refetchSuppliers(supplierPage);
                showSuccessToast({
                    title: "Success",
                    message: "Supplier deleted successfully",
                    duration: 3000,
                });
            }
        }
        catch {
            showErrorToast({
                title: "Error",
                message: "Failed to delete supplier",
                duration: 5000,
            });
        }
        finally {
            setIsSaving(false);
        }
    };
    const handleAddInspectionUser = async () => {
        if (!newInspectionUserName.trim() || !newInspectionUserDesignation.trim()) {
            showErrorToast({
                title: "Error",
                message: "Name and designation cannot be empty",
                duration: 3000,
            });
            return;
        }
        try {
            setIsSaving(true);
            const response = await API.post('/api/settings/rrp/inspection-users', {
                name: newInspectionUserName.trim(),
                designation: newInspectionUserDesignation.trim(),
                staff_id: newInspectionUserStaffId.trim() || null,
                section_name: newInspectionUserSectionName.trim() || null,
                email: newInspectionUserEmail.trim() || null,
            });
            if (response.status === 201) {
                await refetchInspectionUsers();
                setNewInspectionUserName('');
                setNewInspectionUserDesignation('');
                setNewInspectionUserStaffId('');
                setNewInspectionUserSectionName('');
                setNewInspectionUserEmail('');
                showSuccessToast({
                    title: "Success",
                    message: "Inspection user added successfully",
                    duration: 3000,
                });
            }
        }
        catch {
            showErrorToast({
                title: "Error",
                message: "Failed to add inspection user",
                duration: 5000,
            });
        }
        finally {
            setIsSaving(false);
        }
    };
    const handleUpdateInspectionUser = async () => {
        if (!editingInspectionUser)
            return;
        const user = editingInspectionUser;
        if (!user.name.trim() || !user.designation.trim()) {
            showErrorToast({
                title: "Error",
                message: "Name and designation cannot be empty",
                duration: 3000,
            });
            return;
        }
        try {
            setIsSaving(true);
            const response = await API.put(`/api/settings/rrp/inspection-users/${user.id}`, {
                name: user.name.trim(),
                designation: user.designation.trim(),
                staff_id: user.staff_id?.trim() || null,
                section_name: user.section_name?.trim() || null,
                email: user.email?.trim() || null,
            });
            if (response.status === 200) {
                await refetchInspectionUsers();
                setEditingInspectionUser(null);
                showSuccessToast({
                    title: "Success",
                    message: "Inspection user updated successfully",
                    duration: 3000,
                });
            }
        }
        catch {
            showErrorToast({
                title: "Error",
                message: "Failed to update inspection user",
                duration: 5000,
            });
        }
        finally {
            setIsSaving(false);
        }
    };
    const handleDeleteInspectionUser = async (id: number) => {
        try {
            setIsSaving(true);
            const response = await API.delete(`/api/settings/rrp/inspection-users/${id}`);
            if (response.status === 200) {
                await refetchInspectionUsers();
                showSuccessToast({
                    title: "Success",
                    message: "Inspection user deleted successfully",
                    duration: 3000,
                });
            }
        }
        catch {
            showErrorToast({
                title: "Error",
                message: "Failed to delete inspection user",
                duration: 5000,
            });
        }
        finally {
            setIsSaving(false);
        }
    };
    const filteredSuppliers = suppliers.filter(supplier => supplier.name.toLowerCase().includes(supplierSearchTerm.toLowerCase()) ||
        supplier.type.toLowerCase().includes(supplierSearchTerm.toLowerCase()));
    const filteredInspectionUsers = inspectionUsers.filter(user => user.name.toLowerCase().includes(inspectionUserSearchTerm.toLowerCase()) ||
        user.designation.toLowerCase().includes(inspectionUserSearchTerm.toLowerCase()));
    if (isLoading) {
        return (<div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003594]"></div>
      </div>);
    }
    return (<div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>RRP Authority Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {formData.map((auth, index) => (<div key={auth.id} className="p-4 border rounded-lg space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Authority Set {index + 1}</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Authority Type</Label>
                    <Input value={auth.authority_type ?? ''} onChange={(e) => handleAuthorityChange(auth.id, 'authority_type', e.target.value)} placeholder="Enter authority type" disabled/>
                  </div>

                  
                  <div className="col-span-2">
                    <h4 className="font-medium mb-2">Level 1 Authority</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input value={auth.level_1_authority_name ?? ''} onChange={(e) => handleAuthorityChange(auth.id, 'level_1_authority_name', e.target.value)} placeholder="Enter name"/>
                      </div>
                      <div className="space-y-2">
                        <Label>Staff ID</Label>
                        <Input value={auth.level_1_authority_staffid ?? ''} onChange={(e) => handleAuthorityChange(auth.id, 'level_1_authority_staffid', e.target.value)} placeholder="Enter staff ID"/>
                      </div>
                      <div className="space-y-2">
                        <Label>Designation</Label>
                        <Input value={auth.level_1_authority_designation ?? ''} onChange={(e) => handleAuthorityChange(auth.id, 'level_1_authority_designation', e.target.value)} placeholder="Enter designation"/>
                      </div>
                    </div>
                  </div>

                  
                  <div className="col-span-2">
                    <h4 className="font-medium mb-2">Level 2 Authority</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input value={auth.level_2_authority_name ?? ''} onChange={(e) => handleAuthorityChange(auth.id, 'level_2_authority_name', e.target.value)} placeholder="Enter name"/>
                      </div>
                      <div className="space-y-2">
                        <Label>Staff ID</Label>
                        <Input value={auth.level_2_authority_staffid ?? ''} onChange={(e) => handleAuthorityChange(auth.id, 'level_2_authority_staffid', e.target.value)} placeholder="Enter staff ID"/>
                      </div>
                      <div className="space-y-2">
                        <Label>Designation</Label>
                        <Input value={auth.level_2_authority_designation ?? ''} onChange={(e) => handleAuthorityChange(auth.id, 'level_2_authority_designation', e.target.value)} placeholder="Enter designation"/>
                      </div>
                    </div>
                  </div>

                  
                  <div className="col-span-2">
                    <h4 className="font-medium mb-2">Level 3 Authority</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input value={auth.level_3_authority_name ?? ''} onChange={(e) => handleAuthorityChange(auth.id, 'level_3_authority_name', e.target.value)} placeholder="Enter name"/>
                      </div>
                      <div className="space-y-2">
                        <Label>Staff ID</Label>
                        <Input value={auth.level_3_authority_staffid ?? ''} onChange={(e) => handleAuthorityChange(auth.id, 'level_3_authority_staffid', e.target.value)} placeholder="Enter staff ID"/>
                      </div>
                      <div className="space-y-2">
                        <Label>Designation</Label>
                        <Input value={auth.level_3_authority_designation ?? ''} onChange={(e) => handleAuthorityChange(auth.id, 'level_3_authority_designation', e.target.value)} placeholder="Enter designation"/>
                      </div>
                    </div>
                  </div>

                  
                  <div className="col-span-2">
                    <h4 className="font-medium mb-2">Quality Check Authority</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input value={auth.quality_check_authority_name ?? ''} onChange={(e) => handleAuthorityChange(auth.id, 'quality_check_authority_name', e.target.value)} placeholder="Enter name"/>
                      </div>
                      <div className="space-y-2">
                        <Label>Staff ID</Label>
                        <Input value={auth.quality_check_authority_staffid ?? ''} onChange={(e) => handleAuthorityChange(auth.id, 'quality_check_authority_staffid', e.target.value)} placeholder="Enter staff ID"/>
                      </div>
                      <div className="space-y-2">
                        <Label>Designation</Label>
                        <Input value={auth.quality_check_authority_designation ?? ''} onChange={(e) => handleAuthorityChange(auth.id, 'quality_check_authority_designation', e.target.value)} placeholder="Enter designation"/>
                      </div>
                    </div>
                  </div>
                </div>
              </div>))}

            <div className="flex justify-end mt-6">
              <Button onClick={handleSave} disabled={isSaving || !permissions?.includes('can_edit_rrp_authority_details')} className="bg-[#003594] text-white hover:bg-[#002a6e]">
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      
      <Card>
        <CardHeader>
          <CardTitle>Inspection User Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-end">
              <div className="md:col-span-1 xl:col-span-2">
                <Label>Name</Label>
                <Input value={newInspectionUserName} onChange={(e) => setNewInspectionUserName(e.target.value)} placeholder="Enter inspection user name"/>
              </div>
              <div className="md:col-span-1 xl:col-span-2">
                <Label>Designation</Label>
                <Input value={newInspectionUserDesignation} onChange={(e) => setNewInspectionUserDesignation(e.target.value)} placeholder="Enter designation"/>
              </div>
              <div className="md:col-span-1">
                <Label>Staff ID (optional)</Label>
                <Input value={newInspectionUserStaffId} onChange={(e) => setNewInspectionUserStaffId(e.target.value)} placeholder="Staff ID"/>
              </div>
              <div className="md:col-span-1">
                <Label>Section (optional)</Label>
                <Input value={newInspectionUserSectionName} onChange={(e) => setNewInspectionUserSectionName(e.target.value)} placeholder="Section name"/>
              </div>
              <div className="md:col-span-1 xl:col-span-2">
                <Label>Email (optional)</Label>
                <Input type="email" value={newInspectionUserEmail} onChange={(e) => setNewInspectionUserEmail(e.target.value)} placeholder="email@example.com"/>
              </div>
              <div className="md:col-span-1 flex md:justify-end">
                <Button onClick={handleAddInspectionUser} disabled={isSaving || !permissions?.includes('can_edit_rrp_authority_details')} className="bg-[#003594] text-white hover:bg-[#002a6e] w-full">
                  <Plus className="h-4 w-4 mr-2"/>
                  Add User
                </Button>
              </div>
            </div>

            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4"/>
              <Input placeholder="Search inspection users..." value={inspectionUserSearchTerm} onChange={(e) => setInspectionUserSearchTerm(e.target.value)} className="pl-10"/>
            </div>

            
            <div className="space-y-2">
              {filteredInspectionUsers.map((user) => (<div key={user.id} className="flex flex-col md:flex-row md:items-center gap-4 p-3 border rounded-md">
                  {editingInspectionUser?.id === user.id ? (<>
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                        <Input value={editingInspectionUser.name} onChange={(e) => setEditingInspectionUser({
                    ...editingInspectionUser,
                    name: e.target.value
                } as InspectionUser)} placeholder="Name"/>
                        <Input value={editingInspectionUser.designation} onChange={(e) => setEditingInspectionUser({
                    ...editingInspectionUser,
                    designation: e.target.value
                } as InspectionUser)} placeholder="Designation"/>
                        <Input value={editingInspectionUser.staff_id || ''} onChange={(e) => setEditingInspectionUser({
                    ...editingInspectionUser,
                    staff_id: e.target.value
                } as InspectionUser)} placeholder="Staff ID (optional)"/>
                        <Input value={editingInspectionUser.section_name || ''} onChange={(e) => setEditingInspectionUser({
                    ...editingInspectionUser,
                    section_name: e.target.value
                } as InspectionUser)} placeholder="Section (optional)"/>
                        <Input type="email" value={editingInspectionUser.email || ''} onChange={(e) => setEditingInspectionUser({
                    ...editingInspectionUser,
                    email: e.target.value
                } as InspectionUser)} placeholder="Email (optional)"/>
                      </div>
                      <Button onClick={handleUpdateInspectionUser} disabled={isSaving} className="bg-green-600 hover:bg-green-700 text-white">
                        <Save className="h-4 w-4 mr-2"/>
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => setEditingInspectionUser(null)} disabled={isSaving}>
                        <X className="h-4 w-4 mr-2"/>
                        Cancel
                      </Button>
                    </>) : (<>
                      <div className="flex-1">
                        <span className="font-medium">{user.name}</span>
                        <div className="text-sm text-gray-600">{user.designation}</div>
                        <div className="text-xs text-gray-500 space-x-2">
                          {user.staff_id ? <span>Staff: {user.staff_id}</span> : null}
                          {user.section_name ? <span>Section: {user.section_name}</span> : null}
                          {user.email ? <span>Email: {user.email}</span> : null}
                        </div>
                      </div>
                      <Button variant="outline" onClick={() => setEditingInspectionUser(user)} disabled={isSaving || !permissions?.includes('can_edit_rrp_authority_details')} className="text-blue-600 hover:text-blue-700">
                        <Edit className="h-4 w-4 mr-2"/>
                        Edit
                      </Button>
                      <Button variant="destructive" onClick={() => handleDeleteInspectionUser(user.id)} disabled={isSaving || !permissions?.includes('can_edit_rrp_authority_details')} className="text-red-600 hover:text-red-700">
                        <Trash2 className="h-4 w-4 mr-2"/>
                        Delete
                      </Button>
                    </>)}
                </div>))}
            </div>
          </div>
        </CardContent>
      </Card>

      
      <Card>
        <CardHeader>
          <CardTitle>Supplier Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <Label>New Supplier Name</Label>
                <Input value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} placeholder="Enter supplier name"/>
              </div>
              <div className="w-40">
                <Label>Type</Label>
                <select className="w-full p-2 border rounded-md" value={newSupplierType} onChange={(e) => setNewSupplierType(e.target.value as 'foreign' | 'local')}>
                  <option value="foreign">Foreign</option>
                  <option value="local">Local</option>
                </select>
              </div>
              <Button onClick={handleAddSupplier} disabled={isSaving || !permissions?.includes('can_edit_rrp_authority_details')} className="bg-[#003594] text-white hover:bg-[#002a6e]">
                <Plus className="h-4 w-4 mr-2"/>
                Add Supplier
              </Button>
            </div>

            
            <div className="relative flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4"/>
                <Input placeholder="Search suppliers..." value={supplierSearchTerm} onChange={(e) => setSupplierSearchTerm(e.target.value)} className="pl-10"/>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Button variant="outline" disabled={supplierPage <= 1 || isSaving} onClick={() => refetchSuppliers(Math.max(1, supplierPage - 1))}>
                  Previous
                </Button>
                <span>
                  Page {supplierPage} of {supplierTotalPages}
                </span>
                <Button variant="outline" disabled={supplierPage >= supplierTotalPages || isSaving} onClick={() => refetchSuppliers(Math.min(supplierTotalPages, supplierPage + 1))}>
                  Next
                </Button>
              </div>
            </div>

            
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Foreign Suppliers</h3>
              <div className="space-y-2">
                {filteredSuppliers.filter(s => s.type === 'foreign').map((supplier, index) => (<div key={`foreign-${supplier.id}-${index}`} className="flex items-center gap-4 p-2 border rounded-md">
                    {editingSupplier?.id === supplier.id ? (<>
                        <Input value={editingSupplier.name} onChange={(e) => setEditingSupplier({ ...editingSupplier, name: e.target.value })} className="flex-1"/>
                        <Button onClick={() => handleUpdateSupplier(editingSupplier)} disabled={isSaving} className="bg-green-600 hover:bg-green-700 text-white">
                          <Save className="h-4 w-4 mr-2"/>
                          Save
                        </Button>
                        <Button variant="outline" onClick={() => setEditingSupplier(null)} disabled={isSaving}>
                          <X className="h-4 w-4 mr-2"/>
                          Cancel
                        </Button>
                      </>) : (<>
                        <span className="flex-1">{supplier.name}</span>
                        <Button variant="outline" onClick={() => setEditingSupplier(supplier)} disabled={isSaving || !permissions?.includes('can_edit_rrp_authority_details')} className="text-blue-600 hover:text-blue-700">
                          <Edit className="h-4 w-4 mr-2"/>
                          Edit
                        </Button>
                        <Button variant="destructive" onClick={() => handleDeleteSupplier(supplier.id)} disabled={isSaving || !permissions?.includes('can_edit_rrp_authority_details')} className="text-red-600 hover:text-red-700">
                          <Trash2 className="h-4 w-4 mr-2"/>
                          Delete
                        </Button>
                      </>)}
                  </div>))}
              </div>

              <h3 className="text-lg font-semibold">Local Suppliers</h3>
              <div className="space-y-2">
                {filteredSuppliers.filter(s => s.type === 'local').map((supplier, index) => (<div key={`local-${supplier.id}-${index}`} className="flex items-center gap-4 p-2 border rounded-md">
                    {editingSupplier?.id === supplier.id ? (<>
                        <Input value={editingSupplier.name} onChange={(e) => setEditingSupplier({ ...editingSupplier, name: e.target.value })} className="flex-1"/>
                        <Button onClick={() => handleUpdateSupplier(editingSupplier)} disabled={isSaving} className="bg-green-600 hover:bg-green-700 text-white">
                          <Save className="h-4 w-4 mr-2"/>
                          Save
                        </Button>
                        <Button variant="outline" onClick={() => setEditingSupplier(null)} disabled={isSaving}>
                          <X className="h-4 w-4 mr-2"/>
                          Cancel
                        </Button>
                      </>) : (<>
                        <span className="flex-1">{supplier.name}</span>
                        <Button variant="outline" onClick={() => setEditingSupplier(supplier)} disabled={isSaving || !permissions?.includes('can_edit_rrp_authority_details')} className="text-blue-600 hover:text-blue-700">
                          <Edit className="h-4 w-4 mr-2"/>
                          Edit
                        </Button>
                        <Button variant="destructive" onClick={() => handleDeleteSupplier(supplier.id)} disabled={isSaving || !permissions?.includes('can_edit_rrp_authority_details')} className="text-red-600 hover:text-red-700">
                          <Trash2 className="h-4 w-4 mr-2"/>
                          Delete
                        </Button>
                      </>)}
                  </div>))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>);
}
