-- Granular route permissions for GIMS (reports & settings)
-- Run against your application database after backup.
-- Restart backend once so ensureAssetSpareSchema() can also seed missing rows on boot.

-- ---------------------------------------------------------------------------
-- 1) Insert new permission definitions (skip if already present)
-- ---------------------------------------------------------------------------
INSERT INTO user_permissions (id, permission_name, permission_readable, permission_type, allowed_user_ids)
SELECT * FROM (
    SELECT 9001 AS id, 'can_access_app_settings' AS permission_name,
           'Access App Settings' AS permission_readable, 'settings' AS permission_type, '' AS allowed_user_ids
    UNION ALL SELECT 9002, 'can_access_assets_report', 'Access Assets Report', 'reports', ''
    UNION ALL SELECT 9003, 'can_access_insurance_report', 'Access Insurance Report', 'reports', ''
    UNION ALL SELECT 9004, 'can_generate_fuel_diesel_weekly_report', 'Fuel Report — Weekly Diesel', 'reports', ''
    UNION ALL SELECT 9005, 'can_generate_fuel_petrol_weekly_report', 'Fuel Report — Weekly Petrol', 'reports', ''
    UNION ALL SELECT 9006, 'can_generate_fuel_petrol_consumption_report', 'Fuel Report — Petrol Consumption', 'reports', ''
    UNION ALL SELECT 9007, 'can_generate_fuel_oil_consumption_report', 'Fuel Report — Oil Consumption', 'reports', ''
) AS seed
WHERE NOT EXISTS (
    SELECT 1 FROM user_permissions up WHERE up.permission_name = seed.permission_name
);

-- If your id column must stay sequential, use this pattern instead of fixed 900x ids:
-- SET @next_id := (SELECT COALESCE(MAX(id), 0) + 1 FROM user_permissions);
-- then insert one row at a time with @next_id := @next_id + 1

-- ---------------------------------------------------------------------------
-- 2) Grant new granular permissions to roles that already had umbrella access
--    (adjust role names to match your deployment)
-- ---------------------------------------------------------------------------

-- Users with broad report access also get assets + insurance reports
UPDATE user_permissions
SET allowed_user_ids = TRIM(BOTH ',' FROM CONCAT_WS(',', NULLIF(allowed_user_ids, ''), (
    SELECT GROUP_CONCAT(DISTINCT u.id ORDER BY u.id)
    FROM users u
    INNER JOIN user_permissions up2 ON FIND_IN_SET(u.id, up2.allowed_user_ids)
    WHERE up2.permission_name IN ('can_access_report', 'can_access_assets_report', 'can_access_insurance_report')
)))
WHERE permission_name = 'can_access_assets_report';

UPDATE user_permissions
SET allowed_user_ids = TRIM(BOTH ',' FROM CONCAT_WS(',', NULLIF(allowed_user_ids, ''), (
    SELECT GROUP_CONCAT(DISTINCT u.id ORDER BY u.id)
    FROM users u
    INNER JOIN user_permissions up2 ON FIND_IN_SET(u.id, up2.allowed_user_ids)
    WHERE up2.permission_name IN ('can_access_report', 'can_access_assets_report', 'can_access_insurance_report')
)))
WHERE permission_name = 'can_access_insurance_report';

-- Users with fuel menu access get all fuel report sub-permissions
UPDATE user_permissions dst
INNER JOIN user_permissions src ON src.permission_name = 'can_access_fuel_menu'
SET dst.allowed_user_ids = src.allowed_user_ids
WHERE dst.permission_name IN (
    'can_generate_fuel_diesel_weekly_report',
    'can_generate_fuel_petrol_weekly_report',
    'can_generate_fuel_petrol_consumption_report',
    'can_generate_fuel_oil_consumption_report'
);

-- Users with umbrella settings access get app settings + keep sub-settings as assigned
UPDATE user_permissions dst
INNER JOIN user_permissions src ON src.permission_name = 'can_access_settings'
SET dst.allowed_user_ids = src.allowed_user_ids
WHERE dst.permission_name = 'can_access_app_settings';

-- ---------------------------------------------------------------------------
-- 3) Optional: grant ALL new permissions to SuperAdmin role users only
--    Replace 'SuperAdmin' if your role name differs
-- ---------------------------------------------------------------------------
UPDATE user_permissions dst
SET dst.allowed_user_ids = TRIM(BOTH ',' FROM CONCAT_WS(',', NULLIF(dst.allowed_user_ids, ''), (
    SELECT GROUP_CONCAT(u.id ORDER BY u.id)
    FROM users u
    WHERE LOWER(u.role) = 'superadmin'
)))
WHERE dst.permission_name IN (
    'can_access_app_settings',
    'can_access_assets_report',
    'can_access_insurance_report',
    'can_generate_fuel_diesel_weekly_report',
    'can_generate_fuel_petrol_weekly_report',
    'can_generate_fuel_petrol_consumption_report',
    'can_generate_fuel_oil_consumption_report'
);

-- ---------------------------------------------------------------------------
-- 4) Verify
-- ---------------------------------------------------------------------------
SELECT permission_name, permission_readable, permission_type, allowed_user_ids
FROM user_permissions
WHERE permission_name IN (
    'can_access_settings',
    'can_access_app_settings',
    'can_access_request_settings',
    'can_access_receive_settings',
    'can_access_issue_settings',
    'can_access_rrp_settings',
    'can_access_fuel_settings',
    'can_access_report',
    'can_access_assets_report',
    'can_access_insurance_report',
    'can_access_fuel_menu',
    'can_generate_fuel_diesel_weekly_report',
    'can_generate_fuel_petrol_weekly_report',
    'can_generate_fuel_petrol_consumption_report',
    'can_generate_fuel_oil_consumption_report'
)
ORDER BY permission_type, permission_name;
