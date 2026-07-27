#!/usr/bin/env bash
# Confirms the edge-proxy allow-list is genuinely fail-closed: allowed routes
# get a real response, everything else gets the connection dropped (444),
# not a 403/404 (which would still confirm the route exists).
set -euo pipefail

PROXY="${1:-http://127.0.0.1:8090}"

ALLOWED=("/api/health" "/api/locations")
BLOCKED=("/api/admin/stats" "/api/admin/login" "/api/does-not-exist" "/admin")

FAIL=0

for path in "${ALLOWED[@]}"; do
  # Check curl's own exit status separately from its captured stdout — piping
  # `|| echo "000"` into the same command substitution double-counts on
  # failure (curl already writes "000" via -w, then the fallback appends
  # another "000"), which silently defeats this check. Split them instead.
  set +e
  code=$(curl -s -o /dev/null -w "%{http_code}" "$PROXY$path")
  curl_exit=$?
  set -e
  if [ "$curl_exit" -ne 0 ] || [ "$code" = "000" ]; then
    echo "FAIL: allowed route $path got no response at all (curl exit $curl_exit, code ${code:-none})"
    FAIL=1
  else
    echo "OK: allowed route $path -> $code"
  fi
done

for path in "${BLOCKED[@]}"; do
  # curl exit code 52 = "empty reply from server", the expected signature of
  # nginx's `return 444` (connection closed, no HTTP response line at all).
  set +e
  curl -s -o /dev/null "$PROXY$path"
  code=$?
  set -e
  if [ "$code" = "52" ]; then
    echo "OK: blocked route $path -> connection dropped (curl exit 52), as required"
  else
    echo "FAIL: blocked route $path did not get dropped (curl exit $code, expected 52)"
    FAIL=1
  fi
done

if [ "$FAIL" -eq 1 ]; then
  exit 1
fi
echo "PASS: allow-list is fail-closed"
