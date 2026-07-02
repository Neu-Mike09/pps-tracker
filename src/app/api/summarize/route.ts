import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/summarize — generates a 2-3 sentence summary of a document
// Body: { fileId: "xxx" } or { photoPath: "/api/files/xxx" }
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    let fileId = body.fileId;

    // If photoPath is given, extract fileId from it
    if (!fileId && body.photoPath) {
      const match = body.photoPath.match(/\/api\/files\/(.+)$/);
      if (match) fileId = match[1];
    }

    if (!fileId) {
      return NextResponse.json({ error: "No file ID provided" }, { status: 400 });
    }

    // Fetch the file from the database
    const file = await db.uploadedFile.findUnique({ where: { id: fileId } });
    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const ext = file.filename.split(".").pop()?.toLowerCase() || "";
    const isImage = file.mimeType.startsWith("image/");
    const isPdf = file.mimeType === "application/pdf" || ext === "pdf";

    const SUMMARY_PROMPT = `You are reviewing a government communication document for the DA RFO 5 Planning and Programming Section.

Provide a concise 2-3 sentence summary of this document. The summary should explain:
1. What the document is about (the main topic/purpose)
2. What action is required from the recipient (if any)
3. Any key dates or deadlines mentioned

Keep it plain, professional, and easy to read. Do not use markdown or bullet points — just 2-3 sentences in a single paragraph.`;

    let result;
    if (isImage || isPdf) {
      result = await model.generateContent([
        SUMMARY_PROMPT,
        { inlineData: { mimeType: isPdf ? "application/pdf" : file.mimeType, data: file.data.toString("base64") } },
      ]);
    } else {
      // Text-based file
      let textContent = "";
      try { textContent = file.data.toString("utf-8"); } catch {
        return NextResponse.json({ summary: "Could not extract text from this file to generate a summary." });
      }
      result = await model.generateContent([
        `${SUMMARY_PROMPT}\n\n---\n${textContent.slice(0, 15000)}\n---`,
      ]);
    }

    const summary = result.response.text().trim();
    return NextResponse.json({ summary });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
