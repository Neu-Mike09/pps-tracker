import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { updateCommunicationRow, getSheetsConfig, ensureSheetHeaders } from "@/lib/sheets";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/sheets-resync
 * Admin-only. Re-syncs ALL communication records to the connected Google Sheet.
 *
 * Use cases:
 * - User connected a new Google Sheet and wants to populate it with existing records
 * - Column order changed and existing rows need to be rewritten
 * - Sheet was accidentally modified/corrupted and needs to be rebuilt
 *
 * Strategy:
 * 1. Ensure headers exist (writes title rows + headers if sheet is empty)
 * 2. For each communication record, call updateCommunicationRow which will:
 *    - Find the row by control number (column A) and overwrite it
 *    - If not found, append as a new row
 * 3. Return a summary of success/failed counts and any errors
 */
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Verify Google Sheets is configured before doing anything
    const config = await getSheetsConfig();
    if (!config) {
      return NextResponse.json({
        error: "Google Sheets is not configured. Please add your Service Account credentials in the Google Sheets Configuration section above.",
      }, { status: 400 });
    }

    // Ensure the header row exists (writes title + headers if the sheet is empty)
    try {
      await ensureSheetHeaders();
    } catch (e) {
      return NextResponse.json({
        error: `Failed to write headers to the sheet. Please verify the Sheet Name "${config.sheetName}" exists in your spreadsheet. Details: ${e instanceof Error ? e.message : String(e)}`,
      }, { status: 400 });
    }

    // Fetch ALL records, ordered by control number (oldest first — matches chronological logbook order)
    const records = await db.communication.findMany({
      select: { id: true, controlNo: true },
      orderBy: { controlNo: "asc" },
    });

    const results = {
      total: records.length,
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [] as Array<{ controlNo: string; error: string }>,
      appended: 0,
      updated: 0,
    };

    for (const record of records) {
      try {
        const r = await updateCommunicationRow(record.id);
        results.success++;
        if (r.action === "appended") results.appended++;
        else if (r.action === "updated") results.updated++;
      } catch (e) {
        results.failed++;
        results.errors.push({
          controlNo: record.controlNo,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return NextResponse.json(results);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
