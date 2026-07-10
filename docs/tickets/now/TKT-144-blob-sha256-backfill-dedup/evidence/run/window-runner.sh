#!/usr/bin/env bash
# TKT-144 transient Postgres window runner: FW rule -> psql -f $1 -> trap-deleted rule.
set -euo pipefail
SQLFILE="$1"
RG=rg-collisionspike-dev
SRV=cespk-pg-dev
RULE="tkt144-$(date +%s)"
MYIP=$(curl -s --max-time 15 https://api.ipify.org)
echo "== window: rule=$RULE ip=$MYIP sql=$SQLFILE =="

cleanup() {
  echo "== cleanup: deleting firewall rule $RULE =="
  az postgres flexible-server firewall-rule delete -g "$RG" --name "$SRV" --rule-name "$RULE" --yes >/dev/null 2>&1 || true
  echo "== firewall rules remaining =="
  az postgres flexible-server firewall-rule list -g "$RG" --name "$SRV" --query "[].{name:name,start:startIpAddress,end:endIpAddress}" -o table
}
trap cleanup EXIT

az postgres flexible-server firewall-rule create -g "$RG" --name "$SRV" --rule-name "$RULE" \
  --start-ip-address "$MYIP" --end-ip-address "$MYIP" -o none
export PGPASSWORD=$(az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv)

CONN="host=cespk-pg-dev.postgres.database.azure.com port=5432 dbname=collisionspike sslmode=require user=digital@collisionengineers.co.uk"
# firewall propagation can lag ~10-30s; bounded connect wait, then one real run
for i in 1 2 3 4; do
  if psql "$CONN" -qAt -c "SELECT 1" >/dev/null 2>&1; then break; fi
  echo "connect not ready (attempt $i), waiting 15s"; sleep 15
done
set +e
psql "$CONN" -v ON_ERROR_STOP=1 -f "$SQLFILE" > /tmp/tkt144-psql-out.txt 2>&1
RC=$?
set -e
echo "== psql output (buffered, rc=$RC) =="
cat /tmp/tkt144-psql-out.txt
exit $RC
