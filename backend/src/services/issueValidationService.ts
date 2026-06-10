import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import {
    equipmentCodesEquivalent,
    expandEquipmentTokens,
    getEquipmentNumericBase,
} from './spareEquipmentDisplay';

export const FUEL_NAC_CODES = new Set(['GT 07986', 'GT 00000']);

const INTERNAL_ISSUED_FOR_PREFIXES = ['code_transfer_to_'];

export interface IssueValidationCaches {
    sectionCodes?: Set<string>;
    fuelEquipmentByNac?: Map<string, Set<string>>;
    assetEquipmentCodes?: Set<string>;
}

export interface ValidateIssuedForOptions {
    /** When true, also accept registered assets (e.g. 345 matches asset 345T14). Used for request/receive. */
    allowRegisteredAssets?: boolean;
}

const normalizeCode = (value: string): string => String(value || '').trim();

/** Consumables are identified by "consumable" in applicable_equipments. */
export const isConsumableStock = (applicableEquipments: string): boolean =>
    String(applicableEquipments || '').toLowerCase().includes('consumable');

/** Request/receive rows may carry a consumable category label instead of an asset or section code. */
export const isConsumableEquipmentMarker = (equipmentNumber: string): boolean =>
    isConsumableStock(equipmentNumber);

const isInternalIssuedFor = (equipmentNumber: string): boolean =>
    INTERNAL_ISSUED_FOR_PREFIXES.some((prefix) => equipmentNumber.startsWith(prefix));

const loadActiveSectionCodes = async (connection: PoolConnection): Promise<Set<string>> => {
    const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT code FROM issue_sections WHERE is_active = 1`
    );
    return new Set(rows.map((row) => String(row.code).toUpperCase()));
};

const loadFuelValidEquipment = async (
    connection: PoolConnection,
    nacCode: string
): Promise<Set<string>> => {
    const fuelType = nacCode === 'GT 07986' ? 'diesel' : nacCode === 'GT 00000' ? 'petrol' : null;
    if (!fuelType) {
        return new Set();
    }

    const [equipmentRows] = await connection.query<RowDataPacket[]>(
        `SELECT equipment_code FROM fuel_valid_equipments WHERE fuel_type = ? AND is_active = 1`,
        [fuelType]
    );
    let codes = equipmentRows
        .map((row) => normalizeCode(String(row.equipment_code)))
        .filter(Boolean);

    if (codes.length === 0) {
        const [configResult] = await connection.query<RowDataPacket[]>(
            `SELECT config_value FROM app_config WHERE config_name = ? AND config_type = 'fuel'`,
            [`valid_equipment_list_${fuelType}`]
        );
        if (configResult.length > 0) {
            codes = String(configResult[0].config_value || '')
                .replace(/\r\n/g, '')
                .split(',')
                .map((item) => normalizeCode(item))
                .filter(Boolean);
        }
    }

    return new Set(codes);
};

const registerAssetEquipmentCode = (cached: Set<string>, code: string): void => {
    const normalized = normalizeCode(code);
    if (!normalized) {
        return;
    }
    cached.add(normalized);
    const base = getEquipmentNumericBase(normalized);
    if (base) {
        cached.add(base);
    }
};

const isResolvedAssetToken = (token: string, cached: Set<string>): boolean => {
    const normalized = normalizeCode(token);
    if (!normalized || cached.size === 0) {
        return false;
    }
    if (cached.has(normalized)) {
        return true;
    }
    const base = getEquipmentNumericBase(normalized);
    if (base && cached.has(base)) {
        return true;
    }
    for (const code of cached) {
        if (equipmentCodesEquivalent(normalized, code)) {
            return true;
        }
    }
    return false;
};

const loadAssetEquipmentCodes = async (
    connection: PoolConnection,
    tokens: string[],
    caches?: IssueValidationCaches
): Promise<Set<string>> => {
    const normalizedTokens = tokens.map((t) => normalizeCode(t)).filter(Boolean);
    if (normalizedTokens.length === 0) {
        return caches?.assetEquipmentCodes ?? new Set();
    }

    const cached = caches?.assetEquipmentCodes ?? new Set<string>();
    const missing = normalizedTokens.filter((token) => !isResolvedAssetToken(token, cached));
    if (missing.length === 0) {
        if (caches) {
            caches.assetEquipmentCodes = cached;
        }
        return cached;
    }

    const exactTokens = [...new Set(missing)];
    const numericBases = [
        ...new Set(
            exactTokens
                .map((token) => getEquipmentNumericBase(token))
                .filter((base): base is string => Boolean(base))
        ),
    ];

    const whereParts: string[] = [];
    const params: Array<string | string[]> = [];
    if (exactTokens.length > 0) {
        whereParts.push('equipment_code IN (?)');
        params.push(exactTokens);
    }
    for (const base of numericBases) {
        whereParts.push(`(
            equipment_code = ?
            OR equipment_code LIKE ?
            OR equipment_code LIKE ?
            OR equipment_code REGEXP ?
        )`);
        params.push(base, `${base}T%`, `${base} T%`, `^${base}[[:space:]]*T`);
    }

    if (whereParts.length > 0) {
        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT equipment_code FROM assets WHERE ${whereParts.join(' OR ')}`,
            params
        );
        for (const row of rows) {
            registerAssetEquipmentCode(cached, String(row.equipment_code));
        }
    }

    const stillMissing = normalizedTokens.filter((token) => !isResolvedAssetToken(token, cached));
    if (stillMissing.length > 0) {
        const [numericAssets] = await connection.query<RowDataPacket[]>(
            `SELECT equipment_code FROM assets WHERE equipment_code REGEXP '^[0-9]'`
        );
        for (const row of numericAssets) {
            const code = normalizeCode(String(row.equipment_code));
            if (!code) {
                continue;
            }
            if (stillMissing.some((token) => equipmentCodesEquivalent(token, code))) {
                registerAssetEquipmentCode(cached, code);
            }
        }
    }

    if (caches) {
        caches.assetEquipmentCodes = cached;
    }
    return cached;
};

