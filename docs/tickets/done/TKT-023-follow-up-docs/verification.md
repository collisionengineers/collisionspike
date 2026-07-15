# Verification — TKT-023: Link follow-up documents/emails to the existing case + Box
## Verdict
VERIFIED-LIVE

Final certification (ticket-verifier, 10-07-26, after the W4 data pass): **line 3's chaser flip was
observed live** — audit row "Chaser marked responded — the requested item arrived (auto-attach)" on
case 2e252fcd… at 2026-07-10 15:57:16Z (action 100000023), with 1 chaser row at responded. The
shared hook is wired at all four attach seams and present in every deploy since 2509853. Lines
1/2/4 held from the prior live proofs (30 attaches + 51 suggests, one case per PO; Box follow-up PDF
12s after attach; VRM-tier never auto-attached). One-line caveat (not blocking): the live firing came
via the auto-attach seam; the suggestion-accept variant calls the identical function with a different
via-string, is unit-pinned, and will be incidentally re-proven at the TKT-145 staged accept (31
chasers now outstanding). No new ticket needed.

Verified by: ticket-verifier dispatch, 10-07-26. Findings:
- **Line 1 (reply attaches, no duplicate case):** live-proven 2026-07-09 (30 attach_case + 51
  suggest_attach over 7d; one case per attached Case/PO across 6 POs); corroborated today by the
  drain's 37 rung-1 links (TKT-140 VERIFIED-LIVE, W2c 71/71 pairs) + a live dedup-lane attach in the
  current window.
- **Line 2 (documents in evidence + Box):** live-proven 2026-07-09 (AX26034 follow-up PDF in Box 12s
  after the attach; 7 evidence-add audits). Adjacent-lane parity gaps (drain-linked emails not
  backfilled; Box parity on the backfill path) are TKT-145's filed follow-ups, not this acceptance.
- **Line 3 (outstanding chaser marked satisfied — the 2026-07-09 missed seam): CLOSED in deployed
  code, cited:** ai-suggestions.ts:63 imports + :266 calls markOutstandingChasersResponded
  ('suggestion accepted') inside promoteAcceptedSuggestion's case_link branch — after the
  FILL-IF-EMPTY attach + inbound_linked audit, BEFORE TKT-145's enqueue (which did not regress the
  hook). All FOUR seams call it (internal.ts:961 dedup, :1637 reply-linked, :2028 auto-attach,
  ai-suggestions.ts:266 accept). Bundle carries 5 occurrences (def + 4 calls); git provenance: the
  call entered at 2509853 (2026-07-09 D1, deployed) and survived 70f6d11. Offline pins: hook called
  on successful promotion / not on miss / not on rejection. NOT yet observed firing live (zero
  reviewAiSuggestion requests in-window; the flip emits no telemetry) → queued SQL decides.
- **Line 4 (low-confidence → review, never auto-merged):** live-proven 2026-07-09 (rung-3 invariant
  held on every sampled event); nothing today contradicts.
- **No new one-liner ticket needed for the seam — it is closed.**
- **Operator watch-item (environment):** the App Insights queryable window on BOTH components now
  begins ~16:57Z today (free-tier retention/cap) — live-firing proofs are perishable; run KQL probes
  promptly after events.

Queued SQL (decides line 3): L3a chasers flipped to responded; L3b the hook's audit rows (the
"(via)" tail names the seam); L3c outstanding chasers that will flip on their case's next attach;
L1-refresh today's attached-emails-per-case sanity. Live probe shared with TKT-145: after the
operator accepts 025c8ce2 (→ A.QDOS26034), re-run L3b — a "(suggestion accepted)" row appears iff
that case has an outstanding chaser (check L3c first).

## Prior verdict (2026-07-02, superseded)
DEPLOYED GATED-OFF — needed D7 + TRIAGE_REF_GATE_ENABLED (both since flipped live).
## Evidence
- Repro material in evidence/ (operator-note.md; sent/ outgoing request 575985.eml;
  original/ incoming reply Our ref 576299.eml + 16DL.pdf + 16DL diminution PDF).
- The rules-engine-v2 plan's own evidence base names this exact failure mode: "`Our ref: 576299` follow-up
  mints a new case (TKT-023): the pre-mint path never checks job refs against open cases" — see
  [rules_engine_v2_plan_9ba034c4.plan.md § Evidence base](TKT-023-follow-up-docs.md).
