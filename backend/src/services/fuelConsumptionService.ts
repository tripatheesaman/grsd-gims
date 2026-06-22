import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getEquipmentNumericBase } from './spareEquipmentDisplay';
import { compactNacCode } from './issueValidationService';

const MIN_VALID_TRIPS = 2;
const FUEL_NAC_BY_TYPE: Record<string, string> = {
    diesel: 'GT 07986',
    petrol: 'GT 00000',
};

export interface FuelHistoryRow {
    issue_date: Date | string;
    issue_quantity: number;
    kilometers: number;
    is_kilometer_reset: number | boolean;
    issue_id?: number;
}

export interface FuelConsumptionRebuildSummary {
    equipmentFamilies: number;
    withEnoughHistory: number;
    totalApprovedIssues: number;
    cacheRowsWritten: number;
}

const sortFuelHistoryChronologically = (history: FuelHistoryRow[]): FuelHistoryRow[] =>
    [...history].sort((left, right) => {
        const leftTime = new Date(left.issue_date).getTime();
        const rightTime = new Date(right.issue_date).getTime();
        if (leftTime !== rightTime) {
            return leftTime - rightTime;
        }
        return Number(left.issue_id || 0) - Number(right.issue_id || 0);
    });

let cacheTableEnsured = false;

export const ensureFuelConsumptionCacheTable = async (connection: PoolConnection): Promise<void> => {
    if (cacheTableEnsured) {
        return;
    }
    await connection.query(`
        CREATE TABLE IF NOT EXISTS fuel_equipment_consumption_cache (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nac_code VARCHAR(32) NOT NULL,
            equipment_key VARCHAR(64) NOT NULL,
            sample_equipment VARCHAR(64) NOT NULL,
            avg_km_per_liter DECIMAL(14, 4) NOT NULL DEFAULT 0,
            avg_liters_per_km DECIMAL(14, 6) NOT NULL DEFAULT 0,
            valid_trip_count INT NOT NULL DEFAULT 0,
            total_km DECIMAL(14, 2) NOT NULL DEFAULT 0,
            total_liters DECIMAL(14, 2) NOT NULL DEFAULT 0,
            history_issue_count INT NOT NULL DEFAULT 0,
            computed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_fuel_equip_consumption (nac_code, equipment_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    cacheTableEnsured = true;
};

const mapCachedStatsRow = (row: RowDataPacket): FuelConsumptionStats => ({
    avgKmPerLiter: Number(row.avg_km_per_liter),
    avgLitersPerKm: Number(row.avg_liters_per_km),
    validTripCount: Number(row.valid_trip_count),
    totalKm: Number(row.total_km),
    totalLiters: Number(row.total_liters),
});

async function loadCachedConsumptionStatsMap(
    connection: PoolConnection,
    keys: string[]
): Promise<Map<string, FuelConsumptionStats>> {
    const map = new Map<string, FuelConsumptionStats>();
    if (keys.length === 0) {
        return map;
    }

    await ensureFuelConsumptionCacheTable(connection);

    const tuples = keys
        .map((key) => {
            const separator = key.indexOf('|');
            if (separator <= 0) {
                return null;
            }
            return {
                key,
                nacCode: compactNacCode(key.slice(0, separator)),
                equipmentKey: key.slice(separator + 1),
            };
        })
        .filter((entry): entry is { key: string; nacCode: string; equipmentKey: string } => Boolean(entry));

    if (tuples.length === 0) {
        return map;
    }

    const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT nac_code, equipment_key, avg_km_per_liter, avg_liters_per_km,
                valid_trip_count, total_km, total_liters
         FROM fuel_equipment_consumption_cache
         WHERE (nac_code, equipment_key) IN (${tuples.map(() => '(?, ?)').join(', ')})`,
        tuples.flatMap((entry) => [entry.nacCode, entry.equipmentKey])
    );

    for (const row of rows) {
        const key = `${String(row.nac_code).trim()}|${String(row.equipment_key).trim()}`;
        map.set(key, mapCachedStatsRow(row));
    }

    return map;
}

