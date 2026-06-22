import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/calendar?month=YYYY-MM
// Returns events for the given month keyed by day
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const monthParam = url.searchParams.get("month"); // YYYY-MM

  let year: number, month: number;
  if (monthParam) {
    const [y, m] = monthParam.split("-").map((n) => parseInt(n, 10));
    year = y;
    month = m - 1; // JS months are 0-indexed
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth();
  }

  // Range: first day to last day of month (with buffer)
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59);

  // Find records where targetDate or activityDateTime falls in this month
  const records = await db.communication.findMany({
    where: {
      OR: [
        { targetDate: { gte: start, lte: end } },
        { activityDateTime: { gte: start, lte: end } },
      ],
    },
    orderBy: { targetDate: "asc" },
  });

  // Group by day (YYYY-MM-DD)
  const events: Record<string, Array<{
    id: string;
    controlNo: string;
    subject: string | null;
    assignedTo: string | null;
    status: string | null;
    priority: string | null;
    dateType: "target" | "activity";
    date: string;
  }>> = {};

  for (const r of records) {
    const dates: Array<{ d: Date | null; type: "target" | "activity" }> = [
      { d: r.targetDate, type: "target" },
      { d: r.activityDateTime, type: "activity" },
    ];
    for (const { d, type } of dates) {
      if (!d) continue;
      if (d < start || d > end) continue;
      const key = d.toISOString().slice(0, 10);
      if (!events[key]) events[key] = [];
      // Avoid duplicates if both dates fall on same day - include both with dateType
      events[key].push({
        id: r.id,
        controlNo: r.controlNo,
        subject: r.subject,
        assignedTo: r.assignedTo,
        status: r.status,
        priority: r.priority,
        dateType: type,
        date: d.toISOString(),
      });
    }
  }

  return NextResponse.json({
    year,
    month: month + 1,
    events,
  });
}
