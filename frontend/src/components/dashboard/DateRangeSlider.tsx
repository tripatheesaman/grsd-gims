'use client';
import { useId } from 'react';
interface DateRangeSliderProps {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    onChange: (value: number) => void;
}
export function DateRangeSlider({ value, min = 7, max = 90, step = 1, onChange }: DateRangeSliderProps) {
    const id = useId();
    return (<div className="space-y-2">
			<div className="flex items-center justify-between">
				<label htmlFor={id} className="text-sm font-medium text-[#003594]">Date Range</label>
				<span className="text-sm text-gray-600">Last {value} days</span>
			</div>
			<input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#003594]"/>
			<div className="flex justify-between text-xs text-gray-500">
				<span>{min}d</span>
				<span>{max}d</span>
			</div>
		</div>);
}
