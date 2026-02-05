'use client';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { X, Maximize2 } from 'lucide-react';
import { ItemDetails } from '@/types/item';
import Image from 'next/image';
interface ItemDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: ItemDetails | null;
}
export const ItemDetailsModal = ({ isOpen, onClose, item }: ItemDetailsModalProps) => {
    if (!item)
        return null;
    const imageUrl = item.imageUrl
        ? item.imageUrl.startsWith('http')
            ? item.imageUrl
            : item.imageUrl.startsWith('/images/')
                ? `/api${item.imageUrl}`
                : item.imageUrl
        : '/images/nepal_airlines_logo.png';
    const imageAlt = item.itemName || 'Item Image';
    const handleImageClick = () => {
        window.open(imageUrl, '_blank');
    };
    return (<Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="fixed inset-0 bg-black/25"/>
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-200" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
              <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex items-center justify-between mb-6">
                  <Dialog.Title as="h3" className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
                    Item Details
                  </Dialog.Title>
                  <button onClick={onClose} className="rounded-full p-1 hover:bg-[#003594]/10 transition-colors">
                    <X className="h-6 w-6 text-[#003594] hover:text-[#d2293b] transition-colors"/>
                  </button>
                </div>

                <div className="grid grid-cols-[300px_1fr] gap-8">
                  <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 cursor-pointer group border border-[#003594]/10 hover:border-[#d2293b]/20 transition-colors" onClick={handleImageClick}>
                    <Image src={imageUrl} alt={imageAlt} fill className="object-cover transition-transform group-hover:scale-105" sizes="300px" unoptimized/>
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Maximize2 className="h-8 w-8 text-white"/>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
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
                      <div>
                        <h4 className="text-sm font-medium text-[#003594]">Equipment Number</h4>
                        <p className="mt-1 text-lg font-semibold text-gray-900">{item.equipmentNumber}</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h4 className="text-sm font-medium text-[#003594]">True Balance</h4>
                        <p className="mt-1 text-lg font-semibold text-[#003594]">{item.trueBalance}</p>
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
                      <div>
                        <h4 className="text-sm font-medium text-[#003594]">Card Number</h4>
                        <p className="mt-1 text-lg font-semibold text-gray-900">{item.cardNumber}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex justify-end">
                  <button type="button" className="inline-flex justify-center rounded-md border border-transparent bg-[#003594] px-4 py-2 text-sm font-medium text-white hover:bg-[#d2293b] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#003594] focus-visible:ring-offset-2 transition-colors" onClick={onClose}>
                    Close
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>);
};
