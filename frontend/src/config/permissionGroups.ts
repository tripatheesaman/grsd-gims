/** Permission bundles for parent nav items and route guards (any-of). */

export const SETTINGS_PERMISSIONS = [
    'can_access_settings',
    'can_access_app_settings',
    'can_access_request_settings',
    'can_access_receive_settings',
    'can_access_issue_settings',
    'can_access_rrp_settings',
    'can_access_fuel_settings',
    'can_access_asset_settings',
] as const;

export const REPORT_PERMISSIONS = [
    'can_access_report',
    'can_generate_daily_issue_reports',
    'can_generate_stock_card',
    'can_generate_current_stock_report',
    'can_access_request/receive_details',
    'can_access_rrp_reports',
    'can_access_assets_report',
    'can_access_insurance_report',
    'can_access_predictive_analysis',
    'view_daily_reports',
    'view_weekly_reports',
    'view_monthly_reports',
    'can_see_all_balance_transfers',
    'can_access_fuel_menu',
    'can_generate_fuel_diesel_weekly_report',
    'can_generate_fuel_petrol_weekly_report',
    'can_generate_fuel_petrol_consumption_report',
    'can_generate_fuel_oil_consumption_report',
    'can_borrow_stocks',
] as const;

export const RECORDS_PERMISSIONS = [
    'can_access_database_records',
    'can_access_stock_records',
    'can_access_request_records',
    'can_access_issue_records',
    'can_access_receive_records',
    'can_access_rrp_records',
    'can_access_spares_issue_records',
    'can_access_fuel_issue_records',
    'can_see_all_balance_transfers_records',
] as const;

export const PRINT_PERMISSIONS = [
    'can_print',
    'can_print_request',
    'can_print_receive',
    'can_print_rrp',
] as const;

export const RECEIVE_PERMISSIONS = [
    'can_receive_items',
    'can_receive_items_from_purchase',
    'can_receive_items_from_tender',
    'can_borrow_stocks',
    'can_receive_assets',
] as const;

export const FUEL_MENU_PERMISSIONS = [
    'can_access_fuel_menu',
    'can_issue_fuel',
    'can_receive_petrol',
] as const;

export const COMMUNICATIONS_PERMISSIONS = [
    'can_access_communications',
    'can_send_communications',
    'can_assign_tasks',
    'can_close_all_messages',
] as const;

export function hasAnyPermission(
    userPermissions: string[] | undefined,
    required: readonly string[]
): boolean {
    if (!userPermissions?.length) return false;
    return required.some((p) => userPermissions.includes(p));
}
