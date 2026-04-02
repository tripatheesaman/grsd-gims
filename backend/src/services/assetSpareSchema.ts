import pool from '../config/db';

let ensured = false;

const hasColumn = async (tableName: string, columnName: string) => {
    const [rows] = await pool.query<any[]>(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?`,
        [tableName, columnName]
    );
    return rows.length > 0;
};

const hasIndex = async (tableName: string, indexName: string) => {
    const [rows] = await pool.query<any[]>(
        `SELECT INDEX_NAME
         FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND INDEX_NAME = ?`,
        [tableName, indexName]
    );
    return rows.length > 0;
};

export const ensureAssetSpareSchema = async (): Promise<void> => {
    if (ensured) {
        return;
    }
    ensured = true;

    const equipmentCodeCol = await hasColumn('assets', 'equipment_code');
    if (!equipmentCodeCol) {
        await pool.query(
            `ALTER TABLE assets
             ADD COLUMN equipment_code VARCHAR(64) NULL`
        );
    }

    const purchaseCurrencyCol = await hasColumn('assets', 'purchase_currency');
    if (!purchaseCurrencyCol) {
        await pool.query(
            `ALTER TABLE assets
             ADD COLUMN purchase_currency VARCHAR(16) NULL`
        );
    }

    const purchaseFxRateCol = await hasColumn('assets', 'purchase_fx_rate');
    if (!purchaseFxRateCol) {
        await pool.query(
            `ALTER TABLE assets
             ADD COLUMN purchase_fx_rate DECIMAL(18,6) NULL`
        );
    }

    const purchaseAmountBaseCol = await hasColumn('assets', 'purchase_amount_base');
    if (!purchaseAmountBaseCol) {
        await pool.query(
            `ALTER TABLE assets
             ADD COLUMN purchase_amount_base DECIMAL(18,2) NULL`
        );
    }

    const locationCol = await hasColumn('assets', 'location');
    if (!locationCol) {
        await pool.query(
            `ALTER TABLE assets
             ADD COLUMN location VARCHAR(255) NULL`
        );
    }

    const rrpStatusCol = await hasColumn('assets', 'rrp_status');
    if (!rrpStatusCol) {
        await pool.query(
            `ALTER TABLE assets
             ADD COLUMN rrp_status VARCHAR(64) NULL`
        );
    }

    const currentValueCol = await hasColumn('assets', 'current_value');
    if (!currentValueCol) {
        await pool.query(
            `ALTER TABLE assets
             ADD COLUMN current_value DECIMAL(18,2) NULL`
        );
    }

    const insuranceAmountCol = await hasColumn('assets', 'insurance_amount');
    if (!insuranceAmountCol) {
        await pool.query(
            `ALTER TABLE assets
             ADD COLUMN insurance_amount DECIMAL(18,2) NULL`
        );
    }

    const servicabilityStatusCol = await hasColumn('assets', 'servicability_status');
    if (!servicabilityStatusCol) {
        await pool.query(
            `ALTER TABLE assets
             ADD COLUMN servicability_status VARCHAR(64) NULL`
        );
    }

    const uniqueEquipmentCodeIndex = await hasIndex('assets', 'uq_assets_equipment_code');
    if (!uniqueEquipmentCodeIndex) {
        await pool.query(
            `CREATE UNIQUE INDEX uq_assets_equipment_code ON assets (equipment_code)`
        );
    }

    await pool.query(
        `CREATE TABLE IF NOT EXISTS spare_compatibility (
            nac_code VARCHAR(64) NOT NULL,
            equipment_code VARCHAR(64) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (nac_code, equipment_code),
            KEY idx_spare_compatibility_equipment (equipment_code)
        ) ENGINE=InnoDB`
    );

    const spareCompatibilityReverseIndex = await hasIndex('spare_compatibility', 'idx_spare_compatibility_equipment_nac');
    if (!spareCompatibilityReverseIndex) {
        await pool.query(
            `CREATE INDEX idx_spare_compatibility_equipment_nac ON spare_compatibility (equipment_code, nac_code)`
        );
    }

    const stockNacCodeCol = await hasColumn('stock_details', 'nac_code');
    if (stockNacCodeCol) {
        const stockNacIndex = await hasIndex('stock_details', 'idx_stock_details_nac_code');
        if (!stockNacIndex) {
            await pool.query(
                `CREATE INDEX idx_stock_details_nac_code ON stock_details (nac_code)`
            );
        }
    }

    const requestEqCol = await hasColumn('request_details', 'equipment_number');
    const requestDateCol = await hasColumn('request_details', 'request_date');
    if (requestEqCol && requestDateCol) {
        const requestIndex = await hasIndex('request_details', 'idx_request_details_equipment_number_request_date');
        if (!requestIndex) {
            await pool.query(
                `CREATE INDEX idx_request_details_equipment_number_request_date ON request_details (equipment_number, request_date)`
            );
        }
    }

    const receiveEqCol = await hasColumn('receive_details', 'equipment_number');
    const receiveDateCol = await hasColumn('receive_details', 'receive_date');
    if (receiveEqCol && receiveDateCol) {
        const receiveIndex = await hasIndex('receive_details', 'idx_receive_details_equipment_number_receive_date');
        if (!receiveIndex) {
            await pool.query(
                `CREATE INDEX idx_receive_details_equipment_number_receive_date ON receive_details (equipment_number, receive_date)`
            );
        }
    }

    const issueIssuedForCol = await hasColumn('issue_details', 'issued_for');
    const issueDateCol = await hasColumn('issue_details', 'issue_date');
    if (issueIssuedForCol && issueDateCol) {
        const issueIndex = await hasIndex('issue_details', 'idx_issue_details_issued_for_issue_date');
        if (!issueIndex) {
            await pool.query(
                `CREATE INDEX idx_issue_details_issued_for_issue_date ON issue_details (issued_for, issue_date)`
            );
        }
    }
};

