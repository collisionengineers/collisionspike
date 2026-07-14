#!/usr/bin/env bash
# PLAN-005 / TKT-009: fail-closed Postgres inspection and future cutover helper.
# Running without arguments is offline-only and prints the required gates. Every live mode requires
# an explicit preflight flag; schema mutation additionally requires the full approved cutover pack.
# Usage: plan-005-tkt009-db-window.sh [plan]
#        PLAN005_READONLY_PREFLIGHT_APPROVED=true plan-005-tkt009-db-window.sh inspect
#        PLAN005_READONLY_PREFLIGHT_APPROVED=true plan-005-tkt009-db-window.sh backup <absolute-dump-path>
#        <full cutover environment> plan-005-tkt009-db-window.sh phase-a|cutover <exact-release-worktree>
set -euo pipefail

MODE="${1:-plan}"
TARGET="${2:-}"
RG=rg-collisionspike-dev
SERVER=cespk-pg-dev
RULE="plan005-tkt009-${MODE}-$(date +%s)"
CONN="host=cespk-pg-dev.postgres.database.azure.com port=5432 dbname=collisionspike sslmode=require user=digital@collisionengineers.co.uk connect_timeout=10"
RULE_CREATED=0

fail() {
  echo "refusing live operation: $*" >&2
  exit 2
}

require_value() {
  local name="$1"
  [[ -n "${!name:-}" ]] || fail "$name is required"
}

require_sha256() {
  local name="$1"
  require_value "$name"
  [[ "${!name}" =~ ^[0-9A-Fa-f]{64}$ ]] || fail "$name must be an exact SHA-256"
}

print_plan() {
  cat <<'TEXT'
This helper does not authorize a production cutover.

Read-only database inspection/backup requires:
  PLAN005_READONLY_PREFLIGHT_APPROVED=true

Phase-A or final schema mutation additionally requires all of:
  PLAN005_EXPLICIT_LIVE_WINDOW=APPROVED_TKT178_PRODUCTION_CUTOVER
  PLAN005_OPERATOR_APPROVAL_ID=<named approval reference>
  PLAN005_JOB_SHEET_SHA256=<approved dated spreadsheet SHA-256>
  PLAN005_EVA_PREFLIGHT=verified
  PLAN005_PRODUCTION_ARCHIVE_ROOT_ID=<independently confirmed production root>
  PLAN005_ARCHIVE_WRITE_APPROVED=true
  PLAN005_BACKUP_SHA256=<verified restorable backup SHA-256>
  PLAN005_DRY_RUN_SHA256=<operator-approved frozen dry-run SHA-256>

The known test root 392761581105 is rejected as a production target. Missing EVA access blocks the
cutover; it is not treated as optional. Outlook stays read-only.
TEXT
}

require_readonly_preflight() {
  [[ "${PLAN005_READONLY_PREFLIGHT_APPROVED:-}" == "true" ]] ||
    fail "set PLAN005_READONLY_PREFLIGHT_APPROVED=true after approving the read-only live preflight"
}

require_cutover_pack() {
  require_readonly_preflight
  [[ "${PLAN005_EXPLICIT_LIVE_WINDOW:-}" == "APPROVED_TKT178_PRODUCTION_CUTOVER" ]] ||
    fail "the explicit TKT-178 production-cutover window is not open"
  require_value PLAN005_OPERATOR_APPROVAL_ID
  require_sha256 PLAN005_JOB_SHEET_SHA256
  [[ "${PLAN005_EVA_PREFLIGHT:-}" == "verified" ]] || fail "EVA API is not authenticated and verified"
  require_value PLAN005_PRODUCTION_ARCHIVE_ROOT_ID
  [[ "$PLAN005_PRODUCTION_ARCHIVE_ROOT_ID" != "392761581105" ]] ||
    fail "the Archive target is the known test root"
  [[ "${PLAN005_ARCHIVE_WRITE_APPROVED:-}" == "true" ]] || fail "production Archive writes are not approved"
  require_sha256 PLAN005_BACKUP_SHA256
  require_sha256 PLAN005_DRY_RUN_SHA256
}

case "$MODE" in
  plan)
    print_plan
    exit 0
    ;;
  inspect)
    require_readonly_preflight
    ;;
  backup)
    require_readonly_preflight
    [[ -n "$TARGET" ]] || fail "backup requires an absolute dump path"
    ;;
  phase-a|cutover)
    require_cutover_pack
    [[ -n "$TARGET" && -d "$TARGET/.git" || -f "$TARGET/.git" ]] ||
      fail "phase-a/cutover requires an exact Git release worktree"
    ;;
  *)
    fail "unknown mode: $MODE"
    ;;
