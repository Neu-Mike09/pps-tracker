import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/compress-existing
 * Admin-only. Re-compresses ALL existing image files in the database using Sharp.
 *
 * This is a one-time cleanup operation to compress files that were uploaded
 * before the client-side compression feature was added.
 *
 * For each UploadedFile that is an image:
 * 1. Read the original bytes
 * 2. Resize to max 1600px and re-encode as JPEG quality 75
 * 3. Only update if the compressed version is smaller than the original
 * 4. Update the record with the compressed bytes and new size
 *
 * Non-image files (PDFs, docs) are skipped.
 */
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Fetch all uploaded files
    const files = await db.uploadedFile.findMany({
      select: { id: true, filename: true, mimeType: true, size: true, data: true },
      orderBy: { createdAt: "asc" },
    });

    const results = {
      total: files.length,
      compressed: 0,
      skipped: 0,
      alreadySmall: 0,
      failed: 0,
      originalTotalBytes: 0,
      compressedTotalBytes: 0,
      errors: [] as Array<{ filename: string; error: string }>,
    };

    for (const file of files) {
      try {
        const fileBuffer = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data as Uint8Array);
        results.originalTotalBytes += file.size;

        const ext = file.filename.split(".").pop()?.toLowerCase() || "";
        const isImage = file.mimeType.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif", "bmp"].includes(ext);

        if (!isImage) {
          results.skipped++;
          results.compressedTotalBytes += file.size;
          continue;
        }

        // Compress with Sharp: resize to max 1600px, JPEG quality 75
        const compressed = await sharp(fileBuffer)
          .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 75, mozjpeg: true })
          .toBuffer();

        // Only update if compressed is smaller (at least 10% savings to avoid tiny updates)
        if (compressed.length >= file.size * 0.9) {
          results.alreadySmall++;
          results.compressedTotalBytes += file.size;
          continue;
        }

        // Update the record with compressed data
        await db.uploadedFile.update({
          where: { id: file.id },
          data: {
            data: compressed,
            size: compressed.length,
            mimeType: "image/jpeg",
            filename: file.filename.replace(/\.[^.]+$/, "") + ".jpg",
          },
        });

        results.compressed++;
        results.compressedTotalBytes += compressed.length;
      } catch (e) {
        results.failed++;
        results.errors.push({
          filename: file.filename,
          error: e instanceof Error ? e.message : String(e),
        });
        results.compressedTotalBytes += file.size;
      }
    }

    const savingsBytes = results.originalTotalBytes - results.compressedTotalBytes;
    const savingsPercent = results.originalTotalBytes > 0
      ? Math.round((savingsBytes / results.originalTotalBytes) * 100)
      : 0;

    return NextResponse.json({
      ...results,
      savingsBytes,
      savingsPercent,
      originalTotalMB: (results.originalTotalBytes / (1024 * 1024)).toFixed(2),
      compressedTotalMB: (results.compressedTotalBytes / (1024 * 1024)).toFixed(2),
      savingsMB: (savingsBytes / (1024 * 1024)).toFixed(2),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
