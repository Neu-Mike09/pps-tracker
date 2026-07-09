import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

// POST /api/upload — store an uploaded file in the database (UploadedFile table).
// Returns { id, path, filename, mimeType, size } so the client can reference it.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Size limit: 25 MB (Render free tier has memory constraints)
    const MAX_SIZE = 25 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: `File too large. Max ${MAX_SIZE / (1024 * 1024)} MB.` }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Store the file as Bytes in the UploadedFile table.
    // This works on Render free tier (no persistent disk needed).
    const uploaded = await db.uploadedFile.create({
      data: {
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        data: buffer,
        size: file.size,
      },
    });

    // Return a path that the client can use to reference the file later.
    // The /api/files/[id] route will serve the actual bytes.
    return NextResponse.json({
      id: uploaded.id,
      path: `/api/files/${uploaded.id}`,
      filename: uploaded.filename,
      mimeType: uploaded.mimeType,
      size: uploaded.size,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
