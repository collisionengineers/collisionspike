# Changes — TKT-129: Image-based providers: inspection field must auto-complete as Done + fix the inverted wording

## Status
built + deployed + delta applied live (2026-07-08, branch `feat/readiness-ai-spine`) — awaiting verifier

## What changed

Implemented as ONE coherent change with **TKT-109** (the mechanism ticket — see its changes.md for
the seam detail); this ticket covers the application, the wording, and the live seed/prefill.

**Auto-complete (server-side, durable — TKT-109 mechanism)**
- New `api/src/lib/inspection-prefill.ts`: for an `always_image_based` provider's non-terminal case
  with an EMPTY inspection address and NO recorded decision, sets
  `eva_inspection_address = 'Image Based Assessment'` + `inspection_decision_code = image_based`
  (guarded UPDATE — fill-if-empty, never over a staff value), writes a `corpus`/`reviewed`
  provenance row, and audits `inspection_override` with the required reason
  **"Provider policy: image-based assessment"** (the `inspection_address` CHECK's reason discipline
  carried to the case-level record).
- Wired into every status-evaluation seam: `recomputeStatus` in `api/src/functions/cases.ts` AND
  `api/src/functions/internal.ts` (intake/orchestration path), plus `createCase` (manual intake).
- Result: the readiness item shows **"Inspection: Image Based Assessment" — Done** without manual
  entry; staff can still pick/search a physical address (the picker overwrites the literal and
  records a manual decision; the prefill never re-fires once a decision exists).

**Wording (the inverted note — `mockup-app/src/screens/CaseDetail.tsx`)**
- Was: "This provider is usually recorded as Image Based Assessment — use the override below if the
  vehicle can't be inspected in person." (inverted logic)
- Now: **"This provider works from photos, so the inspection is recorded as Image Based Assessment
  for you. Only pick an address below if this vehicle will be inspected in person."** (handler-plain,
  no inverted logic, reflects the auto-complete).
- Readiness label (`mockup-app/src/components/readiness.ts`): "Inspection address: Image Based
  Assessment (override)" → **"Inspection: Image Based Assessment"** (it is no longer an "override"
  when it is the provider's policy).

**ADR tension recorded**
- ADR-0013 said no auto-populate; the **2026-07-08 operator direction explicitly supersedes it for
  `always_image_based` providers**. A dated **Amendment** section was added to
  `docs/adr/0013-loc-export-artifact-no-runtime-address-matching.md` (scope: policy literal only —
  still NO runtime physical-address matcher; every image-based outcome still carries a reason).
  `packages/domain/src/domain/address-policy.ts` header notes the amendment (the pure resolver keeps
  governing the manual flow).

## Provider policy seed — counts (live, 2026-07-08)

- **The seed step was a verified NO-OP**: QDOS / PCH / AX / SBL **already carry
  `inspection_location_policy_code = 100000000` live** — in fact **172 providers** do (the corpus
  seed `910_seed_corpus.sql` set the policy from the same TKT-075 evidence). The ticket's "NO
  provider is currently designated always_image_based live" premise was **stale**. Delta step 1
  reported `providers_flagged_always_image_based = 0`.
- **Prefill counts**: **224 active cases** auto-completed (fill-if-empty + audit + provenance each):
  the four evidenced principals = **218** (QDOS **125** / PCH **50** / AX **35** / SBL **8**), plus
  **6** cases of other policy-designated providers. Residual empty-and-undecided for policy
  providers after: **0**.

## Live actions taken
- Delta **`migration/assets/schema/deltas/2026-07-08-image-based-provider-prefill.sql`** applied live
  (Entra `digital@` → `SET ROLE csadmin`; transient FW rule `tkt129apply` added + REMOVED;
  backup-first: `tkt129_backup_wp_policy_2026_07_08`, `tkt129_backup_case_prefill_2026_07_08`,
  `tkt130_backup_case_status_2026_07_08` kept for rollback). Full psql output:
  [evidence/delta-apply-output-2026-07-08.txt](./evidence/delta-apply-output-2026-07-08.txt).
- `cespk-api-dev` republished (86 functions re-verified); SPA redeployed (200 + CSP re-verified).
- Registry updated (`LIVE_FACTS.json` + `live-environment.md`).

## Live proof (QDOS case, deployed SPA)
- **A.QDOS26029** (`ac34fae6…`): inspection field populated **"Image Based Assessment"**, provenance
  chip **Reviewed**, readiness item **"Inspection: Image Based Assessment" ✓ Done** — with NO manual
  entry. Screenshot:
  [evidence/aqdos26029-case-page-live-2026-07-08.png](./evidence/aqdos26029-case-page-live-2026-07-08.png).
- The corrected note renders on the Address tab for QDOS cases (same build).

## Tests
- `api/src/lib/inspection-prefill.test.ts` (new, 7): applicability matrix (policy/empty/undecided/
  non-terminal only), guarded fill + provenance + audited reason, race-lost no-op.
- Suites green: domain 962 / api 279 / mockup-app 312 / orch 170.

## Honest remaining
- A.QDOS26029 itself evaluates `missing_images` (honest: 20 accepted images, none classified
  `overview` with a visible registration) — the inspection item is Done but the image rule still
  gates readiness; see TKT-130 changes.md + evidence for the full analysis (a TKT-064 image-role
  coverage gap, suggested as a follow-up ticket).
- Staff-override live click-through (pick a physical address over a prefilled IBA) not exercised
  live this pass (unit-tested guard).
