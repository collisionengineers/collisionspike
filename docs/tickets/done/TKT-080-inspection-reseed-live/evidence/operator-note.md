# Operator plan excerpt — Phase F: Reseed live, deploy, verify, document

> From `PLAN-inspection-address-repair.md` (investigation/planning session 2026-07-06). The full
> plan is preserved at
> [TKT-075 evidence](../../TKT-075-inspection-corpus-pipeline/evidence/operator-note.md).

- Backup live `inspection_address` → apply DDL delta → run replace seed → verify per-provider
  counts + confirmed rows preserved → deploy API + SPA + Function → smoke-test one case per
  major provider (QDOS, PCH, QCL, FW) + one assist run on a photo case.
- Update `docs/architecture/inspection-address-corpus.md` (new in-repo pipeline + marker rule),
  ADR-0016 note, `LIVE_FACTS.json` + live-environment mirror, docs/gated.md; short ADR note
  that auto-*suggest* on corpus miss stays within ADR-0013; close/annotate TKT-062 residuals.
- `node verify-all.mjs` green.
