import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { extractFromImage, extractFromMultipleFiles } from "@/lib/vlm";

export const runtime = "nodejs";
export const maxDuration = 120;

const ALLOWED_EXTENSIONS = [
  "jpg", "jpeg", "png", "webp", "gif", "bmp",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "txt", "csv", "rtf", "eml",
];
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

const MAX_FILES = 10;
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50 MB total across all files

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    // Accept either a single "file" field (backward compat) or multiple "files" fields
    const files: File[] = [];
    const single = formData.get("file");
    if (single && single instanceof File) files.push(single);
    const all = formData.getAll("files");
    for (const f of all) {
      if (f instanceof File) files.push(f);
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Too many files. Maximum ${MAX_FILES} files per upload.` }, { status: 400 });
    }

    // Validate each file
    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const mimeOk = ALLOWED_MIME_TYPES.includes(file.type);
      const extOk = ALLOWED_EXTENSIONS.includes(ext);
      if (!mimeOk && !extOk) {
        return NextResponse.json(
          { error: `Unsupported file type: ${file.type || ext} (${file.name}).` },
          { status: 400 }
        );
      }
      if (file.size > 25 * 1024 * 1024) {
        return NextResponse.json({ error: `File too large: ${file.name}. Max 25MB per file.` }, { status: 400 });
      }
    }

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      return NextResponse.json({ error: `Total size too large. Max ${MAX_TOTAL_SIZE / (1024 * 1024)}MB across all files.` }, { status: 400 });
    }

    // Read all files into buffers
    const fileData = await Promise.all(
      files.map(async (file) => ({
        buffer: Buffer.from(await file.arrayBuffer()),
        mimeType: file.type,
        fileName: file.name,
      }))
    );

    // Single file → use the simple path
    if (fileData.length === 1) {
      const extracted = await extractFromImage(fileData[0].buffer, fileData[0].mimeType, fileData[0].fileName);
      return NextResponse.json({ extracted });
    }

    // Multiple files → send all to Gemini in a single call
    const extracted = await extractFromMultipleFiles(fileData);
    return NextResponse.json({ extracted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Extraction failed: ${msg}. Please try again or fill in the fields manually.` },
      { status: 500 }
    );
  }
}
