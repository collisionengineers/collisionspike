# Changes — TKT-246: Backfill the platform ADRs (0026–0030)

## Status
Drafted 2026-07-19 on branch `docs/tkt-246-platform-adr-backfill` — five ADRs authored as **Proposed**,
awaiting operator approval to accept and close (acceptance requires operator-approved decisions).

## Files added / changed
- `docs/adr/0026-rls-as-final-authorization.md`
- `docs/adr/0027-ship-dark-gate-model.md`
- `docs/adr/0028-three-tier-compute-topology.md`
- `docs/adr/0029-staff-identity-jose-msal-pkce.md`
- `docs/adr/0030-outbox-generation-counter-reliability.md`
- `docs/adr/README.md` — five Proposed rows added (0026–0030) after 0025.

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