async function getCachedConsumptionStats(
    connection: PoolConnection,
    nacCode: string,
    equipment: string
): Promise<FuelConsumptionStats | null> {
    const key = consumptionStatsKey(nacCode, equipment);
    const cached = await loadCachedConsumptionStatsMap(connection, [key]);
    return cached.get(key) ?? null;
}

export interface FuelConsumptionStats {
    avgKmPerLiter: number;
    avgLitersPerKm: number;
    validTripCount: number;
    totalKm: number;
    totalLiters: number;
}

export interface FuelConsumptionAnalysis {
    equipment: string;
    nacCode: string;
    previousKilometers: number;
    currentKilometers: number;
    quantityLiters: number;
    kmDelta: number;
    avgKmPerLiter: number;
    avgLitersPerKm: number;
    expectedKmForQuantity: number;
    exceedsAverage: boolean;
    hasEnoughHistory: boolean;
    validTripCount: number;
    warningMessage: string | null;
}

export const fuelTypeToNacCode = (fuelType: string): string => {
    const nac = FUEL_NAC_BY_TYPE[String(fuelType || '').toLowerCase()];
    if (!nac) {
        throw new Error(`Invalid fuel type: ${fuelType}`);
    }
    return nac;
};

/** Canonical key for grouping fuel history (344, 344T, 344T14 → "344"). */
export const equipmentConsumptionKey = (equipment: string): string => {
    const trimmed = String(equipment || '').trim().toLowerCase();
    if (!trimmed || trimmed === 'cleaning') {
        return trimmed;
    }
    const base = getEquipmentNumericBase(trimmed);
    return base ? base.toLowerCase() : trimmed;
};

export const consumptionStatsKey = (nacCode: string, equipment: string): string =>
    `${compactNacCode(nacCode)}|${equipmentConsumptionKey(equipment)}`;

const nacMatchSql = (alias: string): string =>
    `REPLACE(TRIM(${alias}.nac_code), ' ', '') = ?`;

const buildEquipmentMatchClause = (
    equipment: string,
    column = 'i.issued_for'
): { sql: string; params: string[] } => {
    const trimmed = String(equipment || '').trim();
    const base = getEquipmentNumericBase(trimmed);
    if (base) {
        return {
            sql: `(LOWER(TRIM(${column})) = LOWER(?) OR LOWER(TRIM(${column})) REGEXP ?)`,
            params: [trimmed, `^${base}(t.*)?$`],
        };
    }
    return {
        sql: `LOWER(TRIM(${column})) = LOWER(?)`,
        params: [trimmed],
    };
};

const buildMultipleEquipmentMatchClause = (
    equipments: string[],
    column = 'i.issued_for'
): { sql: string; params: string[] } => {
    const unique = [...new Set(equipments.map((e) => String(e || '').trim()).filter(Boolean))];
    if (unique.length === 0) {
        return { sql: '1=0', params: [] };
    }
    const parts: string[] = [];
    const params: string[] = [];
    for (const equipment of unique) {
        const match = buildEquipmentMatchClause(equipment, column);
        parts.push(`(${match.sql})`);
        params.push(...match.params);
    }
    return { sql: `(${parts.join(' OR ')})`, params };
};

export const computeConsumptionStats = (history: FuelHistoryRow[]): FuelConsumptionStats => {
    let totalKm = 0;
    let totalLiters = 0;
    let validTripCount = 0;
    let prevKm = 0;

    for (const row of history) {
        if (Number(row.is_kilometer_reset) === 1) {
            prevKm = 0;
        }
        const liters = Number(row.issue_quantity);
        const currentKm = Number(row.kilometers);
        const kmDelta = currentKm - prevKm;

        if (kmDelta > 0 && liters > 0) {
            totalKm += kmDelta;
            totalLiters += liters;
            validTripCount += 1;
        }
        prevKm = currentKm;
    }

    const avgKmPerLiter = totalLiters > 0 ? totalKm / totalLiters : 0;
    const avgLitersPerKm = totalKm > 0 ? totalLiters / totalKm : 0;

    return {
        avgKmPerLiter,
        avgLitersPerKm,
        validTripCount,
        totalKm,
        totalLiters,
    };
};

