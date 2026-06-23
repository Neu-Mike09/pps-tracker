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

echo "=== Copying googleapis (filtered) ==="
mkdir -p .next/standalone/node_modules/googleapis/build/src/apis
cp node_modules/googleapis/package.json .next/standalone/node_modules/googleapis/package.json
cp node_modules/googleapis/build/src/googleapis.js .next/standalone/node_modules/googleapis/build/src/googleapis.js
cp node_modules/googleapis/build/src/index.js .next/standalone/node_modules/googleapis/build/src/index.js 2>/dev/null || true
cp node_modules/googleapis/build/src/apis/index.js .next/standalone/node_modules/googleapis/build/src/apis/index.js
cp -r node_modules/googleapis/build/src/apis/sheets .next/standalone/node_modules/googleapis/build/src/apis/sheets
cp -r node_modules/googleapis/build/src/apis/calendar .next/standalone/node_modules/googleapis/build/src/apis/calendar

echo "=== Build complete ==="
du -sh .next/standalone/
