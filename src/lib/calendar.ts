import { db } from "./db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let gLoaded: any = null;
async function getGoogleapis() {
  if (!gLoaded) { const mod = await import("googleapis"); gLoaded = mod.google || mod.default || mod; }
  return gLoaded;
}
import { getSheetsConfig, getCalendarId } from "./sheets";

/**
 * Get an authenticated Google Calendar client using the same Service Account
 * credentials as the Sheets sync.
 */
async function getCalendarClient() {
  const config = await getSheetsConfig();
  if (!config) throw new Error("Google Service Account not configured. Add credentials in Settings.");

  const google = await getGoogleapis();
  const auth = new google.auth.JWT({
    email: config.clientEmail,
    key: config.privateKey,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });

  return google.calendar({ version: "v3", auth });
}

interface CommunicationForCalendar {
  id: string;
  controlNo: string;
  subject: string | null;
  fromOffice: string | null;
  referenceNo: string | null;
  assignedTo: string | null;
  status: string | null;
  priority: string | null;
  activityCategory: string | null;
  remarks: string | null;
  targetDate: Date | null;
  targetDateHasTime: boolean;
  activityDateTime: Date | null;
  activityDateTimeHasTime: boolean;
  activityEndTime: string | null;
  documentType: string | null;
}

type EventType = "activity" | "deadline";

