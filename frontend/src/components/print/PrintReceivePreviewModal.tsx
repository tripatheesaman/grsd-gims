'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { cn } from '@/utils/utils';
import Image from 'next/image';
interface PrintReceivePreviewModalProps {
    receive: {
        receiveNumber: string;
        receiveDate: string;
        receivedBy: string;
        approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
        items: {
            id: number;
            nacCode: string;
            partNumber: string;
            itemName: string;
            receiveQuantity: number;
            equipmentNumber: string;
            imageUrl: string;
            location: string;
            cardNumber: string;
            unit: string;
            remarks: string;
        }[];
    } | null;
    isOpen: boolean;
    onClose: () => void;
}
export function PrintReceivePreviewModal({ receive, isOpen, onClose }: PrintReceivePreviewModalProps) {
    if (!receive)
        return null;
    return (<Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl bg-white rounded-lg shadow-xl border-[#002a6e]/10">
        <DialogHeader className="pb-4 border-b border-[#002a6e]/10">
          <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
            Receive Preview - {receive.receiveNumber}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-8 py-4">
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm font-medium text-[#003594]">Receive Date</p>
              <p className="text-lg font-semibold">{format(new Date(receive.receiveDate), 'PPP')}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-[#003594]">Received By</p>
              <p className="text-lg font-semibold">{receive.receivedBy}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-[#003594]">Status</p>
              <span className={cn("inline-flex items-center px-3 py-1 rounded-full text-xs font-medium", receive.approvalStatus === 'APPROVED' && "bg-green-100 text-green-800", receive.approvalStatus === 'PENDING' && "bg-yellow-100 text-yellow-800", receive.approvalStatus === 'REJECTED' && "bg-red-100 text-red-800")}>
                {receive.approvalStatus}
              </span>
            </div>
          </div>

          
          <div className="border border-[#002a6e]/10 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="bg-[#003594]/5">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[#003594] uppercase tracking-wider">Item Name</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[#003594] uppercase tracking-wider">Part Number</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[#003594] uppercase tracking-wider">Equipment Number</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[#003594] uppercase tracking-wider">Quantity</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[#003594] uppercase tracking-wider">Location</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[#003594] uppercase tracking-wider">Card Number</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[#003594] uppercase tracking-wider">Image</th>
                  </tr>
                </thead>
                <tbody>
                  {receive.items.map((item) => (<tr key={item.id} className="border-t border-[#002a6e]/10 hover:bg-[#003594]/5 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">{item.itemName}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{item.partNumber}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{item.equipmentNumber}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{item.receiveQuantity} {item.unit}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{item.location}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{item.cardNumber}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Image src={item.imageUrl
                ? item.imageUrl.startsWith('http')
                    ? item.imageUrl
                    : item.imageUrl.startsWith('/images/')
                        ? `/api${item.imageUrl}`
                        : item.imageUrl
                : '/images/nepal_airlines_logo.png'} alt={item.itemName} width={64} height={64} className="w-16 h-16 object-cover rounded-lg border border-[#002a6e]/10" onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = '/images/nepal_airlines_logo.png';
            }} unoptimized/>
                      </td>
                    </tr>))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>);
}
