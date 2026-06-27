import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { syncCalendarEvent } from "@/lib/calendar";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const records = await db.communication.findMany({
      where: { OR: [{ targetDate: { not: null } }, { activityDateTime: { not: null } }] },
      select: { id: true, controlNo: true },
      orderBy: { controlNo: "asc" },
    });
    const results = { total: records.length, success: 0, failed: 0, skipped: 0, errors: [] as Array<{ controlNo: string; error: string }> };
    for (const record of records) {
      try {
        const r = await syncCalendarEvent(record.id);
        if (r.action === "skipped") results.skipped++; else results.success++;
      } catch (e) {
        results.failed++;
        results.errors.push({ controlNo: record.controlNo, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return NextResponse.json(results);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
