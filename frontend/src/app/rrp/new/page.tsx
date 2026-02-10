'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Card, CardContent } from '@/components/Card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { CalendarIcon, Loader2, ArrowLeft } from 'lucide-react';
import { cn } from '@/utils/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRRP } from '@/hooks/useRRP';
import { API } from '@/lib/api';
import { useAuthContext } from '@/context/AuthContext';
import { Switch } from '@/components/ui/switch';
interface RRPDates {
    rrpDate: Date | null;
    invoiceDate: Date | null;
    customsDate: Date | null;
}
interface LatestRRPInfo {
    rrpNumber: string | null;
    rrpDate: string | null;
    nextRRPNumber: string;
}
function toUTCDateString(date: Date | null): string | undefined {
    if (!date)
        return undefined;
    const localMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return new Date(Date.UTC(localMidnight.getFullYear(), localMidnight.getMonth(), localMidnight.getDate())).toISOString();
}
function isDateBefore(date1: Date, date2: Date): boolean {
    const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
    return d1 < d2;
}
export default function NewRRPPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const rrpType = searchParams.get('type') || 'local';
    const { showErrorToast } = useCustomToast();
    const { config, isLoading, getLocalSuppliers, getForeignSuppliers, getCurrencies } = useRRP();
    const { permissions } = useAuthContext();
    const [previousRRPDate, setPreviousRRPDate] = useState<Date | null>(null);
    const [isNewRRP] = useState(false);
    const [latestRRPInfo, setLatestRRPInfo] = useState<LatestRRPInfo | null>(null);
    const [dates, setDates] = useState<RRPDates>({
        rrpDate: searchParams.get('rrpDate') ? new Date(searchParams.get('rrpDate')!) : null,
        invoiceDate: searchParams.get('invoiceDate') ? new Date(searchParams.get('invoiceDate')!) : null,
        customsDate: searchParams.get('customsDate') ? new Date(searchParams.get('customsDate')!) : null,
    });
    const [selectedSupplier, setSelectedSupplier] = useState<string>(searchParams.get('supplier') || '');
    const [selectedInspectionUser, setSelectedInspectionUser] = useState<string>(searchParams.get('inspectionUser') || '');
    const [invoiceNumber, setInvoiceNumber] = useState<string>(searchParams.get('invoiceNumber') || '');
    const [poNumber, setPoNumber] = useState<string>(searchParams.get('poNumber') || '');
    const [airwayBillNumber, setAirwayBillNumber] = useState<string>(searchParams.get('airwayBillNumber') || '');
    const [customsNumber, setCustomsNumber] = useState<string>(searchParams.get('customsNumber') || '');
    const [freightCharge, setFreightCharge] = useState<string>(searchParams.get('freightCharge') || '0');
    const [selectedCurrency, setSelectedCurrency] = useState<string>(searchParams.get('currency') || '');
    const [forexRate, setForexRate] = useState<string>(searchParams.get('forexRate') || '');
    const rrpNumberFromParams = searchParams.get('rrpNumber');
    const notificationId = searchParams.get('notificationId');
    const isFromNotification = !!(rrpNumberFromParams && notificationId);
    const [rrpNumber, setRrpNumber] = useState<string>(isFromNotification ? rrpNumberFromParams : '');
    const [dateError, setDateError] = useState<string | null>(null);
    const [allowManualRRPNumberEdit, setAllowManualRRPNumberEdit] = useState(false);
    const canEditRRPNumber = permissions?.includes('can_edit_rrp_number');
    useEffect(() => {
        const fetchLatestRRPDetails = async () => {
            try {
                setAllowManualRRPNumberEdit(false);
                const response = await API.get(`/api/rrp/getlatestrrpdetails/${rrpType}`);
                if (response.status === 200) {
                    const data = response.data || {};
                    const nextNumber = data.nextRRPNumber || `${rrpType === 'local' ? 'L' : 'F'}001`;
                    setLatestRRPInfo({
                        rrpNumber: data.rrpNumber ?? null,
                        rrpDate: data.rrpDate ?? null,
                        nextRRPNumber: nextNumber,
                    });
                    if (data.rrpDate) {
                        setPreviousRRPDate(new Date(data.rrpDate));
                    }
                    else {
                        setPreviousRRPDate(null);
                    }
                    if (!isFromNotification) {
                        setRrpNumber(nextNumber);
                    }
                }
            }
            catch {
                const fallbackNumber = `${rrpType === 'local' ? 'L' : 'F'}001`;
                setLatestRRPInfo({
                    rrpNumber: null,
                    rrpDate: null,
                    nextRRPNumber: fallbackNumber,
                });
                setPreviousRRPDate(null);
                if (!isFromNotification) {
                    setRrpNumber(fallbackNumber);
                }
            }
        };
        fetchLatestRRPDetails();
    }, [rrpType, isFromNotification, setRrpNumber]);
    useEffect(() => {
        if (!isFromNotification && latestRRPInfo?.nextRRPNumber) {
            setRrpNumber(latestRRPInfo.nextRRPNumber);
        }
    }, [latestRRPInfo?.nextRRPNumber, isFromNotification]);
    useEffect(() => {
        if (dateError) {
            showErrorToast({
                title: 'Error',
                message: dateError,
                duration: 3000,
            });
            setDateError(null);
        }
    }, [dateError, showErrorToast]);
    const handleDateChange = (field: keyof RRPDates, date: Date | null) => {
        setDates(prev => {
            const newDates = { ...prev, [field]: date };
            if (field === 'rrpDate' && date) {
                if (isNewRRP && previousRRPDate && date && isDateBefore(date, previousRRPDate)) {
                    setDateError("RRP date cannot be less than the previous RRP date");
                    return prev;
                }
                newDates.invoiceDate = null;
                newDates.customsDate = null;
            }
            if (field === 'invoiceDate' && date) {
                if (newDates.rrpDate && date && date > newDates.rrpDate) {
                    setDateError("Invoice date cannot be greater than RRP date");
                    return prev;
                }
            }
            if (field === 'customsDate' && date) {
                if (newDates.rrpDate && date && date > newDates.rrpDate) {
                    setDateError("Customs date cannot be greater than RRP date");
                    return prev;
                }
            }
            return newDates;
        });
    };
    const handleNext = async () => {
        if (!dates.rrpDate || !dates.invoiceDate || !selectedSupplier || !invoiceNumber || !selectedInspectionUser || !rrpNumber || !freightCharge) {
            showErrorToast({
                title: 'Error',
                message: "Please fill in all required fields",
                duration: 3000,
            });
            return;
        }
        if (!rrpNumber || !rrpNumber.match(/^[LF]\d{3}(T\d+)?$/)) {
            showErrorToast({
                title: 'Error',
                message: "Invalid RRP number format. Must be in format L001 or L001T1",
                duration: 3000,
            });
            return;
        }
        if (rrpType === 'foreign' && (!poNumber || !airwayBillNumber || !selectedCurrency || !forexRate || !customsNumber || !dates.customsDate || !freightCharge)) {
            showErrorToast({
                title: 'Error',
                message: "Please fill in all required fields for foreign RRP",
                duration: 3000,
            });
            return;
        }
        try {
            const response = await API.get(`/api/rrp/verifyRRPNumber/${rrpNumber}?date=${toUTCDateString(dates.rrpDate)}`);
            if (response.status === 400) {
                showErrorToast({
                    title: 'Error',
                    message: response.data.message || "Invalid RRP number or date",
                    duration: 3000,
                });
                return;
            }
            if (response.status === 500) {
                showErrorToast({
                    title: 'Error',
                    message: response.data.message || "An error occurred while verifying RRP number",
                    duration: 3000,
                });
                return;
            }
            if (response.status === 200) {
                const responseData = response.data;
                const isEmptyResponse = Object.keys(responseData).length === 0;
                if (isEmptyResponse) {
                    if (previousRRPDate && dates.rrpDate && isDateBefore(dates.rrpDate, previousRRPDate)) {
                        setDateError("RRP date cannot be less than the previous RRP date");
                        return;
                    }
                    if (!isFromNotification && latestRRPInfo?.nextRRPNumber) {
                        setRrpNumber(latestRRPInfo.nextRRPNumber);
                    }
                }
                else if (isFromNotification) {
                    setRrpNumber(responseData.rrpNumber);
                }
                if (dates.invoiceDate && dates.rrpDate && dates.invoiceDate > dates.rrpDate) {
                    setDateError("Invoice date cannot be greater than RRP date");
                    return;
                }
                const queryParams = new URLSearchParams({
                    type: rrpType || 'local',
                    rrpDate: toUTCDateString(dates.rrpDate)!,
                    invoiceDate: toUTCDateString(dates.invoiceDate)!,
                    supplier: selectedSupplier,
                    inspectionUser: selectedInspectionUser,
                    invoiceNumber,
                    rrpNumber: (responseData.rrpNumber || rrpNumber || '').toString(),
                    freightCharge,
                    ...(rrpType === 'foreign' && {
                        poNumber,
                        airwayBillNumber,
                        customsNumber,
                        customsDate: toUTCDateString(dates.customsDate),
                        currency: selectedCurrency,
                        forexRate,
                    }),
                });
                router.push(`/rrp/items?${queryParams.toString()}`);
            }
        }
        catch (error: unknown) {
            let errorMessage = "Failed to verify RRP number";
            if (error &&
                typeof error === 'object' &&
                'response' in error &&
                typeof (error as {
                    response?: unknown;
                }).response === 'object' &&
                (error as {
                    response?: unknown;
                }).response !== null) {
                const response = (error as {
                    response?: unknown;
                }).response;
                if (typeof response === 'object' &&
                    response !== null &&
                    'data' in response &&
                    typeof (response as {
                        data?: unknown;
                    }).data === 'object' &&
                    (response as {
                        data?: unknown;
                    }).data !== null) {
                    const data = (response as {
                        data?: unknown;
                    }).data;
                    if (typeof data === 'object' &&
                        data !== null &&
                        'message' in data &&
                        typeof (data as {
                            message?: unknown;
                        }).message === 'string') {
                        errorMessage = (data as {
                            message: string;
                        }).message;
                    }
                }
            }
            else if (error instanceof Error && error.message) {
                errorMessage = error.message;
            }
            showErrorToast({
                title: 'Error',
                message: errorMessage,
                duration: 3000,
            });
        }
    };
    if (isLoading) {
        return (<div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#003594]"/>
      </div>);
    }
    if (!config) {
        return null;
    }
    return (<div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/rrp')} className="hover:bg-gray-100">
              <ArrowLeft className="h-5 w-5"/>
            </Button>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
                Create New {rrpType === 'local' ? 'Local' : 'Foreign'} RRP
              </h1>
              <p className="text-gray-600 mt-1">Enter the RRP details</p>
            </div>
          </div>

          <Card className="border-[#002a6e]/10 hover:border-[#d2293b]/20 transition-all duration-300">
            <CardContent className="p-6">
              
              {latestRRPInfo && (<div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-blue-800">Latest {rrpType === 'local' ? 'Local' : 'Foreign'} RRP</h3>
                      <p className="text-sm text-blue-600 space-x-2">
                        <span>
                          Number:{' '}
                          <span className="font-semibold">{latestRRPInfo.rrpNumber ?? 'N/A'}</span>
                        </span>
                        <span>
                          Date:{' '}
                          <span className="font-semibold">
                            {latestRRPInfo.rrpDate ? format(new Date(latestRRPInfo.rrpDate), 'PPP') : 'N/A'}
                          </span>
                        </span>
                        <span>
                          Next:{' '}
                          <span className="font-semibold">{latestRRPInfo.nextRRPNumber}</span>
                        </span>
                      </p>
                    </div>
                    <div className="text-xs text-blue-500 bg-blue-100 px-2 py-1 rounded">
                      Reference
                    </div>
                  </div>
                </div>)}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                  <Label>RRP Number *</Label>
                    {canEditRRPNumber && (<div className="flex items-center gap-2">
                        <Switch id="manual-rrp-number-toggle" checked={allowManualRRPNumberEdit} onCheckedChange={(checked) => {
                setAllowManualRRPNumberEdit(checked);
                if (!checked && latestRRPInfo?.nextRRPNumber) {
                    setRrpNumber(latestRRPInfo.nextRRPNumber);
                }
            }}/>
                        <Label htmlFor="manual-rrp-number-toggle" className="text-xs font-normal text-gray-600">
                          Enable manual edit
                        </Label>
                      </div>)}
                  </div>
                  <Input value={rrpNumber} disabled={!allowManualRRPNumberEdit} onChange={(e) => {
            if (!allowManualRRPNumberEdit)
                return;
            const value = e.target.value.toUpperCase();
            if (value.match(/^[LF]?\d{0,3}$/)) {
                setRrpNumber(value);
            }
        }} placeholder={`Auto-generated (e.g., ${rrpType === 'local' ? 'L001' : 'F001'})`} className="w-full border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20 disabled:bg-gray-100 disabled:text-gray-500"/>
                  <p className="text-sm text-gray-500">
                    Format: {rrpType === 'local' ? 'L' : 'F'} followed by 3 digits (e.g., {rrpType === 'local' ? 'L001' : 'F001'}). The number is auto-generated.
                  </p>
                  {!canEditRRPNumber && (<p className="text-xs text-gray-400">Contact an administrator if you need to edit RRP numbers.</p>)}
                </div>

                
                <div className="space-y-2">
                  <Label>RRP Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal border-[#002a6e]/10 hover:border-[#003594] hover:bg-[#003594]/5", !dates.rrpDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4"/>
                        {dates.rrpDate ? format(dates.rrpDate, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-white">
                      <Calendar value={dates.rrpDate || undefined} onChange={(date: Date | null) => handleDateChange('rrpDate', date)} className="rounded-md border border-[#002a6e]/10"/>
                    </PopoverContent>
                  </Popover>
                </div>

                
                <div className="space-y-2">
                  <Label>Invoice Number *</Label>
                  <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Enter invoice number" className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20"/>
                </div>

                
                <div className="space-y-2">
                  <Label>Invoice Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal border-[#002a6e]/10 hover:border-[#003594] hover:bg-[#003594]/5", !dates.invoiceDate && "text-muted-foreground")} disabled={!dates.rrpDate}>
                        <CalendarIcon className="mr-2 h-4 w-4"/>
                        {dates.invoiceDate ? format(dates.invoiceDate, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-white">
                      <Calendar value={dates.invoiceDate || undefined} onChange={(date: Date | null) => handleDateChange('invoiceDate', date)} className="rounded-md border border-[#002a6e]/10"/>
                    </PopoverContent>
                  </Popover>
                </div>

                
                <div className="space-y-2">
                  <Label>Supplier *</Label>
                  <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                    <SelectTrigger className="bg-white border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20">
                      <SelectValue placeholder="Select supplier"/>
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#002a6e]/10 max-h-[200px] overflow-y-auto">
                      {(rrpType === 'foreign' ? getForeignSuppliers() : getLocalSuppliers()).map((supplier) => (<SelectItem key={supplier} value={supplier} className="focus:bg-[#003594]/5">
                          {supplier}
                        </SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>

                
                <div className="space-y-2">
                  <Label>Inspection User *</Label>
                  <Select value={selectedInspectionUser} onValueChange={setSelectedInspectionUser}>
                    <SelectTrigger className="bg-white border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20">
                      <SelectValue placeholder="Select inspection user"/>
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#002a6e]/10 max-h-[200px] overflow-y-auto">
                      {config.inspection_user_details.map((user) => (<SelectItem key={user.name} value={`${user.name},${user.designation}`} className="focus:bg-[#003594]/5">
                          {user.name} - {user.designation}
                        </SelectItem>))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">
                    Note: If items are linked to &quot;Requested By&quot; authorities, inspection details will be automatically filled from those authorities.
                  </p>
                </div>

                
                <div className="space-y-2">
                  <Label>Freight Charge *</Label>
                  <Input type="number" value={freightCharge} onChange={(e) => setFreightCharge(e.target.value)} placeholder="Enter freight charge" className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20" min="0" step="0.01"/>
                </div>

                
                {rrpType === 'foreign' && (<>
                    <div className="space-y-2">
                      <Label>PO Number *</Label>
                      <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="Enter PO number" className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20"/>
                    </div>

                    <div className="space-y-2">
                      <Label>Airway Bill Number *</Label>
                      <Input value={airwayBillNumber} onChange={(e) => setAirwayBillNumber(e.target.value)} placeholder="Enter airway bill number" className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20"/>
                    </div>

                    <div className="space-y-2">
                      <Label>Customs Number *</Label>
                      <Input value={customsNumber} onChange={(e) => setCustomsNumber(e.target.value)} placeholder="Enter customs number" className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20"/>
                    </div>

                    <div className="space-y-2">
                      <Label>Customs Date *</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal border-[#002a6e]/10 hover:border-[#003594] hover:bg-[#003594]/5", !dates.customsDate && "text-muted-foreground")} disabled={!dates.rrpDate}>
                            <CalendarIcon className="mr-2 h-4 w-4"/>
                            {dates.customsDate ? format(dates.customsDate, "PPP") : "Select date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-white">
                          <Calendar value={dates.customsDate || undefined} onChange={(date: Date | null) => handleDateChange('customsDate', date)} className="rounded-md border border-[#002a6e]/10"/>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>Currency *</Label>
                      <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
                        <SelectTrigger className="bg-white border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20">
                          <SelectValue placeholder="Select currency"/>
                        </SelectTrigger>
                        <SelectContent className="bg-white border-[#002a6e]/10 max-h-[200px] overflow-y-auto">
                          {getCurrencies().map((currency) => (<SelectItem key={currency} value={currency} className="focus:bg-[#003594]/5">
                              {currency}
                            </SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Forex Rate *</Label>
                      <Input type="number" value={forexRate} onChange={(e) => setForexRate(e.target.value)} placeholder="Enter forex rate" className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20" min="0" step="0.0001"/>
                    </div>
                  </>)}
              </div>

              <div className="flex justify-end space-x-4 mt-8">
                <Button variant="outline" onClick={() => router.back()} className="border-[#d2293b]/20 hover:border-[#d2293b] hover:bg-[#d2293b]/5 bg-[#d2293b] text-white">
                  Cancel
                </Button>
                <Button onClick={handleNext} className="bg-[#003594] hover:bg-[#002a6e] text-white">
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>);
}
