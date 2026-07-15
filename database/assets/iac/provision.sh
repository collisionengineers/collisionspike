#!/usr/bin/env bash
# =============================================================================
# provision.sh — collisionspike migration, Phase P1 ("Provision the Azure substrate")
# -----------------------------------------------------------------------------
# Creates the NEW Azure PaaS substrate for the off-Power-Platform migration, in the
# EXISTING resource group rg-collisionspike-dev (UK South). Idempotent: every step
# guards on an `az ... show` so re-running converges instead of erroring.
#
# What it creates (all NEW; nothing existing is modified or deleted):
#   - 2 host storage accounts        (cespkapistdev01, cespkorchstdev01)
#   - Postgres Flexible Server B1ms   (cespk-pg-dev)  + the `collisionspike` database
#   - Data API Function App           (cespk-api-dev,  Node 20, Flex Consumption)
#   - Orchestration Function App      (cespk-orch-dev, Node 20, Flex Consumption)
#   - Static Web App (Free)           (cespk-spa-dev)
#   - System-assigned identities on both Function Apps
#   - A break-glass DB-admin Key Vault (cespk-pg-kv-dev) holding the generated password
#   - Key Vault Secrets User grants for the new app identities on the vaults they read
#
# What it LEAVES ALONE (verified pre-existing — see migration/01 + CLAUDE.md):
#   - rg-collisionspike-dev, the 6 Python Functions, ACR, Blob cespkevidstdev01,
#     App Insights / Log Analytics, and KVs cespkenrichkvgi62sd / cespkevakvufa3ci /
#     cespkboxkvv76a47.
#
# SECRETS: never hardcoded. The DB admin password is generated with `openssl`,
# pushed straight into Key Vault, and never echoed. EVA/Box secrets stay absent
# (their vaults stay empty until their gates flip — see migration/11).
#
# Microsoft Learn verification (topics consulted while authoring this script):
#   - "az postgres flexible-server create" (CLI ref) + "Use an Azure free account to
#      try Azure Database for PostgreSQL for free" (B1MS / 32 GB / Development / 12 mo)
#   - "Create and manage function apps in the Flex Consumption plan" (TypeScript pivot)
#      → `az functionapp create --flexconsumption-location ... --runtime node`
#   - "az staticwebapp create" (CLI ref) — `--sku Free`, global service
#   - "Use Key Vault references as app settings…" → Key Vault Secrets User RBAC grant
#
# Prereqs: az CLI >= 2.62, logged in (`az login`), `openssl`, and the rdbms-connect /
# staticwebapp CLI surfaces (installed on demand below). RUN FROM ANY DIRECTORY.
#
# Usage:   bash provision.sh           # provision everything (idempotent)
#          DRY_RUN=1 bash provision.sh # print what WOULD run, change nothing
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# 0. Configuration — names are the canonical ones used throughout migration/*.md
# -----------------------------------------------------------------------------
SUBSCRIPTION_ID="e6076573-23a5-46a8-acef-7e22d264e5db"   # "Azure subscription 1" (FreeTrial)
RG="rg-collisionspike-dev"
LOCATION="uksouth"
SWA_LOCATION="westeurope"          # SWA is global; uksouth is NOT a SWA control-plane region — westeurope is nearest

# Postgres
PG_SERVER="cespk-pg-dev"
PG_ADMIN_USER="csadmin"            # NB: cannot be admin/azure_superuser/azure_pg_admin/root/guest/public
PG_DB="collisionspike"
PG_VERSION="16"
PG_TIER="Burstable"
PG_SKU="Standard_B1ms"
PG_STORAGE_GB="32"                 # keep <=32 GB to stay inside the 12-month free-account allowance
PG_BACKUP_DAYS="7"                 # 7-day PITR; free-account backup allowance is 32 GB

# Function Apps (Flex Consumption, Node 20)
API_APP="cespk-api-dev"
API_STORAGE="cespkapistdev01"      # 3-24 lowercase alphanumeric, globally unique
ORCH_APP="cespk-orch-dev"
ORCH_STORAGE="cespkorchstdev01"
NODE_VERSION="20"

# Static Web App
SWA_APP="cespk-spa-dev"

# Key Vaults
PG_VAULT="cespk-pg-kv-dev"         # NEW: holds the break-glass DB admin password (RBAC vault)
EVA_VAULT="cespkevakvufa3ci"       # EXISTING (empty/gated) — new apps READ it once EVA_API_ENABLED flips
KV_SECRETS_USER="Key Vault Secrets User"          # role display name
KV_SECRETS_OFFICER="Key Vault Secrets Officer"    # needed (data-plane) to WRITE the secret into an RBAC vault

