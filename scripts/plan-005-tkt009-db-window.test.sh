#!/usr/bin/env bash
set -euo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/plan-005-tkt009-db-window.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

plan_output="$(bash "$SCRIPT")"
grep -Fq 'This helper does not authorize a production cutover.' <<<"$plan_output"
grep -Fq 'PLAN005_JOB_SHEET_SHA256' <<<"$plan_output"
grep -Fq 'PLAN005_EVA_PREFLIGHT=verified' <<<"$plan_output"
grep -Fq 'PLAN005_PRODUCTION_ARCHIVE_ROOT_ID' <<<"$plan_output"

if bash "$SCRIPT" inspect >"$TMP/inspect.out" 2>&1; then
  echo 'inspect unexpectedly passed without read-only preflight approval' >&2
  exit 1
fi
grep -Fq 'PLAN005_READONLY_PREFLIGHT_APPROVED' "$TMP/inspect.out"

if PLAN005_READONLY_PREFLIGHT_APPROVED=true \
  bash "$SCRIPT" cutover /tmp/not-a-release >"$TMP/cutover.out" 2>&1; then
  echo 'cutover unexpectedly passed without the explicit live window' >&2
  exit 1
fi
grep -Fq 'explicit TKT-178 production-cutover window is not open' "$TMP/cutover.out"

echo 'PLAN-005 TKT-009 database helper gate tests passed'
