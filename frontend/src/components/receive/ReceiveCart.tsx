'use client';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ReceiveCartItem } from '@/types/receive';
import { Trash2, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCustomToast } from '@/components/ui/custom-toast';
import Image from 'next/image';
interface ReceiveCartProps {
    items: ReceiveCartItem[];
    onUpdateItem: (itemId: string, updates: Partial<ReceiveCartItem>) => void;
    onDeleteItem: (itemId: string) => void;
    onSubmit: () => void;
    isSubmitDisabled: boolean;
    isSubmitting: boolean;
}
function CartItem({ item, onEdit, onDelete }: {
    item: ReceiveCartItem;
    onEdit: (item: ReceiveCartItem) => void;
    onDelete: (itemId: string) => void;
}) {
    const imageUrl = useMemo(() => {
        return item.image ? URL.createObjectURL(item.image) : null;
    }, [item.image]);
    return (<div className="flex items-start justify-between p-4 border rounded-lg">
      <div className="space-y-1">
        <p className="font-medium">{item.itemName}</p>
        <p className="text-sm text-muted-foreground">
          NAC Code: {item.nacCode}
        </p>
        <p className="text-sm">
          Receive Quantity: {item.receiveQuantity}
        </p>
        {item.partNumber && (<p className="text-sm">Part Number: {item.partNumber}</p>)}
        <p className="text-sm">
          Equipment Number: {item.equipmentNumber}
        </p>
        <p className="text-sm">
          Location: {item.location}
        </p>
        <p className="text-sm">
          Card Number: {item.cardNumber}
        </p>
        {imageUrl && (<div className="mt-2">
            <Image src={imageUrl} alt="Item" width={200} height={200} className="max-w-[200px] h-auto rounded-md" unoptimized/>
          </div>)}
      </div>
      <div className="flex space-x-2">
        <Button variant="ghost" size="icon" onClick={() => onEdit(item)}>
          <Pencil className="h-4 w-4"/>
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(item.id)}>
          <Trash2 className="h-4 w-4"/>
        </Button>
      </div>
    </div>);
}
export function ReceiveCart({ items, onUpdateItem, onDeleteItem, onSubmit, isSubmitDisabled, isSubmitting, }: ReceiveCartProps) {
    const { showErrorToast } = useCustomToast();
    const [editingItem, setEditingItem] = useState<ReceiveCartItem | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editFormData, setEditFormData] = useState<Partial<ReceiveCartItem>>({});
    const handleEdit = (item: ReceiveCartItem) => {
        setEditingItem(item);
        setIsEditDialogOpen(true);
        setEditFormData({
            itemName: item.itemName,
            nacCode: item.nacCode,
            partNumber: item.partNumber,
            equipmentNumber: item.equipmentNumber,
            location: item.location,
            cardNumber: item.cardNumber,
            receiveQuantity: item.receiveQuantity,
            unit: item.unit,
            image: item.image,
        });
    };
    const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editingItem)
            return;
        if (editFormData.receiveQuantity && editFormData.receiveQuantity > editingItem.requestedQuantity) {
            showErrorToast({
                title: 'Error',
                message: `Receive quantity cannot be greater than requested quantity (${editingItem.requestedQuantity})`,
                duration: 3000,
            });
            return;
        }
        onUpdateItem(editingItem.id, {
            receiveQuantity: editFormData.receiveQuantity,
            partNumber: editFormData.partNumber,
            equipmentNumber: editFormData.equipmentNumber,
            location: editFormData.location,
            cardNumber: editFormData.cardNumber,
            image: editFormData.image,
        });
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
      <h2 className="text-lg font-semibold">Receive Cart</h2>
      {items.length === 0 ? (<p className="text-muted-foreground">No items in cart</p>) : (<div className="space-y-4">
          {items.map((item) => (<CartItem key={item.id} item={item} onEdit={handleEdit} onDelete={onDeleteItem}/>))}
        </div>)}

      <div className="flex justify-end mt-4">
        <Button onClick={onSubmit} disabled={isSubmitDisabled || isSubmitting} className="w-full sm:w-auto">
          {isSubmitting ? "Submitting..." : "Submit Receive"}
        </Button>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-2xl w-[95vw] bg-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
              Edit Item Details
            </DialogTitle>
            <p className="text-sm text-gray-500 mt-1">
              Update the item details in your receive
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
                  <Input id="editNacCode" value={editFormData.nacCode} onChange={(e) => setEditFormData(prev => ({ ...prev, nacCode: e.target.value }))} className="mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20" disabled={editingItem?.nacCode !== 'N/A'}/>
                </div>

                <div>
                  <Label htmlFor="editPartNumber" className="text-sm font-medium text-[#003594]">Part Number</Label>
                  <Input id="editPartNumber" value={editFormData.partNumber} onChange={(e) => setEditFormData(prev => ({ ...prev, partNumber: e.target.value }))} className="mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20" disabled={editingItem?.partNumber !== 'N/A'}/>
                </div>

                <div>
                  <Label htmlFor="editEquipmentNumber" className="text-sm font-medium text-[#003594]">Equipment Number</Label>
                  <Input id="editEquipmentNumber" value={editFormData.equipmentNumber} onChange={(e) => setEditFormData(prev => ({ ...prev, equipmentNumber: e.target.value }))} className="mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20" readOnly/>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="editReceiveQuantity" className="text-sm font-medium text-[#003594]">Receive Quantity</Label>
                  <Input id="editReceiveQuantity" type="number" value={editFormData.receiveQuantity} onChange={(e) => setEditFormData(prev => ({ ...prev, receiveQuantity: Number(e.target.value) }))} className="mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20" min="1" max={editingItem?.requestedQuantity} required/>
                  <div className="text-xs text-gray-500 mt-1">
                    Max: {editingItem?.requestedQuantity}
                  </div>
                </div>

                <div>
                  <Label htmlFor="editUnit" className="text-sm font-medium text-[#003594]">Unit</Label>
                  <Input id="editUnit" value={editFormData.unit} onChange={(e) => setEditFormData(prev => ({ ...prev, unit: e.target.value }))} className="mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20" placeholder="Enter unit"/>
                </div>

                <div>
                  <Label htmlFor="editLocation" className="text-sm font-medium text-[#003594]">Location</Label>
                  <Input id="editLocation" value={editFormData.location} onChange={(e) => {
            setEditFormData(prev => ({
                ...prev,
                location: e.target.value,
                isLocationChanged: true
            }));
        }} className="mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20" placeholder="Enter location" disabled={editFormData.nacCode !== 'N/A'}/>
                </div>

                <div>
                  <Label htmlFor="editCardNumber" className="text-sm font-medium text-[#003594]">Card Number</Label>
                  <Input id="editCardNumber" value={editFormData.cardNumber} onChange={(e) => {
            setEditFormData(prev => ({
                ...prev,
                cardNumber: e.target.value,
                isCardNumberChanged: true
            }));
        }} className="mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20" placeholder="Enter card number" disabled={editFormData.nacCode !== 'N/A'}/>
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