DRY_RUN="${DRY_RUN:-0}"

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
note() { printf '    %s\n' "$*"; }
run()  {
  # echo the command; execute unless DRY_RUN
  printf '    \033[0;90m$ %s\033[0m\n' "$*"
  if [[ "$DRY_RUN" != "1" ]]; then eval "$@"; fi
}
exists() { # exists "<az show cmd ...>"  -> true if the resource is found
  eval "$1" >/dev/null 2>&1
}

# -----------------------------------------------------------------------------
# 1. Preflight — subscription, CLI extensions, resource group sanity
# -----------------------------------------------------------------------------
log "Preflight"
run "az account set --subscription \"$SUBSCRIPTION_ID\""
CURRENT_SUB="$(az account show --query id -o tsv 2>/dev/null || echo '')"
if [[ "$DRY_RUN" != "1" && "$CURRENT_SUB" != "$SUBSCRIPTION_ID" ]]; then
  echo "FATAL: active subscription ($CURRENT_SUB) != expected ($SUBSCRIPTION_ID). Run 'az login' first." >&2
  exit 1
fi
note "Free-trial reminder: upgrade this subscription to Pay-As-You-Go BEFORE the 30-day \$200 credit"
note "expires, or paid resources (incl. the existing Functions) get disabled. The 12-month free"
note "allowances (Postgres B1ms) SURVIVE the upgrade. See migration/40-costing-and-servicing.md."

# Resource group must already exist (we never create/delete it).
if ! exists "az group show -n \"$RG\""; then
  echo "FATAL: resource group $RG not found. This script provisions INTO the existing RG only." >&2
  exit 1
fi

# Ensure the CLI surfaces we need are present (idempotent installs).
run "az extension add --upgrade -n rdbms-connect 2>/dev/null || true"
run "az extension add --upgrade -n staticwebapp 2>/dev/null || true"
# Register providers (no-op if already registered).
for ns in Microsoft.DBforPostgreSQL Microsoft.Web Microsoft.KeyVault Microsoft.Storage; do
  run "az provider register -n $ns --wait 2>/dev/null || true"
done

# -----------------------------------------------------------------------------
# 2. Host storage accounts for the two Function Apps (Flex Consumption needs one each)
# -----------------------------------------------------------------------------
log "Storage accounts (AzureWebJobsStorage hosts; Flex also stores its deployment package here)"
for SA in "$API_STORAGE" "$ORCH_STORAGE"; do
  if exists "az storage account show -g \"$RG\" -n \"$SA\""; then
    note "$SA already exists — skip"
  else
    run "az storage account create -g \"$RG\" -n \"$SA\" -l \"$LOCATION\" \
      --sku Standard_LRS --kind StorageV2 --min-tls-version TLS1_2 \
      --allow-blob-public-access false"
  fi
done

# -----------------------------------------------------------------------------
# 3. Break-glass DB-admin Key Vault + generated password (never hardcoded)
# -----------------------------------------------------------------------------
# The Data API prefers Microsoft Entra auth to Postgres (no password at all — see migration/11),
# but the server still needs an admin at create time. We generate a strong password, store it in a
# dedicated RBAC vault, and treat it as break-glass only. EVA/Box vaults stay untouched.
log "Break-glass DB-admin Key Vault ($PG_VAULT)"
if exists "az keyvault show -n \"$PG_VAULT\""; then
  note "$PG_VAULT already exists — skip create"
else
  run "az keyvault create -g \"$RG\" -n \"$PG_VAULT\" -l \"$LOCATION\" \
    --enable-rbac-authorization true --retention-days 7"
fi

# Grant the *operator* running this script data-plane write access (RBAC vaults require an explicit
# role to set secrets — Owner/Contributor is control-plane only and cannot write secret values).
ME_OID="$(az ad signed-in-user show --query id -o tsv 2>/dev/null || echo '')"
PG_VAULT_ID="$(az keyvault show -n "$PG_VAULT" --query id -o tsv 2>/dev/null || echo '')"
if [[ -n "$ME_OID" && -n "$PG_VAULT_ID" ]]; then
  run "az role assignment create --assignee-object-id \"$ME_OID\" --assignee-principal-type User \
    --role \"$KV_SECRETS_OFFICER\" --scope \"$PG_VAULT_ID\" 2>/dev/null || true"
