'use client';

import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { X, Maximize2, Loader2 } from 'lucide-react';
import { ItemDetails } from '@/types/item';
import Image from 'next/image';
import { resolveImageUrl } from '@/lib/urls';
import { SpareApplicableEquipmentsCell } from '@/components/search/SpareApplicableEquipmentsCell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/utils';
import type { StockVariant } from '@/types/search';

interface ItemDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: ItemDetails | null;
    isLoading?: boolean;
    error?: string | null;
}

type ImagePreview = {
    src: string;
    alt: string;
    caption?: string;
};

interface ExpandableImageProps {
    src: string;
    alt: string;
    caption?: string;
    onExpand: (preview: ImagePreview) => void;
    className?: string;
    imageClassName?: string;
    sizes?: string;
    fill?: boolean;
    width?: number;
    height?: number;
}

function ExpandableImage({
    src,
    alt,
    caption,
    onExpand,
    className,
    imageClassName,
    sizes,
    fill = true,
    width,
    height,
}: ExpandableImageProps) {
    const handleClick = () => {
        onExpand({ src, alt, caption });
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
        }
    };

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={`View full size: ${caption || alt}`}
            className={cn(
                'relative overflow-hidden bg-gray-100 cursor-pointer group border border-[#003594]/10 hover:border-[#d2293b]/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#003594] focus-visible:ring-offset-2',
                className
            )}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
        >
            {fill ? (
                <Image
                    src={src}
                    alt={alt}
                    fill
                    className={cn('object-cover transition-transform group-hover:scale-105', imageClassName)}
                    sizes={sizes}
                    unoptimized
                />
            ) : (
                <Image
                    src={src}
                    alt={alt}
                    width={width}
                    height={height}
                    className={cn('object-cover transition-transform group-hover:scale-105', imageClassName)}
                    unoptimized
                />
            )}
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity flex items-center justify-center">
                <Maximize2 className="h-6 w-6 text-white drop-shadow-md sm:h-8 sm:w-8" />
            </div>
        </div>
    );
}

function ImagePreviewOverlay({
    preview,
    onClose,
}: {
    preview: ImagePreview;
    onClose: () => void;
}) {
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 p-4 sm:p-8"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Image preview"
        >
            <button
                type="button"
                onClick={onClose}
                className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
                aria-label="Close image preview"
            >
                <X className="h-6 w-6" />
            </button>

            <div
                className="relative flex max-h-[85vh] max-w-[min(1200px,95vw)] flex-col items-center"
                onClick={(e) => e.stopPropagation()}
            >
                {preview.caption && (
                    <p className="mb-3 text-center text-sm font-medium text-white/90 sm:text-base">
                        {preview.caption}
                    </p>
                )}
                <div className="relative max-h-[80vh] w-full overflow-hidden rounded-lg border border-white/20 bg-black/40">
                    <Image
                        src={preview.src}
                        alt={preview.alt}
                        width={1200}
                        height={900}
                        className="mx-auto max-h-[80vh] w-auto max-w-full object-contain"
                        unoptimized
                        priority
                    />
                </div>
                <p className="mt-3 text-xs text-white/60">Click outside or press Esc to close</p>
            </div>
        </div>
    );
}

