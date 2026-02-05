'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RequestCartItem } from '@/types/request';
import { format } from 'date-fns';
import { Pencil, Check, X, Trash2, Loader2 } from 'lucide-react';
import { EquipmentSelect } from '../issue/EquipmentSelect';
import { useAuthContext } from '@/context/AuthContext';
import Image from 'next/image';
interface RequestPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    onUpdateItem: (itemId: string, updates: Partial<RequestCartItem>) => void;
    onDeleteItem: (itemId: string) => void;
    items: RequestCartItem[];
    date: Date;
    requestNumber: string;
    remarks: string;
    isSubmitting: boolean;
}
interface EditableRowProps {
    item: RequestCartItem;
    onUpdate: (updates: Partial<RequestCartItem>) => void;
    onDelete: (itemId: string) => void;
}
function EditableRow({ item, onUpdate, onDelete }: EditableRowProps) {
    const { permissions } = useAuthContext();
    const canEditUnit = permissions?.includes('can_edit_unit_during_request');
    const [isEditing, setIsEditing] = useState(false);
    const [editedItem, setEditedItem] = useState(item);
    const hasPartNumber = item.partNumber && item.partNumber.trim() !== '';
    const handleSave = () => {
        onUpdate(editedItem);
        setIsEditing(false);
    };
    const handleCancel = () => {
        setEditedItem(item);
        setIsEditing(false);
    };
    if (isEditing) {
        return (<tr className="hover:bg-gray-50">
        <td className="px-4 py-2">{item.nacCode}</td>
        <td className="px-4 py-2">
          <div className="flex items-center gap-2">
          <Input value={editedItem.itemName} onChange={(e) => setEditedItem({ ...editedItem, itemName: e.target.value })} className="w-full"/>
            {editedItem.image && (<div className="relative w-12 h-12 flex-shrink-0">
                <Image src={URL.createObjectURL(editedItem.image)} alt={editedItem.itemName} fill className="object-cover rounded border border-gray-300" unoptimized/>
              </div>)}
          </div>
        </td>
        <td className="px-4 py-2">
          <EquipmentSelect equipmentList={item.equipmentNumber} value={editedItem.equipmentNumber} onChange={(value) => setEditedItem({ ...editedItem, equipmentNumber: value })}/>
        </td>
        <td className="px-4 py-2">
          <Input type="number" value={editedItem.requestQuantity.toString()} onChange={(e) => setEditedItem({ ...editedItem, requestQuantity: parseFloat(e.target.value) })} className="w-24" min={1} step="0.01"/>
        </td>
        <td className="px-4 py-2">
          <Input value={editedItem.unit || ''} onChange={(e) => setEditedItem({ ...editedItem, unit: e.target.value })} disabled={!canEditUnit} className={`w-20 ${!canEditUnit ? "bg-gray-50 cursor-not-allowed" : ""}`} placeholder="Unit"/>
        </td>
        <td className="px-4 py-2">
          {hasPartNumber ? (<EquipmentSelect equipmentList={item.partNumber || ''} value={editedItem.partNumber || ''} onChange={(value) => setEditedItem({ ...editedItem, partNumber: value })}/>) : (<Input value={editedItem.partNumber || ''} onChange={(e) => setEditedItem({ ...editedItem, partNumber: e.target.value })} placeholder="Enter part number" className="w-32"/>)}
        </td>
        <td className="px-4 py-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleSave} className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50">
              <Check className="h-4 w-4"/>
            </Button>
            <Button variant="ghost" size="icon" onClick={handleCancel} className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50">
              <X className="h-4 w-4"/>
            </Button>
          </div>
        </td>
      </tr>);
    }
    return (<tr className="hover:bg-gray-50">
      <td className="px-4 py-2">{item.nacCode}</td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <span>{item.itemName}</span>
          {item.image && (<div className="relative w-12 h-12 flex-shrink-0">
              <Image src={URL.createObjectURL(item.image)} alt={item.itemName} fill className="object-cover rounded border border-gray-300" unoptimized/>
            </div>)}
        </div>
      </td>
      <td className="px-4 py-2">{item.equipmentNumber}</td>
      <td className="px-4 py-2">{item.requestQuantity}</td>
      <td className="px-4 py-2">{item.unit || '-'}</td>
      <td className="px-4 py-2">{item.partNumber || 'NA'}</td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setIsEditing(true)} className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50">
            <Pencil className="h-4 w-4"/>
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(item.id)} className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50">
            <Trash2 className="h-4 w-4"/>
          </Button>
        </div>
      </td>
    </tr>);
}
export function RequestPreviewModal({ isOpen, onClose, onConfirm, onUpdateItem, onDeleteItem, items, date, requestNumber, remarks, isSubmitting, }: RequestPreviewModalProps) {
    return (<Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl bg-white rounded-xl shadow-sm border border-[#002a6e]/10">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
            Preview Request
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            Review your request before submitting
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-[#003594]/5 p-4 rounded-lg">
            <p className="text-sm font-medium text-[#003594]">
              Request Number: <span className="text-gray-900">{requestNumber}</span>
            </p>
            <p className="text-sm font-medium text-[#003594]">
              Request Date: <span className="text-gray-900">{format(date, 'PPP')}</span>
            </p>
            <p className="text-sm font-medium text-[#003594]">
              Total Items: <span className="text-gray-900">{items.length}</span>
            </p>
          </div>
          
          <div className="border border-[#002a6e]/10 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#003594]/5">
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider">NAC Code</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider">Item Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider">Equipment</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider">Quantity</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider">Unit</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider">Part Number</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#002a6e]/10">
                  {items.map((item) => (<EditableRow key={item.id} item={item} onUpdate={(updates) => onUpdateItem(item.id, updates)} onDelete={onDeleteItem}/>))}
                </tbody>
              </table>
            </div>
          </div>

          {remarks && (<div className="bg-gray-50 border border-[#002a6e]/10 rounded-lg p-4">
              <h3 className="text-sm font-medium text-[#003594] mb-2">Remarks</h3>
              <p className="text-sm text-gray-900">{remarks}</p>
            </div>)}

          <DialogFooter className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="border-[#002a6e]/10 hover:bg-gray-50">
              Cancel
            </Button>
            <Button type="button" onClick={onConfirm} disabled={isSubmitting} className="bg-[#003594] hover:bg-[#d2293b] text-white transition-colors">
              {isSubmitting ? (<>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                  Submitting...
                </>) : ('Submit Request')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>);
}
