#!/usr/bin/env bash
# Confirms the public build output contains zero admin-only code. Run after
# `npm run build:public` — fails loudly if admin strings leak into the
# public bundle (the one thing this whole design depends on being true).
set -euo pipefail

DIST="${1:-dist/public}"

if [ ! -d "$DIST" ]; then
  echo "FAIL: $DIST does not exist — run 'npm run build:public' first"
  exit 1
fi

# The /api/admin/ path prefix only appears inside src/api.js's `adminApi`
# object (login, listCases, getCase, reviewCase, ..., updateSettings) — none
# of those calls are reachable from InspectorApp. Unlike component/function
# names (AdminLogin, ReviewQueue, adminApi itself), this is a string literal
# passed into fetch/request calls, so it survives esbuild's production
# minifier (which mangles identifiers, not string contents) and remains a
# reliable marker in the built, minified JS.
if grep -rl "/api/admin/" "$DIST"/assets/*.js >/dev/null 2>&1; then
  echo "FAIL: admin marker '/api/admin/' found in $DIST"
  exit 1
fi

echo "PASS: no admin markers found in $DIST"
