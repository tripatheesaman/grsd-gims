import pool from '../config/db';
import { buildStockSearchKey } from './searchRelevanceService';

let ensured = false;
let ensurePromise: Promise<void> | null = null;

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

const hasTableCollation = async (tableName: string, collation: string) => {
    const [rows] = await pool.query<any[]>(
        `SELECT TABLE_COLLATION
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?`,
        [tableName]
    );
    return rows.length > 0 && String(rows[0].TABLE_COLLATION) === collation;
};

async function backfillSearchKeysBatch(): Promise<void> {
    if (!(await hasColumn('stock_details', 'search_key'))) {
        return;
    }
    const [rows] = await pool.query<any[]>(
        `SELECT id, nac_code, part_numbers, item_name, applicable_equipments
         FROM stock_details
         WHERE search_key IS NULL OR search_key = ''
         LIMIT 500`
    );
    for (const row of rows as Array<Record<string, string>>) {
        const key = buildStockSearchKey(row);
        await pool.query(`UPDATE stock_details SET search_key = ? WHERE id = ?`, [key, row.id]);
    }
}

/** Runs on every call — adds capital RRP columns if the DB was created before they existed. */
export const ensureAssetImageColumns = async (): Promise<void> => {
    if (!(await hasColumn('asset_receive_details', 'image_path'))) {
        await pool.query(
            `ALTER TABLE asset_receive_details
             ADD COLUMN image_path VARCHAR(512) NULL`
        );
    }
    if (!(await hasColumn('assets', 'image_path'))) {
        await pool.query(
            `ALTER TABLE assets
             ADD COLUMN image_path VARCHAR(512) NULL`
        );
    }
};

export const ensureCapitalRrpColumns = async (): Promise<void> => {
    await ensureAssetImageColumns();
    const capitalColumns: Array<{ name: string; ddl: string }> = [
        { name: 'asset_receive_fk', ddl: 'ADD COLUMN asset_receive_fk INT NULL' },
        { name: 'asset_fk', ddl: 'ADD COLUMN asset_fk INT NULL' },
        { name: 'forex_rate_2', ddl: 'ADD COLUMN forex_rate_2 DECIMAL(18,6) NULL' },
        { name: 'po_date', ddl: 'ADD COLUMN po_date DATE NULL' },
        { name: 'contract_identification_number', ddl: 'ADD COLUMN contract_identification_number VARCHAR(255) NULL' },
        { name: 'transportation_other_charges', ddl: 'ADD COLUMN transportation_other_charges DECIMAL(18,2) NULL' },
        { name: 'vat_amount_purchase_currency', ddl: 'ADD COLUMN vat_amount_purchase_currency DECIMAL(18,2) NULL' },
        { name: 'rrp_category', ddl: "ADD COLUMN rrp_category VARCHAR(20) NULL DEFAULT 'spare'" },
        { name: 'capital_item_data', ddl: 'ADD COLUMN capital_item_data JSON NULL' },
    ];
    for (const col of capitalColumns) {
        if (!(await hasColumn('rrp_details', col.name))) {
            await pool.query(`ALTER TABLE rrp_details ${col.ddl}`);
        }
    }
    const assetReceiveIndex = await hasIndex('rrp_details', 'idx_rrp_details_asset_receive_fk');
    if (!assetReceiveIndex) {
        await pool.query(`CREATE INDEX idx_rrp_details_asset_receive_fk ON rrp_details (asset_receive_fk)`).catch(() => undefined);
    }
    const assetFkIndex = await hasIndex('rrp_details', 'idx_rrp_details_asset_fk');
    if (!assetFkIndex) {
        await pool.query(`CREATE INDEX idx_rrp_details_asset_fk ON rrp_details (asset_fk)`).catch(() => undefined);
    }
};

export const ensureAssetSpareSchema = async (): Promise<void> => {
    if (ensured) {
        return;
    }
    if (!ensurePromise) {
        ensurePromise = runEnsureAssetSpareSchemaWork()
            .then(() => {
                ensured = true;
            })
            .catch((error) => {
                ensurePromise = null;
                throw error;
            });
    }
    await ensurePromise;
};

