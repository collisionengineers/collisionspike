---
id: PLAN-010
title: Scripts and tooling dedup
status: active
tickets: [TKT-258, TKT-259, TKT-260, TKT-261]
depends-on: [TKT-207, TKT-209, TKT-214]
---

# PLAN-010 — Scripts and tooling dedup

## Outcome

The `scripts/` tree keeps one hash/inventory core, one home for the repo-shape file-enumeration and the
generated-directory policy, and one shared forbidden-signatures data file. Every change is output-preserving —
the integrity-checked ledgers regenerate byte-identical — and the sibling taxonomy repository is untouched.

## Locked decisions

- **Output-preserving only.** The inventory-core extraction changes structure, never output bytes; the
  ledgers it feeds (`docs/governance/repository-inventory.json` and the reconciliation ledger) are
  integrity-checked, so the acceptance bar is a zero-byte diff.
- **`emailevals/` is untouched** — a separate Git boundary and the named-taxonomy authority.
- **CLI entry points stay.** Some checks are invoked individually by CI; only shared internals are
  consolidated, never the entry points.
- **Scope corrected against source (verified read-only 2026-07-19):**
  - The hash core is **two** implementations, not three: the index-based `generate-repository-inventory.mjs`
    and the physical-checkout `generate-checkout-inventory.mjs`. `reconcile-repository-reset.mjs` is **not** a
    third — it already imports the inventory reader. The three classification maps are **intentionally
    divergent** (pre-reset vs current layout) and are **not** merged.
  - The repo-shape consolidation is **narrowed** to `check-repository-layout.mjs` ↔ `check-tracked-outputs.mjs`
    (shared file-enumeration and one drifting generated-directory set). `check-repository-data-authority.mjs`
    (a content scanner) and `repository-hygiene.mjs` (a git/worktree report) are **different concerns and
    excluded**.
  - The email-eval merge is **dropped** — `scripts/eval-email/` no longer exists; the merge already happened.
  - The secret/PII work is **reduced** to extending the already-shared `forbidden-signatures.json`; the four
    detectors have incompatible pattern shapes, so a four-way unification is **not** attempted.

## Sequence

1. TKT-258 extracts one shared hash + path-normalize core used by the two inventory implementations
   (index-based and physical-checkout); `reconcile-repository-reset.mjs` already imports the reader; the three
   divergent classification maps stay separate. Output-preserving — the ledgers regenerate byte-identical.
2. TKT-259 consolidates the repo-shape file-enumeration and the one drifting generated-directory set shared by
   `check-repository-layout.mjs` and `check-tracked-outputs.mjs` (point layout at the shared enumerator; make
   the generated-directory set single-source). `check-repository-data-authority.mjs` and `repository-hygiene.mjs`
   are excluded. CLI entry points preserved.
3. TKT-260 extends the already-shared `forbidden-signatures.json` (consumed by both the Node matcher and the
   Python binary scanner) and documents the unavoidable JS/Python matcher mirror; the `pii-scrub` and
   redact-sweep detectors keep their own incompatible pattern shapes — no forced unification.
4. TKT-261 adds the drift guard: assert the shared internals stay single-source — the inventory hash core is
   imported not re-implemented, and the generated-directory set is defined once — wired into `verify-all.mjs`
   with a negative fixture.

## Gates

- **Full PLAN-006 close-out is a hard gate.** TKT-207 / TKT-209 / TKT-214 (currently in `verify`) minted and
  own the very scripts this plan deduplicates, and TKT-210 is still in `now`; refactoring a script while its
  authoring ticket can bounce back from `verify` is the collision this sequencing prevents. Otherwise this
  plan is independent of PLAN-007/008/009 and runs in parallel once PLAN-006 closes.

## Close-out

The plan closes only when all members are `done`: the inventory ledgers regenerate byte-identical to a
pre-refactor snapshot, the repo-shape file-enumeration and generated-directory set live once, the
forbidden-signatures data file is the single shared vocabulary source, the drift guard fails a synthetic
re-duplication, the unit tests pass, and full `node verify-all.mjs` is green. `emailevals/` is untouched. No
member performs a live write.

<!-- GENERATED:PROGRESS -->
## Computed progress

**0/4 done (0%).**

| Status | Count |
|---|---:|
| Now | 0 |
| Verify | 0 |
| Done | 0 |
| Next | 0 |
| Backlog | 4 |
| Blocked | 0 |

| Ticket | Status | Title |
|---|---|---|
| [TKT-258](../backlog/TKT-258-hash-inventory-core-consolidation/TKT-258-hash-inventory-core-consolidation.md) | backlog | Consolidate the hash and path-normalize inventory core |
| [TKT-259](../backlog/TKT-259-repo-shape-guard-consolidation/TKT-259-repo-shape-guard-consolidation.md) | backlog | Consolidate repo-shape file-enumeration and the generated-directory set |
| [TKT-260](../backlog/TKT-260-shared-forbidden-signatures-data-file/TKT-260-shared-forbidden-signatures-data-file.md) | backlog | Extend the shared forbidden-signatures data file |
| [TKT-261](../backlog/TKT-261-scripts-dedup-drift-guard/TKT-261-scripts-dedup-drift-guard.md) | backlog | Add the scripts-dedup single-source drift guard |
<!-- /GENERATED:PROGRESS -->
