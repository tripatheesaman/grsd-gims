import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import ExcelJS from 'exceljs';
import { VALID_PROPERTY_NAMES } from '../types/asset';
import { initializeHistoricalImportFinancials } from './assetDepreciationService';

/** Maps spreadsheet header labels → canonical import field names. */
const HEADER_ALIASES: Record<string, string> = {
    asset_name: 'name',
    chassis_number: 'vin_number',
};

const HISTORICAL_FORMAT_MARKERS = new Set(['purchase_year', 'asset_name', 'chassis_number']);

const DEFAULT_TYPE_PROPERTIES: string[] = [
    'equipment_manufacturer_name',
    'model_name',
    'series',
    'engine_number',
    'engine_model_number',
    'serial_number',
    'transmission_model',
    'vin_number',
    'weight',
    'size',
    'quantity',
    'purchase_year',
];

export interface AssetImportFailure {
    rowNumber: number;
    equipmentCode?: string;
    errors: string[];
}

export interface AssetImportResult {
    insertedCount: number;
    failedCount: number;
    failures: AssetImportFailure[];
    format: 'historical';
}

interface ParsedImportRow {
    rowNumber: number;
    equipmentCode: string;
    assetTypeName: string;
    assetName: string;
    location: string;
    rrpStatus: string;
    servicabilityStatus: string;
    purchaseCurrency: string;
    purchaseFxRate: number;
    purchaseAmountBase: number;
    insuranceAmount2081_82: number;
    propertyValues: Record<string, string>;
}

function normalizeHeaderLabel(raw: unknown): string {
    const base = String(raw ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
    return HEADER_ALIASES[base] ?? base;
}

function asImportText(value: unknown, fallback = 'N/A'): string {
    if (value === null || value === undefined) {
        return fallback;
    }
    const text = String(value).trim();
    return text || fallback;
}

function asEquipmentCode(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value).trim();
}

function mapServicabilityStatus(raw: unknown): string {
    const token = String(raw ?? '')
        .trim()
        .toUpperCase();
    if (!token) {
        return 'N/A';
    }
    if (token === 'S') {
        return 'Serviceable';
    }
    if (token === 'US') {
        return 'Unserviceable';
    }
    return String(raw).trim();
}

function parseNumericCell(value: unknown, fallback = 0): number {
    if (value === null || value === undefined || value === '') {
        return fallback;
    }
    const num = Number(value);
    return Number.isFinite(num) && num >= 0 ? num : fallback;
}

export function detectAssetImportFormat(headers: string[]): 'standard' | 'historical' {
    const normalized = new Set(headers.map(normalizeHeaderLabel));
    for (const marker of HISTORICAL_FORMAT_MARKERS) {
        if (normalized.has(marker)) {
            return 'historical';
        }
    }
    return 'standard';
}

function buildHeaderIndex(headers: string[]): Map<string, number> {
    const headerIndex = new Map<string, number>();
    headers.forEach((raw, idx) => {
        const canonical = normalizeHeaderLabel(raw);
        if (canonical) {
            headerIndex.set(canonical, idx);
        }
    });
    return headerIndex;
}

function getCellText(row: ExcelJS.Row, headerIndex: Map<string, number>, key: string, fallback = 'N/A'): string {
    const idx = headerIndex.get(key);
    if (idx === undefined) {
        return fallback;
    }
    return asImportText(row.getCell(idx + 1).value, fallback);
}

function getCellRaw(row: ExcelJS.Row, headerIndex: Map<string, number>, key: string): unknown {
    const idx = headerIndex.get(key);
    if (idx === undefined) {
        return undefined;
    }
    return row.getCell(idx + 1).value;
}

function resolveAssetName(row: ExcelJS.Row, headerIndex: Map<string, number>): string {
    const primary = asImportText(getCellRaw(row, headerIndex, 'name'), '');
    if (primary) {
        return primary;
    }
    const legacy = asImportText(getCellRaw(row, headerIndex, 'asset_name'), '');
    return legacy || 'N/A';
}

function validateHistoricalHeaders(headerIndex: Map<string, number>): string[] {
    const missing: string[] = [];
    if (!headerIndex.has('equipment_code')) {
        missing.push('equipment_code');
    }
    if (!headerIndex.has('asset_type_name')) {
        missing.push('asset_type_name');
    }
    if (!headerIndex.has('name') && !headerIndex.has('asset_name')) {
        missing.push('name (or asset_name)');
    }
    return missing;
}

