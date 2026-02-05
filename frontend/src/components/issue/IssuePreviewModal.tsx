'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IssueCartItem } from '@/types/issue';
import { format } from 'date-fns';
import { EquipmentSelect } from './EquipmentSelect';
import { Pencil, Check, X, Trash2, Loader2, Package, Calendar, Hash, Scale } from 'lucide-react';
interface IssuePreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    onUpdateItem: (itemId: string, updates: Partial<IssueCartItem>) => void;
    onDeleteItem: (itemId: string) => void;
    items: IssueCartItem[];
    date: Date;
    isSubmitting?: boolean;
}
interface EditableRowProps {
    item: IssueCartItem;
    onUpdate: (updates: Partial<IssueCartItem>) => void;
    onDelete: (itemId: string) => void;
}
function EditableRow({ item, onUpdate, onDelete }: EditableRowProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editedItem, setEditedItem] = useState(item);
    const isConsumable = item.equipmentNumber.toLowerCase().includes('consumable');
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
        <td className="px-6 py-4">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-[#003594]"/>
            <span className="font-medium text-[#003594]">{item.nacCode}</span>
          </div>
        </td>
        <td className="px-6 py-4">
          <span className="text-gray-900">{item.itemName}</span>
        </td>
        <td className="px-6 py-4">
          {isConsumable ? (<Input value={editedItem.selectedEquipment} onChange={(e) => setEditedItem({ ...editedItem, selectedEquipment: e.target.value })} className="w-32 border-[#002a6e]/10 focus-visible:ring-[#003594]"/>) : (<EquipmentSelect equipmentList={item.equipmentNumber} value={editedItem.selectedEquipment} onChange={(value) => setEditedItem({ ...editedItem, selectedEquipment: value })}/>)}
        </td>
        <td className="px-6 py-4">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-[#003594]"/>
            <Input type="number" value={editedItem.issueQuantity.toString()} onChange={(e) => setEditedItem({ ...editedItem, issueQuantity: parseFloat(e.target.value) })} className="w-24 border-[#002a6e]/10 focus-visible:ring-[#003594]" min={1} max={item.currentBalance} step="0.01"/>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Max: {item.currentBalance}
          </div>
        </td>
        <td className="px-6 py-4">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-[#003594]"/>
            <span className="text-gray-900">{item.partNumber || 'NA'}</span>
          </div>
        </td>
        <td className="px-6 py-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleSave} className="h-8 w-8 text-[#003594] hover:text-[#002a6e] hover:bg-[#003594]/5">
              <Check className="h-4 w-4"/>
            </Button>
            <Button variant="ghost" size="icon" onClick={handleCancel} className="h-8 w-8 text-[#d2293b] hover:text-[#d2293b] hover:bg-[#d2293b]/5">
              <X className="h-4 w-4"/>
            </Button>
          </div>
        </td>
      </tr>);
    }
    return (<tr className="hover:bg-gray-50">
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-[#003594]"/>
          <span className="font-medium text-[#003594]">{item.nacCode}</span>
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="text-gray-900">{item.itemName}</span>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <Hash className="h-4 w-4 text-[#003594]"/>
          <span className="text-gray-900">{item.selectedEquipment}</span>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-[#003594]"/>
          <span className="text-gray-900">{item.issueQuantity}</span>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <Hash className="h-4 w-4 text-[#003594]"/>
          <span className="text-gray-900">{item.partNumber || 'NA'}</span>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setIsEditing(true)} className="h-8 w-8 text-[#003594] hover:text-[#002a6e] hover:bg-[#003594]/5">
            <Pencil className="h-4 w-4"/>
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(item.id)} className="h-8 w-8 text-[#d2293b] hover:text-[#d2293b] hover:bg-[#d2293b]/5">
            <Trash2 className="h-4 w-4"/>
          </Button>
        </div>
      </td>
    </tr>);
}
export function IssuePreviewModal({ isOpen, onClose, onConfirm, onUpdateItem, onDeleteItem, items, date, isSubmitting = false, }: IssuePreviewModalProps) {
    return (<Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl border-[#002a6e]/10 bg-white flex flex-col max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
            Preview Issue Request
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            Review your issue request before submitting
          </DialogDescription>
        </DialogHeader>

        
        <div className="space-y-6 overflow-y-auto flex-1 min-h-0">
          <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg border border-[#002a6e]/10">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-[#003594]"/>
              <div>
                <p className="text-sm text-gray-500">Issue Date</p>
                <p className="font-medium text-[#003594]">{format(date, 'PPP')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-[#003594]"/>
              <div>
                <p className="text-sm text-gray-500">Total Items</p>
                <p className="font-medium text-[#003594]">{items.length}</p>
              </div>
            </div>
          </div>
          
          <div className="border border-[#002a6e]/10 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <div className="max-h-[40vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-[#002a6e]/10 sticky top-0 z-10">
                      <th className="px-6 py-3 text-left font-medium text-[#003594]">NAC Code</th>
                      <th className="px-6 py-3 text-left font-medium text-[#003594]">Item Name</th>
                      <th className="px-6 py-3 text-left font-medium text-[#003594]">Equipment</th>
                      <th className="px-6 py-3 text-left font-medium text-[#003594]">Quantity</th>
                      <th className="px-6 py-3 text-left font-medium text-[#003594]">Part Number</th>
                      <th className="px-6 py-3 text-left font-medium text-[#003594]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#002a6e]/10">
                    {items.map((item) => (<EditableRow key={item.id} item={item} onUpdate={(updates) => onUpdateItem(item.id, updates)} onDelete={onDeleteItem}/>))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        
        <DialogFooter className="gap-3 pt-4 border-t border-[#002a6e]/10">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting} className="border-[#002a6e]/10 hover:border-[#d2293b] hover:bg-[#d2293b]/5 text-[#d2293b]">
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isSubmitting} className="bg-[#003594] hover:bg-[#002a6e] text-white transition-colors">
            {isSubmitting ? (<>
                <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                Submitting...
              </>) : ('Confirm Submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}
