'use client';
import { Trash2, Package, Hash, Scale, Pencil, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IssueCartItem } from '@/types/issue';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
interface IssueCartProps {
    items: IssueCartItem[];
    onUpdateItem: (itemId: string, updates: Partial<IssueCartItem>) => void;
    onDeleteItem: (itemId: string) => void;
    onSubmit: () => void;
    isSubmitDisabled?: boolean;
    isSubmitting?: boolean;
    validationErrors?: {
        nacCode: string;
        message: string;
        originalIndex: number;
    }[];
}
interface EditableItemProps {
    item: IssueCartItem;
    onUpdate: (updates: Partial<IssueCartItem>) => void;
    onDelete: (itemId: string) => void;
    validationErrors?: {
        nacCode: string;
        message: string;
        originalIndex: number;
    }[];
}
function EditableItem({ item, onUpdate, onDelete, validationErrors = [] }: EditableItemProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editedItem, setEditedItem] = useState(item);
    const handleSave = () => {
        onUpdate(editedItem);
        setIsEditing(false);
    };
    const handleCancel = () => {
        setEditedItem(item);
        setIsEditing(false);
    };
    const hasValidationError = validationErrors.some(error => error.nacCode === item.nacCode);
    const errorMessage = validationErrors.find(error => error.nacCode === item.nacCode)?.message;
    if (isEditing) {
        return (<div className="p-6">
        <div className="flex justify-between items-start gap-4">
          <div className="space-y-3 flex-1">
            <div>
              <h3 className="font-medium text-gray-900">{item.itemName}</h3>
              <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-[#003594]"/>
                  <span className="text-gray-500">NAC Code:</span>
                  <span className="font-medium text-[#003594]">{item.nacCode}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-[#003594]"/>
                  <span className="text-gray-500">Part Number:</span>
                  <span className="font-medium text-[#003594]">{item.partNumber || 'NA'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-[#003594]"/>
                  <span className="text-gray-500">Equipment:</span>
                  <span className="font-medium text-[#003594]">{item.selectedEquipment}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-[#003594]"/>
              <Input type="number" min="1" value={editedItem.issueQuantity} onChange={(e) => setEditedItem({ ...editedItem, issueQuantity: parseFloat(e.target.value) || 1 })} className="w-24 border-[#002a6e]/10 focus-visible:ring-[#003594]"/>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={handleSave} className="h-8 w-8 text-[#003594] hover:text-[#002a6e] hover:bg-[#003594]/5">
                <Check className="h-4 w-4"/>
              </Button>
              <Button variant="ghost" size="icon" onClick={handleCancel} className="h-8 w-8 text-[#d2293b] hover:text-[#d2293b] hover:bg-[#d2293b]/5">
                <X className="h-4 w-4"/>
              </Button>
            </div>
          </div>
        </div>
      </div>);
    }
    return (<div className="p-6">
      <div className="flex justify-between items-start gap-4">
        <div className="space-y-3 flex-1">
          <div>
            <h3 className="font-medium text-gray-900">{item.itemName}</h3>
            <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-[#003594]"/>
                <span className="text-gray-500">NAC Code:</span>
                <span className="font-medium text-[#003594]">{item.nacCode}</span>
              </div>
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-[#003594]"/>
                <span className="text-gray-500">Part Number:</span>
                <span className="font-medium text-[#003594]">{item.partNumber || 'NA'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-[#003594]"/>
                <span className="text-gray-500">Equipment:</span>
                <span className="font-medium text-[#003594]">{item.selectedEquipment}</span>
              </div>
            </div>
            
            
            {hasValidationError && errorMessage && (<div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                <div className="flex items-center gap-2 text-red-700">
                  <X className="h-4 w-4"/>
                  <span className="text-sm font-medium">{errorMessage}</span>
                </div>
              </div>)}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-[#003594]"/>
            <span className="font-medium text-[#003594]">{item.issueQuantity}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setIsEditing(true)} className="h-8 w-8 text-[#003594] hover:text-[#002a6e] hover:bg-[#003594]/5">
              <Pencil className="h-4 w-4"/>
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onDelete(item.id)} className="h-8 w-8 text-[#d2293b] hover:text-[#d2293b] hover:bg-[#d2293b]/5">
              <Trash2 className="h-4 w-4"/>
            </Button>
          </div>
        </div>
      </div>
    </div>);
}
export function IssueCart({ items, onUpdateItem, onDeleteItem, onSubmit, isSubmitDisabled = false, isSubmitting = false, validationErrors = [] }: IssueCartProps) {
    const totalItems = items.length;
    if (totalItems === 0) {
        return (<div className="bg-white rounded-xl shadow-sm border border-[#002a6e]/10 p-8 text-center hover:border-[#d2293b]/20 transition-colors">
        <Package className="h-12 w-12 text-[#003594]/40 mx-auto mb-4"/>
        <p className="text-gray-500 font-medium">Your cart is empty</p>
        <p className="text-sm text-gray-400 mt-1">Add items to your cart to proceed</p>
      </div>);
    }
    return (<div className="bg-white rounded-xl shadow-sm border border-[#002a6e]/10 hover:border-[#d2293b]/20 transition-colors">
      <div className="p-6 border-b border-[#002a6e]/10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[#003594]">Issue Cart</h2>
            <p className="text-sm text-gray-500 mt-1">{totalItems} {totalItems === 1 ? 'item' : 'items'}</p>
          </div>
          <div className="h-8 w-8 rounded-full bg-[#003594]/10 flex items-center justify-center">
            <Package className="h-4 w-4 text-[#003594]"/>
          </div>
        </div>
      </div>

      <div className="divide-y divide-[#002a6e]/10">
        {items.map((item) => (<EditableItem key={item.id} item={item} onUpdate={(updates) => onUpdateItem(item.id, updates)} onDelete={onDeleteItem} validationErrors={validationErrors}/>))}
      </div>

      <div className="p-6 border-t border-[#002a6e]/10">
        <Button onClick={onSubmit} disabled={isSubmitDisabled || isSubmitting} className="w-full bg-[#003594] hover:bg-[#002a6e] text-white transition-colors">
          {isSubmitting ? (<>
              <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
              Submitting...
            </>) : ('Submit Issue Request')}
        </Button>
      </div>
    </div>);
}
