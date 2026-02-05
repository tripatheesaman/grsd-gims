'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/utils/utils';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from '@/components/ui/table';
import { useRRP } from '@/hooks/useRRP';
import { useCustomToast } from '@/components/ui/custom-toast';
interface RRPPreviewProps {
    cart: CartItem[];
    rrpDate: string;
    supplier: string;
    inspectionUser: string;
    invoiceDate: string;
    invoiceNumber: string;
    airwayBillNumber?: string;
    poNumber?: string;
    customsNumber?: string;
    customsDate?: string;
    freightCharge: number;
    forexRate: number;
    currency: string;
    onInvoiceDateChange: (date: Date | null) => void;
    onInvoiceNumberChange: (value: string) => void;
    onAirwayBillNumberChange: (value: string) => void;
    onPoNumberChange: (value: string) => void;
    onCustomsNumberChange: (value: string) => void;
    onCustomsDateChange: (date: Date | null) => void;
}
interface CartItem {
    id: number;
    request_number: string;
    request_date: string;
    nac_code: string;
    item_name: string;
    part_number: string;
    equipment_number: string;
    quantity: number;
    unit: string;
    price: number;
    vat: boolean;
    customsCharge?: number;
    forex_rate?: number;
    currency: string;
}
export default function RRPPreview({ cart, rrpDate, supplier, inspectionUser, invoiceDate, invoiceNumber, airwayBillNumber, poNumber, customsNumber, customsDate, freightCharge, forexRate, currency, onInvoiceDateChange, onInvoiceNumberChange, onAirwayBillNumberChange, onPoNumberChange, onCustomsNumberChange, onCustomsDateChange, }: RRPPreviewProps) {
    const { config } = useRRP();
    const { showErrorToast } = useCustomToast();
    const vatRate = config?.vat_rate || 0;
    const customServiceCharge = config?.customServiceCharge || 565;
    const isForeign = currency !== 'NPR';
    const calculateTotals = () => {
        try {
            if (!Array.isArray(cart) || cart.length === 0) {
                showErrorToast({
                    title: "Error",
                    message: "Cart is empty or invalid",
                    duration: 3000,
                });
                return {
                    rows: [],
                    totals: {
                        itemPrice: 0,
                        freightCharge: 0,
                        customsCharge: 0,
                        customServiceCharge: 0,
                        vat: 0,
                        total: 0,
                    },
                };
            }
            const totalItemPrice = cart.reduce((sum, item) => {
                if (typeof item.price !== 'number' || isNaN(item.price)) {
                    throw new Error(`Invalid price for item: ${item.item_name}`);
                }
                const itemPrice = item.price * (item.forex_rate || 1);
                return sum + itemPrice;
            }, 0);
            const freightChargePerItem = totalItemPrice > 0
                ? cart.map(item => {
                    const itemPrice = item.price * (item.forex_rate || 1);
                    return (itemPrice / totalItemPrice) * freightCharge * (item.forex_rate || 1);
                })
                : cart.map(() => freightCharge / cart.length);
            const customServiceChargePerItem = isForeign && totalItemPrice > 0
                ? cart.map(item => {
                    const itemPrice = item.price * (item.forex_rate || 1);
                    return (itemPrice / totalItemPrice) * customServiceCharge;
                })
                : cart.map(() => 0);
            const rows = cart.map((item, index) => {
                const itemPrice = item.price * (item.forex_rate || 1);
                const itemFreightCharge = freightChargePerItem[index];
                const itemCustomsCharge = item.customsCharge || 0;
                const itemCustomServiceCharge = customServiceChargePerItem[index];
                const itemVat = item.vat ? (itemPrice + itemFreightCharge + itemCustomsCharge + itemCustomServiceCharge) * (vatRate / 100) : 0;
                const total = itemPrice + itemFreightCharge + itemCustomsCharge + itemCustomServiceCharge + itemVat;
                return {
                    ...item,
                    itemPrice,
                    itemFreightCharge,
                    itemCustomsCharge,
                    itemCustomServiceCharge,
                    itemVat,
                    total,
                };
            });
            const totals = rows.reduce((acc, row) => ({
                itemPrice: acc.itemPrice + row.itemPrice,
                freightCharge: acc.freightCharge + row.itemFreightCharge,
                customsCharge: acc.customsCharge + row.itemCustomsCharge,
                customServiceCharge: acc.customServiceCharge + row.itemCustomServiceCharge,
                vat: acc.vat + row.itemVat,
                total: acc.total + row.total,
            }), {
                itemPrice: 0,
                freightCharge: 0,
                customsCharge: 0,
                customServiceCharge: 0,
                vat: 0,
                total: 0,
            });
            return { rows, totals };
        }
        catch (error) {
            showErrorToast({
                title: "Calculation Error",
                message: error instanceof Error ? error.message : "Failed to calculate totals",
                duration: 5000,
            });
            return {
                rows: [],
                totals: {
                    itemPrice: 0,
                    freightCharge: 0,
                    customsCharge: 0,
                    customServiceCharge: 0,
                    vat: 0,
                    total: 0,
                },
            };
        }
    };
    const { rows, totals } = calculateTotals();
    const requestNumbers = Array.isArray(cart) && cart.length > 0
        ? [...new Set(cart.map(item => item.request_number))].join(', ')
        : '';
    const requestDates = Array.isArray(cart) && cart.length > 0
        ? [...new Set(cart.map(item => item.request_date))].join(', ')
        : '';
    const chosenCurrency = Array.isArray(cart) && cart.length > 0 ? cart[0].currency : currency;
    const displayCurrency = "NPR";
    const displayForexRate = Array.isArray(cart) && cart.length > 0 ? cart[0].forex_rate : forexRate;
    return (<div className="space-y-6">
      <Card className="bg-white rounded-lg shadow-xl border-[#002a6e]/10">
        <CardHeader className="pb-4 border-b border-[#002a6e]/10">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">RRP Preview</CardTitle>
              <div className="mt-2 space-y-1">
                <p><span className="font-semibold text-[#003594]">RRP Date:</span> {new Date(rrpDate).toLocaleDateString()}</p>
                <p><span className="font-semibold text-[#003594]">Supplier:</span> {supplier}</p>
                <p><span className="font-semibold text-[#003594]">Inspection User:</span> {inspectionUser}</p>
                <p><span className="font-semibold text-[#003594]">Currency:</span> {chosenCurrency}</p>
                {displayForexRate !== 1 && <p><span className="font-semibold text-[#003594]">Forex Rate:</span> {displayForexRate}</p>}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border border-[#002a6e]/10 rounded-lg overflow-x-auto bg-[#f8fafc] mb-6">
            <Table className="min-w-[900px]">
            <TableHeader>
                <TableRow className="bg-[#003594]/5">
                  <TableHead className="text-[#003594] font-semibold">NAC Code</TableHead>
                  <TableHead className="text-[#003594] font-semibold">Item Name</TableHead>
                  <TableHead className="text-[#003594] font-semibold">Part Number</TableHead>
                  <TableHead className="text-[#003594] font-semibold text-right">Quantity</TableHead>
                  <TableHead className="text-[#003594] font-semibold">Unit</TableHead>
                  <TableHead className="text-[#003594] font-semibold text-right">Item Price</TableHead>
                  <TableHead className="text-[#003594] font-semibold text-right">Customs Charge</TableHead>
                  {isForeign && <TableHead className="text-[#003594] font-semibold text-right">Custom Service</TableHead>}
                  <TableHead className="text-[#003594] font-semibold text-right">Freight Charge</TableHead>
                  <TableHead className="text-[#003594] font-semibold text-right">VAT</TableHead>
                  <TableHead className="text-[#003594] font-semibold text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (<TableRow key={index} className="border-t border-[#002a6e]/10 hover:bg-[#003594]/5 transition-colors">
                    <TableCell className="whitespace-nowrap">{row.nac_code}</TableCell>
                    <TableCell className="whitespace-nowrap">{row.item_name}</TableCell>
                    <TableCell className="whitespace-nowrap">{row.part_number}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{row.quantity}</TableCell>
                    <TableCell className="whitespace-nowrap">{row.unit}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{displayCurrency} {row.itemPrice.toFixed(2)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{displayCurrency} {row.itemCustomsCharge.toFixed(2)}</TableCell>
                    {isForeign && <TableCell className="text-right whitespace-nowrap">{displayCurrency} {row.itemCustomServiceCharge.toFixed(2)}</TableCell>}
                    <TableCell className="text-right whitespace-nowrap">{displayCurrency} {row.itemFreightCharge.toFixed(2)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{displayCurrency} {row.itemVat.toFixed(2)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{displayCurrency} {row.total.toFixed(2)}</TableCell>
                </TableRow>))}
                <TableRow className="font-bold border-t border-[#002a6e]/10">
                <TableCell colSpan={5}>Total</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{displayCurrency} {totals.itemPrice.toFixed(2)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{displayCurrency} {totals.customsCharge.toFixed(2)}</TableCell>
                  {isForeign && <TableCell className="text-right whitespace-nowrap">{displayCurrency} {totals.customServiceCharge.toFixed(2)}</TableCell>}
                  <TableCell className="text-right whitespace-nowrap">{displayCurrency} {totals.freightCharge.toFixed(2)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{displayCurrency} {totals.vat.toFixed(2)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{displayCurrency} {totals.total.toFixed(2)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-[#003594]">Invoice Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal border-[#002a6e]/10 focus:ring-[#003594]", !invoiceDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4"/>
                      {invoiceDate ? format(new Date(invoiceDate), "PPP") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar value={invoiceDate ? new Date(invoiceDate) : undefined} onChange={onInvoiceDateChange} className="rounded-md border border-[#002a6e]/10"/>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-[#003594]">Invoice Number</Label>
                <Input value={invoiceNumber} onChange={(e) => onInvoiceNumberChange(e.target.value)} className="border-[#002a6e]/10 focus:ring-[#003594]"/>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-[#003594]">Request Numbers</Label>
                <Input value={requestNumbers} disabled className="bg-gray-50 border-[#002a6e]/10"/>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-[#003594]">Request Dates</Label>
                <Input value={requestDates} disabled className="bg-gray-50 border-[#002a6e]/10"/>
              </div>
            </div>

            <div className="space-y-4">
              {customsNumber !== undefined && (<>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#003594]">Customs Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal border-[#002a6e]/10 focus:ring-[#003594]", !customsDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4"/>
                          {customsDate ? format(new Date(customsDate), "PPP") : "Select date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar value={customsDate ? new Date(customsDate) : undefined} onChange={onCustomsDateChange} className="rounded-md border border-[#002a6e]/10"/>
                      </PopoverContent>
                    </Popover>
                  </div>
                <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#003594]">Customs Number</Label>
                  <Input value={customsNumber} onChange={(e) => onCustomsNumberChange(e.target.value)} className="border-[#002a6e]/10 focus:ring-[#003594]"/>
                </div>
                </>)}

              {airwayBillNumber !== undefined && (<div className="space-y-2">
                  <Label className="text-sm font-medium text-[#003594]">Airway Bill Number</Label>
                  <Input value={airwayBillNumber} onChange={(e) => onAirwayBillNumberChange(e.target.value)} className="border-[#002a6e]/10 focus:ring-[#003594]"/>
                </div>)}

              {poNumber !== undefined && (<div className="space-y-2">
                  <Label className="text-sm font-medium text-[#003594]">PO Number</Label>
                  <Input value={poNumber} onChange={(e) => onPoNumberChange(e.target.value)} className="border-[#002a6e]/10 focus:ring-[#003594]"/>
                </div>)}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>);
}
