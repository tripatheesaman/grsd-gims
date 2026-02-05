export function expandEquipmentNumbers(equipmentNumber: string): Set<string> {
    const numbers = new Set<string>();
    const parts = equipmentNumber.split(',');
    for (const part of parts) {
        const trimmedPart = part.trim();
        if (/^[A-Za-z\s]+$/.test(trimmedPart)) {
            numbers.add(trimmedPart);
        }
        else if (/^\d+-\d+$/.test(trimmedPart)) {
            const [start, end] = trimmedPart.split('-').map(Number);
            for (let num = start; num <= end; num++) {
                numbers.add(num.toString());
            }
        }
        else if (/^\d+$/.test(trimmedPart)) {
            numbers.add(trimmedPart);
        }
    }
    return numbers;
}
export function normalizeEquipmentNumbers(equipmentNumbers: string): string {
    let normalized = String(equipmentNumbers);
    normalized = normalized.replace(/\b(ge|GE)\b/g, '');
    const items = normalized.split(',').map(item => item.trim());
    const numbers: number[] = [];
    const descriptions = new Set<string>();
    for (const item of items) {
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
    if (rangeNumbers.length > 0) {
        resultParts.push(rangeNumbers.join(', '));
    }
    if (properCaseDescriptions.length > 0) {
        resultParts.push(properCaseDescriptions.sort().join(', '));
    }
    return resultParts.join(', ');
}
