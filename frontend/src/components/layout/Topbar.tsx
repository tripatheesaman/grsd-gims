'use client';
import { useAuthContext } from '@/context/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, } from '@/components/ui/dropdown-menu';
import { Menu, Sparkle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NotificationBell } from './NotificationBell';
import { cn } from '@/utils/utils';
interface TopBarProps {
    onToggleSidebar: () => void;
}
export default function TopBar({ onToggleSidebar }: TopBarProps) {
    const { user, logout } = useAuthContext();
    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase();
    };
    const displayName = user?.UserInfo.name || 'Guest User';
    const roleLabel = user?.UserInfo.role
        ? user.UserInfo.role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        : 'User';
    return (<header className="sticky top-0 z-30">
      <div className="relative flex h-20 items-center justify-between px-4 md:px-6">
        <div className="absolute inset-0 -z-10 bg-white/85 shadow-[0_10px_40px_rgba(0,32,77,0.12)] backdrop-blur-md"/>
        <div className="absolute inset-0 -z-20 bg-gradient-to-r from-white via-white/70 to-transparent opacity-90"/>
        <div className="absolute inset-x-0 -bottom-4 -top-16 -z-30 bg-gradient-to-b from-[#001c40]/40 via-transparent to-transparent blur-3xl opacity-40" aria-hidden/>

        <div className="flex items-center gap-3 md:gap-4">
          <Button variant="ghost" size="icon" onClick={onToggleSidebar} className="group relative h-11 w-11 rounded-full bg-white/60 p-0 shadow-[0_10px_20px_rgba(0,53,148,0.12)] transition-transform hover:-translate-y-0.5 hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-[#003594]/40">
            <span className="absolute inset-0 rounded-full bg-gradient-to-br from-[#003594]/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100"/>
            <Menu className="h-5 w-5 text-[#003594]"/>
          </Button>

          <div className="hidden md:flex items-center gap-3 rounded-2xl border border-white/30 bg-gradient-to-br from-white/95 via-white/80 to-white/60 px-4 py-2 shadow-[0_18px_45px_rgba(0,53,148,0.18)]">
            <Sparkle className="h-4 w-4 text-[#d2293b]"/>
            <div className="flex flex-col leading-tight text-[#0f172a]">
              <span className="text-[10px] font-semibold uppercase tracking-[0.4em] text-[#003594]/70">GIMS</span>
              <span className="text-sm font-medium text-[#003594]">Ground Support Inventory Management System</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 md:gap-6">
          <div className="hidden sm:flex items-center gap-3 rounded-2xl border border-white/40 bg-gradient-to-r from-white/90 via-white/75 to-white/60 px-4 py-2 shadow-[0_14px_32px_rgba(0,53,148,0.15)]">
            <div className="text-right leading-tight">
              <p className="text-xs uppercase tracking-[0.3em] text-[#003594]/60">Welcome</p>
              <p className="text-sm font-semibold text-[#0f172a]">{displayName}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-[#003594]/40"/>
            <span className="rounded-full border border-[#003594]/20 bg-[#003594]/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-[#003594]">
              {roleLabel}
            </span>
          </div>

          <NotificationBell />

          <DropdownMenu>
            <DropdownMenuTrigger className="outline-none">
              <div className="relative">
                <span className="absolute -inset-1 rounded-full bg-gradient-to-br from-[#003594]/20 via-[#d2293b]/20 to-transparent blur" aria-hidden/>
                <Avatar className="relative h-11 w-11 border-2 border-white/70 shadow-[0_10px_25px_rgba(0,53,148,0.22)] transition-transform hover:-translate-y-0.5">
                  <AvatarImage src="" alt={displayName}/>
                  <AvatarFallback className="bg-gradient-to-br from-[#003594] to-[#001a4d] text-white font-medium">
                    {getInitials(displayName)}
                  </AvatarFallback>
                </Avatar>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 p-3 bg-white/95 border border-[#002a6e]/15 shadow-[0_30px_60px_rgba(0,21,82,0.18)] backdrop-blur">
              <DropdownMenuLabel className="text-sm font-semibold text-[#003594]">
                Account
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-[#002a6e]/10"/>
              <div className="rounded-lg border border-[#003594]/15 bg-[#f8faff]/80 p-3 text-sm text-[#0f172a]">
                <p className="font-semibold">{displayName}</p>
                <p className="text-xs uppercase tracking-wide text-[#003594]/70">{roleLabel}</p>
              </div>
              <DropdownMenuItem onClick={logout} className={cn("mt-2 flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-2 py-2 text-sm text-[#0f172a] transition-colors", "hover:border-[#003594]/20 hover:bg-[#003594]/8 hover:text-[#003594] focus:border-[#003594]/20 focus:bg-[#003594]/10")}>
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>);
}
