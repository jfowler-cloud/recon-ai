#!/usr/bin/env bash
# Start frontend dev server on port 3000
set -euo pipefail
cd "$(dirname "$0")/apps/web"
npm run dev -- --port 3000
