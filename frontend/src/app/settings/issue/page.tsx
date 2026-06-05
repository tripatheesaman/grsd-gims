'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useCustomToast } from '@/components/ui/custom-toast';
import { useAuthContext } from '@/context/AuthContext';
import { API } from '@/lib/api';
import { useState, useEffect, useCallback } from 'react';
import { Pencil, Trash2, Plus, Tag } from 'lucide-react';

interface IssueSection {
    id: number;
    name: string;
    code: string;
    description: string | null;
    is_active: number;
}

const emptyForm = { name: '', code: '', description: '', is_active: true };

export default function IssueSettingsPage() {
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const { permissions } = useAuthContext();
    const canManage = permissions?.includes('can_manage_issue_sections') || permissions?.includes('can_access_issue_settings') || permissions?.includes('can_access_settings');

    const [sections, setSections] = useState<IssueSection[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editing, setEditing] = useState<IssueSection | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [isSaving, setIsSaving] = useState(false);

    const fetchSections = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await API.get('/api/settings/issue/sections');
            setSections(res.data || []);
        } catch {
            showErrorToast({ title: 'Error', message: 'Failed to fetch sections', duration: 3000 });
        } finally {
            setIsLoading(false);
        }
    }, [showErrorToast]);

    useEffect(() => { fetchSections(); }, [fetchSections]);

    const openAdd = () => {
        setEditing(null);
        setForm(emptyForm);
        setIsDialogOpen(true);
    };

    const openEdit = (s: IssueSection) => {
        setEditing(s);
        setForm({ name: s.name, code: s.code, description: s.description || '', is_active: s.is_active === 1 });
        setIsDialogOpen(true);
    };

    const closeDialog = () => {
        setIsDialogOpen(false);
        setEditing(null);
        setForm(emptyForm);
    };

    const handleSave = async () => {
        if (!form.name.trim() || !form.code.trim()) {
            showErrorToast({ title: 'Error', message: 'Name and code are required', duration: 3000 });
            return;
        }
        setIsSaving(true);
        try {
            if (editing) {
                await API.put(`/api/settings/issue/sections/${editing.id}`, {
                    name: form.name.trim(),
                    code: form.code.trim().toUpperCase(),
                    description: form.description.trim() || null,
                    is_active: form.is_active ? 1 : 0,
                });
                showSuccessToast({ title: 'Success', message: 'Section updated', duration: 3000 });
            } else {
                await API.post('/api/settings/issue/sections', {
                    name: form.name.trim(),
                    code: form.code.trim().toUpperCase(),
                    description: form.description.trim() || null,
                });
                showSuccessToast({ title: 'Success', message: 'Section added', duration: 3000 });
            }
            fetchSections();
            closeDialog();
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { message?: string } } };
            const msg = axiosErr?.response?.data?.message || 'Failed to save section';
            showErrorToast({ title: 'Error', message: msg, duration: 3000 });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Deactivate this section? It will no longer appear in the issue form.')) return;
        try {
            await API.delete(`/api/settings/issue/sections/${id}`);
            showSuccessToast({ title: 'Success', message: 'Section deactivated', duration: 3000 });
            fetchSections();
        } catch {
            showErrorToast({ title: 'Error', message: 'Failed to deactivate section', duration: 3000 });
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Issue Sections</CardTitle>
                        <p className="text-sm text-gray-500 mt-1">
                            Define sections (e.g. workshops, departments) that items can be issued to.
                            Items can be issued to either equipment numbers listed in their &quot;Applicable for&quot; field
                            or to any active section defined here.
                        </p>
                    </div>
                    {canManage && (
                        <Button onClick={openAdd} className="bg-[#003594] text-white hover:bg-[#002a6e] gap-2">
                            <Plus size={16} /> Add Section
                        </Button>
                    )}
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <p className="text-sm text-gray-500 py-4">Loading sections…</p>
                    ) : sections.length === 0 ? (
                        <div className="flex flex-col items-center py-10 text-gray-400 gap-2">
                            <Tag size={32} className="opacity-40" />
                            <p className="text-sm">No sections defined yet.</p>
                            {canManage && (
                                <Button variant="outline" size="sm" onClick={openAdd} className="mt-2 gap-1">
                                    <Plus size={14} /> Add your first section
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100 text-left text-xs uppercase text-gray-500 font-semibold">
                                        <th className="py-2 pr-4">Name</th>
                                        <th className="py-2 pr-4">Code</th>
                                        <th className="py-2 pr-4">Description</th>
                                        <th className="py-2 pr-4">Status</th>
                                        {canManage && <th className="py-2 text-right">Actions</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {sections.map((s) => (
                                        <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                            <td className="py-2 pr-4 font-medium text-gray-900">{s.name}</td>
                                            <td className="py-2 pr-4">
                                                <span className="inline-block bg-blue-50 text-blue-700 text-xs font-mono px-2 py-0.5 rounded">
                                                    {s.code}
                                                </span>
                                            </td>
                                            <td className="py-2 pr-4 text-gray-600">{s.description || <span className="text-gray-400 italic">—</span>}</td>
                                            <td className="py-2 pr-4">
                                                <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${s.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                                    {s.is_active ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            {canManage && (
                                                <td className="py-2 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <Button variant="ghost" size="sm" onClick={() => openEdit(s)} className="h-7 w-7 p-0 text-blue-600 hover:text-blue-800">
                                                            <Pencil size={14} />
                                                        </Button>
                                                        {s.is_active === 1 && (
                                                            <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id)} className="h-7 w-7 p-0 text-red-500 hover:text-red-700">
                                                                <Trash2 size={14} />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Edit Section' : 'Add Section'}</DialogTitle>
                        <DialogDescription>
                            {editing ? 'Update the section details below.' : 'Define a new section that items can be issued to.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                        <div>
                            <Label htmlFor="section-name">Name <span className="text-red-500">*</span></Label>
                            <Input
                                id="section-name"
                                placeholder="e.g. Maintenance Workshop"
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="section-code">Code <span className="text-red-500">*</span></Label>
                            <Input
                                id="section-code"
                                placeholder="e.g. MAINT"
                                value={form.code}
                                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                                className="mt-1 font-mono"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Unique short code used as the &quot;Issued for&quot; value when issuing to this section.
                            </p>
                        </div>
                        <div>
                            <Label htmlFor="section-desc">Description</Label>
                            <Input
                                id="section-desc"
                                placeholder="Optional description"
                                value={form.description}
                                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                                className="mt-1"
                            />
                        </div>
                        {editing && (
                            <div className="flex items-center gap-3">
                                <Switch
                                    checked={form.is_active}
                                    onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                                    id="section-active"
                                />
                                <Label htmlFor="section-active">Active</Label>
                            </div>
                        )}
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={closeDialog} disabled={isSaving}>Cancel</Button>
                            <Button onClick={handleSave} disabled={isSaving} className="bg-[#003594] text-white hover:bg-[#002a6e]">
                                {isSaving ? 'Saving…' : editing ? 'Save Changes' : 'Add Section'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
