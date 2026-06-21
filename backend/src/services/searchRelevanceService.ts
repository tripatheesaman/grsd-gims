import { parseNacCode, normalizePartNumber } from '../utils/nacCodeUtils';

export type SearchIntent = 'nac' | 'text';

/** Classify whether the user is likely searching a NAC code vs item/part text. */
export function classifySearchTerm(term: string): SearchIntent {
    const raw = String(term || '').trim();
    if (!raw) {
        return 'text';
    }
    if (parseNacCode(raw)) {
        return 'nac';
    }
    const compact = normalizeCompact(raw);
    if (/^(gt|tw|gs)\d{3,5}[a-z]?$/i.test(compact)) {
        return 'nac';
    }
    if (/^(gt|tw|gs)\s*\d/i.test(raw)) {
        return 'nac';
    }
    if (/^\d{3,5}$/.test(compact)) {
        return 'nac';
    }
    if (/[a-z]{2,}/i.test(raw) && !/^\d/.test(raw)) {
        return 'text';
    }
    if (/\d{3,5}/.test(raw) && !/[a-z]{3,}/i.test(raw.replace(/^(gt|tw|gs)\s*/i, ''))) {
        return 'nac';
    }
    return 'text';
}

/** Extract the 5-digit (or partial) NAC number from a search term. */
export function extractNacDigitFragment(term: string): string {
    const parsed = parseNacCode(term);
    if (parsed) {
        return parsed.digits;
    }
    const digits = String(term || '').replace(/\D/g, '');
    if (digits.length >= 3 && digits.length <= 5) {
        return digits.padStart(5, '0');
    }
    return digits;
}

function addNacSqlPatterns(patterns: Set<string>, term: string, maxPatterns: number): void {
    const raw = String(term || '').trim();
    if (!raw) {
        return;
    }
    patterns.add(`%${raw}%`);

    const parsed = parseNacCode(raw);
    if (parsed) {
        patterns.add(`%${parsed.nacCode}%`);
        patterns.add(`%${parsed.nacCode.replace(/\s+/g, '')}%`);
        if (parsed.baseNacCode !== parsed.nacCode) {
            patterns.add(`%${parsed.baseNacCode}%`);
        }
        return;
    }

    const digitFragment = extractNacDigitFragment(raw);
    if (digitFragment.length >= 3) {
        patterns.add(`%${digitFragment}%`);
        for (const prefix of ['GT', 'TW', 'GS']) {
            if (patterns.size >= maxPatterns) {
                break;
            }
            patterns.add(`%${prefix} ${digitFragment}%`);
            patterns.add(`%${prefix}${digitFragment}%`);
        }
    }

    const compact = normalizeCompact(raw);
    if (compact && patterns.size < maxPatterns) {
        patterns.add(`%${compact}%`);
    }
}

