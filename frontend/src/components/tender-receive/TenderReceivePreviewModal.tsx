'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TenderReceiveCartItem } from '@/types/tender-receive';
import { format } from 'date-fns';
import { Pencil, Check, X, Trash2, Loader2 } from 'lucide-react';
import { EquipmentSelect } from '../issue/EquipmentSelect';
interface RequestPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    onUpdateItem: (itemId: string, updates: Partial<TenderReceiveCartItem>) => void;
    onDeleteItem: (itemId: string) => void;
    items: TenderReceiveCartItem[];
    date: Date;
    tenderNumber: string;
    isSubmitting: boolean;
}
interface EditableRowProps {
    item: TenderReceiveCartItem;
    onUpdate: (updates: Partial<TenderReceiveCartItem>) => void;
    onDelete: (itemId: string) => void;
}
function EditableRow({ item, onUpdate, onDelete }: EditableRowProps) {
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
          <Input value={editedItem.itemName} onChange={(e) => setEditedItem({ ...editedItem, itemName: e.target.value })} className="w-full"/>
        </td>
        <td className="px-4 py-2">
          <EquipmentSelect equipmentList={item.equipmentNumber} value={editedItem.equipmentNumber} onChange={(value) => setEditedItem({ ...editedItem, equipmentNumber: value })}/>
        </td>
        <td className="px-4 py-2">
          <Input type="number" value={editedItem.receiveQuantity.toString()} onChange={(e) => setEditedItem({ ...editedItem, receiveQuantity: parseFloat(e.target.value) })} className="w-24" min={1} step="0.01"/>
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
      <td className="px-4 py-2">{item.itemName}</td>
      <td className="px-4 py-2">{item.equipmentNumber}</td>
      <td className="px-4 py-2">{item.receiveQuantity}</td>
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
export function TenderReceivePreviewModal({ isOpen, onClose, onConfirm, onUpdateItem, onDeleteItem, items, date, tenderNumber, isSubmitting, }: RequestPreviewModalProps) {
    return (<Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl bg-white rounded-xl shadow-sm border border-[#002a6e]/10">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
            Preview Receive
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            Review your receive before submitting
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-[#003594]/5 p-4 rounded-lg">
            <p className="text-sm font-medium text-[#003594]">
              Tender Number: <span className="text-gray-900">{tenderNumber}</span>
            </p>
            <p className="text-sm font-medium text-[#003594]">
              Receive Date: <span className="text-gray-900">{format(date, 'PPP')}</span>
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
