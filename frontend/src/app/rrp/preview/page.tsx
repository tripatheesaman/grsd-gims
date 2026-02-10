'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { API } from '@/lib/api';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft } from 'lucide-react';
import RRPPreview from '@/components/rrp/RRPPreview';
import { useRRP } from '@/hooks/useRRP';
import { useAuthContext } from '@/context/AuthContext';
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
    currency: string;
    forex_rate: number;
}
export default function RRPPreviewPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { showErrorToast, showSuccessToast } = useCustomToast();
    const { config } = useRRP();
    const { user } = useAuthContext();
    const [isLoading] = useState(false);
    const [cart] = useState<CartItem[]>(() => {
        try {
            const cartData = searchParams.get('cart');
            return cartData ? JSON.parse(decodeURIComponent(cartData)) : [];
        }
        catch {
            return [];
        }
    });
    const handleSubmit = async () => {
        try {
            const formattedCart = cart.map(item => ({
                receive_id: item.id,
                price: item.price,
                vat_status: item.vat,
                customs_charge: item.customsCharge || 0,
                quantity: item.quantity,
                unit: item.unit,
                nac_code: item.nac_code,
                item_name: item.item_name,
                part_number: item.part_number,
                equipment_number: item.equipment_number,
                request_number: item.request_number,
                request_date: item.request_date,
                currency: item.currency,
                forex_rate: item.forex_rate
            }));
            const submissionData = {
                type: searchParams.get('type') || 'local',
                rrp_date: searchParams.get('rrpDate'),
                invoice_date: searchParams.get('invoiceDate'),
                supplier: searchParams.get('supplier'),
                inspection_user: searchParams.get('inspectionUser'),
                invoice_number: searchParams.get('invoiceNumber'),
                freight_charge: parseFloat(searchParams.get('freightCharge') || '0'),
                custom_service_charge: searchParams.get('type') === 'foreign' ? (config?.customServiceCharge || 565) : 0,
                vat_rate: config?.vat_rate || 0,
                created_by: user?.UserInfo?.username || 'Unknown User',
                rrp_number: searchParams.get('rrpNumber'),
                ...(searchParams.get('type') === 'foreign' && {
                    customs_date: searchParams.get('customsDate'),
                    customs_number: searchParams.get('customsNumber'),
                    po_number: searchParams.get('poNumber'),
                    airway_bill_number: searchParams.get('airwayBillNumber'),
                    currency: searchParams.get('currency'),
                    forex_rate: parseFloat(searchParams.get('forexRate') || '1')
                }),
                items: formattedCart
            };
            await API.post('/api/rrp/create', submissionData);
            showSuccessToast({
                title: 'Success',
                message: "RRP submitted successfully",
                duration: 3000,
            });
            router.push('/dashboard');
        }
        catch {
            showErrorToast({
                title: 'Error',
                message: "Failed to submit RRP",
                duration: 3000,
            });
        }
    };
    if (isLoading) {
        return (<div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin"/>
      </div>);
    }
    return (<div className="container mx-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => {
            const params = new URLSearchParams(searchParams);
            params.set('cart', encodeURIComponent(JSON.stringify(cart)));
            router.push(`/rrp/items?${params.toString()}`);
        }} className="hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5"/>
          </Button>
          <h1 className="text-2xl font-bold">RRP Preview</h1>
        </div>

        <RRPPreview cart={cart} rrpDate={searchParams.get('rrpDate') || new Date().toISOString()} supplier={searchParams.get('supplier') || ''} inspectionUser={searchParams.get('inspectionUser') || ''} invoiceDate={searchParams.get('invoiceDate') || ''} invoiceNumber={searchParams.get('invoiceNumber') || ''} airwayBillNumber={searchParams.get('airwayBillNumber') || undefined} poNumber={searchParams.get('poNumber') || undefined} customsNumber={searchParams.get('customsNumber') || undefined} customsDate={searchParams.get('customsDate') || undefined} freightCharge={parseFloat(searchParams.get('freightCharge') || '0')} forexRate={parseFloat(searchParams.get('forexRate') || '1')} currency={searchParams.get('currency') || (searchParams.get('type') === 'foreign' ? 'USD' : 'NPR')} onInvoiceDateChange={(date) => {
            if (date) {
                const params = new URLSearchParams(searchParams);
                params.set('invoiceDate', date.toISOString());
                router.push(`/rrp/preview?${params.toString()}`);
            }
        }} onInvoiceNumberChange={(value) => {
            const params = new URLSearchParams(searchParams);
            params.set('invoiceNumber', value);
            router.push(`/rrp/preview?${params.toString()}`);
        }} onAirwayBillNumberChange={(value) => {
            const params = new URLSearchParams(searchParams);
            params.set('airwayBillNumber', value);
            router.push(`/rrp/preview?${params.toString()}`);
        }} onPoNumberChange={(value) => {
            const params = new URLSearchParams(searchParams);
            params.set('poNumber', value);
            router.push(`/rrp/preview?${params.toString()}`);
        }} onCustomsNumberChange={(value) => {
            const params = new URLSearchParams(searchParams);
            params.set('customsNumber', value);
            router.push(`/rrp/preview?${params.toString()}`);
        }} onCustomsDateChange={(date) => {
            if (date) {
                const params = new URLSearchParams(searchParams);
                params.set('customsDate', date.toISOString());
                router.push(`/rrp/preview?${params.toString()}`);
            }
        }}/>

        <div className="flex justify-end mt-6">
          <Button onClick={handleSubmit}>
            Submit RRP
          </Button>
        </div>
      </div>
    </div>);
}
