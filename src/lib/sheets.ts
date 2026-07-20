import { db } from "./db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let gLoaded: any = null;
async function getGoogle() {
  if (!gLoaded) { const mod = await import("googleapis"); gLoaded = mod.google || mod.default || mod; }
  return gLoaded;
}
import { ACTIVITY_CATEGORY_COLORS } from "./constants";

/**
 * Background + text hex colors for each activity category in Google Sheets.
 * These match the Tailwind badge colors used in the app UI (bg-X-100 / text-X-800).
 * Used by applyCategoryColorToCell() to color column Q (Activity Category).
 *
 * Google Sheets requires hex colors in the format "RRRRGGGGBBBB" (8 hex digits per channel)
 * but we use the standard "#RRGGBB" format and convert if needed.
 */
const CATEGORY_SHEET_COLORS: Record<string, { bg: string; fg: string }> = {
  "Coordination":     { bg: "#DBEAFE", fg: "#1E40AF" }, // blue-100 / blue-800
  "Reporting":        { bg: "#E0E7FF", fg: "#3730A3" }, // indigo-100 / indigo-800
  "Planning":         { bg: "#F3E8FF", fg: "#6B21A8" }, // purple-100 / purple-800
  "Monitoring":       { bg: "#CFFAFE", fg: "#155E75" }, // cyan-100 / cyan-800
  "Evaluation":       { bg: "#FFEDD5", fg: "#9A3412" }, // orange-100 / orange-800
  "Training/Seminar": { bg: "#DCFCE7", fg: "#166534" }, // green-100 / green-800
  "Meeting":          { bg: "#FEF9C3", fg: "#854D0E" }, // yellow-100 / yellow-800
  "Field Activity":   { bg: "#FEE2E2", fg: "#991B1B" }, // red-100 / red-800
  "Others":           { bg: "#F3F4F6", fg: "#1F2937" }, // gray-100 / gray-800
};

/**
 * Get Google Sheets config from Settings table.
 * Returns null if not configured.
 */
export async function getSheetsConfig() {
  const settings = await db.setting.findMany({
    where: {
      key: {
        in: [
          "google_sheet_id",
          "google_service_account_email",
          "google_service_account_private_key",
          "google_sheet_name",
        ],
      },
    },
  });
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;

  if (!map.google_sheet_id || !map.google_service_account_email || !map.google_service_account_private_key) {
    return null;
  }

  return {
    spreadsheetId: map.google_sheet_id,
    clientEmail: map.google_service_account_email,
    // Handle escaped newlines from paste input
    privateKey: map.google_service_account_private_key.replace(/\\n/g, "\n"),
    sheetName: map.google_sheet_name || "Incoming Communications",
  };
}

/**
 * Save Google Sheets config to Settings table.
 */
export async function saveSheetsConfig(config: {
  spreadsheetId: string;
  clientEmail: string;
  privateKey: string;
  sheetName?: string;
}) {
  const updates = [
    { key: "google_sheet_id", value: config.spreadsheetId },
    { key: "google_service_account_email", value: config.clientEmail },
    { key: "google_service_account_private_key", value: config.privateKey },
    { key: "google_sheet_name", value: config.sheetName || "Incoming Communications" },
  ];

  for (const { key, value } of updates) {
    await db.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}

async function getAuthClient(config: Awaited<ReturnType<typeof getSheetsConfig>>) {
  if (!config) throw new Error("Google Sheets not configured");
  const google = await getGoogle();
  return new google.auth.JWT({
    email: config.clientEmail,
    key: config.privateKey,
    // Include both Sheets and Calendar scopes so the same Service Account
    // can sync to Google Sheets AND Google Calendar.
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/calendar",
    ],
  });
}

/**
 * Ensure the target sheet has the right header row.
 * Writes headers if the sheet is empty.
 */
export async function ensureSheetHeaders() {
  const config = await getSheetsConfig();
  if (!config) throw new Error("Google Sheets not configured");

  const auth = await getAuthClient(config);
  const google = await getGoogle();
  const sheets = google.sheets({ version: "v4", auth });

  // Try to read existing header row
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheetName}!A4:R4`,
  });

  const headers = [
    "Control No.",
    "Date Received",
    "Time",
    "Date of Document",
    "Document Type",
    "From (Office/Person)",
    "Subject / Title",
    "Reference No.",
    "Assigned To",
    "Year",
    "Priority",
    "Activity Date",
    "Activity Time",
    "Target Date",
    "Date Completed",
    "Status",
    "Activity Category",
    "Remarks / Action Taken",
  ];

  const existing = res.data.values?.[0];
  const isEmpty = !existing || existing.every((c) => !c);

  if (isEmpty) {
    // Also write the title rows above (A1, A2, A3)
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.spreadsheetId,
      range: `${config.sheetName}!A1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [
          ["DEPARTMENT OF AGRICULTURE - REGIONAL FIELD OFFICE NO. 5"],
          ["Planning, Monitoring and Evaluation Division - Planning and Programming Section"],
          ["INCOMING COMMUNICATIONS"],
          headers,
        ],
      },
    });
  }
}

