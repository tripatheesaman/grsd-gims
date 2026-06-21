/** SQL helpers: spare ↔ asset equipment codes and display names. */

import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { sqlFamilyKeyExpression } from '../utils/nacCodeUtils';

const COLLATE = 'utf8mb4_unicode_ci';

export const STOCK_FAMILY_KEY_SQL = sqlFamilyKeyExpression('sd');

export const SPARE_STOCK_JOIN = `
  LEFT JOIN spare_compatibility sc
    ON sc.nac_code = sd.nac_code COLLATE ${COLLATE}
  LEFT JOIN assets a
    ON a.equipment_code = sc.equipment_code COLLATE ${COLLATE}`;

/** Comma-separated equipment codes (for editing / legacy fields). */
export const SPARE_EQUIPMENT_CODES_SQL = `COALESCE(
  NULLIF(
    GROUP_CONCAT(DISTINCT sc.equipment_code ORDER BY sc.equipment_code SEPARATOR ',')
    COLLATE ${COLLATE},
    ''
  ),
  MAX(sd.applicable_equipments)
)`;

/** Human-readable list: CODE — Asset name */
export const SPARE_EQUIPMENT_DISPLAY_SQL = `COALESCE(
  NULLIF(
    GROUP_CONCAT(DISTINCT CONCAT(
      sc.equipment_code,
      CASE
        WHEN a.name IS NOT NULL AND TRIM(a.name) <> ''
        THEN CONCAT(' — ', a.name)
        ELSE ''
      END
    ) ORDER BY sc.equipment_code SEPARATOR ', ')
    COLLATE ${COLLATE},
    ''
  ),
  MAX(sd.applicable_equipments)
)`;

/** Per-variant issue qty (approved issues only). */
const VARIANT_ISSUE_QTY_SQL = `(
  SELECT COALESCE(SUM(idt.issue_quantity), 0)
  FROM issue_details idt
  WHERE idt.nac_code COLLATE ${COLLATE} = sd.nac_code COLLATE ${COLLATE}
    AND idt.approval_status = 'APPROVED'
)`;

/** Virtual balance: opening + all approved receives − approved issues (RRP may still be pending). */
export const VARIANT_VIRTUAL_BALANCE_SQL = `(
  COALESCE(sd.open_quantity, 0)
  + (
    SELECT COALESCE(SUM(rd.received_quantity), 0)
    FROM receive_details rd
    WHERE rd.nac_code COLLATE ${COLLATE} = sd.nac_code COLLATE ${COLLATE}
      AND rd.approval_status = 'APPROVED'
  )
  - ${VARIANT_ISSUE_QTY_SQL}
)`;

/** True balance: opening + approved receives with RRP − approved issues. */
export const VARIANT_TRUE_BALANCE_SQL = `(
  COALESCE(sd.open_quantity, 0)
  + (
    SELECT COALESCE(SUM(rd.received_quantity), 0)
    FROM receive_details rd
    WHERE rd.nac_code COLLATE ${COLLATE} = sd.nac_code COLLATE ${COLLATE}
      AND rd.approval_status = 'APPROVED'
      AND rd.rrp_fk IS NOT NULL
  )
  - ${VARIANT_ISSUE_QTY_SQL}
)`;

/**
 * Base equipment number: digits before an optional T-type suffix.
 * 344, 344T, 344T14, and 344TXXX (any chars after T) all resolve to "344".
 */
export const getEquipmentNumericBase = (code: string): string | null => {
    const trimmed = String(code || '').trim();
    if (!trimmed) {
        return null;
    }
    const tSuffixMatch = trimmed.match(/^(\d+)\s*T/i);
    if (tSuffixMatch) {
        return tSuffixMatch[1];
    }
    if (/^\d+$/.test(trimmed)) {
        return trimmed;
    }
    return null;
};

/** Whether two codes refer to the same unit (anything after T is ignored). */
export const equipmentCodesEquivalent = (a: string, b: string): boolean => {
    const left = String(a || '').trim();
    const right = String(b || '').trim();
    if (!left || !right) {
        return false;
    }
    if (left.toLowerCase() === right.toLowerCase()) {
        return true;
    }
    const baseLeft = getEquipmentNumericBase(left);
    const baseRight = getEquipmentNumericBase(right);
    return Boolean(baseLeft && baseRight && baseLeft === baseRight);
};

