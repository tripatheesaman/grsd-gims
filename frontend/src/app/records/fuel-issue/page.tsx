'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { Edit, Trash2, Plus, Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCustomToast } from '@/components/ui/custom-toast';
import { API } from '@/lib/api';
interface FuelIssueRecord {
    id: number;
    issue_slip_number: string;
    issue_date: string;
    nac_code: string;
    part_number: string;
    item_name: string;
    issue_quantity: number;
    issue_cost: number;
    remaining_balance: number;
    issued_for: string;
    issued_by: {
        name: string;
        staffId: string;
    };
    approval_status: string;
    fuel_type: string;
    fuel_price: number;
    kilometers: number;
    is_kilometer_reset: boolean;
    week_number: number;
    fy: string;
}
interface FuelIssueFormData {
    issue_slip_number: string;
    issue_date: string;
    nac_code: string;
    part_number: string;
    issue_quantity: number;
    issued_for: string;
    issued_by: {
        name: string;
        staffId: string;
    };
    fuel_type: string;
    fuel_price: number;
    kilometers: number;
    is_kilometer_reset: boolean;
}
interface PaginationInfo {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
interface FuelIssueFilters {
    search: string;
    fromDate: string;
    toDate: string;
    fuelType: string;
    weekNumber: string;
    equipmentNumber: string;
    issueSlipNumber: string;
}
const FuelIssueRecordsPage = () => {
    const { user, permissions } = useAuthContext();
    const hasPermission = (perm: string) => permissions.includes(perm);
    const router = useRouter();
    const { showErrorToast, showSuccessToast } = useCustomToast();
    const [records, setRecords] = useState<FuelIssueRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState<PaginationInfo>({
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0
    });
    const [search, setSearch] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [fuelType, setFuelType] = useState('');
    const [weekNumber, setWeekNumber] = useState('');
    const [equipmentNumber, setEquipmentNumber] = useState('');
    const [issueSlipNumber, setIssueSlipNumber] = useState('');
    const [sortBy, setSortBy] = useState('issue_date');
    const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingRecord, setEditingRecord] = useState<FuelIssueRecord | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
    const [formData, setFormData] = useState<FuelIssueFormData>({
        issue_slip_number: '',
        issue_date: '',
        nac_code: '',
        part_number: '',
        issue_quantity: 0,
        issued_for: '',
        issued_by: { name: '', staffId: '' },
        fuel_type: '',
        fuel_price: 0,
        kilometers: 0,
        is_kilometer_reset: false
    });
    const [fuelTypes, setFuelTypes] = useState<string[]>([]);
    const [nacCodes, setNacCodes] = useState<string[]>([]);
    const [appliedFilters, setAppliedFilters] = useState<FuelIssueFilters>({
        search: '',
        fromDate: '',
        toDate: '',
        fuelType: '',
        weekNumber: '',
        equipmentNumber: '',
        issueSlipNumber: ''
    });
    const latestRequestRef = useRef<number>(0);
    useEffect(() => {
        if (!user) {
            router.push('/login');
            return;
        }
        if (!permissions.includes('can_access_fuel_issue_records')) {
            router.push('/unauthorized');
            return;
        }
    }, [user, permissions, router]);
    const pageRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                const target = e.target as HTMLElement | null;
                if (target && pageRef.current && pageRef.current.contains(target)) {
                    const tag = target.tagName.toLowerCase();
                    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                }
            }
        };
        window.addEventListener('keydown', handler, true);
        return () => window.removeEventListener('keydown', handler, true);
    }, []);
    useEffect(() => {
        const submitGuard = (e: Event) => {
            const target = e.target as Node | null;
            if (target && pageRef.current && pageRef.current.contains(target)) {
                e.preventDefault();
                e.stopPropagation();
            }
        };
        window.addEventListener('submit', submitGuard, true);
        return () => window.removeEventListener('submit', submitGuard, true);
    }, []);
    useEffect(() => {
        const el = pageRef.current;
        if (!el)
            return;
        const onSubmit = (e: Event) => {
            e.preventDefault();
        };
        el.addEventListener('submit', onSubmit, true);
        return () => el.removeEventListener('submit', onSubmit, true);
    }, []);
    const fetchData = useCallback(async (isInitial = false) => {
        const requestId = latestRequestRef.current + 1;
        latestRequestRef.current = requestId;
        try {
            if (isInitial) {
                setLoading(true);
            }
            const params = new URLSearchParams({
                page: String(pagination.page),
                limit: String(pagination.limit),
                sortBy,
                sortOrder,
                search: appliedFilters.search,
                fromDate: appliedFilters.fromDate,
                toDate: appliedFilters.toDate,
                fuelType: appliedFilters.fuelType,
                weekNumber: appliedFilters.weekNumber,
                equipmentNumber: appliedFilters.equipmentNumber,
                issueSlipNumber: appliedFilters.issueSlipNumber
            });
            const { data } = await API.get(`/api/fuel-issue-records?${params.toString()}`);
            if (requestId !== latestRequestRef.current) {
                return;
            }
            setRecords(data.records || []);
            setPagination((prevPagination) => ({
                ...prevPagination,
                ...(data.pagination || {})
            }));
        }
        catch {
            if (requestId !== latestRequestRef.current) {
                return;
            }
            showErrorToast({ title: 'Error', message: 'Failed to fetch fuel issue records' });
            if (isInitial) {
                setLoading(false);
            }
        }
        finally {
            if (isInitial && requestId === latestRequestRef.current) {
                setLoading(false);
            }
        }
    }, [pagination.page, pagination.limit, sortBy, sortOrder, appliedFilters, showErrorToast]);
    const fetchFilterOptions = useCallback(async () => {
        try {
            const [{ data: fuelData }, { data: nacData }] = await Promise.all([
                API.get('/api/fuel-issue-records/filters/fuel-types'),
                API.get('/api/fuel-issue-records/filters/nac-codes')
            ]);
            setFuelTypes(fuelData.fuelTypes || []);
            setNacCodes(nacData.nacCodes || []);
        }
        catch {
        }
    }, []);
    useEffect(() => {
        fetchData(true);
        fetchFilterOptions();
    }, [fetchData, fetchFilterOptions]);
    const applyFilters = useCallback(() => {
        setPagination(prev => ({ ...prev, page: 1 }));
        setAppliedFilters({
            search,
            fromDate,
            toDate,
            fuelType,
            weekNumber,
            equipmentNumber,
            issueSlipNumber
        });
    }, [search, fromDate, toDate, fuelType, weekNumber, equipmentNumber, issueSlipNumber]);
    const setCurrentPage = (page: number) => {
        setPagination(prev => ({ ...prev, page }));
    };
    const setCurrentLimit = (limit: number) => {
        setPagination(prev => ({ ...prev, limit, page: 1 }));
    };
    const openAddModal = () => {
        setFormData({
            issue_slip_number: '',
            issue_date: new Date().toISOString().split('T')[0],
            nac_code: '',
            part_number: '',
            issue_quantity: 0,
            issued_for: '',
            issued_by: { name: user?.UserInfo.name || '', staffId: user?.UserInfo.username || '' },
            fuel_type: '',
            fuel_price: 0,
            kilometers: 0,
            is_kilometer_reset: false
        });
        setShowAddModal(true);
    };
    const openEditModal = (record: FuelIssueRecord) => {
        setEditingRecord(record);
        const normalizedDate = record.issue_date.includes('T')
            ? record.issue_date.split('T')[0]
            : record.issue_date;
        setFormData({
            issue_slip_number: record.issue_slip_number,
            issue_date: normalizedDate,
            nac_code: record.nac_code,
            part_number: record.part_number,
            issue_quantity: record.issue_quantity,
            issued_for: record.issued_for,
            issued_by: record.issued_by,
            fuel_type: record.fuel_type,
            fuel_price: record.fuel_price,
            kilometers: record.kilometers,
            is_kilometer_reset: record.is_kilometer_reset
        });
        setShowEditModal(true);
    };
    const closeModals = () => {
        setShowAddModal(false);
        setShowEditModal(false);
        setEditingRecord(null);
    };
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        if (name === 'issued_by.name' || name === 'issued_by.staffId') {
            setFormData(prev => ({
                ...prev,
                issued_by: {
                    ...prev.issued_by,
                    [name.split('.')[1]]: value
                }
            }));
        }
        else if (name === 'is_kilometer_reset') {
            setFormData(prev => ({
                ...prev,
                [name]: (e.target as HTMLInputElement).checked
            }));
        }
        else {
            setFormData(prev => ({
                ...prev,
                [name]: type === 'number' ? parseFloat(value) || 0 : value
            }));
        }
    };
    const handleAdd = async () => {
        if (!hasPermission('can_add_fuel_issue_item')) {
            showErrorToast({ title: 'Error', message: 'You do not have permission to add fuel issue items' });
            return;
        }
        try {
            await API.post('/api/fuel-issue-records', formData);
            showSuccessToast({ title: 'Success', message: 'Fuel issue record created successfully' });
            closeModals();
            fetchData();
        }
        catch (error) {
            showErrorToast({ title: 'Error', message: error instanceof Error ? error.message : 'Failed to create fuel issue record' });
        }
    };
    const handleEdit = async () => {
        if (!hasPermission('can_edit_fuel_issue_item')) {
            showErrorToast({ title: 'Error', message: 'You do not have permission to edit fuel issue items' });
            return;
        }
        if (!editingRecord)
            return;
        try {
            await API.put(`/api/fuel-issue-records/${editingRecord.id}`, formData);
            showSuccessToast({ title: 'Success', message: 'Fuel issue record updated successfully' });
            closeModals();
            fetchData();
        }
        catch (error) {
            showErrorToast({ title: 'Error', message: error instanceof Error ? error.message : 'Failed to update fuel issue record' });
        }
    };
    const confirmDelete = async () => {
        if (!hasPermission('can_delete_fuel_issue_item')) {
            showErrorToast({ title: 'Error', message: 'You do not have permission to delete fuel issue items' });
            return;
        }
        if (confirmDeleteId === null)
            return;
        try {
            await API.delete(`/api/fuel-issue-records/${confirmDeleteId}`);
            showSuccessToast({ title: 'Success', message: 'Fuel issue record deleted successfully' });
            setConfirmDeleteId(null);
            fetchData();
        }
        catch (error) {
            showErrorToast({ title: 'Error', message: error instanceof Error ? error.message : 'Failed to delete fuel issue record' });
        }
    };
    const clearFilters = () => {
        setSearch('');
        setFromDate('');
        setToDate('');
        setFuelType('');
        setWeekNumber('');
        setEquipmentNumber('');
        setIssueSlipNumber('');
        setAppliedFilters({
            search: '',
            fromDate: '',
            toDate: '',
            fuelType: '',
            weekNumber: '',
            equipmentNumber: '',
            issueSlipNumber: ''
        });
        setPagination(prev => ({ ...prev, page: 1 }));
    };
    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString();
    };
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'NPR',
            maximumFractionDigits: 2
        }).format(amount);
    };
    if (!user || !permissions.includes('can_access_fuel_issue_records')) {
        return null;
    }
    if (loading) {
        return (<div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading fuel issue records...</p>
        </div>
      </div>);
    }
    return (<div ref={pageRef} className="min-h-screen bg-gray-50" onKeyDownCapture={(e) => {
            if ((e as unknown as KeyboardEvent).key === 'Enter')
                e.preventDefault();
        }} onSubmitCapture={(e) => {
            e.preventDefault();
            e.stopPropagation();
        }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Fuel Issue Records</h1>
          <p className="mt-2 text-gray-600">Manage fuel issue records for diesel and petrol</p>
        </div>

        
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
            
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4"/>
                <input type="text" placeholder="Search all fields..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter')
        e.preventDefault(); }} autoComplete="off" className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
              </div>
            </div>

            
            {hasPermission('can_add_fuel_issue_item') && (<button type="button" onClick={openAddModal} className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors">
                <Plus className="h-4 w-4 mr-2"/>
                Add Fuel Issue
              </button>)}
          </div>

          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fuel Type</label>
              <select value={fuelType} onChange={(e) => setFuelType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                <option value="">All Fuel Types</option>
                {fuelTypes.map(type => (<option key={type} value={type}>{type}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Week Number</label>
              <input type="number" value={weekNumber} onChange={(e) => setWeekNumber(e.target.value)} min="1" max="53" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="e.g., 12"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Equipment Number</label>
              <input type="text" value={equipmentNumber} onChange={(e) => setEquipmentNumber(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="e.g., EXC-01"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Issue Slip Number</label>
              <input type="text" value={issueSlipNumber} onChange={(e) => setIssueSlipNumber(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="e.g., 2079-12-123"/>
            </div>
          </div>

          
          <div className="mt-4 flex items-center justify-end space-x-3">
            <button type="button" onClick={applyFilters} className="inline-flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors text-sm">
              Apply Filters
            </button>
            <button type="button" onClick={clearFilters} className="text-sm text-gray-600 hover:text-gray-800 underline">
              Clear all filters
            </button>
          </div>
        </div>

        
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button type="button" onClick={() => {
            setSortBy('issue_date');
            setSortOrder(sortBy === 'issue_date' && sortOrder === 'DESC' ? 'ASC' : 'DESC');
        }} className="flex items-center space-x-1 hover:text-gray-700">
                      <span>Issue Date</span>
                      <Filter className="h-3 w-3"/>
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Issue Slip
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    NAC Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Item Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fuel Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quantity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Kilometers
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Issued For
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {records.map((record) => (<tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(record.issue_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {record.issue_slip_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {record.nac_code}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {record.item_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${record.fuel_type === 'Diesel'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-green-100 text-green-800'}`}>
                        {record.fuel_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {record.issue_quantity}L
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(record.fuel_price)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {record.kilometers.toLocaleString()} km
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {record.issued_for}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${record.approval_status === 'APPROVED'
                ? 'bg-green-100 text-green-800'
                : record.approval_status === 'REJECTED'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-yellow-100 text-yellow-800'}`}>
                        {record.approval_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        {hasPermission('can_edit_fuel_issue_item') && (<button type="button" onClick={() => openEditModal(record)} className="text-blue-600 hover:text-blue-900">
                            <Edit className="h-4 w-4"/>
                          </button>)}
                        {hasPermission('can_delete_fuel_issue_item') && (<button type="button" onClick={() => setConfirmDeleteId(record.id)} className="text-red-600 hover:text-red-900">
                            <Trash2 className="h-4 w-4"/>
                          </button>)}
                      </div>
                    </td>
                  </tr>))}
              </tbody>
            </table>
          </div>

          
          {records.length === 0 && (<div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <Filter className="h-12 w-12 mx-auto"/>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No fuel issue records found</h3>
              <p className="text-gray-500">Try adjusting your search or filter criteria.</p>
            </div>)}
        </div>

        
        {pagination.totalPages > 1 && (<div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6 mt-6 rounded-lg shadow-sm">
            <div className="flex-1 flex justify-between sm:hidden">
              <button onClick={() => setCurrentPage(Math.max(1, pagination.page - 1))} disabled={pagination.page === 1} className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                Previous
              </button>
              <button onClick={() => setCurrentPage(Math.min(pagination.totalPages, pagination.page + 1))} disabled={pagination.page === pagination.totalPages} className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing{' '}
                  <span className="font-medium">
                    {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)}
                  </span>{' '}
                  to{' '}
                  <span className="font-medium">
                    {Math.min(pagination.page * pagination.limit, pagination.total)}
                  </span>{' '}
                  of <span className="font-medium">{pagination.total}</span> results
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <select value={pagination.limit} onChange={(e) => setCurrentLimit(parseInt(e.target.value))} className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  <option value={10}>10 per page</option>
                  <option value={25}>25 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                </select>
                <div className="flex space-x-1">
                  <button onClick={() => setCurrentPage(Math.max(1, pagination.page - 1))} disabled={pagination.page === 1} className="p-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                    <ChevronLeft className="h-4 w-4"/>
                  </button>
                  <button onClick={() => setCurrentPage(Math.min(pagination.totalPages, pagination.page + 1))} disabled={pagination.page === pagination.totalPages} className="p-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                    <ChevronRight className="h-4 w-4"/>
                  </button>
                </div>
              </div>
            </div>
          </div>)}
      </div>

      
      {showAddModal && (<div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Add Fuel Issue Record</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Issue Date</label>
                  <input type="date" name="issue_date" value={formData.issue_date} onChange={handleInputChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">NAC Code</label>
                  <select name="nac_code" value={formData.nac_code} onChange={handleInputChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    <option value="">Select NAC Code</option>
                    {nacCodes.map(code => (<option key={code} value={code}>{code}</option>))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fuel Type</label>
                  <select name="fuel_type" value={formData.fuel_type} onChange={handleInputChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    <option value="">Select Fuel Type</option>
                    {fuelTypes.map(type => (<option key={type} value={type}>{type}</option>))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity (Liters)</label>
                  <input type="number" name="issue_quantity" value={formData.issue_quantity} onChange={handleInputChange} required min="0" step="0.01" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fuel Price</label>
                  <input type="number" name="fuel_price" value={formData.fuel_price} onChange={handleInputChange} required min="0" step="0.01" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kilometers</label>
                  <input type="number" name="kilometers" value={formData.kilometers} onChange={handleInputChange} required min="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Issued For (Equipment)</label>
                  <input type="text" name="issued_for" value={formData.issued_for} onChange={handleInputChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Issued By Name</label>
                  <input type="text" name="issued_by.name" value={formData.issued_by.name} onChange={handleInputChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Issued By Staff ID</label>
                  <input type="text" name="issued_by.staffId" value={formData.issued_by.staffId} onChange={handleInputChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
                </div>

                <div className="flex items-center">
                  <input type="checkbox" name="is_kilometer_reset" checked={formData.is_kilometer_reset} onChange={handleInputChange} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"/>
                  <label className="ml-2 block text-sm text-gray-700">
                    Kilometer Reset
                  </label>
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button type="button" onClick={closeModals} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2">
                    Cancel
                  </button>
                  <button type="button" onClick={handleAdd} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                    Add Record
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>)}

      
      {showEditModal && editingRecord && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-lg">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Edit Fuel Issue Record</h3>
              <p className="text-sm text-gray-500 mt-1">Update details. Date change will auto-adjust slip number.</p>
            </div>
            <div className="px-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Issue Date</label>
                  <input type="date" name="issue_date" value={formData.issue_date} onChange={handleInputChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
                </div>
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">NAC Code</label>
                  <select name="nac_code" value={formData.nac_code} onChange={handleInputChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    <option value="">Select NAC Code</option>
                    {nacCodes.map(code => (<option key={code} value={code}>{code}</option>))}
                  </select>
                </div>
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fuel Type</label>
                  <select name="fuel_type" value={formData.fuel_type} onChange={handleInputChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    <option value="">Select Fuel Type</option>
                    {fuelTypes.map(type => (<option key={type} value={type}>{type}</option>))}
                  </select>
                </div>
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity (Liters)</label>
                  <input type="number" name="issue_quantity" value={formData.issue_quantity} onChange={handleInputChange} required min="0" step="0.01" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
                </div>
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fuel Price</label>
                  <input type="number" name="fuel_price" value={formData.fuel_price} onChange={handleInputChange} required min="0" step="0.01" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
                </div>
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kilometers</label>
                  <input type="number" name="kilometers" value={formData.kilometers} onChange={handleInputChange} required min="0" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
                </div>
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Issued For (Equipment)</label>
                  <input type="text" name="issued_for" value={formData.issued_for} onChange={handleInputChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
                </div>
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Issued By Name</label>
                  <input type="text" name="issued_by.name" value={formData.issued_by.name} onChange={handleInputChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
                </div>
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Issued By Staff ID</label>
                  <input type="text" name="issued_by.staffId" value={formData.issued_by.staffId} onChange={handleInputChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
                </div>
                <div className="col-span-1 flex items-center pt-6">
                  <input type="checkbox" name="is_kilometer_reset" checked={formData.is_kilometer_reset} onChange={handleInputChange} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"/>
                  <label className="ml-2 block text-sm text-gray-700">Kilometer Reset</label>
                </div>
              </div>
              <div className="flex justify-end space-x-3 pt-6 border-t mt-6">
                <button type="button" onClick={closeModals} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2">
                  Cancel
                </button>
                <button type="button" onClick={handleEdit} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                  Update Record
                </button>
              </div>
            </div>
          </div>
        </div>)}
      
      {confirmDeleteId !== null && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white shadow-lg">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Delete Fuel Issue Record</h3>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-700">Are you sure you want to delete this fuel issue record? This action cannot be undone.</p>
            </div>
            <div className="px-6 py-4 border-t flex justify-end space-x-3">
              <button type="button" onClick={() => setConfirmDeleteId(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2">
                Cancel
              </button>
              <button type="button" onClick={confirmDelete} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2">
                Delete
              </button>
            </div>
          </div>
        </div>)}
    </div>);
};
export default FuelIssueRecordsPage;
