import { GoogleGenerativeAI } from "@google/generative-ai";
import { DOCUMENT_TYPES, PRIORITIES } from "./constants";
import { getAllOptions } from "./options";

export interface ExtractedData {
  documentType: string | null;
  dateOfDocument: string | null;
  fromOffice: string | null;
  subject: string | null;
  referenceNo: string | null;
  activityCategorySuggestion: string | null;
  activityDateTimeSuggestion: string | null;
  activityEndTimeSuggestion: string | null;
  targetDateSuggestion: string | null;
  prioritySuggestion: string | null;
  rawText: string;
}

function getEmptyResult(rawText: string): ExtractedData {
  return { documentType: null, dateOfDocument: null, fromOffice: null, subject: null, referenceNo: null, activityCategorySuggestion: null, activityDateTimeSuggestion: null, activityEndTimeSuggestion: null, targetDateSuggestion: null, prioritySuggestion: null, rawText };
}

/**
 * Build the extraction prompt using dynamic options from the database.
 * This way, if the admin adds/removes options, the AI uses the updated list.
 */
async function buildPrompt(): Promise<string> {
  const opts = await getAllOptions();
  return `You are an expert assistant for the DA RFO 5 Planning and Programming Section. Extract fields from this government communication and return STRICT JSON only.

Fields:
1. "documentType" — one of: ${DOCUMENT_TYPES.map((t) => `"${t}"`).join(", ")}
2. "dateOfDocument" — YYYY-MM-DD or null
3. "fromOffice" — sender office/person
4. "subject" — subject line or title
5. "referenceNo" — reference number or null
6. "activityCategorySuggestion" — one of: ${opts.activityCategory.map((c) => `"${c}"`).join(", ")}
7. "activityDateTimeSuggestion" — if the document announces a meeting/event/activity/schedule, return the START date+time in ISO format (YYYY-MM-DDTHH:MM:00). If only a date is given (no time), use just the date (YYYY-MM-DD). If no activity is scheduled, return null. If a time range is given (e.g., "9:00 AM to 4:00 PM"), use the START time (9:00 AM). Look for phrases like "on June 11, 2026 at 9:30 AM", "scheduled on", "to be held on", "meeting on", "from 8:00 AM to 4:00 PM".
8. "activityEndTimeSuggestion" — if the activity has an end time (e.g., "8:00 AM - 4:00 PM"), return the end time in HH:MM format (24-hour). For "4:00 PM" return "16:00". If no end time is mentioned, return null.
9. "targetDateSuggestion" — deadline date YYYY-MM-DD or null. Look for: "no later than", "deadline for submission", "on or before", "due on"
10. "prioritySuggestion" — one of: ${PRIORITIES.map((p) => `"${p}"`).join(", ")}. Urgent if URGENT/IMMEDIATE, High if deadline within 2 weeks, Normal default
11. "rawText" — full text transcript

Return ONLY valid JSON, no markdown.`;
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
    const prompt = await buildPrompt();
    let result;

    if (isImage || isPdf) {
      result = await model.generateContent([
        prompt,
        { inlineData: { mimeType: isPdf ? "application/pdf" : mimeType, data: fileBuffer.toString("base64") } },
      ]);
    } else {
      let textContent = "";
      try { textContent = fileBuffer.toString("utf-8"); } catch { return getEmptyResult("(Could not extract text. Please fill manually.)"); }
      result = await model.generateContent([`${prompt}\n\n---\n${textContent.slice(0, 15000)}\n---`]);
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
