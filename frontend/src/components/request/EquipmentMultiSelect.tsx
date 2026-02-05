'use client';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/utils/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
interface EquipmentMultiSelectProps {
    equipmentList: string[] | string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
}
export function EquipmentMultiSelect({ equipmentList, value, onChange, error, }: EquipmentMultiSelectProps) {
    const [open, setOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const parseInput = (input: string | string[] | undefined): {
        numbers: number[];
        ranges: {
            start: number;
            end: number;
        }[];
        textEntries: string[];
    } => {
        const inputString = Array.isArray(input)
            ? input.join(',')
            : input ?? '';
        const parts = inputString
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);
        const numbers: number[] = [];
        const explicitRanges: {
            start: number;
            end: number;
        }[] = [];
        const textEntries: string[] = [];
        for (const part of parts) {
            if (part.includes('-')) {
                const [start, end] = part.split('-').map((n) => parseInt(n.trim()));
                if (!isNaN(start) && !isNaN(end))
                    explicitRanges.push({ start, end });
            }
            else {
                const num = parseInt(part);
                if (!isNaN(num))
                    numbers.push(num);
                else
                    textEntries.push(part);
            }
        }
        numbers.sort((a, b) => a - b);
        const allRanges: {
            start: number;
            end: number;
        }[] = [...explicitRanges];
        for (let i = 0; i < numbers.length; i++) {
            for (let j = i + 1; j < numbers.length; j++) {
                allRanges.push({ start: numbers[i], end: numbers[j] });
            }
        }
        return { numbers, ranges: allRanges, textEntries };
    };
    const generateRanges = useCallback((input: string | string[]) => {
        const { numbers, ranges, textEntries } = parseInput(input);
        const individual: string[] = [...numbers.map((n) => n.toString())];
        const rangeEntries: string[] = [];
        for (const range of ranges) {
            if (range.start === range.end)
                continue;
            const label = `${range.start}-${range.end}`;
            if (!rangeEntries.includes(label))
                rangeEntries.push(label);
        }
        return [
            ...new Set([...individual, ...textEntries, ...rangeEntries]),
        ].sort((a, b) => {
            const aNum = parseInt(a.split('-')[0]);
            const bNum = parseInt(b.split('-')[0]);
            return isNaN(aNum) || isNaN(bNum) ? a.localeCompare(b) : aNum - bNum;
        });
    }, []);
    const suggestions = useMemo(() => {
        if (!equipmentList || (Array.isArray(equipmentList) && equipmentList.length === 0))
            return [];
        const list = generateRanges(equipmentList);
        return list.map((r) => ({ value: r, label: r }));
    }, [equipmentList, generateRanges]);
    const filteredSuggestions = useMemo(() => {
        const query = inputValue.toLowerCase();
        return suggestions.filter((s) => s.label.toLowerCase().includes(query));
    }, [suggestions, inputValue]);
    const selectedValues = useMemo(() => {
        return value.split(',').map((v) => v.trim()).filter(Boolean);
    }, [value]);
    const handleSelect = (currentValue: string) => {
        const newSelected = selectedValues.includes(currentValue)
            ? selectedValues.filter((v) => v !== currentValue)
            : [...selectedValues, currentValue];
        onChange(newSelected.join(', '));
        setInputValue('');
    };
    const handleRemove = (val: string) => {
        onChange(selectedValues.filter((v) => v !== val).join(', '));
    };
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    const isSelected = (val: string) => selectedValues.includes(val);
    return (<div className="flex flex-col gap-1.5" ref={containerRef}>
      <div className="relative">
        
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className={cn('w-full justify-between min-h-[40px]', error ? 'border-red-500' : '')} onClick={() => setOpen((o) => !o)}>
          <div className="flex flex-wrap gap-1 flex-1 justify-start">
            {selectedValues.length > 0 ? (selectedValues.map((selectedValue) => (<Badge key={selectedValue} variant="secondary" className="text-xs flex items-center gap-1">
                  {selectedValue}
                  
                  <span onClick={(e) => {
                e.stopPropagation();
                handleRemove(selectedValue);
            }} className="cursor-pointer hover:bg-red-100 rounded-full p-0.5" aria-label={`Remove ${selectedValue}`} role="button">
                    <X className="h-3 w-3"/>
                  </span>
                </Badge>))) : (<span className="text-muted-foreground">
                Select equipment numbers...
              </span>)}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>
        </Button>

        
        {open && (<div className="absolute w-full z-[9999] bg-white rounded-md border shadow-md mt-1">
            <div className="w-full">
              <div className="flex w-full items-center border-b px-3">
                <input className="flex h-9 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50" placeholder="Search equipment numbers..." value={inputValue} onChange={(e) => setInputValue(e.target.value)} autoComplete="off"/>
              </div>

              {filteredSuggestions.length === 0 ? (<p className="p-4 text-sm text-center text-muted-foreground">
                  No equipment numbers found.
                </p>) : (<div className="max-h-[200px] overflow-y-auto">
                  {filteredSuggestions.map((suggestion) => (<div key={suggestion.value} onClick={() => handleSelect(suggestion.value)} className={cn('relative flex w-full cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none', 'hover:bg-accent hover:text-accent-foreground', isSelected(suggestion.value) &&
                        'bg-accent text-accent-foreground')}>
                      <Check className={cn('mr-2 h-4 w-4 flex-shrink-0', isSelected(suggestion.value)
                        ? 'opacity-100'
                        : 'opacity-0')}/>
                      {suggestion.label}
                    </div>))}
                </div>)}
            </div>
          </div>)}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>);
}
