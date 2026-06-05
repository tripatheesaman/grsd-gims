import { Request, Response } from 'express';
import { RowDataPacket, PoolConnection } from 'mysql2/promise';
import pool from '../config/db';
import { formatDateForDB, utcToLocalDateString } from '../utils/dateUtils';
import { logEvents } from '../middlewares/logger';
import { ensureAssetSpareSchema } from '../services/assetSpareSchema';
import { fetchRRPConfigMasters } from './rrpController';
import { generateCapitalRRPExcel } from '../services/capitalRrpExcelService';
import { resolveCurrentFiscalYear } from '../services/fiscalYearService';
import { initializeAssetCostAndDepreciation } from '../services/assetDepreciationService';
import {
    normalizeRrpBaseNumber,
    isCapitalRrpNumber,
    sqlRrpBaseMatchClause,
} from '../utils/rrpNumberUtils';

interface CapitalRRPItemInput {
    asset_receive_id: number;
    asset_type_id: number;
    equipment_name: string;
    servicability_status: string;
    purchase_currency: string;
    equipment_manufacturer_name: string;
    model_number: string;
    series?: string;
    engine_number?: string;
    engine_model_number?: string;
    serial_number: string;
    transmission_model?: string;
    vin_number?: string;
    weight?: string;
    weight_unit?: string;
    size?: string;
    size_unit?: string;
    quantity: number;
    purchase_amount: number;
    equipment_code: string;
    unit: string;
    vat_status?: boolean;
}

interface CapitalRRPSubmission {
    rrp_number: string;
    rrp_date: string;
    invoice_date: string;
    invoice_number: string;
    po_number?: string;
    contract_identification_number?: string;
    po_date?: string;
    customs_date?: string;
    customs_number?: string;
    supplier: string;
    forex_rate: number;
    currency: string;
    location: string;
    vat_rate?: number;
    customs_amount_npr: number;
    transportation_other_charges: number;
    inspection_user: string;
    inspection_details?: Record<string, unknown>;
    created_by: string;
    items: CapitalRRPItemInput[];
}

/** Validates step-1 header fields (dates, supplier, inspection, import fields) before equipment selection. */
export const validateCapitalRRPStep1 = async (req: Request, res: Response): Promise<void> => {
    try {
        const masters = await fetchRRPConfigMasters();
        validateCapitalSubmission(req.body as CapitalRRPSubmission, masters.suppliers.capital || [], masters.authorities);
        res.status(200).json({ ok: true });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Validation failed';
        res.status(400).json({ error: 'Bad Request', message });
    }
};

