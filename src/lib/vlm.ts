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
9. "targetDateSuggestion" — deadline date in YYYY-MM-DD format (date only, NO time). Look for: "no later than", "deadline for submission", "on or before", "due on". Deadlines are typically whole-day events — do NOT include a time even if the document mentions one incidentally.
10. "prioritySuggestion" — one of: ${PRIORITIES.map((p) => `"${p}"`).join(", ")}. Urgent if URGENT/IMMEDIATE, High if deadline within 2 weeks, Normal default
11. "rawText" — full text transcript

Return ONLY valid JSON, no markdown.`;
}

export async function extractFromImage(fileBuffer: Buffer, mimeType: string, fileName?: string): Promise<ExtractedData> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set. Get a free key at https://aistudio.google.com/apikey");

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Use gemini-2.5-flash as default (stable model on both free and Pro tiers).
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const model = genAI.getGenerativeModel({
      model: modelName,
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

    return parseGeminiResponse(result.response.text());
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    if (errMsg.includes("429") || errMsg.toLowerCase().includes("quota")) {
      throw new Error(
        `Gemini API quota exceeded. The free tier has a 20 requests/day limit. ` +
        `To fix: (1) Get a Pro/paid API key from https://aistudio.google.com/apikey, ` +
        `(2) Update the GEMINI_API_KEY environment variable on Render with the new key. ` +
        `Original error: ${errMsg}`
      );
    }
    throw new Error(`AI extraction request failed: ${errMsg}`);
  }
}

/**
 * Extract fields from MULTIPLE files in a single Gemini call.
 * All images/PDFs are sent as inlineData parts so Gemini can read them all at once.
 * This is more efficient than multiple separate calls and lets the model correlate
 * information across pages of the same document.
 *
 * For text-based files (DOC, TXT, etc.), each file's text is included as a separate
 * labeled section in the prompt.
 */
export async function extractFromMultipleFiles(
  files: Array<{ buffer: Buffer; mimeType: string; fileName: string }>
): Promise<ExtractedData> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set. Get a free key at https://aistudio.google.com/apikey");

  if (files.length === 0) throw new Error("No files provided");
  if (files.length === 1) return extractFromImage(files[0].buffer, files[0].mimeType, files[0].fileName);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: "application/json" },
    });
    const prompt = await buildPrompt();

    // Separate image/PDF files from text-based files
    const imageParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
    const textSections: string[] = [];

    for (const f of files) {
      const ext = f.fileName.split(".").pop()?.toLowerCase() || "";
      const isImage = f.mimeType.startsWith("image/");
      const isPdf = f.mimeType === "application/pdf" || ext === "pdf";
      if (isImage || isPdf) {
        imageParts.push({
          inlineData: {
            mimeType: isPdf ? "application/pdf" : f.mimeType,
            data: f.buffer.toString("base64"),
          },
        });
      } else {
        try {
          const text = f.buffer.toString("utf-8").slice(0, 8000);
          textSections.push(`--- ${f.fileName} ---\n${text}\n--- end ${f.fileName} ---`);
        } catch {}
      }
    }

    // Build the request parts: prompt + all images + combined text
    const parts: Array<string | { inlineData: { mimeType: string; data: string } }> = [prompt];
    for (const img of imageParts) parts.push(img);
    if (textSections.length > 0) {
      parts.push(`\n\nAdditional text-based files:\n\n${textSections.join("\n\n")}`);
    }

    const result = await model.generateContent(parts);
    return parseGeminiResponse(result.response.text());
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    if (errMsg.includes("429") || errMsg.toLowerCase().includes("quota")) {
      throw new Error(
        `Gemini API quota exceeded. To fix: update the GEMINI_API_KEY on Render with a Pro/paid key. ` +
        `Original error: ${errMsg}`
      );
    }
    throw new Error(`AI extraction request failed: ${errMsg}`);
  }
}

/**
 * Shared JSON parsing logic — handles markdown fences, regex extraction, and field normalization.
 */
function parseGeminiResponse(content: string): ExtractedData {
  let parsed: ExtractedData | null = null;

  // Attempt 1: Direct parse (responseMimeType should force pure JSON)
  try {
    parsed = JSON.parse(content) as ExtractedData;
  } catch {
    // Attempt 2: Strip markdown code fences
    const stripped = content
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    try {
      parsed = JSON.parse(stripped) as ExtractedData;
    } catch {
      // Attempt 3: Extract first JSON object using regex
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]) as ExtractedData;
        } catch {
          // All parsing attempts failed
        }
      }
    }
  }

  if (!parsed) {
    console.error("[VLM] Failed to parse Gemini response as JSON. Raw content:", content.slice(0, 500));
    return getEmptyResult(content);
  }

  // Normalize: ensure all fields exist (Gemini might omit null fields)
  return {
    documentType: parsed.documentType ?? null,
    dateOfDocument: parsed.dateOfDocument ?? null,
    fromOffice: parsed.fromOffice ?? null,
    subject: parsed.subject ?? null,
    referenceNo: parsed.referenceNo ?? null,
    activityCategorySuggestion: parsed.activityCategorySuggestion ?? null,
    activityDateTimeSuggestion: parsed.activityDateTimeSuggestion ?? null,
    activityEndTimeSuggestion: parsed.activityEndTimeSuggestion ?? null,
    targetDateSuggestion: parsed.targetDateSuggestion ?? null,
    prioritySuggestion: parsed.prioritySuggestion ?? null,
    rawText: parsed.rawText || content,
  };
}