fi

# -----------------------------------------------------------------------------
# 4. Postgres Flexible Server B1ms + database
# -----------------------------------------------------------------------------
log "Postgres Flexible Server ($PG_SERVER, $PG_SKU, ${PG_STORAGE_GB}GB, PG$PG_VERSION)"
if exists "az postgres flexible-server show -g \"$RG\" -n \"$PG_SERVER\""; then
  note "$PG_SERVER already exists — skip create (admin password NOT rotated on re-run)"
else
  # Generate the admin password ONCE, store in KV, then create the server using it.
  # The password is passed via a variable and never printed.
  if [[ "$DRY_RUN" == "1" ]]; then
    note "[dry-run] would: openssl rand -> KV secret 'pg-admin-password' -> create server"
  else
    PG_PWD="$(openssl rand -base64 24)Aa1!"   # >=8 chars, mixes all 4 required categories
    az keyvault secret set --vault-name "$PG_VAULT" --name "pg-admin-password" \
      --value "$PG_PWD" --only-show-errors >/dev/null
    note "Stored admin password in $PG_VAULT/secrets/pg-admin-password (value not displayed)"
    # --public-access None = public networking ON, but no firewall rule yet (we add the Azure-services rule below).
    # Development workload (Burstable) keeps us inside the free-account allowance; HA disabled by default.
    az postgres flexible-server create \
      --resource-group "$RG" --name "$PG_SERVER" --location "$LOCATION" \
      --tier "$PG_TIER" --sku-name "$PG_SKU" \
      --storage-size "$PG_STORAGE_GB" --version "$PG_VERSION" \
      --backup-retention "$PG_BACKUP_DAYS" \
      --admin-user "$PG_ADMIN_USER" --admin-password "$PG_PWD" \
      --microsoft-entra-auth Enabled --password-auth Enabled \
      --public-access None --yes
    unset PG_PWD
  fi
fi

# Firewall: allow other Azure services (the 0.0.0.0 special rule) so the Flex Function Apps — whose
# outbound IPs are dynamic — can reach the server. Idempotent (create is a no-op if the rule exists).
log "Postgres firewall — allow Azure services (dev posture; prefer VNet/private for prod)"
run "az postgres flexible-server firewall-rule create -g \"$RG\" -n \"$PG_SERVER\" \
  --rule-name AllowAzureServices --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 \
  --only-show-errors 2>/dev/null || true"
# Optional: allow the operator's current public IP so they can run psql to load the schema.
#   MYIP=$(curl -s https://api.ipify.org)
#   az postgres flexible-server firewall-rule create -g "$RG" -n "$PG_SERVER" \
#     --rule-name OperatorBuildHost --start-ip-address "$MYIP" --end-ip-address "$MYIP"

# Make the operator a Microsoft Entra admin on the server (so MI/Entra auth works without the password).
if [[ -n "${ME_OID:-}" ]]; then
  ME_UPN="$(az ad signed-in-user show --query userPrincipalName -o tsv 2>/dev/null || echo "$ME_OID")"
  run "az postgres flexible-server microsoft-entra-admin create -g \"$RG\" -s \"$PG_SERVER\" \
    --object-id \"$ME_OID\" --display-name \"$ME_UPN\" --type User \
    --only-show-errors 2>/dev/null || true"
fi

# Application database.
log "Postgres database ($PG_DB)"
# This az version names the db with --name/-n (not -d). Try --database-name then --name; tolerate "already exists".
run "az postgres flexible-server db create -g \"$RG\" -s \"$PG_SERVER\" --database-name \"$PG_DB\" --only-show-errors 2>/dev/null || az postgres flexible-server db create -g \"$RG\" -s \"$PG_SERVER\" --name \"$PG_DB\" --only-show-errors 2>/dev/null || true"

# -----------------------------------------------------------------------------
# 5. Function Apps — Flex Consumption, Node 20 (Data API + Orchestration)
# -----------------------------------------------------------------------------
# Flex Consumption only runs Functions runtime v4, so NO --functions-version is passed.
# One app per Flex plan (Flex creates the plan implicitly).
create_flex_funcapp() {
  local app="$1" sa="$2"
  if exists "az functionapp show -g \"$RG\" -n \"$app\""; then
    note "$app already exists — skip create"
  else
    run "az functionapp create \
      --resource-group \"$RG\" --name \"$app\" \
      --storage-account \"$sa\" \
      --flexconsumption-location \"$LOCATION\" \
      --runtime node --runtime-version \"$NODE_VERSION\""
  fi
  # System-assigned identity (Key Vault references resolve against it by default).
  run "az functionapp identity assign -g \"$RG\" -n \"$app\""
}

