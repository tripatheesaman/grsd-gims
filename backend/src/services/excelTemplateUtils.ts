import ExcelJS from 'exceljs';

const COL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const colLetter = (col: number): string => {
    if (col <= 26) return COL_LETTERS[col - 1];
    return COL_LETTERS[Math.floor((col - 1) / 26) - 1] + COL_LETTERS[(col - 1) % 26];
};

export const parseCellRef = (ref: string): { col: number; row: number } => {
    const match = /^([A-Z]+)(\d+)$/.exec(ref.toUpperCase());
    if (!match) return { col: 1, row: 1 };
    const letters = match[1];
    let col = 0;
    for (let i = 0; i < letters.length; i++) {
        col = col * 26 + (letters.charCodeAt(i) - 64);
    }
    return { col, row: parseInt(match[2], 10) };
};

export const formatMergeRef = (top: number, left: number, bottom: number, right: number): string =>
    `${colLetter(left)}${top}:${colLetter(right)}${bottom}`;

/** Deep-clone cell visual properties from a template row. */
export const copyCellFormat = (source: ExcelJS.Cell, target: ExcelJS.Cell): void => {
    if (source.style) target.style = JSON.parse(JSON.stringify(source.style));
    if (source.font) target.font = JSON.parse(JSON.stringify(source.font));
    if (source.border) target.border = JSON.parse(JSON.stringify(source.border));
    if (source.fill) target.fill = JSON.parse(JSON.stringify(source.fill));
    if (source.alignment) target.alignment = JSON.parse(JSON.stringify(source.alignment));
    if (source.numFmt) target.numFmt = source.numFmt;
};

export const duplicateRowFormat = (
    sheet: ExcelJS.Worksheet,
    sourceRowIndex: number,
    targetRowIndex: number,
    columnCount = 20
): void => {
    const sourceRow = sheet.getRow(sourceRowIndex);
    const targetRow = sheet.getRow(targetRowIndex);
    targetRow.height = sourceRow.height;
    targetRow.hidden = sourceRow.hidden;
    targetRow.outlineLevel = sourceRow.outlineLevel;
    for (let col = 1; col <= columnCount; col++) {
        copyCellFormat(sourceRow.getCell(col), targetRow.getCell(col));
    }
};

/** Shift merge ranges at/after insertAtRow down by rowCount (1-based rows). */
export const shiftWorksheetMerges = (
    sheet: ExcelJS.Worksheet,
    insertAtRow: number,
    rowCount: number
): void => {
    const merges = sheet.model?.merges;
    if (!merges?.length || rowCount <= 0) return;

    const shifted: string[] = [];
    for (const ref of merges) {
        const [tl, br] = ref.split(':');
        if (!tl || !br) continue;
        const start = parseCellRef(tl);
        const end = parseCellRef(br);
        let top = start.row;
        let bottom = end.row;
        if (bottom >= insertAtRow) {
            if (top >= insertAtRow) top += rowCount;
            bottom += rowCount;
        }
        shifted.push(formatMergeRef(top, start.col, bottom, end.col));
    }

    try {
        for (const ref of [...merges]) {
            try {
                sheet.unMergeCells(ref);
            }
            catch {
                /* ignore cells that are not merged in the model */
            }
        }
    }
    catch {
        /* older exceljs builds may not expose unMergeCells on all ranges */
    }

    sheet.model.merges = [];
    const mergeKeys = (sheet as ExcelJS.Worksheet & { _merges?: Record<string, unknown> })._merges;
    if (mergeKeys) {
        Object.keys(mergeKeys).forEach((key) => delete mergeKeys[key]);
    }

    for (const ref of shifted) {
        try {
            sheet.mergeCells(ref);
        }
        catch {
            /* skip invalid ranges */
        }
    }
};

