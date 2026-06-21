export function expandEquipmentNumbers(equipmentNumber: string): Set<string> {
    const numbers = new Set<string>();
    const parts = equipmentNumber.split(',');
    for (const part of parts) {
        const trimmedPart = part.trim();
        if (!trimmedPart) {
            continue;
        }

        const rangeMatch = trimmedPart.match(/^(\d+)\s*-\s*(\d+)$/);
        if (rangeMatch) {
            const start = parseInt(rangeMatch[1], 10);
            const end = parseInt(rangeMatch[2], 10);
            const step = start <= end ? 1 : -1;
            for (let num = start; step === 1 ? num <= end : num >= end; num += step) {
                numbers.add(String(num));
            }
            continue;
        }

        if (/^\d+$/.test(trimmedPart)) {
            numbers.add(trimmedPart);
            continue;
        }

        const spaceSeparated = trimmedPart.split(/\s+/).filter(Boolean);
        if (spaceSeparated.length > 1 && spaceSeparated.every((token) => /^\d+$/.test(token))) {
            for (const token of spaceSeparated) {
                numbers.add(token);
            }
            continue;
        }

        if (/^[A-Za-z\s]+$/.test(trimmedPart)) {
            numbers.add(trimmedPart);
        }
    }
    return numbers;
}

/** Normalize equipment filter for API: expand numeric lists/ranges; keep asset names as typed. */
export function normalizeEquipmentSearchQuery(raw: string): string | undefined {
    const trimmed = raw.trim();
    if (!trimmed) {
        return undefined;
    }
    if (/[A-Za-z]/.test(trimmed)) {
        return trimmed;
    }
    const expanded = Array.from(expandEquipmentNumbers(trimmed));
    if (expanded.length > 0) {
        return expanded.join(',');
    }
    return trimmed;
}
import { collapseEquipmentSelectionValue } from './formatApplicableEquipments';

export { collapseEquipmentSelectionValue };

export function normalizeEquipmentNumbers(equipmentNumbers: string): string {
    let normalized = String(equipmentNumbers);
    normalized = normalized.replace(/\b(ge|GE)\b/g, '');
    const items = normalized.split(',').map(item => item.trim());
    const numbers: number[] = [];
    const explicitRanges: string[] = [];
    const descriptions = new Set<string>();
    for (const item of items) {
        const rangeMatch = item.match(/^(\d+)\s*-\s*(\d+)$/);
        if (rangeMatch) {
            explicitRanges.push(`${rangeMatch[1]}-${rangeMatch[2]}`);
            continue;
        }
        if (/^\d+$/.test(item)) {
            numbers.push(parseInt(item, 10));
        }
        else {
            const cleanedItem = item.replace(/[^a-zA-Z0-9\s]/g, '').trim();
            if (cleanedItem) {
                descriptions.add(cleanedItem.toLowerCase());
            }
        }
    }
    numbers.sort((a, b) => a - b);
    const rangeNumbers: string[] = [];
    let tempRange: string[] = [];
    for (let i = 0; i < numbers.length; i++) {
        if (i === 0 || numbers[i] === numbers[i - 1] + 1) {
            tempRange.push(numbers[i].toString());
        }
        else {
            if (tempRange.length > 1) {
                rangeNumbers.push(`${tempRange[0]}-${tempRange[tempRange.length - 1]}`);
            }
            else {
                rangeNumbers.push(tempRange[0]);
            }
            tempRange = [numbers[i].toString()];
        }
    }
    if (tempRange.length > 0) {
        if (tempRange.length > 1) {
            rangeNumbers.push(`${tempRange[0]}-${tempRange[tempRange.length - 1]}`);
        }
        else {
            rangeNumbers.push(tempRange[0]);
        }
    }
    const properCaseDescriptions = Array.from(descriptions).map(description => description.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '));
    const resultParts: string[] = [];
    if (explicitRanges.length > 0) {
        resultParts.push(explicitRanges.join(', '));
    }
    if (rangeNumbers.length > 0) {
        resultParts.push(rangeNumbers.join(', '));
    }
    if (properCaseDescriptions.length > 0) {
        resultParts.push(properCaseDescriptions.sort().join(', '));
    }
    return resultParts.join(', ');
}
