#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

PACKAGE="${THREEAKSA_ANDROID_PACKAGE:-ly.threeaksa.app}"
MODE="${1:-check}"
EVIDENCE_ROOT="${THREEAKSA_QA_EVIDENCE_DIR:-qa-evidence}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${EVIDENCE_ROOT}/android-${STAMP}"

command -v adb >/dev/null 2>&1 || { echo "adb is required." >&2; exit 2; }

if [[ -n "${ANDROID_SERIAL:-}" ]]; then
  SERIAL="${ANDROID_SERIAL}"
  [[ "$(adb -s "${SERIAL}" get-state 2>/dev/null)" == "device" ]] || {
    echo "ANDROID_SERIAL is not an authorized online device: ${SERIAL}" >&2
    exit 3
  }
else
  mapfile -t DEVICES < <(adb devices | awk 'NR>1 && $2=="device"{print $1}')
  [[ "${#DEVICES[@]}" -eq 1 ]] || {
    echo "Exactly one authorized Android device is required, or set ANDROID_SERIAL. Found: ${#DEVICES[@]}" >&2
    exit 3
  }
  SERIAL="${DEVICES[0]}"
fi

adb -s "${SERIAL}" shell pm path "${PACKAGE}" >/dev/null 2>&1 || {
  echo "3AKSA package is not installed: ${PACKAGE}" >&2
  exit 4
}

mkdir -p "${OUT}"
chmod 700 "${EVIDENCE_ROOT}" "${OUT}"

MODEL="$(adb -s "${SERIAL}" shell getprop ro.product.model | tr -d '\r')"
SDK="$(adb -s "${SERIAL}" shell getprop ro.build.version.sdk | tr -d '\r')"
RELEASE="$(adb -s "${SERIAL}" shell getprop ro.build.version.release | tr -d '\r')"
PACKAGE_INFO="$(adb -s "${SERIAL}" shell dumpsys package "${PACKAGE}" | sed -n -E '/versionName=|versionCode=/p' | head -n 6)"

{
  printf 'captured_at_utc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'device_serial_hash=%s\n' "$(printf '%s' "${SERIAL}" | sha256sum | cut -d' ' -f1)"
  printf 'device_model=%s\n' "${MODEL}"
  printf 'android_release=%s\n' "${RELEASE}"
  printf 'android_sdk=%s\n' "${SDK}"
  printf 'package=%s\n' "${PACKAGE}"
  printf '%s\n' "${PACKAGE_INFO}"
} > "${OUT}/device.txt"

capture_pid_log(){
  local pid
  pid="$(adb -s "${SERIAL}" shell pidof "${PACKAGE}" 2>/dev/null | tr -d '\r' | awk '{print $1}')"
  [[ -n "${pid}" ]] || {
    printf 'FAIL: %s is not running. Immediate/post-login crash must be investigated.\n' "${PACKAGE}" | tee "${OUT}/result.txt" >&2
    exit 5
  }
  printf 'process_id=%s\n' "${pid}" >> "${OUT}/device.txt"
  adb -s "${SERIAL}" logcat -d --pid="${pid}" > "${OUT}/app-logcat.txt" 2>/dev/null || true
  if grep -Eqi 'FATAL EXCEPTION|ANR in|has died|SIG(SEGV|ABRT)|native crash' "${OUT}/app-logcat.txt"; then
    printf 'FAIL: crash/ANR signature detected in app-scoped logcat.\n' | tee "${OUT}/result.txt" >&2
    exit 6
  fi
  printf 'PASS: package is alive and app-scoped logcat has no known crash/ANR signature.\n' | tee "${OUT}/result.txt"
}

case "${MODE}" in
  start)
    adb -s "${SERIAL}" logcat -c
    adb -s "${SERIAL}" shell monkey -p "${PACKAGE}" -c android.intent.category.LAUNCHER 1 >/dev/null
    sleep 4
    capture_pid_log
    ;;
  capture|check)
    capture_pid_log
    ;;
  *)
    echo "Usage: $0 [start|capture|check]" >&2
    exit 2
    ;;
esac

echo "Local QA evidence: ${OUT}"
echo "Do not commit qa-evidence/. Review the app-scoped log locally before sharing any excerpt."
