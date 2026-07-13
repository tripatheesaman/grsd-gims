import { RowDataPacket, PoolConnection } from 'mysql2/promise';
import {
    buildSubNacCode,
    isAbsentPartNumber,
    letterForIndex,
    normalizePartNumber,
    parseNacCode,
    stripSuffixFromNac,
    type ParsedNacCode,
} from '../utils/nacCodeUtils';
import { processItemName } from '../utils/utils';
import { VARIANT_TRUE_BALANCE_SQL, VARIANT_VIRTUAL_BALANCE_SQL, expandEquipmentTokens } from './spareEquipmentDisplay';

export type StockVariantRow = RowDataPacket & {
    id: number;
    nac_code: string;
    base_nac_code: string | null;
    item_name: string;
    part_numbers: string;
    applicable_equipments: string;
    current_balance: number | string;
    open_quantity: number | string | null;
    open_amount: number | string | null;
    open_remaining_quantity: number | string | null;
    location: string | null;
    unit: string | null;
    image_url: string | null;
    oil_code: string | null;
};

export type ResolveReceiveTargetResult = {
    nacCode: string;
    baseNacCode: string;
    isNewVariant: boolean;
    requiresNewPhoto: boolean;
    promoted: boolean;
};

const TABLES_WITH_NAC_CODE = [
    'receive_details',
    'issue_details',
    'request_details',
    'nac_units',
    'unit_conversions',
    'spare_compatibility',
] as const;

export async function getFamilyVariants(
    connection: PoolConnection,
    baseNacCode: string
): Promise<StockVariantRow[]> {
    const base = stripSuffixFromNac(baseNacCode);
    const [rows] = await connection.execute<StockVariantRow[]>(
        `SELECT * FROM stock_details
         WHERE base_nac_code = ? OR nac_code = ?
         ORDER BY nac_code ASC`,
        [base, base]
    );
    return rows;
}

export async function findVariantByPartNumber(
    connection: PoolConnection,
    baseNacCode: string,
    partNumber: string
): Promise<StockVariantRow | null> {
    const normalized = normalizePartNumber(partNumber);
    if (!normalized || normalized === 'NA' || normalized === 'N/A') {
        return null;
    }
    const variants = await getFamilyVariants(connection, baseNacCode);
    return variants.find(v => normalizePartNumber(v.part_numbers) === normalized) ?? null;
}

export type LatestReceivedPartTarget = {
    partNumber: string;
    nacCode: string;
};

/** Historical tx used the part number from the most recent approved receive. */
export async function resolveLatestReceivedPartTarget(
    connection: PoolConnection,
    baseNacCode: string,
    options?: {
        legacyNacCode?: string;
        fallbackPartNumbers?: string[];
        variants?: StockVariantRow[];
    }
): Promise<LatestReceivedPartTarget | null> {
    const base = stripSuffixFromNac(baseNacCode);
    const variants = options?.variants ?? await getFamilyVariants(connection, base);
    const variantByPart = new Map<string, string>();
    for (const v of variants) {
        variantByPart.set(normalizePartNumber(v.part_numbers), v.nac_code);
    }

    const nacCodes = new Set<string>([base, ...variants.map(v => v.nac_code)]);
    if (options?.legacyNacCode) {
        nacCodes.add(stripSuffixFromNac(options.legacyNacCode));
        nacCodes.add(options.legacyNacCode);
    }
    const nacList = Array.from(nacCodes).filter(Boolean);
    if (!nacList.length) {
        return null;
    }

    const placeholders = nacList.map(() => '?').join(', ');
    const [latestRows] = await connection.execute<RowDataPacket[]>(
        `SELECT part_number
         FROM receive_details
         WHERE nac_code IN (${placeholders})
           AND approval_status = 'APPROVED'
           AND part_number IS NOT NULL AND TRIM(part_number) != ''
           AND UPPER(TRIM(part_number)) NOT IN ('NA', 'N/A')
         ORDER BY receive_date DESC, id DESC
         LIMIT 1`,
        nacList
    );

    let partNumber = '';
    if (latestRows.length) {
        partNumber = normalizePartNumber(String(latestRows[0].part_number));
    }

    if (!partNumber && options?.fallbackPartNumbers?.length) {
        partNumber = normalizePartNumber(
            options.fallbackPartNumbers[options.fallbackPartNumbers.length - 1]
        );
    }

    if (!partNumber) {
        return null;
    }

    let nacCode = variantByPart.get(partNumber);
    if (!nacCode && variants.length) {
        const idx = options?.fallbackPartNumbers?.findIndex(
            p => normalizePartNumber(p) === partNumber
        );
        if (idx != null && idx >= 0) {
            nacCode = buildSubNacCode(base, letterForIndex(idx));
        }
    }
    if (!nacCode) {
        nacCode = variants[0]?.nac_code ?? base;
    }

    return { partNumber, nacCode };
}

