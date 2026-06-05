export interface EquipmentDisplayGroup {
    name?: string;
    codes: string[];
}

function splitList(text: string): string[] {
    return text
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
}

function isNumericOrRangeToken(part: string): boolean {
    const token = part.trim();
    return /^\d+$/.test(token) || /^\d+\s*-\s*\d+$/.test(token);
}

/** True when entries use "CODE — Name" (from spare_compatibility + assets join). */
function hasPerEntryNameFormat(text: string): boolean {
    return splitList(text).some((entry) => {
        const emDash = entry.indexOf(' — ');
        if (emDash > 0) {
            return true;
        }
        const hyphen = entry.indexOf(' - ');
        return hyphen > 0 && !/^\d+\s*-\s*\d+$/.test(entry);
    });
}

/** Parse "CODE — Name" or "CODE - Name" entries from API display text. */
export function parseEquipmentDisplayEntries(text: string): Array<{ code: string; name?: string }> {
    return splitList(text).map((entry) => {
        const emDash = entry.indexOf(' — ');
        if (emDash >= 0) {
            return {
                code: entry.slice(0, emDash).trim(),
                name: entry.slice(emDash + 3).trim() || undefined,
            };
        }
        const hyphen = entry.indexOf(' - ');
        if (hyphen >= 0) {
            return {
                code: entry.slice(0, hyphen).trim(),
                name: entry.slice(hyphen + 3).trim() || undefined,
            };
        }
        return { code: entry };
    });
}

/**
 * Legacy spare stock format: codes and ranges first, equipment name(s) at the end.
 * e.g. "117-119, 327, Baggage Tow Tractor"
 */
export function parseLegacySpareApplicableFormat(text: string): EquipmentDisplayGroup[] | null {
    const parts = splitList(text);
    if (!parts.length) {
        return null;
    }

    const codes: string[] = [];
    const names: string[] = [];

    for (const part of parts) {
        if (isNumericOrRangeToken(part)) {
            codes.push(part.replace(/\s*-\s*/g, '-'));
            continue;
        }
        names.push(part);
    }

    if (codes.length && names.length) {
        return [{ name: names.join(', '), codes }];
    }
    if (codes.length) {
        return [{ codes }];
    }
    if (names.length) {
        return names.map((name) => ({ name, codes: [] }));
    }
    return null;
}

/** Parse raw comma-separated equipment codes (may include numeric ranges). */
export function parseRawEquipmentCodes(text: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const part of splitList(text)) {
        const token = part.replace(/\s+/g, ' ').trim();
        if (!token || seen.has(token)) {
            continue;
        }
        seen.add(token);
        out.push(token);
    }
    return out;
}

function collapseConsecutiveNumbers(numbers: number[]): string[] {
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
}

/** Format equipment codes into compact ranges where possible. */
export function formatEquipmentCodeRanges(codes: string[]): string {
    const explicitRanges: string[] = [];
    const numericSingles: number[] = [];
    const textCodes: string[] = [];

    for (const raw of codes) {
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
}

export function groupEquipmentEntries(
    entries: Array<{ code: string; name?: string }>
): EquipmentDisplayGroup[] {
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
}

export function formatEquipmentDisplayGroup(group: EquipmentDisplayGroup): string {
    const ranges = formatEquipmentCodeRanges(group.codes);
    if (!ranges) {
        return group.name || '';
    }
    if (group.name) {
        return `${group.name} (${ranges})`;
    }
    return ranges;
}

export function formatEquipmentDisplayGroups(groups: EquipmentDisplayGroup[]): string {
    return groups.map(formatEquipmentDisplayGroup).filter(Boolean).join(', ');
}

function parseApplicableText(text: string): EquipmentDisplayGroup[] {
    const trimmed = text.trim();
    if (!trimmed) {
        return [];
    }

    if (hasPerEntryNameFormat(trimmed)) {
        const entries = parseEquipmentDisplayEntries(trimmed);
        return groupEquipmentEntries(entries);
    }

    const legacy = parseLegacySpareApplicableFormat(trimmed);
    if (legacy?.length) {
        return legacy;
    }

    return [{ codes: parseRawEquipmentCodes(trimmed) }];
}

/** Build grouped spare applicability for search / stock tables. */
export function buildEquipmentDisplayGroups(
    equipmentNumber?: string | null,
    equipmentDisplay?: string | null
): EquipmentDisplayGroup[] {
    const displayText = (equipmentDisplay || '').trim();
    const numberText = (equipmentNumber || '').trim();

    if (displayText) {
        return parseApplicableText(displayText);
    }

    if (numberText) {
        return parseApplicableText(numberText);
    }

    return [];
}

export function formatApplicableEquipmentsLabel(
    equipmentNumber?: string | null,
    equipmentDisplay?: string | null
): string {
    const groups = buildEquipmentDisplayGroups(equipmentNumber, equipmentDisplay);
    const label = formatEquipmentDisplayGroups(groups);
    return label || '—';
}
