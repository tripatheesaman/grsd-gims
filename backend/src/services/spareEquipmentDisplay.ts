/** SQL helpers: spare ↔ asset equipment codes and display names. */

const COLLATE = 'utf8mb4_unicode_ci';

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
  sd.applicable_equipments
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
  sd.applicable_equipments
)`;

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

const equipmentNameExistsSql = (stockAlias: string, param: string) => `
  EXISTS (
    SELECT 1
    FROM spare_compatibility sc_n
    INNER JOIN assets a_n
      ON a_n.equipment_code = sc_n.equipment_code COLLATE ${COLLATE}
    WHERE sc_n.nac_code = ${stockAlias}.nac_code COLLATE ${COLLATE}
      AND a_n.name LIKE ${param}
  )`;

/** Match spares by linked asset name even when spare_compatibility is not populated.
 *  Uses a simpler LIKE on applicable_equipments with the equipment_code from assets. */
const applicableAssetNameExistsSql = (stockAlias: string, param: string) => `
  EXISTS (
    SELECT 1
    FROM assets a_eq
    WHERE a_eq.name COLLATE ${COLLATE} LIKE ${param}
      AND ${stockAlias}.applicable_equipments COLLATE ${COLLATE} LIKE CONCAT('%', a_eq.equipment_code, '%')
  )`;

/** Append AND clause for equipment filter (code, range, or asset name). */
export const appendEquipmentFilter = (
    stockAlias: string,
    useJoin: boolean,
    equipmentNumber: string,
    query: string,
    params: unknown[]
): string => {
    const term = String(equipmentNumber).trim();
    if (!term) {
        return query;
    }
    const likeTerm = `%${term}%`;
    const tokens = expandEquipmentTokens(term);
    const numericTokens = tokens.filter((t) => /^\d+$/.test(t));

    if (useJoin) {
        let clause = ` AND (
      ${stockAlias}.applicable_equipments LIKE ?
      OR a.name LIKE ?
      OR sc.equipment_code LIKE ?
      OR ${applicableAssetNameExistsSql(stockAlias, '?')}`;
        params.push(likeTerm, likeTerm, likeTerm, likeTerm);
        if (numericTokens.length > 0) {
            clause += ` OR sc.equipment_code IN (?)`;
            params.push(numericTokens);
        }
        clause += `)`;
        return query + clause;
    }

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

/** Simple stock list without asset join (fallback when join query fails). */
export const buildSimpleStockListSql = (
    limit: number,
    offset: number
): string => `
  SELECT
    sd.id as id,
    sd.nac_code as nacCode,
    sd.item_name as itemName,
    sd.part_numbers as partNumber,
    sd.applicable_equipments as equipmentNumber,
    sd.applicable_equipments as equipmentDisplay,
    sd.current_balance as currentBalance,
    sd.location as location,
    sd.unit as unit
  FROM stock_details sd
  ORDER BY sd.id ASC
  LIMIT ${limit} OFFSET ${offset}`;

export const buildSimpleStockCountSql = (): string =>
    `SELECT COUNT(*) as total FROM stock_details`;

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