/** Lowercase, strip diacritics, collapse punctuation for comparison. */
export function normalizeSearchText(input: string): string {
    return String(input || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Alphanumeric only — useful for part numbers and NAC codes. */
export function normalizeCompact(input: string): string {
    return normalizeSearchText(input).replace(/\s+/g, '');
}

export function tokenizeSearch(input: string): string[] {
    const normalized = normalizeSearchText(input);
    if (!normalized) {
        return [];
    }
    return normalized.split(' ').filter((token) => token.length > 0);
}

export function levenshteinDistance(left: string, right: string): number {
    const a = left || '';
    const b = right || '';
    if (a === b) {
        return 0;
    }
    if (!a.length) {
        return b.length;
    }
    if (!b.length) {
        return a.length;
    }

    const prev = new Array<number>(b.length + 1);
    const curr = new Array<number>(b.length + 1);
    for (let j = 0; j <= b.length; j++) {
        prev[j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(
                curr[j - 1] + 1,
                prev[j] + 1,
                prev[j - 1] + cost
            );
        }
        for (let j = 0; j <= b.length; j++) {
            prev[j] = curr[j];
        }
    }
    return prev[b.length];
}

/** Single-edit typo variants for a token (deletions + adjacent swaps). */
export function generateTypoVariants(term: string, maxVariants = 8): string[] {
    const base = normalizeCompact(term);
    if (!base || base.length < 4 || base.length > 16) {
        return base ? [base] : [];
    }

    const variants = new Set<string>([base]);
    for (let i = 0; i < base.length && variants.size < maxVariants; i++) {
        variants.add(base.slice(0, i) + base.slice(i + 1));
        if (i < base.length - 1) {
            variants.add(
                base.slice(0, i) + base[i + 1] + base[i] + base.slice(i + 2)
            );
        }
    }
    return [...variants].slice(0, maxVariants);
}

/** Few widened patterns for SQL WHERE clauses. Typo ranking happens in rankByRelevance(). */
export function buildSqlLikePatterns(
    term: string,
    maxPatterns = 4,
    intent?: SearchIntent
): string[] {
    const patterns = new Set<string>();
    const raw = String(term || '').trim();
    if (!raw) {
        return [];
    }

    const classified = intent ?? classifySearchTerm(term);
    if (classified === 'nac') {
        addNacSqlPatterns(patterns, term, maxPatterns);
        return [...patterns].slice(0, maxPatterns);
    }

    patterns.add(`%${raw}%`);
    const compact = normalizeCompact(raw);
    if (compact && compact !== raw.toLowerCase()) {
        patterns.add(`%${compact}%`);
    }
    const partNorm = normalizePartNumber(raw);
    if (partNorm && partNorm !== compact) {
        patterns.add(`%${partNorm}%`);
    }

    return [...patterns].slice(0, maxPatterns);
}

/** Build SQL LIKE patterns: exact, compact, NAC variants, token + typo wideners. */
export function buildFuzzyLikePatterns(term: string, maxPatterns = 14): string[] {
    const patterns = new Set<string>();
    const raw = String(term || '').trim();
    if (!raw) {
        return [];
    }

    const normalized = normalizeSearchText(raw);
    const compact = normalizeCompact(raw);
    if (normalized) {
        patterns.add(`%${normalized}%`);
    }
    if (compact && compact !== normalized.replace(/\s/g, '')) {
        patterns.add(`%${compact}%`);
    }

    const partNorm = normalizePartNumber(raw);
    if (partNorm && partNorm !== compact) {
        patterns.add(`%${partNorm}%`);
    }

    const parsedNac = parseNacCode(raw) ?? parseNacCode(raw.replace(/\s+/g, ' '));
    if (!parsedNac) {
        const loose = raw.replace(/\s+/g, '').toUpperCase();
        const looseMatch = loose.match(/^(GT|TW|GS)(\d{5}[A-Z]?)$/i);
        if (looseMatch) {
            patterns.add(`%${looseMatch[1]} ${looseMatch[2]}%`);
            patterns.add(`%${looseMatch[1]}${looseMatch[2]}%`);
        }
    } else {
        patterns.add(`%${parsedNac.nacCode}%`);
        patterns.add(`%${parsedNac.nacCode.replace(/\s+/g, '')}%`);
        patterns.add(`%${parsedNac.baseNacCode}%`);
    }

    for (const token of tokenizeSearch(raw)) {
        if (token.length >= 2) {
            patterns.add(`%${token}%`);
        }
        for (const variant of generateTypoVariants(token)) {
            patterns.add(`%${variant}%`);
            if (patterns.size >= maxPatterns) {
                break;
            }
        }
        if (patterns.size >= maxPatterns) {
            break;
        }
    }

    if (patterns.size < maxPatterns && normalized.length >= 4) {
        for (const variant of generateTypoVariants(normalized)) {
            patterns.add(`%${variant}%`);
            if (patterns.size >= maxPatterns) {
                break;
            }
        }
    }

    return [...patterns].slice(0, maxPatterns);
}

/** 0–100 relevance score for ranking a row against a query. */
export function scoreSearchHit(
    query: string,
    fields: Array<string | null | undefined>
): number {
    const q = normalizeSearchText(query);
    const qCompact = normalizeCompact(query);
    if (!q) {
        return 0;
    }

    let best = 0;
    const qTokens = tokenizeSearch(q);

    for (const raw of fields) {
        const text = String(raw || '');
        const f = normalizeSearchText(text);
        const fCompact = normalizeCompact(text);
        if (!f) {
            continue;
        }

        if (f === q || fCompact === qCompact) {
            best = Math.max(best, 100);
            continue;
        }
        if (f.startsWith(q) || fCompact.startsWith(qCompact)) {
            best = Math.max(best, 92);
            continue;
        }
        if (f.includes(q) || fCompact.includes(qCompact)) {
            best = Math.max(best, 78);
            continue;
        }

        const fTokens = new Set(tokenizeSearch(f));
        let matched = 0;
        for (const token of qTokens) {
            if (fTokens.has(token)) {
                matched += 1;
                continue;
            }
            for (const fieldToken of fTokens) {
                if (
                    token.length >= 4 &&
                    fieldToken.length >= 4 &&
                    levenshteinDistance(token, fieldToken) <= 1
                ) {
                    matched += 0.85;
                    break;
                }
            }
        }
        if (qTokens.length > 0) {
            best = Math.max(best, Math.round(45 + (matched / qTokens.length) * 45));
        }

        if (qCompact.length >= 4 && fCompact.length >= 4) {
            const dist = levenshteinDistance(
                qCompact,
                fCompact.slice(0, Math.min(fCompact.length, qCompact.length + 6))
            );
            const maxLen = Math.max(qCompact.length, fCompact.length);
            const similarity = 1 - dist / maxLen;
            if (similarity >= 0.72) {
                best = Math.max(best, Math.round(similarity * 88));
            }
        }
    }

    return best;
}

/** Score how well a NAC code matches a search fragment (e.g. 04552 → GT 04552). */
export function scoreNacMatch(query: string, nacCode: string | null | undefined): number {
    const nac = String(nacCode || '').trim();
    if (!nac) {
        return 0;
    }

    const qParsed = parseNacCode(query);
    const nParsed = parseNacCode(nac);
    if (qParsed && nParsed) {
        if (qParsed.nacCode === nParsed.nacCode) {
            return 100;
        }
        if (qParsed.baseNacCode === nParsed.baseNacCode) {
            return qParsed.isSubCode || nParsed.isSubCode ? 97 : 98;
        }
        if (qParsed.digits === nParsed.digits) {
            return 96;
        }
    }

    const qDigits = extractNacDigitFragment(query);
    const nDigits = nParsed?.digits || nac.replace(/\D/g, '').slice(-5).padStart(5, '0');
    if (qDigits.length >= 3 && nDigits) {
        if (nDigits === qDigits) {
            return 98;
        }
        if (nDigits.endsWith(qDigits) && qDigits.length >= 4) {
            return 94;
        }
        if (nDigits.includes(qDigits)) {
            return 88;
        }
    }

    const qCompact = normalizeCompact(query);
    const nCompact = normalizeCompact(nac);
    if (qCompact.length >= 3 && nCompact.includes(qCompact)) {
        return 85;
    }

    return 0;
}

/** Rank stock families — NAC matches first, then part/name for text queries. */
export function rankStockSearchResults<T>(
    items: T[],
    query: string,
    getFields: (item: T) => {
        nacCode?: string | null;
        itemName?: string | null;
        partNumber?: string | null;
        equipmentNumber?: string | null;
        equipmentDisplay?: string | null;
    }
): T[] {
    const trimmed = String(query || '').trim();
    if (!trimmed || items.length <= 1) {
        return items;
    }

    const intent = classifySearchTerm(trimmed);
    const scored = items.map((item) => {
        const fields = getFields(item);
        const nacScore = scoreNacMatch(trimmed, fields.nacCode);
        const textScore = scoreSearchHit(trimmed, [
            fields.itemName,
            fields.partNumber,
            fields.equipmentNumber,
            fields.equipmentDisplay,
        ]);
        const combined = intent === 'nac'
            ? Math.max(nacScore, Math.round(textScore * 0.65))
            : Math.max(textScore, Math.round(nacScore * 0.5));
        return { item, score: combined, nacScore };
    });

    scored.sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score;
        }
        if (b.nacScore !== a.nacScore) {
            return b.nacScore - a.nacScore;
        }
        return 0;
    });

    const withSignal = scored.filter((row) => row.score > 0);
    return (withSignal.length ? withSignal : scored).map((row) => row.item);
}

export function rankByRelevance<T>(
    items: T[],
    query: string,
    getFields: (item: T) => Array<string | null | undefined>
): T[] {
    const trimmed = String(query || '').trim();
    if (!trimmed || items.length <= 1) {
        return items;
    }

    const scored = items.map((item) => ({
        item,
        score: scoreSearchHit(trimmed, getFields(item)),
    }));

    scored.sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score;
        }
        return 0;
    });

    const withSignal = scored.filter((row) => row.score > 0);
    return (withSignal.length ? withSignal : scored).map((row) => row.item);
}

/** Build normalized search_key value for stock_details (stored column). */
export function buildStockSearchKey(row: {
    nac_code?: string | null;
    part_numbers?: string | null;
    item_name?: string | null;
    applicable_equipments?: string | null;
}): string {
    const nac = String(row.nac_code || '').trim();
    const part = String(row.part_numbers || '').trim();
    const item = String(row.item_name || '').split(',')[0].trim();
    const equip = String(row.applicable_equipments || '').trim();
    return normalizeSearchText(
        [nac, nac.replace(/\s+/g, ''), part, normalizePartNumber(part), item, equip]
            .filter(Boolean)
            .join(' ')
    ).slice(0, 512);
}
