#!/bin/bash
set -e

echo "=== Running next build ==="
next build

echo "=== Copying static files ==="
cp -r .next/static .next/standalone/.next/

echo "=== Copying public files ==="
cp -r public .next/standalone/

echo "=== Copying database ==="
cp -r db .next/standalone/db

echo "=== Copying server-side dependencies ==="
cp -r node_modules/bcryptjs .next/standalone/node_modules/bcryptjs
cp -r node_modules/z-ai-web-dev-sdk .next/standalone/node_modules/z-ai-web-dev-sdk
cp -r node_modules/xlsx .next/standalone/node_modules/xlsx

echo "=== Filtering googleapis (removing unused API modules) ==="
# Next.js file tracing includes the ENTIRE googleapis package (200+ MB, 328 APIs).
# We only use Sheets and Calendar, so delete the rest to shrink the bundle.
APIS_DIR=".next/standalone/node_modules/googleapis/build/src/apis"
if [ -d "$APIS_DIR" ]; then
  echo "Before: $(du -sh $APIS_DIR)"
  # Keep only index.js, sheets, and calendar — delete everything else
  find "$APIS_DIR" -mindepth 1 -maxdepth 1 \
    ! -name 'index.js' \
    ! -name 'sheets' \
    ! -name 'calendar' \
    -exec rm -rf {} +
  echo "After:  $(du -sh $APIS_DIR)"
fi

echo "=== Build complete ==="
du -sh .next/standalone/
