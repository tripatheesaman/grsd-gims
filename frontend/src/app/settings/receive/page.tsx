'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/ui/button';
import { useCustomToast } from '@/components/ui/custom-toast';
import { useAuthContext } from '@/context/AuthContext';
import { API } from '@/lib/api';
import { useState, useEffect, useCallback } from 'react';
import { BorrowSource } from '@/types/borrow-receive';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Trash2, Pencil, Plus } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
export default function ReceiveSettingsPage() {
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const { user, permissions } = useAuthContext();
    const canAddBorrowSources = permissions?.includes('can_add_borrow_sources');
    const [borrowSources, setBorrowSources] = useState<BorrowSource[]>([]);
    const [locationPhrases, setLocationPhrases] = useState<{
        id: number;
        phrase: string;
        is_active: number;
    }[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingSource, setEditingSource] = useState<BorrowSource | null>(null);
    const [formData, setFormData] = useState({
        source_name: '',
        is_active: true
    });
    const [isPhraseDialogOpen, setIsPhraseDialogOpen] = useState(false);
    const [editingPhrase, setEditingPhrase] = useState<{
        id: number;
        phrase: string;
        is_active: number;
    } | null>(null);
    const [phraseForm, setPhraseForm] = useState({
        phrase: '',
        is_active: true
    });
    const fetchBorrowSources = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await API.get('/api/borrow-sources');
            if (response.status === 200) {
                setBorrowSources(response.data.data || []);
            }
        }
        catch {
            showErrorToast({
                title: "Error",
                message: "Failed to fetch borrow sources",
                duration: 3000,
            });
        }
        finally {
            setIsLoading(false);
        }
    }, [showErrorToast]);
    const fetchLocationPhrases = useCallback(async () => {
        try {
            const response = await API.get('/api/location-phrases');
            if (response.status === 200) {
                setLocationPhrases(response.data.data || []);
            }
        }
        catch {
            showErrorToast({
                title: "Error",
                message: "Failed to fetch location phrases",
                duration: 3000,
            });
        }
    }, [showErrorToast]);
    useEffect(() => {
        fetchBorrowSources();
        fetchLocationPhrases();
    }, [fetchBorrowSources, fetchLocationPhrases]);
    const handleOpenDialog = (source?: BorrowSource) => {
        if (source) {
            setEditingSource(source);
            setFormData({
                source_name: source.source_name || '',
                is_active: source.is_active === 1
            });
        }
        else {
            setEditingSource(null);
            setFormData({
                source_name: '',
                is_active: true
            });
        }
        setIsDialogOpen(true);
    };
    const handleCloseDialog = () => {
        setIsDialogOpen(false);
        setEditingSource(null);
        setFormData({
            source_name: '',
            is_active: true
        });
    };
    const handleSave = async () => {
        if (!formData.source_name.trim()) {
            showErrorToast({
                title: "Error",
                message: "Source name is required",
                duration: 3000,
            });
            return;
        }
        try {
            if (editingSource) {
                const response = await API.put(`/api/borrow-sources/${editingSource.id}`, {
                    source_name: formData.source_name.trim(),
                    is_active: formData.is_active
                });
                if (response.status === 200) {
                    showSuccessToast({
                        title: "Success",
                        message: "Borrow source updated successfully",
                        duration: 3000,
                    });
                    fetchBorrowSources();
                    handleCloseDialog();
                }
            }
            else {
                const response = await API.post('/api/borrow-sources', {
                    source_name: formData.source_name.trim(),
                    created_by: user?.UserInfo?.username
                });
                if (response.status === 201) {
                    showSuccessToast({
                        title: "Success",
                        message: "Borrow source created successfully",
                        duration: 3000,
                    });
                    fetchBorrowSources();
                    handleCloseDialog();
                }
            }
        }
        catch (error: unknown) {
            const err = error as {
                response?: {
                    data?: {
                        message?: string;
                    };
                };
            };
            const errorMessage = err?.response?.data?.message || 'Failed to save borrow source';
            showErrorToast({
                title: "Error",
                message: errorMessage,
                duration: 3000,
            });
        }
    };
    const handleOpenPhraseDialog = (phraseRow?: {
        id: number;
        phrase: string;
        is_active: number;
    }) => {
        if (phraseRow) {
            setEditingPhrase(phraseRow);
            setPhraseForm({
                phrase: phraseRow.phrase || '',
                is_active: phraseRow.is_active === 1
            });
        }
        else {
            setEditingPhrase(null);
            setPhraseForm({
                phrase: '',
                is_active: true
            });
        }
        setIsPhraseDialogOpen(true);
    };
    const handleClosePhraseDialog = () => {
        setIsPhraseDialogOpen(false);
        setEditingPhrase(null);
        setPhraseForm({
            phrase: '',
            is_active: true
        });
    };
    const handleSavePhrase = async () => {
        if (!phraseForm.phrase.trim()) {
            showErrorToast({
                title: "Error",
                message: "Phrase is required",
                duration: 3000,
            });
            return;
        }
        try {
            if (editingPhrase) {
                const response = await API.put(`/api/location-phrases/${editingPhrase.id}`, {
                    phrase: phraseForm.phrase.trim(),
                    is_active: phraseForm.is_active
                });
                if (response.status === 200) {
                    showSuccessToast({
                        title: "Success",
                        message: "Location phrase updated successfully",
                        duration: 3000,
                    });
                    fetchLocationPhrases();
                    handleClosePhraseDialog();
                }
            }
            else {
                const response = await API.post('/api/location-phrases', {
                    phrase: phraseForm.phrase.trim()
                });
                if (response.status === 201) {
                    showSuccessToast({
                        title: "Success",
                        message: "Location phrase created successfully",
                        duration: 3000,
                    });
                    fetchLocationPhrases();
                    handleClosePhraseDialog();
                }
            }
        }
        catch (error: unknown) {
            const err = error as {
                response?: {
                    data?: {
                        message?: string;
                    };
                };
            };
            const errorMessage = err?.response?.data?.message || 'Failed to save location phrase';
            showErrorToast({
                title: "Error",
                message: errorMessage,
                duration: 3000,
            });
        }
    };
    const handleDeletePhrase = async (id: number) => {
        if (!confirm('Are you sure you want to delete this location phrase?')) {
            return;
        }
        try {
            const response = await API.delete(`/api/location-phrases/${id}`);
            if (response.status === 200) {
                showSuccessToast({
                    title: "Success",
                    message: "Location phrase deleted successfully",
                    duration: 3000,
                });
                fetchLocationPhrases();
            }
        }
        catch (error: unknown) {
            const err = error as {
                response?: {
                    data?: {
                        message?: string;
                    };
                };
            };
            const errorMessage = err?.response?.data?.message || 'Failed to delete location phrase';
            showErrorToast({
                title: "Error",
                message: errorMessage,
                duration: 3000,
            });
        }
    };
    const handleDelete = async (sourceId: number) => {
        if (!confirm('Are you sure you want to delete this borrow source?')) {
            return;
        }
        try {
            const response = await API.delete(`/api/borrow-sources/${sourceId}`);
            if (response.status === 200) {
                showSuccessToast({
                    title: "Success",
                    message: "Borrow source deleted successfully",
                    duration: 3000,
                });
                fetchBorrowSources();
            }
        }
        catch (error: unknown) {
            const err = error as {
                response?: {
                    data?: {
                        message?: string;
                    };
                };
            };
            const errorMessage = err?.response?.data?.message || 'Failed to delete borrow source';
            showErrorToast({
                title: "Error",
                message: errorMessage,
                duration: 3000,
            });
        }
    };
    if (!canAddBorrowSources) {
        return (<div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Receive Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">You don&apos;t have permission to manage borrow sources.</p>
          </CardContent>
        </Card>
      </div>);
    }
    return (<div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Borrow Sources Management</CardTitle>
          <Button onClick={() => handleOpenDialog()} className="bg-[#003594] text-white hover:bg-[#002a6e]">
            <Plus className="h-4 w-4 mr-2"/>
            Add Source
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (<div className="text-center py-8">Loading...</div>) : borrowSources.length === 0 ? (<div className="text-center py-8 text-gray-500">
              No borrow sources found. Click &quot;Add Source&quot; to create one.
            </div>) : (<div className="space-y-4">
              {borrowSources.map((source) => (<div key={source.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                    <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-[#003594]">{source.source_name}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs ${source.is_active === 1
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'}`}>
                        {source.is_active === 1 ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleOpenDialog(source)}>
                      <Pencil className="h-4 w-4"/>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(source.id)} className="text-red-600 hover:text-red-700">
                      <Trash2 className="h-4 w-4"/>
                    </Button>
                  </div>
                </div>))}
            </div>)}
        </CardContent>
      </Card>

      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Valid Location Phrases</CardTitle>
          <Button onClick={() => handleOpenPhraseDialog()} className="bg-[#003594] text-white hover:bg-[#002a6e]">
            <Plus className="h-4 w-4 mr-2"/>
            Add Phrase
          </Button>
        </CardHeader>
        <CardContent>
          {locationPhrases.length === 0 ? (<div className="text-center py-8 text-gray-500">
              No location phrases defined. Click &quot;Add Phrase&quot; to create one.
            </div>) : (<div className="space-y-4">
              {locationPhrases.map((row) => (<div key={row.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-[#003594]">{row.phrase}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs ${row.is_active === 1
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'}`}>
                        {row.is_active === 1 ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleOpenPhraseDialog(row)}>
                      <Pencil className="h-4 w-4"/>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDeletePhrase(row.id)} className="text-red-600 hover:text-red-700">
                      <Trash2 className="h-4 w-4"/>
                    </Button>
                  </div>
                </div>))}
            </div>)}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingSource ? 'Edit Borrow Source' : 'Add New Borrow Source'}
            </DialogTitle>
            <DialogDescription>
              {editingSource
            ? 'Update the borrow source information below.'
            : 'Fill in the details to create a new borrow source.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="source_name">Source Name *</Label>
              <Input id="source_name" value={formData.source_name} onChange={(e) => setFormData({ ...formData, source_name: e.target.value })} placeholder="Enter source name" className="mt-1" required/>
              <p className="text-xs text-gray-500 mt-1">Source name must be unique</p>
            </div>
            {editingSource && (<div className="flex items-center gap-2">
                <Switch id="is_active" checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}/>
                <Label htmlFor="is_active">Active</Label>
              </div>)}
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button onClick={handleSave} className="bg-[#003594] text-white hover:bg-[#002a6e]">
                {editingSource ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isPhraseDialogOpen} onOpenChange={setIsPhraseDialogOpen}>
        <DialogContent className="bg-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingPhrase ? 'Edit Location Phrase' : 'Add New Location Phrase'}
            </DialogTitle>
            <DialogDescription>
              {editingPhrase
            ? 'Update the location phrase below.'
            : 'Fill in the phrase to create a reusable valid location description.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="phrase">Phrase *</Label>
              <Input id="phrase" value={phraseForm.phrase} onChange={(e) => setPhraseForm({ ...phraseForm, phrase: e.target.value })} placeholder="e.g., behind in the outside wall" className="mt-1" required/>
            </div>
            {editingPhrase && (<div className="flex items-center gap-2">
                <Switch id="phrase_is_active" checked={phraseForm.is_active} onCheckedChange={(checked) => setPhraseForm({ ...phraseForm, is_active: checked })}/>
                <Label htmlFor="phrase_is_active">Active</Label>
              </div>)}
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={handleClosePhraseDialog}>
                Cancel
              </Button>
              <Button onClick={handleSavePhrase} className="bg-[#003594] text-white hover:bg-[#002a6e]">
                {editingPhrase ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>);
}
