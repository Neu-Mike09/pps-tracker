#!/bin/bash
# =============================================================
# PPS Tracker — Quick Restore
# =============================================================
# Run this if the project files have been reset to an older version.
# This restores everything from the git repository.
#
# Usage: bash /home/z/my-project/restore.sh
#        or: bash .zscripts/restore.sh
# =============================================================

set -e

PROJECT_DIR="/home/z/my-project"
cd "$PROJECT_DIR"

echo "Restoring project from git..."

# Restore all files from the latest commit
git checkout -- .

# Reinstall dependencies if needed
if [ ! -d "node_modules/@prisma" ]; then
  echo "Installing dependencies..."
  bun install
fi

# Regenerate Prisma Client
echo "Syncing database schema..."
bun run db:push

# Clear Next.js cache
rm -rf .next/cache

# Restart dev server
echo "Restarting dev server..."
kill $(cat .zscripts/dev.pid 2>/dev/null) 2>/dev/null || true
sleep 2
nohup bash .zscripts/dev.sh > /dev/null 2>&1 &

echo ""
echo "✅ Restore complete! All features are back:"
echo "   - Manual entry mode"
echo "   - Multi-file upload (PDF, DOC, etc.)"
echo "   - Google Calendar sync"
echo "   - Delete records (admin only)"
echo "   - Control number fix"
echo ""
echo "If this didn't work, run the full restore:"
echo "   bash /home/z/project-backup/restore.sh"
