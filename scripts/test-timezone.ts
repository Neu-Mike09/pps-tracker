// Quick test to verify the PHT timezone fix for activity end times.
// Run with: npx tsx scripts/test-timezone.ts

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;

function computeEndTimeISO(startUtc: Date, phtTimeStr: string): string | null {
  const [hh, mm] = phtTimeStr.split(":").map((s) => parseInt(s, 10));
  if (isNaN(hh) || isNaN(mm)) return null;
  const shifted = new Date(startUtc.getTime() + PHT_OFFSET_MS);
  shifted.setUTCHours(hh, mm, 0, 0);
  const endUtc = new Date(shifted.getTime() - PHT_OFFSET_MS);
  return endUtc.toISOString();
}

function formatLocalDate(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value || "1970";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const day = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${day}`;
}

console.log("=== Timezone fix verification ===\n");

// Simulate: User in PHT enters activity start = July 22 8:00 AM, end = 5:00 PM
// Browser converts to ISO: "2026-07-22T00:00:00.000Z" (8am PHT = midnight UTC)
const startTime = new Date("2026-07-22T00:00:00.000Z");
const activityEndTime = "17:00"; // 5:00 PM in 24h format

console.log("Test 1: Activity 8am-5pm PHT");
console.log(`  Start (UTC ISO): ${startTime.toISOString()}`);
console.log(`  Start (PHT display): ${startTime.toLocaleString("en-US", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}`);
console.log(`  activityEndTime: "${activityEndTime}"`);

const endTime = computeEndTimeISO(startTime, activityEndTime);
console.log(`  End (UTC ISO): ${endTime}`);
console.log(`  End (PHT display): ${new Date(endTime!).toLocaleString("en-US", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}`);
console.log(`  Expected PHT: July 22, 2026 at 5:00 PM`);
console.log(`  ✓ PASS: ${new Date(endTime!).toLocaleString("en-US", { timeZone: "Asia/Manila", timeStyle: "short" }).includes("5:00 PM")}\n`);

// Test 2: Deadline as all-day on July 10
const deadlineDate = new Date("2026-07-10T00:00:00.000Z"); // UTC midnight = 8am PHT
console.log("Test 2: Deadline all-day July 10");
console.log(`  Date (UTC ISO): ${deadlineDate.toISOString()}`);
console.log(`  formatLocalDate: ${formatLocalDate(deadlineDate)}`);
console.log(`  Expected: 2026-07-10`);
console.log(`  ✓ PASS: ${formatLocalDate(deadlineDate) === "2026-07-10"}\n`);

// Test 3: Deadline stored as midnight PHT (edge case)
const deadlinePht = new Date("2026-07-09T16:00:00.000Z"); // midnight PHT July 10 = 4pm UTC July 9
console.log("Test 3: Deadline stored as midnight PHT (4pm UTC prev day)");
console.log(`  Date (UTC ISO): ${deadlinePht.toISOString()}`);
console.log(`  formatLocalDate: ${formatLocalDate(deadlinePht)}`);
console.log(`  Expected: 2026-07-10`);
console.log(`  ✓ PASS: ${formatLocalDate(deadlinePht) === "2026-07-10"}\n`);

// Test 4: All-day event end date (next day)
console.log("Test 4: All-day event end date (next day)");
const nextDay = new Date(deadlineDate.getTime() + 24 * 60 * 60 * 1000);
console.log(`  Next day formatLocalDate: ${formatLocalDate(nextDay)}`);
console.log(`  Expected: 2026-07-11`);
console.log(`  ✓ PASS: ${formatLocalDate(nextDay) === "2026-07-11"}\n`);
