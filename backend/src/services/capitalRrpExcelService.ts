import ExcelJS from 'exceljs';
import path from 'path';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2';
import { adToBs } from '../utils/dateConverter';
import { amountToWords } from '../utils/numberToWords';
import { formatDate } from '../utils/dateUtils';
import { formatRrpDisplayNumber } from '../utils/rrpNumberUtils';

const TEMPLATE_SHEET = 'RRCP Template Sheet';
const DATA_START_ROW = 8;

function splitDateParts(dateStr: string): { day: string; month: string; year: string } {
    const formatted = formatDate(dateStr) || dateStr;
    const parts = formatted.split(/[/-]/);
    if (parts.length >= 3) {
        return { day: parts[2], month: parts[1], year: parts[0] };
    }
    const d = new Date(dateStr);
    return {
        day: String(d.getDate()).padStart(2, '0'),
        month: String(d.getMonth() + 1).padStart(2, '0'),
        year: String(d.getFullYear()),
    };
}

type AuthorityDetailsRow = {
    level_1_authority_name: string;
    level_1_authority_designation: string;
    quality_check_authority_name: string;
    quality_check_authority_designation: string;
};

const parseInspectionDetailsJson = (raw: unknown): Record<string, unknown> => {
    if (raw === null || raw === undefined) return {};
    try {
        if (Buffer.isBuffer(raw)) {
            return JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
        }
        if (typeof raw === 'string') {
            const trimmed = raw.trim();
            return trimmed ? (JSON.parse(trimmed) as Record<string, unknown>) : {};
        }
        if (typeof raw === 'object') {
            return raw as Record<string, unknown>;
        }
    }
    catch {
        return {};
    }
    return {};
};

/** Format: Technically Inspected By: Name, Designation/Name2, Designation */
const formatTechnicallyInspectedByLine = (inspectionDetails: unknown): string => {
    const details = parseInspectionDetailsJson(inspectionDetails);
    const pairs: string[] = [];
    const names = details.names;
    const designations = details.designations;
    if (Array.isArray(names) && Array.isArray(designations)) {
        const nameList = names.map((n) => String(n).trim()).filter(Boolean);
        const desigList = designations.map((d) => String(d).trim());
        for (let i = 0; i < nameList.length; i++) {
            const desig = desigList[i] || '';
            pairs.push(desig ? `${nameList[i]}, ${desig}` : nameList[i]);
        }
    }
    else if (details.inspection_user) {
        const raw = String(details.inspection_user);
        const commaIdx = raw.indexOf(',');
        if (commaIdx !== -1) {
            const nameParts = raw
                .substring(0, commaIdx)
                .split(' / ')
                .map((s) => s.trim())
                .filter(Boolean);
            const desigParts = raw
                .substring(commaIdx + 1)
                .split(' / ')
                .map((s) => s.trim())
                .filter(Boolean);
            for (let i = 0; i < nameParts.length; i++) {
                const desig = desigParts[i] || '';
                pairs.push(desig ? `${nameParts[i]}, ${desig}` : nameParts[i]);
            }
        }
    }
    return pairs.length
        ? `Technically Inspected By: ${pairs.join('/')}`
        : 'Technically Inspected By:';
};

const formatProcessQcByLine = (auth: Pick<AuthorityDetailsRow, 'quality_check_authority_name' | 'quality_check_authority_designation'>): string => {
    const name = String(auth.quality_check_authority_name || '').trim();
    const designation = String(auth.quality_check_authority_designation || '').trim();
    if (!name && !designation) return 'Process QC By:';
    if (!designation) return `Process QC By: ${name}`;
    return `Process QC By: ${name}, ${designation}`;
};

const formatTakenIntoStockByLine = (auth: Pick<AuthorityDetailsRow, 'level_1_authority_name' | 'level_1_authority_designation'>): string => {
    const name = String(auth.level_1_authority_name || '').trim();
    const designation = String(auth.level_1_authority_designation || '').trim();
    if (!name && !designation) return 'Taken into Stock By:';
    if (!designation) return `Taken into Stock By: ${name}`;
    return `Taken into Stock By: ${name}, ${designation}`;
};

