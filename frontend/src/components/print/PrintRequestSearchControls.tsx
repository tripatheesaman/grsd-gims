'use client';
import { SearchBar } from '@/components/search/SearchBar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
interface PrintRequestSearchControlsProps {
    onUniversalSearch: (value: string) => void;
    onEquipmentSearch: (value: string) => void;
    onPartSearch: (value: string) => void;
    referenceStatus?: string;
    onReferenceStatusChange?: (value: string) => void;
}
export const PrintRequestSearchControls = ({ onUniversalSearch, onEquipmentSearch, onPartSearch, referenceStatus, onReferenceStatusChange, }: PrintRequestSearchControlsProps) => {
    return (<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <SearchBar placeholder="Universal Search..." onSearch={onUniversalSearch}/>
      <SearchBar placeholder="Search by Equipment Number..." onSearch={onEquipmentSearch}/>
      <SearchBar placeholder="Search by Part Number..." onSearch={onPartSearch}/>
      <div className="flex flex-col space-y-1">
        <span className="text-xs font-medium text-gray-600">Reference Document</span>
        <Select value={referenceStatus || 'all'} onValueChange={(value) => onReferenceStatusChange && onReferenceStatusChange(value)}>
          <SelectTrigger className="h-9 text-sm bg-white">
            <SelectValue placeholder="All"/>
          </SelectTrigger>
          <SelectContent className="bg-white">
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="uploaded">Uploaded</SelectItem>
            <SelectItem value="not_uploaded">Not Uploaded</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>);
};
