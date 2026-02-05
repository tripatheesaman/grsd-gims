'use client';
import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { CalendarIcon, Plus, Trash2, ChevronsUpDown, Check } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { API } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/context/AuthContext';
interface FuelRecord {
    equipment_number: string;
    kilometers: number | '';
    quantity: number | '';
    is_kilometer_reset: boolean;
}
interface ValidationError {
    index: number;
    field: string;
    message: string;
}
interface FuelConfig {
    equipment_list: string[];
    equipment_kilometers: {
        [key: string]: number;
    };
    latest_fuel_price?: number;
}
interface User {
    UserInfo: {
        username: string;
        name: string;
        permissions: string[];
        role_name: string;
    };
    iat: number;
    exp: number;
}
interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    permissions: string[];
    login: (username: string, password: string) => Promise<void>;
    logout: () => void;
}
export default function FuelIssueFormPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const { user } = useAuthContext() as AuthContextType;
    const type = params.type as string;
    const [date, setDate] = useState<Date>(new Date());
    const [records, setRecords] = useState<FuelRecord[]>([{ equipment_number: '', kilometers: '', quantity: '', is_kilometer_reset: false }]);
    const [config, setConfig] = useState<FuelConfig | null>(null);
    const [price, setPrice] = useState<number>(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [openStates, setOpenStates] = useState<{
        [key: number]: boolean;
    }>({});
    const [inputValues, setInputValues] = useState<{
        [key: number]: string;
    }>({});
    const [selectedIndices, setSelectedIndices] = useState<{
        [key: number]: number;
    }>({});
    const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
    const inputRefs = useRef<{
        [key: number]: HTMLInputElement | null;
    }>({});
    const optionRefs = useRef<{
        [key: number]: {
            [key: number]: HTMLDivElement | null;
        };
    }>({});
    const recordRefs = useRef<{
        [key: number]: HTMLDivElement | null;
    }>({});
    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const response = await API.get(`/api/fuel/config/${type}`);
                setConfig(response.data);
                setPrice(response.data.latest_fuel_price || 0);
            }
            catch {
                toast({
                    title: 'Error',
                    description: 'Failed to load fuel configuration',
                    variant: 'destructive',
                });
            }
        };
        fetchConfig();
    }, [type, toast]);
    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
        const suggestions = getFilteredSuggestions(index);
        if (!suggestions.length)
            return;
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                const currentIndex = selectedIndices[index] ?? -1;
                const nextIndex = Math.min(currentIndex + 1, suggestions.length - 1);
                setSelectedIndices(prev => ({
                    ...prev,
                    [index]: nextIndex
                }));
                if (optionRefs.current[index]?.[nextIndex]) {
                    optionRefs.current[index][nextIndex]?.focus();
                }
                break;
            case 'ArrowUp':
                e.preventDefault();
                const currentIndexUp = selectedIndices[index] ?? 0;
                const prevIndex = Math.max(currentIndexUp - 1, 0);
                setSelectedIndices(prev => ({
                    ...prev,
                    [index]: prevIndex
                }));
                if (optionRefs.current[index]?.[prevIndex]) {
                    optionRefs.current[index][prevIndex]?.focus();
                }
                break;
            case 'Enter':
                e.preventDefault();
                const selectedIndex = selectedIndices[index] ?? 0;
                if (suggestions[selectedIndex]) {
                    handleSelect(index, suggestions[selectedIndex].value);
                }
                break;
            case 'Escape':
                e.preventDefault();
                setOpenStates(prev => ({ ...prev, [index]: false }));
                break;
        }
    };
    const handleAddRecord = () => {
        setRecords([...records, { equipment_number: '', kilometers: '', quantity: '', is_kilometer_reset: false }]);
    };
    const handleRemoveRecord = (index: number) => {
        setRecords(records.filter((_, i) => i !== index));
    };
    const handleRecordChange = (index: number, field: keyof FuelRecord, value: string | number | boolean) => {
        const newRecords = [...records];
        newRecords[index] = { ...newRecords[index], [field]: value };
        if (field === 'equipment_number' && config) {
            newRecords[index].kilometers = config.equipment_kilometers[value as string] || '';
        }
        setRecords(newRecords);
        setValidationErrors(prev => prev.filter(error => !(error.index === index && error.field === field)));
    };
    const getFilteredSuggestions = (index: number) => {
        if (!config?.equipment_list)
            return [];
        const query = inputValues[index]?.toLowerCase() || '';
        return config.equipment_list
            .filter(equipment => equipment.toLowerCase().includes(query))
            .map(equipment => ({
            value: equipment,
            label: equipment
        }));
    };
    const handleSelect = (index: number, value: string) => {
        handleRecordChange(index, 'equipment_number', value);
        setOpenStates(prev => ({ ...prev, [index]: false }));
        setInputValues(prev => ({ ...prev, [index]: '' }));
        setTimeout(() => {
            inputRefs.current[index]?.focus();
        }, 0);
    };
    const toggleOpen = (index: number) => {
        setOpenStates(prev => ({ ...prev, [index]: !prev[index] }));
        if (!openStates[index]) {
            setSelectedIndices(prev => ({ ...prev, [index]: -1 }));
            setTimeout(() => {
                inputRefs.current[index]?.focus();
            }, 0);
        }
    };
    const handleInputChange = (index: number, value: string) => {
        setInputValues(prev => ({ ...prev, [index]: value }));
    };
    const validateRecords = (): {
        isValid: boolean;
        errors: ValidationError[];
    } => {
        const errors: ValidationError[] = [];
        if (!date) {
            errors.push({ index: -1, field: 'date', message: 'Date is required' });
        }
        if (records.length === 0) {
            errors.push({ index: -1, field: 'records', message: 'At least one record is required' });
            return { isValid: false, errors };
        }
        records.forEach((record, index) => {
            if (!record.equipment_number) {
                errors.push({ index, field: 'equipment_number', message: 'Equipment number is required' });
            }
            if (record.kilometers === '' || record.kilometers === 0) {
                errors.push({ index, field: 'kilometers', message: 'Kilometers is required' });
            }
            if (record.quantity === '' || record.quantity === 0) {
                errors.push({ index, field: 'quantity', message: 'Quantity is required' });
            }
        });
        if (type !== 'Cleaning') {
            const equipmentNumbers = records.map(r => r.equipment_number);
            const uniqueNumbers = new Set(equipmentNumbers);
            if (equipmentNumbers.length !== uniqueNumbers.size) {
                const duplicates = equipmentNumbers.filter((item, index) => equipmentNumbers.indexOf(item) !== index);
                duplicates.forEach(duplicate => {
                    const duplicateIndices = equipmentNumbers
                        .map((num, index) => num === duplicate ? index : -1)
                        .filter(index => index !== -1);
                    duplicateIndices.forEach(index => {
                        errors.push({ index, field: 'equipment_number', message: 'Duplicate equipment number for the same date' });
                    });
                });
            }
        }
        records.forEach((record, index) => {
            if (config && typeof record.kilometers === 'number' && record.kilometers < config.equipment_kilometers[record.equipment_number]) {
                errors.push({
                    index,
                    field: 'kilometers',
                    message: `Kilometers cannot be less than previous reading (${config.equipment_kilometers[record.equipment_number]})`
                });
            }
        });
        return { isValid: errors.length === 0, errors };
    };
    const handleSubmit = async () => {
        const validation = validateRecords();
        if (!validation.isValid) {
            setValidationErrors(validation.errors);
            const firstError = validation.errors[0];
            if (firstError && firstError.index >= 0) {
                setTimeout(() => {
                    recordRefs.current[firstError.index]?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    });
                }, 100);
            }
            toast({
                title: 'Validation Error',
                description: `Please fix ${validation.errors.length} error${validation.errors.length > 1 ? 's' : ''} in the form.`,
                variant: 'destructive',
            });
            return;
        }
        if (!user?.UserInfo?.username) {
            toast({
                title: 'Error',
                description: 'User not authenticated',
                variant: 'destructive',
            });
            return;
        }
        setIsSubmitting(true);
        try {
            const recordsWithPrice = records.map(record => ({
                ...record,
                kilometers: record.kilometers === '' ? 0 : record.kilometers,
                quantity: record.quantity === '' ? 0 : record.quantity,
                price: price
            }));
            const payload = {
                issue_date: format(date, 'yyyy-MM-dd'),
                issued_by: user.UserInfo.username,
                fuel_type: type,
                price: price,
                records: recordsWithPrice,
            };
            const response = await API.post('api/fuel/create', payload);
            if (response.status === 201 || response.status === 200) {
                toast({
                    title: 'Success',
                    description: 'Fuel records created successfully',
                });
                router.push('/fuels/issue');
            }
            else {
                throw new Error(response.data?.message || 'Failed to create fuel records');
            }
        }
        catch (error: unknown) {
            let errorMessage = 'Failed to create fuel records';
            if (error instanceof Error) {
                errorMessage = error.message;
            }
            else if (typeof error === 'object' &&
                error !== null &&
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
            toast({
                title: 'Error',
                description: errorMessage,
                variant: 'destructive',
            });
        }
        finally {
            setIsSubmitting(false);
        }
    };
    return (<div className="flex-1 p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#003594]">
          {type.charAt(0).toUpperCase() + type.slice(1)} Issue Form
        </h1>
        <p className="text-gray-500 mt-1">Fill in the details to issue {type}</p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-[#003594]">Issue Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className={cn(validationErrors.some(error => error.field === 'date') && "text-red-600")}>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground", validationErrors.some(error => error.field === 'date') && "border-red-500 focus:border-red-500 focus:ring-red-500")}>
                      <CalendarIcon className="mr-2 h-4 w-4"/>
                      {date ? format(date, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar value={date} onChange={(date: Date | null) => {
            if (date) {
                setDate(date);
                setValidationErrors(prev => prev.filter(error => error.field !== 'date'));
            }
        }} minDate={new Date(2025, 6, 17)}/>
                  </PopoverContent>
                </Popover>
                {validationErrors.some(error => error.field === 'date') && (<p className="text-sm text-red-600">
                    {validationErrors.find(error => error.field === 'date')?.message}
                  </p>)}
              </div>
              {type.toLowerCase() !== 'diesel' && (<div className="space-y-2">
                <Label>Price per Liter</Label>
                <Input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} placeholder="Enter price per liter"/>
              </div>)}
            </div>

            <div className="space-y-4">
              {records.map((record, index) => {
            const recordErrors = validationErrors.filter(error => error.index === index);
            const hasEquipmentError = recordErrors.some(error => error.field === 'equipment_number');
            const hasKilometersError = recordErrors.some(error => error.field === 'kilometers');
            const hasQuantityError = recordErrors.some(error => error.field === 'quantity');
            return (<div key={index} ref={(el) => { recordRefs.current[index] = el; }} className={cn("flex items-center gap-4 p-4 rounded-lg border transition-colors", recordErrors.length > 0 ? "border-red-300 bg-red-50" : "border-gray-200")}>
                  <div className="flex-1">
                      <Label className={cn(hasEquipmentError && "text-red-600")}>Equipment Number</Label>
                    <div className="relative">
                      <Button type="button" variant="outline" role="combobox" aria-expanded={openStates[index]} className={cn("w-full justify-between", hasEquipmentError && "border-red-500 focus:border-red-500 focus:ring-red-500")} onClick={() => toggleOpen(index)} onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        toggleOpen(index);
                    }
                }}>
                        {record.equipment_number || "Select equipment..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>
                      </Button>
                        {hasEquipmentError && (<p className="text-sm text-red-600 mt-1">
                            {recordErrors.find(error => error.field === 'equipment_number')?.message}
                          </p>)}
                      {openStates[index] && (<div className="absolute w-full z-[9999] bg-white rounded-md border shadow-md mt-1">
                          <div className="w-full">
                            <div className="flex w-full items-center border-b px-3">
                              <input ref={(el) => {
                        inputRefs.current[index] = el;
                    }} className="flex h-9 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50" placeholder="Search equipment..." value={inputValues[index] || ''} onChange={(e) => handleInputChange(index, e.target.value)} onKeyDown={(e) => handleKeyDown(index, e)} autoComplete="off"/>
                            </div>
                            {getFilteredSuggestions(index).length === 0 ? (<p className="p-4 text-sm text-center text-muted-foreground">
                                No equipment found.
                              </p>) : (<div className="max-h-[200px] overflow-y-auto">
                                {getFilteredSuggestions(index).map((suggestion, suggestionIndex) => (<div key={suggestion.value} ref={(el) => {
                                if (!optionRefs.current[index]) {
                                    optionRefs.current[index] = {};
                                }
                                optionRefs.current[index][suggestionIndex] = el;
                            }} onClick={() => handleSelect(index, suggestion.value)} tabIndex={0} onKeyDown={(e) => handleKeyDown(index, e)} className={cn("relative flex w-full cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none", "hover:bg-[#003594]/5 hover:text-[#003594]", record.equipment_number === suggestion.value && "bg-[#003594]/10 text-[#003594]", selectedIndices[index] === suggestionIndex && "bg-[#003594]/10 text-[#003594]")}>
                                    <Check className={cn("mr-2 h-4 w-4 flex-shrink-0", (record.equipment_number === suggestion.value || selectedIndices[index] === suggestionIndex) ? "text-[#003594]" : "opacity-0")}/>
                                    {suggestion.label}
                                  </div>))}
                              </div>)}
                          </div>
                        </div>)}
                    </div>
                  </div>
                  <div className="flex-1">
                      <Label className={cn(hasKilometersError && "text-red-600")}>Kilometers</Label>
                    <Input type="number" value={record.kilometers} onChange={(e) => handleRecordChange(index, 'kilometers', e.target.value === '' ? '' : Number(e.target.value))} min={config?.equipment_kilometers[record.equipment_number] || 0} className={cn(hasKilometersError && "border-red-500 focus:border-red-500 focus:ring-red-500")}/>
                      {hasKilometersError && (<p className="text-sm text-red-600 mt-1">
                          {recordErrors.find(error => error.field === 'kilometers')?.message}
                        </p>)}
                  </div>
                  <div className="flex-1">
                      <Label className={cn(hasQuantityError && "text-red-600")}>Quantity (Liters)</Label>
                    <Input type="number" value={record.quantity} onChange={(e) => handleRecordChange(index, 'quantity', e.target.value === '' ? '' : Number(e.target.value))} onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddRecord();
                    }
                }} className={cn(hasQuantityError && "border-red-500 focus:border-red-500 focus:ring-red-500")}/>
                      {hasQuantityError && (<p className="text-sm text-red-600 mt-1">
                          {recordErrors.find(error => error.field === 'quantity')?.message}
                        </p>)}
                  </div>
                  <div className="flex items-end">
                    <Button variant="ghost" size="icon" onClick={() => handleRemoveRecord(index)} className="text-red-500 hover:text-red-700">
                      <Trash2 className="h-4 w-4"/>
                    </Button>
                  </div>
                </div>);
        })}
            </div>

            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={handleAddRecord} className="flex items-center gap-2">
                <Plus className="h-4 w-4"/>
                Add Record
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-[#003594] hover:bg-[#002a7a]">
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>);
}
