// Run this on Render (or locally with DATABASE_URL pointing to Neon)
// Usage: node scripts/check-db-size.js
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

async function main() {
  const [commCount, fileCount, userCount] = await Promise.all([
    db.communication.count(),
    db.uploadedFile.count(),
    db.user.count(),
  ]);

  // Sum total file size
  const fileSizes = await db.uploadedFile.aggregate({ _sum: { size: true } });
  const totalFileSizeBytes = fileSizes._sum.size || 0;
  const totalFileSizeMB = (totalFileSizeBytes / (1024 * 1024)).toFixed(2);

  // Estimate record data size (text fields only — rough estimate)
  const avgRecordKB = 1.5; // ~1.5 KB per communication record (text only)
  const estimatedRecordDataKB = (commCount * avgRecordKB).toFixed(0);

  console.log("=== DA RFO 5 PPS Tracker — Storage Usage ===\n");
  console.log(`Communication records: ${commCount}`);
  console.log(`  Estimated text data: ~${estimatedRecordDataKB} KB`);
  console.log(`Uploaded files: ${fileCount}`);
  console.log(`  Total file size: ${totalFileSizeMB} MB (${totalFileSizeBytes.toLocaleString()} bytes)`);
  console.log(`Users: ${userCount}`);
  console.log("");
  console.log(`Neon free tier limit: 512 MB (0.5 GB)`);
  const usedMB = parseFloat(totalFileSizeMB) + parseFloat(estimatedRecordDataKB) / 1024;
  console.log(`Estimated total used: ~${usedMB.toFixed(2)} MB`);
  console.log(`Remaining: ~${(512 - usedMB).toFixed(2)} MB`);
  console.log(`Usage: ${((usedMB / 512) * 100).toFixed(1)}%`);

  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
