'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RequestCartItem } from '@/types/request';
import { Trash2, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PartNumberSelect } from './PartNumberSelect';
import { EquipmentRangeSelect } from './EquipmentRangeSelect';
import Image from 'next/image';
import { useAuthContext } from '@/context/AuthContext';
import { useRequestingAuthorities } from '@/app/request/useRequestingAuthorities';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
interface RequestCartProps {
    items: RequestCartItem[];
    onUpdateItem: (itemId: string, updates: Partial<RequestCartItem>) => void;
    onDeleteItem: (itemId: string) => void;
    onSubmit: () => void;
    isSubmitDisabled: boolean;
    isSubmitting: boolean;
    remarks: string;
    onRemarksChange: (remarks: string) => void;
}
export function RequestCart({ items, onUpdateItem, onDeleteItem, onSubmit, isSubmitDisabled, isSubmitting, remarks, onRemarksChange, }: RequestCartProps) {
    const { permissions } = useAuthContext();
    const canEditUnit = permissions?.includes('can_edit_unit_during_request');
    const { data: authorityOptions } = useRequestingAuthorities();
    const [editingItem, setEditingItem] = useState<RequestCartItem | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editFormData, setEditFormData] = useState<Partial<RequestCartItem>>({});
    const handleEdit = (item: RequestCartItem) => {
        setEditingItem(item);
        setIsEditDialogOpen(true);
        setEditFormData(item);
    };
    const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editingItem)
            return;
        onUpdateItem(editingItem.id, editFormData);
        setIsEditDialogOpen(false);
        setEditingItem(null);
    };
    const handleEditImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setEditFormData(prev => ({ ...prev, image: file }));
        }
    };
    return (<div className="space-y-4">
      <h2 className="text-lg font-semibold">Request Slip</h2>
      {items.length === 0 ? (<p className="text-muted-foreground">No items in slip</p>) : (<div className="space-y-4">
          {items.map((item) => (<div key={item.id} className="flex items-start justify-between p-4 border rounded-lg">
              <div className="space-y-1">
                <p className="font-medium">{item.itemName}</p>
                <p className="text-sm text-muted-foreground">
                  NAC Code: {item.nacCode}
                </p>
                <p className="text-sm">
                  Request Quantity: {item.requestQuantity} {item.unit ? item.unit : ''}
                </p>
                {item.partNumber && (<p className="text-sm">Part Number: {item.partNumber}</p>)}
                <p className="text-sm">
                  Equipment Number: {item.equipmentNumber}
                </p>
                {item.specifications && (<p className="text-sm">
                    Specifications: {item.specifications}
                  </p>)}
                {item.image && (<div className="mt-2">
                    <Image src={URL.createObjectURL(item.image)} alt="Item" width={200} height={200} className="max-w-[200px] rounded-md" unoptimized/>
                  </div>)}
              </div>
              <div className="flex space-x-2">
                <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                  <Pencil className="h-4 w-4"/>
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onDeleteItem(item.id)}>
                  <Trash2 className="h-4 w-4"/>
                </Button>
              </div>
            </div>))}
        </div>)}

      <div className="space-y-2">
        <Label htmlFor="remarks">Remarks</Label>
        <Textarea id="remarks" value={remarks} onChange={(e) => onRemarksChange(e.target.value)} placeholder="Add any additional notes or remarks here..." className="min-h-[100px]"/>
      </div>

      <div className="flex justify-end mt-4">
        <Button onClick={onSubmit} disabled={isSubmitDisabled || isSubmitting} className="w-full sm:w-auto">
          {isSubmitting ? "Submitting..." : "Submit Request"}
        </Button>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-2xl w-[95vw] bg-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
              Edit Item Details
            </DialogTitle>
            <p className="text-sm text-gray-500 mt-1">
              Update the item details in your request
            </p>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} className="space-y-6 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="editItemName" className="text-sm font-medium text-[#003594]">Item Name</Label>
                  <Input id="editItemName" value={editFormData.itemName} onChange={(e) => setEditFormData(prev => ({ ...prev, itemName: e.target.value }))} className="mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20" readOnly/>
                </div>

                <div>
                  <Label htmlFor="editNacCode" className="text-sm font-medium text-[#003594]">NAC Code</Label>
                  <Input id="editNacCode" value={editFormData.nacCode} onChange={(e) => setEditFormData(prev => ({ ...prev, nacCode: e.target.value }))} className="mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20" readOnly/>
                </div>

                <div>
                  <Label htmlFor="editPartNumber" className="text-sm font-medium text-[#003594]">Part Number</Label>
                  <PartNumberSelect partNumberList={editingItem?.partNumber || ""} value={editFormData.partNumber || ""} onChange={(value) => setEditFormData(prev => ({ ...prev, partNumber: value }))}/>
                </div>

                <div>
                  <Label htmlFor="editEquipmentNumber" className="text-sm font-medium text-[#003594]">Equipment Number</Label>
                  <EquipmentRangeSelect equipmentList={editingItem?.equipmentNumber || ""} value={editFormData.equipmentNumber || ""} onChange={(value) => setEditFormData(prev => ({ ...prev, equipmentNumber: value }))}/>
                </div>

              <div>
                <Label htmlFor="editRequestedBy" className="text-sm font-medium text-[#003594]">Requested By</Label>
                <Select value={editFormData.requestedById?.toString() || ''} onValueChange={(value) => {
            const selected = authorityOptions?.find(a => a.id.toString() === value);
            setEditFormData(prev => ({
                ...prev,
                requestedById: selected?.id ?? null,
                requestedByEmail: selected?.email ?? null,
            }));
        }}>
                  <SelectTrigger id="editRequestedBy" className="mt-1 bg-white border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20">
                    <SelectValue placeholder="Select requesting authority"/>
                  </SelectTrigger>
                  <SelectContent>
                    {authorityOptions?.map((authority) => (<SelectItem key={authority.id} value={authority.id.toString()}>
                        {authority.name} {authority.designation ? `(${authority.designation})` : ''}
                      </SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="editRequestQuantity" className="text-sm font-medium text-[#003594]">Request Quantity</Label>
                  <Input id="editRequestQuantity" type="number" value={editFormData.requestQuantity} onChange={(e) => setEditFormData(prev => ({ ...prev, requestQuantity: Number(e.target.value) }))} className="mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20" min="1" required/>
                </div>

                <div>
                  <Label htmlFor="editUnit" className="text-sm font-medium text-[#003594]">
                    Unit
                    {!canEditUnit && <span className="text-xs text-gray-500 ml-1">(read-only)</span>}
                  </Label>
                  <Input id="editUnit" value={editFormData.unit || ''} onChange={(e) => setEditFormData(prev => ({ ...prev, unit: e.target.value }))} disabled={!canEditUnit} className={`mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20 ${!canEditUnit ? "bg-gray-50 cursor-not-allowed" : ""}`}/>
                </div>

                <div>
                  <Label htmlFor="editSpecifications" className="text-sm font-medium text-[#003594]">Specifications</Label>
                  <textarea id="editSpecifications" value={editFormData.specifications} onChange={(e) => setEditFormData(prev => ({ ...prev, specifications: e.target.value }))} className="mt-1 w-full rounded-md border border-[#002a6e]/10 bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003594] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[100px]" placeholder="Enter specifications"/>
                </div>

                <div>
                  <Label htmlFor="editImage" className="text-sm font-medium text-[#003594]">Item Image</Label>
                  <div className="mt-1">
                    <Input id="editImage" type="file" accept="image/*" onChange={handleEditImageChange} className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-[#003594] file:text-white hover:file:bg-[#d2293b] transition-colors"/>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-4 pt-4 border-t border-[#002a6e]/10">
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)} className="border-[#002a6e]/10 hover:bg-[#003594]/5 hover:text-[#003594] transition-colors">
                Cancel
              </Button>
              <Button type="submit" className="bg-[#003594] hover:bg-[#d2293b] text-white transition-colors">
                Save Changes
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>);
}
