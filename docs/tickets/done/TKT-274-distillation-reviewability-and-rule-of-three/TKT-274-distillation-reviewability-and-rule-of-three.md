---
id: TKT-274
title: Restore distillation-boundary reviewability and record the rule-of-three
status: done
priority: P3
area: platform
tickets-it-relates-to: [TKT-270, TKT-271]
research-link: docs/tickets/done/TKT-274-distillation-reviewability-and-rule-of-three/evidence/distillation-note.md
plan: PLAN-012
---

# Restore distillation-boundary reviewability and record the rule-of-three

## Problem
User-owned governance drafts are often unchanged in the pull request that distils them. Changing diff
rendering cannot make an unchanged file appear, and editing the draft merely to create a diff is forbidden.
Separately, a raw “three copies means share” or per-PR net-negative rule can flatten intentionally distinct
protocols or reject a necessary scaffold before the completed consolidation becomes net-negative.

## Evidence
`.gitattributes` marks `workingspace/** ... -diff`, so the architecture-simplification drafts show as binary
blobs when changed. More importantly, these drafts pre-date the distillation PRs, so they would not appear in
those diffs even if rendered as text. The corrected route/outbox review also proves that three superficially
similar monitors can own distinct state-transition protocols. Structural delta is useful close-out evidence,
but file count alone is not proof of simpler semantics.

## Proposed change
Require every new plan to declare a repository-tracked derivation summary, whether its source draft changed or
not. The summary records source paths and immutable commit/blob references, decisions adopted/changed/dropped,
the rationale, and the current-code/live evidence used to revalidate volatile claims. Do not edit
`workingspace/` or weaken its byte-stability attributes. Record a qualified rule-of-three: three structurally
equivalent implementations trigger review, but sharing requires compatible contract, owner, lifecycle,
security, and failure semantics. Measure deltas for the completed consolidation lane/plan; allow an explicit
operator-approved exception when semantic clarity requires non-negative structure.

## Acceptance
- **A1.** Every new plan declares a `derivation-summary` path in frontmatter. The linked summary exists even
  when the source draft is unchanged and records source paths plus commit/blob references,
  adopted/changed/dropped decisions, rationale, and volatile-claim revalidation.
- **A2.** The rule-of-three and net-negative-structure discipline is recorded on the governance pages as a
  qualified standing expectation: equivalence includes contract, owner, lifecycle, security, and failure
  semantics; three instances trigger review rather than mandatory sharing.
- **A3.** A check fails on a plan with a missing/unresolved/structurally incomplete derivation summary. A
  negative fixture uses an unchanged source draft and proves text diff rendering alone cannot satisfy it.
- **A4.** Consolidation close-out evidence reports before/after owned-file and nonblank-line deltas for the
  completed lane and aggregate plan. A non-negative result requires an explicit operator decision with
  semantic rationale; intermediate scaffold PRs are not failed solely on local delta.
- **A5.** The change runs in CI/governance and links from the structure page. It does not duplicate the plan
  classification owned by TKT-271.
- **A6.** No live write; `.gitattributes` and `workingspace/` files are not edited or renamed.

## Validation
- Run the derivation check over PLAN-012 and negative fixtures for missing, unresolved, incomplete, and
  unchanged-source summaries. Confirm the governance page records the qualified rule-of-three and completed
  lane/plan delta policy, and compare `workingspace/` hashes and `.gitattributes` with the pre-change state.

## Research
Distilled from reconciled review Gate 0 item 11 and the “Simplicity” perspective, then corrected against the
unchanged-draft behaviour of Git diffs and the current route/outbox topology. Consumes TKT-270's audit and
the plan classification introduced by TKT-271.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Distillation note](./evidence/distillation-note.md)