function replicateRowStyle(sheet: ExcelJS.Worksheet, sourceRowIndex: number, targetRowIndex: number) {
    const sourceRow = sheet.getRow(sourceRowIndex);
    const targetRow = sheet.getRow(targetRowIndex);
    targetRow.height = sourceRow.height;
    sourceRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const targetCell = targetRow.getCell(colNumber);
        if (cell.style) targetCell.style = { ...cell.style };
        if (cell.font) targetCell.font = { ...cell.font };
        if (cell.alignment) targetCell.alignment = { ...cell.alignment };
        if (cell.border) targetCell.border = { ...cell.border };
        if (cell.fill) targetCell.fill = { ...cell.fill };
        if (cell.numFmt) targetCell.numFmt = cell.numFmt;
    });
}

export async function generateCapitalRRPExcel(rrpNumber: string): Promise<ExcelJS.Buffer> {
    const [headerRows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM rrp_details WHERE rrp_number = ? AND rrp_category = 'capital' ORDER BY id ASC LIMIT 1`,
        [rrpNumber]
    );
    if (!headerRows.length) {
        throw new Error(`Capital RRP ${rrpNumber} not found`);
    }
    const header = headerRows[0] as any;
    const [itemRows] = await pool.query<RowDataPacket[]>(
        `SELECT r.*, a.name AS asset_name, a.equipment_code,
                ar.model_name AS receive_model_name
         FROM rrp_details r
         LEFT JOIN assets a ON a.id = r.asset_fk
         LEFT JOIN asset_receive_details ar ON ar.id = r.asset_receive_fk
         WHERE r.rrp_number = ? AND r.rrp_category = 'capital'
         ORDER BY r.id ASC`,
        [rrpNumber]
    );
    const propertyNames = [
        'equipment_manufacturer_name', 'model_name', 'serial_number', 'series',
        'engine_number', 'engine_model_number', 'transmission_model', 'vin_number',
        'weight', 'size', 'quantity', 'purchase_amount', 'unit',
    ];
    const parseStoredCapitalItem = (raw: unknown): Record<string, string> => {
        if (raw === null || raw === undefined) return {};
        try {
            let data: Record<string, unknown>;
            if (Buffer.isBuffer(raw)) {
                data = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
            }
            else if (typeof raw === 'string') {
                const trimmed = raw.trim();
                data = trimmed ? (JSON.parse(trimmed) as Record<string, unknown>) : {};
            }
            else if (typeof raw === 'object') {
                data = raw as Record<string, unknown>;
            }
            else {
                return {};
            }
            return {
                equipment_name: String(data.equipment_name || ''),
                equipment_code: String(data.equipment_code || ''),
                equipment_manufacturer_name: String(data.equipment_manufacturer_name || ''),
                model_name: String(data.model_number || data.model_name || ''),
                serial_number: String(data.serial_number || '').trim(),
                series: String(data.series || ''),
                engine_number: String(data.engine_number || ''),
                engine_model_number: String(data.engine_model_number || ''),
                transmission_model: String(data.transmission_model || ''),
                vin_number: String(data.vin_number || ''),
                weight: data.weight ? `${data.weight} ${data.weight_unit || ''}`.trim() : '',
                size: data.size ? `${data.size} ${data.size_unit || ''}`.trim() : '',
                quantity: String(data.quantity || 1),
                purchase_amount: String(data.purchase_amount || ''),
                unit: String(data.unit || 'EA'),
            };
        }
        catch {
            return {};
        }
    };
    const assetIds = itemRows.map((r: any) => r.asset_fk).filter(Boolean);
    const propertyMap = new Map<number, Record<string, string>>();
    if (assetIds.length) {
        const [propRows] = await pool.query<RowDataPacket[]>(
            `SELECT asset_id, property_name, property_value FROM asset_property_values
             WHERE asset_id IN (?) AND property_name IN (?)`,
            [assetIds, propertyNames]
        );
        for (const row of propRows as any[]) {
            if (!propertyMap.has(row.asset_id)) propertyMap.set(row.asset_id, {});
            propertyMap.get(row.asset_id)![row.property_name] = row.property_value || '';
        }
    }
    const templatePath = path.join(__dirname, '../../public/templates/template_file.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    let sheet = workbook.getWorksheet(TEMPLATE_SHEET);
    if (!sheet) {
        throw new Error(`Template worksheet '${TEMPLATE_SHEET}' not found. Add it from RRP Capital Purchase.xlsx.`);
    }
    const itemCount = itemRows.length;
    if (itemCount > 1) {
        for (let i = 1; i < itemCount; i++) {
            sheet.spliceRows(DATA_START_ROW + 1, 0, []);
            replicateRowStyle(sheet, DATA_START_ROW, DATA_START_ROW + 1);
        }
    }
    const rrpNumDisplay = formatRrpDisplayNumber(rrpNumber, 'C');
    sheet.getCell('I1').value = `F/Y: ${header.current_fy || ''}`;
    sheet.getCell('I2').value = `RRCP No: ${rrpNumDisplay}`;
    sheet.getCell('A6').value = `Received from: M/S ${header.supplier_name || ''}`;
    const nepaliDate = adToBs(formatDate(header.date) || String(header.date));
    const nepParts = splitDateParts(nepaliDate);
    const enParts = splitDateParts(header.date);
    sheet.getCell('H5').value = nepParts.day;
    sheet.getCell('I5').value = nepParts.month;
    sheet.getCell('J5').value = nepParts.year;
    sheet.getCell('H6').value = enParts.day;
    sheet.getCell('I6').value = enParts.month;
    sheet.getCell('J6').value = enParts.year;
    sheet.getCell('F7').value = `Item Value (${header.currency || 'NPR'})`;
    const fx1 = Number(header.forex_rate) || 1;
    let totalPurchase = 0;
    let totalNpr = 0;
    for (let i = 0; i < itemCount; i++) {
        const rowIndex = DATA_START_ROW + i;
        const item = itemRows[i] as any;
        const storedItem = parseStoredCapitalItem(item.capital_item_data);
        const assetProps = item.asset_fk ? (propertyMap.get(item.asset_fk) || {}) : {};
        const props = { ...assetProps, ...storedItem };
        const qty = Number(props.quantity || 1);
        const unitPrice = Number(item.item_price) || Number(props.purchase_amount) || 0;
        const linePurchase = Number((unitPrice * qty).toFixed(2));
        const lineNpr = Number((linePurchase * fx1).toFixed(2));
        totalPurchase += linePurchase;
        totalNpr += lineNpr;
        const manufacturer = props.equipment_manufacturer_name || '';
        const equipmentName = item.asset_name || props.equipment_name || item.receive_model_name || '';
        const serial = String(props.serial_number || storedItem.serial_number || '').trim();
        const modelNum = props.model_name || storedItem.model_name || item.receive_model_name || '';
        const unit = String(props.unit || 'EA').toUpperCase();
        sheet.getCell(`A${rowIndex}`).value = serial;
        sheet.getCell(`B${rowIndex}`).value = `${manufacturer} - ${equipmentName}`.replace(/^ - | - $/g, '').trim();
        sheet.getCell(`C${rowIndex}`).value = `${serial} - ${modelNum}`.replace(/^ - | - $/g, '').trim();
        sheet.getCell(`D${rowIndex}`).value = unit;
        sheet.getCell(`E${rowIndex}`).value = qty;
        sheet.getCell(`F${rowIndex}`).value = linePurchase;
        sheet.getCell(`G${rowIndex}`).value = lineNpr;
        sheet.getCell(`H${rowIndex}`).value = item.equipment_code || props.equipment_code || '';
    }
    const dataEndRow = DATA_START_ROW + itemCount - 1;
    const totalItemRow = dataEndRow + 1;
    const vatRow = dataEndRow + 2;
    const sumRow = dataEndRow + 3;
    const vatPurchase = (itemRows as any[]).reduce(
        (sum, row) => sum + (Number(row.vat_amount_purchase_currency) || 0),
        0
    );
    const sumPurchase = Number((totalPurchase + vatPurchase).toFixed(2));
    sheet.getCell(`F${totalItemRow}`).value = Number(totalPurchase.toFixed(2));
    sheet.getCell(`F${vatRow}`).value = Number(vatPurchase.toFixed(2));
    sheet.getCell(`F${sumRow}`).value = sumPurchase;
    const customsRow = sumRow + 5;
    const invoiceRow = customsRow + 2;
    const cinRow = invoiceRow + 1;
    const poRow = cinRow + 1;
    const forexRow = poRow + 4;
    const nprItemRow = customsRow - 1;
    const transportRow = nprItemRow + 3;
    const grandTotalRow = transportRow + 3;
    const wordsRow = transportRow + 4;
    const totalVatNpr = Number((vatPurchase * fx1).toFixed(2));
    const customsNpr = Number(header.customs_charge) || 0;
    const transportNpr = Number(header.transportation_other_charges) || 0;
    const grandTotal = Number((totalNpr + totalVatNpr + customsNpr + transportNpr).toFixed(2));
    sheet.getCell(`I${nprItemRow}`).value = Number(totalNpr.toFixed(2));
    sheet.getCell(`I${nprItemRow + 1}`).value = totalVatNpr;
    sheet.getCell(`I${nprItemRow + 2}`).value = customsNpr;
    sheet.getCell(`I${transportRow}`).value = transportNpr;
    sheet.getCell(`A${customsRow}`).value = header.customs_number || '';
    sheet.getCell(`C${customsRow}`).value = header.customs_date ? formatDate(header.customs_date) : '';
    sheet.getCell(`A${invoiceRow}`).value = header.invoice_number || '';
    sheet.getCell(`C${invoiceRow}`).value = header.invoice_date ? formatDate(header.invoice_date) : '';
    sheet.getCell(`C${cinRow}`).value = header.contract_identification_number || '';
    sheet.getCell(`C${poRow}`).value = header.po_number || '';
    sheet.getCell(`A${forexRow}`).value = header.currency || '';
    sheet.getCell(`C${forexRow}`).value = fx1;

    const [authorityRows] = await pool.query<RowDataPacket[]>(
        `SELECT level_1_authority_name, level_1_authority_designation,
                quality_check_authority_name, quality_check_authority_designation
         FROM authority_details
         WHERE authority_type = ?
         ORDER BY id DESC
         LIMIT 1`,
        ['rrp']
    );
    const authority = (authorityRows[0] || {}) as AuthorityDetailsRow;
    const inspectedRow = forexRow + 2;
    const qcRow = inspectedRow + 1;
    const stockRow = qcRow + 1;
    sheet.getCell(`A${inspectedRow}`).value = formatTechnicallyInspectedByLine(header.inspection_details);
    sheet.getCell(`A${qcRow}`).value = formatProcessQcByLine(authority);
    sheet.getCell(`A${stockRow}`).value = formatTakenIntoStockByLine(authority);

    sheet.getCell(`G${grandTotalRow}`).value = `Grand Total (NPR): ${grandTotal}`;
    sheet.getCell(`G${wordsRow}`).value = `Grand Total in Words: ${amountToWords(grandTotal)}`;
    const sheetsToDelete = workbook.worksheets.filter((ws) => ws.name !== TEMPLATE_SHEET);
    sheetsToDelete.forEach((ws) => workbook.removeWorksheet(ws.id));
    return workbook.xlsx.writeBuffer();
}
