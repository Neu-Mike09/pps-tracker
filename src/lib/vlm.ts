import { GoogleGenerativeAI } from "@google/generative-ai";
import { DOCUMENT_TYPES, ACTIVITY_CATEGORIES, PRIORITIES } from "./constants";

export interface ExtractedData {
  documentType: string | null;
  dateOfDocument: string | null;
  fromOffice: string | null;
  subject: string | null;
  referenceNo: string | null;
  activityCategorySuggestion: string | null;
  activityDateTimeSuggestion: string | null;
  targetDateSuggestion: string | null;
  prioritySuggestion: string | null;
  rawText: string;
}

const EXTRACTION_PROMPT = `You are an expert assistant for the DA RFO 5 Planning and Programming Section. Extract fields from this government communication and return STRICT JSON only.

Fields:
1. "documentType" — one of: ${DOCUMENT_TYPES.map((t) => `"${t}"`).join(", ")}
2. "dateOfDocument" — YYYY-MM-DD or null
3. "fromOffice" — sender office/person
4. "subject" — subject line or title
5. "referenceNo" — reference number or null
6. "activityCategorySuggestion" — one of: ${ACTIVITY_CATEGORIES.map((c) => `"${c}"`).join(", ")}
7. "activityDateTimeSuggestion" — meeting/event date in YYYY-MM-DDTHH:MM:00 or YYYY-MM-DD or null
8. "targetDateSuggestion" — deadline date YYYY-MM-DD or null. Look for: "no later than", "deadline for submission", "on or before", "due on"
9. "prioritySuggestion" — one of: ${PRIORITIES.map((p) => `"${p}"`).join(", ")}. Urgent if URGENT/IMMEDIATE, High if deadline within 2 weeks, Normal default
10. "rawText" — full text transcript

Return ONLY valid JSON, no markdown.`;

function getEmptyResult(rawText: string): ExtractedData {
  return { documentType: null, dateOfDocument: null, fromOffice: null, subject: null, referenceNo: null, activityCategorySuggestion: null, activityDateTimeSuggestion: null, targetDateSuggestion: null, prioritySuggestion: null, rawText };
}

export async function extractFromImage(fileBuffer: Buffer, mimeType: string, fileName?: string): Promise<ExtractedData> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set. Get a free key at https://aistudio.google.com/apikey");

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Use gemini-flash-latest (current naming convention for the flash model)
    const model = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
      generationConfig: { responseMimeType: "application/json" },
    });
    const ext = fileName?.split(".").pop()?.toLowerCase() || "";
    const isImage = mimeType.startsWith("image/");
    const isPdf = mimeType === "application/pdf" || ext === "pdf";
    let result;

    if (isImage || isPdf) {
      result = await model.generateContent([
        EXTRACTION_PROMPT,
        { inlineData: { mimeType: isPdf ? "application/pdf" : mimeType, data: fileBuffer.toString("base64") } },
      ]);
    } else {
      let textContent = "";
      try { textContent = fileBuffer.toString("utf-8"); } catch { return getEmptyResult("(Could not extract text. Please fill manually.)"); }
      result = await model.generateContent([`${EXTRACTION_PROMPT}\n\n---\n${textContent.slice(0, 15000)}\n---`]);
    }

    const content = result.response.text();
    const jsonStr = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    try { return JSON.parse(jsonStr) as ExtractedData; } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) { try { return JSON.parse(match[0]) as ExtractedData; } catch {} }
      return getEmptyResult(content);
    }
  } catch (e) {
    throw new Error(`AI extraction request failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
