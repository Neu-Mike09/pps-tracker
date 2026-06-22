import { google } from "googleapis";
import { db } from "./db";

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

function getAuthClient(config: Awaited<ReturnType<typeof getSheetsConfig>>) {
  if (!config) throw new Error("Google Sheets not configured");
  return new google.auth.JWT({
    email: config.clientEmail,
    key: config.privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

/**
 * Ensure the target sheet has the right header row.
 * Writes headers if the sheet is empty.
 */
export async function ensureSheetHeaders() {
  const config = await getSheetsConfig();
  if (!config) throw new Error("Google Sheets not configured");

  const auth = getAuthClient(config);
  const sheets = google.sheets({ version: "v4", auth });

  // Try to read existing header row
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheetName}!A4:N4`,
  });

  const headers = [
    "Control No.",
    "Date Received",
    "Date of Document",
    "Document Type",
    "From (Office/Person)",
    "Subject / Title",
    "Reference No.",
    "Assigned To",
    "Target Date",
    "Date Completed",
    "Status",
    "Activity Category",
    "Remarks / Action Taken",
    "Year",
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
 * Append a single communication record as a new row in the Google Sheet.
 * Returns true on success, throws on failure.
 */
export async function appendCommunicationRow(communicationId: string) {
  const config = await getSheetsConfig();
  if (!config) throw new Error("Google Sheets not configured. Add credentials in Settings.");

  const auth = getAuthClient(config);
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

  const auth = getAuthClient(config);
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
    return { action: "appended" as const, rowNumber: nextRow };
  }

  // Update the existing row (columns A through N)
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheetName}!A${targetRowNumber}:N${targetRowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });

  return { action: "updated" as const, rowNumber: targetRowNumber };
}

/**
 * Helper: convert a Communication record to a row array (14 columns A-N)
 * matching the Sheet header order.
 */
function buildRow(comm: {
  controlNo: string;
  dateReceived: Date;
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
}): string[] {
  const formatDate = (d: Date | null | undefined): string => {
    if (!d) return "";
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  };
  return [
    comm.controlNo,
    formatDate(comm.dateReceived),
    formatDate(comm.dateOfDocument),
    comm.documentType || "",
    comm.fromOffice || "",
    comm.subject || "",
    comm.referenceNo || "",
    comm.assignedTo || "",
    formatDate(comm.targetDate),
    formatDate(comm.dateCompleted),
    comm.status || "",
    comm.activityCategory || "",
    comm.remarks || "",
    String(comm.year),
  ];
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
    const auth = getAuthClient(config);
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
