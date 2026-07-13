import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import {
    equipmentCodesEquivalent,
    expandEquipmentTokens,
} from './spareEquipmentDisplay';
import {
    dedupeEquipmentEntries,
    EquipmentEntry,
    formatEquipmentDisplayGroup,
    groupEquipmentEntries,
} from './spareEquipmentGrouping';
import { isConsumableStock, isFuelNacCode } from './issueValidationService';
import { stripSuffixFromNac } from '../utils/nacCodeUtils';

export type RequestEquipmentOption = {
    /** Value stored on the request (collapsed code ranges). */
    equipmentCode: string;
    /** Asset series / section name. */
    name: string;
    kind: 'series' | 'section';
    /** Search-style label, e.g. "Cobus (2112-2114)". */
    label: string;
};

const filterBySearch = (
    options: RequestEquipmentOption[],
    search?: string
): RequestEquipmentOption[] => {
    const q = String(search || '').trim().toLowerCase();
    if (!q) {
        return options;
    }
    return options.filter(
        (o) =>
            o.equipmentCode.toLowerCase().includes(q) ||
            o.name.toLowerCase().includes(q) ||
            o.label.toLowerCase().includes(q)
    );
};

const dedupeOptions = (options: RequestEquipmentOption[]): RequestEquipmentOption[] => {
    const seen = new Set<string>();
    const out: RequestEquipmentOption[] = [];
    for (const option of options) {
        const key = `${option.kind}:${option.equipmentCode}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        out.push(option);
    }
    return out;
};

const entriesToSeriesOptions = (entries: EquipmentEntry[]): RequestEquipmentOption[] => {
    const groups = groupEquipmentEntries(dedupeEquipmentEntries(entries));
    const options: RequestEquipmentOption[] = [];
    for (const group of groups) {
        const formatted = formatEquipmentDisplayGroup(group);
        if (!formatted.equipmentCode) {
            continue;
        }
        options.push({
            equipmentCode: formatted.equipmentCode,
            name: formatted.name,
            kind: 'series',
            label: formatted.label,
        });
    }
    return options;
};

const loadActiveSections = async (
    connection: PoolConnection
): Promise<RequestEquipmentOption[]> => {
    const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT code, name FROM issue_sections WHERE is_active = 1 ORDER BY name ASC`
    );
    const options: RequestEquipmentOption[] = [];
    for (const row of rows) {
        const equipmentCode = String(row.code || '').trim();
        const name = String(row.name || '').trim();
        if (!equipmentCode) {
            continue;
        }
        const label = name ? `${name} (${equipmentCode})` : equipmentCode;
        options.push({
            equipmentCode,
            name,
            kind: 'section',
            label,
        });
    }
    return options;
};

const loadAssetEntries = async (
    connection: PoolConnection,
    search?: string,
    maxRows = 2000
): Promise<EquipmentEntry[]> => {
    const normalizedSearch = String(search || '').trim();
    if (!normalizedSearch) {
        let query = `
        SELECT a.equipment_code, a.name
        FROM assets a
        WHERE a.equipment_code IS NOT NULL AND TRIM(a.equipment_code) != ''
    `;
        query += ` ORDER BY a.name ASC, a.equipment_code ASC LIMIT ${maxRows}`;
        const [rows] = await connection.query<RowDataPacket[]>(query);
        return rows
            .map((row) => ({
                code: String(row.equipment_code || '').trim(),
                name: String(row.name || '').trim() || undefined,
            }))
            .filter((row) => row.code);
    }

    const numericMatch = normalizedSearch.match(/^(\d+)/);
    if (numericMatch) {
        const numericPrefix = numericMatch[1];
        const baseRegex = `^${numericPrefix}([[:space:]]*T|$)`;
        const prefix = `${numericPrefix}%`;
        const contains = `%${normalizedSearch}%`;
        const nameLike = `%${normalizedSearch}%`;
        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT a.equipment_code, a.name
             FROM assets a
             WHERE a.equipment_code IS NOT NULL AND TRIM(a.equipment_code) != ''
               AND (
                 a.equipment_code = ?
                 OR a.equipment_code REGEXP ?
                 OR a.equipment_code LIKE ?
                 OR a.equipment_code LIKE ?
                 OR a.name LIKE ?
               )
             ORDER BY
               CASE
                 WHEN a.equipment_code = ? THEN 0
                 WHEN a.equipment_code REGEXP ? THEN 1
                 WHEN a.equipment_code LIKE ? THEN 2
                 WHEN a.equipment_code LIKE ? THEN 3
                 WHEN a.name LIKE ? THEN 4
                 ELSE 5
               END,
               LENGTH(a.equipment_code) ASC,
               a.equipment_code ASC
             LIMIT ?`,
            [
                normalizedSearch,
                baseRegex,
                prefix,
                contains,
                nameLike,
                normalizedSearch,
                baseRegex,
                prefix,
                contains,
                nameLike,
                maxRows,
            ]
        );
        return rows
            .map((row) => ({
                code: String(row.equipment_code || '').trim(),
                name: String(row.name || '').trim() || undefined,
            }))
            .filter((row) => row.code);
    }

    const like = `%${normalizedSearch}%`;
    const codePrefix = `${normalizedSearch}%`;
    const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT a.equipment_code, a.name
         FROM assets a
         WHERE a.equipment_code IS NOT NULL AND TRIM(a.equipment_code) != ''
           AND (a.equipment_code LIKE ? OR a.name LIKE ?)
         ORDER BY
           CASE
             WHEN a.equipment_code LIKE ? THEN 0
             WHEN a.name LIKE ? THEN 1
             ELSE 2
           END,
           a.equipment_code ASC
         LIMIT ?`,
        [like, like, codePrefix, like, maxRows]
    );
    return rows
        .map((row) => ({
            code: String(row.equipment_code || '').trim(),
            name: String(row.name || '').trim() || undefined,
        }))
        .filter((row) => row.code);
};

