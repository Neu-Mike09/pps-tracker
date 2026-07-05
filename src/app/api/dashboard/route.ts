import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { STATUSES, ACTIVITY_CATEGORIES, TERMINAL_STATUSES } from "@/lib/constants";

export const runtime = "nodejs";

// GET /api/dashboard - returns aggregated stats for dashboard
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();

  // Total counts
  const total = await db.communication.count();

  // Status summary
  const statusCounts: Record<string, number> = {};
  for (const s of STATUSES) {
    const count = await db.communication.count({ where: { status: s } });
    statusCounts[s] = count;
  }

  // Category counts
  const categoryCounts: Record<string, number> = {};
  for (const c of ACTIVITY_CATEGORIES) {
    const count = await db.communication.count({ where: { activityCategory: c } });
    categoryCounts[c] = count;
  }

  // Overdue count (target date passed, not in terminal status)
  const overdue = await db.communication.count({
    where: {
      targetDate: { lt: now, not: null },
      status: { notIn: TERMINAL_STATUSES },
    },
  });

  // Sync status
  const pendingSync = await db.communication.count({
    where: { syncStatus: "failed" },
  });
  const syncedCount = await db.communication.count({
    where: { syncStatus: "synced" },
  });

  // Recent records (last 5)
  const recent = await db.communication.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  // Upcoming activities (next 14 days - target or activity date)
  const fourteenDays = new Date();
  fourteenDays.setDate(fourteenDays.getDate() + 14);
  const upcoming = await db.communication.findMany({
    where: {
      OR: [
        {
          targetDate: { gte: now, lte: fourteenDays },
          status: { notIn: TERMINAL_STATUSES },
        },
        {
          activityDateTime: { gte: now, lte: fourteenDays },
          status: { notIn: TERMINAL_STATUSES },
        },
      ],
    },
    orderBy: { targetDate: "asc" },
    take: 10,
  });

  // Year breakdown
  const yearAgg = await db.communication.groupBy({
    by: ["year"],
    _count: { _all: true },
    orderBy: { year: "desc" },
  });

  return NextResponse.json({
    total,
    statusCounts,
    categoryCounts,
    overdue,
    pendingSync,
    syncedCount,
    recent,
    upcoming,
    yearAgg: yearAgg.map((y) => ({ year: y.year, count: y._count._all })),
  });
}
