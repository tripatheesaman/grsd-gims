'use client';
import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { API } from '@/lib/api';
import { Asset, AssetType, CreateAssetDTO, UpdateAssetDTO } from '@/types/asset';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Plus, Pencil, Trash2, Loader2, Search } from 'lucide-react';
import { AssetForm } from './AssetForm';
export function AssetsManagement() {
    const { permissions } = useAuthContext();
    const canAccessAssets = permissions?.includes('can_access_asset_management_system');
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const [assets, setAssets] = useState<Asset[]>([]);
    const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
    const [isDeleting, setIsDeleting] = useState<number | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedAssetTypeId, setSelectedAssetTypeId] = useState<string>('all');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const fetchAssetTypes = useCallback(async () => {
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
            console.error('Error fetching asset types:', error);
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
    }, [showErrorToast]);
    const fetchAssets = useCallback(async () => {
        try {
            setIsLoading(true);
            const params: Record<string, string | number> = {
                page,
                pageSize: 20,
            };
            if (searchTerm) {
                params.search = searchTerm;
            }
            if (selectedAssetTypeId !== 'all') {
                params.asset_type_id = selectedAssetTypeId;
            }
            const response = await API.get('/api/assets', { params });
            setAssets(response.data.data);
            setTotalPages(response.data.pagination.totalPages);
            setTotal(response.data.pagination.total);
        }
        catch (error: unknown) {
            const message = (error as {
                response?: {
                    data?: {
                        message?: string;
                    };
                };
            })?.response?.data?.message || 'Failed to fetch assets';
            showErrorToast({
                title: 'Error',
                message,
                duration: 3000,
            });
        }
        finally {
            setIsLoading(false);
        }
    }, [page, searchTerm, selectedAssetTypeId, showErrorToast]);
    useEffect(() => {
        fetchAssetTypes();
    }, [fetchAssetTypes]);
    useEffect(() => {
        fetchAssets();
    }, [fetchAssets]);
    const handleCreate = async (data: CreateAssetDTO) => {
        try {
            await API.post('/api/assets', data);
            showSuccessToast({
                title: 'Success',
                message: 'Asset created successfully',
                duration: 3000,
            });
            setIsCreateOpen(false);
            fetchAssets();
        }
        catch (error: unknown) {
            const message = (error as {
                response?: {
                    data?: {
                        message?: string;
                    };
                };
            })?.response?.data?.message || 'Failed to create asset';
            showErrorToast({
                title: 'Error',
                message,
                duration: 5000,
            });
        }
    };
    const handleEdit = async (id: number, data: UpdateAssetDTO) => {
        try {
            await API.put(`/api/assets/${id}`, data);
            showSuccessToast({
                title: 'Success',
                message: 'Asset updated successfully',
                duration: 3000,
            });
            setIsEditOpen(false);
            setSelectedAsset(null);
            fetchAssets();
        }
        catch (error: unknown) {
            const message = (error as {
                response?: {
                    data?: {
                        message?: string;
                    };
                };
            })?.response?.data?.message || 'Failed to update asset';
            showErrorToast({
                title: 'Error',
                message,
                duration: 5000,
            });
        }
    };
    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this asset? This action cannot be undone.')) {
            return;
        }
        try {
            setIsDeleting(id);
            await API.delete(`/api/assets/${id}`);
            showSuccessToast({
                title: 'Success',
                message: 'Asset deleted successfully',
                duration: 3000,
            });
            fetchAssets();
        }
        catch (error: unknown) {
            const message = (error as {
                response?: {
                    data?: {
                        message?: string;
                    };
                };
            })?.response?.data?.message || 'Failed to delete asset';
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
            const response = await API.get(`/api/assets/${id}`);
            setSelectedAsset(response.data);
            setIsEditOpen(true);
        }
        catch {
            showErrorToast({
                title: 'Error',
                message: 'Failed to fetch asset details',
                duration: 3000,
            });
        }
    };
    const handleSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setPage(1);
    };
    if (!canAccessAssets) {
        return null;
    }
    return (<div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-[#003594]">Assets</h2>
          <p className="text-sm text-gray-600 mt-1">Manage individual assets</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="bg-[#003594] hover:bg-[#003594]/90 text-white">
          <Plus className="h-4 w-4 mr-2"/>
          Create Asset
        </Button>
      </div>

      <Card className="border-[#002a6e]/10">
        <CardContent className="pt-6">
          <form onSubmit={handleSearchSubmit} className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400"/>
                <Input placeholder="Search assets by name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20"/>
              </div>
            </div>
            <Select value={selectedAssetTypeId} onValueChange={setSelectedAssetTypeId}>
              <SelectTrigger className="w-48 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20">
                <SelectValue placeholder="All Asset Types"/>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Asset Types</SelectItem>
                {assetTypes.map((type) => (<SelectItem key={type.id} value={type.id.toString()}>
                    {type.name}
                  </SelectItem>))}
              </SelectContent>
            </Select>
            <Button type="submit" variant="outline" className="border-[#002a6e]/10">
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      {isLoading ? (<div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-[#003594]"/>
        </div>) : (<>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {assets.map((asset) => (<Card key={asset.id} className="border-[#002a6e]/10">
                <CardHeader>
                  <CardTitle className="text-lg">{asset.name}</CardTitle>
                  <p className="text-sm text-gray-600">
                    {asset.asset_type?.name || 'Unknown Type'}
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEditClick(asset.id)} className="flex-1">
                      <Pencil className="h-4 w-4 mr-1"/>
                      Edit
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(asset.id)} disabled={isDeleting === asset.id} className="flex-1">
                      {isDeleting === asset.id ? (<Loader2 className="h-4 w-4 mr-1 animate-spin"/>) : (<Trash2 className="h-4 w-4 mr-1"/>)}
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>))}
          </div>

          {assets.length === 0 && !isLoading && (<div className="text-center py-12 text-gray-500">
              <p>No assets found. Create your first asset to get started.</p>
            </div>)}

          {totalPages > 1 && (<div className="flex justify-center items-center gap-2">
              <Button variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="border-[#002a6e]/10">
                Previous
              </Button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages} ({total} total)
              </span>
              <Button variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="border-[#002a6e]/10">
                Next
              </Button>
            </div>)}
        </>)}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle>Create Asset</DialogTitle>
          </DialogHeader>
          <AssetForm assetTypes={assetTypes} onSubmit={(data) => handleCreate(data as CreateAssetDTO)} onCancel={() => setIsCreateOpen(false)}/>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle>Edit Asset</DialogTitle>
          </DialogHeader>
          {selectedAsset && (<AssetForm assetTypes={assetTypes} initialData={selectedAsset} onSubmit={(data) => handleEdit(selectedAsset.id, data)} onCancel={() => {
                setIsEditOpen(false);
                setSelectedAsset(null);
            }}/>)}
        </DialogContent>
      </Dialog>
    </div>);
}