/**
 * Apply the category color (background + text) to column Q (Activity Category) of a specific row.
 * Called after appendCommunicationRow / updateCommunicationRow writes the values.
 *
 * Uses the Google Sheets batchUpdate API with a repeatCell request, which is the only way
 * to apply cell formatting (background color, text color, bold) via the API.
 *
 * If the category is empty or not in our color map, the cell formatting is cleared (white bg).
 */
async function applyCategoryColorToCell(
  sheets: any,
  spreadsheetId: string,
  sheetName: string,
  rowNumber: number,
  category: string | null
) {
  const colors = category ? CATEGORY_SHEET_COLORS[category] : null;

  // Convert "#RRGGBB" to { red, green, blue } floats (0-1) for the Google Sheets API
  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return { red: r, green: g, blue: b };
  };

  const backgroundColor = colors ? hexToRgb(colors.bg) : { red: 1, green: 1, blue: 1 }; // white if no category
  const textColor = colors ? hexToRgb(colors.fg) : { red: 0, green: 0, blue: 0 }; // black if no category

  try {
    // Look up the numeric sheetId for the target sheet (batchUpdate requires it for repeatCell ranges)
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = meta.data.sheets?.find(
      (s: any) => s.properties?.title === sheetName
    );
    const sheetId = sheet?.properties?.sheetId;
    if (sheetId === undefined) {
      console.warn(`[sheets] Could not find sheetId for sheet "${sheetName}" — skipping color formatting`);
      return;
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: rowNumber - 1, // 0-indexed; rowNumber is 1-indexed (e.g., row 5 → index 4)
                endRowIndex: rowNumber,
                startColumnIndex: 16, // column Q = 0-indexed 16
                endColumnIndex: 17,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor,
                  textFormat: {
                    bold: true,
                    foregroundColor: textColor,
                  },
                  horizontalAlignment: "LEFT",
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat(foregroundColor,bold),horizontalAlignment)",
            },
          },
        ],
      },
    });
  } catch (e) {
    // Non-fatal: the values were already written; color is just a nice-to-have
    console.warn("[sheets] Failed to apply category color to cell:", e instanceof Error ? e.message : String(e));
  }
}

/**
 * Append a single communication record as a new row in the Google Sheet.
 * Returns true on success, throws on failure.
 */