export type ResolvedTransactionVariant = {
    nacCode: string;
    partNumber: string;
    changed: boolean;
};

/**
 * Map a transaction's nac/part to an existing stock variant row.
 * Handles historical rows still on base family codes after variant split.
 */
export async function resolveTransactionVariantTarget(
    connection: PoolConnection,
    opts: {
        nacCode: string;
        partNumber?: string | null;
        preferLatestReceived?: boolean;
    }
): Promise<ResolvedTransactionVariant> {
    const rawNac = String(opts.nacCode || '').trim();
    let rawPart = normalizePartNumber(String(opts.partNumber || ''));
    if (rawPart === 'NA' || rawPart === 'N/A') {
        rawPart = '';
    }

    if (!rawNac) {
        return { nacCode: rawNac, partNumber: rawPart, changed: false };
    }

    const [direct] = await connection.execute<StockVariantRow[]>(
        `SELECT nac_code, part_numbers FROM stock_details WHERE nac_code = ? LIMIT 1`,
        [rawNac]
    );
    if (direct.length) {
        const pn = rawPart || normalizePartNumber(direct[0].part_numbers);
        return { nacCode: rawNac, partNumber: pn, changed: false };
    }

    const base = stripSuffixFromNac(rawNac);
    const variants = await getFamilyVariants(connection, base);

    if (rawPart) {
        const byPart = await findVariantByPartNumber(connection, base, rawPart);
        if (byPart) {
            return {
                nacCode: byPart.nac_code,
                partNumber: rawPart,
                changed: byPart.nac_code !== rawNac,
            };
        }
    }

    if (opts.preferLatestReceived !== false) {
        const latest = await resolveLatestReceivedPartTarget(connection, base, {
            legacyNacCode: rawNac,
            fallbackPartNumbers: variants.map(v => v.part_numbers),
            variants,
        });
        if (latest) {
            return {
                nacCode: latest.nacCode,
                partNumber: latest.partNumber,
                changed: latest.nacCode !== rawNac || latest.partNumber !== rawPart,
            };
        }
    }

    if (variants.length === 1) {
        const pn = rawPart || normalizePartNumber(variants[0].part_numbers);
        return {
            nacCode: variants[0].nac_code,
            partNumber: pn,
            changed: variants[0].nac_code !== rawNac,
        };
    }

    const baseRow = variants.find(v => v.nac_code === base);
    if (baseRow) {
        const pn = rawPart || normalizePartNumber(baseRow.part_numbers);
        return {
            nacCode: baseRow.nac_code,
            partNumber: pn,
            changed: baseRow.nac_code !== rawNac,
        };
    }

    return { nacCode: rawNac, partNumber: rawPart, changed: false };
}

export async function persistTransactionVariantResolution(
    connection: PoolConnection,
    table: 'receive_details' | 'issue_details' | 'request_details',
    rowId: number,
    resolved: ResolvedTransactionVariant
): Promise<void> {
    if (!rowId || !resolved.nacCode) {
        return;
    }
    await connection.execute(
        `UPDATE ${table} SET nac_code = ?, part_number = COALESCE(NULLIF(?, ''), part_number) WHERE id = ?`,
        [resolved.nacCode, resolved.partNumber, rowId]
    );
}

export async function resolveAndPersistTransactionVariant(
    connection: PoolConnection,
    table: 'receive_details' | 'issue_details' | 'request_details',
    rowId: number,
    nacCode: string,
    partNumber?: string | null,
    opts?: { preferLatestReceived?: boolean }
): Promise<ResolvedTransactionVariant> {
    const resolved = await resolveTransactionVariantTarget(connection, {
        nacCode,
        partNumber,
        preferLatestReceived: opts?.preferLatestReceived,
    });
    const partChanged = Boolean(
        partNumber &&
        resolved.partNumber &&
        normalizePartNumber(partNumber) !== resolved.partNumber
    );
    if (resolved.changed || partChanged) {
        await persistTransactionVariantResolution(connection, table, rowId, resolved);
    }
    return resolved;
}

