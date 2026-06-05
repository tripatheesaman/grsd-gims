import { PoolConnection, RowDataPacket } from 'mysql2/promise';

import {

    FISCAL_YEAR_LABEL_REGEX,

    fiscalYearFromAdDate,

    getCurrentFiscalYearFromToday,

    resolveCurrentFiscalYear,

} from './fiscalYearService';

import { logEvents } from '../middlewares/logger';



/** 20% of original purchase cost (NPR) per elapsed fiscal year (straight-line). */

export const ANNUAL_DEPRECIATION_RATE = 0.2;

/** 10% of original insurance base (FCY purchase × FX rate) per elapsed fiscal year. */

export const INSURANCE_ANNUAL_DEPRECIATION_RATE = 0.1;

export const MIN_ASSET_BOOK_VALUE_NPR = 0.1;

export const MIN_INSURANCE_BOOK_VALUE_NPR = 0.1;

/** Insurance book value in historical imports is anchored to this FY. */
export const HISTORICAL_INSURANCE_BASELINE_FY = '2081/82';



export interface AssetDepreciationRow {

    id: number;

    current_value?: number | null;

    insurance_amount?: number | null;

    original_purchase_cost_npr?: number | null;

    original_insurance_amount_npr?: number | null;

    purchase_fy?: string | null;

    last_depreciation_fy?: string | null;

    insurance_baseline_fy?: string | null;

    purchase_currency?: string | null;

    purchase_fx_rate?: number | null;

    purchase_amount_base?: number | null;

    rrp_total_npr?: number | null;

    created_at?: string | Date | null;

    purchase_year?: string | null;

}



export interface AssetFinancialMeta {

    original_purchase_cost_npr: number;

    original_insurance_amount_npr: number;

    purchase_fy: string;

    insurance_baseline_fy?: string | null;

    current_fy: string;

    elapsed_fiscal_years: number;

    book_value_npr: number;

    annual_depreciation_npr: number;

    insurance_book_value_npr: number;

    annual_insurance_depreciation_npr: number;

}



/** @deprecated Use AssetFinancialMeta */

export type AssetDepreciationMeta = AssetFinancialMeta;



export function fiscalYearStartYear(label: string): number {

    if (!FISCAL_YEAR_LABEL_REGEX.test(label)) {

        throw new Error(`Invalid fiscal year label: ${label}`);

    }

    return parseInt(label.split('/')[0], 10);

}



const AD_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;



/** AD calendar year → Nepali FY via mid-year date (aligns with Shrawan FY start). */

export function fiscalYearFromPurchaseAdYear(adYear: number): string {

    if (!Number.isFinite(adYear) || adYear < 1900 || adYear > 2100) {

        throw new Error(`Invalid purchase AD year: ${adYear}`);

    }

    return fiscalYearFromAdDate(`${adYear}-07-01`);

}



export function countElapsedFiscalYears(purchaseFy: string, currentFy: string): number {

    return Math.max(0, fiscalYearStartYear(currentFy) - fiscalYearStartYear(purchaseFy));

}



export function roundAssetCurrency(value: number): number {

    return Math.round(value * 100) / 100;

}



export function calculateDepreciatedBookValue(

    originalCostNpr: number,

    elapsedFiscalYears: number,

    annualRate: number = ANNUAL_DEPRECIATION_RATE,

    minValue: number = MIN_ASSET_BOOK_VALUE_NPR

): number {

    if (!Number.isFinite(originalCostNpr) || originalCostNpr <= 0) {

        return minValue;

    }

    const remaining = originalCostNpr * (1 - annualRate * elapsedFiscalYears);

    return roundAssetCurrency(Math.max(minValue, remaining));

}



export function parsePurchaseAdYear(raw: string | null | undefined): number | null {

    const trimmed = String(raw ?? '').trim();

    if (!trimmed || FISCAL_YEAR_LABEL_REGEX.test(trimmed) || AD_DATE_REGEX.test(trimmed)) {

        return null;

    }

    const year = parseInt(trimmed, 10);

    if (!Number.isFinite(year) || year < 1900 || year > 2100) {

        return null;

    }

    return year;

}



/** Resolve purchase FY from purchase_year (AD), stored purchase_fy, or created_at. */

