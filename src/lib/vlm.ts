import ZAI from "z-ai-web-dev-sdk";
import { DOCUMENT_TYPES, ACTIVITY_CATEGORIES } from "./constants";

export interface ExtractedData {
  documentType: string | null;
  dateOfDocument: string | null; // ISO YYYY-MM-DD
  fromOffice: string | null;
  subject: string | null;
  referenceNo: string | null;
  activityCategorySuggestion: string | null;
  activityDateTimeSuggestion: string | null; // ISO datetime if mentioned
  rawText: string;
}

const EXTRACTION_PROMPT = `You are an expert assistant helping the Planning and Programming Section of the Department of Agriculture - Regional Field Office No. 5 (DA RFO 5).

You are given a photo of an incoming government communication (letter, memorandum, email, indorsement, invitation, etc.). Extract the following fields and return STRICT JSON only.

# Fields to extract

1. "documentType" — one of exactly: ${DOCUMENT_TYPES.map((t) => `"${t}"`).join(", ")}. Pick the closest match. If unclear, use "Others".
2. "dateOfDocument" — the date printed on the document itself, in ISO format YYYY-MM-DD. If not present, return null.
3. "fromOffice" — the name of the office, person, or organization that sent the communication. Include the role/title if helpful (e.g., "Office of the Secretary - Planning and Monitoring Service"). If signed by a person, use the office first.
4. "subject" — the subject line or title of the communication. Verbatim from the document. If no explicit subject, summarize the main topic in one short sentence.
5. "referenceNo" — official reference/routing number (e.g., "RDC 5 Resolution No. 1-14, s. 2026", "Memo No. PMS-2026-045"). If none, return null.
6. "activityCategorySuggestion" — one of exactly: ${ACTIVITY_CATEGORIES.map((c) => `"${c}"`).join(", ")}. Choose based on context. If unclear, return "Others".
7. "activityDateTimeSuggestion" — if the document announces a meeting/event/activity, return the date+time it happens in ISO format (YYYY-MM-DDTHH:MM:00). If no specific time, just the date (YYYY-MM-DD). If no activity, return null.
8. "rawText" — a clean transcript of the visible text in the document, preserving structure.

# Output format

Return ONLY valid JSON. No markdown, no explanation, no code fence.

Example:
{
  "documentType": "Memorandum",
  "dateOfDocument": "2026-06-09",
  "fromOffice": "Office of the Secretary - Planning and Monitoring Service",
  "subject": "ONLINE EXPLORATORY AND CONSULTATION MEETING ON THE ENHANCEMENT OF THE DEPARTMENT'S INVESTMENT PROGRAMMING PROCESS",
  "referenceNo": null,
  "activityCategorySuggestion": "Meeting",
  "activityDateTimeSuggestion": "2026-06-11T09:30:00",
  "rawText": "..."
}`;

/**
 * Extract structured data from a document photo using VLM.
 * @param imageBuffer Buffer containing image bytes
 * @param mimeType e.g. "image/jpeg", "image/png"
 */
export async function extractFromImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<ExtractedData> {
  const zai = await ZAI.create();
  const base64 = imageBuffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const response = await zai.chat.completions.createVision({
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: EXTRACTION_PROMPT },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    thinking: { type: "disabled" },
  });

  const content = response.choices[0]?.message?.content || "";

  // Strip any code fence if present
  const jsonStr = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(jsonStr);
    return parsed as ExtractedData;
  } catch {
    // Fallback: try to find first { ... } block
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as ExtractedData;
      } catch {
        // give up parsing
      }
    }
    return {
      documentType: null,
      dateOfDocument: null,
      fromOffice: null,
      subject: null,
      referenceNo: null,
      activityCategorySuggestion: null,
      activityDateTimeSuggestion: null,
      rawText: content,
    };
  }
}
