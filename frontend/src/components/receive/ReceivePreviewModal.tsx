'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ReceiveCartItem } from '@/types/receive';
import { format } from 'date-fns';
import { Loader2, Package, Calendar, MapPin, Hash, Edit2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ReceiveItemForm } from './ReceiveItemForm';
import { ReceiveSearchResult } from '@/types/search';
interface ReceivePreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    onUpdateItem: (itemId: string, updates: Partial<ReceiveCartItem>) => void;
    onDeleteItem: (itemId: string) => void;
    items: ReceiveCartItem[];
    date: Date;
    remarks: string;
    isSubmitting: boolean;
}
export function ReceivePreviewModal({ isOpen, onClose, onConfirm, onUpdateItem, onDeleteItem, items, date, remarks, isSubmitting, }: ReceivePreviewModalProps) {
    const [editingItem, setEditingItem] = useState<ReceiveCartItem | null>(null);
    const handleEditItem = (item: ReceiveCartItem) => {
        setEditingItem(item);
    };
    const handleUpdateItem = (updatedItem: ReceiveCartItem) => {
        onUpdateItem(updatedItem.id, updatedItem);
        setEditingItem(null);
    };
    const convertToSearchResult = (item: ReceiveCartItem): ReceiveSearchResult => ({
        id: Number(item.id.split('-')[0]),
        nacCode: item.nacCode,
        partNumber: item.partNumber,
        itemName: item.itemName,
        equipmentNumber: item.equipmentNumber,
        location: item.location,
        cardNumber: item.cardNumber,
        currentBalance: '0',
        unit: item.unit,
        specifications: '',
        imageUrl: '',
        previousRate: '0',
        trueBalance: 0,
        averageCostPerUnit: 0,
        requestedQuantity: item.receiveQuantity,
        requestNumber: '',
        requestDate: '',
        requestedBy: '',
        approvalStatus: ''
    });
    return (<>
    <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-3xl bg-white rounded-xl shadow-xl border-[#002a6e]/10">
          <DialogHeader className="border-b border-[#002a6e]/10 pb-4">
            <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
              Preview Receive
            </DialogTitle>
            <p className="text-sm text-gray-500 mt-1">
              Review the items before confirming the receive
            </p>
        </DialogHeader>

          <div className="space-y-6 mt-4">
            <div className="bg-[#003594]/5 rounded-lg p-4">
              <div className="flex items-center gap-2 text-[#003594]">
                <Calendar className="h-5 w-5"/>
                <h3 className="font-semibold">Receive Date</h3>
              </div>
              <p className="mt-1 text-gray-700">{format(date, 'PPP')}</p>
            </div>

        <div className="space-y-4">
              <div className="flex items-center gap-2 text-[#003594]">
                <Package className="h-5 w-5"/>
                <h3 className="font-semibold">Items ({items.length})</h3>
              </div>
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                {items.map((item) => (<div key={item.id} className="p-4 border border-[#002a6e]/10 rounded-lg bg-white hover:shadow-md transition-all duration-200">
                    <div className="flex justify-between items-start mb-3">
          <div>
                        <h4 className="font-semibold text-gray-900">{item.itemName}</h4>
                        <p className="text-sm text-gray-500">Part Number: {item.partNumber}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleEditItem(item)} className="border-[#002a6e]/20 hover:bg-[#003594]/5 hover:text-[#003594] transition-colors">
                          <Edit2 className="h-4 w-4"/>
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => onDeleteItem(item.id)} className="bg-[#d2293b] hover:bg-[#d2293b]/90 transition-colors">
                          <Trash2 className="h-4 w-4"/>
                        </Button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Package className="h-4 w-4"/>
                          <span>Quantity: {item.receiveQuantity}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Hash className="h-4 w-4"/>
                          <span>Equipment: {item.equipmentNumber}</span>
                        </div>
          </div>
            <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <MapPin className="h-4 w-4"/>
                          <span>Location: {item.location}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Hash className="h-4 w-4"/>
                          <span>Card: {item.cardNumber}</span>
                        </div>
                      </div>
                    </div>
                </div>))}
            </div>
          </div>

            {remarks && (<div className="bg-gray-50 rounded-lg p-4 border border-[#002a6e]/10">
                <h3 className="font-medium text-[#003594] mb-2">Remarks</h3>
                <p className="text-gray-700">{remarks}</p>
              </div>)}

            <DialogFooter className="border-t border-[#002a6e]/10 pt-4">
              <Button variant="outline" onClick={onClose} className="border-[#002a6e]/20 hover:bg-[#003594]/5 hover:text-[#003594] transition-colors">
              Cancel
            </Button>
              <Button onClick={onConfirm} disabled={isSubmitting} className="bg-[#003594] hover:bg-[#d2293b] text-white transition-colors">
                {isSubmitting ? (<>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                    Submitting...
                  </>) : ('Confirm Receive')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>

      {editingItem && (<ReceiveItemForm isOpen={!!editingItem} onClose={() => setEditingItem(null)} item={convertToSearchResult(editingItem)} onSubmit={handleUpdateItem}/>)}
    </>);
}
