'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/ui/button';
import { useCustomToast } from '@/components/ui/custom-toast';
import { useAuthContext } from '@/context/AuthContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { API } from '@/lib/api';
import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Edit, Trash2, X, Save } from 'lucide-react';
interface RequestingReceivingAuthority {
    id: number;
    name: string;
    designation: string;
    staff_id?: string | null;
    section_name?: string | null;
    email?: string | null;
    is_active?: number;
}
export default function AuthoritiesPage() {
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const { permissions } = useAuthContext();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [authorities, setAuthorities] = useState<RequestingReceivingAuthority[]>([]);
    const [newAuthorityName, setNewAuthorityName] = useState('');
    const [newAuthorityDesignation, setNewAuthorityDesignation] = useState('');
    const [newAuthorityStaffId, setNewAuthorityStaffId] = useState('');
    const [newAuthoritySectionName, setNewAuthoritySectionName] = useState('');
    const [newAuthorityEmail, setNewAuthorityEmail] = useState('');
    const [editingAuthority, setEditingAuthority] = useState<RequestingReceivingAuthority | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const canEdit = permissions?.includes('can_edit_rrp_authority_details');
    const fetchAuthorities = useCallback(async () => {
        try {
            setIsLoading(true);
            const response = await API.get('/api/settings/rrp/inspection-users');
            if (response.status === 200) {
                setAuthorities(response.data || []);
            }
        }
        catch {
            showErrorToast({
                title: "Error",
                message: "Failed to fetch authorities",
                duration: 3000,
            });
        }
        finally {
            setIsLoading(false);
        }
    }, [showErrorToast]);
    useEffect(() => {
        fetchAuthorities();
    }, [fetchAuthorities]);
    const handleAddAuthority = async () => {
        if (!newAuthorityName.trim() || !newAuthorityDesignation.trim()) {
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
                name: newAuthorityName.trim(),
                designation: newAuthorityDesignation.trim(),
                staff_id: newAuthorityStaffId.trim() || null,
                section_name: newAuthoritySectionName.trim() || null,
                email: newAuthorityEmail.trim() || null,
            });
            if (response.status === 201) {
                await fetchAuthorities();
                setNewAuthorityName('');
                setNewAuthorityDesignation('');
                setNewAuthorityStaffId('');
                setNewAuthoritySectionName('');
                setNewAuthorityEmail('');
                showSuccessToast({
                    title: "Success",
                    message: "Authority added successfully",
                    duration: 3000,
                });
            }
        }
        catch {
            showErrorToast({
                title: "Error",
                message: "Failed to add authority",
                duration: 5000,
            });
        }
        finally {
            setIsSaving(false);
        }
    };
    const handleUpdateAuthority = async () => {
        if (!editingAuthority)
            return;
        const authority = editingAuthority;
        if (!authority.name.trim() || !authority.designation.trim()) {
            showErrorToast({
                title: "Error",
                message: "Name and designation cannot be empty",
                duration: 3000,
            });
            return;
        }
        try {
            setIsSaving(true);
            const response = await API.put(`/api/settings/rrp/inspection-users/${authority.id}`, {
                name: authority.name.trim(),
                designation: authority.designation.trim(),
                staff_id: authority.staff_id?.trim() || null,
                section_name: authority.section_name?.trim() || null,
                email: authority.email?.trim() || null,
            });
            if (response.status === 200) {
                await fetchAuthorities();
                setEditingAuthority(null);
                showSuccessToast({
                    title: "Success",
                    message: "Authority updated successfully",
                    duration: 3000,
                });
            }
        }
        catch {
            showErrorToast({
                title: "Error",
                message: "Failed to update authority",
                duration: 5000,
            });
        }
        finally {
            setIsSaving(false);
        }
    };
    const handleDeleteAuthority = async (id: number) => {
        try {
            setIsSaving(true);
            const response = await API.delete(`/api/settings/rrp/inspection-users/${id}`);
            if (response.status === 200) {
                await fetchAuthorities();
                showSuccessToast({
                    title: "Success",
                    message: "Authority deleted successfully",
                    duration: 3000,
                });
            }
        }
        catch {
            showErrorToast({
                title: "Error",
                message: "Failed to delete authority",
                duration: 5000,
            });
        }
        finally {
            setIsSaving(false);
        }
    };
    const filteredAuthorities = authorities.filter(authority => authority.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        authority.designation.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (authority.staff_id && authority.staff_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (authority.section_name && authority.section_name.toLowerCase().includes(searchTerm.toLowerCase())));
    if (isLoading) {
        return (<div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003594]"></div>
      </div>);
    }
    return (<div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Requesting & Receiving Authority Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-end">
              <div className="md:col-span-1 xl:col-span-2">
                <Label>Name *</Label>
                <Input value={newAuthorityName} onChange={(e) => setNewAuthorityName(e.target.value)} placeholder="Enter authority name"/>
              </div>
              <div className="md:col-span-1 xl:col-span-2">
                <Label>Designation *</Label>
                <Input value={newAuthorityDesignation} onChange={(e) => setNewAuthorityDesignation(e.target.value)} placeholder="Enter designation"/>
              </div>
              <div className="md:col-span-1">
                <Label>Staff ID (optional)</Label>
                <Input value={newAuthorityStaffId} onChange={(e) => setNewAuthorityStaffId(e.target.value)} placeholder="Staff ID"/>
              </div>
              <div className="md:col-span-1">
                <Label>Section (optional)</Label>
                <Input value={newAuthoritySectionName} onChange={(e) => setNewAuthoritySectionName(e.target.value)} placeholder="Section name"/>
              </div>
              <div className="md:col-span-1 xl:col-span-2">
                <Label>Email (optional)</Label>
                <Input type="email" value={newAuthorityEmail} onChange={(e) => setNewAuthorityEmail(e.target.value)} placeholder="email@example.com"/>
              </div>
              <div className="md:col-span-1 flex md:justify-end">
                <Button onClick={handleAddAuthority} disabled={isSaving || !canEdit} className="bg-[#003594] text-white hover:bg-[#002a6e] w-full">
                  <Plus className="h-4 w-4 mr-2"/>
                  Add Authority
                </Button>
              </div>
            </div>

            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4"/>
              <Input placeholder="Search authorities by name, designation, staff ID, or section..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10"/>
            </div>

            
            <div className="space-y-2">
              {filteredAuthorities.length === 0 ? (<div className="text-center py-8 text-gray-500">
                  {searchTerm ? 'No authorities found matching your search.' : 'No authorities found. Add one to get started.'}
                </div>) : (filteredAuthorities.map((authority) => (<div key={authority.id} className="flex flex-col md:flex-row md:items-center gap-4 p-3 border rounded-md">
                    {editingAuthority?.id === authority.id ? (<>
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                          <Input value={editingAuthority.name} onChange={(e) => setEditingAuthority({
                    ...editingAuthority,
                    name: e.target.value
                } as RequestingReceivingAuthority)} placeholder="Name *"/>
                          <Input value={editingAuthority.designation} onChange={(e) => setEditingAuthority({
                    ...editingAuthority,
                    designation: e.target.value
                } as RequestingReceivingAuthority)} placeholder="Designation *"/>
                          <Input value={editingAuthority.staff_id || ''} onChange={(e) => setEditingAuthority({
                    ...editingAuthority,
                    staff_id: e.target.value
                } as RequestingReceivingAuthority)} placeholder="Staff ID (optional)"/>
                          <Input value={editingAuthority.section_name || ''} onChange={(e) => setEditingAuthority({
                    ...editingAuthority,
                    section_name: e.target.value
                } as RequestingReceivingAuthority)} placeholder="Section (optional)"/>
                          <Input type="email" value={editingAuthority.email || ''} onChange={(e) => setEditingAuthority({
                    ...editingAuthority,
                    email: e.target.value
                } as RequestingReceivingAuthority)} placeholder="Email (optional)"/>
                        </div>
                        <Button onClick={handleUpdateAuthority} disabled={isSaving} className="bg-green-600 hover:bg-green-700 text-white">
                          <Save className="h-4 w-4 mr-2"/>
                          Save
                        </Button>
                        <Button variant="outline" onClick={() => setEditingAuthority(null)} disabled={isSaving}>
                          <X className="h-4 w-4 mr-2"/>
                          Cancel
                        </Button>
                      </>) : (<>
                        <div className="flex-1">
                          <div className="font-medium">{authority.name}</div>
                          <div className="text-sm text-gray-600">
                            {authority.designation}
                            {authority.staff_id ? <span> • Staff ID: {authority.staff_id}</span> : null}
                            {authority.section_name ? <span> • Section: {authority.section_name}</span> : null}
                            {authority.email ? <span> • Email: {authority.email}</span> : null}
                          </div>
                        </div>
                        <Button variant="outline" onClick={() => setEditingAuthority(authority)} disabled={isSaving || !canEdit} className="text-blue-600 hover:text-blue-700">
                          <Edit className="h-4 w-4 mr-2"/>
                          Edit
                        </Button>
                        <Button variant="destructive" onClick={() => handleDeleteAuthority(authority.id)} disabled={isSaving || !canEdit} className="text-red-600 hover:text-red-700">
                          <Trash2 className="h-4 w-4 mr-2"/>
                          Delete
                        </Button>
                      </>)}
                  </div>)))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>);
}
