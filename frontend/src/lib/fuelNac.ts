const FUEL_NAC_COMPACT = new Set(['GT07986', 'GT00000']);

export const FUEL_NAC_CODES = ['GT 07986', 'GT 00000'] as const;

export const compactNacCode = (nac: string): string => String(nac || '').trim().replace(/\s+/g, '');

export const isFuelNacCode = (nac: string): boolean => {
    const trimmed = String(nac || '').trim();
    return (FUEL_NAC_CODES as readonly string[]).includes(trimmed) || FUEL_NAC_COMPACT.has(compactNacCode(nac));
};
