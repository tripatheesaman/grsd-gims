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
    `${String(nacCode || '').trim()}|${equipmentConsumptionKey(equipment)}`;

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
        `SELECT i.issue_date, i.issue_quantity, f.kilometers, f.is_kilometer_reset
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

    const nacCodes = [...new Set([...unique.values()].map((entry) => compactNacCode(entry.nacCode)))];
    const equipmentList = [...unique.values()].map((entry) => entry.equipment);
    const equipmentMatch = buildMultipleEquipmentMatchClause(equipmentList);

    const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT i.nac_code, i.issued_for, i.issue_date, i.issue_quantity, f.kilometers, f.is_kilometer_reset
         FROM issue_details i
         INNER JOIN fuel_records f ON f.issue_fk = i.id
         WHERE i.approval_status = 'APPROVED'
           AND REPLACE(TRIM(i.nac_code), ' ', '') IN (${nacCodes.map(() => '?').join(',')})
           AND ${equipmentMatch.sql}
         ORDER BY i.nac_code, LOWER(TRIM(i.issued_for)), i.issue_date ASC, i.id ASC`,
        [...nacCodes, ...equipmentMatch.params]
    );

    const grouped = new Map<string, FuelHistoryRow[]>();
    for (const row of rows) {
        const key = consumptionStatsKey(String(row.nac_code), String(row.issued_for));
        if (!unique.has(key)) {
            continue;
        }
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key)!.push({
            issue_date: row.issue_date,
            issue_quantity: Number(row.issue_quantity),
            kilometers: Number(row.kilometers),
            is_kilometer_reset: row.is_kilometer_reset,
        });
    }

    for (const key of unique.keys()) {
        map.set(key, computeConsumptionStats(grouped.get(key) || []));
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
    const stats = computeConsumptionStats(history);
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
