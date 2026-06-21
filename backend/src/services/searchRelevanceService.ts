import { parseNacCode, normalizePartNumber } from '../utils/nacCodeUtils';

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