export async function appendCommunicationRow(communicationId: string) {
  const config = await getSheetsConfig();
  if (!config) throw new Error("Google Sheets not configured. Add credentials in Settings.");

  const auth = await getAuthClient(config);
  const google = await getGoogle();
  const sheets = google.sheets({ version: "v4", auth });

  const comm = await db.communication.findUnique({
    where: { id: communicationId },
  });
  if (!comm) throw new Error("Communication not found");

  const row = buildRow(comm);

  // Find next empty row by reading column A starting at row 5
  const readRes = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheetName}!A5:A`,
  });
  const existingRows = readRes.data.values?.length || 0;
  const nextRow = 5 + existingRows; // header is row 4, data starts at row 5

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheetName}!A${nextRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });

  // Apply category color to column Q (Activity Category)
  await applyCategoryColorToCell(sheets, config.spreadsheetId, config.sheetName, nextRow, comm.activityCategory);

  return true;
}

/**
 * Update an existing communication row in the Google Sheet.
 * Finds the row by Control No. (column A) and overwrites columns A-N.
 * If the control number is not found, appends a new row instead.
 *
 * Returns { action: "updated" | "appended", rowNumber: number }
 */
export async function updateCommunicationRow(communicationId: string) {
  const config = await getSheetsConfig();
  if (!config) throw new Error("Google Sheets not configured. Add credentials in Settings.");

  const auth = await getAuthClient(config);
  const google = await getGoogle();
  const sheets = google.sheets({ version: "v4", auth });

  const comm = await db.communication.findUnique({
    where: { id: communicationId },
  });
  if (!comm) throw new Error("Communication not found");

  const row = buildRow(comm);

  // Read all of column A (control numbers) to find the matching row.
  // Data starts at row 5 (header is row 4). Read from A5:A to get control numbers.
  const readRes = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheetName}!A5:A`,
  });

  const controlNumbers = readRes.data.values || [];
  let targetRowNumber = -1;

  // Find the row whose control number matches (compare as strings, case-sensitive)
  // Note: index 0 = row 5, index 1 = row 6, etc.
  for (let i = 0; i < controlNumbers.length; i++) {
    const cellValue = controlNumbers[i]?.[0];
    if (cellValue && String(cellValue).trim() === comm.controlNo) {
      targetRowNumber = 5 + i;
      break;
    }
  }

  if (targetRowNumber === -1) {
    // Control number not found in the sheet - append as a new row
    const nextRow = 5 + controlNumbers.length;
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.spreadsheetId,
      range: `${config.sheetName}!A${nextRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });
    // Apply category color to column Q (Activity Category)
    await applyCategoryColorToCell(sheets, config.spreadsheetId, config.sheetName, nextRow, comm.activityCategory);
    return { action: "appended" as const, rowNumber: nextRow };
  }

  // Update the existing row (columns A through R — 18 columns including Priority, Activity Date, Activity Time)
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheetName}!A${targetRowNumber}:R${targetRowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });

  // Apply category color to column Q (Activity Category)
  await applyCategoryColorToCell(sheets, config.spreadsheetId, config.sheetName, targetRowNumber, comm.activityCategory);

  return { action: "updated" as const, rowNumber: targetRowNumber };
}

/**
 * Helper: convert a Communication record to a row array (18 columns A-R)
 * matching the Sheet header order:
 * A=ControlNo, B=DateReceived, C=Time, D=DateOfDocument, E=DocType,
 * F=From, G=Subject, H=RefNo, I=AssignedTo, J=Year, K=Priority,
 * L=ActivityDate, M=ActivityTime, N=TargetDate, O=DateCompleted,
 * P=Status, Q=ActivityCategory, R=Remarks
 */
function buildRow(comm: {
  controlNo: string;
  dateReceived: Date;
  timeReceived: string | null;
  dateOfDocument: Date | null;
  documentType: string | null;
  fromOffice: string | null;
  subject: string | null;
  referenceNo: string | null;
  assignedTo: string | null;
  targetDate: Date | null;
  dateCompleted: Date | null;
  status: string | null;
  activityCategory: string | null;
  remarks: string | null;
  year: number;
  priority: string | null;
  activityDateTime: Date | null;
  activityDateTimeHasTime: boolean;
  activityEndTime: string | null;
}): string[] {
  const formatDate = (d: Date | null | undefined): string => {
    if (!d) return "";
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  };

  // Format activity time for display:
  // - If no activity date → empty
  // - If hasTime=true → "8:00 AM - 5:00 PM" (or just "8:00 AM" if no end time)
  // - If hasTime=false → "All day"
  const formatActivityTime = (): string => {
    if (!comm.activityDateTime) return "";
    if (!comm.activityDateTimeHasTime) return "All day";
    const startTime = comm.activityDateTime.toLocaleTimeString("en-US", {
      timeZone: "Asia/Manila",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    if (comm.activityEndTime) {
      const [eh, em] = comm.activityEndTime.split(":").map(Number);
      if (!isNaN(eh)) {
        const period = eh >= 12 ? "PM" : "AM";
        const h12 = eh % 12 || 12;
        const endTime = `${h12}:${String(em || 0).padStart(2, "0")} ${period}`;
        return `${startTime} - ${endTime}`;
      }
    }
    return startTime;
  };

  return [
    comm.controlNo,           // A — Control No.
    formatDate(comm.dateReceived), // B — Date Received
    comm.timeReceived || "",  // C — Time
    formatDate(comm.dateOfDocument), // D — Date of Document
    comm.documentType || "",  // E — Document Type
    comm.fromOffice || "",    // F — From (Office/Person)
    comm.subject || "",       // G — Subject / Title
    comm.referenceNo || "",   // H — Reference No.
    comm.assignedTo || "",    // I — Assigned To
    String(comm.year),        // J — Year
    comm.priority || "",      // K — Priority
    formatDate(comm.activityDateTime), // L — Activity Date
    formatActivityTime(),     // M — Activity Time
    formatDate(comm.targetDate), // N — Target Date
    formatDate(comm.dateCompleted), // O — Date Completed
    comm.status || "",        // P — Status
    comm.activityCategory || "", // Q — Activity Category
    comm.remarks || "",       // R — Remarks / Action Taken
  ];
}

/**
 * Get the Google Calendar ID from settings.
 * Returns "primary" by default (the Service Account's primary calendar).
 * Users can set this to their personal calendar ID by sharing their calendar
 * with the Service Account email.
 */
export async function getCalendarId(): Promise<string> {
  const setting = await db.setting.findUnique({
    where: { key: "google_calendar_id" },
  });
  return setting?.value || "primary";
}

/**
 * Save the Google Calendar ID setting.
 */
export async function saveCalendarId(calendarId: string): Promise<void> {
  await db.setting.upsert({
    where: { key: "google_calendar_id" },
    update: { value: calendarId },
    create: { key: "google_calendar_id", value: calendarId },
  });
}

/**
 * Test the connection to Google Sheets.
 * Returns { ok: boolean, message: string }
 */
export async function testSheetsConnection() {
  try {
    const config = await getSheetsConfig();
    if (!config) {
      return { ok: false, message: "Not configured. Please provide all required fields." };
    }
    const auth = await getAuthClient(config);
    const google = await getGoogle();
    const sheets = google.sheets({ version: "v4", auth });

    // Try to get spreadsheet metadata
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: config.spreadsheetId,
    });

    const sheetNames = meta.data.sheets?.map((s) => s.properties?.title).filter(Boolean) || [];
    const sheetExists = sheetNames.includes(config.sheetName);

    if (!sheetExists) {
      return {
        ok: false,
        message: `Connected to spreadsheet, but sheet "${config.sheetName}" not found. Available sheets: ${sheetNames.join(", ")}`,
      };
    }

    return {
      ok: true,
      message: `Connected. Spreadsheet: "${meta.data.properties?.title}". Sheet: "${config.sheetName}".`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
