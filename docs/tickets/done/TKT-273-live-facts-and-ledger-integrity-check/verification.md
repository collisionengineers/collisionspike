# Verification — TKT-273: Add the LIVE_FACTS and ledger integrity standing check

## Verdict

PASS

## Evidence

- **A1 — snapshot + field map + digest.** `docs/operations/live-facts.evidence.json` maps all seven
  governed numeric facts with evidence source, probe, and comparison. `LIVE_FACTS.authority.machineEvidence`
  records the path and SHA-256.
- **A2 — offline check + negatives.** `node scripts/checks/check-live-facts.mjs` → OK (7 governed fields
  match; digest + doc-authority verified). `node --test scripts/checks/check-live-facts.test.mjs` — 9/9,
  covering stale snapshot, digest mismatch, missing mapping, registry/snapshot mismatch, and doc/registry
  date disagreement.
- **A3 — credential-gated read-only comparator.** `node scripts/checks/live-facts-azure-compare.mjs` with
  no credentials prints an explicit SKIP (not live verification) and exits 0, making no Azure contact and
  no write. `node --test scripts/checks/live-facts-azure-compare.test.mjs` — 3/3 for the fail-closed
  comparison. All `az` args are asserted read-only.
- **A4 — workflow fixed; verifier offline.** `.github/workflows/ci.yml` `verify-live` invokes
  `live-facts-azure-compare.mjs`; `verify-all.mjs` remains network-free and now runs `check:live-facts`.
- **A5 — ledger checks canonical.** `check:inventory` / `check:reconciliation` untouched; not reimplemented.
- **A6 — docs, no secrets.** `live-environment.md` gains a Registry integrity section; the evidence file
  and docs contain no secrets, tokens, or connection strings. `check:docs` passes.
- **R1–R3.** parser 4→5; 146→144 reconciled (machine snapshot 144 + dated-doc note); `live-environment.md`
  header date 2026-07-19 derived from the registry.
- **A7 — no live write.** Verified — comparator is read-only and skipped locally with no Azure contact.

## Commands

```
node scripts/checks/check-live-facts.mjs
node --test scripts/checks/check-live-facts.test.mjs scripts/checks/live-facts-azure-compare.test.mjs
node scripts/checks/live-facts-azure-compare.mjs   # → explicit SKIP (no credentials)
node scripts/checks/check-doc-links.mjs
```

## Pending / gaps

The credential-gated Azure comparison's live path is operator-run (no Azure credentials in this
environment); its no-credential skip and its pure fail-closed comparison are verified here.

None blocking.
