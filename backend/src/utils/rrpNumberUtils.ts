/** Normalize legacy amendment suffix (L001T1 → L001). New submissions use base numbers only; FY scopes duplicates. */
export function normalizeRrpBaseNumber(rrpNumber: string): string {
    const upper = (rrpNumber || '').trim().toUpperCase();
    const legacy = upper.match(/^([LFC]\d{3})T\d+$/);
    if (legacy) {
        return legacy[1];
    }
    return upper;
}

export function isLocalOrForeignRrpNumber(rrpNumber: string): boolean {
    return /^[LF]\d{3}$/i.test(normalizeRrpBaseNumber(rrpNumber));
}

export function isCapitalRrpNumber(rrpNumber: string): boolean {
    return /^C\d{3}$/i.test(normalizeRrpBaseNumber(rrpNumber));
}

/** Display number for print templates (strip prefix and legacy T). */
export function formatRrpDisplayNumber(rrpNumber: string, prefix: 'L' | 'F' | 'C'): string {
    const base = normalizeRrpBaseNumber(rrpNumber);
    const numeric = base.startsWith(prefix) ? base.slice(1) : base.replace(/^[LFC]/i, '');
    return numeric.padStart(3, '0');
}

export function sqlRrpBaseMatchClause(column: string): string {
    return `(UPPER(${column}) = ? OR UPPER(${column}) LIKE CONCAT(?, 'T%'))`;
}
