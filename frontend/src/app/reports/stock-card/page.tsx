'use client';
import { useEffect, useRef, useState } from 'react';
import { SearchControls } from '@/components/search';
import { useSearch } from '@/hooks/useSearch';
import { useAuthContext } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { API } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { X, Check, Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { format, startOfDay } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/utils/utils';
import { SearchResult } from '@/types/search';
interface SelectedItem {
    id: number;
    naccode: string;
    name: string;
}
interface StockCardPreviewMovement {
    date: string;
    reference: string;
    type: 'issue' | 'receive';
    quantity: number;
    amount: number;
    balance_quantity: number;
    balance_amount: number;
    equipment_number?: string;
}
interface StockCardPreviewData {
    nac_code: string;
    item_name: string;
    part_number: string;
    equipment_number: string;
    location: string;
    card_number: string;
    open_quantity: number;
    open_amount: number;
    openingBalanceDate: string;
    movements: StockCardPreviewMovement[];
}
interface DeferredIssue {
    quantity: number;
    reference: string;
    equipment?: string;
    originalDate: string;
}
export default function StockCardPage() {
    const { toast } = useToast();
    const {} = useAuthContext();
    const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isGeneratingAll, setIsGeneratingAll] = useState(false);
    const [fromDate, setFromDate] = useState<Date | undefined>();
    const [toDate, setToDate] = useState<Date | undefined>();
    const [generateByIssueDate, setGenerateByIssueDate] = useState(false);
    const [equipmentNumber, setEquipmentNumber] = useState('');
    const [equipmentFrom, setEquipmentFrom] = useState('');
    const [equipmentTo, setEquipmentTo] = useState('');
    const [createdFrom, setCreatedFrom] = useState<Date | undefined>();
    const [createdTo, setCreatedTo] = useState<Date | undefined>();
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewData, setPreviewData] = useState<StockCardPreviewData | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [confirmAllOpen, setConfirmAllOpen] = useState(false);
    const [generateAllProgress, setGenerateAllProgress] = useState(0);
    const progressTimerRef = useRef<NodeJS.Timeout | null>(null);
    const { results, isLoading, error, handleSearch, } = useSearch();
    const handleRowClick = (item: SearchResult) => {
        const isSelected = selectedItems.some(selected => selected.id === item.id);
        if (isSelected) {
            setSelectedItems(selectedItems.filter(selected => selected.id !== item.id));
        }
        else {
            setSelectedItems([...selectedItems, {
                    id: item.id,
                    naccode: item.nacCode,
                    name: item.itemName
                }]);
        }
    };
    const removeSelectedItem = (id: number) => {
        setSelectedItems(selectedItems.filter(item => item.id !== id));
    };
    const hasFilterOptions = equipmentNumber.trim().length > 0 ||
        (equipmentFrom.trim().length > 0 && equipmentTo.trim().length > 0) ||
        !!createdFrom ||
        !!createdTo;
    const canGenerate = generateByIssueDate
        ? Boolean(fromDate && toDate)
        : selectedItems.length > 0 || hasFilterOptions;
    const resultCount = results?.length ?? 0;
    const selectedCount = selectedItems.length;
    useEffect(() => {
        if (isGeneratingAll) {
            setGenerateAllProgress((prev) => (prev === 0 ? 8 : prev));
            if (progressTimerRef.current) {
                clearInterval(progressTimerRef.current);
            }
            progressTimerRef.current = setInterval(() => {
                setGenerateAllProgress((prev) => {
                    if (prev >= 95) {
                        return prev;
                    }
                    const increment = 5 + Math.random() * 10;
                    return Math.min(prev + increment, 95);
                });
            }, 1200);
        }
        else if (progressTimerRef.current) {
            clearInterval(progressTimerRef.current);
            progressTimerRef.current = null;
        }
        return () => {
            if (progressTimerRef.current) {
                clearInterval(progressTimerRef.current);
                progressTimerRef.current = null;
            }
        };
    }, [isGeneratingAll]);
    const getCommonFilters = () => ({
        equipmentNumber: equipmentNumber.trim() || undefined,
        equipmentNumberFrom: equipmentFrom.trim() || undefined,
        equipmentNumberTo: equipmentTo.trim() || undefined,
        createdDateFrom: createdFrom ? format(startOfDay(createdFrom), 'yyyy-MM-dd') : undefined,
        createdDateTo: createdTo ? format(startOfDay(createdTo), 'yyyy-MM-dd') : undefined,
    });
    const downloadStockCardWorkbook = (binaryData: BlobPart, filenamePrefix: string, options?: {
        mimeType?: string;
        extension?: string;
    }) => {
        const mimeType = options?.mimeType ?? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        const extension = options?.extension ?? 'xlsx';
        const blob = new Blob([binaryData], {
            type: mimeType,
        });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${filenamePrefix}-${format(new Date(), 'yyyy-MM-dd')}.${extension}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    };
    const normalizePreviewData = (stock: StockCardPreviewData): StockCardPreviewData => {
        const openingQty = Number(stock.open_quantity ?? 0);
        const openingAmt = Number(stock.open_amount ?? 0);
        const isConsumable = stock.equipment_number?.toLowerCase().includes('consumable');
        const normalizedMovements = stock.movements.map((movement) => ({
            ...movement,
            quantity: Number(movement.quantity ?? 0),
            amount: Number(movement.amount ?? 0),
            balance_quantity: 0,
            balance_amount: Number(movement.balance_amount ?? 0),
        }));
        let runningBalance = openingQty;
        let deferredIssues: DeferredIssue[] = [];
        const processedMovements: StockCardPreviewMovement[] = [];
        normalizedMovements.forEach((movement) => {
            if (movement.type === 'receive') {
                runningBalance += movement.quantity;
                const receiveEntry = {
                    ...movement,
                    balance_quantity: runningBalance,
                };
                processedMovements.push(receiveEntry);
                if (deferredIssues.length > 0) {
                    let remainingBalance = runningBalance;
                    const pending = [...deferredIssues];
                    deferredIssues = [];
                    pending.forEach((issue) => {
                        if (remainingBalance >= issue.quantity) {
                            remainingBalance -= issue.quantity;
                            processedMovements.push({
                                ...movement,
                                type: 'issue',
                                date: issue.originalDate,
                                reference: issue.reference || 'Deferred Issue',
                                quantity: issue.quantity,
                                amount: 0,
                                balance_quantity: remainingBalance,
                                balance_amount: 0,
                                equipment_number: issue.equipment,
                            });
                        }
                        else if (remainingBalance > 0) {
                            processedMovements.push({
                                ...movement,
                                type: 'issue',
                                date: issue.originalDate,
                                reference: issue.reference || 'Deferred Issue',
                                quantity: remainingBalance,
                                amount: 0,
                                balance_quantity: 0,
                                balance_amount: 0,
                                equipment_number: issue.equipment,
                            });
                            const remainingQuantity = issue.quantity - remainingBalance;
                            deferredIssues.push({
                                ...issue,
                                quantity: remainingQuantity,
                            });
                            remainingBalance = 0;
                        }
                        else {
                            deferredIssues.push(issue);
                        }
                    });
                    runningBalance = remainingBalance;
                    processedMovements[processedMovements.length - 1].balance_quantity = runningBalance;
                }
            }
            else {
                if (runningBalance >= movement.quantity) {
                    runningBalance -= movement.quantity;
                    processedMovements.push({
                        ...movement,
                        balance_quantity: runningBalance,
                    });
                }
                else if (runningBalance > 0) {
                    processedMovements.push({
                        ...movement,
                        quantity: runningBalance,
                        balance_quantity: 0,
                    });
                    const remainingQuantity = movement.quantity - runningBalance;
                    deferredIssues.push({
                        quantity: remainingQuantity,
                        reference: String(movement.reference || 'Deferred Issue'),
                        equipment: movement.equipment_number,
                        originalDate: movement.date,
                    });
                    runningBalance = 0;
                }
                else {
                    deferredIssues.push({
                        quantity: movement.quantity,
                        reference: String(movement.reference || 'Deferred Issue'),
                        equipment: movement.equipment_number,
                        originalDate: movement.date,
                    });
                }
            }
        });
        deferredIssues.forEach((issue) => {
            runningBalance = 0;
            processedMovements.push({
                date: issue.originalDate,
                reference: issue.reference,
                type: 'issue',
                quantity: issue.quantity,
                amount: 0,
                balance_quantity: 0,
                balance_amount: 0,
                equipment_number: issue.equipment,
            });
        });
        const finalMovements = processedMovements.map((movement) => ({
            ...movement,
            equipment_number: isConsumable ? '' : movement.equipment_number,
        }));
        return {
            ...stock,
            open_quantity: openingQty,
            open_amount: openingAmt,
            movements: finalMovements,
        };
    };
    const formatPreviewDate = (value?: string) => {
        if (!value)
            return '';
        try {
            return format(new Date(value), 'yyyy/MM/dd');
        }
        catch {
            return value;
        }
    };
    const formatPreviewReference = (movement: StockCardPreviewMovement) => {
        if (!movement.reference)
            return '';
        let referenceStr = String(movement.reference);
        if (movement.type === 'receive') {
            const idx = referenceStr.indexOf('T');
            referenceStr = idx !== -1 ? referenceStr.slice(0, idx) : referenceStr;
        }
        else if (movement.type === 'issue') {
            const idx = referenceStr.indexOf('Y');
            referenceStr = idx !== -1 ? referenceStr.slice(0, idx) : referenceStr;
        }
        return referenceStr;
    };
    const handleGenerateStockCard = async () => {
        if (!generateByIssueDate && selectedItems.length === 0 && !hasFilterOptions) {
            toast({
                title: "Error",
                description: "Select at least one item or apply equipment/created date filters.",
                variant: "destructive",
            });
            return;
        }
        if (generateByIssueDate && (!fromDate || !toDate)) {
            toast({
                title: "Error",
                description: "Please select both from and to dates",
                variant: "destructive",
            });
            return;
        }
        try {
            setIsGenerating(true);
            const formattedFromDate = fromDate ? format(startOfDay(fromDate), 'yyyy-MM-dd') : undefined;
            const formattedToDate = toDate ? format(startOfDay(toDate), 'yyyy-MM-dd') : undefined;
            const commonFilters = getCommonFilters();
            const payload = generateByIssueDate
                ? {
                    fromDate: format(startOfDay(fromDate!), 'yyyy-MM-dd'),
                    toDate: format(startOfDay(toDate!), 'yyyy-MM-dd'),
                    generateByIssueDate: true,
                    ...commonFilters
                }
                : {
                    naccodes: selectedItems.length ? selectedItems.map(item => item.naccode) : undefined,
                    fromDate: formattedFromDate,
                    toDate: formattedToDate,
                    generateByIssueDate: false,
                    ...commonFilters
                };
            const response = await API.post('/api/report/stockcard', payload, {
                responseType: 'blob'
            });
            downloadStockCardWorkbook(response.data, 'stock-cards');
            toast({
                title: "Success",
                description: "Stock cards generated successfully",
            });
            setSelectedItems([]);
            setFromDate(undefined);
            setToDate(undefined);
        }
        catch {
            toast({
                title: "Error",
                description: "Failed to generate stock cards",
                variant: "destructive",
            });
        }
        finally {
            setIsGenerating(false);
        }
    };
    const generateAllStockCards = async () => {
        if (generateByIssueDate) {
            toast({
                title: "Turn off issue-date mode",
                description: "Disable 'Generate by Issue Date' to generate all stock cards.",
                variant: "destructive",
            });
            return;
        }
        let encounteredError = false;
        try {
            setIsGeneratingAll(true);
            setGenerateAllProgress((prev) => (prev === 0 ? 8 : prev));
            const formattedFromDate = fromDate ? format(startOfDay(fromDate), 'yyyy-MM-dd') : undefined;
            const formattedToDate = toDate ? format(startOfDay(toDate), 'yyyy-MM-dd') : undefined;
            const commonFilters = getCommonFilters();
            const payload = {
                generateAll: true,
                generateByIssueDate: false,
                fromDate: formattedFromDate,
                toDate: formattedToDate,
                ...commonFilters,
            };
            const response = await API.post('/api/report/stockcard', payload, {
                responseType: 'blob',
            });
            downloadStockCardWorkbook(response.data, 'all-stock-cards', {
                mimeType: 'application/zip',
                extension: 'zip',
            });
            toast({
                title: 'Success',
                description: 'A ZIP containing all stock cards has been downloaded.',
            });
        }
        catch {
            encounteredError = true;
            toast({
                title: 'Error',
                description: 'Failed to generate all stock cards',
                variant: 'destructive',
            });
        }
        finally {
            setIsGeneratingAll(false);
            setGenerateAllProgress(encounteredError ? 0 : 100);
            if (!encounteredError) {
                setTimeout(() => setGenerateAllProgress(0), 1200);
            }
        }
    };
    const handleGenerateAllStockCards = () => {
        if (generateByIssueDate) {
            toast({
                title: "Turn off issue-date mode",
                description: "Disable 'Generate by Issue Date' to generate all stock cards.",
                variant: "destructive",
            });
            return;
        }
        setConfirmAllOpen(true);
    };
    const handlePreviewStockCard = async (nacCode: string) => {
        setPreviewLoading(true);
        try {
            const formattedFromDate = fromDate ? format(startOfDay(fromDate), 'yyyy-MM-dd') : undefined;
            const formattedToDate = toDate ? format(startOfDay(toDate), 'yyyy-MM-dd') : undefined;
            const payload = {
                nacCode,
                naccodes: [nacCode],
                fromDate: formattedFromDate,
                toDate: formattedToDate,
                generateByIssueDate,
                equipmentNumber: equipmentNumber.trim() || undefined,
                equipmentNumberFrom: equipmentFrom.trim() || undefined,
                equipmentNumberTo: equipmentTo.trim() || undefined,
                createdDateFrom: createdFrom ? format(startOfDay(createdFrom), 'yyyy-MM-dd') : undefined,
                createdDateTo: createdTo ? format(startOfDay(createdTo), 'yyyy-MM-dd') : undefined,
            };
            const response = await API.post('/api/report/stockcard/preview', payload);
            const stockData = response.data?.stock;
            setPreviewData(stockData ? normalizePreviewData(stockData) : null);
            setPreviewOpen(true);
        }
        catch {
            toast({
                title: 'Preview unavailable',
                description: 'Could not load the stock card preview. Please try again.',
                variant: 'destructive',
            });
        }
        finally {
            setPreviewLoading(false);
        }
    };
    return (<div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-8">
        <section className="grid gap-6 lg:grid-cols-12">
          <div className="rounded-3xl border border-white/30 bg-gradient-to-br from-[#003594] to-[#0f5096] text-white p-6 shadow-lg lg:col-span-6">
            <div className="flex flex-col gap-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Stock Card Studio</p>
              <h1 className="text-3xl font-semibold">Generate beautiful stock cards in a few clicks.</h1>
              <p className="text-sm text-white/80">
                Use the filters to narrow down items or enable issue-date mode to pull cards by movement dates.
              </p>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={handleGenerateStockCard} disabled={isGenerating || !canGenerate} className="w-full sm:w-auto px-6 text-base font-semibold bg-white text-[#003594] hover:bg-white/95 shadow-lg shadow-black/10">
                {isGenerating ? (<>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                    Generating…
                  </>) : ('Generate Selected')}
              </Button>
              <Button size="lg" onClick={handleGenerateAllStockCards} disabled={isGeneratingAll || isGenerating || generateByIssueDate} className="w-full sm:w-auto px-6 text-base font-semibold border border-white/70 text-white/90 bg-white/10 hover:bg-white/20 backdrop-blur shadow-lg shadow-black/5">
                {isGeneratingAll ? (<>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                    Working…
                  </>) : ('Generate All')}
              </Button>
            </div>
            {isGeneratingAll && (<div className="mt-4 w-full space-y-2 text-xs text-white/80">
                <div className="flex items-center justify-between">
                  <span>Preparing every stock card…</span>
                  <span>{Math.round(generateAllProgress)}%</span>
                </div>
                <div className="h-2 w-full bg-white/25 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-white transition-[width] duration-500" style={{ width: `${Math.min(generateAllProgress, 100)}%` }}/>
                </div>
              </div>)}
            <div className="mt-6 grid grid-cols-2 gap-3 text-xs text-white/80">
              <div className="rounded-2xl bg-white/15 backdrop-blur p-3 border border-white/20">
                <p className="text-white text-lg font-semibold">{resultCount}</p>
                <p>Items in search</p>
              </div>
              <div className="rounded-2xl bg-white/15 backdrop-blur p-3 border border-white/20">
                <p className="text-white text-lg font-semibold">{selectedCount}</p>
                <p>Selected for export</p>
              </div>
            </div>
          </div>
          <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200 flex flex-col justify-between lg:col-span-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Mode</p>
              <div className="mt-2 flex items-center gap-3">
                <Switch id="generate-by-issue-date" checked={generateByIssueDate} onCheckedChange={setGenerateByIssueDate} className="data-[state=checked]:bg-[#003594]"/>
                <Label htmlFor="generate-by-issue-date" className="text-sm font-medium text-slate-900">
                  {generateByIssueDate ? 'Issue-date mode enabled' : 'Manual selection mode'}
                </Label>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {generateByIssueDate
            ? 'Choose a date range to pull every NAC code that had an issue in that window.'
            : 'Select one or more NAC codes from the list below.'}
              </p>
            </div>
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 p-4 text-xs text-slate-600 space-y-1">
              <p className="font-medium text-slate-900">Tips</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Use equipment filters to find specific fleets.</li>
                <li>Combine created-date filters with “Generate All” for scoped exports.</li>
              </ul>
            </div>
          </div>
          <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200 flex flex-col justify-between lg:col-span-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Session Snapshot</p>
                <p className="text-lg font-semibold text-slate-900 mt-1">Ready to export</p>
              </div>
              <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-[#003594] font-semibold">
                {selectedCount > 99 ? '99+' : selectedCount}
              </div>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <span>Active filters</span>
                <span className="font-semibold text-slate-900">
                  {hasFilterOptions ? 'Custom' : 'None'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Mode</span>
                <span className="font-semibold text-slate-900">
                  {generateByIssueDate ? 'Issue-date' : 'Manual select'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Last refresh</span>
                <span className="font-semibold text-slate-900">
                  {new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date())}
                </span>
              </div>
            </div>
            <div className="mt-6 rounded-2xl bg-slate-50 border border-dashed border-slate-200 p-4 text-xs text-slate-600">
              Keep the selection small for faster previews, or switch to Generate All when you need comprehensive exports.
            </div>
          </div>
        </section>

        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
              <p className="text-sm text-slate-500">Mix and match filters to narrow down the NAC codes you need.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>From Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal border-slate-200 focus:ring-[#003594]", !fromDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4"/>
                    {fromDate ? format(fromDate, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-white rounded-xl shadow-lg border border-slate-200">
                  <Calendar value={fromDate} onChange={(date) => setFromDate(date || undefined)} className="rounded-md border border-slate-200 bg-white"/>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>To Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal border-slate-200 focus:ring-[#003594]", !toDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4"/>
                    {toDate ? format(toDate, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-white rounded-xl shadow-lg border border-slate-200">
                  <Calendar value={toDate} onChange={(date) => setToDate(date || undefined)} className="rounded-md border border-slate-200 bg-white"/>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Equipment Number</Label>
              <Input placeholder="Exact equipment number" value={equipmentNumber} onChange={(e) => setEquipmentNumber(e.target.value)}/>
            </div>
            <div className="space-y-2">
              <Label>Equipment Number Range</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input placeholder="From" value={equipmentFrom} onChange={(e) => setEquipmentFrom(e.target.value)}/>
                <Input placeholder="To" value={equipmentTo} onChange={(e) => setEquipmentTo(e.target.value)}/>
              </div>
              <p className="text-xs text-gray-500">Provide both values to apply range filtering.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Created Date From</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start text-left font-normal border-slate-200 focus:ring-[#003594]', !createdFrom && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4"/>
                    {createdFrom ? format(createdFrom, 'PPP') : 'Select date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-white rounded-xl shadow-lg border border-slate-200">
                  <Calendar value={createdFrom} onChange={(date) => setCreatedFrom(date || undefined)} className="rounded-md border border-slate-200 bg-white"/>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Created Date To</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start text-left font-normal border-slate-200 focus:ring-[#003594]', !createdTo && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4"/>
                    {createdTo ? format(createdTo, 'PPP') : 'Select date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-white rounded-xl shadow-lg border border-slate-200">
                  <Calendar value={createdTo} onChange={(date) => setCreatedTo(date || undefined)} className="rounded-md border border-slate-200 bg-white"/>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {!generateByIssueDate && (<SearchControls onUniversalSearch={handleSearch('universal')} onEquipmentSearch={handleSearch('equipmentNumber')} onPartSearch={handleSearch('partNumber')}/>)}
        </section>

          {!generateByIssueDate && (<div className="bg-white rounded-2xl shadow-sm border border-[#002a6e]/15 p-6 hover:border-[#d2293b]/20 transition-colors">
              {isLoading ? (<div className="flex items-center justify-center h-24">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#003594] border-t-transparent"></div>
                </div>) : (<div className="w-full overflow-hidden border border-[#d8def0] rounded-xl">
                  <div className="max-h-[55vh] overflow-auto">
                    <table className="w-full table-fixed divide-y divide-[#e4e9f7] text-sm">
                    <thead>
                      <tr className="bg-[#f5f7ff] text-[#0e1b4d] text-xs font-semibold uppercase tracking-[0.08em]">
                        <th scope="col" className="px-3 py-3 text-left w-16">
                          Select
                        </th>
                        <th scope="col" className="px-3 py-3 text-left w-32">
                          NAC Code
                        </th>
                        <th scope="col" className="px-3 py-3 text-left w-40">
                          Part Number
                        </th>
                        <th scope="col" className="px-3 py-3 text-left w-64">
                          Item Name
                        </th>
                        <th scope="col" className="px-3 py-3 text-left w-28">
                          Current Balance
                        </th>
                        <th scope="col" className="px-3 py-3 text-left w-48">
                          Equipment Number
                        </th>
                        <th scope="col" className="px-3 py-3 text-center w-28">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eef1fb]">
                      {results?.map((item) => {
                    const isSelected = selectedItems.some(selected => selected.id === item.id);
                    return (<tr key={item.id} onClick={() => handleRowClick(item)} className="hover:bg-[#f9faff] transition-colors cursor-pointer">
                            <td className="px-3 py-3">
                              <div className="flex items-center justify-center">
                                {isSelected ? (<div className="h-5 w-5 rounded-full bg-gradient-to-br from-[#003594] to-[#5973ff] text-white flex items-center justify-center shadow-sm">
                                    <Check className="h-3.5 w-3.5"/>
                                  </div>) : (<div className="h-5 w-5 rounded-full border-2 border-dashed border-[#8aa2ff]"/>)}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="text-sm font-semibold text-[#0f1c4c] truncate">
                                {item.nacCode}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="text-sm text-gray-700 truncate">
                                {item.partNumber}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="text-sm text-gray-800 truncate">
                                {item.itemName}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="text-sm text-center font-semibold text-[#0f6e8c]">
                                {item.currentBalance}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="text-sm text-gray-600 truncate">
                                {item.equipmentNumber}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-center">
                              <Button variant="outline" size="sm" className="border-[#003594]/30 text-[#003594] hover:bg-[#003594]/10" onClick={(e) => {
                            e.stopPropagation();
                            handlePreviewStockCard(item.nacCode);
                        }}>
                                Preview
                              </Button>
                            </td>
                          </tr>);
                })}
                    </tbody>
                    </table>
                  </div>
                </div>)}
            </div>)}

          <div className="bg-white rounded-xl shadow-sm border border-[#002a6e]/10 p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex-1 w-full">
              {!generateByIssueDate && selectedItems.length > 0 && (<>
                  <h2 className="text-lg font-semibold text-[#003594] mb-3">Selected Items ({selectedItems.length})</h2>
                  <div className="space-y-2">
                    {selectedItems.map((item) => (<div key={item.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <div>
                          <span className="font-medium">{item.naccode}</span>
                          <span className="text-gray-600 ml-2">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => handlePreviewStockCard(item.naccode)}>
                            Preview
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => removeSelectedItem(item.id)}>
                            <X className="h-4 w-4"/>
                          </Button>
                        </div>
                      </div>))}
                  </div>
                </>)}
              {generateByIssueDate && (<p className="text-xs text-gray-500">
                  Select a date range, then click &quot;Generate Selected&quot; to export cards for NAC codes that had issues during that period.
                </p>)}
            </div>
            <div className="flex flex-row gap-2 md:flex-col md:w-48">
              <Button onClick={handleGenerateStockCard} disabled={isGenerating || !canGenerate} size="sm" className="w-full bg-[#003594] hover:bg-[#003594]/90 text-white">
                {isGenerating ? "Generating..." : "Generate Selected"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleGenerateAllStockCards} disabled={isGeneratingAll || isGenerating || generateByIssueDate} className="w-full border-[#003594]/40 text-[#003594]">
                {isGeneratingAll ? "Generating..." : "Generate All"}
              </Button>
            </div>
          </div>

          {error && (<div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>)}
        </div>
      </div>
      <Dialog open={previewOpen} onOpenChange={(open) => {
            setPreviewOpen(open);
            if (!open) {
                setPreviewData(null);
            }
        }}>
        <DialogContent className="w-[95vw] max-w-4xl sm:max-w-5xl bg-white">
          <DialogHeader>
            <DialogTitle>Stock Card Preview</DialogTitle>
            <DialogDescription>
              Review movement history before exporting the official stock card.
            </DialogDescription>
          </DialogHeader>
          {previewLoading ? (<div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-[#003594]"/>
            </div>) : previewData ? (<div className="max-h-[70vh] overflow-auto">
              <div className="w-full min-w-[720px] lg:min-w-[920px] space-y-6 text-xs text-gray-800 bg-gradient-to-br from-white to-[#f9fbff] p-2">
                <div className="border border-gray-300 rounded-xl p-4 bg-gradient-to-br from-white to-[#eef2ff] shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between text-[11px] uppercase tracking-wide text-gray-500">
                    <span>Ground Support Department</span>
                    <div className="text-right">
                      <p>Form no. GrSD/STK01</p>
                      <p>Revision: 01 (October 2022)</p>
                    </div>
                  </div>
                  <div className="text-center text-lg font-semibold text-[#003594]">Stock Card</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">NAC Code:</p>
                      <p>{previewData.nac_code}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Type of Stock:</p>
                      <p>-</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Card No:</p>
                      <p>{previewData.card_number || '-'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Nomenclature:</p>
                      <p>{previewData.item_name}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Part No.:</p>
                      <p>{previewData.part_number || '-'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Alternate P/N:</p>
                      <p>-</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Applicable Fleet:</p>
                      <p>{previewData.equipment_number || '-'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Location:</p>
                      <p>{previewData.location || '-'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Date:</p>
                      <p>{format(new Date(), 'PPP')}</p>
                    </div>
                  </div>
                </div>

                <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
                  <table className="w-full text-[11px] border-collapse">
                    <tbody>
                      <tr className="border-b border-gray-300">
                        <td className="px-3 py-2 font-semibold text-gray-900 w-1/6">Stock Level</td>
                        <td className="px-3 py-2 border-l border-gray-300">Max: -</td>
                        <td className="px-3 py-2 border-l border-gray-300">Min: -</td>
                        <td className="px-3 py-2 border-l border-gray-300">Order Limit: -</td>
                        <td className="px-3 py-2 border-l border-gray-300">Order Qty: -</td>
                      </tr>
                      <tr className="border-b border-gray-300">
                        <td className="px-3 py-2 font-semibold text-gray-900">Prepared By:</td>
                        <td className="px-3 py-2 border-l border-gray-300">Signature: _____________</td>
                        <td className="px-3 py-2 border-l border-gray-300">Name: _____________</td>
                        <td className="px-3 py-2 border-l border-gray-300">Staff ID: _____________</td>
                        <td className="px-3 py-2 border-l border-gray-300">Designation: _____________</td>
                      </tr>
                      <tr className="border-b border-gray-300">
                        <td className="px-3 py-2 font-semibold text-gray-900">Check/Reviewed By:</td>
                        <td className="px-3 py-2 border-l border-gray-300">Signature: _____________</td>
                        <td className="px-3 py-2 border-l border-gray-300" colSpan={3}>
                          Name/Designation: ______________________________
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-semibold text-gray-900">Recommended/Approved:</td>
                        <td className="px-3 py-2 border-l border-gray-300">Signature: _____________</td>
                        <td className="px-3 py-2 border-l border-gray-300" colSpan={3}>
                          Order Limit Reviewed By: ______________________
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="border border-gray-300 rounded-xl p-3 bg-white shadow-sm">
                  <table className="w-full text-[11px] border border-gray-300 table-fixed border-collapse">
                    <thead>
                      <tr className="text-center bg-[#f3f6ff] text-[#0e1b4d] uppercase tracking-[0.08em] text-[10px]">
                        <th colSpan={4} className="border border-gray-300 py-2">Receipt</th>
                        <th colSpan={3} className="border border-gray-300 py-2">Issue</th>
                        <th className="border border-gray-300 py-2">Balance Qty.</th>
                        <th className="border border-gray-300 py-2">Signature</th>
                        <th className="border border-gray-300 py-2">GSE No.</th>
                        <th className="border border-gray-300 py-2">Remarks</th>
                      </tr>
                      <tr className="text-center text-[10px] text-gray-600">
                        <th className="border border-gray-300 px-2 py-1">Date</th>
                        <th className="border border-gray-300 px-2 py-1">Ref.</th>
                        <th className="border border-gray-300 px-2 py-1">Qty</th>
                        <th className="border border-gray-300 px-2 py-1">Cost</th>
                        <th className="border border-gray-300 px-2 py-1">Date</th>
                        <th className="border border-gray-300 px-2 py-1">Ref.</th>
                        <th className="border border-gray-300 px-2 py-1">Qty</th>
                        <th className="border border-gray-300 px-2 py-1">Balance Qty.</th>
                        <th className="border border-gray-300 px-2 py-1">Signature</th>
                        <th className="border border-gray-300 px-2 py-1">GSE No.</th>
                        <th className="border border-gray-300 px-2 py-1">Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-200">
                        <td className="px-2 py-1 border border-gray-200">{formatPreviewDate(previewData.openingBalanceDate)}</td>
                        <td className="px-2 py-1 border border-gray-200">B.F.</td>
                        <td className="px-2 py-1 border border-gray-200 text-right font-semibold">
                          {Number(previewData.open_quantity || 0).toFixed(2)}
                        </td>
                        <td className="px-2 py-1 border border-gray-200 text-right">
                          {Number(previewData.open_amount || 0).toFixed(2)}
                        </td>
                        <td className="px-2 py-1 border border-gray-200">-</td>
                        <td className="px-2 py-1 border border-gray-200">-</td>
                        <td className="px-2 py-1 border border-gray-200">-</td>
                        <td className="px-2 py-1 border border-gray-200 text-right font-semibold">
                          {Number(previewData.open_quantity || 0).toFixed(2)}
                        </td>
                        <td className="border border-gray-200"></td>
                        <td className="border border-gray-200"></td>
                        <td className="border border-gray-200"></td>
                      </tr>
                      {previewData.movements.length === 0 ? (<tr>
                          <td colSpan={11} className="px-2 py-6 text-center text-gray-500">
                            No movement records found for this configuration.
                          </td>
                        </tr>) : (previewData.movements.map((movement, idx) => {
                const isReceive = movement.type === 'receive';
                const displayReference = formatPreviewReference(movement);
                return (<tr key={`${movement.reference}-${idx}`} className="border-b border-gray-200">
                              <td className="px-2 py-1 border border-gray-200">
                                {isReceive ? formatPreviewDate(movement.date) : ''}
                              </td>
                              <td className="px-2 py-1 border border-gray-200">{isReceive ? displayReference : ''}</td>
                              <td className="px-2 py-1 border border-gray-200 text-right">
                                {isReceive ? Number(movement.quantity || 0).toFixed(2) : ''}
                              </td>
                              <td className="px-2 py-1 border border-gray-200 text-right">
                                {isReceive ? Number(movement.amount || 0).toFixed(2) : ''}
                              </td>
                              <td className="px-2 py-1 border border-gray-200">
                                {!isReceive ? formatPreviewDate(movement.date) : ''}
                              </td>
                              <td className="px-2 py-1 border border-gray-200">{!isReceive ? displayReference : ''}</td>
                              <td className="px-2 py-1 border border-gray-200 text-right">
                                {!isReceive ? Number(movement.quantity || 0).toFixed(2) : ''}
                              </td>
                              <td className="px-2 py-1 border border-gray-200 text-right font-semibold text-[#0e1b4d]">
                                {Number(movement.balance_quantity || 0).toFixed(2)}
                              </td>
                              <td className="border border-gray-200"></td>
                              <td className="border border-gray-200">
                                {!isReceive ? movement.equipment_number || '' : ''}
                              </td>
                              <td className="border border-gray-200"></td>
                            </tr>);
            }))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>) : (<p className="text-sm text-gray-500">
              Select an item to preview its stock card configuration.
            </p>)}
        </DialogContent>
      </Dialog>
      <Dialog open={confirmAllOpen} onOpenChange={(open) => {
            if (!isGeneratingAll) {
                setConfirmAllOpen(open);
            }
        }}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Generate every stock card?</DialogTitle>
            <DialogDescription>
              We’ll download a workbook containing every NAC code that matches the current filters. This can take a while on large datasets.
            </DialogDescription>
          </DialogHeader>
          {isGeneratingAll && (<div className="mt-2 space-y-2 rounded-lg bg-slate-50 border border-slate-200 p-3">
              <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                <span>Preparing files…</span>
                <span>{Math.round(generateAllProgress)}%</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-[#003594] rounded-full transition-[width] duration-500" style={{ width: `${Math.min(generateAllProgress, 100)}%` }}/>
              </div>
            </div>)}
          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setConfirmAllOpen(false)} disabled={isGeneratingAll}>
              Cancel
            </Button>
            <Button onClick={() => {
            setConfirmAllOpen(false);
            generateAllStockCards();
        }} disabled={isGeneratingAll} className="bg-[#003594] text-white hover:bg-[#003594]/90">
              {isGeneratingAll ? (<>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                  Generating…
                </>) : ('Generate All')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>);
}
