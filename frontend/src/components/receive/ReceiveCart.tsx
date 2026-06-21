'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ReceiveCartItem } from '@/types/receive';
import { Trash2, Pencil, ShoppingCart, Package } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCustomToast } from '@/components/ui/custom-toast';
import Image from 'next/image';
import { resolveImageUrl } from '@/lib/urls';

interface ReceiveCartProps {
    items: ReceiveCartItem[];
    onUpdateItem: (itemId: string, updates: Partial<ReceiveCartItem>) => void;
    onDeleteItem: (itemId: string) => void;
    onSubmit: () => void;
    isSubmitDisabled: boolean;
    isSubmitting: boolean;
}

function CartItemCard({
    item,
    onEdit,
    onDelete,
}: {
    item: ReceiveCartItem;
    onEdit: (item: ReceiveCartItem) => void;
    onDelete: (itemId: string) => void;
}) {
    const imageUrl = useMemo(() => {
        if (item.image) return URL.createObjectURL(item.image);
        if (item.imagePath) return resolveImageUrl(item.imagePath, '/images/nepal_airlines_logo.png');
        return null;
    }, [item.image, item.imagePath]);

    const maxQty = item.remainingQuantity ?? item.requestedQuantity;

    return (
        <div className="rounded-lg border border-[#002a6e]/10 bg-white p-3 shadow-sm hover:border-[#003594]/20 transition-colors">
            <div className="flex gap-3">
                <div className="relative w-14 h-14 shrink-0 rounded-md border border-[#002a6e]/10 bg-gray-50 overflow-hidden">
                    {imageUrl ? (
                        <Image src={imageUrl} alt={item.itemName} fill className="object-cover" unoptimized />
                    ) : (
                        <div className="flex h-full items-center justify-center text-gray-400">
                            <Package className="h-5 w-5" />
                        </div>
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-gray-900 line-clamp-2">{item.itemName}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                        {item.requestNumber && (
                            <Badge variant="outline" className="text-[10px] font-mono">
                                {item.requestNumber}
                            </Badge>
                        )}
                        <Badge variant="secondary" className="text-[10px] font-mono">
                            {item.nacCode}
                        </Badge>
                        {item.resolvedNacCode && item.resolvedNacCode !== item.nacCode && (
                            <Badge className="text-[10px] bg-amber-100 text-amber-800 hover:bg-amber-100">
                                → {item.resolvedNacCode}
                            </Badge>
                        )}
                    </div>
                    <p className="text-xs text-gray-600 mt-1.5">
                        Qty <strong>{item.receiveQuantity}</strong> {item.unit}
                        {item.partNumber && <> · Part {item.partNumber}</>}
                    </p>
                    {item.equipmentNumber && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{item.equipmentNumber}</p>
                    )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(item)}>
                        <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700" onClick={() => onDelete(item.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">Max remaining: {maxQty}</p>
        </div>
    );
}

export function ReceiveCart({
    items,
    onUpdateItem,
    onDeleteItem,
    onSubmit,
    isSubmitDisabled,
    isSubmitting,
}: ReceiveCartProps) {
    const { showErrorToast } = useCustomToast();
    const [editingItem, setEditingItem] = useState<ReceiveCartItem | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editFormData, setEditFormData] = useState<Partial<ReceiveCartItem>>({});

    const totalQty = items.reduce((sum, i) => sum + i.receiveQuantity, 0);

    const handleEdit = (item: ReceiveCartItem) => {
        setEditingItem(item);
        setIsEditDialogOpen(true);
        setEditFormData({
            receiveQuantity: item.receiveQuantity,
            partNumber: item.partNumber,
            location: item.location,
            unit: item.unit,
            image: item.image,
        });
    };

    const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editingItem) return;
        const maxQty = editingItem.remainingQuantity ?? editingItem.requestedQuantity;
        if (editFormData.receiveQuantity && editFormData.receiveQuantity > maxQty) {
            showErrorToast({
                title: 'Invalid quantity',
                message: `Cannot exceed remaining quantity (${maxQty})`,
                duration: 3000,
            });
            return;
        }
        onUpdateItem(editingItem.id, {
            receiveQuantity: editFormData.receiveQuantity,
            partNumber: editFormData.partNumber,
            location: editFormData.location,
            image: editFormData.image,
            isLocationChanged: editFormData.location !== editingItem.location,
        });
        setIsEditDialogOpen(false);
        setEditingItem(null);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[#003594] flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5" />
                    Receive Cart
                </h2>
                {items.length > 0 && (
                    <Badge className="bg-[#003594]">
                        {items.length} item{items.length !== 1 ? 's' : ''} · {totalQty} units
                    </Badge>
                )}
            </div>

            {items.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[#002a6e]/20 p-6 text-center">
                    <Package className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-muted-foreground">No items in cart</p>
                    <p className="text-xs text-gray-400 mt-1">Select a request from the list to receive</p>
                </div>
            ) : (
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                    {items.map((item) => (
                        <CartItemCard key={item.id} item={item} onEdit={handleEdit} onDelete={onDeleteItem} />
                    ))}
                </div>
            )}

            <Button
                onClick={onSubmit}
                disabled={isSubmitDisabled || isSubmitting}
                className="w-full bg-[#003594] hover:bg-[#d2293b]"
            >
                {isSubmitting ? 'Submitting…' : `Review & Submit (${items.length})`}
            </Button>

            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-[#003594]">Edit cart item</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleEditSubmit} className="space-y-4">
                        <div>
                            <Label>Receive quantity</Label>
                            <Input
                                type="number"
                                min={1}
                                max={editingItem?.remainingQuantity ?? editingItem?.requestedQuantity}
                                value={editFormData.receiveQuantity ?? ''}
                                onChange={(e) =>
                                    setEditFormData((prev) => ({ ...prev, receiveQuantity: Number(e.target.value) }))
                                }
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label>Location</Label>
                            <Input
                                value={editFormData.location ?? ''}
                                onChange={(e) => setEditFormData((prev) => ({ ...prev, location: e.target.value }))}
                                className="mt-1"
                                disabled={editingItem?.nacCode !== 'N/A'}
                            />
                        </div>
                        <div>
                            <Label>Replace photo</Label>
                            <Input
                                type="file"
                                accept="image/*"
                                className="mt-1"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) setEditFormData((prev) => ({ ...prev, image: file }));
                                }}
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit">Save</Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