export async function resolveReceiveApprovalTarget(
    connection: PoolConnection,
    nacCode: string,
    partNumber?: string | null
): Promise<ResolvedTransactionVariant> {
    const rawNac = String(nacCode || '').trim();
    let rawPart = normalizePartNumber(String(partNumber || ''));
    if (rawPart === 'NA' || rawPart === 'N/A') {
        rawPart = '';
    }

    if (!rawNac) {
        return { nacCode: rawNac, partNumber: rawPart, changed: false };
    }

    const [direct] = await connection.execute<StockVariantRow[]>(
        `SELECT nac_code, part_numbers FROM stock_details WHERE nac_code = ? LIMIT 1`,
        [rawNac]
    );
    if (direct.length) {
        const pn = rawPart || normalizePartNumber(direct[0].part_numbers);
        return { nacCode: rawNac, partNumber: pn, changed: false };
    }

    const base = stripSuffixFromNac(rawNac);
    if (rawPart) {
        const byPart = await findVariantByPartNumber(connection, base, rawPart);
        if (byPart) {
            return {
                nacCode: byPart.nac_code,
                partNumber: rawPart,
                changed: byPart.nac_code !== rawNac,
            };
        }

        const preview = await previewReceiveTarget(connection, {
            baseNacCode: base,
            partNumber: rawPart,
        });
        return {
            nacCode: preview.nacCode,
            partNumber: rawPart,
            changed: preview.nacCode !== rawNac,
        };
    }

    return resolveTransactionVariantTarget(connection, {
        nacCode: rawNac,
        partNumber: rawPart,
        preferLatestReceived: false,
    });
}

export async function resolveAndPersistReceiveApproval(
    connection: PoolConnection,
    receiveId: number,
    nacCode: string,
    partNumber?: string | null
): Promise<ResolvedTransactionVariant> {
    const resolved = await resolveReceiveApprovalTarget(connection, nacCode, partNumber);
    const partChanged = Boolean(
        partNumber &&
        resolved.partNumber &&
        normalizePartNumber(partNumber) !== resolved.partNumber
    );
    if (resolved.changed || partChanged) {
        await persistTransactionVariantResolution(connection, 'receive_details', receiveId, resolved);
    }
    return resolved;
}

export type ResolvedRequestTarget = {
    nacCode: string;
    partNumber: string;
    itemName: string;
    defaultUnit: string | null;
};

export async function getFamilyDisplayName(
    connection: PoolConnection,
    nacCode: string
): Promise<string> {
    const base = stripSuffixFromNac(nacCode);
    const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT SUBSTRING_INDEX(MIN(item_name), ',', 1) AS item_name
         FROM stock_details
         WHERE base_nac_code = ? OR nac_code = ?`,
        [base, base]
    );
    return processItemName(String(rows[0]?.item_name || ''));
}

export async function getDefaultUnitForNac(
    connection: PoolConnection,
    nacCode: string
): Promise<string | null> {
    const codesToTry = new Set<string>([nacCode]);
    const base = stripSuffixFromNac(nacCode);
    if (base) {
        codesToTry.add(base);
    }
    const variants = await getFamilyVariants(connection, base);
    for (const variant of variants) {
        codesToTry.add(variant.nac_code);
    }

    for (const code of codesToTry) {
        const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT unit FROM nac_units WHERE nac_code = ? ORDER BY is_default DESC, unit ASC LIMIT 1`,
            [code]
        );
        if (rows.length) {
            return String(rows[0].unit);
        }
    }
    return null;
}

/** Resolve variant NAC for a request line from family code + part number. */
export async function resolveRequestVariantTarget(
    connection: PoolConnection,
    nacCode: string,
    partNumber?: string | null
): Promise<ResolvedRequestTarget> {
    const rawNac = String(nacCode || '').trim();
    let rawPart = normalizePartNumber(String(partNumber || ''));
    if (rawPart === 'NA' || rawPart === 'N/A') {
        rawPart = '';
    }

    if (!rawNac || rawNac === 'N/A') {
        return { nacCode: rawNac, partNumber: rawPart, itemName: '', defaultUnit: null };
    }

    const base = stripSuffixFromNac(rawNac);
    let resolvedNac = rawNac;

    if (rawPart) {
        const byPart = await findVariantByPartNumber(connection, base, rawPart);
        if (byPart) {
            resolvedNac = byPart.nac_code;
        } else {
            const preview = await previewReceiveTarget(connection, {
                baseNacCode: base,
                partNumber: rawPart,
            });
            resolvedNac = preview.nacCode;
        }
    } else {
        const resolved = await resolveTransactionVariantTarget(connection, {
            nacCode: rawNac,
            partNumber: rawPart,
            preferLatestReceived: false,
        });
        resolvedNac = resolved.nacCode;
        rawPart = resolved.partNumber || rawPart;
    }

    const itemName = await getFamilyDisplayName(connection, resolvedNac || base);
    const defaultUnit = await getDefaultUnitForNac(connection, resolvedNac);

    return {
        nacCode: resolvedNac,
        partNumber: rawPart,
        itemName,
        defaultUnit,
    };
}

