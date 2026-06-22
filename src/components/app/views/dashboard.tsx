"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, CheckCircle2, FileWarning, Plus, CalendarClock, ListChecks } from "lucide-react";
import { STATUSES, STATUS_COLORS, ACTIVITY_CATEGORIES, PRIORITY_COLORS, TERMINAL_STATUSES } from "@/lib/constants";

interface DashboardData {
  total: number;
  statusCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
  overdue: number;
  pendingSync: number;
  syncedCount: number;
  recent: Array<{
    id: string;
    controlNo: string;
    dateReceived: string;
    subject: string | null;
    fromOffice: string | null;
    status: string | null;
    priority: string | null;
    assignedTo: string | null;
    targetDate: string | null;
  }>;
  upcoming: Array<{
    id: string;
    controlNo: string;
    subject: string | null;
    targetDate: string | null;
    activityDateTime: string | null;
    status: string | null;
    priority: string | null;
    assignedTo: string | null;
  }>;
  yearAgg: Array<{ year: number; count: number }>;
}

export function DashboardView() {
  const setView = useAppStore((s) => s.setView);
  const setEditId = useAppStore((s) => s.setEditId);
  const setUser = useAppStore((s) => s.setUser);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch("/api/dashboard");
        if (!r.ok) {
          if (r.status === 401) {
            // Session expired or invalid - sign out and show login
            setUser(null);
            return;
          }
          const errData = await r.json().catch(() => ({}));
          throw new Error(errData.error || `Request failed (${r.status})`);
        }
        const d = await r.json();
        // Defensive: ensure all expected fields exist (in case API shape changes)
        const safe: DashboardData = {
          total: d.total ?? 0,
          statusCounts: d.statusCounts ?? {},
          categoryCounts: d.categoryCounts ?? {},
          overdue: d.overdue ?? 0,
          pendingSync: d.pendingSync ?? 0,
          syncedCount: d.syncedCount ?? 0,
          recent: Array.isArray(d.recent) ? d.recent : [],
          upcoming: Array.isArray(d.upcoming) ? d.upcoming : [],
          yearAgg: Array.isArray(d.yearAgg) ? d.yearAgg : [],
        };
        if (!cancelled) setData(safe);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [setUser]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 rounded-full border-4 border-emerald-200 border-t-emerald-600 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-3">
          <span className="text-red-600 text-xl">!</span>
        </div>
        <div className="text-base font-medium text-slate-900 mb-1">Could not load dashboard</div>
        <div className="text-sm text-slate-500 mb-4">{error || "Unknown error"}</div>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            {now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <Button onClick={() => setView("new")} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4 mr-1" />
          New Record
        </Button>
      </div>

      {/* Quick stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Records"
          value={data.total}
          icon={ListChecks}
          color="emerald"
          onClick={() => setView("records")}
        />
        <StatCard
          label="Overdue"
          value={data.overdue}
          icon={AlertTriangle}
          color="red"
          onClick={() => setView("records")}
        />
        <StatCard
          label="Upcoming (14d)"
          value={data.upcoming.length}
          icon={CalendarClock}
          color="amber"
          onClick={() => setView("calendar")}
        />
        <StatCard
          label="Sync Failed"
          value={data.pendingSync}
          icon={FileWarning}
          color={data.pendingSync > 0 ? "red" : "slate"}
          onClick={() => setView("records")}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status breakdown */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Status Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {STATUSES.map((s) => (
                <div key={s} className="flex items-center justify-between px-3 py-2 rounded-md border border-slate-200 bg-slate-50">
                  <span className="text-xs text-slate-700">{s}</span>
                  <Badge variant="outline" className={STATUS_COLORS[s] || "bg-slate-100"}>
                    {data.statusCounts[s] || 0}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Year breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Records by Year</CardTitle>
          </CardHeader>
          <CardContent>
            {data.yearAgg.length === 0 ? (
              <p className="text-sm text-slate-500">No records yet.</p>
            ) : (
              <div className="space-y-2">
                {data.yearAgg.map((y) => (
                  <div key={y.year} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{y.year}</span>
                    <div className="flex items-center gap-2 flex-1 ml-3">
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500"
                          style={{
                            width: `${(y.count / Math.max(...data.yearAgg.map((x) => x.count))) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs text-slate-600 w-8 text-right">{y.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upcoming activities */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-amber-600" />
            Upcoming Activities (Next 14 days)
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setView("calendar")}>
            View Calendar
          </Button>
        </CardHeader>
        <CardContent>
          {data.upcoming.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No upcoming activities.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {data.upcoming.map((u) => {
                const date = u.targetDate || u.activityDateTime;
                const isOverdue = date && new Date(date) < today && !TERMINAL_STATUSES.includes(u.status || "");
                return (
                  <button
                    key={u.id}
                    onClick={() => {
                      setEditId(u.id);
                      setView("records");
                    }}
                    className="w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-slate-50 border border-slate-100"
                  >
                    <div className={`w-12 text-center flex-shrink-0 ${isOverdue ? "text-red-600" : "text-slate-700"}`}>
                      <div className="text-[10px] uppercase">
                        {date ? new Date(date).toLocaleDateString("en-US", { month: "short" }) : "-"}
                      </div>
                      <div className="text-lg font-bold leading-none">
                        {date ? new Date(date).getDate() : "-"}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {u.subject || "(no subject)"}
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-2">
                        <span className="font-mono">{u.controlNo}</span>
                        {u.assignedTo && <span>• {u.assignedTo}</span>}
                        {u.priority && (
                          <Badge variant="outline" className={`text-[10px] px-1 py-0 h-4 ${PRIORITY_COLORS[u.priority] || ""}`}>
                            {u.priority}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {u.status && (
                      <Badge variant="outline" className={STATUS_COLORS[u.status] || ""}>
                        {u.status}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent records */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-600" />
            Recently Added
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setView("records")}>
            View All
          </Button>
        </CardHeader>
        <CardContent>
          {data.recent.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No records yet.</p>
          ) : (
            <div className="space-y-2">
              {data.recent.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setEditId(r.id);
                    setView("records");
                  }}
                  className="w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-slate-50 border border-slate-100"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {r.subject || "(no subject)"}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-2">
                      <span className="font-mono">{r.controlNo}</span>
                      {r.fromOffice && <span>• {r.fromOffice}</span>}
                    </div>
                  </div>
                  {r.status && (
                    <Badge variant="outline" className={STATUS_COLORS[r.status] || ""}>
                      {r.status}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Records by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ACTIVITY_CATEGORIES.map((c) => (
              <div key={c} className="flex items-center justify-between px-3 py-2 rounded-md border border-slate-200 bg-slate-50">
                <span className="text-xs text-slate-700">{c}</span>
                <span className="text-sm font-semibold text-slate-900">{data.categoryCounts[c] || 0}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: "emerald" | "red" | "amber" | "slate";
  onClick?: () => void;
}) {
  const colors = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    red: "bg-red-50 border-red-200 text-red-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    slate: "bg-slate-50 border-slate-200 text-slate-700",
  };
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-lg border p-3 transition-transform hover:scale-[1.02] ${colors[color]}`}
    >
      <div className="flex items-center justify-between mb-1">
        <Icon className="w-4 h-4" />
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <div className="text-xs font-medium opacity-90">{label}</div>
    </button>
  );
}
