# Verification — TKT-137: Surface triage_category AI suggestions on uncased emails — currently written but invisible

## Verdict
PENDING

Verified by: ticket-verifier dispatch, 10-07-26 (verdict block transcribed 1:1 below). Strong
partial: acceptance line 1 is VERIFIED-LIVE (banner rendered on a REAL pending triage_category
suggestion in the deployed SPA); lines 2/3's live half (one Accept/Ignore click) is deliberately an
operator/handler action — clicking would consume the suggestion and relabel a live row. Stays in
verify until that click + the queued audit SQL.

## Ticket-verifier verdict (transcribed 1:1, dispatch of 2026-07-10)

### Verdict
PENDING

(Strong partial: acceptance line 1 is **VERIFIED-LIVE**; the accept/ignore round-trip — lines 2/3's
live half — is deliberately unexercised because clicking would consume the evidence, and this sweep
was render-proof only. Not a FAILED: nothing observed contradicts the acceptance.)

### Evidence

**Deploy proof (prerequisite — changes.md's "SPA deploy PENDING" note is stale).** The live SWA
bundle `/assets/index-D-JoRJ9H.js` (fetched 2026-07-10 16:44) contains the TKT-137 strings ("The
assistant thinks this is", "The assistant suggested a type for this email.", "triage_category",
"a choice made by a person stays"). The TKT-137 build IS the deployed build.

**Line 1 — uncased email with pending triage_category suggestion shows banner with Accept/Ignore:
VERIFIED-LIVE.** At 2026-07-10 ~16:45, on the deployed SPA via the operator's signed-in Chrome,
deep-link `/inbox?item=84c72717-21b4-44d9-a7ad-a34c8048cf93` (the uncased desk@ EREF9 email)
rendered an info MessageBar: **"The assistant thinks this is “Images received”."** + server
rationale, with **Accept** and **Ignore** buttons — screenshots ss_0053s09sq + zoomed crop. A REAL
pending triage_category suggestion, distinct from and rendered alongside the known case_link
suggestion e1301dc9… ("Looks like this email belongs to an open case — QDOS26023"). Copy
handler-plain. Uncased structurally guaranteed: the banner renders only when `!row.caseId`
(Inbox.tsx L1814). Note: the case_link suggestion alone would NOT have exercised this surface (the
selector keys strictly on suggestionType === 'triage_category', inbox-suggestions.ts L119-129) —
but a real triage_category pending row existed too and rendered.

**Line 1 caveat (flip, cause unread).** On re-loads at ~16:46/16:48 the triage banner no longer
rendered while the case_link banner persisted — the triage row stopped being pending. A concurrent
session was active on the stack in the window. Disappear-when-no-longer-pending is the selector
behaving correctly; what flipped the row (producer supersede vs concurrent consumption) is resolved
by queued SQL (1).

**Line 2 — Accept applies via the audited review path; Ignore dismisses: offline-proven +
code-anchored only.** Accept posts `POST /api/ai-suggestions/{id}/review` (rest-client.ts L592-593 →
ai-suggestions.ts L103); the review writes the ai_suggestion_accepted/rejected audit (L161-165); the
triage_category promote branch (L335-365) relabels inbound_email.category_code/subtype_code guarded
by `classifier_mode IS DISTINCT FROM 'human'`; the SPA only claims the new type when the server
reported promoted:true (Inbox.tsx L1891). Verifier's own offline run: `npx vitest run
src/screens/inbox-suggestions.test.ts` → **22/22 passed**. The triage_category ACCEPT branch has
plausibly never executed live (pre-TKT-137 nothing rendered these).

**Line 3 — verified live on a real pending suggestion: half-met.** The surface was verified live on
a real pending triage_category suggestion (line 1); the accept/ignore action on one has not yet
happened live.

### Pending / gaps
- **Real bug: none found.**
- **The gap:** one live Accept (or Ignore) click on a pending triage_category suggestion by an
  operator/handler, plus the DB/audit rows proving the relabel — the only event left to close lines
  2/3. Do NOT have an agent click it silently.
- Expected-absence note: the observed suggestion's flip out of pending (queued SQL (1): superseded =
  producer re-run; accepted/rejected + reviewed_by = concurrent session consumed it).
- Precision note: the suggested label ("Images received") equalled the row's current subtype at
  observation time — Accept there would be a no-visible-change relabel; flow unaffected.
- Housekeeping: changes.md's Status "SPA deploy … PENDING" is stale — deploy proven above.

### How to re-verify
Queued SQL (1)–(3) for the orchestrator data pass: all suggestions on the EREF9 email (explain the
flip); the email's linkage/classification; live pending triage_category suggestions on uncased
emails (the next render/accept target). To close lines 2/3: a handler opens `/inbox?item=<id>` for a
row from (3), clicks Accept (or Ignore); then re-run (1) for that suggestion (expect
accepted/rejected + reviewed_by/at), (2) (Accept: classifier_mode='llm' + codes updated unless
'human'), and the audit query (4). SPA render re-check: grep the deployed bundle for "The assistant
thinks this is", deep-link any (3) row, confirm banner renders (no clicks). Full SQL preserved in
the W2 data-pass section below.

### Confidence + unread surfaces
High on line 1 (direct live observation, double-anchored) and line-2 wiring (code + 22/22 offline).
Unread: the suggestions GET response body (only the CORS preflight visible; no authenticated API
calls made); the DB rows behind the banner + its flip (queued); which actor flipped the suggestion;
App Insights for the EMAIL_AI producer (out of this ticket's acceptance).

## Orchestrator data-pass W2 — pending

Queued SQL (1) suggestions on the EREF9 email, (2) the email's linkage, (3) pending triage_category
suggestions on uncased emails. Results appended here when run.
