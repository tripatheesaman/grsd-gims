'use client';
import { useCallback, useState } from 'react';
interface FunDatePickerProps {
    from: string;
    to: string;
    onChange: (next: {
        from: string;
        to: string;
    }) => void;
}
export function FunDatePicker({ from, to, onChange }: FunDatePickerProps) {
    const [localFrom, setLocalFrom] = useState<string>(from);
    const [localTo, setLocalTo] = useState<string>(to);
    const commit = useCallback((nf: string, nt: string) => {
        setLocalFrom(nf);
        setLocalTo(nt);
        if (nf && nt)
            onChange({ from: nf, to: nt });
    }, [onChange]);
    return (<div className="flex items-end gap-3 flex-wrap">
			<div className="space-y-1">
				<label className="text-sm font-medium text-[#003594]">From</label>
				<input type="date" value={localFrom} onChange={(e) => commit(e.target.value, localTo)} className="border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none"/>
			</div>
			<div className="space-y-1">
				<label className="text-sm font-medium text-[#003594]">To</label>
				<input type="date" value={localTo} onChange={(e) => commit(localFrom, e.target.value)} className="border rounded-md px-3 py-2 text-sm border-[#002a6e]/20 focus:border-[#003594] focus:outline-none"/>
			</div>
		</div>);
}
