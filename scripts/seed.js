/**
 * Seed script: creates the default admin user.
 * Works with plain Node.js (no TypeScript compiler needed).
 *
 * Default credentials:
 *   username: admin
 *   password: pps2026
 *
 * Run with: node scripts/seed.js
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const db = new PrismaClient();

async function main() {
  const adminUsername = "admin";
  const adminPassword = "pps2026";

  const existing = await db.user.findUnique({
    where: { username: adminUsername },
  });
  if (existing) {
    console.log("Admin user already exists. Skipping.");
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await db.user.create({
    data: {
      username: adminUsername,
      name: "System Administrator",
      passwordHash,
      role: "admin",
      active: true,
    },
  });

  console.log("Admin user created.");
  console.log("  Username: " + adminUsername);
  console.log("  Password: " + adminPassword);
  console.log("Please change the password after first login.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
