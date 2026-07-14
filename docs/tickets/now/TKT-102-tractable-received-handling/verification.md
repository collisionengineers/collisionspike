# Verification — TKT-102: Tractable received-email handling

## Verdict
**PENDING** (2026-07-10, ticket-verifier dispatch) — strong partial live proof: every
deployed-component clause is live-proven by direct probe of the deployed stack; the end-to-end live
occurrence (a real Tractable arrival matched/attached or flagged) has not yet happened and the
system-of-record read is queued. Not FAILED — nothing observed contradicts Acceptance.

## Sweep verdict (transcribed verbatim, 2026-07-10)

**Scope adjudication:** both acceptance lines are TKT-102's own (received-email path). TKT-104
(blocked, vendor docs) holds only the API capabilities. Nothing here defers to it.

- **Line 1a — "recognised" (VERIFIED-LIVE):** `POST /api/classify-email` on the deployed parser
  (engine-v2.15) with all THREE real ticket samples → `case_update / images_received` @0.8, rule
  `image_service_delivery`; `body_jobref` empty (TKT-103 money guard live) and `body_vrm` empty on
  all three. Sibling classifier tests 4/4 fresh.
- **Line 1b — "matched to its case" (code-live, zero live executions):** `imagesReceivedVrmMatch`
  registered on `cespk-orch-dev` (74 fns); rung wired at `intakeOrchestrator.ts:390-428`;
  suggest-first per ADR-0010 (exact-single → `case_link` suggestion; VRM-only never auto-attaches);
  both gates live `true`. `imagesReceivedVrmMatch.test.ts` **16/16** fresh. KQL: 0 executions ever
  visible (see retention caveat).
- **Line 1c — "parsed Vehicle Information" (VERIFIED-LIVE at the parser):** `POST /api/parse` with
  all three evidence PDFs (byte-identical to sibling fixtures): `YP64YRW`/Volkswagen Touran/
  06-07-2026/143875 · `OU66VDC`/Hyundai i30/02-06-2026/188982 · `HG17ZTM`/Toyota Auris/69444;
  `reference` **empty on all three** (AI-quote money / Case-ID UUID can never mint a ref).
- **Line 1d — "images are extracted" (VERIFIED-LIVE at the parser):** `POST /api/extract-images`
  with `tractable.pdf` → count 8 = the 7 "Submitted Vehicle Images" jpegs + the letterhead graphic
  (pinned honest limit — raster typing is TKT-047); all three "Powered by" logos dropped. "…and
  attached" rides the accept flow + TKT-145 backfill — not yet live-exercised for a Tractable email.
