/**
 * One-time script: merges RRCP Template Sheet from RRP Capital Purchase.xlsx into template_file.xlsx
 * Run: node scripts/mergeRrcpTemplate.js
 */
const ExcelJS = require('exceljs');
const path = require('path');

const SHEET_NAME = 'RRCP Template Sheet';

async function main() {
    const root = path.join(__dirname, '../..');
    const capitalPath = path.join(root, 'RRP Capital Purchase.xlsx');
    const templatePath = path.join(__dirname, '../public/templates/template_file.xlsx');
    const capitalWb = new ExcelJS.Workbook();
    await capitalWb.xlsx.readFile(capitalPath);
    const srcSheet = capitalWb.worksheets[0];
    srcSheet.name = SHEET_NAME;
    const destWb = new ExcelJS.Workbook();
    await destWb.xlsx.readFile(templatePath);
    const existing = destWb.getWorksheet(SHEET_NAME);
    if (existing) {
        destWb.removeWorksheet(existing.id);
    }
    const newSheet = destWb.addWorksheet(SHEET_NAME);
    srcSheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        const destRow = newSheet.getRow(rowNumber);
        destRow.height = row.height;
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const destCell = destRow.getCell(colNumber);
            destCell.value = cell.value;
            if (cell.style) destCell.style = { ...cell.style };
            if (cell.font) destCell.font = { ...cell.font };
            if (cell.alignment) destCell.alignment = { ...cell.alignment };
            if (cell.border) destCell.border = { ...cell.border };
            if (cell.fill) destCell.fill = { ...cell.fill };
            if (cell.numFmt) destCell.numFmt = cell.numFmt;
        });
    });
    srcSheet.columns.forEach((col, idx) => {
        if (col?.width) {
            newSheet.getColumn(idx + 1).width = col.width;
        }
    });
    newSheet.pageSetup = { ...srcSheet.pageSetup };
    newSheet.views = srcSheet.views;
    await destWb.xlsx.writeFile(templatePath);
    console.log(`Merged "${SHEET_NAME}" into ${templatePath}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
