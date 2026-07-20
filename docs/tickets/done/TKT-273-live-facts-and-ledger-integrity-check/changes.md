# Changes — TKT-273: Add the LIVE_FACTS and ledger integrity standing check

## Evidence snapshot + field map (A1)

- New committed, secret-free `docs/operations/live-facts.evidence.json`: a machine-readable snapshot +
  field map. Each entry maps a governed `LIVE_FACTS.json` JSON path to its evidenced value, the dated
  read-only evidence source, the read-only probe that reproduces it, and the comparison rule. Covers all
  seven governed numeric facts (six `functionCount`, one `baseTableCount`).
- `LIVE_FACTS.json` now records the snapshot path and its SHA-256 under `authority.machineEvidence`.

## Offline integrity check (A2, A4)

- New `scripts/checks/check-live-facts.mjs` (`check:live-facts`, wired into `verify-all.mjs`) fails on a
  malformed snapshot, a digest mismatch, a snapshot whose `capturedAt` != `LIVE_FACTS.lastVerified`, a
  governed numeric field with no mapping, a registry/snapshot value mismatch, or a `live-environment.md`
  verified date that disagrees with the registry. It is fully offline.
- `scripts/checks/check-live-facts.test.mjs` covers the real committed files plus each negative case.

## Credential-gated live comparison (A3, A4)

- New `scripts/checks/live-facts-azure-compare.mjs` (`compare:live-facts`) runs read-only
  `az functionapp function list` probes, compares every ARM-probable governed count with both the
  committed evidence and the registry, fails closed on any query failure or drift, and emits a sanitised
  counts-only artifact. Without credentials it prints an explicit skip that is not live verification. All
  `az` argument lists are asserted read-only before spawn; no writes.
- `.github/workflows/ci.yml` `verify-live` now invokes `live-facts-azure-compare.mjs` instead of the
  false-green `VERIFY_LIVE=1 node verify-all.mjs` (which `verify-all.mjs` never consumed).
- `verify-all.mjs` stays offline.

## Ledger checks stay canonical (A5)

`check:inventory` and `check:reconciliation` are untouched and remain the canonical repository-tree ledger
checks; the new integrity check does not reimplement them.

## Audit remediation R1–R3 + docs (A6)

- **R1** `LIVE_FACTS.parser.functionCount` 4 → **5** (backed by `cloud-inventory-2026-07-17.md` §6.1 and
  `services/functions/parser/function_app.py`'s five `@app.route` handlers).
- **R2** the snapshot's 146 vs registry 144 is resolved: the machine snapshot records 144 with the
  over-count provenance, and `cloud-inventory-2026-07-17.md` gains a reconciliation note (the dated raw
  capture is preserved).
- **R3** `live-environment.md`'s header "last verified" date is corrected to 2026-07-19 and now states it
  is derived from `LIVE_FACTS.lastVerified` (enforced by `check:live-facts`).
- A **Registry integrity** section documents both commands and the evidence schema; no secrets exposed.

## No live write (A7)

Repository files, checks, and read-only tooling only. No deploy, cloud, database, mailbox, or secret
mutation. The comparator is read-only and fails closed.
