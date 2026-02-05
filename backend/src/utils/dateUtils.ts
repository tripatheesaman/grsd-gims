export const formatDate = (date: string | Date | null | undefined): string | null => {
    if (!date)
        return null;
    const dateStr = date instanceof Date ? date.toISOString() : date;
    return dateStr.split('T')[0].replace(/-/g, '/');
};
export const formatDateForDB = (date: string | Date | null | undefined): string | null => {
    if (!date)
        return null;
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return date;
    }
    if (typeof date === 'string' && date.includes('T')) {
        const datePart = date.split('T')[0];
        if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
            return datePart;
        }
    }
    let dateObj: Date;
    if (date instanceof Date) {
        dateObj = date;
    }
    else {
        dateObj = new Date(date);
    }
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
export const utcToLocalDateString = (date: string | Date | null | undefined): string | null => {
    if (!date)
        return null;
    const d = typeof date === 'string' ? new Date(date) : date;
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