/** Shift image anchors at/after insertAtRow (1-based). */
export const shiftWorksheetImages = (
    sheet: ExcelJS.Worksheet,
    insertAtRow: number,
    rowCount: number
): void => {
    if (rowCount <= 0) return;
    const insertNative = insertAtRow - 1;
    const images = sheet.getImages();
    for (const image of images) {
        const range = image.range;
        if (!range?.tl || !range?.br) continue;
        if (range.tl.nativeRow >= insertNative) {
            range.tl.nativeRow += rowCount;
            range.br.nativeRow += rowCount;
        }
        else if (range.br.nativeRow >= insertNative) {
            range.br.nativeRow += rowCount;
        }
    }
};

/**
 * Insert blank data rows before a footer block while keeping borders, merges, and images.
 */
export const insertRowsBeforeFooter = (
    sheet: ExcelJS.Worksheet,
    insertAtRow: number,
    rowCount: number,
    styleSourceRow: number,
    columnCount = 20
): void => {
    if (rowCount <= 0) return;
    for (let i = 0; i < rowCount; i++) {
        sheet.spliceRows(insertAtRow, 0, []);
    }
    shiftWorksheetMerges(sheet, insertAtRow, rowCount);
    shiftWorksheetImages(sheet, insertAtRow, rowCount);
    for (let i = 0; i < rowCount; i++) {
        duplicateRowFormat(sheet, styleSourceRow, insertAtRow + i, columnCount);
    }
};

/** Copy page layout/orientation from template worksheet. */
export const applyWorksheetLayout = (target: ExcelJS.Worksheet, source: ExcelJS.Worksheet): void => {
    if (source.properties) Object.assign(target.properties, source.properties);
    if (source.views) target.views = JSON.parse(JSON.stringify(source.views || []));
    if (source.pageSetup) Object.assign(target.pageSetup, JSON.parse(JSON.stringify(source.pageSetup)));
    if (source.headerFooter) Object.assign(target.headerFooter, JSON.parse(JSON.stringify(source.headerFooter || {})));
    if (source.autoFilter) target.autoFilter = source.autoFilter;

    source.columns.forEach((col, index) => {
        if (!col) return;
        const targetCol = target.getColumn(index + 1);
        targetCol.width = col.width ?? targetCol.width;
        if (col.style) targetCol.style = JSON.parse(JSON.stringify(col.style));
        targetCol.hidden = col.hidden ?? false;
        targetCol.outlineLevel = col.outlineLevel ?? 0;
    });
};

export type WorksheetLayoutSnapshot = {
    properties?: Partial<ExcelJS.WorksheetProperties>;
    views?: ExcelJS.WorksheetView[];
    pageSetup?: Partial<ExcelJS.PageSetup>;
    headerFooter?: Partial<ExcelJS.HeaderFooter> | null;
};

export const snapshotWorksheetLayout = (sheet: ExcelJS.Worksheet): WorksheetLayoutSnapshot => ({
    properties: sheet.properties ? { ...sheet.properties } : undefined,
    views: sheet.views ? JSON.parse(JSON.stringify(sheet.views)) : undefined,
    pageSetup: sheet.pageSetup ? JSON.parse(JSON.stringify(sheet.pageSetup)) : undefined,
    headerFooter: sheet.headerFooter ? JSON.parse(JSON.stringify(sheet.headerFooter)) : null,
});

export const restoreWorksheetLayout = (sheet: ExcelJS.Worksheet, snapshot: WorksheetLayoutSnapshot): void => {
    if (snapshot.properties) Object.assign(sheet.properties, snapshot.properties);
    if (snapshot.views) sheet.views = snapshot.views;
    if (snapshot.pageSetup) Object.assign(sheet.pageSetup, snapshot.pageSetup);
    if (snapshot.headerFooter) Object.assign(sheet.headerFooter, snapshot.headerFooter);
};

/** Row inserts break shared-formula chains in ExcelJS; flatten to last calculated values before save. */
export const flattenWorksheetFormulas = (sheet: ExcelJS.Worksheet): void => {
    sheet.eachRow((row) => {
        row.eachCell({ includeEmpty: true }, (cell) => {
            const value = cell.value;
            if (!value || typeof value !== 'object') return;
            if ('formula' in value || 'sharedFormula' in value) {
                const formulaValue = value as ExcelJS.CellFormulaValue;
                cell.value = formulaValue.result ?? null;
            }
        });
    });
};
