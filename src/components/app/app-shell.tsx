"use client";

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
  FileText,
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

  const handleLogout = async () => {
    // Set a local flag so the page reload skips the /api/auth/me check
    // (which can return the stale user if the cookie wasn't cleared
    // properly in cross-origin iframe scenarios).
    try {
      localStorage.setItem("pps_logged_out", "1");
    } catch {
      // localStorage may be unavailable in some embed contexts - ignore
    }
    try {
      // Call the logout endpoint to clear the session cookie on the server.
      // Use keepalive so the request completes even if the page is unloading.
      await fetch("/api/auth/logout", { method: "POST", keepalive: true });
    } catch {
      // Ignore network errors — we clear local state regardless
    }
    // Immediately clear the user from the store so the UI switches to the
    // login screen without relying on a page reload + cookie round-trip.
    setUser(null);
    // Hard reload to reset all component state and trigger the logout flag check.
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top bar (mobile + desktop) */}
      <header className="sticky top-0 z-30 bg-emerald-700 text-white shadow-md print:hidden">
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden text-white hover:bg-emerald-600"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle menu"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-white/15 flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
              <div className="hidden sm:block">
                <div className="text-sm font-semibold leading-tight">DA RFO 5 - PPS</div>
                <div className="text-[10px] text-emerald-100 leading-tight">
                  Incoming Communications Tracker
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <div className="text-xs font-medium">{user?.name}</div>
              <div className="text-[10px] text-emerald-100 capitalize">{user?.role}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-emerald-600"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed lg:sticky top-14 lg:top-14 left-0 z-20 w-60 h-[calc(100vh-3.5rem)] bg-white border-r border-slate-200 transition-transform print:hidden",
            sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          )}
        >
          <nav className="p-3 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = view === item.key;
              const isAdminOnly = item.key === "settings";
              const disabled = isAdminOnly && user?.role !== "admin";
              return (
                <button
                  key={item.key}
                  onClick={() => !disabled && setView(item.key)}
                  disabled={disabled}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-emerald-50 text-emerald-700"
                      : "text-slate-700 hover:bg-slate-50",
                    disabled && "opacity-40 cursor-not-allowed"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-slate-200">
            <div className="text-[10px] text-slate-500 leading-tight">
              <div className="font-semibold text-slate-700">Planning & Programming Section</div>
              <div>PMED - DA RFO 5</div>
            </div>
          </div>
        </aside>

        {/* Backdrop for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 top-14 z-10 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 max-w-full">
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