esac

MYIP="$(curl -fsS --max-time 15 https://api.ipify.org)"

cleanup() {
  if [[ "$RULE_CREATED" == 1 ]]; then
    az postgres flexible-server firewall-rule delete \
      -g "$RG" --server-name "$SERVER" --name "$RULE" --yes >/dev/null 2>&1 || true
  fi
  echo "firewall_after"
  az postgres flexible-server firewall-rule list \
    -g "$RG" --server-name "$SERVER" \
    --query "[].{name:name,start:startIpAddress,end:endIpAddress}" -o table
}
trap cleanup EXIT

az postgres flexible-server firewall-rule create \
  -g "$RG" --server-name "$SERVER" --name "$RULE" \
  --start-ip-address "$MYIP" --end-ip-address "$MYIP" -o none
RULE_CREATED=1

export PGPASSWORD="$(az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv)"
for attempt in 1 2 3 4; do
  if psql "$CONN" -qAt -c 'SELECT 1' >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" == 4 ]]; then
    echo "database connection did not become ready" >&2
    exit 1
  fi
  sleep 15
done

inspect_sql=$(cat <<'SQL'
SELECT 'columns' AS check_name,
       count(*) FILTER (WHERE column_name = 'graph_message_id') AS graph_message_id,
       count(*) FILTER (WHERE column_name = 'outlook_web_link') AS outlook_web_link
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'inbound_email';

SELECT 'constraints' AS check_name,
       count(*) FILTER (WHERE conname = 'uq_inbound_email_source_message_id') AS old_global,
       count(*) FILTER (WHERE conname = 'uq_inbound_email_source_mailbox_message_id') AS mailbox_qualified
FROM pg_constraint
WHERE conrelid = 'inbound_email'::regclass;

SELECT 'ledger_table' AS check_name,
       count(*) AS present
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'outlook_link_backfill_ledger';

SELECT 'duplicate_mailbox_message_pairs' AS check_name, count(*) AS duplicate_groups
FROM (
  SELECT lower(btrim(source_mailbox)), source_message_id
  FROM inbound_email
  GROUP BY lower(btrim(source_mailbox)), source_message_id
  HAVING count(*) > 1
) AS duplicates;

SELECT 'cross_mailbox_message_ids' AS check_name, count(*) AS repeated_ids
FROM (
  SELECT source_message_id
  FROM inbound_email
  WHERE source_message_id IS NOT NULL
  GROUP BY source_message_id
  HAVING count(DISTINCT lower(btrim(source_mailbox))) > 1
) AS repeated;

SQL
)

case "$MODE" in
  inspect)
    printf '%s\n' "$inspect_sql" | psql "$CONN" -v ON_ERROR_STOP=1 -P pager=off
    ;;
  phase-a)
    psql "$CONN" -v ON_ERROR_STOP=1 <<SQL
SET ROLE csadmin;
\i ${TARGET}/migration/assets/schema/deltas/2026-07-13-tkt009-outlook-message-link.sql
\i ${TARGET}/migration/assets/schema/deltas/2026-07-13-tkt009-outlook-link-backfill-ledger.sql
RESET ROLE;
${inspect_sql}
SQL
    ;;
  cutover)
    psql "$CONN" -v ON_ERROR_STOP=1 <<SQL
SET ROLE csadmin;
\i ${TARGET}/migration/assets/schema/deltas/2026-07-13-tkt009-mailbox-dedup-cutover.sql
RESET ROLE;
${inspect_sql}
SQL
    ;;
  backup)
    mkdir -p "$(dirname "$TARGET")"
    pg_dump "$CONN" --role=csadmin --format=custom --compress=6 --file="$TARGET"
    pg_restore --list "$TARGET" >/dev/null
    echo "backup_file=$TARGET"
    echo "backup_bytes=$(stat -c %s "$TARGET")"
    echo "backup_sha256=$(sha256sum "$TARGET" | cut -d' ' -f1)"
    echo "backup_catalog_entries=$(pg_restore --list "$TARGET" | grep -vc '^;')"
    ;;
  *)
    echo "unknown mode: $MODE" >&2
    exit 2
    ;;
esac
