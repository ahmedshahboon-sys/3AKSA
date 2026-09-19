#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${THREEAKSA_PUBLIC_URL:-https://marbo3a.ly/3aksa}"
API_URL="${BASE_URL%/}/api"
SOCKET_URL="${BASE_URL%/}/socket.io/"

check_json(){
  local url="$1"
  curl --fail --silent --show-error --connect-timeout 5 --max-time 15 "$url"
}

echo "Checking public health..."
health="$(check_json "${API_URL}/health")"
printf '%s\n' "$health"

echo "Checking dependency readiness..."
ready="$(check_json "${API_URL}/ready")"
printf '%s\n' "$ready"

echo "Checking Web/PWA shell..."
curl --fail --silent --show-error --connect-timeout 5 --max-time 15 "${BASE_URL%/}/" | grep -q '<div id="root"></div>'

echo "Checking public download route..."
curl --fail --silent --show-error --connect-timeout 5 --max-time 15 "${BASE_URL%/}/download" >/dev/null

echo "Checking Socket.IO polling handshake..."
socket="$(curl --fail --silent --show-error --connect-timeout 5 --max-time 15 "${SOCKET_URL}?EIO=4&transport=polling")"
[[ "$socket" == 0\{* ]] || { echo "Unexpected Socket.IO handshake" >&2; exit 6; }

echo "Checking security headers..."
headers="$(curl --fail --silent --show-error --head --connect-timeout 5 --max-time 15 "${BASE_URL%/}/")"
grep -qi '^x-content-type-options: nosniff' <<<"$headers"
grep -qi '^x-frame-options: DENY' <<<"$headers"
grep -qi '^content-security-policy:' <<<"$headers"

echo "3AKSA public production smoke passed."