- **Line 2 — no case → flag, no spurious work (structurally live):** the classification is
  non-minting (`case_update`; TKT-082's sweep proved 55 case_update arrivals → 0 mints);
  none/several → `markInboundAttention('images_no_match')` (TKT-034 chip, DDL CHECK includes it),
  covered by the 16 tests; the live probe proves the real samples enter this non-minting lane.

**Drift adjudication — INTENDED BEHAVIOR, not a regression:** the `tkt103-tractable-lead` eval item
(expected `other/other`, now `case_update/images_received` @0.8) was pre-scheduled by its own
manifest rationale ("re-label this item when TKT-102 ships"). Action: re-label `expected_v2` +
regenerate baselines under this family. Non-minting → non-minting; no TKT-082 pin involved.

### Pending / gaps
- **No real Tractable email has observably transited the live mailboxes**; `imagesReceivedVrmMatch`
  0 executions; end-to-end unexercised live. Queued SQL T1–T3 decisive; a supervised synthetic send
  to a production mailbox also settles it (operator action).
- **Telemetry retention collapsed at verify time** (~1h queryable on both components at 18:38–19:35Z,
  2026-07-10 — earlier today the window reached back to 07-02). KQL currently non-probative for
  arrivals; re-check when retention recovers.
- Postgres queued (firewall):
```sql
-- T1: any Tractable arrival ever + pipeline labels
SELECT ie.received_on, left(ie.subject,50), ie.sender_domain, sc.name, ss.name,
       ie.triage_state, ie.attention_reason, ie.case_id
FROM inbound_email ie
LEFT JOIN choice_inbound_category sc ON sc.code = ie.suggested_category_code
LEFT JOIN choice_inbound_subtype  ss ON ss.code = ie.suggested_subtype_code
WHERE ie.sender_domain ILIKE '%tractable%' OR ie.subject ILIKE '%completed lead%'
ORDER BY ie.received_on DESC;
-- T2: guard — no case minted from a Tractable arrival (expect 0)
SELECT c.id, c.case_po, c.created_at FROM case_ c
JOIN inbound_email ie ON ie.source_message_id = c.source_message_id
WHERE ie.sender_domain ILIKE '%tractable%';
-- T3: suggestions born from the PDF-VRM match rung
SELECT s.created_at, s.review_state, s.case_id
FROM ai_suggestion s
WHERE s.suggestion_type = 'case_link'
  AND s.suggested_value->'decisionInputs'->>'rung' = 'images_received_pdf_vrm'
ORDER BY s.created_at DESC;
```

### Expected absences / adjudication notes (not failures)
- "populates the matched case" is implemented as VRM-drives-the-match + PDF-attaches-on-accept —
  **no field-level writes into the case record** (deliberate suggest-first). If the operator
  intended automatic field population (e.g. mileage), that is unbuilt — explicit scope adjudication
  for the loop/operator.
- VIN is captured engine-side since v2.14 and the repair build surfaces it as a top-level `/parse`
  field cell, deliberately outside the 12-field EVA mapping. Live proof remains pending the parser
  redeploy; no deployed-state claim is made here.
- changes.md says flag detail `unmatched_images`; the code/DDL token is `images_no_match` — wording
  drift in changes.md only.

### How to re-verify
Live classifier/parse/extract-images probes per the retained script
(`probe_tractable_live.py`, session scratchpad); sibling `-k "tractable or TRACTABLE"` (5 tests) +
orch 16 tests offline; KQL once retention recovers (`imagesReceivedVrmMatch` requests/traces);
T1–T3 on the next data pass. Verdict flips to VERIFIED-LIVE on T1/T3 showing a real arrival
classified with a suggested/accepted link + attached images or a visible `images_no_match` flag —
or on a supervised synthetic send.

Verified by: ticket-verifier dispatch, 2026-07-10.

### W6 data-pass results (orchestrator-run, 2026-07-10 — the queued SQL)
- **T1: FOUR real Tractable arrivals exist** (2026-07-06 18:06 + 2026-07-08 08:32/09:03/09:09 — the
  original "New completed lead" + RE:/FW: thread variants), stored categories
  `case_update/update_general` ×3 + `query/query_existing_work` ×1, none linked. These arrivals
  **predate the 07-09 lane deploy** (engine Rule 0f + the VRM-match rung), so their stored labels
  reflect the pre-lane classifier — consistent with the lane's 0 executions.
- **T2: 0 cases minted from Tractable arrivals** — acceptance line 2's no-spurious-work held even
  before the lane shipped.
- **T3: 0 PDF-VRM rung suggestions** — the rung awaits its first post-deploy arrival.
Verdict stands PENDING: live Tractable traffic is real and non-minting; the next arrival exercises
the new lane end-to-end (or a supervised synthetic send closes it sooner).

## Reopened verdict — 2026-07-13

FAILED (live occurrence) — the next real arrival has now occurred. The supplied Ashfaq message was
recognised but remained a suggestion instead of auto-attaching to its unique case, and no submitted images
were extracted. The parser’s earlier direct-route probes do not prove the orchestration/persistence path.
The earlier synthetic-send close-out options are superseded: live proof must use genuine operator-designated
work and no case, email or evidence may be seeded into the live app solely for verification.

### How to re-verify

Replay the exact `.eml` and PDF through the full intake path after the fix. Record the resolved case and
match signals, absence of a suggestion on the exact-single path, email/PDF/image rows and audits, rendered
images, classification/readiness state, archive mirror and idempotent retry. Also replay a two-candidate
counterexample to prove manual choice is retained only for a stated ambiguity.
