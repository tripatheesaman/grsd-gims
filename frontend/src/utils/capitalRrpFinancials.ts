export type CapitalFinancialItemInput = {
    quantity: number;
    purchase_amount: number;
    item_price: number;
    vat_status: boolean;
};

export interface CapitalLineFinancials {
    unitPrice: number;
    quantity: number;
    linePurchase: number;
    vatPurchase: number;
    lineNpr: number;
    vatNpr: number;
    lineTotalNpr: number;
    vatRateApplied: number;
}

export interface CapitalFinancialSummary {
    lines: CapitalLineFinancials[];
    currency: string;
    forexRate: number;
    vatRate: number;
    totalLinePurchase: number;
    totalVatPurchase: number;
    totalPurchaseWithVat: number;
    totalLineNpr: number;
    totalVatNpr: number;
    totalLinesNpr: number;
    customsNpr: number;
    transportNpr: number;
    grandTotalNpr: number;
}

export const formatMoney = (value: number, decimals = 2): string =>
    Number(value || 0).toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });

export const formatCurrencyAmount = (value: number, currency: string, decimals = 2): string =>
    `${currency} ${formatMoney(value, decimals)}`;

/** Matches backend createCapitalRRP / RRCP Excel: VAT on purchase currency, then convert to NPR. */
export const calculateCapitalLineFinancials = (
    item: CapitalFinancialItemInput,
    forexRate: number,
    vatRate: number
): CapitalLineFinancials => {
    const qty = Number(item.quantity) || 1;
    const unitPrice = Number(item.purchase_amount) || Number(item.item_price) || 0;
    const linePurchase = Number((unitPrice * qty).toFixed(2));
    const vatRateApplied = item.vat_status ? vatRate : 0;
    const vatPurchase = Number((linePurchase * (vatRateApplied / 100)).toFixed(2));
    const fx = Number(forexRate) || 1;
    const lineNpr = Number((linePurchase * fx).toFixed(2));
    const vatNpr = Number((lineNpr * (vatRateApplied / 100)).toFixed(2));
    const lineTotalNpr = Number((lineNpr + vatNpr).toFixed(2));
    return {
        unitPrice,
        quantity: qty,
        linePurchase,
        vatPurchase,
        lineNpr,
        vatNpr,
        lineTotalNpr,
        vatRateApplied,
    };
};

export const calculateCapitalFinancialSummary = (
    items: CapitalFinancialItemInput[],
    currency: string,
    forexRate: number,
    vatRate: number,
    customsNpr: number,
    transportNpr: number
): CapitalFinancialSummary => {
    const lines = items.map((item) => calculateCapitalLineFinancials(item, forexRate, vatRate));
    const totals = lines.reduce(
        (acc, line) => ({
            totalLinePurchase: acc.totalLinePurchase + line.linePurchase,
            totalVatPurchase: acc.totalVatPurchase + line.vatPurchase,
            totalLineNpr: acc.totalLineNpr + line.lineNpr,
            totalVatNpr: acc.totalVatNpr + line.vatNpr,
            totalLinesNpr: acc.totalLinesNpr + line.lineTotalNpr,
        }),
        {
            totalLinePurchase: 0,
            totalVatPurchase: 0,
            totalLineNpr: 0,
            totalVatNpr: 0,
            totalLinesNpr: 0,
        }
    );
    const customs = Number(customsNpr) || 0;
    const transport = Number(transportNpr) || 0;
    return {
        lines,
        currency,
        forexRate: Number(forexRate) || 1,
        vatRate,
        totalLinePurchase: Number(totals.totalLinePurchase.toFixed(2)),
        totalVatPurchase: Number(totals.totalVatPurchase.toFixed(2)),
        totalPurchaseWithVat: Number((totals.totalLinePurchase + totals.totalVatPurchase).toFixed(2)),
        totalLineNpr: Number(totals.totalLineNpr.toFixed(2)),
        totalVatNpr: Number(totals.totalVatNpr.toFixed(2)),
        totalLinesNpr: Number(totals.totalLinesNpr.toFixed(2)),
        customsNpr: Number(customs.toFixed(2)),
        transportNpr: Number(transport.toFixed(2)),
        grandTotalNpr: Number((totals.totalLinesNpr + customs + transport).toFixed(2)),
    };
};
