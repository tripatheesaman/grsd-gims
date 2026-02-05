import ExcelJS from 'exceljs';
import { Buffer } from 'buffer';
import { renderBarChartPng } from './chartPng';
export type ChartPlacement = {
    cell: string;
    width: number;
    height: number;
};
export type DieselWeeklyChartsRequest = {
    prevWeekLabel: string;
    currentWeekLabel: string;
    prev: {
        flights: number;
        liters: number;
        cost: number;
    };
    current: {
        flights: number;
        liters: number;
        cost: number;
    };
    placements?: {
        flights: ChartPlacement;
        liters: ChartPlacement;
        cost: ChartPlacement;
        losses: ChartPlacement;
    };
    sheetName?: string;
};
export const defaultDieselWeeklyChartPlacements: Record<'flights' | 'liters' | 'cost' | 'losses', ChartPlacement> = {
    flights: { cell: 'A186', width: 500, height: 260 },
    liters: { cell: 'J186', width: 500, height: 260 },
    cost: { cell: 'A199', width: 500, height: 260 },
    losses: { cell: 'J199', width: 500, height: 260 },
};
function colLettersToNumber(letters: string): number {
    let n = 0;
    for (const ch of letters.toUpperCase()) {
        const code = ch.charCodeAt(0);
        if (code < 65 || code > 90)
            throw new Error(`Invalid column letters: ${letters}`);
        n = n * 26 + (code - 64);
    }
    return n;
}
function cellToZeroBasedAnchor(cell: string): {
    col: number;
    row: number;
} {
    const m = /^([A-Za-z]+)(\d+)$/.exec(cell.trim());
    if (!m)
        throw new Error(`Invalid cell address: ${cell}`);
    const col1 = colLettersToNumber(m[1]);
    const row1 = Number(m[2]);
    if (!Number.isFinite(row1) || row1 <= 0)
        throw new Error(`Invalid row number in cell: ${cell}`);
    return { col: col1 - 1, row: row1 - 1 };
}
export async function addPngAtCell(workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet, png: Uint8Array, placement: ChartPlacement): Promise<void> {
    type ExcelImageOptions = Parameters<ExcelJS.Workbook['addImage']>[0];
    const bufferForExcel: ExcelImageOptions['buffer'] = Buffer.from(png) as unknown as ExcelImageOptions['buffer'];
    const imageId = workbook.addImage({
        buffer: bufferForExcel,
        extension: 'png',
    });
    const tl = cellToZeroBasedAnchor(placement.cell);
    const imagePosition: Parameters<ExcelJS.Worksheet['addImage']>[1] = {
        tl: { col: tl.col, row: tl.row },
        ext: { width: placement.width, height: placement.height },
    };
    sheet.addImage(imageId, imagePosition);
}
export async function embedDieselWeeklyCharts(workbook: ExcelJS.Workbook, input: DieselWeeklyChartsRequest, sheetNameOverride?: string): Promise<void> {
    const sheet = workbook.getWorksheet(sheetNameOverride || input.sheetName || 'Diesel Weekly Template') ||
        workbook.worksheets[0];
    if (!sheet) {
        throw new Error('Worksheet not found for diesel weekly report');
    }
    let rowCostDiff = 0;
    for (let row = 150; row <= Math.min(sheet.rowCount, 250); row++) {
        const fCell = sheet.getCell(`F${row}`);
        const iCell = sheet.getCell(`I${row}`);
        const fValue = fCell.value;
        const iValue = iCell.value;
        if (fValue !== null && fValue !== undefined && typeof fValue === 'number' && fValue >= 0) {
            if (iValue !== null && iValue !== undefined &&
                (String(iValue).includes('cost') || String(iValue).includes('Cost'))) {
                rowCostDiff = row;
                break;
            }
        }
    }
    if (rowCostDiff === 0) {
        let lastEquipmentRow = 10;
        for (let row = 10; row <= Math.min(sheet.rowCount, 200); row++) {
            const cellValue = sheet.getCell(`B${row}`).value;
            if (cellValue === null || cellValue === undefined || cellValue === '') {
                const nextRowValue = sheet.getCell(`B${row + 1}`).value;
                const nextNextRowValue = sheet.getCell(`B${row + 2}`).value;
                if ((nextRowValue === null || nextRowValue === undefined || nextRowValue === '') &&
                    (nextNextRowValue === null || nextNextRowValue === undefined || nextNextRowValue === '')) {
                    lastEquipmentRow = row - 1;
                    break;
                }
            }
            else {
                lastEquipmentRow = row;
            }
        }
        const dailyTotalsCostRow = lastEquipmentRow + 2;
        const analysisBaseRow = dailyTotalsCostRow + 4;
        rowCostDiff = analysisBaseRow + 13;
    }
    const chartsStartRow = rowCostDiff + 4;
    const secondChartRow = chartsStartRow + 13;
    const placements = input.placements || {
        flights: { cell: `A${chartsStartRow}`, width: 500, height: 260 },
        liters: { cell: `J${chartsStartRow}`, width: 500, height: 260 },
        cost: { cell: `A${secondChartRow}`, width: 500, height: 260 },
        losses: { cell: `J${secondChartRow}`, width: 500, height: 280 },
    };
    const [flightsPng, litersPng, costPng, lossesPng] = await Promise.all([
        renderBarChartPng({
            title: 'Comparative Flight Handling Analysis',
            labels: [input.prevWeekLabel, input.currentWeekLabel],
            values: [Number(input.prev.flights) || 0, Number(input.current.flights) || 0],
            width: placements.flights.width,
            height: placements.flights.height,
            yAxisLabel: 'Number of Flights',
        }),
        renderBarChartPng({
            title: 'Comparative Diesel Consumption Quantity Analysis (Ltrs)',
            labels: [input.prevWeekLabel, input.currentWeekLabel],
            values: [Number(input.prev.liters) || 0, Number(input.current.liters) || 0],
            width: placements.liters.width,
            height: placements.liters.height,
            yAxisLabel: 'Ltrs',
        }),
        renderBarChartPng({
            title: 'Comparative Diesel Comsumption Cost Analysis (in NPR)',
            labels: [input.prevWeekLabel, input.currentWeekLabel],
            values: [Number(input.prev.cost) || 0, Number(input.current.cost) || 0],
            width: placements.cost.width,
            height: placements.cost.height,
            yAxisLabel: 'Cost (NPR)',
        }),
        renderBarChartPng({
            title: 'Fuel Losses Analysis',
            labels: [
                'Estimated Spillage\nwhile refueling',
                'Estimated Leakages\nin GSE',
                'Fuel Wasted\n'
            ],
            values: [0, 0, 0],
            width: placements.losses.width,
            height: placements.losses.height,
            yAxisLabel: 'Ltrs',
        }),
    ]);
    await addPngAtCell(workbook, sheet, flightsPng, placements.flights);
    await addPngAtCell(workbook, sheet, litersPng, placements.liters);
    await addPngAtCell(workbook, sheet, costPng, placements.cost);
    await addPngAtCell(workbook, sheet, lossesPng, placements.losses);
}
export async function buildDieselWeeklyExcelWithCharts(input: DieselWeeklyChartsRequest): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GIMS';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet(input.sheetName || 'Weekly Diesel (Charts)', {
        views: [{ showGridLines: true }],
    });
    sheet.columns = [
        { header: '', key: 'label', width: 36 },
        { header: input.prevWeekLabel, key: 'prev', width: 20 },
        { header: input.currentWeekLabel, key: 'curr', width: 20 },
    ];
    sheet.getCell('A1').value = 'Weekly Diesel Summary (values + PNG charts)';
    sheet.getCell('A1').font = { bold: true, size: 14 };
    sheet.getCell('A3').value = 'Metric';
    sheet.getCell('B3').value = input.prevWeekLabel;
    sheet.getCell('C3').value = input.currentWeekLabel;
    for (const addr of ['A3', 'B3', 'C3']) {
        sheet.getCell(addr).font = { bold: true };
        sheet.getCell(addr).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFEFF6FF' },
        };
    }
    sheet.getCell('A4').value = 'Total Flights';
    sheet.getCell('B4').value = Number(input.prev.flights) || 0;
    sheet.getCell('C4').value = Number(input.current.flights) || 0;
    sheet.getCell('A5').value = 'Total Diesel Issued (Liters)';
    sheet.getCell('B5').value = Number(input.prev.liters) || 0;
    sheet.getCell('C5').value = Number(input.current.liters) || 0;
    sheet.getCell('A6').value = 'Total Diesel Cost';
    sheet.getCell('B6').value = Number(input.prev.cost) || 0;
    sheet.getCell('C6').value = Number(input.current.cost) || 0;
    sheet.getCell('B6').numFmt = '#,##0.00';
    sheet.getCell('C6').numFmt = '#,##0.00';
    await embedDieselWeeklyCharts(workbook, input, sheet.name);
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer as ArrayBuffer);
}
