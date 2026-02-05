'use client';
import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/utils/utils';
import { Button } from '@/components/ui/button';
import { normalizeEquipmentNumbers } from '@/utils/equipmentNumbers';
interface EquipmentSelectProps {
    equipmentList: string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
}
export function EquipmentSelect({ equipmentList, value, onChange, error }: EquipmentSelectProps) {
    const [open, setOpen] = useState(false);
    const [inputValue, setInputValue] = useState("");
    const suggestions = useMemo(() => {
        if (!equipmentList)
            return [];
        return equipmentList.split(',')
            .map(equipment => equipment.trim())
            .filter(equipment => equipment)
            .map(equipment => ({
            value: equipment,
            label: normalizeEquipmentNumbers(equipment)
        }));
    }, [equipmentList]);
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
          {selectedItem ? selectedItem.label : "Select equipment..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>
        </Button>
        {open && (<div className="absolute w-full z-[9999] bg-white rounded-md border shadow-md mt-1">
            <div className="w-full">
              <div className="flex w-full items-center border-b px-3">
                <input className="flex h-9 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50" placeholder="Search equipment..." value={inputValue} onChange={(e) => setInputValue(e.target.value)}/>
              </div>
              {filteredSuggestions.length === 0 ? (<p className="p-4 text-sm text-center text-muted-foreground">
                  No equipment found.
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
