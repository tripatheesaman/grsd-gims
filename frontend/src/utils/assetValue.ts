/** Original NPR purchase cost (immutable base for depreciation). */

export const getAssetOriginalPurchaseCostNpr = (asset: {

    original_purchase_cost_npr?: number | null;

    rrp_total_npr?: number | null;

    purchase_amount_base?: number | null;

    purchase_fx_rate?: number | null;

    current_value?: number | null;

}): number | null => {

    const original = Number(asset.original_purchase_cost_npr);

    if (Number.isFinite(original) && original > 0) {

        return original;

    }

    const rrp = Number(asset.rrp_total_npr);

    if (Number.isFinite(rrp) && rrp > 0) {

        return rrp;

    }

    const base = Number(asset.purchase_amount_base);

    const fx = Number(asset.purchase_fx_rate);

    if (Number.isFinite(base) && Number.isFinite(fx) && base > 0 && fx > 0) {

        return base * fx;

    }

    return null;

};



/** Original insurance NPR base (foreign purchase amount × FX rate). */

export const getAssetOriginalInsuranceAmountNpr = (asset: {
    original_insurance_amount_npr?: number | null;
    purchase_amount_base?: number | null;
    purchase_fx_rate?: number | null;
}): number | null => {
    const original = Number(asset.original_insurance_amount_npr);
    if (Number.isFinite(original) && original > 0) {
        return original;
    }
    const base = Number(asset.purchase_amount_base);
    const fx = Number(asset.purchase_fx_rate);
    if (Number.isFinite(base) && Number.isFinite(fx) && base > 0 && fx > 0) {
        return base * fx;
    }
    return null;
};

/** Depreciated book value (current value after FY depreciation). Minimum NPR 0.1. */

export const getAssetBookValueNpr = (asset: {

    book_value_npr?: number | null;

    current_value?: number | null;

}): number | null => {

    const book = Number(asset.book_value_npr ?? asset.current_value);

    if (Number.isFinite(book) && book >= 0) {

        return book;

    }

    return null;

};



/** @deprecated Use getAssetOriginalPurchaseCostNpr for purchase cost labels */

export const getAssetPurchaseCostNpr = getAssetOriginalPurchaseCostNpr;



/** Depreciated insurance value after FY depreciation (10% per FY). Minimum NPR 0.1. */

export const getAssetInsuranceBookValueNpr = (asset: {
    insurance_book_value_npr?: number | null;
    insurance_amount?: number | null;
}): number | null => {
    const book = Number(asset.insurance_book_value_npr ?? asset.insurance_amount);
    if (Number.isFinite(book) && book >= 0) {
        return book;
    }
    return null;
};

/** @deprecated Use getAssetBookValueNpr */

export const getAssetDisplayValueNpr = getAssetBookValueNpr;



export const formatNprAmount = (value: number | null | undefined): string => {

    if (value == null || !Number.isFinite(Number(value))) {

        return '—';

    }

    return `NPR ${Number(value).toLocaleString(undefined, {

        minimumFractionDigits: 2,

        maximumFractionDigits: 2,

    })}`;

};