const tokenMatchesFuelList = (token: string, fuelSet: Set<string>): boolean => {
    for (const code of fuelSet) {
        if (equipmentCodesEquivalent(token, code)) {
            return true;
        }
    }
    return false;
};

const isAllowedFuelToken = (
    token: string,
    fuelSet: Set<string>,
    sectionCodes: Set<string>,
    assetCodes: Set<string>
): boolean => {
    if (sectionCodes.has(token.toUpperCase())) {
        return true;
    }
    if (token.toLowerCase() === 'cleaning') {
        return true;
    }
    if (tokenMatchesFuelList(token, fuelSet)) {
        return true;
    }
    if (isResolvedAssetToken(token, assetCodes)) {
        return true;
    }
    return false;
};

const validateAssetOrSectionTarget = async (
    connection: PoolConnection,
    equipmentNumber: string,
    caches: IssueValidationCaches,
    invalidMessage: string
): Promise<{ valid: boolean; message?: string }> => {
    const term = normalizeCode(equipmentNumber);
    if (!term) {
        return { valid: false, message: 'Equipment number is required' };
    }
    if (isInternalIssuedFor(term)) {
        return { valid: true };
    }
    if (isConsumableEquipmentMarker(term)) {
        return { valid: true };
    }

    const tokens = expandEquipmentTokens(term);
    if (tokens.length === 0) {
        return { valid: false, message: 'Invalid equipment number' };
    }

    if (!caches.sectionCodes) {
        caches.sectionCodes = await loadActiveSectionCodes(connection);
    }
    const sectionCodes = caches.sectionCodes;
    const assetCodes = await loadAssetEquipmentCodes(connection, tokens, caches);

    for (const token of tokens) {
        if (isConsumableEquipmentMarker(token)) {
            continue;
        }
        if (sectionCodes.has(token.toUpperCase())) {
            continue;
        }
        if (isResolvedAssetToken(token, assetCodes)) {
            continue;
        }
        return { valid: false, message: invalidMessage.replace('{token}', token) };
    }
    return { valid: true };
};

const NAC_CODE_PATTERN = /^(GT|TW|GS) \d{5}$/;

/**
 * Validates receive equipment: must be a registered asset (345 = 345T15) or issue section.
 * Spare applicable-equipment lists are not enforced on receive — the request already names the target unit.
 */
export const validateReceiveTarget = async (
    connection: PoolConnection,
    nacCode: string | null | undefined,
    equipmentNumber: string,
    caches: IssueValidationCaches = {}
): Promise<{ valid: boolean; message?: string }> => {
    const code = normalizeCode(String(nacCode || ''));
    if (!code || code === 'N/A') {
        return { valid: false, message: 'NAC code is required. Enter a new code for new items.' };
    }
    if (!NAC_CODE_PATTERN.test(code)) {
        return { valid: false, message: 'NAC code must be GT/TW/GS followed by 5 digits (e.g., GT 12345)' };
    }

    return validateAssetOrSectionTarget(
        connection,
        equipmentNumber,
        caches,
        'Equipment "{token}" is not a registered asset and is not a defined section'
    );
};

