# Changes — TKT-274: Restore distillation-boundary reviewability and record the rule-of-three

## Derivation-summary guard (A1, A3)

- New `scripts/checks/check-derivation-summaries.mjs` (`check:derivation`, wired into `verify-all.mjs`)
  requires every plan from PLAN-012 onward to declare a repository-tracked `derivation-summary` that
  resolves and is structurally complete: the four sections (Review boundary; Immutable source references;
  Adopted, changed, and dropped decisions; Volatile-claim revalidation) and at least one immutable
  blob/commit reference. It validates the **summary's** structure and never `existsSync`-es the cited
  user-owned source paths, which are content-addressed and intentionally absent.
- `scripts/checks/check-derivation-summaries.test.mjs` covers the real corpus plus the missing (an
  unchanged source draft still needs a summary — a diff alone cannot satisfy it), unresolved, and
  structurally-incomplete cases, and confirms PLAN-001–011 are grandfathered.

## Rule-of-three + net-negative doctrine (A2, A4, A5)

- `docs/governance/repository-map.md` gains a **Distillation and consolidation discipline** section
  recording the derivation-summary requirement, the equivalence-qualified rule-of-three (three equivalent
  implementations trigger a review; sharing requires compatible contract, owner, lifecycle, security, and
  failure semantics), and the completed-lane net-negative structural-delta discipline (a non-negative
  completed result needs an explicit operator decision; a scaffold PR is not failed on local delta). It
  links the enforcing check and does not duplicate TKT-271's plan classification.

## Boundaries (A6)

- `.gitattributes` and `workingspace/` files are untouched. Checks, tests, and governance docs only; no
  live write.

## Plan close-out

TKT-274 is the last PLAN-012 member. Per the series precedent the plan document stays `status: active`;
the formal active → done transition and any net-LOC waiver are operator-owned.
