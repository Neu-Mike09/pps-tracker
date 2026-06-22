import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { appendCommunicationRow, updateCommunicationRow, getSheetsConfig } from "@/lib/sheets";

export const runtime = "nodejs";

// GET /api/communications/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const record = await db.communication.findUnique({ where: { id } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ record });
}

// PATCH /api/communications/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

   
  const data: any = {};
  if (body.dateReceived !== undefined) data.dateReceived = parseDate(body.dateReceived) || existing.dateReceived;
  if (body.dateOfDocument !== undefined) data.dateOfDocument = parseDate(body.dateOfDocument);
  if (body.documentType !== undefined) data.documentType = body.documentType;
  if (body.fromOffice !== undefined) data.fromOffice = body.fromOffice;
  if (body.subject !== undefined) data.subject = body.subject;
  if (body.referenceNo !== undefined) data.referenceNo = body.referenceNo;
  if (body.assignedTo !== undefined) data.assignedTo = body.assignedTo;
  if (body.targetDate !== undefined) data.targetDate = parseDate(body.targetDate);
  if (body.dateCompleted !== undefined) data.dateCompleted = parseDate(body.dateCompleted);
  if (body.status !== undefined) data.status = body.status;
  if (body.activityCategory !== undefined) data.activityCategory = body.activityCategory;
  if (body.remarks !== undefined) data.remarks = body.remarks;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.activityDateTime !== undefined) data.activityDateTime = parseDate(body.activityDateTime);
  if (body.photoPath !== undefined) data.photoPath = body.photoPath;

  const record = await db.communication.update({ where: { id }, data });

  // Sync the update to Google Sheets (find-and-update by control number).
  // Non-fatal: if sync fails, the DB update is still preserved; we just
  // mark syncStatus as "failed" so the user can retry from the Records view.
  const sheetsConfig = await getSheetsConfig();
  if (sheetsConfig) {
    try {
      await updateCommunicationRow(record.id);
      const updated = await db.communication.update({
        where: { id: record.id },
        data: {
          syncStatus: "synced",
          sheetSyncedAt: new Date(),
          syncError: null,
        },
      });
      await db.syncLog.create({
        data: { communicationId: record.id, status: "success" },
      });
      return NextResponse.json({ record: updated });
    } catch (syncErr) {
      const errMsg = syncErr instanceof Error ? syncErr.message : String(syncErr);
      const updated = await db.communication.update({
        where: { id: record.id },
        data: {
          syncStatus: "failed",
          syncError: errMsg,
        },
      });
      await db.syncLog.create({
        data: { communicationId: record.id, status: "failed", error: errMsg },
      });
      return NextResponse.json({
        record: updated,
        warning: `Saved to database, but Google Sheets sync failed: ${errMsg}. You can retry from the Records page.`,
      });
    }
  }

  // Sheets not configured - just return the DB record
  return NextResponse.json({
    record,
    warning: "Google Sheets not configured. Update saved locally only.",
  });
}

// DELETE /api/communications/[id] - admin only
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await db.communication.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

// POST /api/communications/[id] with action=retry-sync
// Re-attempt Google Sheets sync
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await db.communication.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    // Use update (finds row by control no., updates if found, appends if not).
    // This handles both "retry a failed create" and "retry a failed edit".
    await updateCommunicationRow(existing.id);
    const updated = await db.communication.update({
      where: { id },
      data: {
        syncStatus: "synced",
        sheetSyncedAt: new Date(),
        syncError: null,
      },
    });
    await db.syncLog.create({
      data: { communicationId: id, status: "success" },
    });
    return NextResponse.json({ record: updated });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    const updated = await db.communication.update({
      where: { id },
      data: { syncStatus: "failed", syncError: errMsg },
    });
    await db.syncLog.create({
      data: { communicationId: id, status: "failed", error: errMsg },
    });
    return NextResponse.json({ record: updated, error: errMsg }, { status: 500 });
  }
}