log "Data API Function App ($API_APP)"
create_flex_funcapp "$API_APP" "$API_STORAGE"

log "Orchestration Function App ($ORCH_APP)"
create_flex_funcapp "$ORCH_APP" "$ORCH_STORAGE"
# Keep one Durable instance always-ready to cut intake-orchestration cold-start latency.
# (`durable` is the reserved per-function scaling group for ALL Durable triggers — orchestration/
# activity/entity — see migration/22. It does NOT warm the plain timer trigger `graph-renew`, which
# lives in its own per-function scaling group; that timer's cold start is harmless given the 12 h
# cadence inside the under-7-day renewal window. To warm the timer too, add `function:graph-renew=1`.)
run "az functionapp scale config always-ready set -g \"$RG\" -n \"$ORCH_APP\" \
  --settings durable=1 2>/dev/null || true"

# -----------------------------------------------------------------------------
# 6. Static Web App (Free) for the SPA
# -----------------------------------------------------------------------------
log "Static Web App ($SWA_APP, Free)"
if exists "az staticwebapp show -g \"$RG\" -n \"$SWA_APP\""; then
  note "$SWA_APP already exists — skip"
else
  # No --source/--branch: this is a CLI/token deploy (no GitHub wiring). -l is the control-plane region.
  run "az staticwebapp create -n \"$SWA_APP\" -g \"$RG\" -l \"$SWA_LOCATION\" --sku Free"
fi

# -----------------------------------------------------------------------------
# 7. Key Vault Secrets User grants for the new app identities
# -----------------------------------------------------------------------------
# Least privilege: Secrets User = data-plane secret READ only (not Reader = metadata only,
# not Secrets Officer = write). GUID 4633458b-17de-408a-b874-0445c86b69e6 for IaC.
grant_secrets_user() { # grant_secrets_user <app-name> <vault-name>
  local app="$1" vault="$2" pid vid
  pid="$(az functionapp identity show -g "$RG" -n "$app" --query principalId -o tsv 2>/dev/null || echo '')"
  vid="$(az keyvault show -n "$vault" --query id -o tsv 2>/dev/null || echo '')"
  if [[ -z "$pid" || -z "$vid" ]]; then note "skip grant ($app -> $vault): identity/vault not resolvable"; return; fi
  # --assignee-object-id + ServicePrincipal avoids a Graph lookup that can fail on fresh MIs (replication lag).
  run "az role assignment create \
    --assignee-object-id \"$pid\" --assignee-principal-type ServicePrincipal \
    --role \"$KV_SECRETS_USER\" --scope \"$vid\" 2>/dev/null || true"
}

log "Key Vault Secrets User grants"
# Data API reads the break-glass DB vault (only relevant on the password path; harmless pre-stage on Entra path).
grant_secrets_user "$API_APP" "$PG_VAULT"
# Both new apps will read the EVA vault ONCE EVA_API_ENABLED flips. The role grant is a harmless pre-stage
# (the vault is empty today); the KV-reference app-settings are applied LATER, at flip time (see migration/11).
grant_secrets_user "$API_APP"  "$EVA_VAULT"
grant_secrets_user "$ORCH_APP" "$EVA_VAULT"
note "NOT granted: cespkenrichkvgi62sd stays exclusively the enrichment Function's (migration/11 invariant)."

# -----------------------------------------------------------------------------
# 8. Summary
# -----------------------------------------------------------------------------
log "Done — P1 substrate provisioned (idempotent; safe to re-run)"
cat <<EOF
  Next (NOT done by this script — see the referenced plan files):
    - DB schema + seed ........ migration/20-data-and-schema-migration.md  (psql -f assets/schema/*.sql)
    - API app-settings/gates .. migration/10-settings-migration.md  + KV refs migration/11
    - Code deploy ............. func azure functionapp publish $API_APP / $ORCH_APP ; SWA token deploy (migration/30)
    - Graph subscription ...... migration/22-orchestration-migration.md
    - Entra app registrations . migration/31-auth-migration.md
  Costing / runway ........... migration/40-costing-and-servicing.md
EOF
