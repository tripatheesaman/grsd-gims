import type { StockVariant } from '@/types/search';

export function normalizePartNumber(partNumber: string): string {
    return String(partNumber || '').trim().toUpperCase();
}

export function partNumbersMatch(a: string, b: string): boolean {
    const left = normalizePartNumber(a);
    const right = normalizePartNumber(b);
    if (!left || !right) {
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
    if (preferredId != null) {
        const byId = variants.find((v) => v.id === preferredId);
        if (byId) {
            return byId;
        }
    }
    const trimmedHint = String(hint || '').trim();
    if (!trimmedHint) {
        return undefined;
    }
    const exact = variants.find((v) => partNumbersMatch(v.partNumber, trimmedHint));
    if (exact) {
        return exact;
    }
    const upper = normalizePartNumber(trimmedHint);
    return variants.find((v) => normalizePartNumber(v.partNumber).includes(upper));
}

export function sortVariantsWithPreferred(
    variants: StockVariant[],
    preferred?: StockVariant | null
): StockVariant[] {
    if (!preferred) {
        return variants;
    }
    return [
        preferred,
        ...variants.filter((v) => v.id !== preferred.id),
    ];
}