export function resolvePurchaseFyForAsset(asset: AssetDepreciationRow): string {

    const rawPurchaseYear = String(asset.purchase_year ?? '').trim();

    if (rawPurchaseYear) {

        if (FISCAL_YEAR_LABEL_REGEX.test(rawPurchaseYear)) {

            return rawPurchaseYear;

        }

        if (AD_DATE_REGEX.test(rawPurchaseYear)) {

            return fiscalYearFromAdDate(rawPurchaseYear);

        }

        const adYear = parsePurchaseAdYear(rawPurchaseYear);

        if (adYear != null) {

            return fiscalYearFromPurchaseAdYear(adYear);

        }

    }

    if (asset.purchase_fy && FISCAL_YEAR_LABEL_REGEX.test(asset.purchase_fy)) {

        return asset.purchase_fy;

    }

    if (asset.created_at) {

        const ad =

            asset.created_at instanceof Date

                ? asset.created_at.toISOString().slice(0, 10)

                : String(asset.created_at).slice(0, 10);

        if (ad) {

            return fiscalYearFromAdDate(ad);

        }

    }

    return getCurrentFiscalYearFromToday();

}



export function resolveOriginalPurchaseCostNpr(asset: AssetDepreciationRow): number {

    const stored = Number(asset.original_purchase_cost_npr);

    if (Number.isFinite(stored) && stored > 0) {

        return stored;

    }

    const rrpTotal = Number(asset.rrp_total_npr);

    if (Number.isFinite(rrpTotal) && rrpTotal > 0) {

        return rrpTotal;

    }

    const base = Number(asset.purchase_amount_base);

    const fx = Number(asset.purchase_fx_rate);

    if (Number.isFinite(base) && Number.isFinite(fx) && base > 0 && fx > 0) {

        return roundAssetCurrency(base * fx);

    }

    const current = Number(asset.current_value);

    if (Number.isFinite(current) && current > 0) {

        return current;

    }

    return 0;

}



/** Insurance baseline: foreign-currency purchase amount × purchase FX rate (NPR). */

export function resolveOriginalInsuranceAmountNpr(asset: AssetDepreciationRow): number {

    const stored = Number(asset.original_insurance_amount_npr);

    if (Number.isFinite(stored) && stored > 0) {

        return stored;

    }

    const base = Number(asset.purchase_amount_base);

    const fx = Number(asset.purchase_fx_rate);

    if (Number.isFinite(base) && Number.isFinite(fx) && base > 0 && fx > 0) {

        return roundAssetCurrency(base * fx);

    }

    const insurance = Number(asset.insurance_amount);

    if (Number.isFinite(insurance) && insurance > 0) {

        return insurance;

    }

    return 0;

}



export function computeAssetFinancials(

    asset: AssetDepreciationRow,

    currentFy: string = getCurrentFiscalYearFromToday()

): AssetFinancialMeta {

    const original = resolveOriginalPurchaseCostNpr(asset);

    const originalInsurance = resolveOriginalInsuranceAmountNpr(asset);

    const purchaseFy = resolvePurchaseFyForAsset(asset);

    const elapsed = countElapsedFiscalYears(purchaseFy, currentFy);

    const insuranceBaselineFy =

        asset.insurance_baseline_fy && FISCAL_YEAR_LABEL_REGEX.test(asset.insurance_baseline_fy)

            ? asset.insurance_baseline_fy

            : purchaseFy;

    const insuranceElapsed = countElapsedFiscalYears(insuranceBaselineFy, currentFy);

    const bookValue = calculateDepreciatedBookValue(

        original,

        elapsed,

        ANNUAL_DEPRECIATION_RATE,

        MIN_ASSET_BOOK_VALUE_NPR

    );

    const insuranceBookValue = calculateDepreciatedBookValue(

        originalInsurance,

        insuranceElapsed,

        INSURANCE_ANNUAL_DEPRECIATION_RATE,

        MIN_INSURANCE_BOOK_VALUE_NPR

    );

    return {

        original_purchase_cost_npr: original,

        original_insurance_amount_npr: originalInsurance,

        purchase_fy: purchaseFy,

        insurance_baseline_fy: asset.insurance_baseline_fy ?? null,

        current_fy: currentFy,

        elapsed_fiscal_years: elapsed,

        book_value_npr: bookValue,

        annual_depreciation_npr: roundAssetCurrency(original * ANNUAL_DEPRECIATION_RATE),

        insurance_book_value_npr: insuranceBookValue,

        annual_insurance_depreciation_npr: roundAssetCurrency(

            originalInsurance * INSURANCE_ANNUAL_DEPRECIATION_RATE

        ),

    };

}