async function runEnsureAssetSpareSchemaWork(): Promise<void> {
    await ensureCapitalRrpColumns();

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

    const originalCostCol = await hasColumn('assets', 'original_purchase_cost_npr');
    if (!originalCostCol) {
        await pool.query(
            `ALTER TABLE assets
             ADD COLUMN original_purchase_cost_npr DECIMAL(18,4) NULL`
        );
    }

    const purchaseFyCol = await hasColumn('assets', 'purchase_fy');
    if (!purchaseFyCol) {
        await pool.query(
            `ALTER TABLE assets
             ADD COLUMN purchase_fy VARCHAR(16) NULL`
        );
    }

    const lastDepFyCol = await hasColumn('assets', 'last_depreciation_fy');
    if (!lastDepFyCol) {
        await pool.query(
            `ALTER TABLE assets
             ADD COLUMN last_depreciation_fy VARCHAR(16) NULL`
        );
    }

    const insuranceAmountCol = await hasColumn('assets', 'insurance_amount');
    if (!insuranceAmountCol) {
        await pool.query(
            `ALTER TABLE assets
             ADD COLUMN insurance_amount DECIMAL(18,2) NULL`
        );
    }

    const originalInsuranceCol = await hasColumn('assets', 'original_insurance_amount_npr');
    if (!originalInsuranceCol) {
        await pool.query(
            `ALTER TABLE assets
             ADD COLUMN original_insurance_amount_npr DECIMAL(18,4) NULL`
        );
    }

    const insuranceBaselineFyCol = await hasColumn('assets', 'insurance_baseline_fy');
    if (!insuranceBaselineFyCol) {
        await pool.query(
            `ALTER TABLE assets
             ADD COLUMN insurance_baseline_fy VARCHAR(16) NULL`
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );
    if (!(await hasTableCollation('spare_compatibility', 'utf8mb4_unicode_ci'))) {
        await pool.query(
            `ALTER TABLE spare_compatibility CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        ).catch(() => undefined);
    }

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

    const baseNacCodeCol = await hasColumn('stock_details', 'base_nac_code');
    if (!baseNacCodeCol) {
        await pool.query(
            `ALTER TABLE stock_details ADD COLUMN base_nac_code VARCHAR(64) NULL`
        );
    }
    const baseNacIndex = await hasIndex('stock_details', 'idx_stock_details_base_nac');
    if (!baseNacIndex) {
        await pool.query(
            `CREATE INDEX idx_stock_details_base_nac ON stock_details (base_nac_code)`
        ).catch(() => undefined);
    }
    await pool.query(
        `UPDATE stock_details
         SET base_nac_code = CASE
           WHEN nac_code REGEXP '^(GT|TW|GS) [0-9]{5}[A-Z]$'
             THEN LEFT(nac_code, 8)
           ELSE nac_code
         END
         WHERE base_nac_code IS NULL OR base_nac_code = ''`
    ).catch(() => undefined);

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
                `CREATE INDEX idx_issue_details_issued_for_issue_date ON issue_details (issued_for(191), issue_date)`
            ).catch(() => undefined);
        }
    }

    const searchIndexes: Array<{ table: string; name: string; ddl: string }> = [
        { table: 'stock_details', name: 'idx_stock_details_search_key', ddl: 'CREATE INDEX idx_stock_details_search_key ON stock_details (search_key(191))' },
        { table: 'stock_details', name: 'idx_stock_details_part_numbers', ddl: 'CREATE INDEX idx_stock_details_part_numbers ON stock_details (part_numbers(191))' },
        { table: 'request_details', name: 'idx_request_details_request_number', ddl: 'CREATE INDEX idx_request_details_request_number ON request_details (request_number)' },
        { table: 'request_details', name: 'idx_request_details_part_number', ddl: 'CREATE INDEX idx_request_details_part_number ON request_details (part_number)' },
        { table: 'request_details', name: 'idx_request_details_nac_code', ddl: 'CREATE INDEX idx_request_details_nac_code ON request_details (nac_code)' },
        { table: 'request_details', name: 'idx_request_details_status_received', ddl: 'CREATE INDEX idx_request_details_status_received ON request_details (approval_status, is_received)' },
        { table: 'receive_details', name: 'idx_receive_details_request_fk_status', ddl: 'CREATE INDEX idx_receive_details_request_fk_status ON receive_details (request_fk, approval_status)' },
        { table: 'receive_details', name: 'idx_receive_details_part_number', ddl: 'CREATE INDEX idx_receive_details_part_number ON receive_details (part_number)' },
        { table: 'receive_details', name: 'idx_receive_details_nac_code', ddl: 'CREATE INDEX idx_receive_details_nac_code ON receive_details (nac_code)' },
        { table: 'rrp_details', name: 'idx_rrp_details_rrp_number', ddl: 'CREATE INDEX idx_rrp_details_rrp_number ON rrp_details (rrp_number)' },
        { table: 'issue_details', name: 'idx_issue_details_part_number', ddl: 'CREATE INDEX idx_issue_details_part_number ON issue_details (part_number)' },
        { table: 'issue_details', name: 'idx_issue_details_nac_code', ddl: 'CREATE INDEX idx_issue_details_nac_code ON issue_details (nac_code)' },
        { table: 'assets', name: 'idx_assets_equipment_code', ddl: 'CREATE INDEX idx_assets_equipment_code ON assets (equipment_code)' },
        { table: 'assets', name: 'idx_assets_name', ddl: 'CREATE INDEX idx_assets_name ON assets (name(191))' },
    ];
    for (const idx of searchIndexes) {
        if (!(await hasIndex(idx.table, idx.name))) {
            await pool.query(idx.ddl).catch(() => undefined);
        }
    }

    if (stockNacCodeCol && !(await hasColumn('stock_details', 'search_key'))) {
        await pool.query(
            `ALTER TABLE stock_details ADD COLUMN search_key VARCHAR(512) NULL`
        ).catch(() => undefined);
    }
    void backfillSearchKeysBatch().catch(() => undefined);

    if (!(await hasColumn('issue_details', 'extends_applicable_equipment'))) {
        await pool.query(
            `ALTER TABLE issue_details
             ADD COLUMN extends_applicable_equipment TINYINT(1) NOT NULL DEFAULT 0`
        ).catch(() => undefined);
    }

    await pool.query(
        `CREATE TABLE IF NOT EXISTS asset_receive_details (
            id INT NOT NULL AUTO_INCREMENT,
            model_name VARCHAR(255) NOT NULL,
            received_quantity DECIMAL(10,2) NOT NULL,
            remaining_quantity DECIMAL(18,4) NOT NULL,
            receive_date DATE NOT NULL,
            approval_status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
            received_by VARCHAR(255) NULL,
            approved_by VARCHAR(255) NULL,
            rejected_by VARCHAR(255) NULL,
            rejection_reason TEXT NULL,
            rrp_fk INT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_asset_receive_date (receive_date),
            KEY idx_asset_receive_rrp (rrp_fk),
            KEY idx_asset_receive_approval (approval_status)
        ) ENGINE=InnoDB`
    );

    const rrpReceiveFkCol = await hasColumn('rrp_details', 'receive_fk');
    if (rrpReceiveFkCol) {
        await pool.query(
            `ALTER TABLE rrp_details MODIFY receive_fk INT NULL`
        ).catch(() => undefined);
    }

    // Ensure issue_sections table exists
    await pool.query(`
        CREATE TABLE IF NOT EXISTS issue_sections (
            id          INT          NOT NULL AUTO_INCREMENT,
            name        VARCHAR(255) NOT NULL,
            code        VARCHAR(100) NOT NULL,
            description TEXT         NULL,
            is_active   TINYINT(1)   NOT NULL DEFAULT 1,
            created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_issue_sections_code (code)
        ) ENGINE=InnoDB
    `);

    const permissionSeeds: Array<{ name: string; readable: string; type: string }> = [
        { name: 'can_receive_assets', readable: 'Receive Assets (Capital Equipment)', type: 'receive' },
        { name: 'can_approve_assets_receive', readable: 'Approve Assets Receive', type: 'receive' },
        { name: 'can_create_assets_rrp', readable: 'Create Assets RRP (Capital)', type: 'rrp' },
        { name: 'can_access_asset_settings', readable: 'Access Asset Settings', type: 'settings' },
        { name: 'can_access_app_settings', readable: 'Access App Settings', type: 'settings' },
        { name: 'can_access_assets_report', readable: 'Access Assets Report', type: 'reports' },
        { name: 'can_access_insurance_report', readable: 'Access Insurance Report', type: 'reports' },
        { name: 'can_generate_fuel_diesel_weekly_report', readable: 'Fuel Report — Weekly Diesel', type: 'reports' },
        { name: 'can_generate_fuel_petrol_weekly_report', readable: 'Fuel Report — Weekly Petrol', type: 'reports' },
        { name: 'can_generate_fuel_petrol_consumption_report', readable: 'Fuel Report — Petrol Consumption', type: 'reports' },
        { name: 'can_generate_fuel_oil_consumption_report', readable: 'Fuel Report — Oil Consumption', type: 'reports' },
        // Settings sub-page permissions
        { name: 'can_access_request_settings', readable: 'Access Request Settings', type: 'settings' },
        { name: 'can_access_receive_settings', readable: 'Access Receive Settings', type: 'settings' },
        { name: 'can_access_issue_settings', readable: 'Access Issue Settings', type: 'settings' },
        { name: 'can_access_rrp_settings', readable: 'Access RRP Settings', type: 'settings' },
        { name: 'can_access_fuel_settings', readable: 'Access Fuel Settings', type: 'settings' },
        { name: 'can_manage_issue_sections', readable: 'Manage Issue Sections', type: 'settings' },
    ];
    const [permRows] = await pool.query<any[]>(
        `SELECT permission_name FROM user_permissions WHERE permission_name IN (${permissionSeeds.map(() => '?').join(',')})`,
        permissionSeeds.map((p) => p.name)
    );
    const existingPermNames = new Set((permRows as any[]).map((r) => String(r.permission_name)));
    const [maxRow] = await pool.query<any[]>('SELECT COALESCE(MAX(id), 0) AS maxId FROM user_permissions');
    let nextId = Number((maxRow as any[])[0]?.maxId || 0) + 1;
    const toInsert: Array<{ id: number; name: string; readable: string; type: string }> = [];
    for (const seed of permissionSeeds) {
        if (!existingPermNames.has(seed.name)) {
            toInsert.push({
                id: nextId++,
                name: seed.name,
                readable: seed.readable,
                type: seed.type,
            });
        }
    }
    for (const p of toInsert) {
        await pool.query(
            `INSERT INTO user_permissions (id, permission_name, permission_readable, permission_type, allowed_user_ids)
             VALUES (?, ?, ?, ?, '')`,
            [p.id, p.name, p.readable, p.type]
        );
    }
    for (const seed of permissionSeeds) {
        await pool.query(
            `UPDATE user_permissions SET permission_readable = ? WHERE permission_name = ?`,
            [seed.readable, seed.name]
        );
    }

    const [supplierTypeRows] = await pool.query<any[]>(
        `SELECT COLUMN_TYPE
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'suppliers'
           AND COLUMN_NAME = 'supplier_type'`
    );
    if (supplierTypeRows.length > 0) {
        const columnType = String(supplierTypeRows[0].COLUMN_TYPE || '').toLowerCase();
        if (columnType.startsWith('enum') && !columnType.includes('capital')) {
            await pool.query(
                `ALTER TABLE suppliers
                 MODIFY supplier_type ENUM('local', 'foreign', 'capital') NOT NULL`
            );
        }
    }

    void (async () => {
        const connection = await pool.getConnection();
        try {
            const { backfillAssetDepreciationBaselines } = await import('./assetDepreciationService');
            await backfillAssetDepreciationBaselines(connection);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`Asset depreciation backfill skipped: ${message}`);
        }
        finally {
            connection.release();
        }
    })();
};