export const expandEquipmentTokensToSet = (input: string): Set<string> =>
    new Set(expandEquipmentTokens(input));

export const expandEquipmentTokens = (input: string): string[] => {
    const normalized = String(input || '')
        .replace(/\b(ge|GE)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalized) {
        return [];
    }
    const parts = normalized
        .split(',')
        .flatMap((segment) => {
            const trimmed = segment.trim();
            if (!trimmed) {
                return [];
            }
            const spaceSeparated = trimmed.split(/\s+/).filter(Boolean);
            if (
                spaceSeparated.length > 1 &&
                spaceSeparated.every((token) => /^\d+$/.test(token) || /^\d+\s*-\s*\d+$/.test(token))
            ) {
                return spaceSeparated;
            }
            return [trimmed];
        })
        .map((p) => p.trim())
        .filter(Boolean);
    const out: string[] = [];
    const seen = new Set<string>();
    for (const part of parts) {
        const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
        if (rangeMatch) {
            const start = parseInt(rangeMatch[1], 10);
            const end = parseInt(rangeMatch[2], 10);
            const step = start <= end ? 1 : -1;
            for (let n = start; step === 1 ? n <= end : n >= end; n += step) {
                const token = String(n);
                if (!seen.has(token)) {
                    seen.add(token);
                    out.push(token);
                }
            }
            continue;
        }
        if (/^\d+$/.test(part)) {
            if (!seen.has(part)) {
                seen.add(part);
                out.push(part);
            }
            continue;
        }
        const token = part.replace(/\s+/g, ' ').trim();
        if (token && !seen.has(token)) {
            seen.add(token);
            out.push(token);
        }
    }
    return out;
};

export const equipmentNameExistsSql = (stockAlias: string, param: string) => `
  EXISTS (
    SELECT 1
    FROM spare_compatibility sc_n
    INNER JOIN assets a_n
      ON a_n.equipment_code = sc_n.equipment_code COLLATE ${COLLATE}
    WHERE sc_n.nac_code = ${stockAlias}.nac_code COLLATE ${COLLATE}
      AND a_n.name LIKE ${param}
  )`;

/** Resolve asset equipment codes for a name/number filter (fast pre-lookup). */
export const resolveEquipmentCodesForFilter = async (equipmentNumber: string): Promise<string[]> => {
    const term = String(equipmentNumber).trim();
    if (!term) {
        return [];
    }
    const likeTerm = `%${term}%`;
    const tokens = expandEquipmentTokens(term);
    const codes = new Set<string>();
    const params: unknown[] = [likeTerm, likeTerm];
    let sql = `SELECT DISTINCT equipment_code
               FROM assets
               WHERE name LIKE ?
                  OR equipment_code LIKE ?`;

    for (const token of tokens) {
        if (/^\d+$/.test(token)) {
            sql += ' OR equipment_code = ? OR equipment_code LIKE ?';
            params.push(token, `${token}T%`);
        } else if (token.length >= 2) {
            sql += ' OR equipment_code = ?';
            params.push(token);
        }
    }
    sql += ' LIMIT 60';

    const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
    for (const row of rows) {
        const code = String(row.equipment_code || '').trim();
        if (code) {
            codes.add(code);
        }
    }
    for (const token of tokens) {
        if (token.length >= 2) {
            codes.add(token);
        }
    }
    return [...codes];
};

/** Family-level equipment match: any variant in the family matches the filter. */
export const appendFamilyEquipmentFilter = (
    familyKeyOuterSql: string,
    equipmentNumber: string,
    query: string,
    params: unknown[],
    resolvedCodes: string[] = []
): string => {
    const term = String(equipmentNumber).trim();
    if (!term) {
        return query;
    }
    const likeTerm = `%${term}%`;
    const codes = resolvedCodes.length > 0 ? resolvedCodes : expandEquipmentTokens(term);

    const branches: string[] = ['sd_ef.applicable_equipments LIKE ?'];
    params.push(likeTerm);

    if (codes.length > 0) {
        branches.push(`sc_ef.equipment_code IN (${codes.map(() => '?').join(', ')})`);
        params.push(...codes);
    } else {
        branches.push(`sc_ef.equipment_code LIKE ?`);
        params.push(likeTerm);
        branches.push(`sc_ef.equipment_code IN (
            SELECT equipment_code FROM assets WHERE name LIKE ? LIMIT 40
        )`);
        params.push(likeTerm);
    }

    return `${query} AND ${familyKeyOuterSql} IN (
    SELECT DISTINCT ${sqlFamilyKeyExpression('sd_ef')}
    FROM stock_details sd_ef
    LEFT JOIN spare_compatibility sc_ef
      ON sc_ef.nac_code = sd_ef.nac_code COLLATE ${COLLATE}
    WHERE (${branches.join(' OR ')})
  )`;
};

