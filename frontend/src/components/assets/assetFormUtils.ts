/** Property names stored on the assets table — not duplicated in the dynamic properties section. */
export const ASSET_TABLE_FIELD_PROPERTIES = new Set([
    'equipment_code',
    'location',
    'rrp_status',
    'current_value',
    'insurance_amount',
    'servicability_status',
    'purchase_currency',
    'purchase_fx_rate',
]);

export function parseValueWithUnit(raw: string): { value: string; unit: string } {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return { value: '', unit: '' };
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) return { value: parts[0], unit: '' };
    return { value: parts[0], unit: parts.slice(1).join(' ') };
}

export function combineValueWithUnit(value: string, unit: string): string {
    const v = value.trim();
    const u = unit.trim();
    if (!v) return '';
    return u ? `${v} ${u}` : v;
}

export function isNumericProperty(name: string): boolean {
    return name === 'purchase_year' || name === 'quantity';
}

export function isDimensionProperty(name: string): boolean {
    return name === 'weight' || name === 'size';
}
