import { db } from "./db";
import { SECTION_CODE } from "./constants";

/**
 * Generate the next control number for the given year.
 * Format: PPS-YYYY-NNN (zero-padded to 3 digits, matching existing Excel format)
 *
 * Uses the MAX sequence number from existing control numbers (not a count),
 * so that deleted records don't cause collisions. If records 1,2,4 exist
 * (3 was deleted), the next number is 5 — not 4 (which would collide).
 */
export async function generateControlNumber(dateReceived: Date = new Date()): Promise<string> {
  const year = dateReceived.getFullYear();

  // Fetch all control numbers for this year and find the max sequence
  const records = await db.communication.findMany({
    where: { year },
    select: { controlNo: true },
  });

  let maxSeq = 0;
  for (const r of records) {
    const parsed = parseControlNumber(r.controlNo);
    if (parsed && parsed.seq > maxSeq) {
      maxSeq = parsed.seq;
    }
  }

  const next = maxSeq + 1;
  return `${SECTION_CODE}-${year}-${String(next).padStart(3, "0")}`;
}

/**
 * Parse a control number to extract year and sequence.
 * Example: "PPS-2026-001" -> { year: 2026, seq: 1 }
 */
export function parseControlNumber(controlNo: string): { year: number; seq: number } | null {
  const match = controlNo.match(/^[A-Z]+-(\d{4})-(\d+)$/);
  if (!match) return null;
  return { year: parseInt(match[1], 10), seq: parseInt(match[2], 10) };
}
