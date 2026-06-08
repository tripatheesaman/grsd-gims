import { RowDataPacket } from 'mysql2';
import pool from '../config/db';

const FUEL_NAC_SQL = "'GT 07986', 'GT 00000'";

const ASSET_PURCHASE_COST_EXPR = `COALESCE(
    NULLIF(a.original_purchase_cost_npr, 0),
    (
        SELECT COALESCE(SUM(rd.total_amount), 0)
        FROM rrp_details rd
        WHERE rd.asset_fk = a.id
          AND rd.rrp_category = 'capital'
          AND rd.approval_status = 'APPROVED'
    ),
    0
)`;

export interface AssetTypeValuation {
    typeName: string;
    purchaseCost: number;
    currentValue: number;
    assetCount: number;
}

export interface DashboardValuationTotals {
    totalSparesQuantity: number;
    totalSparesCurrentValue: number;
    totalSparesPurchaseCost: number;
    totalAssetsPurchaseCost: number;
    totalAssetsCurrentValue: number;
    assetTypeValues: AssetTypeValuation[];
    grandTotalPurchaseCost: number;
    grandTotalCurrentValue: number;
}

export const computeDashboardValuationTotals = async (
    asOfDate?: string
): Promise<DashboardValuationTotals> => {
    const receiveDateFilter = asOfDate ? ' AND rd.receive_date <= ?' : '';
    const issueDateFilter = asOfDate ? ' AND id.issue_date <= ?' : '';
    const receiveDateParams = asOfDate ? [asOfDate] : [];
    const issueDateParams = asOfDate ? [asOfDate] : [];

    const [sparesQtyRows, sparesCurrentRows, sparesPurchaseRows, assetTypeRows] = await Promise.all([
        pool.query<RowDataPacket[]>(
            `SELECT COALESCE(SUM(current_balance), 0) AS totalQuantity
             FROM stock_details
             WHERE nac_code NOT IN (${FUEL_NAC_SQL})`
        ),
        pool.query<RowDataPacket[]>(
            `SELECT
                (SELECT COALESCE(SUM(open_amount), 0)
                 FROM stock_details
                 WHERE nac_code NOT IN (${FUEL_NAC_SQL})) +
                (SELECT COALESCE(SUM(rrp.total_amount), 0)
                 FROM receive_details rd
                 INNER JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
                 WHERE rd.approval_status = 'APPROVED'
                   AND rd.rrp_fk IS NOT NULL
                   AND rd.nac_code NOT IN (${FUEL_NAC_SQL})${receiveDateFilter}) -
                (SELECT COALESCE(SUM(id.issue_cost), 0)
                 FROM issue_details id
                 WHERE id.approval_status = 'APPROVED'
                   AND id.nac_code NOT IN (${FUEL_NAC_SQL})${issueDateFilter}) AS totalValue`,
            [...receiveDateParams, ...issueDateParams]
        ),
        pool.query<RowDataPacket[]>(
            `SELECT
                (SELECT COALESCE(SUM(open_amount), 0)
                 FROM stock_details
                 WHERE nac_code NOT IN (${FUEL_NAC_SQL})) +
                (SELECT COALESCE(SUM(rrp.total_amount), 0)
                 FROM receive_details rd
                 INNER JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
                 WHERE rd.approval_status = 'APPROVED'
                   AND rd.rrp_fk IS NOT NULL
                   AND rd.nac_code NOT IN (${FUEL_NAC_SQL})${receiveDateFilter}) AS totalValue`,
            receiveDateParams
        ),
        pool.query<RowDataPacket[]>(
            `SELECT
                COALESCE(at.name, 'Unclassified') AS typeName,
                COUNT(a.id) AS assetCount,
                COALESCE(SUM(${ASSET_PURCHASE_COST_EXPR}), 0) AS purchaseCost,
                COALESCE(SUM(COALESCE(a.current_value, 0)), 0) AS currentValue
             FROM assets a
             LEFT JOIN asset_types at ON a.asset_type_id = at.id
             GROUP BY at.id, at.name
             ORDER BY typeName ASC`
        ),
    ]);

    const assetTypeValues: AssetTypeValuation[] = assetTypeRows[0].map((row) => ({
        typeName: String(row.typeName || 'Unclassified'),
        purchaseCost: Number(row.purchaseCost) || 0,
        currentValue: Number(row.currentValue) || 0,
        assetCount: Number(row.assetCount) || 0,
    }));

    const totalAssetsPurchaseCost = assetTypeValues.reduce((sum, row) => sum + row.purchaseCost, 0);
    const totalAssetsCurrentValue = assetTypeValues.reduce((sum, row) => sum + row.currentValue, 0);
    const totalSparesQuantity = Number(sparesQtyRows[0][0]?.totalQuantity) || 0;
    const totalSparesCurrentValue = Number(sparesCurrentRows[0][0]?.totalValue) || 0;
    const totalSparesPurchaseCost = Number(sparesPurchaseRows[0][0]?.totalValue) || 0;

    return {
        totalSparesQuantity,
        totalSparesCurrentValue,
        totalSparesPurchaseCost,
        totalAssetsPurchaseCost,
        totalAssetsCurrentValue,
        assetTypeValues,
        grandTotalPurchaseCost: totalSparesPurchaseCost + totalAssetsPurchaseCost,
        grandTotalCurrentValue: totalSparesCurrentValue + totalAssetsCurrentValue,
    };
};