- The fix — a generalised ref-gate (`triagePolicy` activity + `POST /api/internal/triage/context` +
  `suggest-link` + the SPA accept/reject affordance) — is built and deployed live on
  `cespk-api-dev`/`cespk-orch-dev`, but runs its **acting** decision on the `TRIAGE_*` app-setting gates,
  which are unset (default off ⇒ `proceed_default`, today's behaviour unchanged). Only the **shadow**
  decision path (telemetry-only, all gates forced on) is always-on.
- Confirms the gap is real today: both of this ticket's own eval-corpus samples still MISS on the
  deployed (gate-off) engine — `tkt023-outbound-request` and `tkt023-original-reply` both score
  `category_correct: false` in [baseline-v2.json](../../../../scripts/evaluation/email/baseline-v2.json) (part of
  the eval harness's documented "context miss" set — see [README § Ground truth](../../../../scripts/evaluation/email/README.md)).
## Pending / gaps
- 🔒 D7 DDL delta apply (operator, [docs/tickets/BOARD.md](../../BOARD.md) §D7) — the taxonomy-v2 engine tag and
  the `TRIAGE_*` gate flips are blocked on this landing first (deploy-order rule in the delta file).
- 🔒 `TRIAGE_REF_GATE_ENABLED` flip (per-behaviour gate under D6) once D7 is live.
- No live probe yet of the acting (non-shadow) ref-gate path — it cannot be exercised until the gate is on.
## How to re-verify
Once D7 + `TRIAGE_REF_GATE_ENABLED` are live: replay the outgoing request then the incoming reply
(`evidence/original/Our ref 576299.eml`); confirm the reply attaches to the existing case (no duplicate),
the documents land in the case evidence and the case Box folder, and the outstanding-document chaser is
cleared. In the meantime, the shadow-decision telemetry in App Insights `customEvents` can be inspected to
confirm the ref-gate *would* have caught it.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

PENDING (update) — and the recorded verdict text below/above is STALE IN THE TICKET'S FAVOUR: the gates it awaits (D7 + TRIAGE_REF_GATE_ENABLED, later TRIAGE_AUTO_ATTACH_ENABLED) went live 2026-07-03/07 and the mechanism is ACTING with strong independent proof: orch triage_decision 7d = 30x attach_case + 51x suggest_attach (e.g. AX26034 job_ref exact-match auto-attach 2026-07-08T12:50:51Z); Box folder AX26034 holds the original AND the follow-up InspectionRequest_Update PDF created 12s after the attach decision; five SPA rows read "Linked to case"; VRM-tier matches NEVER auto-attached (rung-3 invariant held on every sampled event). REAL GAP: acceptance line 3 (attach marks the outstanding-document chaser satisfied) is NOT BUILT — zero chaser writes on the attach path. DISPOSITION: reopened verify->now; the chaser-satisfaction hook goes to the intake batch. DB row-level checks queued for the data pass. Classify-layer note: the ticket's two eval samples still mislabel by category, but rung-3 runs pre-mint on every category so the linking behaviour is correct — category-label refinement optional.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.

### Data-pass addendum — 2026-07-09

Queued DB checks PASS: exactly ONE case per attached Case/PO (AX26034, A.PCH26021, AX26008, DFD26002, QDOS26047, QDOS26056 — no duplicate rows); AX26034 audit trail carries the 2026-07-08 attach sequence (action pair 100000035/36 at 12:50:51Z matching the triage_decision, evidence adds 100000021 x7 through 12:51:09Z); case_link ai_suggestion rows present via the inbound-email join (1 accepted + 1 pending). The ONLY remaining item is the unbuilt chaser-satisfaction hook (acceptance line 3) — in the intake batch.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

PENDING — with a REAL verified gap: the chaser-responded hook fires at THREE attach seams (resolve dedup, linkReply, auto-attach self-accept — 4 bundle occurrences) but NOT at promoteAcceptedSuggestion's case_link accept in ai-suggestions.ts, contradicting the implementer's "every seam" claim — a staff-accepted suggestion attach (the 51x suggest_attach lane) will not mark the chaser satisfied. One-line fix queued for the next implementer dispatch + api redeploy, then a live-firing tail (1 drafted chaser exists). Everything else stands live-proven.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.
