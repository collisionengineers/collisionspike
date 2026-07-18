# 04 — Scripts and tooling dedup → PLAN-010

**Status: non-binding working draft. Superseded on distillation.**
Distils into **PLAN-010**. No new ADRs. Validated against `main` at `de9c3f9d`.

## Problem

The `scripts/` tree has grown three overlapping clusters: the hash-inventory core is written three times,
the repo-shape guards are spread across five files, and email-evaluation material lives in three
locations. None is a correctness problem — but each is a maintenance-cost and drift surface, and the
inventory core in particular is load-bearing for the governance ledgers, so a divergence there is
expensive.

## Outcome

One hash-inventory core with modes, one place (or a clearly-layered few) for repo-shape policy, and a
single email-eval tree — with the sibling taxonomy repo left untouched.

## Scope

1. **One hash-inventory core.** `generate-repository-inventory.mjs` (tracked files),
   `generate-checkout-inventory.mjs` (physical checkout), and `reconcile-repository-reset.mjs` (prefix-move
   reconciliation) all re-implement the same `createHash` + walk + inventory algorithm. Extract one core
   module with `mode: tracked | checkout | reconcile`; the three entry points become thin wrappers.
   **Highest care** — these produce `docs/governance/repository-inventory.json` and the reconciliation
   ledger, both gated by `verify-all.mjs`. The extraction must be byte-for-byte output-preserving.
2. **Repo-shape guard consolidation.** `repository-hygiene.mjs`, `check-repository-layout.mjs`,
   `check-repository-data-authority.mjs`, `check-tracked-outputs.mjs`, and `repository-files.mjs` all
   police "what may exist / be tracked where". Consolidate the shared predicates into `repository-files.mjs`
   (or a single policy module) that the checks import; keep the checks as separate CLI entry points if CI
   invokes them separately.
3. **Email-eval tree merge.** Fold `scripts/eval-email/` into `scripts/evaluation/email/` (the settled
   canonical — PLAN-006's locked structure names `scripts/evaluation`, and the AI-realignment README
   already links `scripts/evaluation/email/README.md`). **`emailevals/` is a sibling repository and the
   named-taxonomy authority (per the ADR-rewrite C15 / T7) — leave it untouched.**
4. **Secret/PII detection: unify the pattern *source* as data (finding I).** `pii-scrub.ts`, the
   cloud-inventory redact sweep, `hashed-signature-matcher.mjs` + `forbidden-signatures.json`, and
   `check-binary-content.py` each reinvent "detect secret-shaped strings". Rather than share code across
   the TS/PowerShell/Python split (impossible), make the **pattern set a single data file** consumed by all
   four contexts. Patterns-as-data sidesteps the language boundary and gives one place to update a rule.

## Locked decisions

- **Output-preserving only.** The inventory-core extraction changes structure, never output bytes — the
  ledgers it feeds are integrity-checked.
- **`emailevals/` untouched** (separate Git boundary + taxonomy authority).

## Proposed tickets (rescan IDs at mint; ~4)

One per scope item.

## Dependencies / gates

- **Full PLAN-006 close-out is a hard gate.** TKT-207 / TKT-209 / TKT-214 (all currently in `verify`)
  minted and own the very scripts this plan deduplicates. Refactoring a script while its authoring ticket
  can still bounce back from `verify` is precisely the collision this sequencing prevents. Otherwise this
  plan is independent of PLAN-007/008/009 and can run in parallel with them once PLAN-006 is closed.

## Risks

- **Ledger output drift during the inventory-core extraction** — the single highest risk in this plan.
  Mitigation: snapshot `repository-inventory.json` + the reconciliation ledger before, extract, regenerate,
  and assert **zero diff**; the extraction PR that changes ledger bytes is by definition wrong.
- **CI invocation coupling** — some checks may be invoked individually by CI. Mitigation: keep the CLI entry
  points; consolidate only the shared internals.

## Verification

- `check:inventory`, `check:reconciliation`, and the full ledger regen produce **identical bytes** to the
  pre-refactor snapshot.
- The unit tests under `scripts/checks/*.test.mjs` and `scripts/maintenance/*.test.mjs` pass; add a test
  pinning the shared inventory core's output for each mode.
- Full `node verify-all.mjs`.
