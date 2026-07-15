# Changes — TKT-119: Retro case-locate failed on ref PHA5007 — acks must never mint, add an "Unable to Locate" outcome, explore Graph deleted-items

## Status
Built + deployed live (2026-07-09, PLAN-003 intake-correctness wave). PHA5007 itself was
reconstructed live via the retro drain during the wave.

## (a) PHA5007 root cause — pinned with KQL + Postgres evidence

- **The retro ladder never ran for PHA5007 at all.** A 14-day workspace-wide KQL search found ZERO
  telemetry rows for "PHA5007" (azure-diagnostician dispatch; the sibling PHA5013 DID run and failed
  at the bottom of the ladder pre-Outlook-gate). The Postgres row completed the picture: the trigger
  email (`d9d16186…`, "Re: Our ref: PHA 5007 - Reg: MT25 FXW", received 2026-07-08 15:42) is
  classified **`non_actionable` / `acknowledgement`** — not in `RETRO_TRIGGER_CATEGORIES`, so
  `decideRetro` refused **silently** (no log, no audit, no UI state — the exact "silent nothing"
  this ticket names).
- Secondary facts: the provider row is principal **`PHOUSE`** ("Parkhouse Assist Ltd Brulimar
  House"), so "PHA…" can never match a principal; `PHA5007` (3 letters + 4 digits) can never match
  `CASE_PO_SHAPE_RE` (needs 5–6 digits) — it travels as an EXTERNAL ref, which the locate rungs
  already search raw (no provider resolution required), so no fix was needed on that axis. The
  hypothesis "provider resolution fails before any rung runs" is DISPROVEN as the mechanism.

**Fix shipped:** `decideRetro` (packages/domain/src/domain/retro-case.ts) now accepts
`non_actionable` + subtype **`acknowledgement`** as a retro trigger (`RETRO_TRIGGER_ACK_SUBTYPE`) —
an ack cites exactly one matter, so it may LOCATE (link or reconstruct the original); `case_summary`
digests stay excluded. Subtype threaded through both intake lanes + the manual drain. Refusals are
now LOGGED (`retroDecision` events, intakeOrchestrator.ts). Domain tests added (retro-case.test.ts).

**Live proof:** `POST /api/retro-case` drain for the PHA5007 message → orchestration instance
Completed **`{outcome: created, caseId: 87e79f62-0218-4bfc-8957-0c285536ad6e, source: outlook}`** —
a Held reconstruction (no Case/PO minted; the PO namespace untouched). The located original lives in
engineers@ **Deleted Items** (see (d)).

## (b) Ack-mint belt-and-braces at the Data API create seam

- `services/data-api/src/features/`: new exported **`mintBlockedByCategory(internetMessageId)`** —
  reads the message's OWN triage row (written by classifyInbound before any create; carries staff
  reclassifies) and blocks the create when the category is not in `CASE_MINTING_CATEGORIES`
  (receiving_work-only). Wired into **`POST /api/internal/cases/resolve`**'s create path → returns
  `{outcome: 'refused_category'}` + a warning audit; the orchestrator handles the outcome.
- `services/data-api/src/features/inbound/retro-routes.ts`: **`POST /api/internal/retro/create`** refuses when the
  located "original" is itself an **ack/digest-family** email (`non_actionable`/`other`/
  `pre_instruction`); the retro TRIGGER family (billing/case_update/cancellation/query) is
  deliberately allowed as reconstruction material (lands Held, never terminal, never a PO). The
  orchestrator treats `refused_category` as fall-through to the failure record (both rungs), so a
  refusal still ends in a VISIBLE "Unable to locate".
- Unit tests: `services/data-api/src/features/` (mocked DB — every category
  blocked/allowed; missing-row + read-failure tolerance).

## (c) "Unable to Locate" visible outcome

- **DDL:** `deltas/2026-07-09-inbound-attention-reason.sql` (APPLIED LIVE) —
  `inbound_email.attention_reason` (`unable_to_locate` | `images_no_match`); canonical
  `120_inbound_email.sql` updated.
- **API:** new `POST /api/internal/inbound/attention` (service-auth, schema-tolerant);
  `rowToInboundEmail` + `@cs/domain` `InboundEmail.attentionReason`.
- **Orchestration:** `retroRecordFailure` stamps `unable_to_locate` on the trigger row
  (best-effort, after the existing audit).
- **SPA:** `inbox-status.ts` gained the `attention` rung (beats "New"; superseded by a case link or
  a dismissal) → the row chip reads **"Unable to locate"** (critical severity) with the fuller line
  on hover, and the email preview shows a MessageBar: *"We could not find or rebuild a matching case
  from the mailbox or Box history. Please review this email and create or link the case by hand."*
  Tests in `inbox-status.test.ts`.

## (d) Graph Deleted-Items feasibility memo (READ-ONLY — zero mailbox mutations)

- New keyed READ-ONLY probe route `POST /api/retro-deleted-probe` (orch; folder `totalItemCount`
  reads + `$search` reads only).
- **Memo:** [evidence/deleted-items-feasibility-memo.md](./evidence/deleted-items-feasibility-memo.md)
  (raw JSON alongside: `evidence/deleted-items-probe-2026-07-09.json`). Headline: Deleted Items hold
  **7,146 / 9,508 / 7,155** messages (vs inboxes 44/66/42) and **the live retro Outlook rung's
  whole-mailbox `$search` ALREADY reaches them** (proven: the PHA 5007 original was found in Deleted
  Items and reconstructed) — **no new build needed**. One measured caveat (Graph `$search`
  tokenization: `PHA5007` ≠ `PHA 5007`) recorded as a follow-up candidate, plus a backlog-drain
  recommendation.

## Deploy + data state
api 89 fns / orch 70 fns / SPA redeployed (registry: live-environment.md / LIVE_FACTS.json,
2026-07-09T04:45Z). DDL delta applied live. No data fix beyond the drain for this ticket.

## Remainders (honest)
- The `unable_to_locate` stamp has not yet fired live (both drains this session SUCCEEDED); the next
  genuine retro failure exercises it end-to-end — verifier item.
- The reconstructed PHA5007 case (`87e79f62…`) is Held `needs_review` with NO Case/PO by design —
  staff confirm the provider (Parkhouse has no confirmed principal, docs/tickets/BOARD.md D3) and set the PO.
- New-ticket candidates: the spaced-ref `$search` variant (memo finding 4); a bulk retro drain sweep
  over the un-linked triage backlog.
