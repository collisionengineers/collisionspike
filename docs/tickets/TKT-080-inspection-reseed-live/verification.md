# Verification — TKT-080: Reseed the live address catalogue + deploy and prove the whole inspection repair

## Verdict
RESEED DONE + PROVEN; API/SPA/Function DEPLOYED; data smoke PASS (2026-07-06). Operator live SPA
click-through per provider is the remainder (API HTTP is bearer-gated for the agent).

Pre-reseed baseline (the before-side of the diff):
[evidence/preflight-baseline-2026-07-06.md](./evidence/preflight-baseline-2026-07-06.md).

## 1. Live reseed — backup-first, confirmed-rows preserved, idempotent
Ran (Entra `digital@` → `SET ROLE csadmin`, transient FW rule added+removed) the DDL delta
(`provider_code`/`latitude`/`longitude` + provider index) + the `920` replace seed from the corrected
`inspection-suggestions.csv`:
```
BEFORE: confirmed=175  checksum=6102225bceaaf851a83742f56168da05
backup: inspection_address_reseed_backup_2026_07_06 = 2035 rows (rollback path)
COPY 2012  ->  DELETE 2035  ->  INSERT 0 2012   (0 ON CONFLICT skips = all labels unique)
AFTER:  suggested=2012 | confirmed=175 | provider_code=2012 | lat/lon=1878
AFTER:  confirmed checksum=6102225bceaaf851a83742f56168da05  (== BEFORE -> 175 rows byte-identical)
```
**Idempotency (RUN 2):** DELETE 2012 → INSERT 2012, identical counts + identical confirmed checksum — the
second apply converges to the same state (no-op-equivalent).

## 2. Deploys
- api `cespk-api-dev` — esbuild bundle republished (`func publish`), **82 functions** re-verified via
  `az functionapp function list`.
- location fn `cespkloc-fn-a7tzj2` — `func publish --python --build remote` (Oryx), host Running,
  `location-suggest` registered.
- SPA `cespk-spa-dev` — vite build + `swa deploy`; live CSP header re-verified
  (`default-src 'self'; connect-src 'self' https://cespk-api-dev… https://login.microsoftonline.com; …`).

## 3. Per-provider live smoke matrix (Postgres, deployed data)
| provider | sites | geocoded | #1 site |
|---|---|---|---|
| QDOS | 1 | 1 | Asher Road, ML6 8TA |
| PCH | 1 | 0 | 87 Countess Road |
| QCL | 132 | 127 | Cariocca Business Park, M12 4AH |
| FW | 97 | 89 | Somstar Recovery and Storage, B5 6JX |

Firehose closed: **0** suggested rows without a `provider_code`. QDOS/PCH now present (were absent).

## 4. Rollback path (tested by construction)
Restore from `inspection_address_reseed_backup_2026_07_06`: `DELETE FROM inspection_address WHERE
source_label LIKE 'suggested%'; INSERT INTO inspection_address SELECT * FROM
inspection_address_reseed_backup_2026_07_06;` (confirmed rows are never touched by the reseed).

## 5. Docs / registry
`LIVE_FACTS.json` (`inspection_address` count refreshed — the confirmed/suggested split lives only in the
registry [live-environment.md](../../architecture/live-environment.md); new `verifiedBy` entry;
`lastVerified` bumped) + the `live-environment.md` mirror updated. `inspection-address-corpus.md` +
ADR-0016 note + gated.md updated (LOCATION_ASSIST_AI E2 + the AZURE_MAPS_KEY follow-up for proximity).

## Pending (operator)
`VERIFY_LIVE=1 node verify-all.mjs` (needs an az login in the gate's environment); the per-provider live
SPA click-through; `AZURE_MAPS_KEY` on the api app for runtime proximity ordering.
