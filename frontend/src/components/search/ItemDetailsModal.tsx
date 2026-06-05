'use client';

import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { X, Maximize2, Loader2 } from 'lucide-react';
import { ItemDetails } from '@/types/item';
import Image from 'next/image';
import { resolveImageUrl } from '@/lib/urls';
import { SpareApplicableEquipmentsCell } from '@/components/search/SpareApplicableEquipmentsCell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ItemDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: ItemDetails | null;
    isLoading?: boolean;
    error?: string | null;
}

export const ItemDetailsModal = ({
    isOpen,
    onClose,
    item,
    isLoading = false,
    error = null,
}: ItemDetailsModalProps) => {
    const imageUrl = item ? resolveImageUrl(item.imageUrl, '/images/nepal_airlines_logo.png') : '';
    const imageAlt = item?.itemName || 'Item Image';

    const handleImageClick = () => {
        if (imageUrl) {
            window.open(imageUrl, '_blank');
        }
    };

    return (
        <Transition appear show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/25" />
                </Transition.Child>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 text-center">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 text-left align-middle shadow-xl transition-all">
                                <div className="mb-6 flex items-start justify-between gap-4">
                                    <div>
                                        <Dialog.Title as="h3" className="text-xl font-bold text-slate-900">
                                            Item details
                                        </Dialog.Title>
                                        {item && !isLoading && !error && (
                                            <p className="mt-1 font-mono text-sm text-[#003594]">{item.nacCode}</p>
                                        )}
                                    </div>
                                    <button
                                        onClick={onClose}
                                        className="rounded-full p-1 hover:bg-[#003594]/10 transition-colors"
                                    >
                                        <X className="h-6 w-6 text-[#003594] hover:text-[#d2293b] transition-colors" />
                                    </button>
                                </div>

                                {isLoading && (
                                    <div className="flex flex-col items-center justify-center py-16">
                                        <Loader2 className="h-10 w-10 animate-spin text-[#003594]" />
                                        <p className="mt-4 text-sm text-gray-600">Loading item details…</p>
                                    </div>
                                )}

                                {!isLoading && error && (
                                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-8 text-center">
                                        <p className="font-medium text-red-800">Could not load item details</p>
                                        <p className="mt-2 text-sm text-red-700">{error}</p>
                                    </div>
                                )}

                                {!isLoading && !error && item && (
                                    <>
                                        <div className="grid grid-cols-1 gap-8 md:grid-cols-[300px_1fr]">
                                            <div
                                                className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 cursor-pointer group border border-[#003594]/10 hover:border-[#d2293b]/20 transition-colors"
                                                onClick={handleImageClick}
                                            >
                                                <Image
                                                    src={imageUrl}
                                                    alt={imageAlt}
                                                    fill
                                                    className="object-cover transition-transform group-hover:scale-105"
                                                    sizes="300px"
                                                    unoptimized
                                                />
                                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <Maximize2 className="h-8 w-8 text-white" />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                                                <div className="space-y-4">
                                                    <div>
                                                        <h4 className="text-sm font-medium text-[#003594]">NAC Code</h4>
                                                        <p className="mt-1 text-lg font-semibold text-gray-900">{item.nacCode}</p>
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-medium text-[#003594]">Part Number</h4>
                                                        <p className="mt-1 text-lg font-semibold text-gray-900">{item.partNumber}</p>
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-medium text-[#003594]">Item Name</h4>
                                                        <p className="mt-1 text-lg font-semibold text-gray-900">{item.itemName}</p>
                                                    </div>
                                                </div>

                                                <div className="space-y-4">
                                                    <div>
                                                        <h4 className="text-sm font-medium text-[#003594]">True balance</h4>
                                                        <Badge className="mt-1 border-emerald-200 bg-emerald-50 text-base font-semibold text-emerald-800">
                                                            {item.trueBalance}
                                                        </Badge>
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-medium text-[#003594]">Average Cost Per Unit</h4>
                                                        <p className="mt-1 text-lg font-semibold text-[#003594]">
                                                            NPR {Number(item.averageCostPerUnit).toFixed(2)}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-medium text-[#003594]">Location</h4>
                                                        <p className="mt-1 text-lg font-semibold text-gray-900">{item.location}</p>
                                                    </div>
                                                </div>

                                                <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                                                    <h4 className="text-sm font-medium text-[#003594]">Applicable for</h4>
                                                    <div className="mt-3">
                                                        <SpareApplicableEquipmentsCell
                                                            equipmentNumber={item.equipmentNumber}
                                                            equipmentDisplay={item.equipmentDisplay}
                                                            showAll
                                                            className="text-sm"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-8 flex justify-end border-t border-slate-100 pt-4">
                                            <Button type="button" onClick={onClose} className="bg-[#003594] hover:bg-[#002a6e]">
                                                Close
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
};
