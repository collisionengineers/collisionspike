# Verification — TKT-207: Build the complete repository inventory and disposition ledger

## Verdict
TESTED (offline) — all acceptance criteria A1–A8 are verified on the current tree. A1–A4 and A6–A8 by
independent Git-object sampling; A5 by the generated `docs/governance/repository-tree.md` (below).

## Evidence

### Machine-readable ledgers (A1–A4, A6, A8)
- Commit 70a3bb57 fixes the pre-mutation baseline and move/delete/preserve boundary.
- `npm run check:inventory` → `Repository inventory is current: 1110 directories, 3671 files.`
  `docs/governance/repository-inventory.json` records every stage-0 index file and ancestor directory
  with path, media type, size, SHA-256, category, owner and lifecycle; directory hashes and the
  inventory self-hash are null under explicit policies.
- `npm run check:reconciliation` → `Repository reconciliation passed: 3268 baseline files, 3669 final
  files, 0 unexplained.` `docs/governance/repository-reconciliation.json` reconstructs the baseline
  from the locked pre-reset main commit `81ae8fdf68b4fd29648d76dc77c379cd98764dbe` (Git tree/blob
  bytes), maps every pre-change tracked row to keep/move/rewrite/delete, and records an owner, origin
  and ticket for every final row.
- Evidence hashing groups identical bytes while retaining every path-level usage; the complete-checkout
  audit (`npm run inventory:checkout`) enumerates dependency trees, generated output, empty
  directories, symlinks and Git internals as an ephemeral CI/PR artifact (`repository-audit-ledgers`),
  because those counts are checkout-local rather than a repository invariant.

### Independent per-disposition-class and per-final-state sampling (A6, A7)
Method: a read-only sampler independent of the ledger's own self-check pulled the raw Git object bytes
for a deterministic spread (first, 1/3, 2/3, last) of each class and compared them to the ledger. For
keep/move it asserted **Git blob OID equality** between the baseline path (at commit `81ae8fdf`) and the
final staged path (`:0:`); for rewrite it asserted the blob OIDs differ; for delete it asserted the
baseline blob exists and the path is absent from the current index; for every final row it recomputed
SHA-256 from the staged blob and matched it to the ledger. All 35 samples verified. Representative rows:

| Class | Sampled path | Independent check | Result |
| --- | --- | --- | --- |
| keep | `tools/box/.gitignore` | baseline OID `f315bc83` == final OID `f315bc83`, finalPath unchanged, ledger SHA matches | PASS |
| move | `.azure/validate-pr55.sql` → `database/operations/validate-pr55.sql` | baseline OID `305217ea` == final OID `305217ea` | PASS |
| move | `test-cases-and-data/A.PCH261339/…/577337-images-38.jpg` → `tests/fixtures/evidence/sha256/fb/fb48…jpg` | baseline OID `64ecb556` == final OID `64ecb556` (binary evidence, no lossy conversion) | PASS |
| rewrite | `verify-all.mjs` | baseline OID `853d05f1` ≠ final OID `e9fe7f66`, ledger SHA matches final blob | PASS |
| rewrite | `.agents/skills/box-rest-api/SKILL.md` | baseline OID `a8047cb7` ≠ final OID `6530aa9a` | PASS |
| delete | `.azure/deployment-plan.md` | baseline blob `ac4027cf` present; absent from current index; finalPath null; explicit retirement reason | PASS |
| delete | `functions/parser/tests/fixtures/instructions/CLAIMANT PLACEHOLDER SIGNATURE 01.eml` | baseline blob `0522da94` present; absent from index | PASS |
| final:retained | `docs/tickets/done/TKT-125-add-case-descriptor-removal/TKT-125-…md` | final present; origin == self; ledger SHA matches | PASS |
| final:moved | `apps/web/.env.production` | origin `mockup-app/.env.production`; origin OID == final OID | PASS |
| final:rewritten | `docs/tickets/done/TKT-011-case-page/changes.md` | origin present at baseline; bytes differ | PASS |
| final:created | `services/data-api/src/features/cases/mutation-locks.ts` | no baseline path; origin `["PLAN-006"]`; ledger SHA matches | PASS |
| final:regenerated | `scripts/build/build-api.cjs` | no baseline path; origin `["PLAN-006"]`; lifecycle generated | PASS |

- Immutable-workingspace move (documented exception): `workingspace/smallmodels.md` (origin
  `docs/workingspace/smallmodels.md`). Baseline blob OID `b7da97ca` == final blob OID `b7da97ca`, so the
  tracked content is a byte-identical move. The ledger deliberately records this row's SHA-256 as the
  **locked physical CRLF checkout bytes** (`f02a8486…`, 4517 bytes = the working-tree file), not the
  LF-normalized staged blob (`ac1a8e6e…`, 4434 bytes), under the `immutableWorkingspace` hash policy and
  `isImmutableWorkingMove` reconciliation rule. The move is therefore proven by blob-OID equality plus
  the separate working-byte lock rather than by staged-SHA equality; this is the intended contract, not a
  discrepancy, and reconciliation reports it with `unexplained = 0`.
- A7: `check:reconciliation` reports zero unexplained additions, omissions, duplicate authorities,
  orphan directories, unowned outputs or unresolved dispositions (`0 unexplained`), and the independent
  sampling above corroborates each disposition and final-state class against Git ground truth.

### A8
`npm run generate:inventory`, `npm run generate:reconciliation` and `npm run inventory:checkout` are
documented in `docs/governance/repository-map.md` (the "Regenerating governance artifacts" section) and
perform no live read or write; the pre-commit hook (`scripts/hooks/pre-commit`) blocks a stale commit.

### Human-readable current and proposed trees (A5 — satisfied)
`docs/governance/repository-tree.md` is generated by `scripts/maintenance/generate-repository-tree.mjs`
from `repository-reconciliation.json`. It renders the current/pre-reset tree and the proposed/final tree
as per-area directory trees with per-area and total file/directory counts, and a Reconciliation section
asserting current totals == `summary.baseline{Files,Directories}`, proposed totals ==
`summary.final{Files,Directories}`, and proposed + the two ledger-omitted governance artifacts
(`repository-inventory.json`, `repository-reconciliation.json`, held out to avoid a mutual-hash cycle) ==
`repository-inventory.json` `counts`. `npm run check:tree` regenerates in memory and fails on any drift;
it is wired into `verify-all.mjs` (the CI contracts-and-hygiene job) and converges idempotently inside
`generate:governance` (verified byte-identical across repeated runs). `npm run check:tree` → PASS.
A5 verdict: PASS.

## Pending / gaps
- None. Every acceptance criterion (A1–A8) has concrete current-tree evidence.

## How to re-verify
Stage the intended final tree, run `node scripts/maintenance/generate-repository-inventory.mjs`, then
rerun it with `--check` from the final clean checkout. Run `npm run check:reconciliation`. Re-run the
per-class sampling by pulling baseline bytes with
`git cat-file blob 81ae8fdf68b4fd29648d76dc77c379cd98764dbe:<path>` and final bytes with
`git cat-file blob :0:<path>`, then compare blob OIDs (`git rev-parse <ref>:<path>`) per the keep / move /
rewrite / delete / retained / moved / rewritten / created / regenerated rules above. For the four
immutable `workingspace/*` rows, expect blob-OID equality against `docs/workingspace/*` plus the locked
physical-byte SHA-256, not staged-SHA equality.
