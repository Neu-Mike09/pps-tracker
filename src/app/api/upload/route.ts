import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";

const ALLOWED_MIME_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv", "application/rtf", "message/rfc822",
];
const ALLOWED_EXTENSIONS = [
  "jpg", "jpeg", "png", "webp", "gif", "bmp",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "txt", "csv", "rtf", "eml",
];
const MAX_FILE_SIZE = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const mimeOk = ALLOWED_MIME_TYPES.includes(file.type);
    const extOk = ALLOWED_EXTENSIONS.includes(ext);
    if (!mimeOk && !extOk) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type || ext}. Allowed: images, PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, CSV, RTF, EML` },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large. Max 25MB." }, { status: 400 });
    }

    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).slice(2, 8);
    const filename = `doc-${timestamp}-${randomStr}.${ext}`;

    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(path.join(uploadsDir, filename), buffer);

    const imageExtensions = ["jpg", "jpeg", "png", "webp", "gif", "bmp"];
    const isImage = imageExtensions.includes(ext);

    return NextResponse.json({
      path: `/uploads/${filename}`,
      filename,
      size: file.size,
      mimeType: file.type,
      extension: ext,
      isImage,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Upload failed: ${msg}` }, { status: 500 });
  }
}