export async function getVariantBalances(
    connection: PoolConnection,
    nacCode: string
): Promise<{ virtualBalance: number; trueBalance: number } | null> {
    const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT ${VARIANT_VIRTUAL_BALANCE_SQL} AS virtualBalance, ${VARIANT_TRUE_BALANCE_SQL} AS trueBalance
         FROM stock_details sd WHERE sd.nac_code = ?`,
        [nacCode]
    );
    if (!rows.length) {
        return null;
    }
    return {
        virtualBalance: Number(rows[0].virtualBalance),
        trueBalance: Number(rows[0].trueBalance),
    };
}

export async function remapFamilyTransactionsToLatestReceivedPart(
    connection: PoolConnection,
    baseNacCode: string,
    variants: StockVariantRow[],
    dryRun: boolean,
    options?: {
        legacyNacCode?: string;
        fallbackPartNumbers?: string[];
        detailLog?: string[];
    }
): Promise<{ remaps: number; target: LatestReceivedPartTarget | null }> {
    const target = await resolveLatestReceivedPartTarget(connection, baseNacCode, {
        variants,
        legacyNacCode: options?.legacyNacCode,
        fallbackPartNumbers: options?.fallbackPartNumbers,
    });
    if (!target) {
        return { remaps: 0, target: null };
    }

    const base = stripSuffixFromNac(baseNacCode);
    const nacCodes = new Set<string>([base, ...variants.map(v => v.nac_code)]);
    if (options?.legacyNacCode) {
        nacCodes.add(options.legacyNacCode);
        nacCodes.add(stripSuffixFromNac(options.legacyNacCode));
    }
    const nacList = Array.from(nacCodes).filter(Boolean);
    const placeholders = nacList.map(() => '?').join(', ');

    let remaps = 0;
    const txTables = ['receive_details', 'issue_details', 'request_details'] as const;
    for (const table of txTables) {
        const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT id, nac_code, part_number FROM ${table} WHERE nac_code IN (${placeholders})`,
            nacList
        );
        for (const row of rows) {
            const currentPn = normalizePartNumber(String(row.part_number || ''));
            const needsUpdate =
                row.nac_code !== target.nacCode || currentPn !== target.partNumber;
            if (!needsUpdate) {
                continue;
            }
            if (!dryRun) {
                await connection.execute(
                    `UPDATE ${table} SET nac_code = ?, part_number = ? WHERE id = ?`,
                    [target.nacCode, target.partNumber, row.id]
                );
            }
            remaps++;
            if (options?.detailLog && options.detailLog.length < 100) {
                options.detailLog.push(
                    `${table} id=${row.id}: ${row.nac_code} → ${target.nacCode} (part ${target.partNumber})`
                );
            }
        }
    }

    return { remaps, target };
}

export async function consolidateFamilyOpeningToTarget(
    connection: PoolConnection,
    variants: StockVariantRow[],
    target: LatestReceivedPartTarget,
    dryRun: boolean
): Promise<void> {
    if (variants.length <= 1) {
        return;
    }

    let totalOpenQty = 0;
    let totalOpenAmt = 0;
    let totalBalance = 0;
    for (const v of variants) {
        totalOpenQty += Number(v.open_quantity || 0);
        totalOpenAmt += Number(v.open_amount || 0);
        totalBalance += Number(v.current_balance || 0);
    }

    for (const v of variants) {
        const isTarget = v.nac_code === target.nacCode;
        const openQty = isTarget ? totalOpenQty : 0;
        const openAmt = isTarget ? totalOpenAmt : 0;
        const balance = isTarget ? totalBalance : 0;
        if (!dryRun) {
            await connection.execute(
                `UPDATE stock_details SET
                   open_quantity = ?,
                   open_amount = ?,
                   open_remaining_quantity = ?,
                   current_balance = ?
                 WHERE id = ?`,
                [openQty, openAmt, openQty, balance, v.id]
            );
        }
    }
}

export function getUsedSuffixLetters(variants: StockVariantRow[]): Set<string> {
    const used = new Set<string>();
    for (const v of variants) {
        const parsed = parseNacCode(v.nac_code);
        if (parsed?.suffix) {
            used.add(parsed.suffix);
        }
    }
    return used;
}

export function nextAvailableLetter(variants: StockVariantRow[]): string {
    const used = getUsedSuffixLetters(variants);
    for (let i = 0; i < 26; i++) {
        const letter = letterForIndex(i);
        if (!used.has(letter)) {
            return letter;
        }
    }
    throw new Error('Maximum part variants (26) reached for this family');
}

export async function purgeStockNacAuxiliaryData(
    connection: PoolConnection,
    nacCode: string
): Promise<void> {
    const nac = String(nacCode || '').trim();
    if (!nac) {
        return;
    }
    await connection.execute(`DELETE FROM spare_compatibility WHERE nac_code = ?`, [nac]);
    await connection.execute(
        `DELETE FROM prediction_metrics WHERE nac_code COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci`,
        [nac]
    );
    await connection.execute(`DELETE FROM nac_units WHERE nac_code = ?`, [nac]);
    await connection.execute(`DELETE FROM unit_conversions WHERE nac_code = ?`, [nac]);
    try {
        await connection.execute(`DELETE FROM fuel_equipment_consumption_cache WHERE nac_code = ?`, [nac]);
    } catch {
        // cache table may not exist yet in older databases
    }
}

