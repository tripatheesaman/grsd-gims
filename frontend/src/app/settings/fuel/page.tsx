'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/ui/button';
import { useCustomToast } from '@/components/ui/custom-toast';
import { useState, useEffect } from 'react';
import { API } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, Plus, RotateCcw } from 'lucide-react';
interface AuthorityDetail {
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
interface EquipmentStatus {
    kilometers: number;
    is_kilometer_reset: boolean;
}
interface FuelData {
    authorityDetails: AuthorityDetail[];
    petrolList: string[];
    dieselList: string[];
    equipmentStatus: Record<string, EquipmentStatus>;
}
export default function FuelSettingsPage() {
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const [isFetching, setIsFetching] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [fuelData, setFuelData] = useState<FuelData | null>(null);
    const [newPetrol, setNewPetrol] = useState('');
    const [newDiesel, setNewDiesel] = useState('');
    useEffect(() => {
        const fetchSettings = async () => {
            setIsFetching(true);
            try {
                const response = await API.get('/api/settings/fuel');
                if (response.status === 200 && response.data) {
                    setFuelData(response.data);
                }
            }
            catch {
                showErrorToast({
                    title: 'Error',
                    message: 'Failed to fetch fuel settings',
                    duration: 3000,
                });
            }
            finally {
                setIsFetching(false);
            }
        };
        fetchSettings();
    }, [showErrorToast]);
    const handleAuthorityChange = (id: number, field: string, value: string) => {
        setFuelData((prev: FuelData | null) => {
            if (!prev)
                return prev;
            return {
                ...prev,
                authorityDetails: prev.authorityDetails.map((auth: AuthorityDetail) => auth.id === id ? { ...auth, [field]: value } : auth),
            };
        });
    };
    const handleDeleteAuthority = (id: number) => {
        setFuelData((prev: FuelData | null) => {
            if (!prev)
                return prev;
            return {
                ...prev,
                authorityDetails: prev.authorityDetails.filter((auth: AuthorityDetail) => auth.id !== id),
            };
        });
    };
    const handleAddPetrol = () => {
        if (!newPetrol.trim())
            return;
        setFuelData((prev: FuelData | null) => {
            if (!prev)
                return prev;
            return {
                ...prev,
                petrolList: [...prev.petrolList, newPetrol.trim()],
            };
        });
        setNewPetrol('');
    };
    const handleDeletePetrol = (idx: number) => {
        setFuelData((prev: FuelData | null) => {
            if (!prev)
                return prev;
            return {
                ...prev,
                petrolList: prev.petrolList.filter((_: string, i: number) => i !== idx),
            };
        });
    };
    const handleEditPetrol = (idx: number, value: string) => {
        setFuelData((prev: FuelData | null) => {
            if (!prev)
                return prev;
            return {
                ...prev,
                petrolList: prev.petrolList.map((item: string, i: number) => (i === idx ? value : item)),
            };
        });
    };
    const handleAddDiesel = () => {
        if (!newDiesel.trim())
            return;
        setFuelData((prev: FuelData | null) => {
            if (!prev)
                return prev;
            return {
                ...prev,
                dieselList: [...prev.dieselList, newDiesel.trim()],
            };
        });
        setNewDiesel('');
    };
    const handleDeleteDiesel = (idx: number) => {
        setFuelData((prev: FuelData | null) => {
            if (!prev)
                return prev;
            return {
                ...prev,
                dieselList: prev.dieselList.filter((_: string, i: number) => i !== idx),
            };
        });
    };
    const handleEditDiesel = (idx: number, value: string) => {
        setFuelData((prev: FuelData | null) => {
            if (!prev)
                return prev;
            return {
                ...prev,
                dieselList: prev.dieselList.map((item: string, i: number) => (i === idx ? value : item)),
            };
        });
    };
    const handleResetKilometers = (equip: string) => {
        setFuelData((prev: FuelData | null) => {
            if (!prev)
                return prev;
            return {
                ...prev,
                equipmentStatus: {
                    ...prev.equipmentStatus,
                    [equip]: {
                        ...prev.equipmentStatus[equip],
                        kilometers: 0,
                        is_kilometer_reset: true,
                    },
                },
            };
        });
    };
    const handleSave = async () => {
        setIsSaving(true);
        try {
            const response = await API.put('/api/settings/fuel', fuelData);
            if (response.status === 200) {
                showSuccessToast({
                    title: 'Success',
                    message: 'Fuel settings saved successfully',
                    duration: 3000,
                });
            }
        }
        catch {
            showErrorToast({
                title: 'Error',
                message: 'Failed to save fuel settings',
                duration: 3000,
            });
        }
        finally {
            setIsSaving(false);
        }
    };
    if (!fuelData || isFetching) {
        return <div className="flex items-center justify-center min-h-[200px]">Loading...</div>;
    }
    return (<div className="space-y-6">
      
      <Card>
        <CardHeader>
          <CardTitle>Fuel Authority Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {fuelData.authorityDetails.map((auth: AuthorityDetail, index: number) => (<div key={auth.id} className="p-4 border rounded-lg space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Authority Set {index + 1}</h3>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteAuthority(auth.id)} className="text-red-500 hover:bg-red-100">
                    <Trash2 className="w-4 h-4"/>
                  </Button>
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
              <Button onClick={handleSave} disabled={isSaving} className="bg-[#003594] text-white hover:bg-[#002a6e]">
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      
      <Card>
        <CardHeader>
          <CardTitle>Supplier Management</CardTitle>
        </CardHeader>
        <CardContent>
          
          <div>
            <h2 className="text-lg font-semibold text-[#003594] mb-2">Petrol Equipment List</h2>
            <div className="flex gap-2 mb-2">
              <Input value={newPetrol} onChange={e => setNewPetrol(e.target.value)} placeholder="Add new petrol equipment" className="w-64"/>
              <Button onClick={handleAddPetrol} variant="outline" className="border-[#003594] text-[#003594]">
                <Plus className="w-4 h-4 mr-1"/> Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {fuelData.petrolList.map((equip: string, idx: number) => (<div key={equip} className="flex items-center gap-1 bg-gray-100 rounded px-2 py-1">
                  <Input className="w-24 text-xs" value={equip} onChange={e => handleEditPetrol(idx, e.target.value)}/>
                  <Button variant="ghost" size="icon" onClick={() => handleDeletePetrol(idx)} className="text-red-500">
                    <Trash2 className="w-4 h-4"/>
                  </Button>
                </div>))}
            </div>
          </div>

          
          <div>
            <h2 className="text-lg font-semibold text-[#003594] mb-2">Diesel Equipment List</h2>
            <div className="flex gap-2 mb-2">
              <Input value={newDiesel} onChange={e => setNewDiesel(e.target.value)} placeholder="Add new diesel equipment" className="w-64"/>
              <Button onClick={handleAddDiesel} variant="outline" className="border-[#003594] text-[#003594]">
                <Plus className="w-4 h-4 mr-1"/> Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {fuelData.dieselList.map((equip: string, idx: number) => (<div key={equip} className="flex items-center gap-1 bg-gray-100 rounded px-2 py-1">
                  <Input className="w-24 text-xs" value={equip} onChange={e => handleEditDiesel(idx, e.target.value)}/>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteDiesel(idx)} className="text-red-500">
                    <Trash2 className="w-4 h-4"/>
                  </Button>
                </div>))}
            </div>
          </div>

          
          <div>
            <h2 className="text-lg font-semibold text-[#003594] mb-2">Reset Kilometers</h2>
            <div className="flex flex-wrap gap-2">
              {Object.entries(fuelData.equipmentStatus)
            .filter(([, status]: [
            string,
            EquipmentStatus
        ]) => status.is_kilometer_reset === false)
            .map(([equip]) => (<div key={equip} className="flex items-center gap-2 bg-gray-50 border rounded px-2 py-1 mb-2">
                    <span className="font-mono text-xs text-[#003594]">{equip}</span>
                    <Button size="sm" variant="outline" className="border-[#d2293b] text-[#d2293b] px-2 py-1 text-xs" onClick={() => handleResetKilometers(equip)}>
                      <RotateCcw className="w-3 h-3 mr-1"/> Reset
                    </Button>
                  </div>))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>);
}
