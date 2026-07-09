# Changes — TKT-044: Mileage calculations look ~10,000 over expected values

## Status
Investigated + pinned (2026-07-09, PLAN-003 lifecycle wave) — algorithm audited line-by-line, the
"~10,000 over" arithmetic reproduced and pinned by a unit test; live per-case comparison pending
(deploy-phase read-only checks).

## Root-cause analysis (code audit)
The estimate lives in `functions/enrichment/analysis.py` `current_mileage_estimate` (a faithful
port of the collisionplugin TS original), called by `functions/enrichment/function_app.py` with
NO `as_of` → **it projects to TODAY**:

```
estimate = last_MOT_odometer + annual_rate × (days_since_last_MOT / 365.25)   (rounded to 100)
```

- The ADR-0006 guard is intact: `document_has_mileage=true` (the default) skips the estimate
  entirely — only document-less cases ever see this number.
- The arithmetic was re-verified by hand and pinned: a vehicle averaging ~8,000 mi/yr whose last
  MOT is ~13 months old gets **~8,800 miles ADDED on top of the last MOT odometer reading**.
  That is exactly the "~10,000 over" the operator sees **when the expectation is anchored on the
  last MOT figure** (the number MOT-history sites show). No double-count, no KM/mile slip
  (KM→miles handled), no rate inflation (clocking/implausible intervals excluded; the recent-2
  clean-interval window is preferred) was found.
- The number is therefore **by design a projected CURRENT mileage** — correct for "what is the
  odometer likely to read today", and an OVER-estimate whenever the vehicle stopped being driven
  (e.g. a collision-damaged car off the road since the incident: the projection keeps accruing
  at the historical rate).

## Shipped
- `functions/enrichment/tests/test_enrich.py` —
  `test_estimate_projects_forward_from_last_mot_by_design_tkt044`: pins rate 7995 mi/yr,
  estimate 48,800 on a 40,000 last-MOT reading 403 days stale (projection term = 8,800), and the
  auditable basis fields. Suite: **30 passed**.
- No behaviour change shipped — the calculation is arithmetically correct; changing the
  *semantics* (projection cap / as-of-incident-date / surfacing the basis in the UI) is an
  operator decision (see below).

## Live comparison (pending, read-only)
A handful of real enrichment-mileage cases re-run through `POST /api/dvsa-mot/enrich`
(document_has_mileage=false) with the stored case mileage alongside — recorded in
verification.md when done.

## Follow-up candidates (operator decision — not built)
1. **Surface the basis** in the UI/provenance: "projected from the last MOT reading (X mi on
   D) at ~R mi/yr" — the bare number invites the MOT-figure comparison that reads as a bug.
2. **Damaged-vehicle cap**: projecting past the incident/instruction date is arguably wrong for
   an assessment — an `as_of = instruction date` (or incident date when parsed) would stop the
   estimate accruing for cars that stopped being driven.
3. If the operator's expectation source is the photographed odometer, prefer that (a human
   review field) over any projection.
