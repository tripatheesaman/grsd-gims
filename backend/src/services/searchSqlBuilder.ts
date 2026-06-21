import {
    buildSqlLikePatterns,
    classifySearchTerm,
    type SearchIntent,
} from './searchRelevanceService';

const COLLATE = 'utf8mb4_unicode_ci';

export type FuzzyColumn = {
    expr: string;
};

function appendLikeBranches(
    query: string,
    columns: FuzzyColumn[],
    patterns: string[],
    params: unknown[]
): string {
    if (!patterns.length || !columns.length) {
        return query;
    }
    const branches: string[] = [];
    for (const column of columns) {
        for (const pattern of patterns) {
            branches.push(`${column.expr} LIKE ?`);
            params.push(pattern);
        }
    }
    if (!branches.length) {
        return query;
    }
    return `${query} AND (${branches.join(' OR ')})`;
}

/**
 * Append AND (col1 LIKE ? OR col2 LIKE ? OR …) with a small set of LIKE patterns.
 * Typo tolerance is done in rankStockSearchResults() after the query.
 */
export function appendFuzzyOrClause(
    query: string,
    columns: FuzzyColumn[],
    term: string,
    params: unknown[],
    intent?: SearchIntent
): string {
    const patterns = buildSqlLikePatterns(term, 4, intent);
    return appendLikeBranches(query, columns, patterns, params);
}

