'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { API } from '@/lib/api';
import { AssetType, AssetTypeWithProperties, CreateAssetTypeDTO, UpdateAssetTypeDTO } from '@/types/asset';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, } from '@/components/ui/dialog';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { AssetTypeForm } from './AssetTypeForm';
export function AssetTypesManagement() {
    const { permissions } = useAuthContext();
    const canCreateAssetType = permissions?.includes('can_create_asset_type');
    const canConfigureProperties = permissions?.includes('can_configure_asset_properties');
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [selectedAssetType, setSelectedAssetType] = useState<AssetTypeWithProperties | null>(null);
    const [isDeleting, setIsDeleting] = useState<number | null>(null);
    const fetchAssetTypes = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await API.get('/api/asset-types');
            if (response.data) {
                setAssetTypes(Array.isArray(response.data) ? response.data : []);
            }
            else {
                setAssetTypes([]);
            }
        }
        catch (error: unknown) {
            const errorMessage = (error as {
                response?: {
                    data?: {
                        message?: string;
                        error?: string;
                    };
                };
                message?: string;
            })?.response?.data?.message ||
                (error as {
                    response?: {
                        data?: {
                            message?: string;
                            error?: string;
                        };
                    };
                    message?: string;
                })?.response?.data?.error ||
                (error as {
                    message?: string;
                }).message ||
                'Failed to fetch asset types. Please check your connection and try again.';
            showErrorToast({
                title: 'Error',
                message: errorMessage,
                duration: 5000,
            });
            setAssetTypes([]);
        }
        finally {
            setIsLoading(false);
        }
    }, [showErrorToast]);
    useEffect(() => {
        fetchAssetTypes();
    }, [fetchAssetTypes]);
    const handleCreate = async (data: CreateAssetTypeDTO | UpdateAssetTypeDTO) => {
        try {
            if (!('name' in data) || !data.name) {
                showErrorToast({
                    title: 'Error',
                    message: 'Asset type name is required',
                    duration: 3000,
                });
                return;
            }
            const createData: CreateAssetTypeDTO = {
                name: data.name,
                description: data.description,
                properties: data.properties,
            };
            await API.post('/api/asset-types', createData);
            showSuccessToast({
                title: 'Success',
                message: 'Asset type created successfully',
                duration: 3000,
            });
            setIsCreateOpen(false);
            fetchAssetTypes();
        }
        catch (error: unknown) {
            const message = (error as {
                response?: {
                    data?: {
                        message?: string;
                    };
                };
            })?.response?.data?.message || 'Failed to create asset type';
            showErrorToast({
                title: 'Error',
                message,
                duration: 5000,
            });
        }
    };
    const handleEdit = async (id: number, data: UpdateAssetTypeDTO) => {
        try {
            await API.put(`/api/asset-types/${id}`, data);
            showSuccessToast({
                title: 'Success',
                message: 'Asset type updated successfully',
                duration: 3000,
            });
            setIsEditOpen(false);
            setSelectedAssetType(null);
            fetchAssetTypes();
        }
        catch (error: unknown) {
            const message = (error as {
                response?: {
                    data?: {
                        message?: string;
                    };
                };
            })?.response?.data?.message || 'Failed to update asset type';
            showErrorToast({
                title: 'Error',
                message,
                duration: 5000,
            });
        }
    };
    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this asset type? This action cannot be undone.')) {
            return;
        }
        try {
            setIsDeleting(id);
            await API.delete(`/api/asset-types/${id}`);
            showSuccessToast({
                title: 'Success',
                message: 'Asset type deleted successfully',
                duration: 3000,
            });
            fetchAssetTypes();
        }
        catch (error: unknown) {
            const message = (error as {
                response?: {
                    data?: {
                        message?: string;
                    };
                };
            })?.response?.data?.message || 'Failed to delete asset type';
            showErrorToast({
                title: 'Error',
                message,
                duration: 5000,
            });
        }
        finally {
            setIsDeleting(null);
        }
    };
    const handleEditClick = async (id: number) => {
        try {
            const response = await API.get(`/api/asset-types/${id}`);
            setSelectedAssetType(response.data);
            setIsEditOpen(true);
        }
        catch {
            showErrorToast({
                title: 'Error',
                message: 'Failed to fetch asset type details',
                duration: 3000,
            });
        }
    };
    if (isLoading) {
        return (<div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-[#003594]"/>
      </div>);
    }
    return (<div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-[#003594]">Asset Types</h2>
          <p className="text-sm text-gray-600 mt-1">Manage asset type definitions and their properties</p>
        </div>
        {canCreateAssetType && (<Button onClick={() => setIsCreateOpen(true)} className="bg-[#003594] hover:bg-[#003594]/90 text-white">
            <Plus className="h-4 w-4 mr-2"/>
            Create Asset Type
          </Button>)}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {assetTypes.map((assetType) => (<Card key={assetType.id} className="border-[#002a6e]/10">
            <CardHeader>
              <CardTitle className="text-lg">{assetType.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                {assetType.description || 'No description'}
              </p>
              <div className="flex gap-2">
                {canConfigureProperties && (<Button variant="outline" size="sm" onClick={() => handleEditClick(assetType.id)} className="flex-1">
                    <Pencil className="h-4 w-4 mr-1"/>
                    Edit
                  </Button>)}
                {canCreateAssetType && (<Button variant="destructive" size="sm" onClick={() => handleDelete(assetType.id)} disabled={isDeleting === assetType.id} className="flex-1">
                    {isDeleting === assetType.id ? (<Loader2 className="h-4 w-4 mr-1 animate-spin"/>) : (<Trash2 className="h-4 w-4 mr-1"/>)}
                    Delete
                  </Button>)}
              </div>
            </CardContent>
          </Card>))}
      </div>

      {assetTypes.length === 0 && (<div className="text-center py-12 text-gray-500">
          <p>No asset types found. Create your first asset type to get started.</p>
        </div>)}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle>Create Asset Type</DialogTitle>
          </DialogHeader>
          <AssetTypeForm onSubmit={handleCreate} onCancel={() => setIsCreateOpen(false)} canConfigureProperties={canConfigureProperties}/>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle>Edit Asset Type</DialogTitle>
          </DialogHeader>
          {selectedAssetType && (<AssetTypeForm initialData={selectedAssetType} onSubmit={(data) => handleEdit(selectedAssetType.id, data)} onCancel={() => {
                setIsEditOpen(false);
                setSelectedAssetType(null);
            }} canConfigureProperties={canConfigureProperties}/>)}
        </DialogContent>
      </Dialog>
    </div>);
}
