# TKT-230 research note — post-sweep three-agent audit, 2026-07-16 (distilled)

Distills the TKT-230 portion of the 2026-07-16 three-agent audit of PR #102
(`feat/tkt-219-retro-parallel-reconstruction`, HEAD `e7fe2371` at audit time).

## Item 4 — stale `unable_to_locate` (12 live rows)

- Stamp path: `retroRecordFailure` (orchestration) → `dataApi.markInboundAttention` →
  `internalInboundAttention` (internal-persist-routes.ts) → `UPDATE inbound_email SET
  attention_reason = 'unable_to_locate'`.
- Link path: a later retro run (rung 1 / create / link-related) flows through
  `upsertInboundEmail` (persistence.ts), whose ON CONFLICT fills `case_id` via COALESCE but
  had NO attention_reason SET — the stamp survived the link.
- Precedent for clearing on link: archive-holding.ts clears its holding stamp on adoption.
- Live count at audit time: 12 rows with `case_id IS NOT NULL AND
  attention_reason='unable_to_locate'`.
- Schema-tolerance requirement: `attention_reason` arrived in a later delta; the upsert runs
  on primary intake, so referencing a missing column would 500 EVERY intake upsert on an older
  DB. `tableColumns('inbound_email')` (already probed at line ~103 for the optional columns)
  gates the fragment.
- Race hardening: `internalInboundAttention` could stamp a row a parallel path linked between
  the failure and the stamp; `AND case_id IS NULL` for `unable_to_locate` only (the stamp
  MEANS "no case found"). `images_no_match` legitimately applies to linked rows.

## Item 5 — 61 terminal `trigger_not_found`

- `retroFindTrigger` probed only `input.mailbox` (the stored `source_mailbox`) via
  `findMessageByInternetMessageId`.
- Cross-mailbox twins and mailbox moves put the message elsewhere; the drain instance
  completed `trigger_not_found` and (pre-TKT-223) could not be re-driven.
- The mailbox list already existed: `intakeMailboxes()` (platform/subscriptions.ts), already
  imported by retro-activities.ts and used by `retroOutlookLocate` with the exact per-mailbox
  try/catch idiom copied here.
- Live count at audit time: 61 rows.

## Item 6 — rung-1 linked lane never mirrors

- retro-case.ts rung-1 record-keeping (TKT-220 G7) deliberately omitted `boxArchiveEvidence`:
  "a retro-linked case's archive folder may be under the read-only roots".
- But rung 1 links ANY existing case — including live-intake cases whose folders sit under the
  WRITABLE pinned root (observed live: SWAN26007) — so their fresh trigger evidence never
  mirrored and the SPA kept showing "Not archived".
- Design constraints honoured: gates read inside activities only; the orchestrator branches
  only on checkpointed activity results; NO hot-path change to `boxArchiveEvidence` itself;
  fail-closed on any folder read failure (never upload blind into an unknown tree).
- Adapter verification (the plan flagged its names as guesses): `dataApi.getCaseBoxFolder`
  EXISTS (adapters/data-api.ts, returns `{ boxFolderId, boxFolderUrl, casePo }`);
  `box.getFolder` EXISTS (adapters/functions-client.ts, returns `path_collection`). Both used
  as-is — no adapter change was needed.

## Item 7 — the 21 re-labelled receiving_work instructions (+ reconciliation)

- RECONCILIATION: the cluster-analysis claim "the not_eligible early return discards the live
  re-classification" is WRONG on the persistence axis. On the drain path `classifyInbound`
  runs BEFORE `decideRetro` and persists the classification itself (classifyInbound →
  `dataApi.recordInboundEmail`) — which is exactly why stored receiving_work labels grew 4→20
  during the drains. The early return discards only the retro DECISION. No persistence gap
  exists on any current path; the defect is VISIBILITY: 21 rows carrying an instruction label
  sat with `case_id NULL`, no chip, no suggestion, no audit stamp.
- Surfacing decision: the attention chip via the existing failure idiom (`retroRecordFailure`
  → `unable_to_locate`), NOT the TKT-137 MessageBar (that surfaces *pending* suggestions; the
  label here is already applied). The chip renders for `!row.caseId && row.attentionReason`.
  Never auto-mint a case from the guard.
- `decideRetro('receiving_work')` returns `{ attempt: false, keys: {}, reasons:
  ['category_not_eligible:receiving_work'] }` — the guard fires on that category only, so
  digests/acks/etc. stay silent exactly as today.
- Live count at audit time: 21 rows (grown from 4).

## Operational SQL

`database/operations/tkt230-clear-stale-unable-to-locate.sql` (both sections, pre/post
checks; `validate-pr55.sql` pre/post-check style; csadmin role wrapper). Created only — the
implementation never executed it; the operator runs it on the deploy train's step 5 and banks
the counts here.
