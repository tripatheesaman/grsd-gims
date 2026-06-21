const NAC_BASE_REGEX = /^(GT|TW|GS) (\d{5})$/i;
const NAC_WITH_SUFFIX_REGEX = /^(GT|TW|GS) (\d{5})([A-Z])$/i;

export type ParsedNacCode = {
    prefix: string;
    digits: string;
    suffix: string | null;
    baseNacCode: string;
    isSubCode: boolean;
    nacCode: string;
};

export function parseNacCode(nac: string): ParsedNacCode | null {
    const trimmed = String(nac || '').trim();
    if (!trimmed) {
        return null;
    }
    const withSuffix = trimmed.match(NAC_WITH_SUFFIX_REGEX);
    if (withSuffix) {
        const prefix = withSuffix[1].toUpperCase();
        const digits = withSuffix[2];
        const suffix = withSuffix[3];
        const baseNacCode = `${prefix} ${digits}`;
        return {
            prefix,
            digits,
            suffix,
            baseNacCode,
            isSubCode: true,
            nacCode: `${baseNacCode}${suffix}`,
        };
    }
    const base = trimmed.match(NAC_BASE_REGEX);
    if (base) {
        const prefix = base[1].toUpperCase();
        const digits = base[2];
        const baseNacCode = `${prefix} ${digits}`;
        return {
            prefix,
            digits,
            suffix: null,
            baseNacCode,
            isSubCode: false,
            nacCode: baseNacCode,
        };
    }
    return null;
}

export function buildSubNacCode(baseNacCode: string, letter: string): string {
    const parsed = parseNacCode(baseNacCode);
    if (!parsed) {
        throw new Error(`Invalid base NAC code: ${baseNacCode}`);
    }
    const letterUpper = letter.toUpperCase();
    if (!/^[A-Z]$/.test(letterUpper)) {
        throw new Error(`Invalid suffix letter: ${letter}`);
    }
    return `${parsed.baseNacCode}${letterUpper}`;
}

export function letterForIndex(index: number): string {
    if (index < 0 || index > 25) {
        throw new Error(`Part index out of range (max 26): ${index}`);
    }
    return String.fromCharCode(65 + index);
}

export function normalizePartNumber(partNumber: string): string {
    return String(partNumber || '').trim().toUpperCase();
}

export function splitPartNumbers(partNumbers: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const part of String(partNumbers || '').split(',')) {
        const normalized = normalizePartNumber(part);
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        out.push(normalized);
    }
    return out;
}

export function validateNacCodeFormat(nac: string, allowUnsuffixed = true): boolean {
    const parsed = parseNacCode(nac);
    if (!parsed) {
        return false;
    }
    if (!allowUnsuffixed && !parsed.isSubCode) {
        return false;
    }
    return true;
}

export function validateBaseNacCodeFormat(nac: string): boolean {
    const parsed = parseNacCode(nac);
    return parsed !== null && !parsed.isSubCode;
}

export const NAC_CODE_FORMAT_MESSAGE =
    'NAC code must be GT/TW/GS followed by 5 digits (e.g., GT 12345)';

export const NAC_CODE_VARIANT_FORMAT_MESSAGE =
    'NAC code must be GT/TW/GS followed by 5 digits, optionally with one letter suffix (e.g., GT 12345 or GT 12345A)';

export function normalizeNacCode(nac: string): string | null {
    return parseNacCode(nac)?.nacCode ?? null;
}

export function getNacCodeValidationError(
    nac: string,
    opts: { allowSuffix?: boolean } = { allowSuffix: true }
): string | null {
    const allowSuffix = opts.allowSuffix !== false;
    const parsed = parseNacCode(nac);
    if (!parsed) {
        return allowSuffix ? NAC_CODE_VARIANT_FORMAT_MESSAGE : NAC_CODE_FORMAT_MESSAGE;
    }
    if (!allowSuffix && parsed.isSubCode) {
        return NAC_CODE_FORMAT_MESSAGE;
    }
    return null;
}

export function stripSuffixFromNac(nac: string): string {
    const parsed = parseNacCode(nac);
    return parsed?.baseNacCode ?? String(nac || '').trim();
}

/** SQL expression: collapse sub-codes to base family key for GROUP BY / JOIN. */
export function sqlFamilyKeyExpression(alias = 'sd'): string {
    const nac = `${alias}.nac_code`;
    const base = `${alias}.base_nac_code`;
    return `COALESCE(
        NULLIF(${base}, ''),
        CASE WHEN ${nac} REGEXP '^(GT|TW|GS) [0-9]{5}[A-Z]$'
             THEN LEFT(${nac}, 8)
             ELSE ${nac}
        END
    )`;
}

/** Family key from nac_code only (tables without base_nac_code, e.g. receive_details). */
export function sqlFamilyKeyFromNacOnlyExpression(alias = 't'): string {
    const nac = `${alias}.nac_code`;
    return `CASE WHEN ${nac} REGEXP '^(GT|TW|GS) [0-9]{5}[A-Z]$'
             THEN LEFT(${nac}, 8)
             ELSE ${nac}
        END`;
}

/** Match a transaction row to an inventory family key passed as a query parameter. */
export function sqlTransactionMatchesFamilyKey(alias: string, familyKeyParam = '?'): string {
    const familyFromNac = sqlFamilyKeyFromNacOnlyExpression(alias);
    return `(
        ${alias}.nac_code COLLATE utf8mb4_unicode_ci = ${familyKeyParam} COLLATE utf8mb4_unicode_ci
        OR ${familyFromNac} COLLATE utf8mb4_unicode_ci = ${familyKeyParam} COLLATE utf8mb4_unicode_ci
        OR EXISTS (
            SELECT 1
            FROM stock_details sd_match
            WHERE sd_match.nac_code COLLATE utf8mb4_unicode_ci = ${alias}.nac_code COLLATE utf8mb4_unicode_ci
              AND (
                  sd_match.nac_code COLLATE utf8mb4_unicode_ci = ${familyKeyParam} COLLATE utf8mb4_unicode_ci
                  OR sd_match.base_nac_code COLLATE utf8mb4_unicode_ci = ${familyKeyParam} COLLATE utf8mb4_unicode_ci
                  OR ${sqlFamilyKeyExpression('sd_match')} COLLATE utf8mb4_unicode_ci = ${familyKeyParam} COLLATE utf8mb4_unicode_ci
              )
            LIMIT 1
        )
    )`;
}
