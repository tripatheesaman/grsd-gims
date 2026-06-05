import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { expandEquipmentTokens } from './spareEquipmentDisplay';

const COLLATE = 'utf8mb4_unicode_ci';

type EquipmentEntry = { code: string; name?: string };

type EnrichableRow = {
    nacCode: string;
    equipmentNumber?: string | null;
    equipmentDisplay?: string | null;
};

/** Exclude legacy trailing equipment names (e.g. "Cobus" in "2112,2113,Cobus"). */
export const extractEquipmentCodesFromApplicable = (input: string): string[] => {
    return expandEquipmentTokens(input).filter((token) => !/^[A-Za-z\s]+$/.test(token));
};

const sortEquipmentEntries = (entries: EquipmentEntry[]): EquipmentEntry[] => {
    return [...entries].sort((a, b) => {
        const aNum = parseInt(a.code, 10);
        const bNum = parseInt(b.code, 10);
        if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
            return aNum - bNum;
        }
        return a.code.localeCompare(b.code);
    });
};

/** Build "CODE — Name" list for frontend grouping into "Name (2112-2114)". */
export const buildCodeNameDisplayString = (entries: EquipmentEntry[]): string => {
    const sorted = sortEquipmentEntries(entries);
    return sorted
        .map((entry) => {
            const name = (entry.name || '').trim();
            return name ? `${entry.code} — ${name}` : entry.code;
        })
        .join(', ');
};

const chunk = <T>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        out.push(arr.slice(i, i + size));
    }
    return out;
};

const loadAssetNamesByCode = async (codes: string[]): Promise<Map<string, string>> => {
    const nameByCode = new Map<string, string>();
    if (!codes.length) {
        return nameByCode;
    }
    for (const batch of chunk(codes, 500)) {
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT equipment_code as equipmentCode, name
             FROM assets
             WHERE equipment_code COLLATE ${COLLATE} IN (${batch.map(() => '?').join(',')})`,
            batch
        );
        for (const row of rows) {
            const code = String(row.equipmentCode || '').trim();
            const name = String(row.name || '').trim();
            if (code && name) {
                nameByCode.set(code, name);
            }
        }
    }
    return nameByCode;
};

const loadCompatibilityByNac = async (nacCodes: string[]): Promise<Map<string, EquipmentEntry[]>> => {
    const entriesByNac = new Map<string, EquipmentEntry[]>();
    if (!nacCodes.length) {
        return entriesByNac;
    }

    for (const batch of chunk(nacCodes, 200)) {
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT
               sc.nac_code as nacCode,
               sc.equipment_code as equipmentCode,
               a.name as assetName
             FROM spare_compatibility sc
             LEFT JOIN assets a
               ON a.equipment_code COLLATE ${COLLATE} = sc.equipment_code COLLATE ${COLLATE}
             WHERE sc.nac_code COLLATE ${COLLATE} IN (${batch.map(() => '?').join(',')})
             ORDER BY sc.equipment_code`,
            batch
        );

        for (const row of rows) {
            const nacCode = String(row.nacCode || '').trim();
            const code = String(row.equipmentCode || '').trim();
            if (!nacCode || !code) {
                continue;
            }
            const name = String(row.assetName || '').trim() || undefined;
            if (!entriesByNac.has(nacCode)) {
                entriesByNac.set(nacCode, []);
            }
            const entries = entriesByNac.get(nacCode)!;
            if (!entries.some((entry) => entry.code === code)) {
                entries.push({ code, name });
            }
        }
    }

    return entriesByNac;
};

/**
 * Resolve per-code asset names and set equipmentDisplay to "CODE — Name" pairs
 * so the UI can show "Cobus (2112-2114), Other Name (2116)".
 */
export const enrichEquipmentDisplays = async <T extends EnrichableRow>(rows: T[]): Promise<void> => {
    if (!rows.length) {
        return;
    }

    const nacCodes = [...new Set(rows.map((row) => String(row.nacCode || '').trim()).filter(Boolean))];
    const entriesByNac = await loadCompatibilityByNac(nacCodes);

    const codesNeedingLookup = new Set<string>();

    for (const row of rows) {
        const nacCode = String(row.nacCode || '').trim();
        if (!nacCode) {
            continue;
        }

        const source = String(row.equipmentNumber || row.equipmentDisplay || '').trim();
        const parsedCodes = extractEquipmentCodesFromApplicable(source);
        let entries = entriesByNac.get(nacCode) || [];
        const seenCodes = new Set(entries.map((entry) => entry.code));

        for (const code of parsedCodes) {
            if (!seenCodes.has(code)) {
                entries.push({ code });
                seenCodes.add(code);
            }
        }

        if (entries.length) {
            entriesByNac.set(nacCode, entries);
        }

        for (const entry of entries) {
            if (!entry.name) {
                codesNeedingLookup.add(entry.code);
            }
        }
    }

    const nameByCode = await loadAssetNamesByCode([...codesNeedingLookup]);

    for (const entries of entriesByNac.values()) {
        for (const entry of entries) {
            if (!entry.name && nameByCode.has(entry.code)) {
                entry.name = nameByCode.get(entry.code);
            }
        }
    }

    for (const row of rows) {
        const nacCode = String(row.nacCode || '').trim();
        const entries = entriesByNac.get(nacCode);
        if (entries?.length) {
            row.equipmentDisplay = buildCodeNameDisplayString(entries);
        }
    }
};
