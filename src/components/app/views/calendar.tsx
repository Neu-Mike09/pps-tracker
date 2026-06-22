"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Loader2, AlertTriangle } from "lucide-react";
import { STATUS_COLORS, PRIORITY_COLORS, TERMINAL_STATUSES } from "@/lib/constants";

interface CalEvent {
  id: string;
  controlNo: string;
  subject: string | null;
  assignedTo: string | null;
  status: string | null;
  priority: string | null;
  dateType: "target" | "activity";
  date: string;
}

interface CalData {
  year: number;
  month: number;
  events: Record<string, CalEvent[]>;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function CalendarView() {
  const setView = useAppStore((s) => s.setView);
  const setEditId = useAppStore((s) => s.setEditId);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [data, setData] = useState<CalData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
      try {
        const r = await fetch(`/api/calendar?month=${monthStr}`);
        const d = await r.json();
        if (!cancelled) setData(d);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  const goPrev = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };
  const goNext = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };
  const goToday = () => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
  };

  // Build calendar grid: weeks starting Sunday
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const cells: Array<{ day: number; current: boolean; dateStr: string; isToday: boolean }> = [];
  // Leading days from prev month
  for (let i = startWeekday - 1; i >= 0; i--) {
    const day = prevMonthDays - i;
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    cells.push({
      day,
      current: false,
      dateStr: `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      isToday: false,
    });
  }
  // Current month days
  const todayStr = new Date().toISOString().slice(0, 10);
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ day, current: true, dateStr, isToday: dateStr === todayStr });
  }
  // Trailing days to fill 6 weeks (42 cells)
  while (cells.length < 42) {
    const idx = cells.length - (startWeekday + daysInMonth) + 1;
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    cells.push({
      day: idx,
      current: false,
      dateStr: `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(idx).padStart(2, "0")}`,
      isToday: false,
    });
  }

  // Count overdue items (for header)
  const overdueCount = data
    ? Object.values(data.events).flat().filter((e) => {
        const isPast = new Date(e.date) < new Date(todayStr);
        const notTerminal = !TERMINAL_STATUSES.includes(e.status || "");
        return isPast && notTerminal;
      }).length
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
          <p className="text-sm text-slate-500">
            Activities and target dates - {MONTHS[month]} {year}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={goPrev}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={goNext}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {overdueCount > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-md p-3 text-sm">
          <AlertTriangle className="w-4 h-4" />
          <span>
            <strong>{overdueCount}</strong> overdue item{overdueCount !== 1 ? "s" : ""} this month.
            Click any item to view details.
          </span>
        </div>
      )}

      <Card>
        <CardContent className="p-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            </div>
          ) : (
            <div>
              {/* Weekday header */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="text-center text-xs font-semibold text-slate-500 py-1">
                    {d}
                  </div>
                ))}
              </div>
              {/* Day cells */}
              <div className="grid grid-cols-7 gap-1">
                {cells.map((cell, idx) => {
                  const events = data?.events[cell.dateStr] || [];
                  return (
                    <div
                      key={idx}
                      className={`min-h-[80px] sm:min-h-[110px] rounded-md border p-1 ${
                        cell.current
                          ? cell.isToday
                            ? "bg-emerald-50 border-emerald-300"
                            : "bg-white border-slate-200"
                          : "bg-slate-50 border-slate-100 text-slate-400"
                      }`}
                    >
                      <div className={`text-xs font-medium ${cell.isToday ? "text-emerald-700" : ""}`}>
                        {cell.day}
                      </div>
                      <div className="space-y-0.5 mt-1">
                        {events.slice(0, 3).map((e, i) => {
                          const isOverdue =
                            new Date(e.date) < new Date(todayStr) &&
                            !TERMINAL_STATUSES.includes(e.status || "");
                          return (
                            <button
                              key={`${e.id}-${i}`}
                              onClick={() => {
                                setEditId(e.id);
                                setView("records");
                              }}
                              className={`block w-full text-left text-[10px] leading-tight px-1 py-0.5 rounded truncate transition-colors ${
                                isOverdue
                                  ? "bg-red-100 text-red-800 hover:bg-red-200"
                                  : e.dateType === "activity"
                                  ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                              }`}
                              title={`${e.controlNo}: ${e.subject || "(no subject)"}`}
                            >
                              <span className="font-mono">{e.controlNo}</span>
                            </button>
                          );
                        })}
                        {events.length > 3 && (
                          <div className="text-[10px] text-slate-500 px-1">
                            +{events.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalIcon className="w-4 h-4 text-emerald-600" /> Legend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-amber-100 border border-amber-300 rounded" />
              <span>Activity date (meeting/event)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-slate-100 border border-slate-300 rounded" />
              <span>Target date (deadline)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-red-100 border border-red-300 rounded" />
              <span>Overdue (past, not completed)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-emerald-50 border border-emerald-300 rounded" />
              <span>Today</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* All events for this month (list) */}
      {data && Object.keys(data.events).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              All Items - {MONTHS[month]} {year}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {Object.entries(data.events)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([dateStr, evs]) => (
                  <div key={dateStr} className="flex items-start gap-3 py-1.5 border-b border-slate-100 last:border-0">
                    <div className="w-14 text-center flex-shrink-0">
                      <div className="text-[10px] uppercase text-slate-500">
                        {new Date(dateStr).toLocaleDateString("en-US", { month: "short" })}
                      </div>
                      <div className="text-lg font-bold text-slate-700 leading-none">
                        {new Date(dateStr).getDate()}
                      </div>
                    </div>
                    <div className="flex-1 space-y-1">
                      {evs.map((e, i) => {
                        const isOverdue =
                          new Date(e.date) < new Date(todayStr) &&
                          !TERMINAL_STATUSES.includes(e.status || "");
                        return (
                          <button
                            key={`${e.id}-${i}`}
                            onClick={() => {
                              setEditId(e.id);
                              setView("records");
                            }}
                            className="w-full flex items-center gap-2 text-left p-1.5 rounded hover:bg-slate-50"
                          >
                            <Badge variant="outline" className={`text-[10px] ${isOverdue ? "bg-red-100 text-red-800" : ""}`}>
                              {e.dateType === "activity" ? "Activity" : "Target"}
                            </Badge>
                            <span className="font-mono text-xs text-slate-600">{e.controlNo}</span>
                            <span className="flex-1 text-sm text-slate-900 truncate">
                              {e.subject || "(no subject)"}
                            </span>
                            {e.assignedTo && (
                              <span className="text-xs text-slate-500">{e.assignedTo}</span>
                            )}
                            {e.priority && (
                              <Badge variant="outline" className={`text-[10px] px-1 py-0 h-4 ${PRIORITY_COLORS[e.priority] || ""}`}>
                                {e.priority}
                              </Badge>
                            )}
                            {e.status && (
                              <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[e.status] || ""}`}>
                                {e.status}
                              </Badge>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
