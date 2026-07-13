import type { StockVariant } from '@/types/search';

export const ABSENT_PART_NUMBER = 'N/A';
export const REQUEST_PART_NUMBER_REGEX = /^[A-Z0-9]+$/;

export function normalizePartNumber(partNumber: string): string {
    return String(partNumber || '').trim().toUpperCase();
}

export function isAbsentPartNumber(partNumber: string | null | undefined): boolean {
    const identity = String(partNumber ?? '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
    return !identity || identity === 'NA';
}

export function resolveReceivePartNumber(partNumber: string | null | undefined): string {
    if (isAbsentPartNumber(partNumber)) {
        return ABSENT_PART_NUMBER;
    }
    return normalizePartNumber(String(partNumber ?? ''));
}

export function sanitizeRequestPartNumberInput(partNumber: string | null | undefined): string {
    return normalizePartNumber(String(partNumber ?? '')).replace(/[^A-Z0-9]/g, '');
}

export function getRequestPartNumberValidationError(
    partNumber: string | null | undefined,
    opts: { allowEmpty?: boolean } = {}
): string | null {
    if (isAbsentPartNumber(partNumber)) {
        return opts.allowEmpty === false ? 'Part number is required' : null;
    }
    const normalized = normalizePartNumber(String(partNumber ?? '')).replace(/[^A-Z0-9]/g, '');
    if (!normalized) {
        return opts.allowEmpty === false ? 'Part number is required' : null;
    }
    if (!REQUEST_PART_NUMBER_REGEX.test(normalized)) {
        return 'Part number can only contain letters and numbers';
    }
    return null;
}

export function normalizeRequestIdentityValue(value: string | null | undefined): string {
    return String(value || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
}

export function buildNewRequestIdentity(
    partNumber: string | null | undefined,
    itemName: string | null | undefined
): { type: 'partNumber' | 'itemName' | 'none'; key: string; partKey: string; nameKey: string } {
    const partKey = isAbsentPartNumber(partNumber)
        ? ''
        : normalizeRequestIdentityValue(partNumber);
    const nameKey = normalizeRequestIdentityValue(itemName);

    if (partKey) {
        return { type: 'partNumber', key: partKey, partKey, nameKey };
    }
    if (nameKey) {
        return { type: 'itemName', key: nameKey, partKey: '', nameKey };
    }
    return { type: 'none', key: '', partKey: '', nameKey: '' };
}

/** True when part numbers should be treated as the same for new-item similarity. */
export function requestPartNumbersAreSimilar(
    left: string | null | undefined,
    right: string | null | undefined
): boolean {
    const leftAbsent = isAbsentPartNumber(left);
    const rightAbsent = isAbsentPartNumber(right);
    if (leftAbsent && rightAbsent) {
        return true;
    }
    if (leftAbsent || rightAbsent) {
        return false;
    }
    return normalizeRequestIdentityValue(left) === normalizeRequestIdentityValue(right);
}

export function requestNamesAreSimilar(
    left: string | null | undefined,
    right: string | null | undefined
): boolean {
    const leftKey = normalizeRequestIdentityValue(left);
    const rightKey = normalizeRequestIdentityValue(right);
    return Boolean(leftKey) && leftKey === rightKey;
}

/**
 * Soft duplicate for new items: part numbers are similar AND names match.
 * N/A parts only collide when the item name also matches.
 */
export function isSimilarNewItemRequest(
    left: { partNumber?: string | null; itemName?: string | null },
    right: { partNumber?: string | null; itemName?: string | null }
): boolean {
    return (
        requestPartNumbersAreSimilar(left.partNumber, right.partNumber) &&
        requestNamesAreSimilar(left.itemName, right.itemName)
    );
}

export function buildSimilarNewItemWarningMessage(
    partNumber: string | null | undefined,
    itemName: string | null | undefined
): string {
    const partLabel = isAbsentPartNumber(partNumber)
        ? 'N/A'
        : (normalizePartNumber(String(partNumber ?? '')).replace(/[^A-Z0-9]/g, '') || 'N/A');
    const nameLabel = String(itemName || '').trim() || 'this item';
    return (
        `An item similar to this has already been requested ` +
        `(part number: ${partLabel}, name: ${nameLabel}). ` +
        `Are you sure you want to request it again?`
    );
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
