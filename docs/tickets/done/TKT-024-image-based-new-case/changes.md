# Changes — TKT-024: Image-only new-case form (drop instruction-only fields)
## Status
Distilled 2026-06-30 from spike-tickets-to-distill; not yet built.
## Commits
- No code changes yet.
## Summary
Captures the operator's ask to make "image based new case" a true images-only
flow that drops/relaxes instruction-only fields and keeps only Received From,
Received On, Vehicle Details, Location as required. Related to TKT-002 (new-case
/ manual-create form).

---

## 2026-07-09 — BUILT + LIVE (PLAN-003 UI wave)

**`mockup-app/src/screens/ManualIntake.tsx`** — a real image-only variant (`mode: 'images'`,
entered via the renamed **"Images only (no instructions yet)"** button — TKT-118 wording):

- **Removed from the image-only form**: Work Provider, Principal, Case/PO (+preview), Provider's
  reference, Intake status (now automatic — the server recomputes from field/evidence state),
  Accident Circumstances, "Reason for image-based assessment" (the whole IBA lock is GONE — the
  old flow wrongly conflated images-only with the Image Based Assessment inspection METHOD; that
  decision now belongs to review per ADR-0013), Date of Incident, Date of Instruction, Inspect on.
- **Required**: Received from (new), Received on (new DateField, defaults to today), Vehicle
  Registration (the case identity — TKT-118), Vehicle Model, Location (the inspection address,
  editable + Standardise, NOT locked to Image Based Assessment).
- **Optional**: Insured Name + all claimant details (cluster renamed "Claimant (optional)").
- **Create path**: sends NO provider → **no Case/PO can mint** (by construction — the API only
  mints under a principal); `receivedFrom`/`receivedOn` are new additive `CreateCaseInput` fields
  (`packages/domain/src/dto/index.ts`) persisted by `POST /api/cases`
  (`api/src/functions/cases.ts`) as a durable case note ("Received from X on DD/MM/YYYY." — there
  is no dedicated column); sourceLabel "Images received — from X".

**Deploy + live proof**: api + SPA deployed. Live E2E: the form rendered exactly the kept field set
(DOM-verified: none of the removed labels present); created VRM TE57IMG with only the required
fields → the case landed with no Case/PO, identified by registration, and the "Received from … on …"
note on the Notes tab. Evidence: `evidence/live-images-only-form.png` (+ the case-page shot under
TKT-118 evidence/).

**Remainders**: photos dropped on the intake screen still ride the existing evidence-link path
(unchanged); the case-type badge reads "Pending" until image files are actually attached (honest —
the composition label is derived from evidence).
