'use client';

import { useAuthContext } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Plus, Wrench } from 'lucide-react';
import { useCustomToast } from '@/components/ui/custom-toast';
import { API } from '@/lib/api';
import { getNacCodeValidationError } from '@/utils/nacCodeUtils';
import { InventoryFilterPanel } from '@/components/inventory/InventoryFilterPanel';
import { InventoryPageHeader } from '@/components/inventory/InventoryPageHeader';
import { StockRecordsTable, type StockRecordRow } from '@/components/stock/StockRecordsTable';
import { Button } from '@/components/ui/button';
type StockRow = StockRecordRow;
interface StockResponse {
    data: StockRow[];
    pagination: {
        currentPage: number;
        pageSize: number;
        totalCount: number;
        totalPages: number;
    };
}
interface StockFormData {
    nacCode: string;
    itemName: string;
    partNumber: string;
    equipmentNumber: string;
    trueBalance: number;
    openQuantity: number;
    openAmount: number;
    location: string;
}

interface EditBaseline {
    trueBalance: number;
    openQuantity: number;
}
export default function StockRecordsPage() {
    const { user, permissions } = useAuthContext();
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const router = useRouter();
    const isSuperAdmin = user?.UserInfo?.role?.toLowerCase() === 'superadmin';
    useEffect(() => {
        if (!user) {
            router.push('/login');
            return;
        }
        if (!permissions.includes('can_access_stock_records')) {
            router.push('/unauthorized');
            return;
        }
    }, [user, permissions, router]);
    const canAccess = !!user && permissions.includes('can_access_stock_records');
    const canAdd = permissions.includes('can_add_new_items');
    const canEdit = permissions.includes('can_edit_stock_items');
    const canDelete = permissions.includes('can_delete_stock_items');
    const [universal, setUniversal] = useState<string>('');
    const [equipmentNumber, setEquipmentNumber] = useState<string>('');
    const [partNumber, setPartNumber] = useState<string>('');
    const [page, setPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(20);
    const [rows, setRows] = useState<StockRow[]>([]);
    const [totalCount, setTotalCount] = useState<number>(0);
    const [totalPages, setTotalPages] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
    const [showEditModal, setShowEditModal] = useState<boolean>(false);
    const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
    const [editingItem, setEditingItem] = useState<StockRow | null>(null);
    const [editBaseline, setEditBaseline] = useState<EditBaseline | null>(null);
    const [deletingItem, setDeletingItem] = useState<StockRow | null>(null);
    const [formData, setFormData] = useState<StockFormData>({
        nacCode: '',
        itemName: '',
        partNumber: '',
        equipmentNumber: '',
        trueBalance: 0,
        openQuantity: 0,
        openAmount: 0,
        location: ''
    });
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [migrating, setMigrating] = useState<boolean>(false);
    const [showMigrateModal, setShowMigrateModal] = useState<boolean>(false);
    const [migrateDryRun, setMigrateDryRun] = useState<boolean>(true);
    const fetchData = useCallback(async () => {
        if (!canAccess)
            return;
        setLoading(true);
        setError(null);
        try {
            const params: Record<string, string | number> = {};
            if (universal)
                params.universal = universal;
            if (equipmentNumber)
                params.equipmentNumber = equipmentNumber;
            if (partNumber)
                params.partNumber = partNumber;
            params.page = page;
            params.pageSize = pageSize;
            const res = await API.get<StockResponse>('/api/search/stock', { params });
            setRows(res.data.data || []);
            setTotalCount(res.data.pagination.totalCount);
            setTotalPages(res.data.pagination.totalPages);
        }
        catch {
            setError('Failed to fetch records');
        }
        finally {
            setLoading(false);
        }
    }, [canAccess, universal, equipmentNumber, partNumber, page, pageSize]);
    useEffect(() => { fetchData(); }, [fetchData]);
    const resetForm = () => {
        setFormData({
            nacCode: '',
            itemName: '',
            partNumber: '',
            equipmentNumber: '',
            trueBalance: 0,
            openQuantity: 0,
            openAmount: 0,
            location: ''
        });
        setFormErrors({});
    };
    const validateForm = (): boolean => {
        const errors: Record<string, string> = {};
        if (!formData.nacCode.trim()) {
            errors.nacCode = 'NAC Code is required';
        } else {
            const nacFormatError = getNacCodeValidationError(formData.nacCode, { allowSuffix: true });
            if (nacFormatError) {
                errors.nacCode = nacFormatError;
            }
        }
        if (!formData.itemName.trim()) {
            errors.itemName = 'Item Name is required';
        }
        if (!formData.partNumber.trim()) {
            errors.partNumber = 'Part Number is required';
        }
        else if (formData.partNumber.includes(',')) {
            errors.partNumber = 'Part number must be a single value (no commas)';
        }
        if (formData.itemName.includes(',')) {
            errors.itemName = 'Item name must be a single value (no commas)';
        }
        if (!formData.equipmentNumber.trim()) {
            errors.equipmentNumber = 'Equipment Number is required';
        }
        if (formData.trueBalance < 0) {
            errors.trueBalance = 'True balance cannot be negative';
        }
        if (formData.openQuantity < 0) {
            errors.openQuantity = 'Open Quantity cannot be negative';
        }
        if (formData.openAmount < 0) {
            errors.openAmount = 'Open Amount cannot be negative';
        }
        if (!formData.location.trim()) {
            errors.location = 'Location is required';
        }
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };
    const handleCreate = async () => {
        if (!validateForm())
            return;
        setSubmitting(true);
        try {
            await API.post('/api/stock/create', {
                ...formData,
                currentBalance: formData.trueBalance,
            });
            setShowCreateModal(false);
            resetForm();
            fetchData();
            showSuccessToast({ title: 'Created', message: 'Stock item created successfully.', duration: 3000 });
        }
        catch (error: unknown) {
            if (error && typeof error === 'object' && 'response' in error && error.response && typeof error.response === 'object' && 'status' in error.response && error.response.status === 409) {
                setFormErrors({ nacCode: 'NAC Code already exists' });
            }
            else {
                const errorMessage = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Unknown error';
                setError(`Failed to create item: ${errorMessage}`);
            }
        }
        finally {
            setSubmitting(false);
        }
    };
    const handleEdit = async () => {
        if (!editingItem || !validateForm() || !editBaseline)
            return;
        setSubmitting(true);
        const openQuantityDelta = formData.openQuantity - editBaseline.openQuantity;
        const effectiveTrueBalance = formData.trueBalance + openQuantityDelta;
        try {
            await API.put(`/api/stock/update/${editingItem.id}`, {
                ...formData,
                trueBalance: effectiveTrueBalance,
                currentBalance: effectiveTrueBalance,
            });
            setShowEditModal(false);
            setEditingItem(null);
            setEditBaseline(null);
            resetForm();
            fetchData();
            showSuccessToast({ title: 'Updated', message: 'Stock item updated successfully.', duration: 3000 });
        }
        catch (error: unknown) {
            if (error && typeof error === 'object' && 'response' in error && error.response && typeof error.response === 'object' && 'status' in error.response && error.response.status === 409) {
                setFormErrors({ nacCode: 'NAC Code already exists' });
            }
            else {
                const errorMessage = error && typeof error === 'object' && 'response' in error
                    ? String((error as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed to update item')
                    : error && typeof error === 'object' && 'message' in error
                        ? String(error.message)
                        : 'Failed to update item';
                showErrorToast({ title: 'Update failed', message: errorMessage, duration: 6000 });
            }
        }
        finally {
            setSubmitting(false);
        }
    };
    const handleDelete = async () => {
        if (!deletingItem)
            return;
        setSubmitting(true);
        try {
            await API.delete(`/api/stock/delete/${deletingItem.id}`);
            setShowDeleteModal(false);
            setDeletingItem(null);
            fetchData();
        }
        catch (error: unknown) {
            if (error && typeof error === 'object' && 'response' in error && error.response && typeof error.response === 'object' && 'status' in error.response && error.response.status === 400) {
                setError('Cannot delete item that is referenced in other tables');
            }
            else {
                setError('Failed to delete item');
            }
        }
        finally {
            setSubmitting(false);
        }
    };
    const openEditModal = (item: StockRow) => {
        const trueBalance = Number(item.trueBalance ?? item.currentBalance) || 0;
        const openQuantity = Number(item.openQuantity) || 0;
        setEditingItem(item);
        setEditBaseline({ trueBalance, openQuantity });
        setFormData({
            nacCode: item.nacCode,
            itemName: item.itemName,
            partNumber: item.partNumber,
            equipmentNumber: item.equipmentNumber,
            trueBalance,
            openQuantity,
            openAmount: Number(item.openAmount) || 0,
            location: item.location
        });
        setFormErrors({});
        setShowEditModal(true);
        setError(null);
    };
    const openDeleteModal = (item: StockRow) => {
        setDeletingItem(item);
        setShowDeleteModal(true);
    };
    const openCreateModal = () => {
        resetForm();
        setShowCreateModal(true);
    };

    const handleMigratePartVariants = async () => {
        setMigrating(true);
        try {
            const res = await API.post('/api/stock/migrate-part-variants', { dryRun: migrateDryRun });
            const data = res.data;
            const reconcile = data.reconcile;
            const errorHint = data.errors?.length
                ? ` Split errors: ${data.errors.slice(0, 2).join('; ')}${data.errors.length > 2 ? '…' : ''}`
                : '';
            const reconcileHint = reconcile
                ? ` Reconcile: ${reconcile.reconciledVariants} variants, ${reconcile.balanceFixes} balance fix(es), ${reconcile.compatRowsAdded} compat row(s).`
                : '';
            const reconcileErrors = reconcile?.errors?.length
                ? ` Reconcile errors: ${reconcile.errors.slice(0, 2).join('; ')}`
                : '';
            showSuccessToast({
                title: migrateDryRun ? 'Dry run complete' : 'Reconciliation complete',
                message: `Split: processed ${data.processed}, split ${data.splitFamilies}, fixed ${data.singlePartFixed}.${reconcileHint}${errorHint}${reconcileErrors}`,
                duration: 14000,
            });
            if (!migrateDryRun) {
                fetchData();
            }
            setShowMigrateModal(false);
        } catch (error: unknown) {
            const msg = error && typeof error === 'object' && 'response' in error
                ? String((error as { response?: { data?: { message?: string } } }).response?.data?.message || 'Migration failed')
                : 'Migration failed';
            showErrorToast({ title: 'Migration failed', message: msg, duration: 6000 });
        } finally {
            setMigrating(false);
        }
    };

    const hasActiveFilters = Boolean(universal.trim() || equipmentNumber.trim() || partNumber.trim());

    const handleFilterChange = (field: 'universal' | 'equipment' | 'part', value: string) => {
        setPage(1);
        if (field === 'universal') setUniversal(value);
        else if (field === 'equipment') setEquipmentNumber(value);
        else setPartNumber(value);
    };

    const clearFilters = () => {
        setPage(1);
        setUniversal('');
        setEquipmentNumber('');
        setPartNumber('');
    };

    if (!canAccess) return null;

    return (
        <div className="min-h-screen bg-[#f6f8fc]">
            <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:py-8">
                <InventoryPageHeader
                    title="Stock records"
                    description="Manage spare inventory: browse all items, filter by NAC, equipment, or part number, and add or edit records."
                    badge="Administration"
                    actions={
                        <div className="flex flex-wrap gap-2">
                            {isSuperAdmin && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setShowMigrateModal(true)}
                                    className="border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                                >
                                    <Wrench className="mr-2 h-4 w-4" />
                                    Reconcile inventory families
                                </Button>
                            )}
                            {canAdd && (
                                <Button
                                    type="button"
                                    onClick={openCreateModal}
                                    className="bg-white text-[#003594] hover:bg-white/90 shadow-md"
                                >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add item
                                </Button>
                            )}
                        </div>
                    }
                />

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                    <InventoryFilterPanel
                        values={{ universal, equipment: equipmentNumber, part: partNumber }}
                        onChange={handleFilterChange}
                        onClear={clearFilters}
                    />
                </section>

                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <StockRecordsTable
                        rows={rows}
                        loading={loading}
                        error={error}
                        hasActiveFilters={hasActiveFilters}
                        canEdit={canEdit}
                        canDelete={canDelete}
                        onEdit={openEditModal}
                        onDelete={openDeleteModal}
                        page={page}
                        pageSize={pageSize}
                        totalCount={totalCount}
                        totalPages={totalPages}
                        onPageChange={setPage}
                        onPageSizeChange={(size) => {
                            setPage(1);
                            setPageSize(size);
                        }}
                    />
                </section>
            </div>

      
      {showCreateModal && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">Add New Stock Item</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">NAC Code *</label>
                <input type="text" value={formData.nacCode} onChange={(e) => setFormData({ ...formData, nacCode: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.nacCode ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter NAC Code"/>
                {formErrors.nacCode && (<p className="text-red-500 text-xs mt-1">{formErrors.nacCode}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Item Name *</label>
                <input type="text" value={formData.itemName} onChange={(e) => setFormData({ ...formData, itemName: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.itemName ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Item Name"/>
                {formErrors.itemName && (<p className="text-red-500 text-xs mt-1">{formErrors.itemName}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Part Number *</label>
                <input type="text" value={formData.partNumber} onChange={(e) => setFormData({ ...formData, partNumber: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.partNumber ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Part Number"/>
                {formErrors.partNumber && (<p className="text-red-500 text-xs mt-1">{formErrors.partNumber}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Equipment Number *</label>
                <input type="text" value={formData.equipmentNumber} onChange={(e) => setFormData({ ...formData, equipmentNumber: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.equipmentNumber ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Equipment Number"/>
                {formErrors.equipmentNumber && (<p className="text-red-500 text-xs mt-1">{formErrors.equipmentNumber}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">True balance *</label>
                <input type="number" value={formData.trueBalance} onChange={(e) => setFormData({ ...formData, trueBalance: Number(e.target.value) || 0 })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.trueBalance ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter true balance" min="0" step="any"/>
                {formErrors.trueBalance && (<p className="text-red-500 text-xs mt-1">{formErrors.trueBalance}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Open Quantity</label>
                <input type="number" value={formData.openQuantity} onChange={(e) => setFormData({ ...formData, openQuantity: Number(e.target.value) || 0 })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.openQuantity ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Open Quantity" min="0"/>
                {formErrors.openQuantity && (<p className="text-red-500 text-xs mt-1">{formErrors.openQuantity}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Open Amount</label>
                <input type="number" value={formData.openAmount} onChange={(e) => setFormData({ ...formData, openAmount: Number(e.target.value) || 0 })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.openAmount ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Open Amount" min="0" step="0.01"/>
                {formErrors.openAmount && (<p className="text-red-500 text-xs mt-1">{formErrors.openAmount}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Location *</label>
                <input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.location ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Location"/>
                {formErrors.location && (<p className="text-red-500 text-xs mt-1">{formErrors.location}</p>)}
              </div>
              
            </div>
            
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCreateModal(false)} className="flex-1 px-4 py-2 border border-[#002a6e]/20 rounded-md hover:bg-[#003594]/5" disabled={submitting}>
                Cancel
              </button>
              <button onClick={handleCreate} disabled={submitting} className="flex-1 bg-[#003594] text-white px-4 py-2 rounded-md hover:bg-[#002a6e] transition-colors disabled:opacity-50">
                {submitting ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>)}

      
      {showEditModal && editingItem && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold">Edit Stock Item</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">NAC Code *</label>
                <input type="text" value={formData.nacCode} onChange={(e) => setFormData({ ...formData, nacCode: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.nacCode ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter NAC Code"/>
                {formErrors.nacCode && (<p className="text-red-500 text-xs mt-1">{formErrors.nacCode}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Item Name *</label>
                <input type="text" value={formData.itemName} onChange={(e) => setFormData({ ...formData, itemName: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.itemName ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Item Name"/>
                {formErrors.itemName && (<p className="text-red-500 text-xs mt-1">{formErrors.itemName}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Part Number *</label>
                <input type="text" value={formData.partNumber} onChange={(e) => setFormData({ ...formData, partNumber: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.partNumber ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Part Number"/>
                {formErrors.partNumber && (<p className="text-red-500 text-xs mt-1">{formErrors.partNumber}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Equipment Number *</label>
                <input type="text" value={formData.equipmentNumber} onChange={(e) => setFormData({ ...formData, equipmentNumber: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.equipmentNumber ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Equipment Number"/>
                {formErrors.equipmentNumber && (<p className="text-red-500 text-xs mt-1">{formErrors.equipmentNumber}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">True balance *</label>
                <input type="number" value={formData.trueBalance} onChange={(e) => setFormData({ ...formData, trueBalance: Number(e.target.value) || 0 })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.trueBalance ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter true balance" min="0" step="any"/>
                {formErrors.trueBalance && (<p className="text-red-500 text-xs mt-1">{formErrors.trueBalance}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Open Quantity</label>
                <input type="number" value={formData.openQuantity} onChange={(e) => setFormData({ ...formData, openQuantity: Number(e.target.value) || 0 })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.openQuantity ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Open Quantity" min="0"/>
                {formErrors.openQuantity && (<p className="text-red-500 text-xs mt-1">{formErrors.openQuantity}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Open Amount</label>
                <input type="number" value={formData.openAmount} onChange={(e) => setFormData({ ...formData, openAmount: Number(e.target.value) || 0 })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.openAmount ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Open Amount" min="0" step="0.01"/>
                {formErrors.openAmount && (<p className="text-red-500 text-xs mt-1">{formErrors.openAmount}</p>)}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Location *</label>
                <input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.location ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Location"/>
                {formErrors.location && (<p className="text-red-500 text-xs mt-1">{formErrors.location}</p>)}
              </div>
              
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-200">
              <div className="flex gap-3">
                <button onClick={() => { setShowEditModal(false); setEditingItem(null); setEditBaseline(null); }} className="flex-1 px-4 py-2 border border-[#002a6e]/20 rounded-md hover:bg-[#003594]/5" disabled={submitting}>
                  Cancel
                </button>
                <button onClick={handleEdit} disabled={submitting} className="flex-1 bg-[#003594] text-white px-4 py-2 rounded-md hover:bg-[#002a6e] transition-colors disabled:opacity-50">
                  {submitting ? 'Updating...' : 'Update'}
                </button>
              </div>
            </div>
          </div>
        </div>)}

      
      {showDeleteModal && deletingItem && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center mb-4">
              <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/>
                </svg>
              </div>
            </div>
            
            <div className="text-center mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Delete Stock Item</h3>
              <p className="text-sm text-gray-500">
                Are you sure you want to delete <span className="font-semibold text-gray-900">{deletingItem.itemName}</span> 
                with NAC Code <span className="font-semibold text-gray-900">{deletingItem.nacCode}</span>?
              </p>
              <p className="text-xs text-red-600 mt-2">
                This action cannot be undone and will permanently remove this item from the system.
              </p>
            </div>
            
            <div className="flex gap-3">
              <button onClick={() => { setShowDeleteModal(false); setDeletingItem(null); }} className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors" disabled={submitting}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={submitting} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50">
                {submitting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>)}

      {showMigrateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Reconcile inventory families</h3>
            <p className="text-sm text-gray-600 mb-4">
              Phase 1 splits multi-part stock rows into sub-codes and trims names.
              Phase 2 propagates equipment compatibility, remaps transactions, and
              reconciles balances and FIFO state. Run a dry run first to preview changes.
            </p>
            <label className="flex items-center gap-2 text-sm mb-6">
              <input
                type="checkbox"
                checked={migrateDryRun}
                onChange={(e) => setMigrateDryRun(e.target.checked)}
              />
              Dry run only (no database changes)
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowMigrateModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md"
                disabled={migrating}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleMigratePartVariants}
                disabled={migrating}
                className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50"
              >
                {migrating ? 'Running…' : migrateDryRun ? 'Run dry run' : 'Run reconciliation'}
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
    );
}
