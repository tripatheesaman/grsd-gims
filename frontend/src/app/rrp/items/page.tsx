'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { API } from '@/lib/api';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Trash2, ArrowLeft } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useRRP } from '@/hooks/useRRP';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
interface RRPItem {
    id: number;
    request_number: string;
    request_date: string;
    receive_date: string;
    equipment_number: string;
    requested_by: string;
    received_by: string | null;
    item_name: string;
    nac_code: string;
    part_number: string;
    received_quantity: string;
    unit: string;
}
interface CartItem extends Omit<RRPItem, 'received_quantity'> {
    price: number;
    quantity: number;
    vat: boolean;
    customsCharge?: number;
    total: number;
    rrp_date: string;
    currency: string;
    forex_rate: number;
}
export default function RRPItemsPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { showErrorToast } = useCustomToast();
    const { isLoading: isConfigLoading, getCurrencies } = useRRP();
    const [isLoading, setIsLoading] = useState(true);
    const [items, setItems] = useState<RRPItem[]>([]);
    const [filteredItems, setFilteredItems] = useState<RRPItem[]>([]);
    const [searchQueries, setSearchQueries] = useState({
        partNumber: '',
        equipmentNumber: '',
        universal: '',
    });
    const [cart, setCart] = useState<CartItem[]>(() => {
        try {
            const cartData = searchParams.get('cart');
            return cartData ? JSON.parse(decodeURIComponent(cartData)) : [];
        }
        catch {
            return [];
        }
    });
    const [selectedItem, setSelectedItem] = useState<CartItem | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const rrpType = searchParams.get('type') || 'local';
    const rrpDate = searchParams.get('rrpDate');
    useEffect(() => {
        const fetchItems = async () => {
            try {
                const response = await API.get('/api/rrp/items');
                setItems(response.data);
                setFilteredItems(response.data);
            }
            catch {
            }
            finally {
                setIsLoading(false);
            }
        };
        fetchItems();
    }, []);
    useEffect(() => {
        const filtered = items.filter(item => (searchQueries.partNumber ? item.part_number.toLowerCase().includes(searchQueries.partNumber.toLowerCase()) : true) &&
            (searchQueries.equipmentNumber ? item.equipment_number.toLowerCase().includes(searchQueries.equipmentNumber.toLowerCase()) : true) &&
            (!searchQueries.universal ||
                item.nac_code.toLowerCase().includes(searchQueries.universal.toLowerCase()) ||
                item.item_name.toLowerCase().includes(searchQueries.universal.toLowerCase()) ||
                item.request_number.toLowerCase().includes(searchQueries.universal.toLowerCase())));
        setFilteredItems(filtered);
    }, [searchQueries, items]);
    const handleItemDoubleClick = (item: RRPItem) => {
        const isForeign = rrpType === 'foreign';
        const cartItem: CartItem = {
            ...item,
            price: 0,
            quantity: parseInt(item.received_quantity || '0'),
            vat: false,
            customsCharge: isForeign ? 0 : undefined,
            total: 0,
            rrp_date: rrpDate || new Date().toISOString(),
            currency: isForeign ? (searchParams.get('currency') || 'USD') : 'NPR',
            forex_rate: isForeign ? parseFloat(searchParams.get('forexRate') || '1') : 1,
        };
        setSelectedItem(cartItem);
        setIsDialogOpen(true);
    };
    const handleAddToCart = (item: CartItem, price: number, quantity: number, vat: boolean, customsCharge?: number) => {
        const isForeign = rrpType === 'foreign';
        if (isForeign && (!customsCharge || customsCharge <= 0)) {
            showErrorToast({
                title: "Validation Error",
                message: "Customs charge is required for foreign RRP",
                duration: 3000,
            });
            return;
        }
        const existingItemIndex = cart.findIndex(cartItem => cartItem.id === item.id);
        if (existingItemIndex !== -1) {
            showErrorToast({
                title: "Validation Error",
                message: "This item is already in the cart",
                duration: 3000,
            });
            return;
        }
        const total = price * quantity * (vat ? 1.15 : 1) + (customsCharge || 0);
        const cartItem: CartItem = {
            ...item,
            price,
            quantity,
            vat,
            customsCharge: isForeign ? customsCharge : undefined,
            total,
            rrp_date: rrpDate || new Date().toISOString(),
            currency: isForeign ? item.currency : 'NPR',
            forex_rate: isForeign ? item.forex_rate : 1,
        };
        setCart(prev => [...prev, cartItem]);
        setIsDialogOpen(false);
        setSelectedItem(null);
    };
    const handleRemoveFromCart = (index: number) => {
        setCart(prev => prev.filter((_, i) => i !== index));
    };
    const handleSubmit = async () => {
        if (cart.length === 0) {
            showErrorToast({
                title: "Validation Error",
                message: "Please add at least one item to the cart",
                duration: 3000,
            });
            return;
        }
        try {
            const params = new URLSearchParams(searchParams);
            params.set('cart', encodeURIComponent(JSON.stringify(cart)));
            router.push(`/rrp/preview?${params.toString()}`);
        }
        catch {
            showErrorToast({
                title: "Error",
                message: "Failed to submit RRP",
                duration: 3000,
            });
        }
    };
    const handleBack = () => {
        const currentParams = new URLSearchParams();
        searchParams.forEach((value, key) => {
            currentParams.set(key, value);
        });
        if (!currentParams.has('type')) {
            currentParams.set('type', rrpType || 'local');
        }
        if (cart.length > 0) {
            currentParams.set('cart', encodeURIComponent(JSON.stringify(cart)));
        }
        router.push(`/rrp/new?${currentParams.toString()}`);
    };
    if (isLoading || isConfigLoading) {
        return (<div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#003594]"/>
      </div>);
    }
    return (<div className="container mx-auto p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={handleBack} className="hover:bg-[#003594]/5 text-[#003594]">
            <ArrowLeft className="h-5 w-5"/>
          </Button>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
            RRP Items
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          <Card className="border-[#002a6e]/10 hover:border-[#d2293b]/20 transition-all duration-300 shadow-sm">
            <CardHeader className="bg-[#003594]/5 border-b border-[#002a6e]/10">
              <CardTitle className="text-lg font-semibold text-[#003594]">Available Items</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#003594]">Part Number</Label>
                    <Input value={searchQueries.partNumber} onChange={(e) => setSearchQueries(prev => ({ ...prev, partNumber: e.target.value }))} placeholder="Search by part number" className="border-[#002a6e]/10 focus:ring-[#003594]"/>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#003594]">Equipment Number</Label>
                    <Input value={searchQueries.equipmentNumber} onChange={(e) => setSearchQueries(prev => ({ ...prev, equipmentNumber: e.target.value }))} placeholder="Search by equipment number" className="border-[#002a6e]/10 focus:ring-[#003594]"/>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#003594]">Universal Search</Label>
                    <Input value={searchQueries.universal} onChange={(e) => setSearchQueries(prev => ({ ...prev, universal: e.target.value }))} placeholder="Search by NAC code, item name, or request number" className="border-[#002a6e]/10 focus:ring-[#003594]"/>
                  </div>
                </div>

                <div className="border border-[#002a6e]/10 rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-[#003594]/5 hover:bg-[#003594]/10">
                        <TableHead className="text-[#003594] font-semibold">Request Number</TableHead>
                        <TableHead className="text-[#003594] font-semibold">NAC Code</TableHead>
                        <TableHead className="text-[#003594] font-semibold">Item Name</TableHead>
                        <TableHead className="text-[#003594] font-semibold">Part Number</TableHead>
                        <TableHead className="text-[#003594] font-semibold">Equipment Number</TableHead>
                        <TableHead className="text-[#003594] font-semibold text-right">Quantity</TableHead>
                        <TableHead className="text-[#003594] font-semibold">Unit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredItems.map((item) => (<TableRow key={item.id} className="cursor-pointer hover:bg-[#003594]/5 transition-colors" onDoubleClick={() => handleItemDoubleClick(item)}>
                          <TableCell>{item.request_number}</TableCell>
                          <TableCell>{item.nac_code}</TableCell>
                          <TableCell className="max-w-[200px] truncate" title={item.item_name}>{item.item_name}</TableCell>
                          <TableCell>{item.part_number}</TableCell>
                          <TableCell>{item.equipment_number}</TableCell>
                          <TableCell className="text-right">{item.received_quantity}</TableCell>
                          <TableCell>{item.unit}</TableCell>
                        </TableRow>))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>

          
          <Card className="border-[#002a6e]/10 hover:border-[#d2293b]/20 transition-all duration-300 shadow-sm">
            <CardHeader className="bg-[#003594]/5 border-b border-[#002a6e]/10">
              <CardTitle className="text-lg font-semibold text-[#003594]">Selected Items</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="border border-[#002a6e]/10 rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-[#003594]/5 hover:bg-[#003594]/10">
                        <TableHead className="text-[#003594] font-semibold">Request Number</TableHead>
                        <TableHead className="text-[#003594] font-semibold">NAC Code</TableHead>
                        <TableHead className="text-[#003594] font-semibold">Item Name</TableHead>
                        <TableHead className="text-[#003594] font-semibold">Part Number</TableHead>
                        <TableHead className="text-[#003594] font-semibold">Equipment Number</TableHead>
                        <TableHead className="text-[#003594] font-semibold text-right">Price</TableHead>
                        {rrpType === 'foreign' && (<>
                            <TableHead className="text-[#003594] font-semibold text-right">Customs</TableHead>
                            <TableHead className="text-[#003594] font-semibold text-right">Forex</TableHead>
                            <TableHead className="text-[#003594] font-semibold">Currency</TableHead>
                          </>)}
                        <TableHead className="text-[#003594] font-semibold text-right">Quantity</TableHead>
                        <TableHead className="text-[#003594] font-semibold">Unit</TableHead>
                        <TableHead className="text-[#003594] font-semibold">VAT</TableHead>
                        <TableHead className="text-[#003594] font-semibold text-right">Total</TableHead>
                        <TableHead className="text-[#003594] font-semibold">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cart.map((item, index) => (<TableRow key={index} className="hover:bg-[#003594]/5 transition-colors">
                          <TableCell>{item.request_number}</TableCell>
                          <TableCell>{item.nac_code}</TableCell>
                          <TableCell className="max-w-[200px] truncate" title={item.item_name}>{item.item_name}</TableCell>
                          <TableCell>{item.part_number}</TableCell>
                          <TableCell>{item.equipment_number}</TableCell>
                          <TableCell className="text-right">{item.price.toFixed(2)}</TableCell>
                          {rrpType === 'foreign' && (<>
                              <TableCell className="text-right">{(item.customsCharge || 0).toFixed(2)}</TableCell>
                              <TableCell className="text-right">{item.forex_rate?.toFixed(2) || '-'}</TableCell>
                              <TableCell>{item.currency || '-'}</TableCell>
                            </>)}
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell>{item.unit}</TableCell>
                          <TableCell>{item.vat ? 'Yes' : 'No'}</TableCell>
                          <TableCell className="text-right">{item.total.toFixed(2)}</TableCell>
                          <TableCell>
                              <Button variant="ghost" size="sm" onClick={() => handleRemoveFromCart(index)} className="text-[#d2293b] hover:text-[#b31f2f] hover:bg-[#d2293b]/5">
                                <Trash2 className="h-4 w-4"/>
                              </Button>
                          </TableCell>
                        </TableRow>))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-[#002a6e]/10">
                  <Button variant="outline" onClick={handleBack} className="border-[#d2293b]/20 hover:border-[#d2293b] hover:bg-[#d2293b]/5 text-[#d2293b]">
                    Back
                  </Button>
                  <Button onClick={handleSubmit} className="bg-[#003594] hover:bg-[#002a6e] text-white transition-colors">
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[425px] border-[#002a6e]/10 bg-white">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold text-[#003594]">
                {selectedItem ? 'Add Item' : 'Edit Item'} ({rrpType === 'foreign' ? 'Foreign' : 'Local'} RRP)
              </DialogTitle>
            </DialogHeader>
            {selectedItem && (<div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[#003594]">Price *</Label>
                  <Input type="number" defaultValue={selectedItem.price?.toString() || '0'} onChange={(e) => setSelectedItem({
                ...selectedItem,
                price: parseFloat(e.target.value)
            })} required className="border-[#002a6e]/10 focus:ring-[#003594]"/>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[#003594]">Quantity *</Label>
                  <Input type="number" defaultValue={selectedItem.quantity?.toString() || '0'} onChange={(e) => setSelectedItem({
                ...selectedItem,
                quantity: parseInt(e.target.value)
            })} required className="border-[#002a6e]/10 focus:ring-[#003594]"/>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch checked={selectedItem.vat} onCheckedChange={(checked) => setSelectedItem({
                ...selectedItem,
                vat: checked
            })} className="data-[state=checked]:bg-[#003594] data-[state=unchecked]:bg-gray-200"/>
                  <Label className="text-sm font-medium text-[#003594]">Include VAT</Label>
                </div>
                {rrpType === 'foreign' && (<>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-[#003594]">Customs Charge *</Label>
                      <Input type="number" defaultValue={selectedItem.customsCharge?.toString() || '0'} onChange={(e) => setSelectedItem({
                    ...selectedItem,
                    customsCharge: parseFloat(e.target.value)
                })} required className="border-[#002a6e]/10 focus:ring-[#003594]"/>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-[#003594]">Forex Rate</Label>
                      <Input type="number" defaultValue={selectedItem.forex_rate?.toString() || '1'} onChange={(e) => setSelectedItem({
                    ...selectedItem,
                    forex_rate: parseFloat(e.target.value)
                })} className="border-[#002a6e]/10 focus:ring-[#003594]"/>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-[#003594]">Currency</Label>
                      <Select value={selectedItem.currency} onValueChange={(value) => setSelectedItem({
                    ...selectedItem,
                    currency: value
                })}>
                        <SelectTrigger className="border-[#002a6e]/10 focus:ring-[#003594]">
                          <SelectValue placeholder="Select currency"/>
                        </SelectTrigger>
                        <SelectContent>
                          {getCurrencies().map((currency) => (<SelectItem key={currency} value={currency}>
                              {currency}
                            </SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>)}
                <div className="flex justify-end space-x-4 pt-4 border-t border-[#002a6e]/10">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="border-[#d2293b]/20 hover:border-[#d2293b] hover:bg-[#d2293b]/5 text-[#d2293b]">
                    Cancel
                  </Button>
                  <Button onClick={() => {
                if (selectedItem) {
                    if (rrpType === 'foreign' && (!selectedItem.customsCharge || selectedItem.customsCharge <= 0)) {
                        showErrorToast({
                            title: "Validation Error",
                            message: "Customs charge is required for foreign RRP",
                            duration: 3000,
                        });
                        return;
                    }
                    handleAddToCart(selectedItem, selectedItem.price, selectedItem.quantity, selectedItem.vat, selectedItem.customsCharge);
                }
            }} className="bg-[#003594] hover:bg-[#002a6e] text-white transition-colors">
                    {selectedItem ? 'Update' : 'Add'}
                  </Button>
                </div>
              </div>)}
          </DialogContent>
        </Dialog>
      </div>
    </div>);
}