/** @deprecated Use computeAssetFinancials */

export const computeAssetDepreciation = computeAssetFinancials;



export function applyDepreciationMetaToAsset<T extends Record<string, unknown>>(

    asset: T,

    meta: AssetFinancialMeta

): T & AssetFinancialMeta & { current_value: number; insurance_amount: number } {

    return {

        ...asset,

        ...meta,

        current_value: meta.book_value_npr,

        insurance_amount: meta.insurance_book_value_npr,

    };

}



export async function persistAssetFinancials(

    connection: PoolConnection,

    assetId: number,

    meta: AssetFinancialMeta

): Promise<void> {

    await connection.execute(

        `UPDATE assets

         SET original_purchase_cost_npr = ?,

             original_insurance_amount_npr = ?,

             purchase_fy = ?,

             insurance_baseline_fy = ?,

             current_value = ?,

             insurance_amount = ?,

             last_depreciation_fy = ?

         WHERE id = ?`,

        [

            meta.original_purchase_cost_npr,

            meta.original_insurance_amount_npr,

            meta.purchase_fy,

            meta.insurance_baseline_fy ?? null,

            meta.book_value_npr,

            meta.insurance_book_value_npr,

            meta.current_fy,

            assetId,

        ]

    );

}



/** @deprecated Use persistAssetFinancials */

export const persistAssetDepreciation = persistAssetFinancials;



const ASSET_DEPRECIATION_SELECT = `

    SELECT a.id, a.current_value, a.insurance_amount, a.original_purchase_cost_npr, a.original_insurance_amount_npr,

           a.purchase_fy, a.last_depreciation_fy, a.insurance_baseline_fy,

           a.purchase_currency, a.purchase_fx_rate, a.purchase_amount_base, a.created_at,

           (SELECT COALESCE(SUM(rd.total_amount), 0)

            FROM rrp_details rd

            WHERE rd.asset_fk = a.id AND rd.rrp_category = 'capital' AND rd.approval_status = 'APPROVED') AS rrp_total_npr,

           (SELECT apv.property_value FROM asset_property_values apv

            WHERE apv.asset_id = a.id AND apv.property_name = 'purchase_year' LIMIT 1) AS purchase_year

    FROM assets a`;



function assetFinancialsNeedPersist(asset: AssetDepreciationRow, meta: AssetFinancialMeta, currentFy: string): boolean {

    const needsOriginal =

        asset.original_purchase_cost_npr == null || Number(asset.original_purchase_cost_npr) <= 0;

    const needsInsuranceOriginal =

        asset.original_insurance_amount_npr == null || Number(asset.original_insurance_amount_npr) <= 0;

    const needsPurchaseFy = asset.purchase_fy !== meta.purchase_fy;

    const needsValue =

        asset.current_value == null ||

        Number(asset.current_value) !== meta.book_value_npr ||

        asset.insurance_amount == null ||

        Number(asset.insurance_amount) !== meta.insurance_book_value_npr ||

        asset.last_depreciation_fy !== currentFy;

    return needsOriginal || needsInsuranceOriginal || needsPurchaseFy || needsValue;

}



export async function runAnnualAssetDepreciation(

    connection: PoolConnection,

    currentFy: string

): Promise<number> {

    const [rows] = await connection.execute<RowDataPacket[]>(ASSET_DEPRECIATION_SELECT);

    let updated = 0;

    for (const row of rows) {

        const asset = row as AssetDepreciationRow;

        const meta = computeAssetFinancials(asset, currentFy);

        if (

            asset.last_depreciation_fy === currentFy &&

            Number(asset.current_value) === meta.book_value_npr &&

            Number(asset.insurance_amount) === meta.insurance_book_value_npr

        ) {

            continue;

        }

        await persistAssetFinancials(connection, asset.id, meta);

        updated += 1;

    }

    if (updated > 0) {

        logEvents(

            `Asset & insurance depreciation applied for FY ${currentFy}: ${updated} asset(s) updated`,

            'assetLog.log'

        );

    }

    return updated;

}



