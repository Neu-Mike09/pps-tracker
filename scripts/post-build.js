// Post-build: copies dependencies into standalone build
const fs = require("fs");
const path = require("path");

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, dest, { recursive: true });
  console.log(`  Copied: ${path.basename(src)}`);
}

const standalone = path.join(process.cwd(), ".next", "standalone");
if (!fs.existsSync(standalone)) { console.error("ERROR: .next/standalone not found"); process.exit(1); }

console.log("=== Post-build ===");
copyDir(path.join(process.cwd(), ".next", "static"), path.join(standalone, ".next", "static"));
copyDir(path.join(process.cwd(), "public"), path.join(standalone, "public"));

const nm = path.join(process.cwd(), "node_modules");
const snm = path.join(standalone, "node_modules");
["bcryptjs", "@google/generative-ai", "xlsx"].forEach((pkg) => copyDir(path.join(nm, pkg), path.join(snm, pkg)));

console.log("=== Post-build complete ===");
