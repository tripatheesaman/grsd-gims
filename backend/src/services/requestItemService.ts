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

export async function prepareRequestItemForSave(
    connection: PoolConnection,
    item: RequestItemInput
): Promise<PreparedRequestItem> {
    const nacCode = String(item.nacCode || '').trim();

    if (!nacCode || nacCode === 'N/A') {
        return {
            nacCode: 'N/A',
            partNumber: item.partNumber,
            itemName: String(item.itemName || '').trim(),
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
