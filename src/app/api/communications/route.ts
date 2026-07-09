import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { generateControlNumber } from "@/lib/control-number";
import { appendCommunicationRow, getSheetsConfig } from "@/lib/sheets";
import { syncCalendarEvent } from "@/lib/calendar";
import { TERMINAL_STATUSES } from "@/lib/constants";

export const runtime = "nodejs";

// GET /api/communications - list with filters
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const assignedTo = url.searchParams.get("assignedTo") || "";
  const category = url.searchParams.get("category") || "";
  const yearStr = url.searchParams.get("year");
  const overdueOnly = url.searchParams.get("overdue") === "1";
  const upcomingOnly = url.searchParams.get("upcoming") === "1";
  const limit = parseInt(url.searchParams.get("limit") || "0", 10) || undefined;

  // Sorting
  const sortField = url.searchParams.get("sortField") || "dateReceived";
  const sortDir = url.searchParams.get("sortDir") || "desc";

  // Date range filters
  const dateRecvFrom = url.searchParams.get("dateRecvFrom");
  const dateRecvTo = url.searchParams.get("dateRecvTo");
  const deadlineFrom = url.searchParams.get("deadlineFrom");
  const deadlineTo = url.searchParams.get("deadlineTo");
  const activityFrom = url.searchParams.get("activityFrom");
  const activityTo = url.searchParams.get("activityTo");

  // Multi-select column filters (comma-separated)
  const fromOfficeValues = url.searchParams.get("fromOfficeValues");
  const controlNoValues = url.searchParams.get("controlNoValues");

  const where: any = {};
  if (search) {
    where.OR = [
      { controlNo: { contains: search, mode: "insensitive" } },
      { subject: { contains: search, mode: "insensitive" } },
      { fromOffice: { contains: search, mode: "insensitive" } },
      { referenceNo: { contains: search, mode: "insensitive" } },
      { remarks: { contains: search, mode: "insensitive" } },
      { assignedTo: { contains: search, mode: "insensitive" } },
    ];
  }
  if (status) where.status = status;
  if (assignedTo) where.assignedTo = assignedTo;
  if (category) where.activityCategory = category;
  if (yearStr) where.year = parseInt(yearStr, 10);

  // Multi-select filters
  if (fromOfficeValues) {
    const vals = fromOfficeValues.split(",").map((v) => v === "(blank)" ? "" : v);
    where.fromOffice = { in: vals };
  }
  if (controlNoValues) {
    const vals = controlNoValues.split(",");
    where.controlNo = { in: vals };
  }

  // Date range filters
  if (dateRecvFrom || dateRecvTo) {
    where.dateReceived = {};
    if (dateRecvFrom) where.dateReceived.gte = new Date(dateRecvFrom);
    if (dateRecvTo) { const t = new Date(dateRecvTo); t.setHours(23,59,59,999); where.dateReceived.lte = t; }
  }
  if (deadlineFrom || deadlineTo) {
    where.targetDate = {};
    if (deadlineFrom) where.targetDate.gte = new Date(deadlineFrom);
    if (deadlineTo) { const t = new Date(deadlineTo); t.setHours(23,59,59,999); where.targetDate.lte = t; }
  }
  if (activityFrom || activityTo) {
    where.activityDateTime = {};
    if (activityFrom) where.activityDateTime.gte = new Date(activityFrom);
    if (activityTo) { const t = new Date(activityTo); t.setHours(23,59,59,999); where.activityDateTime.lte = t; }
  }

  if (overdueOnly) {
    where.targetDate = { lt: new Date() };
    where.status = { notIn: TERMINAL_STATUSES };
  }

  if (upcomingOnly) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const future = new Date();
    future.setDate(future.getDate() + 30);
    where.OR = [
      { targetDate: { gte: today, lte: future } },
      { activityDateTime: { gte: today, lte: future } },
    ];
  }

  // Map sort field to Prisma field name
  const sortFieldMap: Record<string, string> = {
    controlNo: "controlNo",
    dateReceived: "dateReceived",
    fromOffice: "fromOffice",
    subject: "subject",
    assignedTo: "assignedTo",
    deadline: "targetDate",
    activityDate: "activityDateTime",
    status: "status",
  };
  const prismaSortField = sortFieldMap[sortField] || "dateReceived";
  const sortDirection = sortDir === "asc" ? "asc" : "desc";

  const records = await db.communication.findMany({
    where,
    orderBy: [{ [prismaSortField]: sortDirection }, { controlNo: "desc" }],
    take: limit,
  });

  return NextResponse.json({ records });
}

