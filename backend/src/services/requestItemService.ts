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
    currentBalance: number | string;
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

export function getRequestPartNumberValidationError(
    partNumber: string | null | undefined,
    opts: { allowEmpty?: boolean } = {}
): string | null {
    const normalized = normalizeRequestPartNumber(partNumber);
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
): { type: 'partNumber' | 'itemName' | 'none'; key: string } {
    const normalizedPartNumber = normalizeRequestIdentityValue(partNumber);
    if (normalizedPartNumber) {
        return { type: 'partNumber', key: normalizedPartNumber };
    }

    const normalizedItemName = normalizeRequestIdentityValue(itemName);
    if (normalizedItemName) {
        return { type: 'itemName', key: normalizedItemName };
    }

    return { type: 'none', key: '' };
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
        const normalizedPartNumber = normalizeRequestPartNumber(item.partNumber);
        const itemName = String(item.itemName || '').trim();
        const identity = buildNewRequestIdentity(normalizedPartNumber, itemName);
        if (identity.type === 'none') {
            throw new Error('New item requests require a part number or item name');
        }

        return {
            nacCode: 'N/A',
            partNumber: normalizedPartNumber || 'N/A',
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
        currentBalance: balances?.virtualBalance ?? 'N/A',
    };
}
