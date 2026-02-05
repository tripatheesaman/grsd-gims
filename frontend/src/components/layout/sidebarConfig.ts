export type IconName = 'home' | 'search' | 'request' | 'log-in' | 'log-out' | 'file-text' | 'printer' | 'receipt' | 'calendar' | 'print' | 'users' | 'settings' | 'fuel' | 'droplet' | 'package' | 'database' | 'trending-up' | 'check-circle' | 'briefcase';
interface SubmenuItem {
    label: string;
    href: string;
    permission?: string;
    permissionsAny?: string[];
    icon?: IconName;
    submenu?: SubmenuItem[];
}
interface SidebarLink {
    label: string;
    href: string;
    icon: IconName;
    permission?: string;
    permissionsAny?: string[];
    badgeKey?: 'approvals';
    submenu?: SubmenuItem[];
}
export const sidebarLinks: SidebarLink[] = [
    {
        label: "Dashboard",
        href: "/dashboard",
        icon: 'home',
        permission: 'can_view_dashboard'
    },
    {
        label: "Approvals",
        href: "/approvals",
        icon: 'check-circle',
        permissionsAny: [
            'can_approve_request',
            'can_approve_receive',
            'can_approve_rrp',
            'can_approve_issues'
        ],
        badgeKey: 'approvals'
    },
    {
        label: "Search",
        href: "/search",
        icon: 'search',
        permission: 'can_search_items'
    },
    {
        label: "Request",
        href: "/request",
        icon: 'request',
        permission: 'can_request_items'
    },
    {
        label: "Receive",
        href: "#",
        icon: 'log-in',
        permission: 'can_receive_items',
        submenu: [
            {
                label: "Purchase Receive",
                href: "/receive",
                icon: 'receipt',
                permission: 'can_receive_items_from_purchase'
            },
            {
                label: "Tender Receive",
                href: "/tender-receive",
                icon: 'receipt',
                permission: 'can_receive_items_from_tender'
            },
            {
                label: "Borrow Receive",
                href: "/borrow-receive",
                icon: 'receipt',
                permission: 'can_borrow_stocks'
            }
        ]
    },
    {
        label: "Issue",
        href: "/issue",
        icon: 'log-out',
        permission: 'can_issue_items'
    },
    {
        label: "RRP",
        href: "/rrp",
        icon: 'receipt',
        permission: 'can_create_rrp'
    },
    {
        label: "Balance Transfer",
        href: "/balance-transfer",
        icon: 'package',
        permission: 'can_transfer_one_stock_balance_to_another'
    },
    {
        label: "Assets",
        href: "/assets",
        icon: 'briefcase',
        permission: 'can_access_asset_management_system'
    },
    {
        label: "Full Records",
        href: "#",
        icon: 'database',
        permission: 'can_access_database_records',
        submenu: [
            {
                label: "Stock Records",
                href: "/records/stock",
                permission: 'can_access_stock_records',
                icon: 'file-text'
            },
            {
                label: "Request Records",
                href: "/records/request",
                permission: 'can_access_request_records',
                icon: 'request'
            },
            {
                label: "Issue Records",
                href: "/records/issue",
                permission: 'can_access_issue_records',
                icon: 'log-out'
            },
            {
                label: "Receive Records",
                href: "/records/receive",
                permission: 'can_access_receive_records',
                icon: 'log-in'
            },
            {
                label: "RRP Records",
                href: "/records/rrp",
                permission: 'can_access_rrp_records',
                icon: 'receipt'
            },
            {
                label: "Spare Issue Records",
                href: "/records/spare-issue",
                permission: 'can_access_spares_issue_records',
                icon: 'log-out'
            },
            {
                label: "Fuel Issue Records",
                href: "/records/fuel-issue",
                permission: 'can_access_fuel_issue_records',
                icon: 'fuel'
            },
            {
                label: "Balance Transfer Records",
                href: "/records/balance-transfer",
                permission: 'can_see_all_balance_transfers_records',
                icon: 'file-text'
            },
        ]
    },
    {
        label: "Users",
        href: "/users",
        icon: 'users',
        permission: 'can_manage_users'
    },
    {
        label: "Reports",
        href: "#",
        icon: 'file-text',
        permission: 'can_access_report',
        submenu: [
            {
                label: "Daily Issue Report",
                href: "/reports/daily-issue",
                permission: 'can_generate_daily_issue_reports',
                icon: 'calendar'
            },
            {
                label: "Stock Card",
                href: "/reports/stock-card",
                permission: 'can_generate_stock_card',
                icon: 'file-text'
            },
            {
                label: "Stock Report",
                href: "/reports/current-stock",
                permission: 'can_generate_current_stock_report',
                icon: 'file-text'
            },
            {
                label: "Request & Receive Report",
                href: "/reports/request-receive",
                permission: 'can_access_request/receive_details',
                icon: 'file-text'
            },
            {
                label: "Borrow History Report",
                href: "/reports/borrow-history",
                permission: 'can_borrow_stocks',
                icon: 'file-text'
            },
            {
                label: "Receive & RRP Report",
                href: "/reports/receive-rrp",
                permission: 'can_access_rrp_reports',
                icon: 'file-text'
            },
            {
                label: "Predictive Analytics",
                href: "/analytics/predictive",
                permission: 'can_access_predictive_analysis',
                icon: 'trending-up'
            },
            {
                label: "Daily",
                href: "/reports/daily",
                permission: 'view_daily_reports',
                icon: 'calendar'
            },
            {
                label: "Weekly",
                href: "/reports/weekly",
                permission: 'view_weekly_reports',
                icon: 'calendar'
            },
            {
                label: "Monthly",
                href: "/reports/monthly",
                permission: 'view_monthly_reports',
                icon: 'calendar'
            },
            {
                label: "Balance Transfer Reports",
                href: "/reports/balance-transfer",
                permission: 'can_see_all_balance_transfers',
                icon: 'file-text'
            },
            {
                label: "Fuel Reports",
                href: "/reports/fuel",
                permission: 'can_access_fuel_menu',
                icon: 'fuel',
                submenu: [
                    {
                        label: "Weekly Diesel",
                        href: "/reports/fuel/diesel/weekly",
                        permission: 'can_access_fuel_menu',
                        icon: 'droplet'
                    },
                    {
                        label: "Weekly Petrol",
                        href: "/reports/fuel/petrol/weekly",
                        permission: 'can_access_fuel_menu',
                        icon: 'droplet'
                    },
                    {
                        label: "Petrol Consumption",
                        href: "/reports/fuel/petrol/consumption",
                        permission: 'can_access_fuel_menu',
                        icon: 'droplet'
                    },
                    {
                        label: "Oil Consumption",
                        href: "/reports/fuel/oil/consumption",
                        permission: 'can_access_fuel_menu',
                        icon: 'droplet'
                    }
                ]
            }
        ],
    },
    {
        label: "Print",
        href: "#",
        icon: 'printer',
        permission: 'can_print',
        submenu: [
            {
                label: "Request",
                href: "/print/request",
                permission: 'can_print_request',
                icon: 'print'
            },
            {
                label: "Receive",
                href: "/print/receive",
                permission: 'can_print_receive',
                icon: 'print'
            },
            {
                label: "RRP",
                href: "/print/rrp",
                permission: 'can_print_rrp',
                icon: 'print'
            }
        ]
    },
    {
        label: "Fuels & Lubes",
        href: "#",
        icon: 'fuel',
        permission: 'can_access_fuel_menu',
        submenu: [
            {
                label: "Fuel Issue",
                href: "/fuels/issue",
                permission: 'can_issue_fuel',
                icon: 'droplet'
            },
            {
                label: "Receive Petrol",
                href: "/fuels/receive",
                permission: 'can_receive_petrol',
                icon: 'package'
            }
        ]
    },
    {
        label: "Settings",
        href: "#",
        icon: 'settings',
        permission: 'can_access_settings',
        submenu: [
            {
                label: "App Settings",
                href: "/settings/app",
                permission: 'can_access_settings',
                icon: 'settings'
            },
            {
                label: "Request Settings",
                href: "/settings/request",
                permission: 'can_access_request_settings',
                icon: 'settings'
            },
            {
                label: "Receive Settings",
                href: "/settings/receive",
                permission: 'can_access_receive_settings',
                icon: 'settings'
            },
            {
                label: "Issue Settings",
                href: "/settings/issue",
                permission: 'can_access_issue_settings',
                icon: 'settings'
            },
            {
                label: "RRP Settings",
                href: "/settings/rrp",
                permission: 'can_access_rrp_settings',
                icon: 'settings'
            },
            {
                label: "Fuel Settings",
                href: "/settings/fuel",
                permission: 'can_access_settings',
                icon: 'settings'
            }
        ]
    }
];
