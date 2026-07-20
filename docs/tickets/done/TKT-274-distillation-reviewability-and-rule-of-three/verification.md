# Verification — TKT-274: Restore distillation-boundary reviewability and record the rule-of-three

## Verdict

PASS

## Evidence

- **A1 — derivation-summary declared + resolvable.** `node scripts/checks/check-derivation-summaries.mjs`
  → OK (PLAN-012's summary resolves and is structurally complete). PLAN-012 already declares the
  `derivation-summary` frontmatter path.
- **A2 — rule-of-three + net-negative recorded.** `docs/governance/repository-map.md` records the
  equivalence-qualified rule-of-three and the completed-lane net-negative structural-delta discipline as
  standing expectations, and links `check:derivation`.
- **A3 — structural check + negatives.** `node --test scripts/checks/check-derivation-summaries.test.mjs`
  — 9/9. The missing case proves an unchanged source draft still requires a summary (text diff alone
  cannot satisfy it); the unresolved and structurally-incomplete cases fail; earlier plans are
  grandfathered.
- **A4 — completed-lane delta discipline.** Recorded on the structure page; a non-negative completed
  result requires an explicit operator decision and a scaffold PR is not failed on local delta.
- **A5 — CI/governance + no duplication.** `check:derivation` runs under `verify-all.mjs` and is linked
  from the structure page; it does not duplicate TKT-271's plan classification.
- **A6 — boundaries.** `.gitattributes` and `workingspace/` are unchanged (no edits in the diff). No live
  write.

## Commands

```
node scripts/checks/check-derivation-summaries.mjs
node --test scripts/checks/check-derivation-summaries.test.mjs
node scripts/checks/check-doc-links.mjs
git diff --name-only main -- .gitattributes workingspace/   # empty
```

## Pending / gaps

None. This closes the last PLAN-012 member; the plan stays `active` pending the operator-owned close-out.
