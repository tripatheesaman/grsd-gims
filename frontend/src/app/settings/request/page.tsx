'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/ui/button';
import { useCustomToast } from '@/components/ui/custom-toast';
import { useAuthContext } from '@/context/AuthContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { API } from '@/lib/api';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Pencil, Loader2 } from 'lucide-react';
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
interface NacUnit {
    id: number;
    nac_code: string;
    unit: string;
    is_default: number;
    item_name?: string;
}
interface NacCodeOption {
    nacCode: string;
    itemName: string;
}
export default function RequestSettingsPage() {
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const { permissions } = useAuthContext();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState<AuthorityDetails[]>([]);
    const [nacUnits, setNacUnits] = useState<NacUnit[]>([]);
    const [isLoadingUnits, setIsLoadingUnits] = useState(false);
    const [unitsSearchTerm, setUnitsSearchTerm] = useState('');
    const [debouncedUnitsSearch, setDebouncedUnitsSearch] = useState('');
    const [onlyDefaultUnits, setOnlyDefaultUnits] = useState(false);
    const [unitsCurrentPage, setUnitsCurrentPage] = useState(1);
    const [unitsPageSize] = useState(20);
    const [unitsTotalPages, setUnitsTotalPages] = useState(1);
    const [unitsTotalCount, setUnitsTotalCount] = useState(0);
    const [isUnitDialogOpen, setIsUnitDialogOpen] = useState(false);
    const [editingUnit, setEditingUnit] = useState<NacUnit | null>(null);
    const [unitFormData, setUnitFormData] = useState({
        nacCode: '',
        unit: '',
        isDefault: false
    });
    const [nacCodeSearchResults, setNacCodeSearchResults] = useState<NacCodeOption[]>([]);
    const [isSearchingNacCodes, setIsSearchingNacCodes] = useState(false);
    const [nacCodeSearchTerm, setNacCodeSearchTerm] = useState('');
    const [selectedNacCodeInfo, setSelectedNacCodeInfo] = useState<NacCodeOption | null>(null);
    useEffect(() => {
        const fetchAuthorityDetails = async () => {
            try {
                const response = await API.get('/api/settings/request/authority-details');
                if (response.status === 200) {
                    setFormData(response.data);
                }
            }
            catch {
                showErrorToast({
                    title: "Error",
                    message: "Failed to fetch authority details",
                    duration: 3000,
                });
            }
            finally {
                setIsLoading(false);
            }
        };
        fetchAuthorityDetails();
    }, [showErrorToast]);
    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebouncedUnitsSearch(unitsSearchTerm.trim());
            setUnitsCurrentPage(1);
        }, 500);
        return () => {
            window.clearTimeout(timer);
        };
    }, [unitsSearchTerm]);
    useEffect(() => {
        const fetchUnits = async () => {
            setIsLoadingUnits(true);
            try {
                const unitsRes = await API.get('/api/nac-units', {
                    params: {
                        search: debouncedUnitsSearch || undefined,
                        onlyDefault: onlyDefaultUnits || undefined,
                        page: unitsCurrentPage,
                        pageSize: unitsPageSize,
                    },
                });
                if (unitsRes.status === 200) {
                    setNacUnits(unitsRes.data.data || []);
                    if (unitsRes.data.pagination) {
                        setUnitsTotalPages(unitsRes.data.pagination.totalPages || 1);
                        setUnitsTotalCount(unitsRes.data.pagination.totalCount || 0);
                    }
                    else {
                        setUnitsTotalPages(1);
                        setUnitsTotalCount(unitsRes.data.data?.length || 0);
                    }
                }
            }
            catch {
                showErrorToast({
                    title: "Error",
                    message: "Failed to fetch NAC units data",
                    duration: 3000,
                });
            }
            finally {
                setIsLoadingUnits(false);
            }
        };
        fetchUnits();
    }, [debouncedUnitsSearch, onlyDefaultUnits, unitsCurrentPage, unitsPageSize, showErrorToast]);
    const nacSearchAbortRef = useRef<AbortController | null>(null);
    const nacSearchTimeoutRef = useRef<number | null>(null);
    const handleSearchTermChange = useCallback((value: string) => {
        setNacCodeSearchTerm(value);
        if (nacSearchTimeoutRef.current !== null) {
            window.clearTimeout(nacSearchTimeoutRef.current);
            nacSearchTimeoutRef.current = null;
        }
        const trimmed = value.trim();
        if (trimmed.length < 2) {
            setNacCodeSearchResults([]);
            setIsSearchingNacCodes(false);
            return;
        }
        nacSearchTimeoutRef.current = window.setTimeout(async () => {
            if (nacSearchAbortRef.current) {
                nacSearchAbortRef.current.abort();
            }
            const controller = new AbortController();
            nacSearchAbortRef.current = controller;
            setIsSearchingNacCodes(true);
            try {
                const response = await API.get('/api/nac-units/nac-codes/search', {
                    params: {
                        search: trimmed,
                        page: 1,
                        pageSize: 50,
                    },
                    signal: controller.signal,
                });
                if (!controller.signal.aborted && response.status === 200) {
                    setNacCodeSearchResults(response.data.data || []);
                }
            }
            catch (error: unknown) {
                const err = error as {
                    name?: string;
                    code?: string;
                };
                if (err?.name === 'AbortError' ||
                    err?.name === 'CanceledError' ||
                    err?.code === 'ERR_CANCELED') {
                    return;
                }
                setNacCodeSearchResults([]);
            }
            finally {
                if (!controller.signal.aborted) {
                    setIsSearchingNacCodes(false);
                }
            }
        }, 600);
    }, []);
    useEffect(() => {
        return () => {
            if (nacSearchTimeoutRef.current !== null) {
                window.clearTimeout(nacSearchTimeoutRef.current);
            }
            if (nacSearchAbortRef.current) {
                nacSearchAbortRef.current.abort();
            }
        };
    }, []);
    const handleSave = async () => {
        if (!permissions?.includes('can_edit_request_authority_details')) {
            showErrorToast({
                title: "Access Denied",
                message: "You don't have permission to edit authority details",
                duration: 3000,
            });
            return;
        }
        try {
            setIsSaving(true);
            const response = await API.put('/api/settings/request/authority-details', {
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
    if (isLoading) {
        return (<div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003594]"></div>
      </div>);
    }
    const handleOpenUnitDialog = (unit?: NacUnit) => {
        if (unit) {
            setEditingUnit(unit);
            setUnitFormData({
                nacCode: unit.nac_code,
                unit: unit.unit,
                isDefault: unit.is_default === 1
            });
            setSelectedNacCodeInfo({
                nacCode: unit.nac_code,
                itemName: unit.item_name || ''
            });
        }
        else {
            setEditingUnit(null);
            setUnitFormData({
                nacCode: '',
                unit: '',
                isDefault: false
            });
            setSelectedNacCodeInfo(null);
        }
        setNacCodeSearchTerm('');
        setNacCodeSearchResults([]);
        setIsUnitDialogOpen(true);
    };
    const handleCloseUnitDialog = () => {
        setIsUnitDialogOpen(false);
        setEditingUnit(null);
        setUnitFormData({
            nacCode: '',
            unit: '',
            isDefault: false
        });
        setSelectedNacCodeInfo(null);
        setNacCodeSearchTerm('');
        setNacCodeSearchResults([]);
        setIsSearchingNacCodes(false);
    };
    const handleSaveUnit = async () => {
        if (!unitFormData.nacCode || !unitFormData.unit.trim()) {
            showErrorToast({
                title: "Validation Error",
                message: "Please select NAC code and enter unit",
                duration: 3000,
            });
            return;
        }
        try {
            if (editingUnit) {
                await API.put(`/api/nac-units/${editingUnit.id}`, {
                    unit: unitFormData.unit.trim(),
                    isDefault: unitFormData.isDefault
                });
                showSuccessToast({
                    title: "Success",
                    message: "Unit updated successfully",
                    duration: 3000,
                });
            }
            else {
                await API.post('/api/nac-units', {
                    nacCode: unitFormData.nacCode,
                    unit: unitFormData.unit.trim(),
                    isDefault: unitFormData.isDefault
                });
                showSuccessToast({
                    title: "Success",
                    message: "Unit added successfully",
                    duration: 3000,
                });
            }
            const unitsRes = await API.get('/api/nac-units', {
                params: {
                    search: debouncedUnitsSearch || undefined,
                    onlyDefault: onlyDefaultUnits || undefined,
                    page: unitsCurrentPage,
                    pageSize: unitsPageSize,
                },
            });
            if (unitsRes.status === 200) {
                setNacUnits(unitsRes.data.data || []);
                if (unitsRes.data.pagination) {
                    setUnitsTotalPages(unitsRes.data.pagination.totalPages || 1);
                    setUnitsTotalCount(unitsRes.data.pagination.totalCount || 0);
                }
            }
            handleCloseUnitDialog();
        }
        catch (error: unknown) {
            const err = error as {
                response?: {
                    data?: {
                        message?: string;
                    };
                };
            };
            showErrorToast({
                title: "Error",
                message: err?.response?.data?.message || 'Failed to save unit',
                duration: 3000,
            });
        }
    };
    const handleDeleteUnit = async (id: number) => {
        if (!confirm('Are you sure you want to delete this unit?')) {
            return;
        }
        try {
            await API.delete(`/api/nac-units/${id}`);
            showSuccessToast({
                title: "Success",
                message: "Unit deleted successfully",
                duration: 3000,
            });
            const unitsRes = await API.get('/api/nac-units', {
                params: {
                    search: debouncedUnitsSearch || undefined,
                    onlyDefault: onlyDefaultUnits || undefined,
                    page: unitsCurrentPage,
                    pageSize: unitsPageSize,
                },
            });
            if (unitsRes.status === 200) {
                setNacUnits(unitsRes.data.data || []);
                if (unitsRes.data.pagination) {
                    setUnitsTotalPages(unitsRes.data.pagination.totalPages || 1);
                    setUnitsTotalCount(unitsRes.data.pagination.totalCount || 0);
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
            showErrorToast({
                title: "Error",
                message: err?.response?.data?.message || 'Failed to delete unit',
                duration: 3000,
            });
        }
    };
    const unitsByNac = nacUnits.reduce((acc: Record<string, NacUnit[]>, unit) => {
        if (!acc[unit.nac_code]) {
            acc[unit.nac_code] = [];
        }
        acc[unit.nac_code].push(unit);
        return acc;
    }, {});
    return (<div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Request Authority Settings</CardTitle>
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
              <Button onClick={handleSave} disabled={isSaving || !permissions?.includes('can_edit_request_authority_details')} className="bg-[#003594] text-white hover:bg-[#002a6e]">
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <CardTitle>NAC Code Units Management</CardTitle>
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="flex items-center gap-2">
                <Input placeholder="Search by NAC code, item name, or unit..." value={unitsSearchTerm} onChange={(e) => setUnitsSearchTerm(e.target.value)} className="w-full md:w-72 bg-white"/>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="onlyDefaultUnits" checked={onlyDefaultUnits} onCheckedChange={(checked) => {
            setOnlyDefaultUnits(checked);
            setUnitsCurrentPage(1);
        }}/>
                <Label htmlFor="onlyDefaultUnits" className="cursor-pointer">
                  Show only default units
                </Label>
              </div>
              <Button onClick={() => handleOpenUnitDialog()} className="bg-[#003594] text-white hover:bg-[#002a6e] whitespace-nowrap">
                <Plus className="h-4 w-4 mr-2"/>
                Add Unit
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingUnits ? (<div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003594]"></div>
            </div>) : Object.keys(unitsByNac).length === 0 ? (<div className="text-center py-8 text-gray-500">
              {debouncedUnitsSearch || onlyDefaultUnits
                ? 'No units found for the selected filters.'
                : 'No units configured. Click "Add Unit" to get started.'}
            </div>) : (<div className="space-y-4">
                {Object.entries(unitsByNac).map(([nacCode, units]) => {
                const unitWithItemName = units.find((u) => u.item_name);
                return (<div key={nacCode} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-semibold text-[#003594]">{nacCode}</h3>
                          {unitWithItemName?.item_name && (<p className="text-sm text-gray-600 mt-1">
                              {unitWithItemName.item_name}
                            </p>)}
                        </div>
                        <Button variant="outline" size="sm" onClick={() => {
                        setUnitFormData({
                            nacCode: nacCode,
                            unit: '',
                            isDefault: false,
                        });
                        setSelectedNacCodeInfo({
                            nacCode: nacCode,
                            itemName: unitWithItemName?.item_name || '',
                        });
                        setIsUnitDialogOpen(true);
                    }} className="text-[#003594] border-[#003594] hover:bg-[#003594]/5">
                          <Plus className="h-4 w-4 mr-1"/>
                          Add Unit
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {units.map((unit) => (<div key={unit.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{unit.unit}</span>
                              {unit.is_default === 1 && (<span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                                  Default
                                </span>)}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="sm" onClick={() => handleOpenUnitDialog(unit)} className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                                <Pencil className="h-4 w-4"/>
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteUnit(unit.id)} className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50">
                                <Trash2 className="h-4 w-4"/>
                              </Button>
                            </div>
                          </div>))}
                      </div>
                    </div>);
            })}
              </div>)}
          {Object.keys(unitsByNac).length > 0 && (<div className="flex flex-col md:flex-row items-center justify-between gap-3 border-t pt-4 mt-4">
              <div className="text-sm text-gray-600">
                Showing page <span className="font-semibold">{unitsCurrentPage}</span> of{' '}
                <span className="font-semibold">{unitsTotalPages}</span>
                {unitsTotalCount > 0 && (<>
                    {' '}(
                    <span className="font-semibold">{unitsTotalCount}</span> total units)
                  </>)}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setUnitsCurrentPage((p) => Math.max(1, p - 1))} disabled={unitsCurrentPage <= 1 || isLoadingUnits}>
                  Previous
                </Button>
                <span className="text-sm text-gray-700">
                  {unitsCurrentPage} / {unitsTotalPages}
                </span>
                <Button variant="outline" size="sm" onClick={() => setUnitsCurrentPage((p) => (p < unitsTotalPages ? p + 1 : p))} disabled={unitsCurrentPage >= unitsTotalPages || isLoadingUnits}>
                  Next
                </Button>
              </div>
            </div>)}
        </CardContent>
      </Card>

      
      <Dialog open={isUnitDialogOpen} onOpenChange={setIsUnitDialogOpen}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>
              {editingUnit ? 'Edit Unit' : 'Add Unit'}
            </DialogTitle>
            <DialogDescription>
              {editingUnit
            ? 'Update the unit for this NAC code'
            : 'Add a new unit for a NAC code'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="nacCode">NAC Code *</Label>
              <div className="mt-1 space-y-2">
                {unitFormData.nacCode || (editingUnit && selectedNacCodeInfo) ? (<p className="text-sm text-gray-700">
                    <span className="font-medium">Selected NAC:</span>{' '}
                    <span className="font-semibold">
                      {selectedNacCodeInfo?.nacCode || unitFormData.nacCode}
                    </span>
                    {selectedNacCodeInfo?.itemName && (<span className="text-gray-600">
                        {' '}
                        - {selectedNacCodeInfo.itemName}
                      </span>)}
                  </p>) : (<>
                    <Input id="nacCode" placeholder="Search NAC code or item name..." value={nacCodeSearchTerm} onChange={(e) => handleSearchTermChange(e.target.value)} disabled={!!editingUnit} className="bg-white"/>
                    {!editingUnit && (<div className="border rounded-md max-h-60 overflow-y-auto bg-white">
                        {isSearchingNacCodes ? (<div className="flex items-center justify-center py-4 text-sm text-gray-500">
                            <Loader2 className="h-4 w-4 animate-spin text-[#003594]"/>
                            <span className="ml-2">Searching...</span>
                          </div>) : nacCodeSearchTerm.trim().length < 2 ? (<div className="py-3 px-3 text-sm text-gray-500">
                            Type at least 2 characters to search...
                          </div>) : nacCodeSearchResults.length === 0 ? (<div className="py-3 px-3 text-sm text-gray-500">
                            No NAC codes found.
                          </div>) : (nacCodeSearchResults.map((nac) => (<button key={nac.nacCode} type="button" className="w-full text-left px-3 py-2 hover:bg-[#003594]/5 text-sm flex flex-col" onClick={() => {
                        setUnitFormData((prev) => ({ ...prev, nacCode: nac.nacCode }));
                        setSelectedNacCodeInfo(nac);
                        setNacCodeSearchTerm(`${nac.nacCode}${nac.itemName ? ` - ${nac.itemName}` : ''}`);
                        setNacCodeSearchResults([]);
                    }}>
                              <span className="font-medium">{nac.nacCode}</span>
                              {nac.itemName && (<span className="text-xs text-gray-500">{nac.itemName}</span>)}
                            </button>)))}
                      </div>)}
                  </>)}
              </div>
            </div>
            <div>
              <Label htmlFor="unit">Unit *</Label>
              <Input id="unit" value={unitFormData.unit} onChange={(e) => setUnitFormData({ ...unitFormData, unit: e.target.value })} placeholder="Enter unit (e.g., pcs, kg, etc.)" className="mt-1"/>
            </div>
            <div className="flex items-center space-x-2">
              <Switch id="isDefault" checked={unitFormData.isDefault} onCheckedChange={(checked) => setUnitFormData({ ...unitFormData, isDefault: checked })}/>
              <Label htmlFor="isDefault" className="cursor-pointer">
                Set as default unit for this NAC code
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseUnitDialog}>
              Cancel
            </Button>
            <Button onClick={handleSaveUnit} className="bg-[#003594] text-white hover:bg-[#002a6e]">
              {editingUnit ? 'Update' : 'Add'} Unit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>);
}
