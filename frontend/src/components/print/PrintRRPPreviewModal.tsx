'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/utils/utils';
import { RRPSearchResult } from '@/types/rrp';
interface PrintRRPPreviewModalProps {
    rrp: RRPSearchResult | null;
    isOpen: boolean;
    onClose: () => void;
}
export const PrintRRPPreviewModal = ({ rrp, isOpen, onClose }: PrintRRPPreviewModalProps) => {
    if (!rrp)
        return null;
    return (<Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl bg-white rounded-lg shadow-xl border-[#002a6e]/10">
        <DialogHeader className="pb-4 border-b border-[#002a6e]/10">
          <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
            RRP Preview - {rrp.rrpNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-8 py-4">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm font-medium text-[#003594]">Date</p>
              <p className="text-lg font-semibold">{new Date(rrp.rrpDate).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-[#003594]">Supplier</p>
              <p className="text-lg font-semibold">{rrp.supplierName}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-[#003594]">Type</p>
              <span className={cn("inline-block px-3 py-1 rounded-full text-xs font-semibold", rrp.currency === 'NPR' ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800")}>
                {rrp.currency === 'NPR' ? 'LOCAL' : 'FOREIGN'}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-[#003594]">Status</p>
              <span className={cn("inline-block px-3 py-1 rounded-full text-xs font-semibold", rrp.approvalStatus === 'APPROVED' && "bg-green-100 text-green-800", rrp.approvalStatus === 'PENDING' && "bg-yellow-100 text-yellow-800", rrp.approvalStatus === 'REJECTED' && "bg-red-100 text-red-800")}>
                {rrp.approvalStatus}
              </span>
            </div>
          </div>

          
          <div>
            <h3 className="text-lg font-semibold text-[#003594] mb-4">Items</h3>
            <div className="border border-[#002a6e]/10 rounded-lg overflow-x-auto bg-[#f8fafc]">
              <table className="w-full min-w-[700px]">
                <thead className="bg-[#003594]/5">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[#003594] uppercase">Part Number</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[#003594] uppercase">Item Name</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[#003594] uppercase">Equipment Number</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[#003594] uppercase">Quantity</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[#003594] uppercase">Unit Price</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[#003594] uppercase">Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rrp.items.map((item) => (<tr key={item.id} className="border-t border-[#002a6e]/10 hover:bg-[#003594]/5 transition-colors">
                      <td className="px-6 py-3 whitespace-nowrap">{item.partNumber}</td>
                      <td className="px-6 py-3 whitespace-nowrap">{item.itemName}</td>
                      <td className="px-6 py-3 whitespace-nowrap">{item.equipmentNumber}</td>
                      <td className="px-6 py-3 whitespace-nowrap">{item.receivedQuantity} {item.unit}</td>
                      <td className="px-6 py-3 whitespace-nowrap">{item.itemPrice}</td>
                      <td className="px-6 py-3 whitespace-nowrap">{item.totalAmount}</td>
                    </tr>))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>);
};