/** All registered assets for issue (consumable-style), ranked by equipment code relevance. */
export async function searchIssueEquipmentAssets(
    connection: PoolConnection,
    search?: string,
    limit = 50
): Promise<EquipmentEntry[]> {
    return loadAssetEntries(connection, search, limit);
}

const getFamilyNacCodes = async (
    connection: PoolConnection,
    nacCode: string
): Promise<string[]> => {
    const base = stripSuffixFromNac(nacCode);
    const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT DISTINCT nac_code
         FROM stock_details
         WHERE nac_code = ? OR base_nac_code = ? OR nac_code = ?`,
        [nacCode, base, base]
    );
    const codes = new Set<string>([nacCode, base]);
    for (const row of rows) {
        const code = String(row.nac_code || '').trim();
        if (code) {
            codes.add(code);
        }
    }
    return Array.from(codes);
};

const loadCompatEntries = async (
    connection: PoolConnection,
    nacCodes: string[],
    search?: string
): Promise<EquipmentEntry[]> => {
    if (!nacCodes.length) {
        return [];
    }
    const placeholders = nacCodes.map(() => '?').join(', ');
    let query = `
        SELECT DISTINCT sc.equipment_code, a.name
        FROM spare_compatibility sc
        INNER JOIN assets a
            ON a.equipment_code COLLATE utf8mb4_unicode_ci = sc.equipment_code COLLATE utf8mb4_unicode_ci
        WHERE sc.nac_code IN (${placeholders})
          AND sc.equipment_code IS NOT NULL AND TRIM(sc.equipment_code) != ''
    `;
    const params = [...nacCodes];
    const normalizedSearch = String(search || '').trim();
    if (normalizedSearch) {
        query += ` AND (sc.equipment_code LIKE ? OR a.name LIKE ?)`;
        params.push(`%${normalizedSearch}%`, `%${normalizedSearch}%`);
    }
    query += ` ORDER BY a.name ASC, sc.equipment_code ASC LIMIT 2000`;
    const [rows] = await connection.query<RowDataPacket[]>(query, params);
    return rows
        .map((row) => ({
            code: String(row.equipment_code || '').trim(),
            name: String(row.name || '').trim() || undefined,
        }))
        .filter((row) => row.code);
};

const loadFamilyApplicableEquipments = async (
    connection: PoolConnection,
    nacCodes: string[]
): Promise<string> => {
    if (!nacCodes.length) {
        return '';
    }
    const placeholders = nacCodes.map(() => '?').join(', ');
    const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT applicable_equipments FROM stock_details WHERE nac_code IN (${placeholders})`,
        nacCodes
    );
    const parts = rows
        .map((row) => String(row.applicable_equipments || '').trim())
        .filter(Boolean);
    return parts.join(',');
};

