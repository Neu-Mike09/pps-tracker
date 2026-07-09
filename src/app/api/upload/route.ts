import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const ALLOWED_MIME_TYPES = ["image/jpeg","image/png","image/webp","image/gif","image/bmp","application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation","text/plain","text/csv","application/rtf","message/rfc822"];
const ALLOWED_EXTENSIONS = ["jpg","jpeg","png","webp","gif","bmp","pdf","doc","docx","xls","xlsx","ppt","pptx","txt","csv","rtf","eml"];
const MAX_FILE_SIZE = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!ALLOWED_MIME_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(ext))
      return NextResponse.json({ error: `Unsupported file type: ${file.type || ext}` }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "File too large. Max 25MB." }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadedFile = await db.uploadedFile.create({ data: { filename: file.name, mimeType: file.type || "application/octet-stream", data: buffer, size: file.size } });
    const isImage = ["jpg","jpeg","png","webp","gif","bmp"].includes(ext);
    return NextResponse.json({ path: `/api/files/${uploadedFile.id}`, filename: file.name, size: file.size, mimeType: file.type, extension: ext, isImage });
  } catch (e) {
    return NextResponse.json({ error: `Upload failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
