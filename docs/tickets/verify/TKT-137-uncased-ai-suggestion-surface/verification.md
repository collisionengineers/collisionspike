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
src/features/inbox/inbox-suggestions.test.ts` → **22/22 passed**. The triage_category ACCEPT branch has
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

## Orchestrator data-pass W2 (run 2026-07-10, transient window trap-deleted)

- **(1) suggestions on the EREF9 email:** query errored on a jsonb cast (suggested_value is jsonb —
  informational only, not re-run).
- **(2) the email's linkage — THE FLIP EXPLAINED:** inbound_email 84c72717… now carries
  `case_id = 0476fa7c… (QDOS26023)`, updated **2026-07-10 15:45:12Z** — the **TKT-140 drain's
  rung-1 link** cased the email mid-verification. Once cased, the uncased-email banner correctly
  disappears (`!row.caseId` guard). The suggestion was NOT consumed (145's check shows e1301dc9
  still pending); the EMAIL stopped being uncased. Selector behaved exactly as designed.
- **(3) pending triage_category suggestions on UNCASED emails: 63** — ample render/accept targets
  remain for the operator click that closes lines 2/3.

Verdict stands: PENDING — solely on one operator Accept/Ignore click (any of the 63 rows) + the
post-click audit SQL (query 4 in the verdict block).

## Verdict update — 2026-07-14 (independent PLAN-005 sweep; transcribed verbatim)

## Verdict

PENDING

## Evidence

- **Acceptance 1 — pending suggestion renders with Accept/Ignore:** prior live proof from
  2026-07-10 records the uncased EREF9 email `84c72717-21b4-44d9-a7ad-a34c8048cf93` rendering “The
  assistant thinks this is ‘Images received’” with Accept and Ignore controls. The current source still
  gates this surface to uncased rows in `Inbox.tsx:1849-1852` and selects only pending
  `triage_category` suggestions in `inbox-suggestions.ts:119-129`.
- **Acceptance 2 — Accept applies through the audited path; Ignore dismisses:** Offline/source proof
  exists. `Inbox.tsx:1917-1929` posts the review and only updates the visible type when the server reports
  `promoted: true`. `ai-suggestions.ts:823-850` applies the validated category/subtype while protecting
  human classification, and the review path records accepted/rejected audit actions. The focused selector
  suite previously passed 22/22. No live Accept or Ignore was performed.
- **Acceptance 3 — verified on a real pending suggestion:** The prior EREF9 observation was a real
  live suggestion, not seeded data. The subsequent SQL pass found 63 pending `triage_category`
  suggestions on uncased emails at that time. This is prior proof; no current pending row was
  independently opened in this pass.
- **Deployment/current-source proof:** The feature was present in the deployed bundle during the July 10
  observation. The production SPA was republished again on July 12, and current source still contains the
  selector, handler-plain banner and audited review wiring.

## Pending / gaps

- A live handler-owned Accept and Ignore round trip remains unverified.
- There is no current database artifact showing `review_state`, `reviewed_by`, `reviewed_at`, the accepted
  classification change and corresponding audit row.
- The previously counted 63 pending uncased suggestions is a July 10 snapshot and was not refreshed.
- The earlier screenshot identifiers were session-only and were not persisted as repository artifacts.
- No bug was observed; the remaining gap is deliberately mutation-bearing and was outside this verifier's
  read-only authority.

## How to re-verify

1. Read-list current uncased emails with pending `triage_category` suggestions.
2. A handler opens one naturally existing suggestion and confirms the banner, rationale, Accept and Ignore
   controls.
3. On separate natural suggestions, the handler performs one Accept and one Ignore.
4. Read back the relevant `ai_suggestion`, `inbound_email` and `audit_event` rows:
   - Accept: reviewed/accepted, classification updated unless protected as human, one accepted audit.
   - Ignore: reviewed/rejected, classification unchanged, one rejected audit.
5. Reload each inbox row and confirm the reviewed banner remains dismissed.

## Confidence + unread surfaces

High confidence in the deployed UI surface and source/offline wiring; low confidence in the unexercised
live review mutations. Unread surfaces are current pending-suggestion rows, post-review database/audit
state and a fresh live Accept/Ignore observation.
