# Verification — TKT-075: Rebuild the inspection-address corpus in-repo — correct provider attribution + geocodes

## Verdict
BUILT + VALIDATED (2026-07-06). Pipeline is reproducible, deterministic, and PII-free; the DDL delta +
920 reseed were validated against the live DB in a rolled-back transaction (live untouched). The live
**commit** of the reseed is TKT-080.

## 1. Determinism (verification standard: stable hash across runs)
`build_corpus.py` run twice → identical `inspection-suggestions.csv` SHA-256
(`43a7e7c3…` on the pre-geocode CSV). `geocode_sites.py --offline` fills lat/lon from the committed
cache, so `build → geocode(--offline)` is fully deterministic.

## 2. PII-free output (scripted audit)
Grep sweep over `inspection-suggestions.csv`:
- image-based / assessment junk rows: **0** (after hyphen/typo-tolerant detection).
- VRM-shaped tokens (`AB12CDE`): **0**.
- No insured name / claim number / inspection-contact columns are emitted (the writer only outputs
  provider_code, label, address lines, postcode, lat/lon, stats).

## 3. Corpus shape
- 17,737 source rows → **2,012 unique sites across 80 providers**.
- 4,673 `a.`/`ap.`-marked Case IDs correctly folded (QDOS now the top by case volume: 7,414).
- 195 VRM-shaped Case IDs excluded; ~10.4k+ image-based rows dropped.
- `label` unique (postcode-disambiguated) — 2,012 distinct labels, max 85 chars (< varchar(200)).
- Geocoded: **1,352/1,388 postcodes resolved** → 1,878/2,012 rows carry lat/lon (spot-checked:
  M12 4AH→Manchester, G5 8BF→Glasgow).

## 4. DDL delta + 920 reseed — live dry-run (rolled back; live data untouched)
Ran the delta (`ADD COLUMN IF NOT EXISTS provider_code/latitude/longitude`) + the 920 replace logic
inside a `BEGIN … ROLLBACK` against live `cespk-pg-dev` (Entra admin + `SET ROLE csadmin`):
```
COPY 2012            -- \copy staged all rows (1878 with_geo, 80 providers)
DELETE 2035          -- old suggested removed
INSERT 0 2012        -- 0 ON CONFLICT skips => all labels unique, no confirmed-row collision
after replace: suggested=2012 | confirmed preserved=175 | suggested w/ provider_code=2012 | w/ lat/lon=1878
ROLLBACK -> live suggested count back to original 2035 (nothing committed)
```
Proves: the delta applies, `\copy` loads + type-coerces (lat/lon double, dates), the replace preserves
exactly the 175 non-suggested rows, and every new suggested row carries a provider_code.

## 5. Operator run report (policy input — pipeline never sets policy)
`reports/provider-report.csv` gives image-based % per provider for the operator to designate
`always_image_based`: QDOS 99.9%, PCH 99.6%, SBL 99.5%, AX 99.2%, ALS 95.8% (near-pure image-based);
QCL 6.7%, OAK 25.5%, FW 39.8% (site-based).

## Note on the source xlsx
Per the operator decision, the PII-bearing source `docs/reference/fullevaexportinspectionaddresses.xlsx`
is left git-tracked as-is; the residual exposure is accepted. All pipeline OUTPUT is PII-free (§2).

## Deferred to TKT-080
The live COMMIT of the reseed, the confirmed-row checksum, the second-run idempotency proof, and the
per-provider live smoke matrix are TKT-080 (the cutover ticket).

## How to re-verify
`python scripts/inspection-corpus/build_corpus.py && python scripts/inspection-corpus/geocode_sites.py --offline`
then re-hash the CSV; grep the CSV for image/VRM leakage; re-run the rolled-back dry-run SQL.
