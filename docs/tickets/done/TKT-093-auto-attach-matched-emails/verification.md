# Verification — TKT-093: auto-attach + visibility + case_update misclass

## Verdict
**VERIFIED-LIVE** (2026-07-10, ticket-verifier dispatch — supersedes the interim verdict below)

## Final sweep verdict (transcribed verbatim, 2026-07-10)

Verdict: **VERIFIED-LIVE** (with two declared residuals — neither blocks the lane's live proof).

- **Gate:** `TRIAGE_AUTO_ATTACH_ENABLED = "true"` on `cespk-orch-dev` (LIVE_FACTS.json, az-readback
  re-verified 2026-07-09); sibling `TRIAGE_REF_GATE_ENABLED = "true"`.
- **Line 1 — auto-attach fires live, audited (the outstanding E2E probe — landed, triple-source):**
  orch App Insights: **16 acting `attach_case` decisions** in 30h incl.
  `2026-07-10T15:57:16.733Z` (messageId `AAMkADA2…ANrfxMMAAA=`); api App Insights: **16
  `autoAttached:true` completions** (4 on 07-09, 12 on 07-10) incl. 15:57:16.730Z — suggestion
  `ca4e17c0-8f30-4643-a8d5-785e084cab38` → case `2e252fcd…`; DB: the same-second chaser audit.
  The `autoAttached:true` log is reachable only after the fill-if-empty link UPDATE and the awaited
  `inbound_linked` writeAudit succeed, so the log certifies the audited attach committed.
  Scope note: the ticket's literal "the sample email auto-attaches to PCH26007" is superseded by the
  ADR-0010/0019 VRM-only invariant (ADR > ticket) — the 093 sample matched by registration only and
  correctly **stays a suggestion**; the accepted live-probe standard was "next exact
  `case_po`/`job_ref` match", which is what fired.
- **Line 2 — suggest lane still visible from the inbox list:** live pending `autoAttached:false`
  suggestions exist alongside (07-10T07:42:44Z, 08:31:04Z), and the served SPA bundle
  (`/assets/index-D-JoRJ9H.js`) contains `may belong to ·` / `Linked to case ·` /
  `linkSuggestionCasePo` — matching `apps/web/src/features/inbox/Inbox.tsx:680-682`.
- **Line 3 — misclass pinned both ways:** eval pin `tkt093-forward-audatex-caseupdate`
  (manifest + baselines) + both parser tests; live `POST /api/classify-email` probe →
  `case_update/update_general` (2026-07-07).
- **Line 4 — reversibility:** auto-attach writes the identical link shape as a manual accept, so the
  pre-existing unlink applies; served bundle carries the `/detach` affordance; unit-pinned
  ("a failed unlink must never look like it worked").

**W5 data-pass corroboration (orchestrator-run, 2026-07-10):**
- Q1: target case `2e252fcd…` = **ALS26007**.
- Q2: the 15:57:04Z arrival ("Re:160717/Mr Z Sheikh - M10HKG", kalan@autologistic.co.uk) is linked,
  `triage_state='routed'`.
- Q3: suggestion `ca4e17c0…` `review_state='accepted'`, `reviewed_by='auto-attach'` @ 15:57:16.714Z.
- Q4: both audit rows — `inbound_linked` (actor `auto-attach`) 15:57:16.718Z + "Chaser marked
  responded — the requested item arrived (auto-attach)" 15:57:16.725Z.
- Q5: **12 auto-attach link audits on 2026-07-10 — exactly matching the 12 KQL completions.**

Declared residuals (not blocking): (a) rendered signed-in SPA eyeball of the inbox hint not performed
(no staff credentials; bundle + data rows proven); (b) live detach not exercised (mutation — outside
the verifier contract; mechanism-identical to the long-standing manual unlink); (c) KQL playbook note:
`az monitor app-insights query` defaults `--offset 1h` and silently clamps wider `ago()` windows —
pass `--offset` explicitly.

Verified by: ticket-verifier dispatch, 2026-07-10.

---

## Interim verdict (2026-07-07, superseded)
MISCLASS FIX LIVE + PROVEN; auto-attach BUILT + DEPLOYED DARK; inbox-list visibility built +
api + **SPA DEPLOYED 2026-07-07**. Only the gated live auto-attach flip (operator sign-off) remains.

## 1. Offline eval + unit tests
- **Misclass:** real classifier run on the sample forward → **`case_update/update_general`**
  (was `receiving_work/existing_provider_audit`). Pinned in `scripts/evaluation/email/manifest.json`
  + `test_tkt093_forward_delivering_document_is_case_update_not_new_work`.
- **Auto-attach:** 7 new `triage-policy.test.ts` cases — gate ON + exact case_po/job_ref single
  → `attach_case`; VRM-only → stays `suggest_attach`; ambiguous → `suggest_attach`; gate OFF →
  `suggest_attach` (DARK, today unchanged); autoAttach on + refGate off → no rung-3 action;
  case_update refinement still applies. **909 domain + 187 api + 166 orch + 275 SPA tests green.**

## 2. Gate + deploy
`TRIAGE_AUTO_ATTACH_ENABLED` — new gate, **default off (NOT set live)**. Parser + api + orch
deployed live 2026-07-07 (misclass fix live; auto-attach backend live but DARK; inbox-list
query live). No new DDL (`inbound_linked` audit already exists).

## 3. Live probe
- Misclass: `POST /api/classify-email` (live), sample forward shape → **`case_update/update_general`**. PROVEN.
- Auto-attach gate **FLIPPED LIVE 2026-07-07** (operator-instructed): `TRIAGE_AUTO_ATTACH_ENABLED=true`
  on `cespk-orch-dev` (readback `true`; the sibling `TRIAGE_REF_GATE_ENABLED` it modifies is on).
  Auto-attach is now ACTING — an exact single `case_po`/`job_ref` match to an open case
  auto-attaches (audited `inbound_linked`, reversible via detach); VRM-only/ambiguous stay
  suggestions. The live E2E on the next real matching email is the remaining probe.

## 4. Counter-probe (VRM-only / ambiguous stays a suggestion)
Unit-proven: a vrm-only or ambiguous match never yields `attach_case` (the ADR-0010/0019
permanent invariant). The real 093 sample (registration-only) correctly stays a suggestion.

## 5. Recall guard
A genuine audit re-inspection instruction still routes to the audits lane (the misclass fix
only suppresses a forward with NO sender work language; `test_forward_is_not_a_reply_and_still_promotes`
and the audit-subtype tests pass).

## Pending
- **SPA DEPLOYED 2026-07-07** ✅ (WSL `swa deploy`, env production; live 200 + CSP header
  re-verified). The inbox-list "may belong to · <Case/PO>" hint is live.
- **Auto-attach gate FLIPPED LIVE 2026-07-07** ✅ (`TRIAGE_AUTO_ATTACH_ENABLED=true` on
  `cespk-orch-dev`). Only the live E2E on the next real exact-match email remains (ties the
  general TRIAGE_* live-occurrence probes).

## How to re-verify
`npm --prefix packages/domain test` (triage-policy auto-attach) + Data API/orchestration tests + the live
`POST /api/classify-email` misclass probe.
