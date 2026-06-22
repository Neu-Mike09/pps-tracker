/**
 * Migration script: imports existing records from the uploaded Excel logbook
 * into the database.
 *
 * Run with: bun run scripts/migrate.ts
 */
import { db } from "../src/lib/db";
import * as XLSX from "xlsx";
import * as fs from "fs";

async function main() {
  const excelPath = "/home/z/my-project/upload/DA_RFO5_Incoming_Comms_Logbook (1).xlsx";
  if (!fs.existsSync(excelPath)) {
    console.error(`Excel file not found: ${excelPath}`);
    process.exit(1);
  }

  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets["Incoming Communications"];

  // Convert to array of rows
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });

  // Header is at row index 3 (row 4 in 1-indexed)
  // Data starts at row index 4 (row 5 in 1-indexed)
  // Columns: A=ControlNo, B=DateReceived, C=DateOfDocument, D=DocType, E=From,
  //          F=Subject, G=RefNo, H=AssignedTo, I=TargetDate, J=DateCompleted,
  //          K=Status, L=ActivityCategory, M=Remarks, N=Year

  let imported = 0;
  let skipped = 0;

  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const dateReceived = row[1];
    if (!dateReceived) {
      skipped++;
      continue;
    }

    const dateReceivedDate = excelDateToDate(dateReceived);
    if (!dateReceivedDate) {
      skipped++;
      continue;
    }

    const year = dateReceivedDate.getFullYear();
    const seq = i - 4 + 1;
    const controlNo = `PPS-${year}-${String(seq).padStart(3, "0")}`;

    const dateOfDocument = excelDateToDate(row[2]);
    const documentType = (row[3] as string) || null;
    const fromOffice = (row[4] as string) || null;
    const subject = (row[5] as string) || null;
    const referenceNo = (row[6] as string) || null;
    const assignedTo = (row[7] as string) || null;
    const targetDate = excelDateToDate(row[8]);
    const dateCompleted = excelDateToDate(row[9]);
    const status = (row[10] as string) || null;
    const activityCategory = (row[11] as string) || null;
    const remarks = (row[12] as string) || null;

    const existing = await db.communication.findUnique({
      where: { controlNo },
    });
    if (existing) {
      skipped++;
      continue;
    }

    await db.communication.create({
      data: {
        controlNo,
        dateReceived: dateReceivedDate,
        dateOfDocument: dateOfDocument || null,
        documentType,
        fromOffice,
        subject,
        referenceNo,
        assignedTo,
        targetDate: targetDate || null,
        dateCompleted: dateCompleted || null,
        status,
        activityCategory,
        remarks,
        year,
        priority: null,
        activityDateTime: null,
        photoPath: null,
        syncStatus: "synced",
        sheetSyncedAt: new Date(),
      },
    });
    imported++;
  }

  console.log(`Migration complete. Imported: ${imported}, Skipped: ${skipped}`);
}

function excelDateToDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const ms = value * 24 * 60 * 60 * 1000;
    const date = new Date(epoch.getTime() + ms);
    return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
