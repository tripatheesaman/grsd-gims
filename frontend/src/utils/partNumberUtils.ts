export const ABSENT_PART_NUMBER = 'N/A';

export function normalizePartNumber(partNumber: string): string {
    return String(partNumber || '').trim().toUpperCase();
}

export function isAbsentPartNumber(partNumber: string | null | undefined): boolean {
    const normalized = normalizePartNumber(String(partNumber ?? ''));
    return !normalized || normalized === 'NA' || normalized === 'N/A';
}

export function resolveReceivePartNumber(partNumber: string | null | undefined): string {
    if (isAbsentPartNumber(partNumber)) {
        return ABSENT_PART_NUMBER;
    }
    return normalizePartNumber(String(partNumber ?? ''));
}
