import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { expandEquipmentTokens } from './spareEquipmentDisplay';

export const FUEL_NAC_CODES = new Set(['GT 07986', 'GT 00000']);

const INTERNAL_ISSUED_FOR_PREFIXES = ['code_transfer_to_'];

export interface IssueValidationCaches {
    sectionCodes?: Set<string>;
    fuelEquipmentByNac?: Map<string, Set<string>>;
    assetEquipmentCodes?: Set<string>;
}

const normalizeCode = (value: string): string => String(value || '').trim();

/** Consumables are identified by "consumable" in applicable_equipments. */
export const isConsumableStock = (applicableEquipments: string): boolean =>
    String(applicableEquipments || '').toLowerCase().includes('consumable');

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

const loadAssetEquipmentCodes = async (
    connection: PoolConnection,
    tokens: string[],
    caches?: IssueValidationCaches
): Promise<Set<string>> => {
    const normalizedTokens = tokens.map((t) => normalizeCode(t)).filter(Boolean);
    if (normalizedTokens.length === 0) {
        return caches?.assetEquipmentCodes ?? new Set();
    }

    if (!caches) {
        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT equipment_code FROM assets WHERE equipment_code IN (?)`,
            [normalizedTokens]
        );
        return new Set(rows.map((row) => normalizeCode(String(row.equipment_code))).filter(Boolean));
    }

    if (!caches.assetEquipmentCodes) {
        caches.assetEquipmentCodes = new Set();
    }
    const cached = caches.assetEquipmentCodes;
    const missing = normalizedTokens.filter((token) => !cached.has(token));
    if (missing.length === 0) {
        return cached;
    }

    const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT equipment_code FROM assets WHERE equipment_code IN (?)`,
        [missing]
    );
    for (const row of rows) {
        const code = normalizeCode(String(row.equipment_code));
        if (code) {
            cached.add(code);
        }
    }
    return cached;
};

const tokenMatchesFuelList = (token: string, fuelSet: Set<string>): boolean => {
    const normalized = normalizeCode(token).toLowerCase();
    for (const code of fuelSet) {
        if (normalizeCode(code).toLowerCase() === normalized) {
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
    if (assetCodes.has(normalizeCode(token))) {
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
        if (sectionCodes.has(token.toUpperCase())) {
            continue;
        }
        if (assetCodes.has(normalizeCode(token))) {
            continue;
        }
        return { valid: false, message: invalidMessage.replace('{token}', token) };
    }
    return { valid: true };
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
    return validateIssuedFor(connection, code, equipmentNumber, caches);
};

export const validateIssuedFor = async (
    connection: PoolConnection,
    nacCode: string,
    equipmentNumber: string,
    caches: IssueValidationCaches = {}
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

    const applicableSet = new Set(
        expandEquipmentTokens(applicableEquipments).map((t) => normalizeCode(t))
    );
    const [compatRows] = await connection.query<RowDataPacket[]>(
        `SELECT equipment_code FROM spare_compatibility WHERE nac_code = ? AND equipment_code IN (?)`,
        [nacCode, tokens]
    );
    const compatSet = new Set(compatRows.map((row) => normalizeCode(String(row.equipment_code))));

    for (const token of tokens) {
        const normalizedToken = normalizeCode(token);
        if (compatSet.has(normalizedToken)) {
            continue;
        }
        if (applicableSet.has(normalizedToken)) {
            continue;
        }
        if (sectionCodes.has(token.toUpperCase())) {
            continue;
        }
        return {
            valid: false,
            message: `Equipment "${token}" is not compatible with this item and is not a defined section`,
        };
    }

    return { valid: true };
};
