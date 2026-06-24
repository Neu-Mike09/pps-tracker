#!/bin/bash
# Render.com startup script
# Ensures database exists, runs migrations, seeds admin user, then starts server
set -e

echo "=== Render Start Script ==="
echo "Working directory: $(pwd)"
echo "Node version: $(node --version)"

# Ensure the db directory exists (on the persistent disk)
mkdir -p db
mkdir -p public/uploads

# Check if database file exists; if not, initialize it
if [ ! -f "db/custom.db" ]; then
  echo "=== Database not found — initializing ==="
  npx prisma db push
  echo "=== Seeding admin user ==="
  node scripts/seed.js
else
  echo "=== Database exists — pushing schema (in case of updates) ==="
  npx prisma db push
fi

echo "=== Starting production server ==="
exec node .next/standalone/server.js
