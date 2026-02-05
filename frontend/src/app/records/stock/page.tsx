'use client';
import { useAuthContext } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { API } from '@/lib/api';
interface StockRow {
    id: number;
    nacCode: string;
    itemName: string;
    partNumber: string;
    equipmentNumber: string;
    currentBalance: number;
    openQuantity: number;
    openAmount: number;
    location: string;
    cardNumber: string;
}
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
    currentBalance: number;
    openQuantity: number;
    openAmount: number;
    location: string;
    cardNumber: string;
}
export default function StockRecordsPage() {
    const { user, permissions } = useAuthContext();
    const router = useRouter();
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
    const [pageSize] = useState<number>(20);
    const [rows, setRows] = useState<StockRow[]>([]);
    const [totalCount, setTotalCount] = useState<number>(0);
    const [totalPages, setTotalPages] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
    const [showEditModal, setShowEditModal] = useState<boolean>(false);
    const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
    const [editingItem, setEditingItem] = useState<StockRow | null>(null);
    const [deletingItem, setDeletingItem] = useState<StockRow | null>(null);
    const [formData, setFormData] = useState<StockFormData>({
        nacCode: '',
        itemName: '',
        partNumber: '',
        equipmentNumber: '',
        currentBalance: 0,
        openQuantity: 0,
        openAmount: 0,
        location: '',
        cardNumber: ''
    });
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState<boolean>(false);
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
            currentBalance: 0,
            openQuantity: 0,
            openAmount: 0,
            location: '',
            cardNumber: ''
        });
        setFormErrors({});
    };
    const validateForm = (): boolean => {
        const errors: Record<string, string> = {};
        if (!formData.nacCode.trim()) {
            errors.nacCode = 'NAC Code is required';
        }
        if (!formData.itemName.trim()) {
            errors.itemName = 'Item Name is required';
        }
        if (!formData.partNumber.trim()) {
            errors.partNumber = 'Part Number is required';
        }
        if (!formData.equipmentNumber.trim()) {
            errors.equipmentNumber = 'Equipment Number is required';
        }
        if (formData.currentBalance < 0) {
            errors.currentBalance = 'Current Balance cannot be negative';
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
        if (!formData.cardNumber.trim()) {
            errors.cardNumber = 'Card Number is required';
        }
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };
    const handleCreate = async () => {
        if (!validateForm())
            return;
        setSubmitting(true);
        try {
            await API.post('/api/stock/create', formData);
            setShowCreateModal(false);
            resetForm();
            fetchData();
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
        if (!editingItem || !validateForm())
            return;
        setSubmitting(true);
        try {
            await API.put(`/api/stock/update/${editingItem.id}`, formData);
            setShowEditModal(false);
            setEditingItem(null);
            resetForm();
            fetchData();
        }
        catch (error: unknown) {
            if (error && typeof error === 'object' && 'response' in error && error.response && typeof error.response === 'object' && 'status' in error.response && error.response.status === 409) {
                setFormErrors({ nacCode: 'NAC Code already exists' });
            }
            else {
                const errorMessage = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Unknown error';
                setError(`Failed to update item: ${errorMessage}`);
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
        setEditingItem(item);
        setFormData({
            nacCode: item.nacCode,
            itemName: item.itemName,
            partNumber: item.partNumber,
            equipmentNumber: item.equipmentNumber,
            currentBalance: Number(item.currentBalance) || 0,
            openQuantity: Number(item.openQuantity) || 0,
            openAmount: Number(item.openAmount) || 0,
            location: item.location,
            cardNumber: item.cardNumber
        });
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
    if (!canAccess)
        return null;
    return (<div className="container mx-auto p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
            Stock Records
          </h1>
          {canAdd && (<button onClick={openCreateModal} className="bg-[#003594] text-white px-4 py-2 rounded-md hover:bg-[#002a6e] transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
              </svg>
              Add New Item
            </button>)}
        </div>

        
        <div className="bg-white p-4 rounded-lg shadow-sm border border-[#002a6e]/10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input value={universal} onChange={(e) => { setPage(1); setUniversal(e.target.value); }} placeholder="Search by NAC/Name/Part/Equipment" className="border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none"/>
            <input value={equipmentNumber} onChange={(e) => { setPage(1); setEquipmentNumber(e.target.value); }} placeholder="Equipment Number" className="border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none"/>
            <input value={partNumber} onChange={(e) => { setPage(1); setPartNumber(e.target.value); }} placeholder="Part Number" className="border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none"/>
          </div>
        </div>

        
        <div className="bg-white p-4 rounded-lg shadow-sm border border-[#002a6e]/10 overflow-x-auto">
          {loading ? (<div className="text-sm text-gray-600">Loading...</div>) : error ? (<div className="text-sm text-red-600">{error}</div>) : rows.length === 0 ? (<div className="text-sm text-gray-600">No records found.</div>) : (<table className="w-full text-sm">
              <thead>
                <tr className="bg-[#003594]/5">
                  <th className="text-left p-3">NAC</th>
                  <th className="text-left p-3">Item</th>
                  <th className="text-left p-3">Part Numbers</th>
                  <th className="text-left p-3">Equipments</th>
                  <th className="text-left p-3">Balance</th>
                  <th className="text-left p-3">Open Qty</th>
                  <th className="text-left p-3">Open Amount</th>
                  <th className="text-left p-3">Location</th>
                  <th className="text-left p-3">Card</th>
                  {(canEdit || canDelete) && (<th className="text-left p-3">Actions</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (<tr key={r.id} className="border-t border-[#002a6e]/10 hover:bg-[#003594]/5">
                    <td className="p-3">{r.nacCode}</td>
                    <td className="p-3">{r.itemName}</td>
                    <td className="p-3">{r.partNumber}</td>
                    <td className="p-3">{r.equipmentNumber}</td>
                    <td className="p-3">{r.currentBalance}</td>
                    <td className="p-3">{r.openQuantity}</td>
                    <td className="p-3">{r.openAmount}</td>
                    <td className="p-3">{r.location}</td>
                    <td className="p-3">{r.cardNumber}</td>
                    {(canEdit || canDelete) && (<td className="p-3">
                        <div className="flex gap-2">
                          {canEdit && (<button onClick={() => openEditModal(r)} className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 border border-blue-300 rounded-md hover:bg-blue-200 hover:border-blue-400 transition-colors duration-200">
                              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                              </svg>
                              Edit
                            </button>)}
                          {canDelete && (<button onClick={() => openDeleteModal(r)} className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-red-700 bg-red-100 border border-red-300 rounded-md hover:bg-red-200 hover:border-red-400 transition-colors duration-200">
                              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                              </svg>
                              Delete
                            </button>)}
                        </div>
                      </td>)}
                  </tr>))}
              </tbody>
            </table>)}
        </div>

        
        <div className="flex items-center justify-between text-sm">
          <button className="px-3 py-1 rounded border border-[#002a6e]/20 hover:bg-[#003594]/5" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
            Previous
          </button>
          <div>
            Page {page} of {totalPages} ({totalCount} total records)
          </div>
          <button className="px-3 py-1 rounded border border-[#002a6e]/20 hover:bg-[#003594]/5" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            Next
          </button>
        </div>
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
                <label className="block text-sm font-medium mb-1">Current Balance *</label>
                <input type="number" value={formData.currentBalance} onChange={(e) => setFormData({ ...formData, currentBalance: Number(e.target.value) || 0 })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.currentBalance ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Current Balance" min="0"/>
                {formErrors.currentBalance && (<p className="text-red-500 text-xs mt-1">{formErrors.currentBalance}</p>)}
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
              
              <div>
                <label className="block text-sm font-medium mb-1">Card Number *</label>
                <input type="text" value={formData.cardNumber} onChange={(e) => setFormData({ ...formData, cardNumber: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.cardNumber ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Card Number"/>
                {formErrors.cardNumber && (<p className="text-red-500 text-xs mt-1">{formErrors.cardNumber}</p>)}
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
                <label className="block text-sm font-medium mb-1">Current Balance *</label>
                <input type="number" value={formData.currentBalance} onChange={(e) => setFormData({ ...formData, currentBalance: Number(e.target.value) || 0 })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.currentBalance ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Current Balance" min="0"/>
                {formErrors.currentBalance && (<p className="text-red-500 text-xs mt-1">{formErrors.currentBalance}</p>)}
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
              
              <div>
                <label className="block text-sm font-medium mb-1">Card Number *</label>
                <input type="text" value={formData.cardNumber} onChange={(e) => setFormData({ ...formData, cardNumber: e.target.value })} className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.cardNumber ? 'border-red-500' : 'border-[#002a6e]/20'} focus:border-[#003594] focus:outline-none`} placeholder="Enter Card Number"/>
                {formErrors.cardNumber && (<p className="text-red-500 text-xs mt-1">{formErrors.cardNumber}</p>)}
              </div>
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-200">
              <div className="flex gap-3">
                <button onClick={() => { setShowEditModal(false); setEditingItem(null); }} className="flex-1 px-4 py-2 border border-[#002a6e]/20 rounded-md hover:bg-[#003594]/5" disabled={submitting}>
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
    </div>);
}