/** Stock universal search — NAC-focused or text-focused columns based on query type. */
export function appendStockUniversalFilter(
    query: string,
    familyKeySql: string,
    term: string,
    params: unknown[],
    options: { includeSearchKey?: boolean } = {}
): string {
    const intent = classifySearchTerm(term);
    const patterns = buildSqlLikePatterns(term, 4, intent);
    const raw = String(term || '').trim();
    const fallbackPattern = raw ? `%${raw}%` : '';

    if (intent === 'nac') {
        const nacColumns: FuzzyColumn[] = [
            { expr: `sd.nac_code COLLATE ${COLLATE}` },
            { expr: `sd.base_nac_code COLLATE ${COLLATE}` },
            { expr: `${familyKeySql} COLLATE ${COLLATE}` },
        ];
        if (options.includeSearchKey) {
            nacColumns.push({ expr: `sd.search_key COLLATE ${COLLATE}` });
        }

        const nacBranches: string[] = [];
        for (const column of nacColumns) {
            for (const pattern of patterns) {
                nacBranches.push(`${column.expr} LIKE ?`);
                params.push(pattern);
            }
        }
        if (fallbackPattern) {
            nacBranches.push(`sd.item_name COLLATE ${COLLATE} LIKE ?`);
            nacBranches.push(`sd.part_numbers COLLATE ${COLLATE} LIKE ?`);
            params.push(fallbackPattern, fallbackPattern);
        }
        if (!nacBranches.length) {
            return query;
        }
        return `${query} AND (${nacBranches.join(' OR ')})`;
    }

    const textColumns: FuzzyColumn[] = [];
    if (options.includeSearchKey) {
        textColumns.push({ expr: `sd.search_key COLLATE ${COLLATE}` });
    }
    textColumns.push(
        { expr: `sd.item_name COLLATE ${COLLATE}` },
        { expr: `sd.part_numbers COLLATE ${COLLATE}` },
        { expr: `sd.applicable_equipments COLLATE ${COLLATE}` }
    );
    return appendLikeBranches(query, textColumns, patterns, params);
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
            { expr: `rd.request_number COLLATE ${COLLATE}` },
            { expr: itemNameSql },
            { expr: `rd.part_number COLLATE ${COLLATE}` },
            { expr: `rd.equipment_number COLLATE ${COLLATE}` },
            { expr: `rd.nac_code COLLATE ${COLLATE}` },
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
        clause += ` AND rd.equipment_number COLLATE ${COLLATE} LIKE ?`;
        params.push(`%${filters.equipmentNumber.trim()}%`);
    }
    if (filters.partNumber?.trim()) {
        clause = appendPartNumberFilter(clause, `rd.part_number COLLATE ${COLLATE}`, filters.partNumber.trim(), params);
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
            { expr: `rd.request_number COLLATE ${COLLATE}` },
            { expr: `rd.nac_code COLLATE ${COLLATE}` },
            { expr: `rd.item_name COLLATE ${COLLATE}` },
            { expr: `rd.part_number COLLATE ${COLLATE}` },
            { expr: `rd.equipment_number COLLATE ${COLLATE}` },
            { expr: `a.name COLLATE ${COLLATE}` },
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
    const trimmed = String(term || '').trim();
    if (!trimmed) {
        return query;
    }
    params.push(`%${trimmed}%`);
    return `${query} AND (${columnExpr} LIKE ?)`;
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
        const branch = appendRequestUniversalFilter('WHERE 1=1', `rd.item_name COLLATE ${COLLATE}`, filters.universal.trim(), params);
        next += branch.replace(/^WHERE 1=1/, '');
    }
    if (filters.equipmentNumber?.trim()) {
        next += ` AND rd.equipment_number COLLATE ${COLLATE} LIKE ?`;
        params.push(`%${filters.equipmentNumber.trim()}%`);
    }
    if (filters.partNumber?.trim()) {
        next = appendPartNumberFilter(next, `rd.part_number COLLATE ${COLLATE}`, filters.partNumber.trim(), params);
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
            { expr: `rd.nac_code COLLATE ${COLLATE}` },
            { expr: `rd.item_name COLLATE ${COLLATE}` },
            { expr: `rd.part_number COLLATE ${COLLATE}` },
            { expr: `req.request_number COLLATE ${COLLATE}` },
            { expr: `rd.tender_reference_number COLLATE ${COLLATE}` },
            { expr: `a.name COLLATE ${COLLATE}` },
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
            { expr: `rd.rrp_number COLLATE ${COLLATE}` },
            { expr: `red.item_name COLLATE ${COLLATE}` },
            { expr: `red.part_number COLLATE ${COLLATE}` },
            { expr: `red.nac_code COLLATE ${COLLATE}` },
            { expr: `rqd.request_number COLLATE ${COLLATE}` },
            { expr: `a.name COLLATE ${COLLATE}` },
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
            { expr: `rrp.rrp_number COLLATE ${COLLATE}` },
            { expr: `rd.item_name COLLATE ${COLLATE}` },
            { expr: `rd.part_number COLLATE ${COLLATE}` },
            { expr: `COALESCE(rqd.equipment_number, '') COLLATE ${COLLATE}` },
            { expr: `rd.tender_reference_number COLLATE ${COLLATE}` },
        ],
        term,
        params
    );
    return branch.replace(/^WHERE 1=1/, '');
}

/** Capital RRP print search — returns leading AND (…) fragment. */
export function buildRrpCapitalSearchFilter(term: string, params: unknown[]): string {
    const trimmed = String(term || '').trim();
    if (!trimmed) {
        return '';
    }
    const like = `%${trimmed}%`;
    const branch = appendFuzzyOrClause(
        'WHERE 1=1',
        [
            { expr: `rrp.rrp_number COLLATE ${COLLATE}` },
            { expr: `ar.model_name COLLATE ${COLLATE}` },
        ],
        term,
        params
    );
    params.push(like, like, like);
    return `${branch.replace(/^WHERE 1=1/, '')} OR (
        JSON_UNQUOTE(JSON_EXTRACT(rrp.capital_item_data, '$.equipment_name')) COLLATE ${COLLATE} LIKE ?
        OR JSON_UNQUOTE(JSON_EXTRACT(rrp.capital_item_data, '$.equipment_code')) COLLATE ${COLLATE} LIKE ?
        OR JSON_UNQUOTE(JSON_EXTRACT(rrp.capital_item_data, '$.model_number')) COLLATE ${COLLATE} LIKE ?
    )`;
}