/** Append AND clause for equipment filter (code, range, or asset name). */
export const appendEquipmentFilter = (
    stockAlias: string,
    useJoin: boolean,
    equipmentNumber: string,
    query: string,
    params: unknown[],
    resolvedCodes: string[] = []
): string => {
    if (useJoin) {
        return appendFamilyEquipmentFilter(
            sqlFamilyKeyExpression(stockAlias),
            equipmentNumber,
            query,
            params,
            resolvedCodes
        );
    }

    const term = String(equipmentNumber).trim();
    if (!term) {
        return query;
    }
    const likeTerm = `%${term}%`;
    params.push(likeTerm);
    return `${query} AND ${stockAlias}.applicable_equipments LIKE ?`;
};

/** Append OR branches on universal search for asset names linked via spare_compatibility. */
export const appendUniversalAssetNameFilter = (
    stockAlias: string,
    useJoin: boolean,
    query: string,
    params: unknown[]
): string => {
    if (!useJoin) {
        return query;
    }
    return `${query} OR ${equipmentNameExistsSql(stockAlias, '?')}`;
};

/** Family-grouped stock list (fallback when join query fails). */
export const buildFamilyGroupedStockListSql = (
    limit: number,
    offset: number
): string => `
  SELECT
    MIN(sd.id) as id,
    ${STOCK_FAMILY_KEY_SQL} as nacCode,
    SUBSTRING_INDEX(MIN(sd.item_name), ',', 1) as itemName,
    GROUP_CONCAT(DISTINCT sd.part_numbers ORDER BY sd.nac_code SEPARATOR ', ') as partNumber,
    MAX(sd.applicable_equipments) as equipmentNumber,
    MAX(sd.applicable_equipments) as equipmentDisplay,
    MAX(sd.location) as location,
    MAX(sd.unit) as unit,
    COALESCE(SUM(sd.open_quantity), 0) as openQuantity,
    COALESCE(SUM(sd.open_amount), 0) as openAmount,
    COUNT(DISTINCT sd.id) as variantCount
  FROM stock_details sd
  GROUP BY ${STOCK_FAMILY_KEY_SQL}
  ORDER BY MIN(sd.id) ASC
  LIMIT ${limit} OFFSET ${offset}`;

export const buildFamilyGroupedStockCountSql = (): string =>
    `SELECT COUNT(DISTINCT ${STOCK_FAMILY_KEY_SQL}) as total FROM stock_details sd`;

/** @deprecated Use buildFamilyGroupedStockListSql */
export const buildSimpleStockListSql = buildFamilyGroupedStockListSql;

/** @deprecated Use buildFamilyGroupedStockCountSql */
export const buildSimpleStockCountSql = buildFamilyGroupedStockCountSql;

/** Scalar subquery: equipment codes with asset names for one stock row. */
export const equipmentDisplaySubquery = (
    nacCodeColumn: string,
    fallbackColumn: string
): string => `(
  SELECT COALESCE(
    NULLIF(
      GROUP_CONCAT(DISTINCT CONCAT(
        sc2.equipment_code,
        CASE
          WHEN a2.name IS NOT NULL AND TRIM(a2.name) <> ''
          THEN CONCAT(' — ', a2.name)
          ELSE ''
        END
      ) ORDER BY sc2.equipment_code SEPARATOR ', ')
      COLLATE ${COLLATE},
      ''
    ),
    ${fallbackColumn}
  )
  FROM spare_compatibility sc2
  LEFT JOIN assets a2
    ON a2.equipment_code = sc2.equipment_code COLLATE ${COLLATE}
  WHERE sc2.nac_code = ${nacCodeColumn} COLLATE ${COLLATE}
)`;
