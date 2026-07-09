import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { updateCommunicationRow, getSheetsConfig } from "@/lib/sheets";
import { syncCalendarEvent, deleteCalendarEvent } from "@/lib/calendar";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const record = await db.communication.findUnique({ where: { id } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ record });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await db.communication.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parseDate = (v: string | null | undefined): Date | null => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  // Parse a date AND detect whether a time was explicitly provided.
  // - "2026-07-10" (no "T") → date-only → hasTime=false (all-day event)
  // - "2026-07-22T08:00" → hasTime=true (timed event)
  // - "2026-07-22T00:00" → time at midnight, treat as no time (user didn't pick a time)
  const parseDateWithTimeFlag = (
    v: string | null | undefined
  ): { date: Date | null; hasTime: boolean } => {
    if (!v) return { date: null, hasTime: false };
    const d = new Date(v);
    if (isNaN(d.getTime())) return { date: null, hasTime: false };
    const str = String(v);
    if (!str.includes("T")) return { date: d, hasTime: false };
    const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0;
    return { date: d, hasTime };
  };

  const data: any = {};
  if (body.dateReceived !== undefined) data.dateReceived = parseDate(body.dateReceived) || existing.dateReceived;
  if (body.timeReceived !== undefined) data.timeReceived = body.timeReceived || null;
  if (body.dateOfDocument !== undefined) data.dateOfDocument = parseDate(body.dateOfDocument);
  if (body.documentType !== undefined) data.documentType = body.documentType;
  if (body.fromOffice !== undefined) data.fromOffice = body.fromOffice;
  if (body.subject !== undefined) data.subject = body.subject;
  if (body.referenceNo !== undefined) data.referenceNo = body.referenceNo;
  if (body.assignedTo !== undefined) data.assignedTo = body.assignedTo;
  if (body.targetDate !== undefined) {
    const parsed = parseDateWithTimeFlag(body.targetDate);
    data.targetDate = parsed.date;
    data.targetDateHasTime = parsed.hasTime;
  }
  if (body.dateCompleted !== undefined) data.dateCompleted = parseDate(body.dateCompleted);
  if (body.status !== undefined) data.status = body.status;
  if (body.activityCategory !== undefined) data.activityCategory = body.activityCategory;
  if (body.remarks !== undefined) data.remarks = body.remarks;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.activityDateTime !== undefined) {
    const parsed = parseDateWithTimeFlag(body.activityDateTime);
    data.activityDateTime = parsed.date;
    data.activityDateTimeHasTime = parsed.hasTime;
  }
  if (body.activityEndTime !== undefined) data.activityEndTime = body.activityEndTime || null;
  if (body.photoPath !== undefined) data.photoPath = body.photoPath;

  const record = await db.communication.update({ where: { id }, data });

  const warnings: string[] = [];
  let finalRecord = record;

  // Google Sheets sync
  const sheetsConfig = await getSheetsConfig();
  if (sheetsConfig) {
    try {
      await updateCommunicationRow(record.id);
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
    warnings.push("Google Sheets not configured — update saved locally only.");
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
}

// DELETE - admin only
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const record = await db.communication.findUnique({ where: { id } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete uploaded file from database
  if (record.photoPath) {
    const fileIdMatch = record.photoPath.match(/\/api\/files\/(.+)$/);
    if (fileIdMatch) { try { await db.uploadedFile.delete({ where: { id: fileIdMatch[1] } }); } catch {} }
  }

  // Delete calendar event
  try { await deleteCalendarEvent(id); } catch {}

  await db.syncLog.deleteMany({ where: { communicationId: id } });
  await db.communication.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

// POST - retry sync
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await db.communication.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await updateCommunicationRow(existing.id);
    const updated = await db.communication.update({
      where: { id },
      data: { syncStatus: "synced", sheetSyncedAt: new Date(), syncError: null },
    });
    await db.syncLog.create({ data: { communicationId: id, status: "success" } });
    return NextResponse.json({ record: updated });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    const updated = await db.communication.update({
      where: { id },
      data: { syncStatus: "failed", syncError: errMsg },
    });
    await db.syncLog.create({ data: { communicationId: id, status: "failed", error: errMsg } });
    return NextResponse.json({ record: updated, error: errMsg }, { status: 500 });
  }
}