export const getCapitalRRPConfig = async (_req: Request, res: Response): Promise<void> => {
    try {
        await ensureAssetSpareSchema();
        const [rows] = await pool.query<RowDataPacket[]>('SELECT config_name, config_value FROM app_config WHERE config_type = ?', ['rrp']);
        const rrpConfig: Record<string, any> = {};
        rows.forEach((row: any) => {
            try {
                rrpConfig[row.config_name] = JSON.parse(row.config_value);
            }
            catch {
                rrpConfig[row.config_name] = row.config_value;
            }
        });
        const [assetRows] = await pool.query<RowDataPacket[]>('SELECT config_name, config_value FROM app_config WHERE config_type = ?', ['asset']);
        const assetConfig: Record<string, any> = {};
        assetRows.forEach((row: any) => {
            try {
                assetConfig[row.config_name] = JSON.parse(row.config_value);
            }
            catch {
                assetConfig[row.config_name] = row.config_value;
            }
        });
        const masters = await fetchRRPConfigMasters();
        const capitalSuppliers = masters.suppliers.capital || [];
        res.status(200).json({
            ...rrpConfig,
            asset_settings: assetConfig,
            supplier_list: capitalSuppliers,
            supplier_list_capital: capitalSuppliers,
            currency_list: masters.currencies,
            inspection_user_details: masters.authorities,
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch capital RRP config' });
    }
};

export const getCapitalRRPItems = async (req: Request, res: Response): Promise<void> => {
    try {
        await ensureAssetSpareSchema();
        const { rrpDate } = req.query;
        let dateFilter = '';
        const params: any[] = [];
        if (typeof rrpDate === 'string' && rrpDate.trim()) {
            dateFilter = ' AND DATE(ar.receive_date) <= DATE(?)';
            params.push(formatDateForDB(utcToLocalDateString(rrpDate)));
        }
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT ar.id, ar.model_name, ar.received_quantity, ar.remaining_quantity, ar.receive_date, ar.received_by
             FROM asset_receive_details ar
             WHERE ar.approval_status = 'APPROVED'
               AND ar.remaining_quantity > 0
               AND (ar.rrp_fk IS NULL OR ar.rrp_fk = 0)
               ${dateFilter}
             ORDER BY ar.receive_date DESC`,
            params
        );
        res.status(200).json(rows);
    }
    catch {
        res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch capital RRP items' });
    }
};

async function upsertAssetProperty(
    connection: PoolConnection,
    assetId: number,
    propertyName: string,
    propertyValue: string | null
) {
    if (propertyValue === null || propertyValue === undefined || String(propertyValue).trim() === '') return;
    await connection.execute(
        `INSERT INTO asset_property_values (asset_id, property_name, property_value)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE property_value = VALUES(property_value)`,
        [assetId, propertyName, String(propertyValue).trim()]
    );
}

type StoredCapitalItemData = CapitalRRPItemInput & { location: string };

const parseStoredCapitalItem = (raw: unknown): StoredCapitalItemData | null => {
    if (raw === null || raw === undefined) return null;
    try {
        if (Buffer.isBuffer(raw)) {
            return JSON.parse(raw.toString('utf8')) as StoredCapitalItemData;
        }
        if (typeof raw === 'string') {
            const trimmed = raw.trim();
            if (!trimmed) return null;
            return JSON.parse(trimmed) as StoredCapitalItemData;
        }
        if (typeof raw === 'object') {
            return raw as StoredCapitalItemData;
        }
        return null;
    }
    catch {
        return null;
    }
};

type CapitalItemPayloadInput = CapitalRRPItemInput & { vat?: boolean };

/** Normalize request body item and persist every equipment field explicitly. */
const normalizeCapitalItemForStorage = (
    item: CapitalItemPayloadInput,
    location: string
): StoredCapitalItemData => ({
    asset_receive_id: Number(item.asset_receive_id),
    asset_type_id: Number(item.asset_type_id),
    equipment_name: String(item.equipment_name || '').trim(),
    servicability_status: String(item.servicability_status || '').trim(),
    purchase_currency: String(item.purchase_currency || 'NPR').trim(),
    equipment_manufacturer_name: String(item.equipment_manufacturer_name || '').trim(),
    model_number: String(item.model_number || '').trim(),
    series: item.series ? String(item.series).trim() : undefined,
    engine_number: item.engine_number ? String(item.engine_number).trim() : undefined,
    engine_model_number: item.engine_model_number ? String(item.engine_model_number).trim() : undefined,
    serial_number: String(item.serial_number || '').trim(),
    transmission_model: item.transmission_model ? String(item.transmission_model).trim() : undefined,
    vin_number: item.vin_number ? String(item.vin_number).trim() : undefined,
    weight: item.weight ? String(item.weight).trim() : undefined,
    weight_unit: item.weight_unit ? String(item.weight_unit).trim() : undefined,
    size: item.size ? String(item.size).trim() : undefined,
    size_unit: item.size_unit ? String(item.size_unit).trim() : undefined,
    quantity: Number(item.quantity) || 0,
    purchase_amount: Number(item.purchase_amount) || 0,
    equipment_code: String(item.equipment_code || '').trim(),
    unit: String(item.unit || 'EA').trim(),
    vat_status: Boolean(item.vat_status ?? item.vat),
    location: String(location || '').trim(),
});

const buildCapitalItemPayload = (
    item: CapitalItemPayloadInput,
    location: string
): StoredCapitalItemData => normalizeCapitalItemForStorage(item, location);

/** Legacy rows: equipment was written straight to assets before pending JSON storage. */
async function loadCapitalItemFromAsset(assetId: number): Promise<StoredCapitalItemData | null> {
    const [assetRows] = await pool.query<RowDataPacket[]>(
        `SELECT asset_type_id, name, equipment_code, location, servicability_status, purchase_currency, purchase_fx_rate, purchase_amount_base
         FROM assets WHERE id = ? LIMIT 1`,
        [assetId]
    );
    if (!assetRows.length) return null;
    const asset = assetRows[0] as RowDataPacket;
    const [propRows] = await pool.query<RowDataPacket[]>(
        `SELECT property_name, property_value FROM asset_property_values WHERE asset_id = ?`,
        [assetId]
    );
    const props: Record<string, string> = {};
    for (const row of propRows as RowDataPacket[]) {
        props[String(row.property_name)] = String(row.property_value || '');
    }
    const weightParts = (props.weight || '').split(/\s+/);
    const sizeParts = (props.size || '').split(/\s+/);
    return {
        asset_receive_id: 0,
        asset_type_id: Number(asset.asset_type_id) || 0,
        equipment_name: String(asset.name || ''),
        servicability_status: String(asset.servicability_status || ''),
        purchase_currency: String(asset.purchase_currency || 'NPR'),
        equipment_manufacturer_name: props.equipment_manufacturer_name || '',
        model_number: props.model_name || '',
        series: props.series || undefined,
        engine_number: props.engine_number || undefined,
        engine_model_number: props.engine_model_number || undefined,
        serial_number: props.serial_number || '',
        transmission_model: props.transmission_model || undefined,
        vin_number: props.vin_number || undefined,
        weight: weightParts[0] || undefined,
        weight_unit: weightParts.slice(1).join(' ') || undefined,
        size: sizeParts[0] || undefined,
        size_unit: sizeParts.slice(1).join(' ') || undefined,
        quantity: Number(props.quantity) || 1,
        purchase_amount: Number(props.purchase_amount) || Number(asset.purchase_amount_base) || 0,
        equipment_code: String(asset.equipment_code || ''),
        unit: props.unit || 'EA',
        vat_status: false,
        location: String(asset.location || ''),
    };
}

async function assertEquipmentCodeAvailable(
    connection: PoolConnection,
    equipmentCode: string,
    excludeRrpNumber?: string
): Promise<void> {
    const [dupAsset] = await connection.execute<RowDataPacket[]>(
        'SELECT id FROM assets WHERE equipment_code = ? LIMIT 1',
        [equipmentCode]
    );
    if ((dupAsset as RowDataPacket[]).length > 0) {
        throw new Error(`Equipment code ${equipmentCode} already exists`);
    }
    const pendingParams: (string | number)[] = [equipmentCode];
    let excludeSql = '';
    if (excludeRrpNumber) {
        excludeSql = ' AND rrp_number <> ?';
        pendingParams.push(excludeRrpNumber);
    }
    const [dupPending] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM rrp_details
         WHERE rrp_category = 'capital'
           AND approval_status IN ('PENDING', 'APPROVED')
           AND capital_item_data IS NOT NULL
           AND JSON_UNQUOTE(JSON_EXTRACT(capital_item_data, '$.equipment_code')) = ?${excludeSql}
         LIMIT 1`,
        pendingParams
    );
    if ((dupPending as RowDataPacket[]).length > 0) {
        throw new Error(`Equipment code ${equipmentCode} is already used on a capital RRP`);
    }
}

async function restoreCapitalReceiveReservations(
    connection: PoolConnection,
    rrpNumber: string
): Promise<void> {
    const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT id, asset_receive_fk, capital_item_data FROM rrp_details
         WHERE rrp_number = ? AND rrp_category = 'capital'`,
        [rrpNumber]
    );
    if (!rows.length) return;

    const rrpIds = (rows as RowDataPacket[]).map((r) => Number(r.id)).filter((id) => id > 0);
    if (rrpIds.length) {
        await connection.execute(
            `UPDATE asset_receive_details ar
             SET ar.rrp_fk = NULL
             WHERE ar.rrp_fk IN (${rrpIds.map(() => '?').join(',')})`,
            rrpIds
        );
    }

    const linesByReceive = new Map<number, RowDataPacket[]>();
    for (const row of rows as RowDataPacket[]) {
        const recvId = Number(row.asset_receive_fk);
        if (!recvId) continue;
        if (!linesByReceive.has(recvId)) {
            linesByReceive.set(recvId, []);
        }
        linesByReceive.get(recvId)!.push(row);
    }

    for (const [recvId, lines] of linesByReceive) {
        let qtyToRestore = 0;
        for (const line of lines) {
            const stored = parseStoredCapitalItem(line.capital_item_data);
            qtyToRestore += Number(stored?.quantity) || 0;
        }

        if (qtyToRestore > 0) {
            await connection.execute(
                `UPDATE asset_receive_details
                 SET remaining_quantity = LEAST(received_quantity, remaining_quantity + ?),
                     rrp_fk = NULL
                 WHERE id = ?`,
                [qtyToRestore, recvId]
            );
        }
        else {
            await connection.execute(
                `UPDATE asset_receive_details
                 SET remaining_quantity = received_quantity,
                     rrp_fk = NULL
                 WHERE id = ?`,
                [recvId]
            );
        }
    }

    await connection.execute(
        `UPDATE asset_receive_details ar
         INNER JOIN rrp_details r ON r.asset_receive_fk = ar.id
         SET ar.rrp_fk = NULL
         WHERE r.rrp_number = ? AND r.rrp_category = 'capital'`,
        [rrpNumber]
    );
}

/** Legacy rows may have created assets before approval; remove so GE numbers can be reused on resubmit. */
async function clearOrphanAssetsFromRejectedCapitalRrp(
    connection: PoolConnection,
    rrpNumber: string
): Promise<void> {
    const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT asset_fk FROM rrp_details
         WHERE rrp_number = ? AND rrp_category = 'capital' AND asset_fk IS NOT NULL`,
        [rrpNumber]
    );
    const assetIds = (rows as RowDataPacket[])
        .map((r) => Number(r.asset_fk))
        .filter((id) => id > 0);
    if (!assetIds.length) return;

    await connection.execute(
        `DELETE FROM asset_property_values WHERE asset_id IN (${assetIds.map(() => '?').join(',')})`,
        assetIds
    );
    await connection.execute(
        `DELETE FROM assets WHERE id IN (${assetIds.map(() => '?').join(',')})`,
        assetIds
    );
    await connection.execute(
        `UPDATE rrp_details SET asset_fk = NULL
         WHERE rrp_number = ? AND rrp_category = 'capital'`,
        [rrpNumber]
    );
}

async function createCapitalAssetFromStoredItem(
    connection: PoolConnection,
    stored: StoredCapitalItemData,
    recvModelName: string,
    fx1: number,
    rrpLineTotalNpr: number,
    receiveImagePath?: string | null
): Promise<number> {
    const qty = Number(stored.quantity) || 0;
    const purchaseAmount = Number(stored.purchase_amount) || 0;
    const equipmentCode = String(stored.equipment_code || '').trim();
    const [assetResult] = await connection.execute(
        `INSERT INTO assets (
            asset_type_id, name, equipment_code, location, rrp_status,
            servicability_status, purchase_currency, purchase_fx_rate, purchase_amount_base,
            current_value, image_path, created_by
        ) VALUES (?, ?, ?, ?, '1', ?, ?, ?, ?, ?, ?, NULL)`,
        [
            stored.asset_type_id,
            String(stored.equipment_name || recvModelName).trim(),
            equipmentCode,
            stored.location,
            stored.servicability_status,
            stored.purchase_currency,
            fx1,
            purchaseAmount * qty,
            Number(rrpLineTotalNpr) || 0,
            receiveImagePath?.trim() || null,
        ]
    );
    const assetId = (assetResult as { insertId: number }).insertId;
    await upsertAssetProperty(connection, assetId, 'unit', stored.unit);
    const propertyMap: Record<string, string | undefined> = {
        equipment_manufacturer_name: stored.equipment_manufacturer_name,
        model_name: stored.model_number || recvModelName,
        series: stored.series,
        engine_number: stored.engine_number,
        engine_model_number: stored.engine_model_number,
        serial_number: stored.serial_number,
        transmission_model: stored.transmission_model,
        vin_number: stored.vin_number,
        weight: stored.weight ? `${stored.weight} ${stored.weight_unit || ''}`.trim() : undefined,
        size: stored.size ? `${stored.size} ${stored.size_unit || ''}`.trim() : undefined,
        quantity: String(qty),
        purchase_amount: String(purchaseAmount),
    };
    for (const [prop, val] of Object.entries(propertyMap)) {
        await upsertAssetProperty(connection, assetId, prop, val ?? null);
    }
    return assetId;
}

export const CAPITAL_RRP_PREFIX = 'C';
const CAPITAL_ONLY_SQL = ` AND rrp_category = 'capital'`;

/** Compare calendar dates (YYYY-MM-DD). Returns -1, 0, or 1. */
const compareDatesOnly = (left: string | Date | null | undefined, right: string | Date | null | undefined): number => {
    const a = formatDateForDB(left);
    const b = formatDateForDB(right);
    if (!a || !b) return 0;
    return a.localeCompare(b);
};

const validateCapitalRRPDates = (submission: Pick<CapitalRRPSubmission, 'rrp_date' | 'invoice_date' | 'customs_date' | 'po_date'>): void => {
    const rrpDate = formatDateForDB(submission.rrp_date);
    const invoiceDate = formatDateForDB(submission.invoice_date);
    if (!rrpDate || !invoiceDate) {
        throw new Error('RRP date and invoice date are required');
    }
    if (compareDatesOnly(invoiceDate, rrpDate) > 0) {
        throw new Error('Invoice date cannot be greater than RRP date');
    }
    if (submission.customs_date) {
        const customsDate = formatDateForDB(submission.customs_date);
        if (customsDate && compareDatesOnly(customsDate, rrpDate) > 0) {
            throw new Error('Customs date cannot be greater than RRP date');
        }
    }
    if (submission.po_date) {
        const poDate = formatDateForDB(submission.po_date);
        if (poDate && compareDatesOnly(poDate, rrpDate) > 0) {
            throw new Error('PO date cannot be greater than RRP date');
        }
    }
};

async function resolveCapitalRrpNumber(
    connection: PoolConnection,
    inputRRPNumber: string,
    currentFY: string
): Promise<string> {
    const rrpNumber = normalizeRrpBaseNumber(inputRRPNumber);
    if (!isCapitalRrpNumber(rrpNumber)) {
        throw new Error('Invalid capital RRP number format. Must be C001');
    }
    const [existingRRP] = await connection.query<RowDataPacket[]>(
        `SELECT rrp_number, approval_status FROM rrp_details
         WHERE current_fy = ? AND ${sqlRrpBaseMatchClause('rrp_number')}${CAPITAL_ONLY_SQL}`,
        [currentFY, rrpNumber, rrpNumber]
    );
    if (existingRRP.length > 0) {
        const allRejected = existingRRP.every((r) => r.approval_status === 'REJECTED');
        if (!allRejected) {
            throw new Error('RRP number already exists in the current fiscal year');
        }
        for (const row of existingRRP) {
            await restoreCapitalReceiveReservations(connection, row.rrp_number);
            await connection.query('DELETE FROM rrp_details WHERE rrp_number = ?', [row.rrp_number]);
            logEvents(`Deleted rejected capital RRP: ${row.rrp_number}`, 'rrpLog.log');
        }
    }
    return rrpNumber;
}

async function assertCapitalRRPNumberAllowed(
    connection: PoolConnection,
    inputRRPNumber: string,
    rrpDate: string,
    currentFY: string
): Promise<void> {
    const rrpNumber = normalizeRrpBaseNumber(inputRRPNumber);
    if (!isCapitalRrpNumber(rrpNumber)) {
        throw new Error('Invalid capital RRP number format. Must be C001');
    }
    const formattedDate = formatDateForDB(rrpDate);
    if (!formattedDate) {
        throw new Error('RRP date is required');
    }
    const inputDate = new Date(formattedDate);
    const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT approval_status FROM rrp_details
         WHERE current_fy = ? AND ${sqlRrpBaseMatchClause('rrp_number')}${CAPITAL_ONLY_SQL}`,
        [currentFY, rrpNumber, rrpNumber]
    );
    const active = rows.filter((r) => r.approval_status !== 'REJECTED');
    if (active.length > 0) {
        throw new Error('Duplicate RRP number in current fiscal year');
    }
    const [prevDateRows] = await connection.query<RowDataPacket[]>(
        `SELECT date FROM rrp_details
         WHERE current_fy = ? AND approval_status <> 'REJECTED'${CAPITAL_ONLY_SQL}
         ORDER BY date DESC, id DESC LIMIT 1`,
        [currentFY]
    );
    if (prevDateRows.length > 0 && inputDate < new Date(prevDateRows[0].date)) {
        throw new Error('RRP date cannot be less than the previous capital RRP date in this fiscal year');
    }
}

function resolveInspectionUsers(
    raw: string | undefined,
    authorities: Array<{ id: number; name: string; designation: string }>
): { inspection_user: string; inspection_details: Record<string, unknown> } {
    const value = String(raw || '').trim();
    if (!value) {
        throw new Error('At least one inspection user is required');
    }
    if (/^[\d,\s]+$/.test(value)) {
        const ids = value.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
        if (!ids.length) {
            throw new Error('Invalid inspection user');
        }
        const selected = ids.map((id) => authorities.find((a) => a.id === id)).filter(Boolean) as Array<{
            id: number;
            name: string;
            designation: string;
        }>;
        if (selected.length !== ids.length) {
            throw new Error('Invalid inspection user');
        }
        const names = selected.map((a) => a.name);
        const designations = selected.map((a) => a.designation);
        return {
            inspection_user: `${names.join(' / ')},${designations.join(' / ')}`,
            inspection_details: {
                inspection_user: `${names.join(' / ')},${designations.join(' / ')}`,
                names,
                designations,
                from_manual: true,
            },
        };
    }
    const commaIdx = value.indexOf(',');
    if (commaIdx === -1) {
        throw new Error('Invalid inspection user format');
    }
    const names = value
        .substring(0, commaIdx)
        .split(' / ')
        .map((s) => s.trim())
        .filter(Boolean);
    const designations = value
        .substring(commaIdx + 1)
        .split(' / ')
        .map((s) => s.trim())
        .filter(Boolean);
    if (!names.length || names.length !== designations.length) {
        throw new Error('Invalid inspection user');
    }
    return {
        inspection_user: value,
        inspection_details: {
            inspection_user: value,
            names,
            designations,
            from_manual: true,
        },
    };
}

function validateCapitalSubmission(
    submission: CapitalRRPSubmission,
    capitalSuppliers: string[],
    authorities: Array<{ id: number; name: string; designation: string }>
): void {
    const supplier = String(submission.supplier || '').trim();
    if (!supplier) {
        throw new Error('Supplier is required');
    }
    if (!capitalSuppliers.includes(supplier)) {
        throw new Error('Supplier must be a configured Capital (RRCP) supplier');
    }
    if (!String(submission.invoice_number || '').trim()) {
        throw new Error('Invoice number is required');
    }
    if (!String(submission.location || '').trim()) {
        throw new Error('Location is required');
    }
    submission.supplier = supplier;
    const inspection = resolveInspectionUsers(submission.inspection_user, authorities);
    submission.inspection_user = inspection.inspection_user;
    submission.inspection_details = inspection.inspection_details;

    const currency = String(submission.currency || 'NPR').trim();
    const isImport = currency !== 'NPR';
    if (isImport) {
        if (!String(submission.po_number || '').trim()) {
            throw new Error('PO number is required for import purchases');
        }
        if (!String(submission.contract_identification_number || '').trim()) {
            throw new Error('Contract identification number is required for import purchases');
        }
        if (!String(submission.customs_number || '').trim()) {
            throw new Error('Customs number is required for import purchases');
        }
        if (!submission.po_date || !submission.customs_date) {
            throw new Error('PO date and customs date are required for import purchases');
        }
        const fx = Number(submission.forex_rate);
        if (!Number.isFinite(fx) || fx <= 0) {
            throw new Error('Forex rate must be greater than zero for import purchases');
        }
    } else {
        submission.forex_rate = 1;
        submission.currency = 'NPR';
    }
    validateCapitalRRPDates(submission);
}

/** Latest capital RRP number (C### sequence, capital category only). */
export const getLatestCapitalRRPDetails = async (_req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await ensureAssetSpareSchema();
        const prefix = CAPITAL_RRP_PREFIX;
        const currentFY = await resolveCurrentFiscalYear(connection);
        const [numberRows] = await connection.query<RowDataPacket[]>(
            `SELECT rrp_number, date AS rrp_date
             FROM rrp_details
             WHERE rrp_category = 'capital' AND current_fy = ? AND rrp_number LIKE ?
             AND approval_status <> 'REJECTED'
             ORDER BY CAST(SUBSTRING(rrp_number, 2, 3) AS UNSIGNED) DESC
             LIMIT 1`,
            [currentFY, `${prefix}%`]
        );
        const [dateRows] = await connection.query<RowDataPacket[]>(
            `SELECT rrp_number, date AS rrp_date
             FROM rrp_details
             WHERE rrp_category = 'capital' AND current_fy = ? AND rrp_number LIKE ?
             AND approval_status <> 'REJECTED'
             ORDER BY date DESC, id DESC
             LIMIT 1`,
            [currentFY, `${prefix}%`]
        );
        let nextRRPNumber = `${prefix}001`;
        if (numberRows.length > 0 && numberRows[0].rrp_number) {
            const basePart = normalizeRrpBaseNumber(numberRows[0].rrp_number as string);
            const numericPart = parseInt(basePart.slice(1), 10) || 0;
            nextRRPNumber = `${prefix}${(numericPart + 1).toString().padStart(3, '0')}`;
        }
        res.status(200).json({
            rrpNumber: dateRows.length > 0 ? normalizeRrpBaseNumber(dateRows[0].rrp_number) : null,
            rrpDate: dateRows.length > 0 ? dateRows[0].rrp_date : null,
            nextRRPNumber,
            fiscalYear: currentFY,
        });
    }
    catch {
        res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch latest capital RRP details' });
    }
    finally {
        connection.release();
    }
};

export const verifyCapitalRRPNumber = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        const { date } = req.query;
        const rrpNumber = normalizeRrpBaseNumber(req.params.rrpNumber || '');
        if (!isCapitalRrpNumber(rrpNumber)) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Invalid RRP number format. Must be C001',
            });
            return;
        }
        if (!date) {
            res.status(400).json({ error: 'Bad Request', message: 'RRP date is required' });
            return;
        }
        const currentFY = await resolveCurrentFiscalYear(connection);
        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT approval_status FROM rrp_details
             WHERE current_fy = ? AND ${sqlRrpBaseMatchClause('rrp_number')}${CAPITAL_ONLY_SQL}`,
            [currentFY, rrpNumber, rrpNumber]
        );
        const active = rows.filter((r) => r.approval_status !== 'REJECTED');
        if (active.length > 0) {
            res.status(400).json({ error: 'Bad Request', message: 'Duplicate RRP number in current fiscal year' });
            return;
        }
        res.status(200).json({ rrpNumber });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logEvents(`Error verifying capital RRP number ${req.params.rrpNumber}: ${errorMessage}`, 'rrpLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while verifying RRP number',
        });
    }
    finally {
        connection.release();
    }
};

