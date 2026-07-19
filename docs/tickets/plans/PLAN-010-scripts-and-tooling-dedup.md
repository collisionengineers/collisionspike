---
id: PLAN-010
title: Scripts and tooling dedup
status: active
tickets: [TKT-258, TKT-259, TKT-260, TKT-261]
depends-on: [PLAN-006]
---

# PLAN-010 — Scripts and tooling dedup

## Outcome

The `scripts/` tree keeps one shared inventory-hash primitive, one path-normalisation source, one home for the
repo-shape file-enumeration and generated-directory policy, and one cross-language parity contract for the
shared forbidden-signatures data file. Every inventory change is output-preserving — the integrity-checked
ledgers regenerate byte-identical — and the sibling taxonomy repository is untouched.

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
    divergent** (pre-reset vs current layout) and are **not** merged. The shared hash primitive must support
    both streamed Git-index blob chunks and filesystem streams; moving only `sha256File` is insufficient.
  - The repo-shape consolidation is **narrowed** to `check-repository-layout.mjs` ↔ `check-tracked-outputs.mjs`
    (shared file-enumeration plus one case-folding generated-directory predicate and set).
    `check-repository-data-authority.mjs` (a content scanner) and `repository-hygiene.mjs` (a git/worktree
    report) are **different concerns and excluded**.
  - The email-eval merge is **dropped** — `scripts/eval-email/` no longer exists; the merge already happened.
  - The secret/PII work is **reduced** to pinning parity between the Node and Python consumers of the
    already-shared `forbidden-signatures.json`. No new signature is required without separate policy evidence;
    the four detectors have incompatible pattern shapes, so a four-way unification is **not** attempted.

## Sequence

1. TKT-258 extracts one shared incremental hash primitive used by both inventory implementations
   (index-based and physical-checkout) and points both at the existing shared path normaliser;
   `reconcile-repository-reset.mjs` already imports the reader and the three divergent classification maps
   stay separate. Output-preserving — the ledgers regenerate byte-identical.
2. TKT-259 consolidates the repo-shape file-enumeration and the one drifting generated-directory policy shared
   by `check-repository-layout.mjs` and `check-tracked-outputs.mjs` (point layout at the shared enumerator; make
   the case-folding predicate and set single-source). `check-repository-data-authority.mjs` and
   `repository-hygiene.mjs` are excluded. CLI entry points are preserved.
3. TKT-260 pins the unavoidable Node/Python matcher mirror to one non-sensitive vector suite while retaining
   `forbidden-signatures.json` as their shared data source; the `pii-scrub` and redact-sweep detectors keep
   their own incompatible pattern shapes — no forced unification.
4. TKT-261 adds the drift guard: assert the shared internals stay single-source — the inventory hash primitive
   and path normaliser are imported rather than re-implemented, and the generated-directory predicate and set
   are defined once — wired into `verify-all.mjs` with an independent negative fixture for each assertion.

## Gates

- **Full PLAN-006 close-out is a hard gate.** TKT-207 / TKT-209 / TKT-214 (currently in `verify`) minted and
  own the very scripts this plan deduplicates, and TKT-210 is still in `now`; refactoring a script while its
  authoring ticket can bounce back from `verify` is the collision this sequencing prevents. Otherwise this
  plan is independent of PLAN-007/008/009 and runs in parallel once PLAN-006 closes.

## Close-out

The plan closes only when all members are `done`: the inventory ledgers regenerate byte-identical to a
pre-refactor snapshot; the repo-shape file-enumeration and case-folding generated-directory predicate live
once; both forbidden-signature matchers pass the same non-sensitive vectors; each branch of the drift guard
fails its own synthetic re-duplication; the unit tests pass; and full `node verify-all.mjs` is green.

Each implementation PR records the before/after owned-file and nonblank-line delta. The plan's aggregate
implementation delta must be net-negative on at least one measure and must not increase the other; otherwise
the plan cannot close without an explicit operator decision. `emailevals/` is untouched. No member performs a
live write.

<!-- GENERATED:PROGRESS -->
## Computed progress

**4/4 done (100%).**

| Status | Count |
|---|---:|
| Now | 0 |
| Verify | 0 |
| Done | 4 |
| Next | 0 |
| Backlog | 0 |
| Blocked | 0 |

| Ticket | Status | Title |
|---|---|---|
| [TKT-258](../done/TKT-258-hash-inventory-core-consolidation/TKT-258-hash-inventory-core-consolidation.md) | done | Consolidate the hash and path-normalize inventory core |
| [TKT-259](../done/TKT-259-repo-shape-guard-consolidation/TKT-259-repo-shape-guard-consolidation.md) | done | Consolidate repo-shape file-enumeration and the generated-directory set |
| [TKT-260](../done/TKT-260-shared-forbidden-signatures-data-file/TKT-260-shared-forbidden-signatures-data-file.md) | done | Pin cross-language forbidden-signature matcher parity |
| [TKT-261](../done/TKT-261-scripts-dedup-drift-guard/TKT-261-scripts-dedup-drift-guard.md) | done | Add the scripts-dedup single-source drift guard |
<!-- /GENERATED:PROGRESS -->
