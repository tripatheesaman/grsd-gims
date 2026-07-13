import { PoolConnection } from 'mysql2/promise';
import {
    getVariantBalances,
    resolveRequestVariantTarget,
} from './inventoryVariantService';
import { getNacCodeValidationError } from '../utils/nacCodeUtils';

export const REQUEST_STOCK_JOIN = `
    LEFT JOIN stock_details sd
        ON sd.nac_code COLLATE utf8mb4_unicode_ci = rd.nac_code COLLATE utf8mb4_unicode_ci
`;

export const REQUEST_ITEM_NAME_SQL = `
    COALESCE(NULLIF(TRIM(SUBSTRING_INDEX(sd.item_name, ',', 1)), ''), rd.item_name) COLLATE utf8mb4_unicode_ci
`;

export type RequestItemInput = {
    nacCode: string;
    partNumber: string;
    itemName?: string;
    unit?: string;
};

export type PreparedRequestItem = {
    nacCode: string;
    partNumber: string;
    itemName: string;
    unit: string;
    currentBalance: number;
};

export const REQUEST_PART_NUMBER_REGEX = /^[A-Z0-9]+$/;

export function normalizeRequestPartNumber(partNumber: string | null | undefined): string {
    return String(partNumber || '').trim().toUpperCase();
}

export function normalizeRequestIdentityValue(value: string | null | undefined): string {
    return String(value || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
}

/** N/A, NA, empty, or punctuation-only — item has no real part number. */
export function isAbsentRequestPartNumber(partNumber: string | null | undefined): boolean {
    const identity = normalizeRequestIdentityValue(partNumber);
    return !identity || identity === 'NA';
}

export function getRequestPartNumberValidationError(
    partNumber: string | null | undefined,
    opts: { allowEmpty?: boolean } = {}
): string | null {
    if (isAbsentRequestPartNumber(partNumber)) {
        return opts.allowEmpty === false ? 'Part number is required' : null;
    }
    const normalized = normalizeRequestPartNumber(partNumber).replace(/[^A-Z0-9]/g, '');
    if (!normalized) {
        return opts.allowEmpty === false ? 'Part number is required' : null;
    }
    if (!REQUEST_PART_NUMBER_REGEX.test(normalized)) {
        return 'Part number can only contain letters and numbers';
    }
    return null;
}

export function buildNewRequestIdentity(
    partNumber: string | null | undefined,
    itemName: string | null | undefined
): { type: 'partNumber' | 'itemName' | 'none'; key: string; partKey: string; nameKey: string } {
    const partKey = isAbsentRequestPartNumber(partNumber)
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
    const leftAbsent = isAbsentRequestPartNumber(left);
    const rightAbsent = isAbsentRequestPartNumber(right);
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
    const partLabel = isAbsentRequestPartNumber(partNumber)
        ? 'N/A'
        : (normalizeRequestPartNumber(partNumber).replace(/[^A-Z0-9]/g, '') || 'N/A');
    const nameLabel = String(itemName || '').trim() || 'this item';
    return (
        `An item similar to this has already been requested ` +
        `(part number: ${partLabel}, name: ${nameLabel}). ` +
        `Are you sure you want to request it again?`
    );
}

export async function prepareRequestItemForSave(
    connection: PoolConnection,
    item: RequestItemInput
): Promise<PreparedRequestItem> {
    const nacCode = String(item.nacCode || '').trim();

    if (!nacCode || nacCode === 'N/A') {
        const partNumberError = getRequestPartNumberValidationError(item.partNumber);
        if (partNumberError) {
            throw new Error(partNumberError);
        }
        const itemName = String(item.itemName || '').trim();
        if (!itemName) {
            throw new Error('New item requests require an item name');
        }
        const storedPart = isAbsentRequestPartNumber(item.partNumber)
            ? 'N/A'
            : normalizeRequestPartNumber(item.partNumber).replace(/[^A-Z0-9]/g, '');
        if (!storedPart) {
            throw new Error('New item requests require a part number or N/A');
        }

        return {
            nacCode: 'N/A',
            partNumber: storedPart,
            itemName,
            unit: String(item.unit || '').trim() || 'N/A',
            currentBalance: 0,
        };
    }

    const nacFormatError = getNacCodeValidationError(nacCode, { allowSuffix: true });
    if (nacFormatError) {
        throw new Error(nacFormatError);
    }

    const resolved = await resolveRequestVariantTarget(connection, nacCode, item.partNumber);
    const balances = await getVariantBalances(connection, resolved.nacCode);
    const unit = String(item.unit || '').trim() || resolved.defaultUnit || 'N/A';

    return {
        nacCode: resolved.nacCode,
        partNumber: resolved.partNumber || item.partNumber,
        itemName: resolved.itemName,
        unit,
        // Decimal column — never write 'N/A'; missing stock → 0
        currentBalance: Number(balances?.virtualBalance ?? 0) || 0,
    };
}
