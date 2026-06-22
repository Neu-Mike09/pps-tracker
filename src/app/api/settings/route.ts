import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSheetsConfig, saveSheetsConfig, testSheetsConnection } from "@/lib/sheets";

export const runtime = "nodejs";

// GET /api/settings - get current Google Sheets config (masks private key)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = await getSheetsConfig();
  if (!config) {
    return NextResponse.json({
      configured: false,
      spreadsheetId: "",
      clientEmail: "",
      privateKey: "",
      sheetName: "Incoming Communications",
    });
  }
  return NextResponse.json({
    configured: true,
    spreadsheetId: config.spreadsheetId,
    clientEmail: config.clientEmail,
    // Don't return the full private key for security - just whether it's set
    privateKey: config.privateKey ? "***configured***" : "",
    sheetName: config.sheetName,
  });
}

// PUT /api/settings - admin only
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden - admin only" }, { status: 403 });
  }

  const body = await req.json();

  // If privateKey is the mask placeholder, fetch existing value to preserve
  let privateKey = body.privateKey;
  if (!privateKey || privateKey === "***configured***") {
    const existing = await getSheetsConfig();
    privateKey = existing?.privateKey || "";
  }

  await saveSheetsConfig({
    spreadsheetId: body.spreadsheetId || "",
    clientEmail: body.clientEmail || "",
    privateKey,
    sheetName: body.sheetName || "Incoming Communications",
  });

  return NextResponse.json({ ok: true });
}

// POST /api/settings with action=test - test connection (admin only)
export async function POST(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden - admin only" }, { status: 403 });
  }

  const result = await testSheetsConnection();
  return NextResponse.json(result);
}