/** Validates equipment/section for request items (including new items with nacCode N/A). */
export const validateRequestTarget = async (
    connection: PoolConnection,
    nacCode: string | null | undefined,
    equipmentNumber: string,
    caches: IssueValidationCaches = {}
): Promise<{ valid: boolean; message?: string }> => {
    const code = normalizeCode(String(nacCode || ''));
    if (!code || code === 'N/A') {
        return validateAssetOrSectionTarget(
            connection,
            equipmentNumber,
            caches,
            'Equipment "{token}" is not a registered asset and is not a defined section'
        );
    }
    return validateIssuedFor(connection, code, equipmentNumber, caches, { allowRegisteredAssets: true });
};

export const validateIssuedFor = async (
    connection: PoolConnection,
    nacCode: string,
    equipmentNumber: string,
    caches: IssueValidationCaches = {},
    options: ValidateIssuedForOptions = {}
): Promise<{ valid: boolean; message?: string }> => {
    const term = normalizeCode(equipmentNumber);
    if (!term) {
        return { valid: false, message: 'Equipment number is required' };
    }
    if (isInternalIssuedFor(term)) {
        return { valid: true };
    }

    const tokens = expandEquipmentTokens(term);
    if (tokens.length === 0) {
        return { valid: false, message: 'Invalid equipment number' };
    }

    if (!caches.sectionCodes) {
        caches.sectionCodes = await loadActiveSectionCodes(connection);
    }
    const sectionCodes = caches.sectionCodes;

    if (FUEL_NAC_CODES.has(nacCode)) {
        if (!caches.fuelEquipmentByNac) {
            caches.fuelEquipmentByNac = new Map();
        }
        let fuelSet = caches.fuelEquipmentByNac.get(nacCode);
        if (!fuelSet) {
            fuelSet = await loadFuelValidEquipment(connection, nacCode);
            caches.fuelEquipmentByNac.set(nacCode, fuelSet);
        }

        const assetCodes = await loadAssetEquipmentCodes(connection, tokens, caches);
        for (const token of tokens) {
            if (!isAllowedFuelToken(token, fuelSet, sectionCodes, assetCodes)) {
                return {
                    valid: false,
                    message: `Equipment "${token}" is not in the valid fuel equipment list`,
                };
            }
        }
        return { valid: true };
    }

    const [stockResults] = await connection.query<RowDataPacket[]>(
        `SELECT applicable_equipments FROM stock_details WHERE nac_code = ?`,
        [nacCode]
    );
    if (stockResults.length === 0) {
        return { valid: false, message: `Item with NAC code ${nacCode} not found` };
    }

    const applicableEquipments = String(stockResults[0].applicable_equipments || '');

    if (isConsumableStock(applicableEquipments)) {
        return validateAssetOrSectionTarget(
            connection,
            equipmentNumber,
            caches,
            'Equipment "{token}" is not a registered asset and is not a defined section'
        );
    }

    const applicableTokens = expandEquipmentTokens(applicableEquipments).map((t) => normalizeCode(t));
    const [compatRows] = await connection.query<RowDataPacket[]>(
        `SELECT equipment_code FROM spare_compatibility WHERE nac_code = ?`,
        [nacCode]
    );
    const compatCodes = compatRows
        .map((row) => normalizeCode(String(row.equipment_code)))
        .filter(Boolean);

    const matchesStockEquipment = (token: string): boolean =>
        applicableTokens.some((applicable) => equipmentCodesEquivalent(token, applicable));

    const matchesCompatibility = (token: string): boolean =>
        compatCodes.some((compat) => equipmentCodesEquivalent(token, compat));

    const assetCodes = options.allowRegisteredAssets
        ? await loadAssetEquipmentCodes(connection, tokens, caches)
        : null;

    for (const token of tokens) {
        if (matchesCompatibility(token)) {
            continue;
        }
        if (matchesStockEquipment(token)) {
            continue;
        }
        if (sectionCodes.has(token.toUpperCase())) {
            continue;
        }
        if (assetCodes && isResolvedAssetToken(token, assetCodes)) {
            continue;
        }
        return {
            valid: false,
            message: `Equipment "${token}" is not compatible with this item and is not a defined section`,
        };
    }

    return { valid: true };
};
