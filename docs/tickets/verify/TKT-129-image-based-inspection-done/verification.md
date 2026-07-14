# Verification — TKT-129: Image-based providers: inspection field must auto-complete as Done + fix the inverted wording

## Verdict
PENDING

## Evidence
(implementer-gathered, 2026-07-08 — awaiting the independent verifier)
- A.QDOS26029 on the deployed SPA: inspection field = "Image Based Assessment", readiness item
  "Inspection: Image Based Assessment" ✓ Done, no manual entry —
  [evidence/aqdos26029-case-page-live-2026-07-08.png](./evidence/aqdos26029-case-page-live-2026-07-08.png)
- Delta apply output (seed no-op + 224 prefilled + provenance) —
  [evidence/delta-apply-output-2026-07-08.txt](./evidence/delta-apply-output-2026-07-08.txt)
- Counts + ADR-0013 amendment: changes.md.

## Pending / gaps
- Independent verifier pass.
- Staff override (physical address over a prefilled IBA) not live-clicked (unit-tested guard only).
- The corrected note's rendered wording not screenshotted (Address tab) — verify on any QDOS case.

## How to re-verify
1. Open any QDOS case on the deployed SPA → Fields/readiness: inspection shows "Image Based
   Assessment" + Done; Address tab shows the corrected (non-inverted) note.
2. `SELECT eva_inspection_address, inspection_decision_code FROM case_ c JOIN work_provider w ON
   w.id=c.work_provider_id WHERE w.inspection_location_policy_code=100000000 AND c.status_code NOT IN
   (100000008,100000009,100000010,100000011)` → no empty-and-undecided rows.
3. Audit trail: `audit_event` rows `action_code=100000018` with reason "Provider policy: image-based
   assessment".
4. Override: pick a physical address on a prefilled case → value replaced, decision `manual`, and the
   prefill does not re-fire.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE. Independent live SPA pass: QDOS26068 + fresh-intake QDOS26070 show the inspection field populated Image Based Assessment with the readiness item green-checked and claimant fields untouched (no manual entry); corrected note wording rendered verbatim (no inverted logic); staff override path visible (Use this address rows + search); counts recorded (seed verified no-op — 172 providers already flagged; 224 cases prefilled; status moves 109 needs_review->missing_images, 23 ->ready_for_eva) and corroborated by the registry mirror + live queue rows (Inspection decision recorded 08/07/2026 on QDOS/PCH rows, absent on FW). No engineering language on the surface. Postgres row-level checks covered by the delta output + orchestrator data pass.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.

## Verdict update — 2026-07-14 (independent PLAN-005 sweep; transcribed verbatim)

## Verdict

PENDING — the simplified inspection choice is present in the current production bundle and the old
policy paragraph is absent, but the required authenticated Chrome interaction matrix and live save/audit
proof do not exist. The 2026-07-09 `VERIFIED-LIVE` block predates and cannot satisfy the superseding
2026-07-12 acceptance (`TKT-129...md:35-48`).

## Evidence

- Fresh read-only production-SWA retrieval on 2026-07-14 loaded `/assets/index-CbUqeEAY.js` (SHA-256
  `CEAE61DFE54EC9072E0AE6A154C0066A05FD495FEDA48D8B0560E54B1F8E4A0F`). The built asset contains the
  concise radio choice `Choose an inspection address or set as Image Based Assessment`, `Inspection
  address`, and `Image Based Assessment`; it contains zero copies of `This provider works from photos`.
  Its compiled component conditionally renders address controls only for the address choice. This proves
  the reopened presentation is at least partially deployed even though its release provenance was not
  recorded.
- Current source matches that bundle: `mockup-app/src/components/InspectionChoice.tsx:33-39` never infers
  image-based assessment from a missing address; `:62-87` renders one radio choice and hides address
  controls on the image-based path.
- Offline interaction coverage exists: `InspectionChoice.test.tsx:39-77` covers ordinary address-first
  behavior, saved image-based truth, hidden address controls and reversible switching;
  `case-edit-session.test.ts:75-84,109-154,177-257` covers Cancel/no-op, physical-address and image-based
  Save bodies, switching, validation and restored drafts; `api/src/lib/inspection-prefill.test.ts:77-153`
  covers explicitly configured versus ordinary providers, fill-if-empty, audit/provenance and race-safe
  no-op. The ticket records 16/16 focused tests, 515 SPA tests and a successful build/string scan
  (`changes-regression-12-07-26.md:22-27`).
- Original live data proof remains valid for the server-owned default: A.QDOS26029 showed `Image Based
  Assessment` and Done; the backup-first 2026-07-08 delta recorded 172 configured providers, 224 prefilled
  active cases and zero configured-provider residuals (`changes.md:43-68`;
  `verification.md:8-13,31-35`). That proof predates the reopened UI and does not prove its interactions.

## Pending / gaps

- No signed-in Chrome evidence covers one configured provider and one ordinary provider at desktop,
  narrow width and 200% zoom, as required by acceptance line 48.
- No live interaction proves hide/reveal and reversible switching, Cancel/reload preserving saved truth,
  or an authorised physical-address Save replacing a provider prefill only after Save.
- No fresh live API/database/audit readback proves the reopened UI emits one truthful attributed decision
  and no write before Save. The original ticket itself records that the physical-address override was
  never live-clicked (`changes.md:76-82`).
- Test coverage is split across component, edit-session and server-prefill suites; there is no recorded
  end-to-end component/browser matrix covering configured-provider load, ordinary-provider load, Save,
  Cancel and reload together.
- `.azure/deployment-plan.md` has no release record for PR 85/merge `9bbab2e7`; the live bundle proves
  deployment of the UI code but its exact release commit and deployment time are undocumented.

## How to re-verify

1. In signed-in Chrome, open an existing configured image-based-provider case and an existing ordinary
   provider case; do not create a synthetic case. Capture initial choice and all address controls at
   desktop, narrow width and 200% zoom.
2. On each case, switch both ways without saving; prove address suggestions/search/entry/actions hide and
   reappear and prove no PATCH/update/audit request occurs. Cancel and reload; confirm saved truth is
   unchanged.
3. On an operator-designated existing test case, when a state-changing verification is authorised, save a
   physical address over the image-based prefill once. Reload and read the API/database/audit trail to
   prove the manual value persists, the provider default does not re-fire, and the actor/reason are
   truthful. Restore only through the normal audited UI if the operator requires it.
4. Re-scan the deployed JS asset for the removed paragraph and record the asset hash, release commit and
   Chrome screenshots/network trace in this ticket.

## Confidence + unread surfaces

HIGH for the partial-deployment and remaining-gap verdict: the complete ticket folder, all three ticket
images, current component/domain tests, Git ancestry, deployment record and fresh production JS were read.
Unread/unexercised surfaces are authenticated case/API responses, current database rows and audit rows,
because this pass was strictly read-only and performed no signed-in/state-changing interaction.
