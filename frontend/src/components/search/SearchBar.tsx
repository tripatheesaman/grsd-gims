'use client';
import { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/utils/utils';
interface SearchBarProps {
    placeholder: string;
    onSearch: (value: string) => void;
    className?: string;
    debounceTime?: number;
}
export const SearchBar = ({ placeholder, onSearch, className, debounceTime = 300 }: SearchBarProps) => {
    const [searchTerm, setSearchTerm] = useState('');
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const onSearchRef = useRef(onSearch);

    useEffect(() => {
        onSearchRef.current = onSearch;
    }, [onSearch]);

    useEffect(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
            onSearchRef.current(searchTerm);
        }, debounceTime);
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [searchTerm, debounceTime]);
    return (<div className={cn("relative", className)}>
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search className="h-5 w-5 text-[#003594] group-hover:text-[#d2293b] transition-colors"/>
      </div>
      <input type="text" className="block w-full pl-10 pr-3 py-2.5 border border-[#002a6e]/10 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#003594] focus:border-[#003594] hover:border-[#d2293b]/20 sm:text-sm transition-colors group" placeholder={placeholder} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}/>
    </div>);
};