export async function backfillAssetDepreciationBaselines(connection: PoolConnection): Promise<void> {

    const [rows] = await connection.execute<RowDataPacket[]>(ASSET_DEPRECIATION_SELECT);

    const currentFy = getCurrentFiscalYearFromToday();

    for (const row of rows) {

        const asset = row as AssetDepreciationRow;

        const meta = computeAssetFinancials(asset, currentFy);

        if (assetFinancialsNeedPersist(asset, meta, currentFy)) {

            await persistAssetFinancials(connection, asset.id, meta);

        }

    }

}



export async function refreshAssetDepreciation(

    connection: PoolConnection,

    assetId: number

): Promise<AssetFinancialMeta | null> {

    const [rows] = await connection.execute<RowDataPacket[]>(

        `${ASSET_DEPRECIATION_SELECT} WHERE a.id = ?`,

        [assetId]

    );

    if (!rows.length) {

        return null;

    }

    const currentFy = await resolveCurrentFiscalYear(connection);

    const asset = rows[0] as AssetDepreciationRow;

    const meta = computeAssetFinancials(asset, currentFy);

    await persistAssetFinancials(connection, assetId, meta);

    return meta;

}



export async function onFiscalYearRollover(

    connection: PoolConnection,

    previousFy: string | null,

    newFy: string

): Promise<void> {

    if (!previousFy || previousFy === newFy) {

        return;

    }

    await runAnnualAssetDepreciation(connection, newFy);

}



export async function initializeAssetCostAndDepreciation(

    connection: PoolConnection,

    assetId: number,

    purchaseCostNpr: number,

    purchaseYear?: string | null,

    createdAtAd?: string | null

): Promise<AssetFinancialMeta> {

    const currentFy = await resolveCurrentFiscalYear(connection);

    const [rows] = await connection.execute<RowDataPacket[]>(

        `${ASSET_DEPRECIATION_SELECT} WHERE a.id = ?`,

        [assetId]

    );

    const existing = (rows[0] as AssetDepreciationRow | undefined) ?? { id: assetId };

    const asset: AssetDepreciationRow = {

        ...existing,

        id: assetId,

        original_purchase_cost_npr: purchaseCostNpr,

        purchase_year: purchaseYear ?? existing.purchase_year ?? null,

        created_at: createdAtAd ?? existing.created_at ?? null,

        current_value: purchaseCostNpr,

    };

    const meta = computeAssetFinancials(asset, currentFy);

    meta.original_purchase_cost_npr = roundAssetCurrency(purchaseCostNpr);

    meta.original_insurance_amount_npr = resolveOriginalInsuranceAmountNpr(asset);

    await persistAssetFinancials(connection, assetId, meta);

    return meta;

}



export async function initializeHistoricalImportFinancials(

    connection: PoolConnection,

    assetId: number,

    options: {

        purchaseCostNpr: number;

        purchaseYear?: string | null;

        insuranceAmount2081_82: number;

    }

): Promise<AssetFinancialMeta> {

    const currentFy = await resolveCurrentFiscalYear(connection);

    const [rows] = await connection.execute<RowDataPacket[]>(

        `${ASSET_DEPRECIATION_SELECT} WHERE a.id = ?`,

        [assetId]

    );

    const existing = (rows[0] as AssetDepreciationRow | undefined) ?? { id: assetId };

    const asset: AssetDepreciationRow = {

        ...existing,

        id: assetId,

        original_purchase_cost_npr: options.purchaseCostNpr > 0 ? options.purchaseCostNpr : undefined,

        original_insurance_amount_npr: options.insuranceAmount2081_82,

        insurance_baseline_fy: HISTORICAL_INSURANCE_BASELINE_FY,

        purchase_year: options.purchaseYear ?? existing.purchase_year ?? null,

    };

    const meta = computeAssetFinancials(asset, currentFy);

    meta.original_purchase_cost_npr =

        options.purchaseCostNpr > 0 ? roundAssetCurrency(options.purchaseCostNpr) : 0;

    meta.original_insurance_amount_npr = roundAssetCurrency(options.insuranceAmount2081_82);

    meta.insurance_baseline_fy = HISTORICAL_INSURANCE_BASELINE_FY;

    await connection.execute(

        `UPDATE assets SET insurance_baseline_fy = ? WHERE id = ?`,

        [HISTORICAL_INSURANCE_BASELINE_FY, assetId]

    );

    await persistAssetFinancials(connection, assetId, meta);

    return meta;

}