export async function getApprovedFuelHistory(
    connection: PoolConnection,
    nacCode: string,
    equipment: string,
    excludeIssueId?: number
): Promise<FuelHistoryRow[]> {
    const equipmentMatch = buildEquipmentMatchClause(equipment);
    const params: Array<string | number> = [compactNacCode(nacCode), ...equipmentMatch.params];
    let excludeClause = '';
    if (excludeIssueId) {
        excludeClause = ' AND i.id <> ?';
        params.push(excludeIssueId);
    }

    const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT i.id AS issue_id, i.issue_date, i.issue_quantity, f.kilometers, f.is_kilometer_reset
         FROM issue_details i
         INNER JOIN fuel_records f ON f.issue_fk = i.id
         WHERE i.approval_status = 'APPROVED'
           AND ${nacMatchSql('i')}
           AND ${equipmentMatch.sql}
           ${excludeClause}
         ORDER BY i.issue_date ASC, i.id ASC`,
        params
    );

    return rows.map((row) => ({
        issue_id: Number(row.issue_id),
        issue_date: row.issue_date,
        issue_quantity: Number(row.issue_quantity),
        kilometers: Number(row.kilometers),
        is_kilometer_reset: row.is_kilometer_reset,
    }));
}

export async function getLatestOdometerReading(
    connection: PoolConnection,
    nacCode: string,
    equipment: string,
    beforeIssueDate?: string
): Promise<number> {
    const equipmentMatch = buildEquipmentMatchClause(equipment);
    const params: Array<string> = [compactNacCode(nacCode), ...equipmentMatch.params];
    let dateClause = '';
    if (beforeIssueDate) {
        dateClause = ' AND i.issue_date < ?';
        params.push(beforeIssueDate);
    }

    const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT f.kilometers, f.is_kilometer_reset
         FROM fuel_records f
         INNER JOIN issue_details i ON f.issue_fk = i.id
         WHERE ${nacMatchSql('i')}
           AND ${equipmentMatch.sql}
           ${dateClause}
         ORDER BY i.issue_date DESC, f.id DESC
         LIMIT 1`,
        params
    );

    if (!rows.length) {
        return 0;
    }
    const row = rows[0];
    if (Number(row.is_kilometer_reset) === 1) {
        return 0;
    }
    return Number(row.kilometers) || 0;
}

export function buildConsumptionAnalysis(
    stats: FuelConsumptionStats,
    params: {
        equipment: string;
        nacCode: string;
        previousKilometers: number;
        currentKilometers: number;
        quantityLiters: number;
    }
): FuelConsumptionAnalysis {
    const equipment = String(params.equipment || '').trim();
    const nacCode = params.nacCode;
    const currentKilometers = Number(params.currentKilometers);
    const quantityLiters = Number(params.quantityLiters);
    const previousKilometers = Number(params.previousKilometers);
    const kmDelta = Math.max(0, currentKilometers - previousKilometers);
    const hasEnoughHistory = stats.validTripCount >= MIN_VALID_TRIPS;
    const expectedKmForQuantity =
        hasEnoughHistory && stats.avgKmPerLiter > 0 ? quantityLiters * stats.avgKmPerLiter : 0;
    const exceedsAverage =
        hasEnoughHistory && expectedKmForQuantity > 0 && kmDelta > expectedKmForQuantity;

    let warningMessage: string | null = null;
    if (exceedsAverage) {
        warningMessage =
            `Distance traveled (${kmDelta.toLocaleString()} km) exceeds the historical average ` +
            `(${expectedKmForQuantity.toFixed(1)} km expected for ${quantityLiters} L at ` +
            `${stats.avgKmPerLiter.toFixed(2)} km/L based on ${stats.validTripCount} prior issues).`;
    }

    return {
        equipment,
        nacCode,
        previousKilometers,
        currentKilometers,
        quantityLiters,
        kmDelta,
        avgKmPerLiter: stats.avgKmPerLiter,
        avgLitersPerKm: stats.avgLitersPerKm,
        expectedKmForQuantity,
        exceedsAverage,
        hasEnoughHistory,
        validTripCount: stats.validTripCount,
        warningMessage,
    };
}

