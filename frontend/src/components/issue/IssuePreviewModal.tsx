'use client';
import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { IssueCartItem } from '@/types/issue';
import { format } from 'date-fns';
import { IssueEquipmentSelect } from '@/components/issue/IssueEquipmentSelect';
import { isEquipmentOutsideApplicable } from '@/utils/issueEquipmentUtils';
import { API } from '@/lib/api';
import { Pencil, Check, X, Trash2, Loader2, Package, Calendar, Hash, Scale, AlertTriangle } from 'lucide-react';
import { cn } from '@/utils/utils';

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

function PreviewItemCard({
    item,
    onUpdate,
    onDelete,
}: {
    item: IssueCartItem;
    onUpdate: (updates: Partial<IssueCartItem>) => void;
    onDelete: (itemId: string) => void;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [editedItem, setEditedItem] = useState(item);
    const [sections, setSections] = useState<{ id: number; name: string; code: string }[]>([]);

    const fetchSections = useCallback(async () => {
        try {
            const res = await API.get('/api/settings/issue/sections/active');
            setSections(res.data || []);
        } catch {
            setSections([]);
        }
    }, []);

    useEffect(() => {
        void fetchSections();
    }, [fetchSections]);

    useEffect(() => {
        setEditedItem(item);
    }, [item]);

    const handleSave = () => {
        onUpdate(editedItem);
        setIsEditing(false);
    };

    return (
        <div
            className={cn(
                'rounded-xl border p-4 transition-colors',
                isEditing ? 'border-[#003594]/30 bg-[#003594]/5' : 'border-slate-200 bg-white'
            )}
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-[#003594] shrink-0" />
                        <p className="font-semibold text-gray-900">{item.itemName}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-sm">
                        <Badge variant="outline" className="font-mono">
                            {item.nacCode}
                        </Badge>
                        <Badge variant="secondary">{item.partNumber || 'NA'}</Badge>
                    </div>
                </div>
                <div className="flex gap-1 shrink-0">
                    {!isEditing ? (
                        <>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsEditing(true)}>
                                <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-500"
                                onClick={() => onDelete(item.id)}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSave}>
                                <Check className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                    setEditedItem(item);
                                    setIsEditing(false);
                                }}
                            >
                                <X className="h-4 w-4 text-red-500" />
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div>
                    <p className="text-xs font-medium text-gray-500 flex items-center gap-1 mb-1">
                        <Hash className="h-3 w-3" /> Equipment
                    </p>
                    {isEditing ? (
                        <IssueEquipmentSelect
                            value={editedItem.selectedEquipment}
                            onChange={(value) =>
                                setEditedItem({ ...editedItem, selectedEquipment: value })
                            }
                            sections={sections}
                        />
                    ) : (
                        <div className="space-y-1">
                            <p className="font-medium text-gray-800">{item.selectedEquipment}</p>
                            {isEquipmentOutsideApplicable(
                                item.selectedEquipment,
                                item.equipmentNumber,
                                sections.map((s) => s.code)
                            ) && (
                                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[10px]">
                                    <AlertTriangle className="h-3 w-3 mr-1 inline" />
                                    New applicable equipment
                                </Badge>
                            )}
                        </div>
                    )}
                </div>
                <div>
                    <p className="text-xs font-medium text-gray-500 flex items-center gap-1 mb-1">
                        <Scale className="h-3 w-3" /> Quantity
                    </p>
                    {isEditing ? (
                        <>
                            <Input
                                type="number"
                                value={editedItem.issueQuantity.toString()}
                                onChange={(e) =>
                                    setEditedItem({
                                        ...editedItem,
                                        issueQuantity: parseFloat(e.target.value) || 1,
                                    })
                                }
                                className="h-9 w-full max-w-[120px]"
                                min={0.01}
                                max={item.currentBalance}
                                step="0.01"
                            />
                            <p className="text-xs text-gray-400 mt-1">Max: {item.currentBalance}</p>
                        </>
                    ) : (
                        <p className="font-semibold text-[#003594]">{item.issueQuantity}</p>
                    )}
                </div>
                <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">True balance (ref.)</p>
                    <p className="font-medium text-emerald-700">{item.currentBalance}</p>
                </div>
            </div>
        </div>
    );
}

export function IssuePreviewModal({
    isOpen,
    onClose,
    onConfirm,
    onUpdateItem,
    onDeleteItem,
    items,
    date,
    isSubmitting = false,
}: IssuePreviewModalProps) {
    const totalQty = items.reduce((sum, i) => sum + i.issueQuantity, 0);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl border-[#002a6e]/10 bg-white flex flex-col max-h-[85vh]">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
                        Review Issue Request
                    </DialogTitle>
                    <DialogDescription className="text-gray-600">
                        Confirm items and quantities before submitting for approval
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 overflow-y-auto flex-1 min-h-0 py-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-[#002a6e]/10 bg-slate-50 p-4">
                        <div className="flex items-center gap-2">
                            <Calendar className="h-5 w-5 text-[#003594]" />
                            <div>
                                <p className="text-xs text-gray-500">Issue date</p>
                                <p className="font-semibold text-[#003594]">{format(date, 'PPP')}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Package className="h-5 w-5 text-[#003594]" />
                            <div>
                                <p className="text-xs text-gray-500">Line items</p>
                                <p className="font-semibold text-[#003594]">{items.length}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Scale className="h-5 w-5 text-[#003594]" />
                            <div>
                                <p className="text-xs text-gray-500">Total quantity</p>
                                <p className="font-semibold text-[#003594]">{totalQty}</p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {items.map((item) => (
                            <PreviewItemCard
                                key={item.id}
                                item={item}
                                onUpdate={(updates) => onUpdateItem(item.id, updates)}
                                onDelete={onDeleteItem}
                            />
                        ))}
                    </div>
                </div>

                <DialogFooter className="gap-2 pt-4 border-t border-[#002a6e]/10">
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                        Back
                    </Button>
                    <Button
                        onClick={onConfirm}
                        disabled={isSubmitting}
                        className="bg-[#003594] hover:bg-[#002a6e] text-white min-w-[140px]"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Submitting…
                            </>
                        ) : (
                            'Confirm & Submit'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
