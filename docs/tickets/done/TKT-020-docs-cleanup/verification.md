# Verification — TKT-020: Repository structure and documentation reset

## Verdict
TESTED (offline)

## Evidence
- PLAN-006 contains TKT-020 and TKT-207 through TKT-215; ticket generation reports 207 tickets and six
  plans with exact bidirectional membership.
- The generated final-tree inventory contains 2,889 tracked files and 903 directories. TKT-207 records
  the deterministic inventory, baseline reconciliation and complete physical-checkout inventory process.
- The evidence catalog records 550 logical usages backed by 533 unique blobs. Seventeen duplicate
  occurrences remove 72,307,413 repeated checkout bytes while preserving every logical use; 94
  non-retained occurrences have explicit dispositions.
- All four workingspace SHA-256 values exactly match the locked TKT-208 baseline.
- Owned source is within the 800-nonblank-line cap across 800 files. Package suites passed with 554
  domain, 772 Data API, 470 orchestration and 525 web tests. Retained Python suites passed 860 tests,
  with nine intentional parser skips.
- Database parity proves 22 code tables and 171 ordered options with fingerprint
  1160403a90e21a333a68d4c492a75ba54c699f8b368ea14e620eba2ce647951b.
- Documentation validation reports zero broken links, orphans or authority leakage. Ticket checks and
  generated agent parity pass for 15 roles and 10 skills.
- Strict text/path, broad vocabulary, extracted-binary and reviewed-image purge gates pass.
- TKT-215 records a read-only live-use audit. No PLAN-006 implementation step performed a deployment,
  live write or cloud configuration change; TKT-216 remains separate under PLAN-004.
- The final fail-closed `node verify-all.mjs` run completed 34 stages with zero failures, beginning with
  a fresh `npm ci` and including builds, tests, deployment-bundle smoke loads and every repository gate.

## Correction (2026-07-19)
The Evidence above records the PLAN-006-close-out-era snapshot (207 tickets / six plans; 2,889 tracked
files; 800 owned source files). Per the A9 no-silent-overwrite rule those figures are not rewritten — they
were correct at close-out and remain recoverable from Git history — but the tree has since grown (PLAN-007
through PLAN-012 landed and TKT-210 decomposed the owned source). The reset is a set of invariants, not
fixed counts; the independent re-verification below is against the current tree.

## Independent verification (2026-07-19)
Independent adversarial re-verification (offline, read-only), not trusting this file's prior evidence:
- **Substantive reset invariants PASS on the current tree:** `check:reconciliation` 0 unexplained
  (3268 baseline / 3674 final); `check:forbidden` 2966 files, no matches (A3 / TKT-211); all four
  `workingspace` SHA-256 byte-exact (A4 / TKT-208: `1e092f72`/`46e57959`/`768893ff`/`f02a8486`);
  `check:production-dependencies` 9 entrypoints / 506 modules / 0 artificial-data imports (A5 / TKT-210);
  `check:source-size` 940 files under the 800-nonblank cap; `check:adapters` 15 roles / 10 skills;
  `check:docs` 1446 files, 0 issues; `check:evidence` 638/618; `check:layout` 3680 paths.
- **A1 confirmed:** PLAN-006 lists all ten members and all ten point back with `status: done` (bidirectional).
- The governance ledgers (`repository-inventory.json`, `repository-reconciliation.json`,
  `repository-tree.md`) and the derived ticket views are regenerated to the current tree in this close-out
  commit (stage-then-regenerate convergence), so `check:inventory`, `check:reconciliation`, `check:tree`
  and `check:tickets` pass; `check:tree` is additionally wired into the required CI hygiene job in this PR.

## Pending / gaps
- None outstanding. The reset invariants are independently confirmed on the current tree; the full
  aggregate (npm ci + all workspace suites + retained Python + every gate above) runs on this close-out PR
  from a clean checkout, and the merge is gated on that run being green.

## How to re-verify
Run node verify-all.mjs from the final clean checkout, regenerate and check the repository inventory,
inspect the matching remote CI result, then independently sample each PLAN-006 ticket's evidence before
changing status.
