# Distillation note — TKT-257

**Source:** `03-cloud-estate-cleanup.md` scope item 6. **Plan:** PLAN-009. Verified read-only 2026-07-19
(`PLAN-009.dossier.json`).

**Drift to correct (values recorded only in the registry files, not here):**
- **Offer:** live is pay-as-you-go (`subscriptionPolicies.quotaId` = the PAYG offer; spending limit off).
  `LIVE_FACTS.json` and `live-environment.md` still say "Azure Free Trial" — stale. (A free-tier *promotion*
  on the subscription is the likely origin of the mislabel; the authoritative offer is PAYG.)
- **App-tier function counts:** the API app's count in `cloud-inventory-2026-07-17.md` is an over-count; the
  ARM `/functions` endpoint is authoritative. `live-environment.md`'s earlier note already had the correct API
  figure, so this is a correction of the newer inventory, not real growth.
- **Retirements:** reflect the dispositions from TKT-252 (EVA app/plan/storage) and TKT-253 (image / app
  registration) once executed.

**Rules:** update only from dated read-only evidence, never inferred from source (`LIVE_FACTS.json` authority
rule). Lands **last** so the registry records reality. Numbers stay in `LIVE_FACTS.json` /
`live-environment.md` only — this ticket's prose names none, to satisfy the `check:docs` leakage gate.
