"use client";

import { useEffect } from "react";
import { useAppStore, ViewKey } from "@/lib/store";
import { DashboardView } from "./views/dashboard";
import { NewRecordView } from "./views/new-record";
import { RecordsView } from "./views/records";
import { CalendarView } from "./views/calendar";
import { SettingsView } from "./views/settings";
import {
  LayoutDashboard,
  PlusCircle,
  ListChecks,
  CalendarDays,
  Settings,
  Sprout,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS: Array<{ key: ViewKey; label: string; icon: React.ElementType }> = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "new", label: "New Record", icon: PlusCircle },
  { key: "records", label: "Records", icon: ListChecks },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "settings", label: "Settings", icon: Settings },
];

export function AppShell() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const badges = useAppStore((s) => s.badges);
  const setBadges = useAppStore((s) => s.setBadges);

  // Fetch badge counts on mount and refresh every 60 seconds
  useEffect(() => {
    const fetchBadges = async () => {
      try {
        const res = await fetch("/api/dashboard");
        if (!res.ok) return;
        const data = await res.json();
        setBadges({
          overdue: data.overdue || 0,
          upcoming: data.upcoming?.length || 0,
          syncFailed: data.pendingSync || 0,
        });
      } catch {}
    };
    fetchBadges();
    const interval = setInterval(fetchBadges, 60000);
    return () => clearInterval(interval);
  }, [setBadges]);

  const handleLogout = async () => {
    try { localStorage.setItem("pps_logged_out", "1"); } catch {}
    try { await fetch("/api/auth/logout", { method: "POST", keepalive: true }); } catch {}
    setUser(null);
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen flex bg-[#f5f0e1]">
      {/* Left Sidebar */}
      <aside
        className={cn(
          "fixed lg:sticky top-0 left-0 z-30 w-60 h-screen flex flex-col",
          "bg-[#1a3c2e] border-r border-[#2d5a3e]",
          "transition-transform duration-300",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="p-4 border-b border-[#2d5a3e]">
          <div className="flex items-center gap-2.5">
            <img src="/pps-logo.png" alt="PPS Logo" className="w-9 h-9 rounded-lg object-contain bg-white/90 p-0.5" />
            <div>
              <div className="text-sm font-bold text-[#d4c9a8] leading-tight">DA RFO 5</div>
              <div className="text-[10px] text-[#8fae7a] leading-tight">PPS Tracker</div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-[#6b8e5c] font-semibold px-3 py-2">Main Menu</div>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = view === item.key;
            const isAdminOnly = item.key === "settings";
            const disabled = isAdminOnly && user?.role !== "admin";

            // Badge counts per nav item
            let badgeCount = 0;
            let badgeColor = "";
            if (item.key === "records") { badgeCount = badges.overdue; badgeColor = "bg-red-500"; }
            else if (item.key === "calendar") { badgeCount = badges.upcoming; badgeColor = "bg-amber-500"; }
            else if (item.key === "settings") { badgeCount = badges.syncFailed; badgeColor = "bg-orange-500"; }

            return (
              <button
                key={item.key}
                onClick={() => !disabled && setView(item.key)}
                disabled={disabled}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  isActive
                    ? "bg-[#2d6a4f] text-[#f5f0e1] shadow-md"
                    : "text-[#8fae7a] hover:bg-[#245a42] hover:text-[#d4c9a8]",
                  disabled && "opacity-30 cursor-not-allowed"
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
                {badgeCount > 0 && (
                  <span className={`flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white ${badgeColor}`}>
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User profile + logout */}
        <div className="p-3 border-t border-[#2d5a3e]">
          <div className="flex items-center gap-2.5 mb-2 px-1">
            <div className="w-8 h-8 rounded-full bg-[#2d6a4f] text-[#d4c9a8] flex items-center justify-center text-xs font-bold">
              {user?.name?.slice(0, 2).toUpperCase() || "AD"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-[#d4c9a8] truncate">{user?.name}</div>
              <div className="text-[10px] text-[#6b8e5c] capitalize">{user?.role}</div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start text-[#8fae7a] hover:text-[#d4c9a8] hover:bg-[#245a42]"
          >
            <LogOut className="w-3.5 h-3.5 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-[#1a3c2e]/95 backdrop-blur-sm border-b border-[#2d5a3e] print:hidden">
          <div className="flex items-center justify-between h-14 px-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden text-[#d4c9a8] hover:bg-[#245a42]"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
              <h2 className="text-sm font-semibold text-[#d4c9a8] capitalize">{view === "new" ? "New Record" : view}</h2>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-[10px] text-[#6b8e5c]">
              <Sprout className="w-3 h-3" />
              Planning, Monitoring & Evaluation Division
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 min-w-0 p-4 sm:p-6">
          {view === "dashboard" && <DashboardView />}
          {view === "new" && <NewRecordView />}
          {view === "records" && <RecordsView />}
          {view === "calendar" && <CalendarView />}
          {view === "settings" && user?.role === "admin" && <SettingsView />}
        </main>
      </div>
    </div>
  );
}
