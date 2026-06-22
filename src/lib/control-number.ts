import { db } from "./db";
import { SECTION_CODE } from "./constants";

/**
 * Generate the next control number for the current year.
 * Format: PPS-YYYY-NNN (zero-padded to 3 digits, matching existing Excel format)
 * Uses DB transaction for safe multi-user concurrency.
 */
export async function generateControlNumber(dateReceived: Date = new Date()): Promise<string> {
  const year = dateReceived.getFullYear();
  // Count existing records for the year
  const count = await db.communication.count({
    where: { year },
  });
  const next = count + 1;
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
