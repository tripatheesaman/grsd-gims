export const normalizeHeader = (value: unknown): string =>
    String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export const parseExcelDate = (value: unknown): string | null => {
    if (value == null || value === '') return null;

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const parsed = new Date(excelEpoch.getTime() + value * 86400000);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toISOString().slice(0, 10);
        }
    }

    const text = String(value).trim();
    const slashMatch = text.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (slashMatch) {
        const [, y, m, d] = slashMatch;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
    }

    return null;
};

export const parseQuantity = (value: unknown): number | null => {
    if (value == null || value === '') return null;
    const qty = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
    if (!Number.isFinite(qty) || qty <= 0) return null;
    return qty;
};

export const findColumnIndex = (headers: string[], candidates: string[]): number => {
    for (const candidate of candidates) {
        const idx = headers.findIndex(h => h.includes(candidate));
        if (idx >= 0) return idx + 1;
    }
    return -1;
};

export const formatDateField = (value: unknown): string | null => {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
};
