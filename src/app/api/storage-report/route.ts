import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/storage-report
 * Admin-only. Returns a summary of database storage usage.
 *
 * Queries PostgreSQL directly for the ACTUAL database size (matches Neon dashboard),
 * plus a per-table breakdown so the user can see which tables consume the most space.
 *
 * Also returns file-level stats (count, sizes, top largest) for identifying
 * individual large files that could be compressed or deleted.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // === Query PostgreSQL for ACTUAL database size (matches Neon dashboard) ===
    // pg_database_size() returns the total size of the current database in bytes,
    // including: table data, indexes, TOAST tables, system catalogs, etc.
    const dbSizeResult = await db.$queryRaw<[{ db_size: bigint }]>`
      SELECT pg_database_size(current_database()) AS db_size
    `;
    const actualDbSizeBytes = Number(dbSizeResult[0].db_size);
    const actualDbSizeMB = actualDbSizeBytes / (1024 * 1024);

    // === Per-table size breakdown (data + indexes + TOAST) ===
    // pg_total_relation_size() includes: heap (table data) + indexes + TOAST table
    const tableSizesResult = await db.$queryRaw<Array<{ table_name: string; total_size: bigint; row_count: bigint }>>`
      SELECT
        relname AS table_name,
        pg_total_relation_size(relid) AS total_size,
        n_live_tup AS row_count
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
    `;

    const tableSizes = tableSizesResult.map((row) => ({
      tableName: row.table_name,
      totalSizeMB: (Number(row.total_size) / (1024 * 1024)).toFixed(2),
      totalSizeBytes: Number(row.total_size),
      rowCount: Number(row.row_count),
    }));

    // === File-level stats (for identifying large files to compress/delete) ===
    const files = await db.uploadedFile.findMany({
      select: { id: true, filename: true, mimeType: true, size: true, createdAt: true },
      orderBy: { size: "desc" },
    });

    const commCount = await db.communication.count();
    const userCount = await db.user.count();

    const fileTotalSizeBytes = files.reduce((sum, f) => sum + f.size, 0);
    const fileTotalSizeMB = fileTotalSizeBytes / (1024 * 1024);

    // Breakdown by file category
    const byCategory: Record<string, { count: number; sizeBytes: number }> = {};
    for (const f of files) {
      const ext = f.filename.split(".").pop()?.toLowerCase() || "unknown";
      let category: string;
      if (f.mimeType.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif", "bmp"].includes(ext)) {
        category = "Images";
      } else if (f.mimeType === "application/pdf" || ext === "pdf") {
        category = "PDFs";
      } else if (["doc", "docx"].includes(ext)) {
        category = "Word docs";
      } else if (["xls", "xlsx"].includes(ext)) {
        category = "Excel files";
      } else {
        category = "Other";
      }
      if (!byCategory[category]) byCategory[category] = { count: 0, sizeBytes: 0 };
      byCategory[category].count++;
      byCategory[category].sizeBytes += f.size;
    }

    // Top 10 largest files
    const topLargest = files.slice(0, 10).map((f) => ({
      id: f.id,
      filename: f.filename,
      mimeType: f.mimeType,
      sizeMB: (f.size / (1024 * 1024)).toFixed(2),
      createdAt: f.createdAt.toISOString(),
    }));

    // Neon free tier limit
    const NEON_FREE_LIMIT_MB = 512;
    const usagePercent = (actualDbSizeMB / NEON_FREE_LIMIT_MB) * 100;
    const overheadBytes = actualDbSizeBytes - fileTotalSizeBytes;
    const overheadMB = overheadBytes / (1024 * 1024);
    const overheadPercent = actualDbSizeBytes > 0 ? (overheadBytes / actualDbSizeBytes) * 100 : 0;

    return NextResponse.json({
      // === Actual database size (matches Neon dashboard) ===
      database: {
        actualSizeMB: actualDbSizeMB.toFixed(2),
        actualSizeBytes: actualDbSizeBytes,
        fileDataMB: fileTotalSizeMB.toFixed(2),
        fileDataBytes: fileTotalSizeBytes,
        overheadMB: overheadMB.toFixed(2),
        overheadBytes: overheadBytes,
        overheadPercent: overheadPercent.toFixed(1),
      },
      // === Per-table breakdown ===
      tableSizes,
      // === File-level stats ===
      files: {
        count: files.length,
        totalSizeMB: fileTotalSizeMB.toFixed(2),
        totalSizeBytes: fileTotalSizeBytes,
      },
      records: {
        communications: commCount,
        users: userCount,
      },
      byCategory: Object.entries(byCategory).map(([cat, data]) => ({
        category: cat,
        count: data.count,
        sizeMB: (data.sizeBytes / (1024 * 1024)).toFixed(2),
      })),
      topLargest,
      // === Neon free tier usage (based on ACTUAL db size, not just file sizes) ===
      neonFreeTier: {
        limitMB: NEON_FREE_LIMIT_MB,
        usedMB: actualDbSizeMB.toFixed(2),
        remainingMB: (NEON_FREE_LIMIT_MB - actualDbSizeMB).toFixed(2),
        usagePercent: usagePercent.toFixed(1),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
