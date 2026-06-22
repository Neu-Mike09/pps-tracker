import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { generateControlNumber } from "@/lib/control-number";
import { appendCommunicationRow, getSheetsConfig } from "@/lib/sheets";
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

   
  const where: any = {};
  if (search) {
    where.OR = [
      { controlNo: { contains: search } },
      { subject: { contains: search } },
      { fromOffice: { contains: search } },
      { referenceNo: { contains: search } },
      { remarks: { contains: search } },
      { assignedTo: { contains: search } },
    ];
  }
  if (status) where.status = status;
  if (assignedTo) where.assignedTo = assignedTo;
  if (category) where.activityCategory = category;
  if (yearStr) where.year = parseInt(yearStr, 10);

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
      {
        targetDate: { gte: today, lte: future },
      },
      {
        activityDateTime: { gte: today, lte: future },
      },
    ];
  }

  const records = await db.communication.findMany({
    where,
    orderBy: [{ dateReceived: "desc" }, { controlNo: "desc" }],
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

    // Date received: default to today
    const dateReceived = body.dateReceived ? new Date(body.dateReceived) : new Date();
    if (isNaN(dateReceived.getTime())) {
      return NextResponse.json({ error: "Invalid dateReceived" }, { status: 400 });
    }

    const year = dateReceived.getFullYear();
    const controlNo = await generateControlNumber(dateReceived);

    // Helper to parse optional date
    const parseDate = (v: string | null | undefined): Date | null => {
      if (!v) return null;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    };

    const record = await db.communication.create({
      data: {
        controlNo,
        dateReceived,
        dateOfDocument: parseDate(body.dateOfDocument),
        documentType: body.documentType || null,
        fromOffice: body.fromOffice || null,
        subject: body.subject || null,
        referenceNo: body.referenceNo || null,
        assignedTo: body.assignedTo || null,
        targetDate: parseDate(body.targetDate),
        dateCompleted: parseDate(body.dateCompleted),
        status: body.status || null,
        activityCategory: body.activityCategory || null,
        remarks: body.remarks || null,
        year,
        priority: body.priority || null,
        activityDateTime: parseDate(body.activityDateTime),
        photoPath: body.photoPath || null,
        syncStatus: "pending",
        createdById: user.id,
      },
    });

    // Try to sync to Google Sheets (non-blocking for the response, but we wait briefly)
    const sheetsConfig = await getSheetsConfig();
    if (sheetsConfig) {
      try {
        await appendCommunicationRow(record.id);
        const updated = await db.communication.update({
          where: { id: record.id },
          data: {
            syncStatus: "synced",
            sheetSyncedAt: new Date(),
            syncError: null,
          },
        });
        await db.syncLog.create({
          data: {
            communicationId: record.id,
            status: "success",
          },
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
          data: {
            communicationId: record.id,
            status: "failed",
            error: errMsg,
          },
        });
        return NextResponse.json({
          record: updated,
          warning: `Saved to database, but Google Sheets sync failed: ${errMsg}. You can retry from the Records page.`,
        });
      }
    } else {
      // Sheets not configured - that's fine, just save locally
      return NextResponse.json({
        record,
        warning: "Google Sheets not configured. Record saved locally only. Configure in Settings to enable sync.",
      });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
