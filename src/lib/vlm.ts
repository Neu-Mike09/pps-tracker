import ZAI from "z-ai-web-dev-sdk";
import { DOCUMENT_TYPES, ACTIVITY_CATEGORIES } from "./constants";

export interface ExtractedData {
  documentType: string | null;
  dateOfDocument: string | null;
  fromOffice: string | null;
  subject: string | null;
  referenceNo: string | null;
  activityCategorySuggestion: string | null;
  activityDateTimeSuggestion: string | null;
  rawText: string;
}

const EXTRACTION_PROMPT = `You are an expert assistant helping the Planning and Programming Section of the Department of Agriculture - Regional Field Office No. 5 (DA RFO 5).

You are given an incoming government communication (letter, memorandum, email, indorsement, invitation, etc.). It may be provided as an image (photo or scan), a PDF document, or plain text. Extract the following fields and return STRICT JSON only.

# Fields to extract

1. "documentType" — one of exactly: ${DOCUMENT_TYPES.map((t) => `"${t}"`).join(", ")}. Pick the closest match. If unclear, use "Others".
2. "dateOfDocument" — the date printed on the document itself, in ISO format YYYY-MM-DD. If not present, return null.
3. "fromOffice" — the name of the office, person, or organization that sent the communication. Include the role/title if helpful. If signed by a person, use the office first.
4. "subject" — the subject line or title of the communication. Verbatim from the document. If no explicit subject, summarize the main topic in one short sentence.
5. "referenceNo" — official reference/routing number (e.g., "RDC 5 Resolution No. 1-14, s. 2026"). If none, return null.
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
  "subject": "ONLINE EXPLORATORY AND CONSULTATION MEETING",
  "referenceNo": null,
  "activityCategorySuggestion": "Meeting",
  "activityDateTimeSuggestion": "2026-06-11T09:30:00",
  "rawText": "..."
}`;

export async function extractFromImage(
  fileBuffer: Buffer,
  mimeType: string,
  fileName?: string
): Promise<ExtractedData> {
  let content = "";
  try {
    const zai = await ZAI.create();
    const ext = fileName?.split(".").pop()?.toLowerCase() || "";
    const isImage = mimeType.startsWith("image/");
    const isPdf = mimeType === "application/pdf" || ext === "pdf";

    if (isImage) {
      const base64 = fileBuffer.toString("base64");
      const dataUrl = `data:${mimeType};base64,${base64}`;
      const response = await zai.chat.completions.createVision({
        messages: [{
          role: "user",
          content: [
            { type: "text", text: EXTRACTION_PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        }],
        thinking: { type: "disabled" },
      });
      content = response.choices[0]?.message?.content || "";
    } else if (isPdf) {
      const base64 = fileBuffer.toString("base64");
      const dataUrl = `data:application/pdf;base64,${base64}`;
      const response = await zai.chat.completions.createVision({
        messages: [{
          role: "user",
          content: [
            { type: "text", text: EXTRACTION_PROMPT },
            { type: "file_url", file_url: { url: dataUrl } },
          ],
        }],
        thinking: { type: "disabled" },
      });
      content = response.choices[0]?.message?.content || "";
    } else {
      let textContent = "";
      try {
        textContent = fileBuffer.toString("utf-8");
      } catch {
        return {
          documentType: null, dateOfDocument: null, fromOffice: null,
          subject: null, referenceNo: null, activityCategorySuggestion: null,
          activityDateTimeSuggestion: null,
          rawText: "(Could not extract text from this file format. Please fill in the fields manually.)",
        };
      }
      const truncated = textContent.slice(0, 15000);
      const textPrompt = `${EXTRACTION_PROMPT}\n\n# Document content\n\nThe following is the text content extracted from the uploaded file:\n\n---\n${truncated}\n---`;
      const response = await zai.chat.completions.create({
        messages: [{ role: "user", content: textPrompt }],
        thinking: { type: "disabled" },
      });
      content = response.choices[0]?.message?.content || "";
    }

    const jsonStr = content
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    try {
      return JSON.parse(jsonStr) as ExtractedData;
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try { return JSON.parse(match[0]) as ExtractedData; } catch {}
      }
      return {
        documentType: null, dateOfDocument: null, fromOffice: null,
        subject: null, referenceNo: null, activityCategorySuggestion: null,
        activityDateTimeSuggestion: null, rawText: content,
      };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`AI extraction request failed: ${msg}`);
  }
}
