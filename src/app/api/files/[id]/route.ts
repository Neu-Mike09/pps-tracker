import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const file = await db.uploadedFile.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });
  // Ensure file.data is a proper Buffer (Prisma PostgreSQL Bytes handling)
  const fileBuffer = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data as Uint8Array);
  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename="${file.filename}"`,
      "Content-Length": String(file.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
