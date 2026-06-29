import type { StockVariant } from '@/types/search';

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

export function partNumbersMatch(a: string, b: string): boolean {
    const left = normalizePartNumber(a);
    const right = normalizePartNumber(b);
    if (!left || !right || isAbsentPartNumber(left) || isAbsentPartNumber(right)) {
        return false;
    }
    return left === right || left.includes(right) || right.includes(left);
}

/** Resolve the best-matching variant for a search part hint or stock row id. */
export function findVariantByPartHint(
    variants: StockVariant[],
    hint?: string | null,
    preferredId?: number | null
): StockVariant | undefined {
    if (!variants.length) {
        return undefined;
    }

    if (preferredId != null && Number.isFinite(preferredId)) {
        const byId = variants.find((variant) => variant.id === preferredId);
        if (byId) {
            return byId;
        }
    }

    const trimmedHint = String(hint || '').trim();
    if (!trimmedHint) {
        return undefined;
    }

    const normalizedHint = normalizePartNumber(trimmedHint);
    const byExactPart = variants.find(
        (variant) => normalizePartNumber(variant.partNumber) === normalizedHint
    );
    if (byExactPart) {
        return byExactPart;
    }

    const byPartialPart = variants.find((variant) => partNumbersMatch(variant.partNumber, trimmedHint));
    if (byPartialPart) {
        return byPartialPart;
    }

    const upperHint = trimmedHint.toUpperCase();
    const byNac = variants.find((variant) => variant.nacCode.trim().toUpperCase() === upperHint);
    if (byNac) {
        return byNac;
    }

    return variants.find((variant) => variant.nacCode.toUpperCase().includes(upperHint));
}
