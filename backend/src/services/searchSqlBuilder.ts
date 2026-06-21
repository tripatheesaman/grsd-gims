import { buildFuzzyLikePatterns } from './searchRelevanceService';

const COLLATE = 'utf8mb4_unicode_ci';

export type FuzzyColumn = {
    expr: string;
    /** When set, also match SOUNDEX(expr) = SOUNDEX(?) for typo-tolerant names. */
    soundex?: boolean;
};

/**
 * Append AND (col1 LIKE ? OR col2 LIKE ? OR …) with fuzzy widened patterns.
 * Returns the updated query string; pushes bind params onto `params`.
 */
export function appendFuzzyOrClause(
    query: string,
    columns: FuzzyColumn[],
    term: string,
    params: unknown[]
): string {
    const patterns = buildFuzzyLikePatterns(term);
    if (!patterns.length || !columns.length) {
        return query;
    }

    const branches: string[] = [];
    for (const column of columns) {
        for (const pattern of patterns) {
            branches.push(`${column.expr} LIKE ?`);
            params.push(pattern);
        }
        if (column.soundex && term.trim().length >= 4) {
            branches.push(`SOUNDEX(${column.expr}) = SOUNDEX(?)`);
            params.push(term.trim());
        }
    }

    if (!branches.length) {
        return query;
    }
    return `${query} AND (${branches.join(' OR ')})`;
}

/** Stock universal search columns (family-grouped query on alias sd). */
export function appendStockUniversalFilter(
    query: string,
    familyKeySql: string,
    term: string,
    params: unknown[],
    options: { includeSearchKey?: boolean; assetNameExistsSql?: string } = {}
): string {
    const columns: FuzzyColumn[] = [
        { expr: `sd.nac_code COLLATE ${COLLATE}` },
        { expr: `${familyKeySql} COLLATE ${COLLATE}` },
        { expr: `sd.item_name COLLATE ${COLLATE}`, soundex: true },
        { expr: `SUBSTRING_INDEX(sd.item_name, ',', 1) COLLATE ${COLLATE}`, soundex: true },
        { expr: `sd.part_numbers COLLATE ${COLLATE}` },
        { expr: `sd.applicable_equipments COLLATE ${COLLATE}` },
    ];
    if (options.includeSearchKey) {
        columns.push({ expr: `sd.search_key COLLATE ${COLLATE}` });
    }

    let next = appendFuzzyOrClause(query, columns, term, params);
    if (options.assetNameExistsSql) {
        const assetPatterns = buildFuzzyLikePatterns(term).slice(0, 6);
        for (const pattern of assetPatterns) {
            next = `${next} OR ${options.assetNameExistsSql}`;
            params.push(pattern);
        }
    }
    return next;
}

/** Request / receive universal columns. */
export function appendRequestUniversalFilter(
    query: string,
    itemNameSql: string,
    term: string,
    params: unknown[]
): string {
    return appendFuzzyOrClause(
        query,
        [
            { expr: 'rd.request_number' },
            { expr: itemNameSql, soundex: true },
            { expr: 'rd.part_number' },
            { expr: 'rd.equipment_number' },
            { expr: 'rd.nac_code' },
        ],
        term,
        params
    );
}

export function buildRequestSearchWhereClause(
    filters: {
        universal?: string;
        equipmentNumber?: string;
        partNumber?: string;
        referenceStatus?: string;
    },
    itemNameSql: string,
    params: unknown[]
): string {
    let clause = 'WHERE 1=1';
    if (filters.universal?.trim()) {
        clause = appendRequestUniversalFilter(clause, itemNameSql, filters.universal.trim(), params);
    }
    if (filters.equipmentNumber?.trim()) {
        clause += ' AND rd.equipment_number LIKE ?';
        params.push(`%${filters.equipmentNumber.trim()}%`);
    }
    if (filters.partNumber?.trim()) {
        clause = appendPartNumberFilter(clause, 'rd.part_number', filters.partNumber.trim(), params);
    }
    if (filters.referenceStatus === 'uploaded') {
        clause += ' AND rd.reference_doc IS NOT NULL';
    } else if (filters.referenceStatus === 'not_uploaded') {
        clause += " AND (rd.reference_doc IS NULL OR rd.reference_doc = '')";
    }
    return clause;
}