export async function loadConsumptionStatsMap(
    connection: PoolConnection,
    pairs: Array<{ nacCode: string; equipment: string }>
): Promise<Map<string, FuelConsumptionStats>> {
    const map = new Map<string, FuelConsumptionStats>();
    const unique = new Map<string, { nacCode: string; equipment: string }>();

    for (const pair of pairs) {
        const equipment = String(pair.equipment || '').trim();
        if (!equipment || equipment.toLowerCase() === 'cleaning') {
            continue;
        }
        const key = consumptionStatsKey(pair.nacCode, equipment);
        if (!unique.has(key)) {
            unique.set(key, { nacCode: pair.nacCode, equipment });
        }
    }

    if (unique.size === 0) {
        return map;
    }

    const allKeys = [...unique.keys()];
    const cachedStats = await loadCachedConsumptionStatsMap(connection, allKeys);
    for (const [key, stats] of cachedStats.entries()) {
        map.set(key, stats);
    }

    const uncached = [...unique.entries()].filter(([key]) => !map.has(key));
    if (uncached.length === 0) {
        return map;
    }

    const nacCodes = [...new Set(uncached.map(([, entry]) => compactNacCode(entry.nacCode)))];
    const equipmentList = uncached.map(([, entry]) => entry.equipment);
    const equipmentMatch = buildMultipleEquipmentMatchClause(equipmentList);

    const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT i.id AS issue_id, i.nac_code, i.issued_for, i.issue_date, i.issue_quantity, f.kilometers, f.is_kilometer_reset
         FROM issue_details i
         INNER JOIN fuel_records f ON f.issue_fk = i.id
         WHERE i.approval_status = 'APPROVED'
           AND REPLACE(TRIM(i.nac_code), ' ', '') IN (${nacCodes.map(() => '?').join(',')})
           AND ${equipmentMatch.sql}
         ORDER BY i.issue_date ASC, i.id ASC`,
        [...nacCodes, ...equipmentMatch.params]
    );

    const uncachedKeys = new Set(uncached.map(([key]) => key));
    const grouped = new Map<string, FuelHistoryRow[]>();
    for (const row of rows) {
        const key = consumptionStatsKey(String(row.nac_code), String(row.issued_for));
        if (!uncachedKeys.has(key)) {
            continue;
        }
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key)!.push({
            issue_id: Number(row.issue_id),
            issue_date: row.issue_date,
            issue_quantity: Number(row.issue_quantity),
            kilometers: Number(row.kilometers),
            is_kilometer_reset: row.is_kilometer_reset,
        });
    }

    for (const [key] of uncached) {
        const history = sortFuelHistoryChronologically(grouped.get(key) || []);
        map.set(key, computeConsumptionStats(history));
    }

    return map;
}

export async function analyzeFuelConsumption(
    connection: PoolConnection,
    opts: {
        fuelType: string;
        equipment: string;
        currentKilometers: number;
        quantityLiters: number;
        previousKilometers?: number;
        beforeIssueDate?: string;
        excludeIssueId?: number;
    }
): Promise<FuelConsumptionAnalysis> {
    const equipment = String(opts.equipment || '').trim();
    const nacCode = fuelTypeToNacCode(opts.fuelType);
    const currentKilometers = Number(opts.currentKilometers);
    const quantityLiters = Number(opts.quantityLiters);

    const previousKilometers =
        opts.previousKilometers != null
            ? Number(opts.previousKilometers)
            : await getLatestOdometerReading(connection, nacCode, equipment, opts.beforeIssueDate);

    const history = await getApprovedFuelHistory(connection, nacCode, equipment, opts.excludeIssueId);
    const stats =
        opts.excludeIssueId
            ? computeConsumptionStats(history)
            : (await getCachedConsumptionStats(connection, nacCode, equipment))
                ?? computeConsumptionStats(history);
    return buildConsumptionAnalysis(stats, {
        equipment,
        nacCode,
        previousKilometers,
        currentKilometers,
        quantityLiters,
    });
}

export async function analyzeFuelConsumptionBatch(
    connection: PoolConnection,
    fuelType: string,
    issueDate: string | undefined,
    records: Array<{
        equipment_number: string;
        kilometers: number;
        quantity: number;
    }>,
    options?: { excludeIssueId?: number; previousKilometersByEquipment?: Record<string, number> }
): Promise<Array<FuelConsumptionAnalysis & { index: number }>> {
    const nacCode = fuelTypeToNacCode(fuelType);
    const statsMap = await loadConsumptionStatsMap(
        connection,
        records.map((record) => ({
            nacCode,
            equipment: String(record.equipment_number || ''),
        }))
    );

    const results: Array<FuelConsumptionAnalysis & { index: number }> = [];
    for (let index = 0; index < records.length; index++) {
        const record = records[index];
        const equipment = String(record.equipment_number || '').trim();
        if (!equipment || equipment.toLowerCase() === 'cleaning') {
            continue;
        }

        const previousKilometers =
            options?.previousKilometersByEquipment?.[equipment] != null
                ? Number(options.previousKilometersByEquipment[equipment])
                : await getLatestOdometerReading(connection, nacCode, equipment, issueDate);

        const stats =
            statsMap.get(consumptionStatsKey(nacCode, equipment)) ||
            computeConsumptionStats([]);

        results.push({
            ...buildConsumptionAnalysis(stats, {
                equipment,
                nacCode,
                previousKilometers,
                currentKilometers: Number(record.kilometers),
                quantityLiters: Number(record.quantity),
            }),
            index,
        });
    }
    return results;
}

export async function rebuildFuelEquipmentConsumptionCache(
    connection: PoolConnection
): Promise<FuelConsumptionRebuildSummary> {
    await ensureFuelConsumptionCacheTable(connection);

    const [pairRows] = await connection.query<RowDataPacket[]>(
        `SELECT DISTINCT i.nac_code, i.issued_for
         FROM issue_details i
         INNER JOIN fuel_records f ON f.issue_fk = i.id
         WHERE i.approval_status = 'APPROVED'
           AND LOWER(TRIM(i.issued_for)) <> 'cleaning'
         ORDER BY i.nac_code, i.issued_for`
    );

    const families = new Map<string, { nacCode: string; equipment: string }>();
    let totalApprovedIssues = 0;

    for (const row of pairRows) {
        const equipment = String(row.issued_for || '').trim();
        const nacCode = String(row.nac_code || '').trim();
        if (!equipment || !nacCode) {
            continue;
        }
        const key = consumptionStatsKey(nacCode, equipment);
        if (!families.has(key)) {
            families.set(key, { nacCode, equipment });
        }
    }

    const [issueCountRows] = await connection.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total
         FROM issue_details i
         INNER JOIN fuel_records f ON f.issue_fk = i.id
         WHERE i.approval_status = 'APPROVED'
           AND LOWER(TRIM(i.issued_for)) <> 'cleaning'`
    );
    totalApprovedIssues = Number(issueCountRows[0]?.total || 0);

    await connection.query('DELETE FROM fuel_equipment_consumption_cache');

    let withEnoughHistory = 0;
    let cacheRowsWritten = 0;

    for (const entry of families.values()) {
        const history = await getApprovedFuelHistory(connection, entry.nacCode, entry.equipment);
        const stats = computeConsumptionStats(history);
        if (stats.validTripCount >= MIN_VALID_TRIPS) {
            withEnoughHistory += 1;
        }

        await connection.execute(
            `INSERT INTO fuel_equipment_consumption_cache
             (nac_code, equipment_key, sample_equipment, avg_km_per_liter, avg_liters_per_km,
              valid_trip_count, total_km, total_liters, history_issue_count)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                compactNacCode(entry.nacCode),
                equipmentConsumptionKey(entry.equipment),
                entry.equipment,
                stats.avgKmPerLiter,
                stats.avgLitersPerKm,
                stats.validTripCount,
                stats.totalKm,
                stats.totalLiters,
                history.length,
            ]
        );
        cacheRowsWritten += 1;
    }

    return {
        equipmentFamilies: families.size,
        withEnoughHistory,
        totalApprovedIssues,
        cacheRowsWritten,
    };
}
