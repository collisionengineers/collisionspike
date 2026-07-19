# Distillation note — TKT-263

**Source:** `workingspace/architecture-simplification/02-canonical-service-routes.md` step 3. **Plan:**
PLAN-008. Corrected against current registrations on 2026-07-19.

**Eleven internal-MSI modules** wired by `services/data-api/src/platform/http/register-internal-routes.ts`:
1. `features/providers/internal-routes`
2. `features/cases/internal-resolution-routes` (cases/)
3. `features/inbound/internal-record-routes`
4. `features/inbound/internal-triage-routes`
5. `features/evidence/internal-backfill-routes`
6. `features/evidence/internal-persist-routes`
7. `features/archive/internal-evidence-routes`
8. `features/cases/internal-operations-routes` (cases/)
9. `features/archive/internal-classification-routes`
10. `features/cases/internal-maintenance-routes` (cases/)
11. `features/cases/internal-archive-holding` (cases/)

**Depends on TKT-245:** all eleven inherit the internal-trust seam; consolidating them before T8 decides the
model would rebuild the surface once T8 lands. Inline single-caller registrations; do not re-wrap. Preserve
every route/payload/gate (the dark lanes in `LIVE_FACTS` `safetyGates` are authority-gated, never removed).

**Registrations outside that aggregator:** `features/inbound/retro-routes.ts` and
`features/evidence/backfill-drain-route.ts` also expose `/api/internal/*` through the shared seam and belong to
this ticket. The archive mirror, provider Archive, and File Request outbox route modules are the remaining
three; TKT-264 owns them. The complete inventory is therefore thirteen non-outbox modules and sixteen total.