// DA RFO 5 is in the Philippines (PHT = UTC+8, no DST).
// Render.com servers run in UTC, so we must explicitly use Asia/Manila
// whenever we need local date/time components. Using Date.getLocalX() methods
// would return UTC values on the server and shift dates to the wrong day.
const PHT_TZ = "Asia/Manila";
const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * Format a Date as YYYY-MM-DD using PHT (Asia/Manila) date components.
 * Critical for all-day calendar events — using UTC (the server's local tz on Render)
 * would shift the date to the previous day in PHT.
 */
function formatLocalDate(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: PHT_TZ,
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

/**
 * Given a start Date (stored as UTC internally) and a PHT time string "HH:MM",
 * return an ISO string representing that end time on the same calendar date in PHT.
 *
 * Why we can't use Date.setHours(): it uses the SERVER's local timezone (UTC on Render),
 * so setHours(17, 0) would set UTC hours to 17 (= 1am next day PHT), not PHT hours.
 *
 * Fix: shift the date by +8h (so UTC = PHT), use setUTCHours, then shift back.
 */
function computeEndTimeISO(startUtc: Date, phtTimeStr: string): string | null {
  const [hh, mm] = phtTimeStr.split(":").map((s) => parseInt(s, 10));
  if (isNaN(hh) || isNaN(mm)) return null;
  const shifted = new Date(startUtc.getTime() + PHT_OFFSET_MS);
  shifted.setUTCHours(hh, mm, 0, 0);
  const endUtc = new Date(shifted.getTime() - PHT_OFFSET_MS);
  return endUtc.toISOString();
}

/**
 * Build a Google Calendar event object for either the Activity date or the Deadline date.
 *
 * Scheduling logic per date:
 * - If the date has a time component (hasTime=true) → timed event
 *     - For activity: start = activityDateTime, end = activityEndTime (if provided) else start + 1 hour
 * - If the date has no time (hasTime=false) → all-day event
 *     - start = date (YYYY-MM-DD in PHT), end = next day (Google's exclusive end convention)
 */
function buildEvent(comm: CommunicationForCalendar, type: EventType) {
  let dateValue: Date | null;
  let hasTime: boolean;

  if (type === "activity") {
    dateValue = comm.activityDateTime;
    hasTime = comm.activityDateTimeHasTime;
  } else {
    dateValue = comm.targetDate;
    hasTime = comm.targetDateHasTime;
  }

  if (!dateValue) return null;

  let start: { dateTime?: string; date?: string };
  let end: { dateTime?: string; date?: string };

  if (hasTime) {
    // Timed event — start time is the stored UTC ISO string.
    // Google Calendar displays it in the viewer's timezone (PHT for DA RFO 5 users).
    const startTime = dateValue.toISOString();
    let endTime: string;

    if (type === "activity" && comm.activityEndTime) {
      // activityEndTime is "HH:MM" in PHT (e.g., "17:00" = 5:00 PM PHT).
      // Must compute the correct UTC ISO using PHT offset (see computeEndTimeISO).
      const computed = computeEndTimeISO(dateValue, comm.activityEndTime);
      endTime = computed || new Date(dateValue.getTime() + 60 * 60 * 1000).toISOString();
    } else {
      // Default: 1 hour duration
      endTime = new Date(dateValue.getTime() + 60 * 60 * 1000).toISOString();
    }

    start = { dateTime: startTime };
    end = { dateTime: endTime };
  } else {
    // All-day event using PHT date (not UTC, which would shift to prev day in PH timezone)
    const startDate = formatLocalDate(dateValue);
    // Compute next day in PHT
    const endDateObj = new Date(dateValue.getTime() + 24 * 60 * 60 * 1000);
    const endDate = formatLocalDate(endDateObj);
    start = { date: startDate };
    end = { date: endDate };
  }

  const lines: string[] = [];
  lines.push(`Control No.: ${comm.controlNo}`);
  if (comm.documentType) lines.push(`Type: ${comm.documentType}`);
  if (comm.fromOffice) lines.push(`From: ${comm.fromOffice}`);
  if (comm.referenceNo) lines.push(`Reference: ${comm.referenceNo}`);
  if (comm.assignedTo) lines.push(`Assigned to: ${comm.assignedTo}`);
  if (comm.status) lines.push(`Status: ${comm.status}`);
  if (comm.priority) lines.push(`Priority: ${comm.priority}`);
  if (comm.activityCategory) lines.push(`Category: ${comm.activityCategory}`);

  // Show BOTH dates in the description so the user can see context regardless of which event they're viewing
  if (comm.activityDateTime) {
    const aTime = comm.activityDateTimeHasTime
      ? comm.activityDateTime.toLocaleString("en-US", { timeZone: PHT_TZ, dateStyle: "medium", timeStyle: "short" })
      : formatLocalDate(comm.activityDateTime);
    let aLine = `Activity Date: ${aTime}`;
    if (comm.activityDateTimeHasTime && comm.activityEndTime) aLine += ` - ${comm.activityEndTime}`;
    lines.push(aLine);
  }
  if (comm.targetDate) {
    const tTime = comm.targetDateHasTime
      ? comm.targetDate.toLocaleString("en-US", { timeZone: PHT_TZ, dateStyle: "medium", timeStyle: "short" })
      : formatLocalDate(comm.targetDate);
    lines.push(`Deadline: ${tTime}`);
  }

  if (comm.remarks) lines.push(`\nRemarks: ${comm.remarks}`);
  lines.push(`\n--- Synced from DA RFO 5 PPS Communications Tracker`);

  // Title indicates event type
  const typeLabel = type === "activity" ? "Activity" : "Deadline";
  const title = `${typeLabel}: ${comm.controlNo} — ${comm.subject || "(no subject)"}`;

  // Color coding
  // - Deadline events: red/orange (colorId 11 = red) so they stand out
  // - Activity events: based on status/priority
  let colorId: string | undefined;
  if (type === "deadline") {
    colorId = "11"; // red — deadlines stand out
  } else {
    if (comm.status === "Accomplished" || comm.status === "Attended") colorId = "2"; // green
    else if (comm.status === "Cancelled") colorId = "4"; // red
    else if (comm.status === "Pending" || comm.status === "In Progress" || comm.status === "For Compliance") colorId = "5"; // yellow
    else if (comm.priority === "Urgent") colorId = "11"; // red
  }

  return {
    summary: title,
    description: lines.join("\n"),
    start,
    end,
    colorId,
    extendedProperties: {
      private: {
        source: "pps-tracker",
        communicationId: comm.id,
        controlNo: comm.controlNo,
        eventType: type,
      },
    },
  };
}

/**
 * Upsert a single calendar event (either the activity event or the deadline event).
 * Returns the resulting event ID (or null if skipped).
 */
async function upsertEvent(
  calendar: Awaited<ReturnType<typeof getCalendarClient>>,
  calendarId: string,
  comm: CommunicationForCalendar,
  type: EventType,
  existingEventId: string | null
): Promise<{ action: "created" | "updated" | "skipped" | "deleted"; eventId: string | null }> {
  const eventData = buildEvent(comm, type);

  if (!eventData) {
    // No date for this event type — delete any existing event
    if (existingEventId) {
      try {
        await calendar.events.delete({ calendarId, eventId: existingEventId });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("404") && !msg.toLowerCase().includes("not found")) throw e;
      }
    }
    return { action: "skipped", eventId: null };
  }

  if (existingEventId) {
    try {
      const updated = await calendar.events.update({
        calendarId,
        eventId: existingEventId,
        requestBody: eventData,
      });
      return { action: "updated", eventId: updated.data.id || existingEventId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
        // Event was deleted from Google Calendar — fall through to create new
      } else {
        throw e;
      }
    }
  }

  const created = await calendar.events.insert({ calendarId, requestBody: eventData });
  return { action: "created", eventId: created.data.id || null };
}

/**
 * Create (or update) Google Calendar events for a communication record.
 *
 * If BOTH activityDateTime and targetDate are set, TWO separate calendar events are created:
 *   1. Activity event (stored in calendarEventId)
 *   2. Deadline event (stored in deadlineCalendarEventId)
 *
 * Each event is timed or all-day based on whether the source date has a time component.
 */
export async function syncCalendarEvent(communicationId: string): Promise<{
  action: "created" | "updated" | "skipped" | "deleted";
  eventId?: string;
}> {
  const comm = await db.communication.findUnique({
    where: { id: communicationId },
  });
  if (!comm) throw new Error("Communication not found");

  const calendar = await getCalendarClient();
  const calendarId = await getCalendarId();

  const commForCalendar: CommunicationForCalendar = {
    id: comm.id,
    controlNo: comm.controlNo,
    subject: comm.subject,
    fromOffice: comm.fromOffice,
    referenceNo: comm.referenceNo,
    assignedTo: comm.assignedTo,
    status: comm.status,
    priority: comm.priority,
    activityCategory: comm.activityCategory,
    remarks: comm.remarks,
    targetDate: comm.targetDate,
    targetDateHasTime: comm.targetDateHasTime,
    activityDateTime: comm.activityDateTime,
    activityDateTimeHasTime: comm.activityDateTimeHasTime,
    activityEndTime: comm.activityEndTime,
    documentType: comm.documentType,
  };

  // Sync the activity event (if activityDateTime is set)
  let activityResult: { action: string; eventId: string | null } = { action: "skipped", eventId: null };
  if (comm.activityDateTime) {
    try {
      activityResult = await upsertEvent(calendar, calendarId, commForCalendar, "activity", comm.calendarEventId);
    } catch (e) {
      // Surface error to caller but continue with deadline sync
      const errMsg = e instanceof Error ? e.message : String(e);
      await db.communication.update({
        where: { id: communicationId },
        data: { calendarSyncStatus: "failed", calendarSyncError: `Activity event: ${errMsg}` },
      });
      throw e;
    }
  } else if (comm.calendarEventId) {
    // Activity date was cleared — delete the existing activity event
    try {
      await calendar.events.delete({ calendarId, eventId: comm.calendarEventId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("404") && !msg.toLowerCase().includes("not found")) throw e;
    }
    activityResult = { action: "deleted", eventId: null };
  }

  // Sync the deadline event (if targetDate is set)
  let deadlineResult: { action: string; eventId: string | null } = { action: "skipped", eventId: null };
  if (comm.targetDate) {
    try {
      deadlineResult = await upsertEvent(calendar, calendarId, commForCalendar, "deadline", comm.deadlineCalendarEventId);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      await db.communication.update({
        where: { id: communicationId },
        data: { calendarSyncStatus: "failed", calendarSyncError: `Deadline event: ${errMsg}` },
      });
      throw e;
    }
  } else if (comm.deadlineCalendarEventId) {
    // Deadline was cleared — delete the existing deadline event
    try {
      await calendar.events.delete({ calendarId, eventId: comm.deadlineCalendarEventId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("404") && !msg.toLowerCase().includes("not found")) throw e;
    }
    deadlineResult = { action: "deleted", eventId: null };
  }

  // Update the record with new event IDs
  const hasAnyEvent = !!activityResult.eventId || !!deadlineResult.eventId;
  await db.communication.update({
    where: { id: communicationId },
    data: {
      calendarEventId: activityResult.eventId,
      deadlineCalendarEventId: deadlineResult.eventId,
      calendarSyncStatus: hasAnyEvent ? "synced" : "skipped",
      calendarSyncError: null,
      calendarSyncedAt: new Date(),
    },
  });

  // For backwards compat with callers that check the return value
  if (activityResult.eventId) return { action: activityResult.action as any, eventId: activityResult.eventId };
  if (deadlineResult.eventId) return { action: deadlineResult.action as any, eventId: deadlineResult.eventId };
  return { action: "skipped" };
}

/**
 * Delete ALL Google Calendar events (activity + deadline) for a communication record.
 */
export async function deleteCalendarEvent(communicationId: string): Promise<void> {
  const comm = await db.communication.findUnique({
    where: { id: communicationId },
    select: { calendarEventId: true, deadlineCalendarEventId: true },
  });
  if (!comm) return;

  const calendar = await getCalendarClient();
  const calendarId = await getCalendarId();

  const eventIds = [comm.calendarEventId, comm.deadlineCalendarEventId].filter(Boolean) as string[];
  for (const eventId of eventIds) {
    try {
      await calendar.events.delete({ calendarId, eventId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("404") && !msg.toLowerCase().includes("not found")) throw e;
    }
  }
}

/**
 * Test the Google Calendar connection.
 */
export async function testCalendarConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const config = await getSheetsConfig();
    if (!config) {
      return { ok: false, message: "Google Service Account not configured. Configure it in the Google Sheets section first." };
    }

    const google = await getGoogleapis();
    const auth = new google.auth.JWT({
      email: config.clientEmail,
      key: config.privateKey,
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    const calendar = google.calendar({ version: "v3", auth });

    const calendarId = await getCalendarId();
    const res = await calendar.calendarList.list();
    const calendars = res.data.items || [];
    const calendarNames = calendars.map((c) => `${c.id} (${c.summary || "no name"})`);

    try {
      const targetCal = await calendar.calendars.get({ calendarId });
      return {
        ok: true,
        message: `Connected to calendar "${targetCal.data.summary || calendarId}" (ID: ${calendarId}). Available calendars: ${calendarNames.join(", ") || "none"}`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        message: `Connected to Google Calendar API, but cannot access calendar "${calendarId}". ${msg}. Make sure you shared this calendar with ${config.clientEmail} (Editor access). Available calendars: ${calendarNames.join(", ") || "none"}`,
      };
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