const clearRemapCollisions = async (
    connection: PoolConnection,
    table: string,
    oldNacCode: string,
    newNacCode: string
): Promise<void> => {
    if (table === 'spare_compatibility') {
        await connection.execute(
            `DELETE FROM spare_compatibility
             WHERE nac_code = ?
               AND equipment_code IN (
                   SELECT equipment_code FROM (
                       SELECT equipment_code FROM spare_compatibility WHERE nac_code = ?
                   ) AS collision_check
               )`,
            [newNacCode, oldNacCode]
        );
        return;
    }
    if (table === 'prediction_metrics') {
        await connection.execute(
            `DELETE FROM prediction_metrics
             WHERE nac_code COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci`,
            [newNacCode]
        );
        return;
    }
    if (table === 'fuel_equipment_consumption_cache') {
        await connection.execute(
            `DELETE FROM fuel_equipment_consumption_cache
             WHERE nac_code = ?
               AND equipment_key IN (
                   SELECT equipment_key FROM (
                       SELECT equipment_key FROM fuel_equipment_consumption_cache WHERE nac_code = ?
                   ) AS collision_check
               )`,
            [newNacCode, oldNacCode]
        );
    }
};

export async function remapNacCodeReferences(
    connection: PoolConnection,
    oldNacCode: string,
    newNacCode: string,
    partNumberFilter?: string,
    includeUnassignedPartNumbers = false
): Promise<void> {
    if (oldNacCode === newNacCode) {
        return;
    }
    const pn = partNumberFilter ? normalizePartNumber(partNumberFilter) : null;
    for (const table of TABLES_WITH_NAC_CODE) {
        if (pn && (table === 'receive_details' || table === 'issue_details' || table === 'request_details')) {
            await connection.execute(
                `UPDATE ${table} SET nac_code = ? WHERE nac_code = ? AND UPPER(TRIM(part_number)) = ?`,
                [newNacCode, oldNacCode, pn]
            );
            if (includeUnassignedPartNumbers) {
                await connection.execute(
                    `UPDATE ${table} SET nac_code = ? WHERE nac_code = ? AND (part_number IS NULL OR TRIM(part_number) = '' OR UPPER(TRIM(part_number)) IN ('NA', 'N/A'))`,
                    [newNacCode, oldNacCode]
                );
            }
        } else if (!pn) {
            await clearRemapCollisions(connection, table, oldNacCode, newNacCode);
            await connection.execute(
                `UPDATE ${table} SET nac_code = ? WHERE nac_code = ?`,
                [newNacCode, oldNacCode]
            );
        }
    }

    try {
        await clearRemapCollisions(connection, 'fuel_equipment_consumption_cache', oldNacCode, newNacCode);
        await connection.execute(
            `UPDATE fuel_equipment_consumption_cache SET nac_code = ? WHERE nac_code = ?`,
            [newNacCode, oldNacCode]
        );
    } catch {
        // cache table may not exist yet in older databases
    }
}

export async function promoteSinglePartFamily(
    connection: PoolConnection,
    stockRow: StockVariantRow
): Promise<{ promotedNacCode: string }> {
    const parsed = parseNacCode(stockRow.nac_code);
    if (!parsed || parsed.isSubCode) {
        return { promotedNacCode: stockRow.nac_code };
    }
    const base = parsed.baseNacCode;
    const newNacCode = buildSubNacCode(base, 'A');
    const oldNacCode = stockRow.nac_code;

    // Never promote onto an existing sub-code — that would create a duplicate NAC row.
    const [collision] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM stock_details WHERE nac_code = ? AND id <> ? LIMIT 1`,
        [newNacCode, stockRow.id]
    );
    if (collision.length) {
        // Ensure base_nac_code is set and leave the code as-is; the caller will pick the
        // next free letter for the incoming variant.
        await connection.execute(
            `UPDATE stock_details SET base_nac_code = ? WHERE id = ?`,
            [base, stockRow.id]
        );
        return { promotedNacCode: stockRow.nac_code };
    }

    await connection.execute(
        `UPDATE stock_details SET nac_code = ?, base_nac_code = ? WHERE id = ?`,
        [newNacCode, base, stockRow.id]
    );
    await remapNacCodeReferences(connection, oldNacCode, newNacCode);

    return { promotedNacCode: newNacCode };
}

export type CreateVariantOptions = {
    baseNacCode: string;
    nacCode: string;
    partNumber: string;
    itemName: string;
    applicableEquipments: string;
    location: string | null;
    unit: string | null;
    imageUrl: string | null;
    currentBalance?: number;
    openQuantity?: number;
    openAmount?: number;
};

export async function createVariantRow(
    connection: PoolConnection,
    opts: CreateVariantOptions
): Promise<number> {
    const base = stripSuffixFromNac(opts.baseNacCode);
    const [result] = await connection.execute(
        `INSERT INTO stock_details (
            nac_code, base_nac_code, item_name, part_numbers, applicable_equipments,
            current_balance, open_quantity, open_amount, location, unit, image_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            opts.nacCode,
            base,
            processItemName(opts.itemName),
            normalizePartNumber(opts.partNumber),
            opts.applicableEquipments || '',
            opts.currentBalance ?? 0,
            opts.openQuantity ?? 0,
            opts.openAmount ?? 0,
            opts.location || '',
            opts.unit || '',
            opts.imageUrl || null,
        ]
    );
    const insertId = (result as { insertId: number }).insertId;

    const equipmentTokens = String(opts.applicableEquipments || '')
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);
    for (const eq of equipmentTokens) {
        await connection.execute(
            `INSERT IGNORE INTO spare_compatibility (nac_code, equipment_code) VALUES (?, ?)`,
            [opts.nacCode, eq]
        );
    }
    return insertId;
}