export const ItemDetailsModal = ({
    isOpen,
    onClose,
    item,
    isLoading = false,
    error = null,
}: ItemDetailsModalProps) => {
    const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null);
    const [activeVariantId, setActiveVariantId] = useState<number | null>(null);

    useEffect(() => {
        if (!isOpen) {
            setImagePreview(null);
            setActiveVariantId(null);
        }
    }, [isOpen]);

    useEffect(() => {
        if (item) {
            setActiveVariantId(item.selectedVariantId ?? item.id);
        }
    }, [item]);

    const activeVariant: StockVariant | null = item?.variants?.length
        ? item.variants.find((v) => v.id === activeVariantId) ?? item.variants[0]
        : null;

    const displayPartNumber = activeVariant?.partNumber ?? item?.partNumber ?? '';
    const displayNacSubCode = activeVariant?.nacCode ?? item?.nacCode ?? '';
    const displayVirtualBalance = activeVariant?.virtualBalance ?? item?.virtualBalance;
    const displayTrueBalance = activeVariant?.trueBalance ?? item?.trueBalance;
    const displayAvgCost = activeVariant?.averageCostPerUnit ?? item?.averageCostPerUnit;

    const openImagePreview = useCallback((preview: ImagePreview) => {
        setImagePreview(preview);
    }, []);

    const closeImagePreview = useCallback(() => {
        setImagePreview(null);
    }, []);

    const imageUrl = item
        ? resolveImageUrl(
              activeVariant?.imageUrl || item.imageUrl,
              '/images/nepal_airlines_logo.png'
          )
        : '';
    const imageAlt = item?.itemName || 'Item Image';

    return (
        <>
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
                                                <p className="mt-1 font-mono text-sm text-[#003594]">
                                                    {item.nacCode}
                                                    {activeVariant && activeVariant.nacCode !== item.nacCode && (
                                                        <span className="ml-2 text-slate-500">→ {activeVariant.nacCode}</span>
                                                    )}
                                                </p>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            className="rounded-full p-1 hover:bg-[#003594]/10 transition-colors"
                                            aria-label="Close item details"
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
                                                <ExpandableImage
                                                    src={imageUrl}
                                                    alt={imageAlt}
                                                    caption={`${displayNacSubCode} — ${displayPartNumber}`}
                                                    onExpand={openImagePreview}
                                                    className="aspect-square rounded-xl"
                                                    sizes="300px"
                                                />

                                                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                                                    <div className="space-y-4">
                                                        <div>
                                                            <h4 className="text-sm font-medium text-[#003594]">Family NAC</h4>
                                                            <p className="mt-1 text-lg font-semibold text-gray-900">{item.nacCode}</p>
                                                        </div>
                                                        {activeVariant && (
                                                            <div>
                                                                <h4 className="text-sm font-medium text-[#003594]">Sub-code</h4>
                                                                <p className="mt-1 font-mono text-lg font-semibold text-[#003594]">{activeVariant.nacCode}</p>
                                                            </div>
                                                        )}
                                                        <div>
                                                            <h4 className="text-sm font-medium text-[#003594]">Part Number</h4>
                                                            <p className="mt-1 text-lg font-semibold text-gray-900">{displayPartNumber}</p>
                                                        </div>
                                                        <div>
                                                            <h4 className="text-sm font-medium text-[#003594]">Item Name</h4>
                                                            <p className="mt-1 text-lg font-semibold text-gray-900">{item.itemName}</p>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-4">
                                                        <div>
                                                            <h4 className="text-sm font-medium text-[#003594]">Virtual balance</h4>
                                                            <p className="mt-0.5 text-xs text-slate-500">This variant · RRP may be pending</p>
                                                            <Badge className="mt-1 border-sky-200 bg-sky-50 text-base font-semibold text-sky-800">
                                                                {displayVirtualBalance}
                                                            </Badge>
                                                            {(item.totalVirtualBalance ?? item.virtualBalance) !== displayVirtualBalance && (
                                                                <p className="mt-1 text-xs text-slate-500">
                                                                    Family total: {item.totalVirtualBalance ?? item.virtualBalance}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <h4 className="text-sm font-medium text-[#003594]">True balance</h4>
                                                            <p className="mt-0.5 text-xs text-slate-500">This variant · RRP completed</p>
                                                            <Badge className="mt-1 border-emerald-200 bg-emerald-50 text-base font-semibold text-emerald-800">
                                                                {displayTrueBalance}
                                                            </Badge>
                                                            {(item.totalTrueBalance ?? item.trueBalance) !== displayTrueBalance && (
                                                                <p className="mt-1 text-xs text-slate-500">
                                                                    Family total: {item.totalTrueBalance ?? item.trueBalance}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <h4 className="text-sm font-medium text-[#003594]">Avg. cost / unit</h4>
                                                            <p className="mt-1 text-lg font-semibold text-[#003594]">
                                                                NPR {Number(displayAvgCost || 0).toFixed(2)}
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

                                            {item.variants && item.variants.length > 1 && (
                                                <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4">
                                                    <h4 className="text-sm font-semibold text-[#003594] mb-1">Part number variants</h4>
                                                    <p className="mb-4 text-xs text-slate-500">
                                                        Select a variant to view its balances and photo. Click any photo to enlarge.
                                                    </p>
                                                    <div className="space-y-3">
                                                        {item.variants.map((variant) => {
                                                            const variantImage = resolveImageUrl(
                                                                variant.imageUrl || '',
                                                                '/images/nepal_airlines_logo.png'
                                                            );
                                                            const isActive = variant.id === activeVariantId;
                                                            return (
                                                                <button
                                                                    key={variant.id}
                                                                    type="button"
                                                                    onClick={() => setActiveVariantId(variant.id)}
                                                                    className={cn(
                                                                        'flex w-full flex-col gap-4 rounded-lg border bg-white p-4 text-left transition-colors sm:flex-row sm:items-center',
                                                                        isActive
                                                                            ? 'border-[#003594] ring-2 ring-[#003594]/20'
                                                                            : 'border-slate-200 hover:border-[#003594]/30'
                                                                    )}
                                                                >
                                                                    <div
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            openImagePreview({
                                                                                src: variantImage,
                                                                                alt: variant.partNumber,
                                                                                caption: `${variant.nacCode} — ${variant.partNumber}`,
                                                                            });
                                                                        }}
                                                                        className="shrink-0"
                                                                    >
                                                                        <ExpandableImage
                                                                            src={variantImage}
                                                                            alt={variant.partNumber}
                                                                            caption={`${variant.nacCode} — ${variant.partNumber}`}
                                                                            onExpand={openImagePreview}
                                                                            className="h-24 w-24 rounded-lg sm:h-20 sm:w-20 pointer-events-none"
                                                                            sizes="96px"
                                                                        />
                                                                    </div>
                                                                    <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                                                                        <div>
                                                                            <p className="text-xs text-slate-500">Sub-code</p>
                                                                            <p className="font-mono font-semibold text-[#003594]">{variant.nacCode}</p>
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-xs text-slate-500">Part number</p>
                                                                            <p className="font-semibold">{variant.partNumber}</p>
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-xs text-slate-500">Virtual</p>
                                                                            <p className="font-semibold text-sky-800">{variant.virtualBalance}</p>
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-xs text-slate-500">True</p>
                                                                            <p className="font-semibold text-emerald-800">{variant.trueBalance}</p>
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-xs text-slate-500">Avg. cost</p>
                                                                            <p className="font-semibold text-[#003594]">
                                                                                NPR {Number(variant.averageCostPerUnit || 0).toFixed(2)}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                    {isActive && (
                                                                        <Badge className="self-start sm:self-center bg-[#003594]/10 text-[#003594] shrink-0">
                                                                            Selected
                                                                        </Badge>
                                                                    )}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

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

            {imagePreview && (
                <ImagePreviewOverlay preview={imagePreview} onClose={closeImagePreview} />
            )}
        </>
    );
};