export const createCapitalRRP = async (req: Request, res: Response): Promise<void> => {
    const submission: CapitalRRPSubmission = req.body;
    const inputRRPNumber = String(submission.rrp_number || '').toUpperCase();
    const connection = await pool.getConnection();
    try {
        await ensureAssetSpareSchema();
        await connection.beginTransaction();
        const masters = await fetchRRPConfigMasters();
        validateCapitalSubmission(submission, masters.suppliers.capital || [], masters.authorities);

        const currentFY = await resolveCurrentFiscalYear(connection);
        const [configRows] = await connection.query<RowDataPacket[]>(
            'SELECT config_name, config_value FROM app_config WHERE config_type = ?',
            ['rrp']
        );
        let vatRate = Number(submission.vat_rate) || 0;
        for (const row of configRows) {
            if (row.config_name === 'vat_rate') {
                const raw = String(row.config_value ?? '');
                try {
                    vatRate = Number(JSON.parse(raw)) || vatRate;
                }
                catch {
                    vatRate = Number(raw) || vatRate;
                }
            }
        }
        submission.vat_rate = vatRate;
        if (!submission.items?.length) {
            throw new Error('At least one equipment item is required');
        }
        const rrpDate = formatDateForDB(submission.rrp_date);
        const invoiceDate = formatDateForDB(submission.invoice_date);
        if (!rrpDate || !invoiceDate) {
            throw new Error('RRP date and invoice date are required');
        }
        await assertCapitalRRPNumberAllowed(connection, inputRRPNumber, submission.rrp_date, currentFY);
        const rrpNumber = await resolveCapitalRrpNumber(connection, inputRRPNumber, currentFY);
        submission.rrp_number = rrpNumber;
        const formattedPoDate = submission.po_date ? formatDateForDB(submission.po_date) : null;
        const formattedCustomsDate = submission.customs_date ? formatDateForDB(submission.customs_date) : null;
        let firstRrpId: number | null = null;
        for (const rawItem of submission.items) {
            const item = rawItem as CapitalItemPayloadInput;
            const qty = Number(item.quantity) || 0;
            if (qty <= 0) throw new Error('Item quantity must be positive');
            const [recvRows] = await connection.execute<RowDataPacket[]>(
                `SELECT id, model_name, remaining_quantity, rrp_fk FROM asset_receive_details
                 WHERE id = ? AND approval_status = 'APPROVED' FOR UPDATE`,
                [item.asset_receive_id]
            );
            if (!(recvRows as RowDataPacket[]).length) {
                throw new Error(`Asset receive line ${item.asset_receive_id} not found or not approved`);
            }
            const recv = (recvRows as RowDataPacket[])[0];
            const remaining = Number(recv.remaining_quantity);
            if (qty > remaining) {
                throw new Error(`Quantity ${qty} exceeds remaining ${remaining} for model ${recv.model_name}`);
            }
            const recvRrpFk = Number(recv.rrp_fk) || 0;
            if (firstRrpId) {
                if (recvRrpFk > 0 && recvRrpFk !== firstRrpId) {
                    throw new Error(`Asset receive line ${item.asset_receive_id} is linked to another RRP`);
                }
            }
            else if (recvRrpFk > 0) {
                throw new Error(`Asset receive line ${item.asset_receive_id} is already linked to an RRP`);
            }
            const equipmentCode = String(item.equipment_code || '').trim();
            if (!equipmentCode) throw new Error('GE Number (equipment code) is required');
            await assertEquipmentCodeAvailable(connection, equipmentCode, rrpNumber);
            const purchaseAmount = Number(item.purchase_amount) || 0;
            const fx1 = Number(submission.forex_rate) || 1;
            const linePurchase = purchaseAmount * qty;
            const vatStatus = Boolean(item.vat_status);
            const vatAmountPurchase = vatStatus ? Number((linePurchase * (vatRate / 100)).toFixed(2)) : 0;
            const nprValue = Number((linePurchase * fx1).toFixed(2));
            const vatNpr = vatStatus ? Number((nprValue * (vatRate / 100)).toFixed(2)) : 0;
            const totalAmount = Number((nprValue + vatNpr).toFixed(2));
            const capitalItemStored = buildCapitalItemPayload(item, submission.location);
            const inspectionPayload = {
                inspection_user: submission.inspection_user,
                inspection_details: submission.inspection_details || {},
            };
            const [rrpResult] = await connection.execute(
                `INSERT INTO rrp_details (
                    receive_fk, asset_receive_fk, asset_fk, rrp_number, rrp_category, supplier_name, date,
                    currency, forex_rate, item_price, customs_charge, customs_service_charge,
                    vat_percentage, invoice_number, invoice_date, po_number, po_date, contract_identification_number,
                    inspection_details, approval_status, created_by, total_amount, freight_charge,
                    customs_date, customs_number, current_fy, transportation_other_charges, vat_amount_purchase_currency,
                    capital_item_data
                ) VALUES (NULL, ?, NULL, ?, 'capital', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
                [
                    item.asset_receive_id,
                    rrpNumber,
                    submission.supplier,
                    rrpDate,
                    submission.currency,
                    submission.forex_rate,
                    purchaseAmount,
                    submission.customs_amount_npr || 0,
                    vatStatus ? vatRate : 0,
                    submission.invoice_number,
                    invoiceDate,
                    submission.po_number || null,
                    formattedPoDate,
                    submission.contract_identification_number || null,
                    JSON.stringify(inspectionPayload),
                    submission.created_by,
                    totalAmount,
                    formattedCustomsDate,
                    submission.customs_number || null,
                    currentFY,
                    submission.transportation_other_charges || 0,
                    vatAmountPurchase,
                    JSON.stringify(capitalItemStored),
                ]
            );
            const rrpId = (rrpResult as { insertId: number }).insertId;
            if (!firstRrpId) firstRrpId = rrpId;
            await connection.execute(
                `UPDATE asset_receive_details
                 SET remaining_quantity = remaining_quantity - ?, rrp_fk = COALESCE(rrp_fk, ?)
                 WHERE id = ?`,
                [qty, firstRrpId, item.asset_receive_id]
            );
            logEvents(
                `Capital RRP line ${rrpId}: GE ${capitalItemStored.equipment_code}, model ${capitalItemStored.model_number}, VIN ${capitalItemStored.vin_number || 'n/a'}`,
                'rrpLog.log'
            );
        }
        await connection.commit();
        logEvents(`Submitted capital RRP ${rrpNumber} for approval (${submission.items.length} items)`, 'rrpLog.log');
        res.status(201).json({ message: 'Capital RRP submitted for approval', rrpNumber });
    }
    catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logEvents(`Error creating capital RRP: ${errorMessage}`, 'rrpLog.log');
        res.status(400).json({ error: 'Bad Request', message: errorMessage });
    }
    finally {
        connection.release();
    }
};

const computeCapitalLineFinancials = (
    purchaseAmount: number,
    qty: number,
    vatRate: number,
    vatStatus: boolean,
    forexRate: number
) => {
    const linePurchase = purchaseAmount * qty;
    const vatAmountPurchase = vatStatus ? Number((linePurchase * (vatRate / 100)).toFixed(2)) : 0;
    const nprValue = Number((linePurchase * forexRate).toFixed(2));
    const vatNpr = vatStatus ? Number((nprValue * (vatRate / 100)).toFixed(2)) : 0;
    const totalAmount = Number((nprValue + vatNpr).toFixed(2));
    return {
        purchaseAmount,
        vatAmountPurchase,
        totalAmount,
        vatPercentage: vatStatus ? vatRate : 0,
    };
};

interface CapitalRRPUpdateItem extends CapitalRRPItemInput {
    id: number;
    vat_status?: boolean;
}

interface CapitalRRPUpdatePayload {
    rrp_number: string;
    date: string;
    supplier_name: string;
    invoice_number: string;
    invoice_date: string;
    po_number?: string;
    po_date?: string;
    contract_identification_number?: string;
    customs_date?: string;
    customs_number?: string;
    currency: string;
    forex_rate: number;
    location: string;
    inspection_user: string;
    customs_amount_npr?: number;
    transportation_other_charges?: number;
    items: CapitalRRPUpdateItem[];
}

export const getPendingCapitalRRPs = async (_req: Request, res: Response): Promise<void> => {
    try {
        await ensureAssetSpareSchema();
        const [configRows] = await pool.query<RowDataPacket[]>('SELECT config_name, config_value FROM app_config WHERE config_type = ?', ['rrp']);
        const rrpConfig: Record<string, unknown> = {};
        configRows.forEach((row: RowDataPacket) => {
            try {
                rrpConfig[row.config_name as string] = JSON.parse(String(row.config_value));
            }
            catch {
                rrpConfig[row.config_name as string] = row.config_value;
            }
        });
        const [assetRows] = await pool.query<RowDataPacket[]>('SELECT config_name, config_value FROM app_config WHERE config_type = ?', ['asset']);
        const assetConfig: Record<string, unknown> = {};
        assetRows.forEach((row: RowDataPacket) => {
            try {
                assetConfig[row.config_name as string] = JSON.parse(String(row.config_value));
            }
            catch {
                assetConfig[row.config_name as string] = row.config_value;
            }
        });
        const masters = await fetchRRPConfigMasters();
        const [assetTypes] = await pool.query<RowDataPacket[]>('SELECT id, name FROM asset_types ORDER BY name ASC');
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT rd.id, rd.rrp_number, rd.supplier_name, rd.date, rd.currency, rd.forex_rate,
                    rd.item_price, rd.customs_charge, rd.vat_percentage, rd.invoice_number, rd.invoice_date,
                    rd.po_number, rd.po_date, rd.contract_identification_number, rd.inspection_details,
                    rd.approval_status, rd.created_by, rd.total_amount, rd.customs_date, rd.customs_number,
                    rd.transportation_other_charges, rd.vat_amount_purchase_currency, rd.asset_receive_fk,
                    rd.capital_item_data,
                    ar.model_name, ar.receive_date, ar.received_by, ar.remaining_quantity
             FROM rrp_details rd
             JOIN asset_receive_details ar ON ar.id = rd.asset_receive_fk
             WHERE rd.approval_status = 'PENDING' AND rd.rrp_category = 'capital'
             ORDER BY rd.date DESC, rd.id ASC`
        );
        const pendingRRPs = await Promise.all(
            rows.map(async (row) => {
                let stored = parseStoredCapitalItem(row.capital_item_data);
                if (!stored && row.asset_fk) {
                    stored = await loadCapitalItemFromAsset(Number(row.asset_fk));
                }
                let inspectionDetails: Record<string, unknown> = {};
                try {
                    const inspRaw = row.inspection_details;
                    inspectionDetails =
                        typeof inspRaw === 'string'
                            ? JSON.parse(inspRaw || '{}')
                            : (inspRaw as Record<string, unknown>) || {};
                }
                catch {
                    inspectionDetails = {};
                }
                return {
                    ...row,
                    date: formatDateForDB(row.date),
                    invoice_date: formatDateForDB(row.invoice_date),
                    receive_date: formatDateForDB(row.receive_date),
                    customs_date: formatDateForDB(row.customs_date),
                    po_date: formatDateForDB(row.po_date),
                    inspection_details: inspectionDetails,
                    capital_item: stored,
                    equipment_code: stored?.equipment_code || '',
                    equipment_name: stored?.equipment_name || row.model_name,
                    location: stored?.location || '',
                };
            })
        );
        res.status(200).json({
            pendingRRPs,
            config: {
                ...rrpConfig,
                asset_settings: assetConfig,
                supplier_list_capital: masters.suppliers.capital || [],
                currency_list: masters.currencies,
                inspection_user_details: masters.authorities,
                asset_types: assetTypes,
            },
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch pending capital RRPs';
        res.status(500).json({ error: 'Internal Server Error', message });
    }
};

export const updateCapitalRRP = async (req: Request, res: Response): Promise<void> => {
    const rrpNumber = req.params.rrpNumber;
    const updateData = req.body as CapitalRRPUpdatePayload;
    const connection = await pool.getConnection();
    try {
        await ensureAssetSpareSchema();
        await connection.beginTransaction();
        const masters = await fetchRRPConfigMasters();
        const capitalSuppliers = masters.suppliers.capital || [];
        if (!capitalSuppliers.includes(updateData.supplier_name)) {
            throw new Error('Invalid supplier');
        }
        const inspection = resolveInspectionUsers(updateData.inspection_user, masters.authorities);
        const [existingRows] = await connection.query<RowDataPacket[]>(
            `SELECT id, asset_receive_fk, capital_item_data FROM rrp_details
             WHERE rrp_number = ? AND rrp_category = 'capital' AND approval_status = 'PENDING' FOR UPDATE`,
            [rrpNumber]
        );
        if (!existingRows.length) {
            throw new Error('Pending capital RRP not found');
        }
        if (!updateData.items?.length) {
            throw new Error('At least one equipment item is required');
        }
        const existingIds = existingRows.map((r) => Number(r.id));
        const updatedIds = updateData.items.map((i) => Number(i.id)).filter(Boolean);
        const toDelete = existingIds.filter((id) => !updatedIds.includes(id));
        for (const deleteId of toDelete) {
            const row = existingRows.find((r) => Number(r.id) === deleteId);
            if (!row) continue;
            const stored = parseStoredCapitalItem(row.capital_item_data);
            const qty = Number(stored?.quantity) || 0;
            if (row.asset_receive_fk && qty > 0) {
                await connection.execute(
                    `UPDATE asset_receive_details
                     SET remaining_quantity = remaining_quantity + ?, rrp_fk = NULL
                     WHERE id = ?`,
                    [qty, row.asset_receive_fk]
                );
            }
            await connection.execute('DELETE FROM rrp_details WHERE id = ?', [deleteId]);
        }
        let vatRate = 0;
        const [vatRows] = await connection.query<RowDataPacket[]>(
            `SELECT config_value FROM app_config WHERE config_type = 'rrp' AND config_name = 'vat_rate' LIMIT 1`
        );
        if (vatRows.length > 0) {
            try {
                vatRate = Number(JSON.parse(String(vatRows[0].config_value))) || 0;
            }
            catch {
                vatRate = Number(vatRows[0].config_value) || 0;
            }
        }
        const formattedRRPDate = formatDateForDB(updateData.date);
        const formattedInvoiceDate = formatDateForDB(updateData.invoice_date);
        const formattedPoDate = updateData.po_date ? formatDateForDB(updateData.po_date) : null;
        const formattedCustomsDate = updateData.customs_date ? formatDateForDB(updateData.customs_date) : null;
        const fx1 = Number(updateData.forex_rate) || 1;
        const customsNpr = Number(updateData.customs_amount_npr) || 0;
        const transportNpr = Number(updateData.transportation_other_charges) || 0;
        const codesInBatch = new Set<string>();

        for (const item of updateData.items) {
            const equipmentCode = String(item.equipment_code || '').trim();
            if (!equipmentCode) throw new Error('GE Number (equipment code) is required');
            if (codesInBatch.has(equipmentCode)) {
                throw new Error(`Duplicate equipment code ${equipmentCode} in RRP`);
            }
            codesInBatch.add(equipmentCode);
            await assertEquipmentCodeAvailable(connection, equipmentCode, rrpNumber);
            const qty = Number(item.quantity) || 0;
            if (qty <= 0) throw new Error('Item quantity must be positive');
            const purchaseAmount = Number(item.purchase_amount) || 0;
            const vatStatus = Boolean(item.vat_status);
            const financials = computeCapitalLineFinancials(purchaseAmount, qty, vatRate, vatStatus, fx1);
            const capitalItemStored = buildCapitalItemPayload(
                { ...item, vat_status: vatStatus },
                updateData.location
            );
            const inspectionPayload = {
                inspection_user: inspection.inspection_user,
                inspection_details: inspection.inspection_details,
            };
            await connection.execute(
                `UPDATE rrp_details SET
                    rrp_number = ?, supplier_name = ?, date = ?, currency = ?, forex_rate = ?,
                    item_price = ?, customs_charge = ?, vat_percentage = ?, invoice_number = ?, invoice_date = ?,
                    po_number = ?, po_date = ?, contract_identification_number = ?,
                    inspection_details = ?, total_amount = ?, customs_date = ?, customs_number = ?,
                    transportation_other_charges = ?, vat_amount_purchase_currency = ?,
                    capital_item_data = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ? AND rrp_category = 'capital' AND approval_status = 'PENDING'`,
                [
                    updateData.rrp_number,
                    updateData.supplier_name,
                    formattedRRPDate,
                    updateData.currency,
                    fx1,
                    purchaseAmount,
                    customsNpr,
                    financials.vatPercentage,
                    updateData.invoice_number,
                    formattedInvoiceDate,
                    updateData.po_number || null,
                    formattedPoDate,
                    updateData.contract_identification_number || null,
                    JSON.stringify(inspectionPayload),
                    financials.totalAmount,
                    formattedCustomsDate,
                    updateData.customs_number || null,
                    transportNpr,
                    financials.vatAmountPurchase,
                    JSON.stringify(capitalItemStored),
                    item.id,
                ]
            );
        }
        await connection.commit();
        logEvents(`Updated pending capital RRP ${rrpNumber}`, 'rrpLog.log');
        res.status(200).json({ message: 'Capital RRP updated successfully' });
    }
    catch (error) {
        await connection.rollback();
        const message = error instanceof Error ? error.message : 'Failed to update capital RRP';
        res.status(400).json({ error: 'Bad Request', message });
    }
    finally {
        connection.release();
    }
};

export const deleteCapitalRRPItem = async (req: Request, res: Response): Promise<void> => {
    const itemId = Number(req.params.id);
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT id, rrp_number, asset_receive_fk, capital_item_data, approval_status, rrp_category
             FROM rrp_details WHERE id = ? FOR UPDATE`,
            [itemId]
        );
        if (!rows.length || rows[0].rrp_category !== 'capital') {
            await connection.rollback();
            res.status(404).json({ error: 'Not Found', message: 'Capital RRP item not found' });
            return;
        }
        if (rows[0].approval_status !== 'PENDING') {
            await connection.rollback();
            res.status(400).json({ error: 'Bad Request', message: 'Only pending capital RRP items can be deleted' });
            return;
        }
        const [siblings] = await connection.query<RowDataPacket[]>(
            `SELECT COUNT(*) AS cnt FROM rrp_details WHERE rrp_number = ? AND rrp_category = 'capital'`,
            [rows[0].rrp_number]
        );
        if (Number((siblings as RowDataPacket[])[0]?.cnt) <= 1) {
            await connection.rollback();
            res.status(400).json({ error: 'Bad Request', message: 'Capital RRP must have at least one item' });
            return;
        }
        const stored = parseStoredCapitalItem(rows[0].capital_item_data);
        const qty = Number(stored?.quantity) || 0;
        if (rows[0].asset_receive_fk && qty > 0) {
            await connection.execute(
                `UPDATE asset_receive_details
                 SET remaining_quantity = remaining_quantity + ?, rrp_fk = NULL
                 WHERE id = ?`,
                [qty, rows[0].asset_receive_fk]
            );
        }
        await connection.execute('DELETE FROM rrp_details WHERE id = ?', [itemId]);
        await connection.commit();
        res.status(200).json({ message: 'Capital RRP item deleted successfully' });
    }
    catch (error) {
        await connection.rollback();
        const message = error instanceof Error ? error.message : 'Failed to delete item';
        res.status(500).json({ error: 'Internal Server Error', message });
    }
    finally {
        connection.release();
    }
};

export const approveCapitalRRP = async (req: Request, res: Response): Promise<void> => {
    const rrpNumber = req.params.rrpNumber;
    const { approved_by } = req.body;
    const connection = await pool.getConnection();
    try {
        await ensureAssetSpareSchema();
        await connection.beginTransaction();
        const [rrpRows] = await connection.query<RowDataPacket[]>(
            `SELECT * FROM rrp_details
             WHERE rrp_number = ? AND rrp_category = 'capital' FOR UPDATE`,
            [rrpNumber]
        );
        if (!rrpRows.length) {
            await connection.rollback();
            res.status(404).json({ error: 'Not Found', message: 'Capital RRP not found' });
            return;
        }
        if (rrpRows.some((r) => r.approval_status === 'APPROVED')) {
            await connection.rollback();
            res.status(400).json({ error: 'Bad Request', message: 'Capital RRP is already approved' });
            return;
        }
        if (rrpRows.some((r) => r.approval_status === 'REJECTED')) {
            await connection.rollback();
            res.status(400).json({ error: 'Bad Request', message: 'Capital RRP was rejected' });
            return;
        }
        const header = rrpRows[0];
        const fx1 = Number(header.forex_rate) || 1;
        const rrpDateAd = formatDateForDB(header.date ?? header.invoice_date) || null;
        for (const row of rrpRows as RowDataPacket[]) {
            if (row.asset_fk) {
                const lineTotalNpr = Number(row.total_amount) || 0;
                if (lineTotalNpr > 0) {
                    const [propRows] = await connection.execute<RowDataPacket[]>(
                        `SELECT property_value FROM asset_property_values
                         WHERE asset_id = ? AND property_name = 'purchase_year' LIMIT 1`,
                        [row.asset_fk]
                    );
                    await initializeAssetCostAndDepreciation(
                        connection,
                        Number(row.asset_fk),
                        lineTotalNpr,
                        propRows[0]?.property_value as string | undefined,
                        rrpDateAd
                    );
                }
                await connection.execute(
                    `UPDATE rrp_details SET approval_status = 'APPROVED', approved_by = ? WHERE id = ?`,
                    [approved_by, row.id]
                );
                continue;
            }
            const stored = parseStoredCapitalItem(row.capital_item_data);
            if (!stored) {
                throw new Error(`Missing equipment data for RRP line ${row.id}`);
            }
            const equipmentCode = String(stored.equipment_code || '').trim();
            await assertEquipmentCodeAvailable(connection, equipmentCode, rrpNumber);
            const [recvRows] = await connection.execute<RowDataPacket[]>(
                `SELECT model_name, image_path FROM asset_receive_details WHERE id = ?`,
                [row.asset_receive_fk]
            );
            const recvRow = (recvRows as RowDataPacket[])[0];
            const recvModel = recvRow?.model_name || '';
            const recvImagePath = recvRow?.image_path as string | undefined;
            const lineTotalNpr = Number(row.total_amount) || 0;
            const assetId = await createCapitalAssetFromStoredItem(
                connection,
                stored,
                recvModel,
                fx1,
                lineTotalNpr,
                recvImagePath
            );
            await connection.execute(
                `UPDATE rrp_details SET asset_fk = ?, approval_status = 'APPROVED', approved_by = ? WHERE id = ?`,
                [assetId, approved_by, row.id]
            );
            if (lineTotalNpr > 0) {
                const [propRows] = await connection.execute<RowDataPacket[]>(
                    `SELECT property_value FROM asset_property_values
                     WHERE asset_id = ? AND property_name = 'purchase_year' LIMIT 1`,
                    [assetId]
                );
                await initializeAssetCostAndDepreciation(
                    connection,
                    assetId,
                    lineTotalNpr,
                    propRows[0]?.property_value as string | undefined,
                    rrpDateAd
                );
            }
        }
        await connection.commit();
        logEvents(`Approved capital RRP ${rrpNumber} by ${approved_by}`, 'rrpLog.log');
        res.status(200).json({ message: 'Capital RRP approved and assets created successfully' });
    }
    catch (error) {
        await connection.rollback();
        const message = error instanceof Error ? error.message : 'Failed to approve capital RRP';
        logEvents(`Error approving capital RRP ${rrpNumber}: ${message}`, 'rrpLog.log');
        res.status(400).json({ error: 'Bad Request', message });
    }
    finally {
        connection.release();
    }
};

export const rejectCapitalRRP = async (req: Request, res: Response): Promise<void> => {
    const rrpNumber = req.params.rrpNumber;
    const { rejected_by, rejection_reason } = req.body;
    const connection = await pool.getConnection();
    try {
        await ensureAssetSpareSchema();
        await connection.beginTransaction();
        const [rrpRows] = await connection.query<RowDataPacket[]>(
            `SELECT id, approval_status, created_by FROM rrp_details
             WHERE rrp_number = ? AND rrp_category = 'capital'`,
            [rrpNumber]
        );
        if (!rrpRows.length) {
            await connection.rollback();
            res.status(404).json({ error: 'Not Found', message: 'Capital RRP not found' });
            return;
        }
        if (rrpRows.every((r) => r.approval_status === 'REJECTED')) {
            await connection.rollback();
            res.status(400).json({ error: 'Bad Request', message: 'Capital RRP is already rejected' });
            return;
        }
        if (rrpRows.some((r) => r.approval_status === 'APPROVED')) {
            await connection.rollback();
            res.status(400).json({ error: 'Bad Request', message: 'Cannot reject an approved capital RRP' });
            return;
        }
        const firstItemId = rrpRows[0].id;
        const createdBy = rrpRows[0].created_by;
        await restoreCapitalReceiveReservations(connection, rrpNumber);
        await clearOrphanAssetsFromRejectedCapitalRrp(connection, rrpNumber);
        const [result] = await connection.query(
            `UPDATE rrp_details
             SET approval_status = 'REJECTED', rejected_by = ?, rejection_reason = ?
             WHERE rrp_number = ? AND rrp_category = 'capital' AND approval_status = 'PENDING'`,
            [rejected_by, rejection_reason, rrpNumber]
        );
        if ((result as { affectedRows: number }).affectedRows === 0) {
            await connection.rollback();
            res.status(500).json({ error: 'Internal Server Error', message: 'Failed to reject capital RRP' });
            return;
        }
        const [users] = await connection.query<RowDataPacket[]>(
            'SELECT id FROM users WHERE username = ?',
            [createdBy]
        );
        if (users.length > 0) {
            await connection.query(
                `INSERT INTO notifications (user_id, reference_type, message, reference_id)
                 VALUES (?, ?, ?, ?)`,
                [
                    users[0].id,
                    'rrp',
                    `Your capital RRP ${rrpNumber} was rejected: ${rejection_reason}`,
                    firstItemId,
                ]
            );
        }
        await connection.commit();
        logEvents(`Rejected capital RRP ${rrpNumber} by ${rejected_by}`, 'rrpLog.log');
        res.status(200).json({ message: 'Capital RRP rejected successfully' });
    }
    catch (error) {
        await connection.rollback();
        const message = error instanceof Error ? error.message : 'Failed to reject capital RRP';
        res.status(500).json({ error: 'Internal Server Error', message });
    }
    finally {
        connection.release();
    }
};

export const downloadCapitalRRPExcel = async (req: Request, res: Response): Promise<void> => {
    try {
        const { rrpNumber } = req.params;
        const buffer = await generateCapitalRRPExcel(rrpNumber);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=RRCP_${rrpNumber}.xlsx`);
        res.send(buffer);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: 'Internal Server Error', message: errorMessage });
    }
};