export async function syncFamilyLocation(
    connection: PoolConnection,
    baseNacCode: string,
    location: string
): Promise<void> {
    const base = stripSuffixFromNac(baseNacCode);
    await connection.execute(
        `UPDATE stock_details SET location = ? WHERE base_nac_code = ? OR nac_code = ?`,
        [location, base, base]
    );
}

export async function syncFamilyEquipments(
    connection: PoolConnection,
    baseNacCode: string,
    applicableEquipments: string
): Promise<void> {
    const base = stripSuffixFromNac(baseNacCode);
    await connection.execute(
        `UPDATE stock_details SET applicable_equipments = ? WHERE base_nac_code = ? OR nac_code = ?`,
        [applicableEquipments, base, base]
    );
}

export async function previewReceiveTarget(
    connection: PoolConnection,
    opts: { baseNacCode: string; partNumber: string }
): Promise<ResolveReceiveTargetResult> {
    const base = stripSuffixFromNac(opts.baseNacCode);
    const partNumber = normalizePartNumber(opts.partNumber);
    if (isAbsentPartNumber(partNumber)) {
        const variants = await getFamilyVariants(connection, base);
        const naVariant = variants.find((v) => isAbsentPartNumber(v.part_numbers));
        const nacCode = naVariant?.nac_code ?? (variants.length === 1 ? variants[0].nac_code : base);
        return {
            nacCode,
            baseNacCode: base,
            isNewVariant: false,
            requiresNewPhoto: false,
            promoted: false,
        };
    }

    const variants = await getFamilyVariants(connection, base);
    const existing = variants.find(v => normalizePartNumber(v.part_numbers) === partNumber);

    if (existing) {
        return {
            nacCode: existing.nac_code,
            baseNacCode: base,
            isNewVariant: false,
            requiresNewPhoto: false,
            promoted: false,
        };
    }

    const singleUnsuffixed = variants.length === 1 && !parseNacCode(variants[0].nac_code)?.isSubCode;
    if (singleUnsuffixed) {
        return {
            nacCode: buildSubNacCode(base, 'B'),
            baseNacCode: base,
            isNewVariant: true,
            requiresNewPhoto: true,
            promoted: true,
        };
    }

    const letter = nextAvailableLetter(variants);
    return {
        nacCode: buildSubNacCode(base, letter),
        baseNacCode: base,
        isNewVariant: true,
        requiresNewPhoto: true,
        promoted: false,
    };
}

export async function ensureReceiveVariantStock(
    connection: PoolConnection,
    opts: {
        targetNacCode: string;
        baseNacCode: string;
        partNumber: string;
        itemName: string;
        applicableEquipments: string;
        location: string | null;
        unit: string | null;
        imageUrl: string | null;
    }
): Promise<StockVariantRow> {
    const [existing] = await connection.execute<StockVariantRow[]>(
        `SELECT * FROM stock_details WHERE nac_code = ?`,
        [opts.targetNacCode]
    );
    if (existing.length) {
        return existing[0];
    }

    const base = stripSuffixFromNac(opts.baseNacCode);
    let variants = await getFamilyVariants(connection, base);
    const singleUnsuffixed = variants.length === 1 && !parseNacCode(variants[0].nac_code)?.isSubCode;

    if (singleUnsuffixed) {
        await promoteSinglePartFamily(connection, variants[0]);
        variants = await getFamilyVariants(connection, base);
    }

    const template = variants[0];
    await createVariantRow(connection, {
        baseNacCode: base,
        nacCode: opts.targetNacCode,
        partNumber: opts.partNumber,
        itemName: opts.itemName,
        applicableEquipments: opts.applicableEquipments || template?.applicable_equipments || '',
        location: opts.location || template?.location || '',
        unit: opts.unit || template?.unit || '',
        imageUrl: opts.imageUrl,
        currentBalance: 0,
        openQuantity: 0,
        openAmount: 0,
    });

    const [created] = await connection.execute<StockVariantRow[]>(
        `SELECT * FROM stock_details WHERE nac_code = ?`,
        [opts.targetNacCode]
    );
    return created[0];
}