async function ensureAssetTypeForImport(
    connection: PoolConnection,
    assetTypeName: string,
    autoCreate: boolean
): Promise<number | null> {
    const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT id FROM asset_types WHERE LOWER(name) = LOWER(?) LIMIT 1`,
        [assetTypeName]
    );
    if (rows.length) {
        return Number((rows[0] as RowDataPacket).id);
    }
    if (!autoCreate) {
        return null;
    }
    const [result] = await connection.query<any>(`INSERT INTO asset_types (name, description) VALUES (?, ?)`, [
        assetTypeName,
        'Auto-created during historical equipment import',
    ]);
    const assetTypeId = Number(result.insertId);
    const propertyRows = DEFAULT_TYPE_PROPERTIES.map((propertyName, index) => [
        assetTypeId,
        propertyName,
        false,
        index,
    ]);
    await connection.query(
        `INSERT INTO asset_type_properties (asset_type_id, property_name, is_required, display_order) VALUES ?`,
        [propertyRows]
    );
    return assetTypeId;
}

function collectPropertyValues(row: ExcelJS.Row, headerIndex: Map<string, number>): Record<string, string> {
    const propertyValues: Record<string, string> = {};
    for (const propertyName of VALID_PROPERTY_NAMES) {
        if (propertyName === 'purchase_amount') {
            continue;
        }
        const cellIndex = headerIndex.get(propertyName);
        if (cellIndex === undefined) {
            continue;
        }
        const value = row.getCell(cellIndex + 1).value;
        propertyValues[propertyName] = asImportText(value);
    }
    return propertyValues;
}

function parseImportRow(
    row: ExcelJS.Row,
    rowNumber: number,
    headerIndex: Map<string, number>,
    equipmentCodeSetInFile: Set<string>
): { row?: ParsedImportRow; errors: string[] } {
    const equipmentCodeInput = asEquipmentCode(getCellRaw(row, headerIndex, 'equipment_code'));
    const assetTypeName = asImportText(getCellRaw(row, headerIndex, 'asset_type_name'), '');
    const assetName = resolveAssetName(row, headerIndex);

    if (!equipmentCodeInput && !assetTypeName && assetName === 'N/A') {
        return { errors: [] };
    }

    const errors: string[] = [];
    if (!equipmentCodeInput) {
        errors.push('equipment_code is required');
    }
    if (!assetTypeName || assetTypeName === 'N/A') {
        errors.push('asset_type_name is required');
    }
    if (equipmentCodeSetInFile.has(equipmentCodeInput)) {
        errors.push('Duplicate equipment_code in import file');
    }

    const purchaseCurrency = getCellText(row, headerIndex, 'purchase_currency', 'N/A');
    const purchaseFxRateRaw = parseNumericCell(getCellRaw(row, headerIndex, 'purchase_fx_rate'), 0);
    const purchaseFxRate = purchaseFxRateRaw > 0 ? purchaseFxRateRaw : 1;
    const purchaseAmountBase = parseNumericCell(getCellRaw(row, headerIndex, 'purchase_amount'), 0);
    const location = getCellText(row, headerIndex, 'location');
    const rawRrpStatus = asImportText(getCellRaw(row, headerIndex, 'rrp_status'), '');
    const rrpStatus = rawRrpStatus === '0' ? '0' : '1';
    const servicabilityStatus = mapServicabilityStatus(getCellRaw(row, headerIndex, 'servicability_status'));
    const insuranceAmount2081_82 = parseNumericCell(getCellRaw(row, headerIndex, 'insurance_amount'), 0);

    const propertyValues = collectPropertyValues(row, headerIndex);
    for (const propName of DEFAULT_TYPE_PROPERTIES) {
        if (!propertyValues[propName]) {
            propertyValues[propName] = 'N/A';
        }
    }
    if (propertyValues.purchase_year) {
        propertyValues.purchase_year = asImportText(propertyValues.purchase_year, 'N/A');
    }

    if (errors.length) {
        return { errors };
    }

    return {
        row: {
            rowNumber,
            equipmentCode: equipmentCodeInput,
            assetTypeName,
            assetName,
            location,
            rrpStatus,
            servicabilityStatus,
            purchaseCurrency,
            purchaseFxRate,
            purchaseAmountBase,
            insuranceAmount2081_82,
            propertyValues,
        },
        errors: [],
    };
}

export async function runAssetExcelImport(
    connection: PoolConnection,
    buffer: Buffer,
    userId?: number | null
): Promise<AssetImportResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
        throw new Error('Excel worksheet not found');
    }

    const headerRow = worksheet.getRow(1);
    const headerValues = headerRow.values as unknown[];
    const headers: string[] = [];
    for (let i = 1; i < headerValues.length; i++) {
        headers.push(headerValues[i] ? String(headerValues[i]).trim() : '');
    }
    const headerIndex = buildHeaderIndex(headers);
    const format = detectAssetImportFormat(headers);
    if (format !== 'historical') {
        throw new Error('This import handler only supports the historical equipment spreadsheet format');
    }

    const missingHeaders = validateHistoricalHeaders(headerIndex);
    if (missingHeaders.length) {
        throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`);
    }

    const failures: AssetImportFailure[] = [];
    const validRows: ParsedImportRow[] = [];
    const equipmentCodeSetInFile = new Set<string>();
    const maxRow = worksheet.actualRowCount || worksheet.rowCount;

    for (let rowNumber = 2; rowNumber <= maxRow; rowNumber++) {
        const row = worksheet.getRow(rowNumber);
        const parsed = parseImportRow(row, rowNumber, headerIndex, equipmentCodeSetInFile);
        if (!parsed.errors.length && !parsed.row) {
            continue;
        }
        if (parsed.errors.length) {
            failures.push({
                rowNumber,
                equipmentCode: asEquipmentCode(getCellRaw(row, headerIndex, 'equipment_code')) || undefined,
                errors: parsed.errors,
            });
            continue;
        }
        if (!parsed.row) {
            continue;
        }

        const assetTypeId = await ensureAssetTypeForImport(connection, parsed.row.assetTypeName, true);
        if (!assetTypeId) {
            failures.push({
                rowNumber,
                equipmentCode: parsed.row.equipmentCode,
                errors: ['Unknown asset_type_name'],
            });
            continue;
        }

        if (!parsed.row.propertyValues.purchase_amount) {
            parsed.row.propertyValues.purchase_amount = String(parsed.row.purchaseAmountBase);
        }

        validRows.push(parsed.row);
        equipmentCodeSetInFile.add(parsed.row.equipmentCode);
    }

    if (!validRows.length) {
        return { insertedCount: 0, failedCount: failures.length, failures, format };
    }

    const equipmentCodes = validRows.map((v) => v.equipmentCode);
    const [existingAssets] = await connection.query<RowDataPacket[]>(
        `SELECT equipment_code FROM assets WHERE equipment_code IN (?)`,
        [equipmentCodes]
    );
    const existingSet = new Set<string>((existingAssets as RowDataPacket[]).map((r) => String(r.equipment_code)));
    const toInsert = validRows.filter((v) => !existingSet.has(v.equipmentCode));

    for (const row of validRows) {
        if (existingSet.has(row.equipmentCode)) {
            failures.push({
                rowNumber: row.rowNumber,
                equipmentCode: row.equipmentCode,
                errors: ['equipment_code already exists in DB'],
            });
        }
    }

    if (!toInsert.length) {
        return { insertedCount: 0, failedCount: failures.length, failures, format };
    }

    const assetTypeIdsByName = new Map<string, number>();
    for (const uniqueTypeName of Array.from(new Set(toInsert.map((v) => v.assetTypeName)))) {
        const id = await ensureAssetTypeForImport(connection, uniqueTypeName, true);
        if (id) {
            assetTypeIdsByName.set(uniqueTypeName, id);
        }
    }

    const assetValues = toInsert.map((v) => [
        assetTypeIdsByName.get(v.assetTypeName) || null,
        v.assetName,
        v.equipmentCode,
        v.location,
        v.rrpStatus,
        v.servicabilityStatus,
        0,
        v.insuranceAmount2081_82,
        v.purchaseCurrency,
        v.purchaseFxRate,
        v.purchaseAmountBase,
        userId || null,
    ]);

    await connection.query(
        `INSERT INTO assets (
            asset_type_id, name, equipment_code, location, rrp_status, servicability_status,
            current_value, insurance_amount, purchase_currency, purchase_fx_rate, purchase_amount_base, created_by
        ) VALUES ?`,
        [assetValues]
    );

    const insertedEquipmentCodes = toInsert.map((v) => v.equipmentCode);
    const [insertedAssets] = await connection.query<RowDataPacket[]>(
        `SELECT id, equipment_code FROM assets WHERE equipment_code IN (?)`,
        [insertedEquipmentCodes]
    );
    const assetIdByEquipmentCode = new Map<string, number>(
        (insertedAssets as RowDataPacket[]).map((r) => [String(r.equipment_code), Number(r.id)])
    );

    const propertyValueRows: Array<[number, string, string | null]> = [];
    for (const v of toInsert) {
        const assetId = assetIdByEquipmentCode.get(v.equipmentCode);
        if (!assetId) {
            continue;
        }
        for (const [property_name, property_value] of Object.entries(v.propertyValues)) {
            propertyValueRows.push([assetId, property_name, property_value || 'N/A']);
        }
    }

    if (propertyValueRows.length) {
        await connection.query(`INSERT INTO asset_property_values (asset_id, property_name, property_value) VALUES ?`, [
            propertyValueRows,
        ]);
    }

    for (const v of toInsert) {
        const assetId = assetIdByEquipmentCode.get(v.equipmentCode);
        if (!assetId) {
            continue;
        }
        const purchaseYear = v.propertyValues.purchase_year ?? null;
        const purchaseCostNpr = v.purchaseAmountBase > 0 ? v.purchaseAmountBase * v.purchaseFxRate : 0;

        await initializeHistoricalImportFinancials(connection, assetId, {
            purchaseCostNpr,
            purchaseYear: purchaseYear === 'N/A' ? null : purchaseYear,
            insuranceAmount2081_82: v.insuranceAmount2081_82,
        });
    }

    return {
        insertedCount: toInsert.length,
        failedCount: failures.length,
        failures,
        format: 'historical',
    };
}