// POST /api/communications - create new
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();

    const dateReceived = body.dateReceived ? new Date(body.dateReceived) : new Date();
    if (isNaN(dateReceived.getTime())) {
      return NextResponse.json({ error: "Invalid dateReceived" }, { status: 400 });
    }

    const year = dateReceived.getFullYear();

    const parseDate = (v: string | null | undefined): Date | null => {
      if (!v) return null;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    };

    // Parse a date AND determine whether the source value explicitly included a time.
    // - "2026-07-10" (10 chars, no "T") → date-only → hasTime=false (all-day event)
    // - "2026-07-22T08:00" or any ISO with "T" and a non-midnight local time → hasTime=true (timed event)
    // - "2026-07-22T00:00" → ambiguous; treat as no time (user didn't pick a time in datetime-local)
    const parseDateWithTimeFlag = (
      v: string | null | undefined
    ): { date: Date | null; hasTime: boolean } => {
      if (!v) return { date: null, hasTime: false };
      const d = new Date(v);
      if (isNaN(d.getTime())) return { date: null, hasTime: false };
      const str = String(v);
      const hasT = str.includes("T");
      // If no "T" in the string → no time was specified
      if (!hasT) return { date: d, hasTime: false };
      // If "T" present but all time components are 00:00 → user left time at midnight, treat as no time
      const hours = d.getHours();
      const minutes = d.getMinutes();
      const seconds = d.getSeconds();
      const hasTime = hours !== 0 || minutes !== 0 || seconds !== 0;
      return { date: d, hasTime };
    };

    const activityParsed = parseDateWithTimeFlag(body.activityDateTime);
    const targetParsed = parseDateWithTimeFlag(body.targetDate);

    const recordData = {
      dateReceived,
      timeReceived: body.timeReceived || null,
      dateOfDocument: parseDate(body.dateOfDocument),
      documentType: body.documentType || null,
      fromOffice: body.fromOffice || null,
      subject: body.subject || null,
      referenceNo: body.referenceNo || null,
      assignedTo: body.assignedTo || null,
      targetDate: targetParsed.date,
      targetDateHasTime: targetParsed.hasTime,
      dateCompleted: parseDate(body.dateCompleted),
      status: body.status || null,
      activityCategory: body.activityCategory || null,
      remarks: body.remarks || null,
      year,
      priority: body.priority || null,
      activityDateTime: activityParsed.date,
      activityDateTimeHasTime: activityParsed.hasTime,
      activityEndTime: body.activityEndTime || null,
      photoPath: body.photoPath || null,
      syncStatus: "pending",
      calendarSyncStatus: "pending",
      createdById: user.id,
    };

    // Retry loop for control number generation (handles race conditions)
    let record;
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      const controlNo = await generateControlNumber(dateReceived);
      try {
        record = await db.communication.create({ data: { controlNo, ...recordData } });
        lastError = null;
        break;
      } catch (e) {
        lastError = e;
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("Unique constraint") || msg.includes("P2002")) {
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }
        throw e;
      }
    }
    if (lastError && !record) throw lastError;

    const warnings: string[] = [];
    let finalRecord = record;

    // Google Sheets sync
    const sheetsConfig = await getSheetsConfig();
    if (sheetsConfig) {
      try {
        await appendCommunicationRow(record.id);
        finalRecord = await db.communication.update({
          where: { id: record.id },
          data: { syncStatus: "synced", sheetSyncedAt: new Date(), syncError: null },
        });
        await db.syncLog.create({ data: { communicationId: record.id, status: "success" } });
      } catch (syncErr) {
        const errMsg = syncErr instanceof Error ? syncErr.message : String(syncErr);
        finalRecord = await db.communication.update({
          where: { id: record.id },
          data: { syncStatus: "failed", syncError: errMsg },
        });
        await db.syncLog.create({ data: { communicationId: record.id, status: "failed", error: errMsg } });
        warnings.push(`Google Sheets sync failed: ${errMsg}`);
      }
    } else {
      warnings.push("Google Sheets not configured — record saved locally only.");
    }

    // Google Calendar sync
    try {
      await syncCalendarEvent(record.id);
      finalRecord = await db.communication.findUnique({ where: { id: record.id } }) || finalRecord;
    } catch (calErr) {
      const errMsg = calErr instanceof Error ? calErr.message : String(calErr);
      await db.communication.update({
        where: { id: record.id },
        data: { calendarSyncStatus: "failed", calendarSyncError: errMsg },
      });
      finalRecord = await db.communication.findUnique({ where: { id: record.id } }) || finalRecord;
      warnings.push(`Google Calendar sync failed: ${errMsg}`);
    }

    if (warnings.length > 0) {
      return NextResponse.json({ record: finalRecord, warning: warnings.join(" | ") });
    }
    return NextResponse.json({ record: finalRecord });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
