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

export function validateNacCodeFormat(nac: string, allowSuffix = true): boolean {
    const parsed = parseNacCode(nac);
    if (!parsed) {
        return false;
    }
    if (!allowSuffix && parsed.isSubCode) {
        return false;
    }
    return true;
}

export const NAC_CODE_FORMAT_MESSAGE =
    'NAC code must be GT/TW/GS followed by 5 digits (e.g., GT 12345)';

export const NAC_CODE_VARIANT_FORMAT_MESSAGE =
    'NAC code must be GT/TW/GS followed by 5 digits, optionally with one letter suffix (e.g., GT 12345 or GT 12345A)';

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