export async function mergeFamilyEquipments(
    connection: PoolConnection,
    baseNacCode: string,
    equipmentNumber: string,
    expandEquipmentNumbers: (input: string) => Set<string>
): Promise<string> {
    const variants = await getFamilyVariants(connection, baseNacCode);
    const template = variants[0];
    if (!template) {
        return Array.from(expandEquipmentNumbers(equipmentNumber)).join(',');
    }
    const existingEquipmentNumbers = new Set(
        String(template.applicable_equipments || '')
            .split(',')
            .map(num => num.trim())
            .filter(num => num !== '')
    );
    const newEquipmentNumbers = expandEquipmentNumbers(equipmentNumber);
    const uniqueNewNumbers = Array.from(newEquipmentNumbers).filter(num => !existingEquipmentNumbers.has(num));
    const updated =
        uniqueNewNumbers.length > 0
            ? [...uniqueNewNumbers, ...Array.from(existingEquipmentNumbers)].join(',')
            : template.applicable_equipments;
    if (updated !== template.applicable_equipments) {
        await syncFamilyEquipments(connection, baseNacCode, updated);
    }
    return updated;
}

/** Insert spare_compatibility rows for numeric equipment codes on all family variants. */
export async function syncFamilySpareCompatibilityFromEquipment(
    connection: PoolConnection,
    baseNacCode: string,
    equipmentNumber: string,
    skipSectionCodes?: Set<string>
): Promise<void> {
    const base = stripSuffixFromNac(baseNacCode);
    const variants = await getFamilyVariants(connection, base);
    const tokens = expandEquipmentTokens(equipmentNumber);
    for (const variant of variants) {
        for (const token of tokens) {
            if (skipSectionCodes?.has(token.toUpperCase())) {
                continue;
            }
            if (!/\d/.test(token)) {
                continue;
            }
            await connection.execute(
                `INSERT IGNORE INTO spare_compatibility (nac_code, equipment_code) VALUES (?, ?)`,
                [variant.nac_code, token]
            );
        }
    }
}

/** @deprecated Use previewReceiveTarget */
export const resolveReceiveTarget = previewReceiveTarget;

/** Sort key for FIFO: base family code first, then A, B, C… */
export function variantSuffixRank(nacCode: string): number {
    const parsed = parseNacCode(nacCode);
    if (!parsed) {
        return Number.MAX_SAFE_INTEGER;
    }
    if (!parsed.isSubCode || !parsed.suffix) {
        return 0;
    }
    return parsed.suffix.charCodeAt(0) - 64;
}

export function sortVariantsBySuffix(variants: StockVariantRow[]): StockVariantRow[] {
    return [...variants].sort((left, right) => {
        const rankDiff = variantSuffixRank(left.nac_code) - variantSuffixRank(right.nac_code);
        if (rankDiff !== 0) {
            return rankDiff;
        }
        return String(left.nac_code).localeCompare(String(right.nac_code));
    });
}

export type VariantQuantityAllocation = {
    nacCode: string;
    partNumber: string;
    quantity: number;
};

export async function getFamilyTotalVirtualBalance(
    connection: PoolConnection,
    nacOrBase: string
): Promise<number> {
    const base = stripSuffixFromNac(nacOrBase);
    const variants = await getFamilyVariants(connection, base);
    if (!variants.length) {
        const balances = await getVariantBalances(connection, base);
        return balances?.virtualBalance ?? 0;
    }

    let total = 0;
    for (const variant of variants) {
        const balances = await getVariantBalances(connection, variant.nac_code);
        total += balances?.virtualBalance ?? 0;
    }
    return total;
}

export async function getFamilyTotalTrueBalance(
    connection: PoolConnection,
    nacOrBase: string
): Promise<number> {
    const base = stripSuffixFromNac(nacOrBase);
    const variants = await getFamilyVariants(connection, base);
    if (!variants.length) {
        const balances = await getVariantBalances(connection, base);
        return balances?.trueBalance ?? 0;
    }

    let total = 0;
    for (const variant of variants) {
        const balances = await getVariantBalances(connection, variant.nac_code);
        total += balances?.trueBalance ?? 0;
    }
    return total;
}

