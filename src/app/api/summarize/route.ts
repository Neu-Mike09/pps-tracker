import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/summarize — generates a 2-3 sentence summary of a document
// Body: { fileId: "xxx" } or { photoPath: "/api/files/xxx" } or { photoPath: '["/api/files/a","/api/files/b"]' }
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    let fileIds: string[] = [];

    // If photoPath is given, extract fileIds from it (supports JSON array format too)
    if (body.photoPath) {
      const photoPath = String(body.photoPath);
      // Try parsing as JSON array (new multi-file format)
      if (photoPath.trim().startsWith("[")) {
        try {
          const arr = JSON.parse(photoPath);
          if (Array.isArray(arr)) {
            for (const p of arr) {
              const match = String(p).match(/\/api\/files\/(.+)$/);
              if (match) fileIds.push(match[1]);
            }
          }
        } catch {}
      }
      // Legacy single-path format
      if (fileIds.length === 0) {
        const match = photoPath.match(/\/api\/files\/(.+)$/);
        if (match) fileIds.push(match[1]);
      }
    }
    // Direct fileId
    if (fileIds.length === 0 && body.fileId) {
      fileIds = [body.fileId];
    }

    if (fileIds.length === 0) {
      return NextResponse.json({ error: "No file ID provided" }, { status: 400 });
    }

    // Fetch all files from the database
    const files = await db.uploadedFile.findMany({
      where: { id: { in: fileIds } },
    });

    if (files.length === 0) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const model = genAI.getGenerativeModel({ model: modelName });

    const SUMMARY_PROMPT = `You are reviewing a government communication document for the DA RFO 5 Planning and Programming Section.
${files.length > 1 ? `\nNote: The document spans ${files.length} files (multiple pages/scans). Consider all of them together.` : ""}

Provide a concise 2-3 sentence summary of this document. The summary should explain:
1. What the document is about (the main topic/purpose)
2. What action is required from the recipient (if any)
3. Any key dates or deadlines mentioned

Keep it plain, professional, and easy to read. Do not use markdown or bullet points — just 2-3 sentences in a single paragraph.`;

    // Build the content parts for Gemini (prompt + all image/PDF files + text)
    const parts: Array<string | { inlineData: { mimeType: string; data: string } }> = [SUMMARY_PROMPT];
    const textSections: string[] = [];

    for (const file of files) {
      const ext = file.filename.split(".").pop()?.toLowerCase() || "";
      const isImage = file.mimeType.startsWith("image/");
      const isPdf = file.mimeType === "application/pdf" || ext === "pdf";
      const fileBuffer = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data as Uint8Array);

      if (isImage || isPdf) {
        parts.push({
          inlineData: {
            mimeType: isPdf ? "application/pdf" : file.mimeType,
            data: fileBuffer.toString("base64"),
          },
        });
      } else {
        try {
          const text = fileBuffer.toString("utf-8").slice(0, 8000);
          textSections.push(`--- ${file.filename} ---\n${text}\n--- end ---`);
        } catch {}
      }
    }
    if (textSections.length > 0) {
      parts.push(`\n\nAdditional text-based files:\n\n${textSections.join("\n\n")}`);
    }

    const result = await model.generateContent(parts);
    const summary = result.response.text().trim();
    return NextResponse.json({ summary });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
