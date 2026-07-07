# Verification — TKT-093: auto-attach + visibility + case_update misclass

## Verdict
MISCLASS FIX LIVE + PROVEN; auto-attach BUILT + DEPLOYED DARK; inbox-list visibility built +
api deployed. The **SPA deploy** and the gated live auto-attach flip remain.

## 1. Offline eval + unit tests
- **Misclass:** real classifier run on the sample forward → **`case_update/update_general`**
  (was `receiving_work/existing_provider_audit`). Pinned in `scripts/eval-email/manifest.json`
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
- Auto-attach live E2E: **deferred** — operator-blocked (the gate flip is production-blocked
  like the other TRIAGE_* activations; docs/gated.md). With the gate off, the ref-gate rung is
  byte-for-byte today's suggest_attach (kill-switch tests).

## 4. Counter-probe (VRM-only / ambiguous stays a suggestion)
Unit-proven: a vrm-only or ambiguous match never yields `attach_case` (the ADR-0010/0019
permanent invariant). The real 093 sample (registration-only) correctly stays a suggestion.

## 5. Recall guard
A genuine audit re-inspection instruction still routes to the audits lane (the misclass fix
only suppresses a forward with NO sender work language; `test_forward_is_not_a_reply_and_still_promotes`
and the audit-subtype tests pass).

## Pending
- **SPA deploy** (the inbox-list "may belong to" hint) — the SWA CLI deploy hit a
  StaticSitesClient binary error this session (the live SPA is unchanged); the api backend it
  needs is already live. Re-run the SPA deploy per docs/azure/deploy.md.
- The gated live auto-attach flip (operator sign-off) + its live E2E probe.

## How to re-verify
`npm --prefix packages/domain test` (triage-policy auto-attach) + api/orch tests + the live
`POST /api/classify-email` misclass probe.
