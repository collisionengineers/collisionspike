# Changes — TKT-246: Backfill the platform ADRs (0026–0030)

## Status
Drafted 2026-07-19 on branch `docs/tkt-246-platform-adr-backfill` — five ADRs authored as **Proposed**.
**Operator-approved 2026-07-20**: all five flipped to **Accepted** and the reciprocal "Decision of record"
back-links added to the realizing documents; ticket moved to `done`.

## Files added / changed
- `docs/adr/0026-rls-as-final-authorization.md` — Status → Accepted 2026-07-20.
- `docs/adr/0027-ship-dark-gate-model.md` — Status → Accepted 2026-07-20.
- `docs/adr/0028-three-tier-compute-topology.md` — Status → Accepted 2026-07-20.
- `docs/adr/0029-staff-identity-jose-msal-pkce.md` — Status → Accepted 2026-07-20.
- `docs/adr/0030-outbox-generation-counter-reliability.md` — Status → Accepted 2026-07-20.
- `docs/adr/README.md` — five rows flipped Proposed → Accepted (0026–0030).
- `docs/architecture/system-overview.md` — Boundaries "Decisions of record" footer gains ADR-0026 (final
  data boundary, line 37) and ADR-0028 (inter-tier boundaries).
- `docs/operations/database.md` — "Decision of record: ADR-0026" back-link under the RLS opener.
- `docs/operations/identity-and-access.md` — "Decision of record: ADR-0029" back-link under Staff access.
- `docs/operations/live-environment.md` — "Decision of record: ADR-0027" back-link under Operating
  constraints.
- ADR-0030 is realized in code (`mirror-outbox.ts`) and SQL (`database/migrations/*-outbox.sql`,
  `900_constraints.sql`) only, with no realizing prose document; per repository convention source files
  carry no "Decision of record" comment (0 exist), so it gains no doc back-link.

## Summary
Records the five load-bearing platform decisions that are built and live but had no decision record. Each
ADR is present-tense, grounded in the realizing code (cited file:line), in house style, and links its
realizing documents. Each was written from an independent read of the code, not the reserved one-line
summary — where the built reality diverges, the ADR records the reality:

- **0026 (RLS).** `app.role` is a fixed per-connection startup GUC pinned to `staff`, not a per-request
  switch; the `admin` pool / `SET LOCAL` dual-role shape is designed-but-unbuilt; RLS is defense-in-depth
  beneath the route-layer authz, and the evidence-delete control is the withheld grant + guarded
  `SECURITY DEFINER` function, not the RESTRICTIVE policy.
- **0027 (ship-dark).** The single `rg-collisionspike-dev` is simultaneously the dev host and the
  live-serving environment; gates are default-off with an honest-no-op contract.
- **0028 (topology).** The Python tier has **two** upstreams (Data API + orchestration), not a strict
  linear pipeline; recorded as a shared leaf fan with a fixed write direction (orchestration → Data API).
- **0029 (staff identity).** In-code `jose` JWT validation with `authLevel: 'anonymous'` behind MSAL PKCE;
  the module also carries designed-but-unwired app-only agent-auth helpers; scoped to the delegated staff
  surface only.
- **0030 (outbox).** Per-evidence monotonic generation counters with row-specific `box_file_id`
  verification (never an aggregate count); TKT-264 (PLAN-008) will amend it when the drains are generalised.

ADR numbers 0026–0030 were reserved for this ticket; next free ADR after this batch is 0031 (claimed by
PLAN-007's TKT-247).
