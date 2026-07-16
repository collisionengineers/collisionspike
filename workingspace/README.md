# Working drafts — non-binding

This directory holds exploratory working drafts and research notes. They are **non-binding**: they do
not supersede accepted ADRs, tickets, or binding reviews. Distil any enduring decision into the
relevant ADR, ticket, or `docs/` page; the material here is scratch space, not authority.

## Contents

- [ai-realignment-plans/](./ai-realignment-plans/README.md) — the **AI realignment plan set**
  (2026-07-16): one agent harness (triage agent + tools) unifying the AI estate. It absorbs and
  supersedes the four earlier AI working notes below (per-document verdicts are inside the set).
- [pr89-box-facade-resolution-plan.md](./pr89-box-facade-resolution-plan.md) — resolving the Box
  facade collision between the live destructive-delete path and the archive-holding-folder adoption,
  so the latter can land dark without weakening the former's delete-safety guarantees.
- [model-evaluation-plan.md](./model-evaluation-plan.md) — extraction-first model-comparison plan,
  with links to the related AI-first and parser working notes.
- [aifirstplan.txt](./aifirstplan.txt), [proposedparserchanges.md](./proposedparserchanges.md), and
  [smallmodels.md](./smallmodels.md) — the earlier AI-first, parser-change, and small-model notes
  that the plan set above reconciles.
