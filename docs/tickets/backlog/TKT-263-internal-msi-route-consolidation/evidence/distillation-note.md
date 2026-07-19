# Distillation note — TKT-263

**Source:** `02-canonical-service-routes.md` step 3. **Plan:** PLAN-008. Re-verified read-only 2026-07-19
(`PLAN-008.dossier.json`).

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
