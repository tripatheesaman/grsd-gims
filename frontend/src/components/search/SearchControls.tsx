'use client';
import { SearchBar } from './SearchBar';
interface SearchControlsProps {
    onUniversalSearch: (value: string) => void;
    onEquipmentSearch: (value: string) => void;
    onPartSearch: (value: string) => void;
}
export const SearchControls = ({ onUniversalSearch, onEquipmentSearch, onPartSearch, }: SearchControlsProps) => {
    return (<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <SearchBar placeholder="Universal Search..." onSearch={onUniversalSearch}/>
      <SearchBar placeholder="Search by Equipment Number..." onSearch={onEquipmentSearch}/>
      <SearchBar placeholder="Search by Part Number..." onSearch={onPartSearch}/>
    </div>);
};