export function appendRecordsRequestUniversalFilter(
    query: string,
    term: string,
    params: unknown[]
): string {
    return appendFuzzyOrClause(
        query,
        [
            { expr: 'rd.request_number' },
            { expr: 'rd.nac_code' },
            { expr: 'rd.item_name', soundex: true },
            { expr: 'rd.part_number' },
            { expr: 'rd.equipment_number' },
            { expr: 'a.name', soundex: true },
        ],
        term,
        params
    );
}

export function appendPartNumberFilter(
    query: string,
    columnExpr: string,
    term: string,
    params: unknown[]
): string {
    return appendFuzzyOrClause(query, [{ expr: columnExpr }], term, params);
}

export function sqlInListPlaceholders(values: string[]): { clause: string; params: string[] } {
    if (!values.length) {
        return { clause: 'NULL', params: [] };
    }
    return {
        clause: values.map(() => '?').join(', '),
        params: values,
    };
}

/** Extra AND clauses for approved, not-fully-received request lines (receive print search). */
export function appendReceivableSearchFilters(
    query: string,
    filters: { universal?: string; equipmentNumber?: string; partNumber?: string },
    params: unknown[]
): string {
    let next = query;
    if (filters.universal?.trim()) {
        const branch = appendRequestUniversalFilter('WHERE 1=1', 'rd.item_name', filters.universal.trim(), params);
        next += branch.replace(/^WHERE 1=1/, '');
    }
    if (filters.equipmentNumber?.trim()) {
        next = appendFuzzyOrClause(next, [{ expr: 'rd.equipment_number' }], filters.equipmentNumber.trim(), params);
    }
    if (filters.partNumber?.trim()) {
        next = appendPartNumberFilter(next, 'rd.part_number', filters.partNumber.trim(), params);
    }
    return next;
}

export function appendRecordsReceiveUniversalFilter(
    query: string,
    term: string,
    params: unknown[]
): string {
    return appendFuzzyOrClause(
        query,
        [
            { expr: 'rd.nac_code' },
            { expr: 'rd.item_name', soundex: true },
            { expr: 'rd.part_number' },
            { expr: 'req.request_number' },
            { expr: 'rd.tender_reference_number' },
            { expr: 'a.name', soundex: true },
        ],
        term,
        params
    );
}

export function appendRecordsRrpUniversalFilter(
    query: string,
    term: string,
    params: unknown[]
): string {
    return appendFuzzyOrClause(
        query,
        [
            { expr: 'rd.rrp_number' },
            { expr: 'red.item_name', soundex: true },
            { expr: 'red.part_number' },
            { expr: 'red.nac_code' },
            { expr: 'rqd.request_number' },
            { expr: 'a.name', soundex: true },
        ],
        term,
        params
    );
}

/** Spare RRP print search — returns leading AND (…) fragment. */
export function buildRrpSpareSearchFilter(term: string, params: unknown[]): string {
    const branch = appendFuzzyOrClause(
        'WHERE 1=1',
        [
            { expr: 'rrp.rrp_number' },
            { expr: 'rd.item_name', soundex: true },
            { expr: 'rd.part_number' },
            { expr: "COALESCE(rqd.equipment_number, '')" },
            { expr: 'rd.tender_reference_number' },
        ],
        term,
        params
    );
    return branch.replace(/^WHERE 1=1/, '');
}

/** Capital RRP print search — returns leading AND (…) fragment. */
export function buildRrpCapitalSearchFilter(term: string, params: unknown[]): string {
    const branch = appendFuzzyOrClause(
        'WHERE 1=1',
        [
            { expr: 'rrp.rrp_number' },
            { expr: 'ar.model_name', soundex: true },
            { expr: "JSON_UNQUOTE(JSON_EXTRACT(rrp.capital_item_data, '$.equipment_name'))", soundex: true },
            { expr: "JSON_UNQUOTE(JSON_EXTRACT(rrp.capital_item_data, '$.equipment_code'))" },
            { expr: "JSON_UNQUOTE(JSON_EXTRACT(rrp.capital_item_data, '$.model_number'))" },
            { expr: "JSON_UNQUOTE(JSON_EXTRACT(rrp.capital_item_data, '$.serial_number'))" },
        ],
        term,
        params
    );
    return branch.replace(/^WHERE 1=1/, '');
}