const loadFuelValidCodes = async (
    connection: PoolConnection,
    nacCode: string
): Promise<Set<string>> => {
    const fuelType = nacCode === 'GT 07986' ? 'diesel' : nacCode === 'GT 00000' ? 'petrol' : null;
    if (!fuelType) {
        return new Set();
    }
    const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT equipment_code FROM fuel_valid_equipments WHERE fuel_type = ? AND is_active = 1`,
        [fuelType]
    );
    return new Set(rows.map((row) => String(row.equipment_code || '').trim()).filter(Boolean));
};

const entryMatchesFuelList = (entry: EquipmentEntry, fuelCodes: Set<string>): boolean => {
    for (const code of fuelCodes) {
        if (equipmentCodesEquivalent(entry.code, code)) {
            return true;
        }
    }
    return false;
};

const filterEntriesByTokens = (
    entries: EquipmentEntry[],
    tokens: string[],
    compatCodes: string[]
): EquipmentEntry[] => {
    if (!tokens.length && !compatCodes.length) {
        return [];
    }
    return entries.filter((entry) => {
        for (const compat of compatCodes) {
            if (equipmentCodesEquivalent(entry.code, compat)) {
                return true;
            }
        }
        for (const token of tokens) {
            if (equipmentCodesEquivalent(entry.code, token)) {
                return true;
            }
        }
        return false;
    });
};

export async function getRequestEquipmentOptions(
    connection: PoolConnection,
    nacCode: string | null | undefined,
    search?: string,
    limit = 500
): Promise<{ options: RequestEquipmentOption[]; filteredByCompatibility: boolean }> {
    const sections = await loadActiveSections(connection);
    const allAssetEntries = await loadAssetEntries(
        connection,
        search,
        search ? 2000 : Math.max(limit, 2000)
    );
    const code = String(nacCode || '').trim();

    if (!code || code === 'N/A') {
        const series = entriesToSeriesOptions(allAssetEntries);
        return {
            options: filterBySearch(dedupeOptions([...sections, ...series]), search).slice(0, limit),
            filteredByCompatibility: false,
        };
    }

    if (isFuelNacCode(code)) {
        const fuelBase = stripSuffixFromNac(code);
        const fuelCodes = await loadFuelValidCodes(connection, fuelBase);
        const filteredEntries = allAssetEntries.filter((entry) =>
            entryMatchesFuelList(entry, fuelCodes)
        );
        const series = entriesToSeriesOptions(filteredEntries);
        return {
            options: filterBySearch(dedupeOptions([...sections, ...series]), search).slice(0, limit),
            filteredByCompatibility: true,
        };
    }

    const familyNacCodes = await getFamilyNacCodes(connection, code);
    const applicable = await loadFamilyApplicableEquipments(connection, familyNacCodes);

    if (isConsumableStock(applicable)) {
        const series = entriesToSeriesOptions(allAssetEntries);
        return {
            options: filterBySearch(dedupeOptions([...sections, ...series]), search).slice(0, limit),
            filteredByCompatibility: false,
        };
    }

    const compatEntries = await loadCompatEntries(connection, familyNacCodes, search);

    const placeholders = familyNacCodes.map(() => '?').join(', ');
    const [compatRows] = familyNacCodes.length
        ? await connection.query<RowDataPacket[]>(
            `SELECT DISTINCT equipment_code FROM spare_compatibility WHERE nac_code IN (${placeholders})`,
            familyNacCodes
        )
        : [[] as RowDataPacket[]];
    const compatCodes = compatRows
        .map((row) => String(row.equipment_code || '').trim())
        .filter(Boolean);

    const applicableTokens = expandEquipmentTokens(applicable)
        .map((token) => String(token).trim())
        .filter(Boolean);

    const tokenMatchedEntries = filterEntriesByTokens(allAssetEntries, applicableTokens, compatCodes);
    const mergedEntries = dedupeEquipmentEntries([...compatEntries, ...tokenMatchedEntries]);
    const series = entriesToSeriesOptions(mergedEntries);

    return {
        options: filterBySearch(dedupeOptions([...sections, ...series]), search).slice(0, limit),
        filteredByCompatibility: true,
    };
}

/**
 * Validate an existing-item request against the same option source shown by the
 * request equipment selector. This prevents the UI and submit validation from
 * disagreeing about family compatibility, grouped ranges, or section codes.
 */
export async function validateExistingRequestEquipmentSelection(
    connection: PoolConnection,
    nacCode: string,
    equipmentNumber: string
): Promise<{ valid: boolean; message?: string }> {
    const selectedTokens = expandEquipmentTokens(equipmentNumber);
    if (!selectedTokens.length) {
        return { valid: false, message: 'Equipment number is required' };
    }

    const { options } = await getRequestEquipmentOptions(
        connection,
        nacCode,
        undefined,
        10000
    );
    const allowedTokens = options.flatMap((option) =>
        expandEquipmentTokens(option.equipmentCode)
    );

    for (const selected of selectedTokens) {
        const allowed = allowedTokens.some((candidate) =>
            equipmentCodesEquivalent(selected, candidate)
        );
        if (!allowed) {
            return {
                valid: false,
                message: `Equipment "${selected}" is not applicable to item ${nacCode}`,
            };
        }
    }

    return { valid: true };
}
