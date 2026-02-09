'use client';
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import { useAuthContext } from "@/context/AuthContext";
import { cn } from "@/utils/utils";
import { ChevronDown } from "lucide-react";
import { sidebarLinks } from "./sidebarConfig";
import { SidebarIcon } from "./SidebarIcon";
import { useApprovalCountsContext } from "@/context/ApprovalCountsContext";
import { withBasePath } from "@/lib/urls";
interface SidebarProps {
    collapsed: boolean;
    mobileOpen: boolean;
    onCloseMobile: () => void;
}
export default function Sidebar({ collapsed, mobileOpen, onCloseMobile }: SidebarProps) {
    const pathname = usePathname();
    const { permissions } = useAuthContext();
    const { counts } = useApprovalCountsContext();
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const isExpanded = useMemo(() => !collapsed || mobileOpen, [collapsed, mobileOpen]);
    const hasPermission = (permission?: string, permissionsAny?: string[]) => {
        if (!permissions)
            return false;
        if (permissionsAny && permissionsAny.length > 0) {
            return permissionsAny.some((perm) => permissions.includes(perm));
        }
        if (!permission)
            return true;
        return permissions.includes(permission);
    };
    const toggleSubmenu = (label: string) => {
        setActiveMenu(activeMenu === label ? null : label);
    };
    const handlePrimaryClick = (label: string, hasSubmenu: boolean) => {
        if (hasSubmenu) {
            toggleSubmenu(label);
        }
        else if (mobileOpen) {
            onCloseMobile();
        }
    };
    const handleSubmenuClick = () => {
        if (mobileOpen) {
            onCloseMobile();
        }
    };
    return (<Fragment>
      {mobileOpen && (<div className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm md:hidden" onClick={onCloseMobile}/>)}
      <aside className={cn("fixed inset-y-0 left-0 z-40 flex h-full flex-col border-r border-[#0b2a63]/40 bg-gradient-to-b from-[#003594] via-[#002f7a] to-[#001b47] transition-all duration-300 md:static md:translate-x-0", mobileOpen ? "translate-x-0" : "-translate-x-full", collapsed && !mobileOpen ? "md:w-16" : "md:w-64", "w-64 md:flex")}>
        <div className="p-4 bg-[#003594]/60 border-b border-white/10">
          <div className={cn("relative overflow-hidden rounded-2xl border border-white/15 bg-white/10 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.35)] transition-all duration-300", !isExpanded && "p-2")}>
            <div className="absolute -top-20 -right-10 h-36 w-36 rounded-full bg-white/20 blur-3xl"/>
            <div className="absolute -bottom-10 -left-10 h-28 w-28 rounded-full bg-[#d2293b]/20 blur-2xl"/>
            <div className={cn("relative z-10 flex items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-white via-white/80 to-white/50 p-2 ring-1 ring-white/40 shadow-[0_16px_40px_rgba(0,0,0,0.28)] backdrop-blur-sm transition-all duration-300", !isExpanded && "p-1")}>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(210,41,59,0.15),transparent_60%)]" aria-hidden/>
              <Image src={withBasePath("/images/nepal_airlines_logo.jpeg")} alt="Nepal Airlines Logo" width={isExpanded ? 132 : 40} height={isExpanded ? 132 : 40} className={cn("relative z-10 h-auto max-h-24 w-full rounded-xl object-contain", !isExpanded && "max-h-12")} priority/>
            </div>
            {isExpanded && (<span className="relative z-10 mt-3 block text-center text-[11px] font-semibold uppercase tracking-[0.35em] text-white/80">
                GIMS
              </span>)}
          </div>
        </div>
        <nav className="px-2 py-4 overflow-y-auto">
        {sidebarLinks.map(({ label, href, icon, submenu, permission, permissionsAny, badgeKey }) => {
            if (!hasPermission(permission, permissionsAny)) {
                return null;
            }
            const showApprovalsBadge = badgeKey === 'approvals' && (counts.total ?? 0) > 0;
            const badgeValue = counts.total ?? 0;
            return (<div key={label}>
              <Link href={href} className={cn("relative flex items-center px-4 py-2.5 text-gray-100 hover:bg-white/10 rounded-md transition-colors", "hover:text-white", pathname === href && "bg-white/20 text-white font-medium", "group")} onClick={() => handlePrimaryClick(label, Boolean(submenu))}>
                <SidebarIcon name={icon} className="text-gray-300 group-hover:text-white transition-colors"/>
                {isExpanded && <span className="ml-3">{label}</span>}
                {showApprovalsBadge && (<span className={cn("absolute flex min-w-[28px] items-center justify-center rounded-full bg-[#d2293b] px-2 text-[11px] font-semibold text-white shadow-lg", isExpanded ? "right-4 top-1/2 -translate-y-1/2" : "right-2 top-2")}>
                    {badgeValue}
                  </span>)}
                {submenu && isExpanded && (<ChevronDown className={cn("ml-auto transition-transform text-gray-300 group-hover:text-white", activeMenu === label && "rotate-180")} size={16}/>)}
              </Link>
              {submenu && activeMenu === label && isExpanded && (<div className="ml-4 mt-1 space-y-1">
                  {submenu.map(({ label: subLabel, href: subHref, permission: subPermission, permissionsAny: subPermissionsAny, icon: subIcon }) => hasPermission(subPermission, subPermissionsAny) && (<Link key={subHref} href={subHref} className={cn("flex items-center px-4 py-2 text-gray-200 hover:bg-white/10 rounded-md transition-colors", "hover:text-white group", pathname === subHref && "bg-white/20 text-white font-medium")} onClick={handleSubmenuClick}>
                        {subIcon && (<SidebarIcon name={subIcon} className="text-gray-300 group-hover:text-white transition-colors"/>)}
                        <span className={cn("ml-3", !subIcon && "ml-8")}>{subLabel}</span>
                      </Link>))}
                </div>)}
            </div>);
        })}
        </nav>
      </aside>
    </Fragment>);
}
