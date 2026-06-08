import type { Asset } from '@/types/asset';
import {
    getAssetInsuranceBookValueUsd,
    getAssetOriginalInsuranceAmountUsd,
    getAssetPurchaseCostNpr,
} from '@/utils/assetValue';

export type AssetExportRow = Asset & { asset_type_name?: string | null };

export async function downloadAssetsExcel(rows: AssetExportRow[], filename: string): Promise<void> {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Assets');
    const headers = [
        'Name',
        'Equipment Code',
        'Asset Type',
        'Location',
        'RRP Status',
        'Purchase Cost (NPR)',
        'Current Value (NPR)',
        'Insurance Base (USD)',
        'Insurance Value (USD)',
        'Servicability',
        'Currency',
        'FX Rate',
        'Purchase Amount',
        'Created',
    ];
    worksheet.addRow(headers);
    worksheet.getRow(1).font = { bold: true };
    for (const r of rows) {
        worksheet.addRow([
            r.name,
            r.equipment_code ?? '',
            r.asset_type_name ?? r.asset_type?.name ?? '',
            r.location ?? '',
            r.rrp_status ?? '',
            getAssetPurchaseCostNpr(r) ?? '',
            r.book_value_npr ?? r.current_value ?? '',
            getAssetOriginalInsuranceAmountUsd(r) ?? '',
            getAssetInsuranceBookValueUsd(r) ?? '',
            r.servicability_status ?? '',
            r.purchase_currency ?? '',
            r.purchase_fx_rate ?? '',
            r.purchase_amount_base ?? '',
            r.created_at ?? '',
        ]);
    }
    worksheet.columns = headers.map(() => ({ width: 18 }));
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const objectUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(objectUrl);
    document.body.removeChild(a);
}
