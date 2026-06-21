/** Group spare compatibility codes by asset series name (matches search display). */

export type EquipmentEntry = { code: string; name?: string };

export type EquipmentDisplayGroup = {
    name?: string;
    codes: string[];
};

const collapseConsecutiveNumbers = (numbers: number[]): string[] => {
    if (!numbers.length) {
        return [];
    }
    const sorted = [...numbers].sort((a, b) => a - b);
    const ranges: string[] = [];
    let start = sorted[0];
    let prev = sorted[0];

    for (let i = 1; i <= sorted.length; i++) {
        const current = sorted[i];
        if (current === prev + 1) {
            prev = current;
            continue;
        }
        ranges.push(start === prev ? String(start) : `${start}-${prev}`);
        start = current;
        prev = current;
    }
    return ranges;
};

/** Split comma/space-separated numeric lists into individual tokens. */
export const tokenizeEquipmentCodes = (raw: string): string[] => {
    const normalized = String(raw || '')
        .replace(/\b(ge|GE)\b/g, '')
        .trim();
    if (!normalized) {
        return [];
    }

    const tokens: string[] = [];
    for (const segment of normalized.split(',')) {
        const trimmed = segment.trim();
        if (!trimmed) {
            continue;
        }

        const embeddedRange = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
        if (embeddedRange) {
            tokens.push(`${embeddedRange[1]}-${embeddedRange[2]}`);
            continue;
        }

        const spaceParts = trimmed.split(/\s+/).filter(Boolean);
        if (
            spaceParts.length > 1 &&
            spaceParts.every((part) => /^\d+$/.test(part) || /^\d+\s*-\s*\d+$/.test(part))
        ) {
            for (const part of spaceParts) {
                const rangePart = part.match(/^(\d+)\s*-\s*(\d+)$/);
                tokens.push(rangePart ? `${rangePart[1]}-${rangePart[2]}` : part);
            }
            continue;
        }

        tokens.push(trimmed);
    }
    return tokens;
};

/** Collapse numeric codes into ranges where consecutive. */
export const formatEquipmentCodeRanges = (codes: string[]): string => {
    const explicitRanges: string[] = [];
    const numericSingles: number[] = [];
    const textCodes: string[] = [];

    for (const raw of codes.flatMap((code) => tokenizeEquipmentCodes(code))) {
        const code = raw.trim();
        if (!code) {
            continue;
        }
        const embeddedRange = code.match(/^(\d+)\s*-\s*(\d+)$/);
        if (embeddedRange) {
            explicitRanges.push(`${embeddedRange[1]}-${embeddedRange[2]}`);
            continue;
        }
        if (/^\d+$/.test(code)) {
            numericSingles.push(parseInt(code, 10));
            continue;
        }
        textCodes.push(code);
    }

    const collapsed = collapseConsecutiveNumbers(numericSingles);
    return [...explicitRanges, ...collapsed, ...textCodes].join(', ');
};

/** Normalize a stored equipment selection (ranges, sections, multi-select). */
export const collapseEquipmentSelectionValue = (value: string): string => {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
        return '';
    }
    return formatEquipmentCodeRanges(trimmed.split(',').map((part) => part.trim()).filter(Boolean));
};

export const groupEquipmentEntries = (entries: EquipmentEntry[]): EquipmentDisplayGroup[] => {
    const groupMap = new Map<string, EquipmentDisplayGroup>();
    const order: string[] = [];

    for (const entry of entries) {
        const code = entry.code.trim();
        if (!code) {
            continue;
        }
        const nameKey = (entry.name || '').trim();
        const mapKey = nameKey || '__unnamed__';
        if (!groupMap.has(mapKey)) {
            groupMap.set(mapKey, { name: nameKey || undefined, codes: [] });
            order.push(mapKey);
        }
        const group = groupMap.get(mapKey)!;
        if (!group.codes.includes(code)) {
            group.codes.push(code);
        }
    }

    return order.map((key) => groupMap.get(key)!);
};

export const formatEquipmentDisplayGroup = (
    group: EquipmentDisplayGroup
): { equipmentCode: string; name: string; label: string } => {
    const ranges = formatEquipmentCodeRanges(group.codes);
    const name = (group.name || '').trim();
    const equipmentCode = ranges || name;
    let label = ranges;
    if (name && ranges) {
        label = `${name} (${ranges})`;
    } else if (name) {
        label = name;
    }
    return { equipmentCode, name, label };
};

export const dedupeEquipmentEntries = (entries: EquipmentEntry[]): EquipmentEntry[] => {
    const seen = new Set<string>();
    const out: EquipmentEntry[] = [];
    for (const entry of entries) {
        const code = entry.code.trim();
        if (!code || seen.has(code)) {
            continue;
        }
        seen.add(code);
        out.push({
            code,
            name: entry.name?.trim() || undefined,
        });
    }
    return out;
};
