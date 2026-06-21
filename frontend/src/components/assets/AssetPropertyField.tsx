'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PROPERTY_DISPLAY_LABELS } from '@/types/asset';
import type { AssetTypeProperty } from '@/types/asset';
import { combineValueWithUnit, isDimensionProperty, isNumericProperty, parseValueWithUnit } from './assetFormUtils';

interface AssetPropertyFieldProps {
    property: AssetTypeProperty;
    value: string;
    unit: string;
    onValueChange: (value: string) => void;
    onUnitChange: (unit: string) => void;
    weightUnits: string[];
    sizeUnits: string[];
    quantityUnits: string[];
    disabled?: boolean;
}

export function AssetPropertyField({
    property,
    value,
    unit,
    onValueChange,
    onUnitChange,
    weightUnits,
    sizeUnits,
    quantityUnits,
    disabled,
}: AssetPropertyFieldProps) {
    const label = PROPERTY_DISPLAY_LABELS[property.property_name] || property.property_name;
    const id = `prop-${property.property_name}`;

    if (isDimensionProperty(property.property_name)) {
        const units = property.property_name === 'weight' ? weightUnits : sizeUnits;
        return (
            <div className="space-y-2">
                <Label htmlFor={id}>
                    {label}
                    {property.is_required && <span className="ml-1 text-red-500">*</span>}
                </Label>
                <div className="flex gap-2">
                    <Input
                        id={id}
                        value={value}
                        disabled={disabled}
                        onChange={(e) => onValueChange(e.target.value)}
                        placeholder={`Enter ${label.toLowerCase()}`}
                        className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20"
                    />
                    <Select value={unit || units[0] || ''} onValueChange={onUnitChange} disabled={disabled}>
                        <SelectTrigger className="w-28 border-[#002a6e]/10">
                            <SelectValue placeholder="Unit" />
                        </SelectTrigger>
                        <SelectContent>
                            {units.map((u) => (
                                <SelectItem key={u} value={u}>
                                    {u}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
        );
    }

    if (property.property_name === 'quantity') {
        return (
            <div className="space-y-2">
                <Label htmlFor={id}>
                    {label}
                    {property.is_required && <span className="ml-1 text-red-500">*</span>}
                </Label>
                <div className="flex gap-2">
                    <Input
                        id={id}
                        type="number"
                        min={0}
                        step="1"
                        value={value}
                        disabled={disabled}
                        onChange={(e) => onValueChange(e.target.value)}
                        className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20"
                    />
                    <Select value={unit || quantityUnits[0] || 'EA'} onValueChange={onUnitChange} disabled={disabled}>
                        <SelectTrigger className="w-28 border-[#002a6e]/10">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {quantityUnits.map((u) => (
                                <SelectItem key={u} value={u}>
                                    {u}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
        );
    }

    if (isNumericProperty(property.property_name)) {
        return (
            <div className="space-y-2">
                <Label htmlFor={id}>
                    {label}
                    {property.is_required && <span className="ml-1 text-red-500">*</span>}
                </Label>
                <Input
                    id={id}
                    type="number"
                    min={property.property_name === 'purchase_year' ? 1900 : 0}
                    max={property.property_name === 'purchase_year' ? new Date().getFullYear() + 1 : undefined}
                    value={value}
                    disabled={disabled}
                    onChange={(e) => onValueChange(e.target.value)}
                    placeholder={property.property_name === 'purchase_year' ? 'e.g. 2024' : '0'}
                    className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20"
                />
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <Label htmlFor={id}>
                {label}
                {property.is_required && <span className="ml-1 text-red-500">*</span>}
            </Label>
            <Input
                id={id}
                value={value}
                disabled={disabled}
                onChange={(e) => onValueChange(e.target.value)}
                placeholder={`Enter ${label.toLowerCase()}`}
                className="border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20"
            />
        </div>
    );
}

export function initPropertyUnits(
    propertyValues: Record<string, string>,
    weightUnits: string[],
    sizeUnits: string[],
    quantityUnits: string[]
): Record<string, string> {
    const units: Record<string, string> = {};
    const weight = parseValueWithUnit(propertyValues.weight || '');
    const size = parseValueWithUnit(propertyValues.size || '');
    units.weight = weight.unit || weightUnits[0] || 'KG';
    units.size = size.unit || sizeUnits[0] || 'M';
    units.quantity = propertyValues.unit || quantityUnits[0] || 'EA';
    return units;
}

export { combineValueWithUnit, parseValueWithUnit };
