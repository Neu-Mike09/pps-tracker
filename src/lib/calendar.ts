import { google } from "googleapis";
import { db } from "./db";
import { getSheetsConfig, getCalendarId } from "./sheets";

/**
 * Get an authenticated Google Calendar client using the same Service Account
 * credentials as the Sheets sync.
 */
async function getCalendarClient() {
  const config = await getSheetsConfig();
  if (!config) throw new Error("Google Service Account not configured. Add credentials in Settings.");

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
  activityDateTime: Date | null;
  documentType: string | null;
}

/**
 * Build a Google Calendar event object from a Communication record.
 *
 * Scheduling logic:
 * - If activityDateTime is set → use it as a timed event (1 hour duration)
 * - Else if targetDate is set → use it as an all-day event
 * - Else → no event (returns null)
 */
function buildEvent(comm: CommunicationForCalendar) {
  let start: { dateTime?: string; date?: string } | null = null;
  let end: { dateTime?: string; date?: string } | null = null;

  if (comm.activityDateTime) {
    const startTime = comm.activityDateTime.toISOString();
    const endTime = new Date(comm.activityDateTime.getTime() + 60 * 60 * 1000).toISOString();
    start = { dateTime: startTime };
    end = { dateTime: endTime };
  } else if (comm.targetDate) {
    const startDate = comm.targetDate.toISOString().slice(0, 10);
    const endDateObj = new Date(comm.targetDate.getTime() + 24 * 60 * 60 * 1000);
    const endDate = endDateObj.toISOString().slice(0, 10);
    start = { date: startDate };
    end = { date: endDate };
  } else {
    return null;
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
  if (comm.targetDate) lines.push(`Target Date: ${comm.targetDate.toISOString().slice(0, 10)}`);
  if (comm.remarks) lines.push(`\nRemarks: ${comm.remarks}`);
  lines.push(`\n--- Synced from DA RFO 5 PPS Communications Tracker`);

  const title = `${comm.controlNo} — ${comm.subject || "(no subject)"}`;

  let colorId: string | undefined;
  if (comm.status === "Accomplished" || comm.status === "Attended") colorId = "2";
  else if (comm.status === "Cancelled") colorId = "4";
  else if (comm.status === "Pending" || comm.status === "In Progress" || comm.status === "For Compliance") colorId = "5";
  else if (comm.priority === "Urgent") colorId = "11";

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
      },
    },
  };
}

/**
 * Create (or update) a Google Calendar event for a communication record.
 */
export async function syncCalendarEvent(communicationId: string): Promise<{
  action: "created" | "updated" | "skipped" | "deleted";
  eventId?: string;
}> {
  const comm = await db.communication.findUnique({
    where: { id: communicationId },
  });
  if (!comm) throw new Error("Communication not found");

  if (!comm.targetDate && !comm.activityDateTime) {
    if (comm.calendarEventId) {
      const calendar = await getCalendarClient();
      const calendarId = await getCalendarId();
      try {
        await calendar.events.delete({ calendarId, eventId: comm.calendarEventId });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("404") && !msg.toLowerCase().includes("not found")) throw e;
      }
    }
    await db.communication.update({
      where: { id: communicationId },
      data: {
        calendarEventId: null,
        calendarSyncStatus: "skipped",
        calendarSyncError: null,
        calendarSyncedAt: new Date(),
      },
    });
    return { action: "skipped" };
  }

  const eventData = buildEvent(comm);
  if (!eventData) {
    await db.communication.update({
      where: { id: communicationId },
      data: { calendarSyncStatus: "skipped", calendarSyncedAt: new Date() },
    });
    return { action: "skipped" };
  }

  const calendar = await getCalendarClient();
  const calendarId = await getCalendarId();

  if (comm.calendarEventId) {
    try {
      const updated = await calendar.events.update({
        calendarId,
        eventId: comm.calendarEventId,
        requestBody: eventData,
      });
      await db.communication.update({
        where: { id: communicationId },
        data: {
          calendarEventId: updated.data.id || comm.calendarEventId,
          calendarSyncStatus: "synced",
          calendarSyncError: null,
          calendarSyncedAt: new Date(),
        },
      });
      return { action: "updated", eventId: updated.data.id || undefined };
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
  const newEventId = created.data.id;
  if (!newEventId) throw new Error("Google Calendar did not return an event ID");

  await db.communication.update({
    where: { id: communicationId },
    data: {
      calendarEventId: newEventId,
      calendarSyncStatus: "synced",
      calendarSyncError: null,
      calendarSyncedAt: new Date(),
    },
  });
  return { action: "created", eventId: newEventId };
}

/**
 * Delete a Google Calendar event for a communication record.
 */
export async function deleteCalendarEvent(communicationId: string): Promise<void> {
  const comm = await db.communication.findUnique({
    where: { id: communicationId },
    select: { calendarEventId: true },
  });
  if (!comm?.calendarEventId) return;

  const calendar = await getCalendarClient();
  const calendarId = await getCalendarId();
  try {
    await calendar.events.delete({ calendarId, eventId: comm.calendarEventId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("404") && !msg.toLowerCase().includes("not found")) throw e;
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