/** Consume quantity from earliest sub-codes with available virtual balance (FIFO). */
export async function allocateQuantityAcrossFamilyVariants(
    connection: PoolConnection,
    nacOrBase: string,
    quantity: number
): Promise<VariantQuantityAllocation[]> {
    const requested = Number(quantity);
    if (!Number.isFinite(requested) || requested <= 0) {
        return [];
    }

    const base = stripSuffixFromNac(nacOrBase);
    const variants = sortVariantsBySuffix(await getFamilyVariants(connection, base));
    const allocations: VariantQuantityAllocation[] = [];
    let remaining = requested;

    for (const variant of variants) {
        if (remaining <= 0) {
            break;
        }
        const balances = await getVariantBalances(connection, variant.nac_code);
        const available = balances?.virtualBalance ?? 0;
        if (available <= 0) {
            continue;
        }
        const take = Math.min(remaining, available);
        allocations.push({
            nacCode: variant.nac_code,
            partNumber: normalizePartNumber(variant.part_numbers),
            quantity: take,
        });
        remaining -= take;
    }

    if (remaining > 0) {
        const available = await getFamilyTotalVirtualBalance(connection, base);
        throw new Error(
            `Insufficient stock. Requested: ${requested}, Available: ${available}`
        );
    }

    return allocations;
}

export async function renameStockVariantNac(
    connection: PoolConnection,
    oldNacCode: string,
    newNacCode: string
): Promise<void> {
    if (oldNacCode === newNacCode) {
        return;
    }
    await remapNacCodeReferences(connection, oldNacCode, newNacCode);
    await connection.execute(`UPDATE stock_details SET nac_code = ? WHERE nac_code = ?`, [
        newNacCode,
        oldNacCode,
    ]);
}

/**
 * After deleting a sub-code (e.g. GT 12345A), shift later letters down (B→A, C→B).
 */
export async function compactFamilySuffixesAfterDelete(
    connection: PoolConnection,
    deletedRow: Pick<StockVariantRow, 'id' | 'nac_code'>
): Promise<string[]> {
    const parsed = parseNacCode(String(deletedRow.nac_code || ''));
    if (!parsed?.isSubCode || !parsed.suffix) {
        return [];
    }

    const base = parsed.baseNacCode;
    const deletedSuffixCode = parsed.suffix.charCodeAt(0);
    const variants = await getFamilyVariants(connection, base);
    const usedLetters = new Set(
        variants
            .filter((variant) => variant.id !== deletedRow.id)
            .map((variant) => parseNacCode(variant.nac_code)?.suffix)
            .filter((suffix): suffix is string => Boolean(suffix))
    );

    const toRenumber = variants
        .filter((variant) => variant.id !== deletedRow.id)
        .map((variant) => ({
            variant,
            parsed: parseNacCode(variant.nac_code),
        }))
        .filter(
            (
                entry
            ): entry is {
                variant: StockVariantRow;
                parsed: ParsedNacCode & { isSubCode: true; suffix: string };
            } =>
                Boolean(
                    entry.parsed?.isSubCode &&
                        entry.parsed.suffix &&
                        entry.parsed.suffix.charCodeAt(0) > deletedSuffixCode
                )
        )
        .sort(
            (left, right) =>
                right.parsed.suffix.charCodeAt(0) - left.parsed.suffix.charCodeAt(0)
        );

    if (!toRenumber.length) {
        return [];
    }

    const tempLetters: string[] = [];
    for (let index = 25; index >= 0 && tempLetters.length < toRenumber.length; index -= 1) {
        const letter = letterForIndex(index);
        if (!usedLetters.has(letter)) {
            tempLetters.push(letter);
        }
    }
    if (tempLetters.length < toRenumber.length) {
        throw new Error('Unable to renumber sub-codes after delete — no temporary suffix letters available');
    }

    const steps = toRenumber.map((entry, index) => {
        const oldIndex = entry.parsed.suffix.charCodeAt(0) - 65;
        const newIndex = oldIndex - 1;
        return {
            oldNac: entry.variant.nac_code,
            tempNac: buildSubNacCode(base, tempLetters[index]),
            finalNac: buildSubNacCode(base, letterForIndex(newIndex)),
        };
    });

    const affected = new Set<string>();
    for (const step of steps) {
        await renameStockVariantNac(connection, step.oldNac, step.tempNac);
        affected.add(step.oldNac);
        affected.add(step.tempNac);
    }
    for (const step of steps) {
        await renameStockVariantNac(connection, step.tempNac, step.finalNac);
        affected.add(step.tempNac);
        affected.add(step.finalNac);
    }

    return [...affected];
}

export async function ensureBaseNacCodeOnRow(
    connection: PoolConnection,
    stockId: number
): Promise<void> {
    const [rows] = await connection.execute<StockVariantRow[]>(
        `SELECT id, nac_code, base_nac_code FROM stock_details WHERE id = ?`,
        [stockId]
    );
    if (!rows.length) {
        return;
    }
    const row = rows[0];
    if (row.base_nac_code) {
        return;
    }
    const base = stripSuffixFromNac(row.nac_code);
    await connection.execute(
        `UPDATE stock_details SET base_nac_code = ? WHERE id = ?`,
        [base, stockId]
    );
}
