'use client';
import { Trash2, Package, Scale, Pencil, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IssueCartItem } from '@/types/issue';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { stripSuffixFromNac } from '@/utils/nacCodeUtils';
import { cn } from '@/utils/utils';

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

function CartItemCard({
    item,
    onUpdate,
    onDelete,
    validationErrors = [],
}: {
    item: IssueCartItem;
    onUpdate: (updates: Partial<IssueCartItem>) => void;
    onDelete: (itemId: string) => void;
    validationErrors?: IssueCartProps['validationErrors'];
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [editedQty, setEditedQty] = useState(String(item.issueQuantity));
    const hasValidationError = validationErrors.some((e) => e.nacCode === item.nacCode);
    const errorMessage = validationErrors.find((e) => e.nacCode === item.nacCode)?.message;

    const saveQty = () => {
        const qty = parseFloat(editedQty);
        if (!isNaN(qty) && qty > 0) {
            onUpdate({ issueQuantity: qty, quantity: qty });
        }
        setIsEditing(false);
    };

    return (
        <div
            className={cn(
                'rounded-lg border p-4 transition-colors',
                hasValidationError ? 'border-red-300 bg-red-50/50' : 'border-[#002a6e]/10 bg-white hover:border-[#003594]/20'
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-[#003594] shrink-0" />
                        <p className="font-medium text-gray-900 truncate">{item.itemName}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="font-mono text-xs">
                            {item.nacCode}
                        </Badge>
                        {item.partNumber && item.partNumber !== 'NA' && (
                            <Badge variant="secondary" className="text-xs font-mono">
                                {item.partNumber}
                            </Badge>
                        )}
                        {stripSuffixFromNac(item.nacCode) !== item.nacCode && (
                            <Badge variant="outline" className="text-xs text-gray-500 border-gray-200">
                                Family {stripSuffixFromNac(item.nacCode)}
                            </Badge>
                        )}
                    </div>
                    <p className="text-xs text-gray-600">
                        Equipment: <strong className="text-gray-800">{item.selectedEquipment}</strong>
                    </p>
                    {hasValidationError && errorMessage && (
                        <p className="text-xs text-red-600 flex items-center gap-1">
                            <X className="h-3 w-3" /> {errorMessage}
                        </p>
                    )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                    {isEditing ? (
                        <div className="flex items-center gap-1">
                            <Input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={editedQty}
                                onChange={(e) => setEditedQty(e.target.value)}
                                className="h-8 w-20 text-sm"
                            />
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={saveQty}>
                                <Check className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                    setEditedQty(String(item.issueQuantity));
                                    setIsEditing(false);
                                }}
                            >
                                <X className="h-4 w-4 text-red-500" />
                            </Button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1 text-sm">
                            <Scale className="h-3.5 w-3.5 text-[#003594]" />
                            <span className="font-semibold text-[#003594]">{item.issueQuantity}</span>
                        </div>
                    )}
                    <div className="flex gap-1">
                        {!isEditing && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsEditing(true)}>
                                <Pencil className="h-3.5 w-3.5" />
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-600"
                            onClick={() => onDelete(item.id)}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function IssueCart({
    items,
    onUpdateItem,
    onDeleteItem,
    onSubmit,
    isSubmitDisabled = false,
    isSubmitting = false,
    validationErrors = [],
}: IssueCartProps) {
    const totalQty = items.reduce((sum, i) => sum + i.issueQuantity, 0);

    if (items.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-[#002a6e]/20 bg-slate-50 p-8 text-center">
                <Package className="mx-auto mb-3 h-10 w-10 text-[#003594]/30" />
                <p className="font-medium text-gray-600">Issue cart is empty</p>
                <p className="mt-1 text-sm text-gray-400">Double-click a search result to add items</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-[#003594]">Issue cart</h2>
                    <p className="text-xs text-gray-500">
                        {items.length} item{items.length !== 1 ? 's' : ''} · {totalQty} total units
                    </p>
                </div>
                <Badge className="bg-[#003594]/10 text-[#003594]">{items.length}</Badge>
            </div>

            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {items.map((item) => (
                    <CartItemCard
                        key={item.id}
                        item={item}
                        onUpdate={(updates) => onUpdateItem(item.id, updates)}
                        onDelete={onDeleteItem}
                        validationErrors={validationErrors}
                    />
                ))}
            </div>

            <Button
                onClick={onSubmit}
                disabled={isSubmitDisabled || isSubmitting}
                className="w-full bg-[#003594] hover:bg-[#002a6e] text-white"
            >
                {isSubmitting ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Submitting…
                    </>
                ) : (
                    'Review & Submit'
                )}
            </Button>
        </div>
    );
}
