import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/storage-report
 * Admin-only. Returns a summary of database storage usage.
 *
 * Returns:
 * - Total file count and total size
 * - Breakdown by MIME type (images vs PDFs vs docs)
 * - Top 10 largest files
 * - Communication record count
 * - Estimated storage usage vs Neon free tier limit (512 MB)
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const files = await db.uploadedFile.findMany({
      select: { id: true, filename: true, mimeType: true, size: true, createdAt: true },
      orderBy: { size: "desc" },
    });

    const commCount = await db.communication.count();
    const userCount = await db.user.count();

    const totalSizeBytes = files.reduce((sum, f) => sum + f.size, 0);
    const totalSizeMB = totalSizeBytes / (1024 * 1024);

    // Breakdown by category
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
    const usagePercent = (totalSizeMB / NEON_FREE_LIMIT_MB) * 100;

    return NextResponse.json({
      files: {
        count: files.length,
        totalSizeMB: totalSizeMB.toFixed(2),
        totalSizeBytes,
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
      neonFreeTier: {
        limitMB: NEON_FREE_LIMIT_MB,
        usedMB: totalSizeMB.toFixed(2),
        remainingMB: (NEON_FREE_LIMIT_MB - totalSizeMB).toFixed(2),
        usagePercent: usagePercent.toFixed(1),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
