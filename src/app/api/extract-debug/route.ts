import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/extract-debug
 * Admin-only diagnostic endpoint that returns the RAW Gemini response
 * (before any JSON parsing) so we can see exactly what the model returns.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: "application/json" },
    });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";

    const prompt = `Extract fields from this government communication and return JSON with these fields:
documentType, dateOfDocument (YYYY-MM-DD), fromOffice, subject, referenceNo,
activityCategorySuggestion, activityDateTimeSuggestion (ISO), activityEndTimeSuggestion (HH:MM),
targetDateSuggestion (YYYY-MM-DD), prioritySuggestion, rawText.

Return ONLY valid JSON.`;

    let result;
    if (isImage || isPdf) {
      result = await model.generateContent([
        prompt,
        { inlineData: { mimeType: isPdf ? "application/pdf" : file.type, data: buffer.toString("base64") } },
      ]);
    } else {
      const textContent = buffer.toString("utf-8");
      result = await model.generateContent([`${prompt}\n\n---\n${textContent.slice(0, 15000)}\n---`]);
    }

    const rawResponse = result.response.text();

    let parsed: unknown = null;
    let parseError: string | null = null;
    try {
      parsed = JSON.parse(rawResponse);
    } catch (e1) {
      try {
        const stripped = rawResponse.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
        parsed = JSON.parse(stripped);
      } catch (e2) {
        const match = rawResponse.match(/\{[\s\S]*\}/);
        if (match) {
          try { parsed = JSON.parse(match[0]); } catch (e3) { parseError = String(e3); }
        } else {
          parseError = "No JSON object found in response";
        }
      }
    }

    return NextResponse.json({
      model: modelName,
      rawResponse: rawResponse.slice(0, 5000),
      rawResponseLength: rawResponse.length,
      parsed,
      parseError,
      file: { name: file.name, type: file.type, size: file.size },
    });
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 });
  }
}
