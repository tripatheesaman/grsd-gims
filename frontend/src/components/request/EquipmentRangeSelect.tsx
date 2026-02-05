'use client';
import { useState, useMemo, useCallback } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/utils/utils';
import { Button } from '@/components/ui/button';
interface EquipmentRangeSelectProps {
    equipmentList: string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
}
export function EquipmentRangeSelect({ equipmentList, value, onChange, error }: EquipmentRangeSelectProps) {
    const [open, setOpen] = useState(false);
    const [inputValue, setInputValue] = useState("");
    const parseInput = (input: string): {
        numbers: number[];
        ranges: {
            start: number;
            end: number;
        }[];
        textEntries: string[];
    } => {
        const parts = input.split(',').map(part => part.trim()).filter(part => part);
        const numbers: number[] = [];
        const ranges: {
            start: number;
            end: number;
        }[] = [];
        const textEntries: string[] = [];
        parts.forEach(part => {
            if (part.includes('-')) {
                const [start, end] = part.split('-').map(num => parseInt(num.trim()));
                if (!isNaN(start) && !isNaN(end)) {
                    ranges.push({ start, end });
                }
            }
            else {
                const num = parseInt(part);
                if (!isNaN(num)) {
                    numbers.push(num);
                }
                else {
                    textEntries.push(part);
                }
            }
        });
        if (ranges.length === 0 && numbers.length > 0) {
            const sortedNumbers = [...numbers].sort((a, b) => a - b);
            let currentRange: number[] = [];
            for (let i = 0; i < sortedNumbers.length; i++) {
                currentRange.push(sortedNumbers[i]);
                if (i === sortedNumbers.length - 1 || sortedNumbers[i + 1] - sortedNumbers[i] > 1) {
                    if (currentRange.length > 0) {
                        ranges.push({
                            start: currentRange[0],
                            end: currentRange[currentRange.length - 1]
                        });
                        currentRange = [];
                    }
                }
            }
        }
        return { numbers, ranges, textEntries };
    };
    const generateRanges = useCallback((input: string): string[] => {
        const { numbers, ranges, textEntries } = parseInput(input);
        const individualNumbers: string[] = [];
        const rangeEntries: string[] = [];
        const textItems: string[] = [];
        ranges.forEach(range => {
            for (let i = range.start; i <= range.end; i++) {
                individualNumbers.push(i.toString());
            }
        });
        numbers.forEach(num => {
            if (!individualNumbers.includes(num.toString())) {
                individualNumbers.push(num.toString());
            }
        });
        textEntries.forEach(text => {
            textItems.push(text);
        });
        ranges.forEach(range => {
            if (range.start !== range.end) {
                const originalRange = `${range.start}-${range.end}`;
                if (!rangeEntries.includes(originalRange)) {
                    rangeEntries.push(originalRange);
                }
            }
            for (let i = range.start; i < range.end; i++) {
                for (let j = i + 1; j <= range.end; j++) {
                    const subRange = `${i}-${j}`;
                    if (!rangeEntries.includes(subRange)) {
                        rangeEntries.push(subRange);
                    }
                }
            }
        });
        individualNumbers.sort((a, b) => parseInt(a) - parseInt(b));
        textItems.sort();
        rangeEntries.sort((a, b) => {
            const aStart = parseInt(a.split('-')[0]);
            const bStart = parseInt(b.split('-')[0]);
            return aStart - bStart;
        });
        const result = [
            ...individualNumbers,
            ...textItems,
            ...rangeEntries
        ];
        return result;
    }, []);
    const suggestions = useMemo(() => {
        if (!equipmentList)
            return [];
        const rangesList = generateRanges(equipmentList);
        return rangesList.map(range => ({
            value: range,
            label: range
        }));
    }, [equipmentList, generateRanges]);
    const filteredSuggestions = useMemo(() => {
        const query = inputValue.toLowerCase();
        return suggestions.filter(suggestion => suggestion.label.toLowerCase().includes(query));
    }, [suggestions, inputValue]);
    const selectedItem = suggestions.find(item => item.value === value);
    const handleSelect = (currentValue: string) => {
        onChange(currentValue);
        setOpen(false);
        setInputValue("");
    };
    return (<div className="flex flex-col gap-1.5">
      <div className="relative">
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className={cn("w-full justify-between", error ? "border-red-500" : "")} onClick={() => setOpen(!open)}>
          {selectedItem ? selectedItem.label : "Select equipment number..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>
        </Button>
        {open && (<div className="absolute w-full z-[9999] bg-white rounded-md border shadow-md mt-1">
            <div className="w-full">
              <div className="flex w-full items-center border-b px-3">
                <input className="flex h-9 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50" placeholder="Search equipment number..." value={inputValue} onChange={(e) => setInputValue(e.target.value)}/>
              </div>
              {filteredSuggestions.length === 0 ? (<p className="p-4 text-sm text-center text-muted-foreground">
                  No equipment numbers found.
                </p>) : (<div className="max-h-[200px] overflow-y-auto">
                  {filteredSuggestions.map((suggestion) => (<div key={suggestion.value} onClick={() => handleSelect(suggestion.value)} className={cn("relative flex w-full cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none", "hover:bg-accent hover:text-accent-foreground", value === suggestion.value && "bg-accent text-accent-foreground")}>
                      <Check className={cn("mr-2 h-4 w-4 flex-shrink-0", value === suggestion.value ? "opacity-100" : "opacity-0")}/>
                      {suggestion.label}
                    </div>))}
                </div>)}
            </div>
          </div>)}
      </div>
      {error && (<p className="text-sm text-red-500">{error}</p>)}
    </div>);
}
