const { execSync } = require("child_process");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

async function main() {
  console.log("=== Render Start ===");
  console.log("Node:", process.version);
  console.log("=== Pushing schema ===");
  try { execSync("npx prisma db push", { stdio: "inherit" }); } catch { console.error("Schema push failed"); process.exit(1); }
  console.log("=== Seeding admin ===");
  const db = new PrismaClient();
  try {
    const count = await db.user.count();
    if (count === 0) {
      const hash = await bcrypt.hash("pps2026", 10);
      await db.user.create({ data: { username: "admin", name: "System Administrator", passwordHash: hash, role: "admin", active: true } });
      console.log("Admin created (admin / pps2026)");
    } else { console.log("Users exist, skipping seed"); }
  } catch (e) { console.error("Seed error:", e.message); }
  finally { await db.$disconnect(); }
  console.log("=== Starting server ===");
  const { spawn } = require("child_process");
  const server = spawn("node", [".next/standalone/server.js"], { stdio: "inherit", env: { ...process.env, HOSTNAME: "0.0.0.0" } });
  server.on("exit", (code) => process.exit(code));
}
main().catch((e) => { console.error(e); process.exit(1); });
