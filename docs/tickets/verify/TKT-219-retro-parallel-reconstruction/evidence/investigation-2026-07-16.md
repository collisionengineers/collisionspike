# Investigation — retro system state and TKT-119 assessment (2026-07-16)

Four-agent investigation triggered by the operator's concern that TKT-119 counteracts the retro
system. Full working plan retained by the operator; this note records the findings that ground
TKT-219/TKT-220/TKT-221.

## Verdict on the original concern

TKT-119 does NOT counteract retro — it widened it (acknowledgements became locate-eligible; the
PHA5007 silent-refusal fix). The create-seam guard blocks only what a case may be built ON (a
located original classified `non_actionable`/`other`/`pre_instruction`/`website_enquiry`); the
trigger family (billing/case_update/cancellation/query) is deliberately allowed and lands Held.
Live telemetry (72h to 2026-07-16 ~13:00Z): 1 `refused_category` vs 35 creates.

## Live state (azure-diagnostician, read-only az, 2026-07-16 ~12:59–13:05 UTC)

- Both apps Running; all 12 retro functions deployed and enabled.
- Gates: `RETRO_CASE_ENABLED=true` (both apps); `RETRO_OUTLOOK_SEARCH_ENABLED=true` (orch);
  `BOX_API_ENABLED=true` (both); `RETRO_BOX_ARCHIVE_ROOT_IDS=4077648161` on the API app only —
  **unset on cespk-orch-dev, so the Box rung skips (`no_archive_roots`) and every reconstruction
  is Outlook-sourced** (all 35 creates in 72h).
- 72h telemetry: retroCaseOrchestrator 483 executions, retroOutlookLocate 48/50 found,
  retroCreate created 35 / already_exists_linked 6 / ambiguous 2 / refused_category 1;
  retroRecordFailure 7 (rungsTried never contains box_archive); `retroDecision attempt:false` 46
  (34 = `category_not_eligible:other`).

## Parity trace (Box/Outlook vs live intake)

Both rungs run the same `parse` (+ rawEml fallback) and the literally-same `applyParserFields`,
then `classifyPersist` + `statusEvaluate`. Documented deliberate skips: `enrich`,
`boxFolderCreate` (Box rung), `boxArchiveEvidence` (RO archive). Undocumented gaps:

- G1: `extractImages` never runs on either rung (→ TKT-219).
- G2: `classifyPersist` called without `caseVrm`/`workProviderId` — per-provider AI opt-out not
  honoured on retro runs (→ TKT-219).
- G3: Outlook rung never runs `boxArchiveEvidence` after creating its own writable folder
  (→ TKT-220).
- G4: Box rung runs the post-create chain for created OR already_exists_linked; Outlook for
  created only (→ TKT-220).
- G5: `mapRetroParse` omits `resolvedWorkProvider` (→ TKT-220).
- G6: Box-rung evidence rows carry no `sha256` — TKT-133 dedup cannot match (→ TKT-220).
- G7: rung-1 any-status link is row-link only, no evidence chain for the trigger's attachments
  (→ TKT-220).
- Minor: stale "[R3 — not built]" header; manual drain drops `classification.subtype`;
  contradicted corroboration still forwards suspect parserEva (→ TKT-220/TKT-221).

## Microsoft Learn verification of Graph `$search` (2026-07-16)

- CONFIRMED: whole-mailbox `$search` includes Deleted Items; defaults from/subject/body; no
  ConsistencyLevel for messages.
- CONTRADICTED: "25 relevance-ranked results" — current docs say up to **1,000 results,
  sent-date-sorted, default page 10**; the code takes one `$top=25` page and never follows
  `@odata.nextLink` (→ TKT-219 paging).
- `$search` covers attachment NAMES only, never content; the content-capable Microsoft Search API
  is own-mailbox only (→ TKT-221 documentation).
- Throttle: 10,000 req/10 min and 4 concurrent per app-per-mailbox; per-mailbox budgets are
  independent.

## Cost assessment (dual search + paging + 'other' widening)

Monetary delta ≈ $0 (worst case < ~$1/month): Graph mail `$search` is an unmetered standard API;
all three Function Apps are Flex Consumption and the marginal ~4.2k executions + ~34k GB-s/month
sit inside the free grant; App Insights delta ≈ 42 MB/month; Box bills by plan allocation
(search limits 6/sec/user, 60/min/user, 12/sec/enterprise). Real constraints: throttle shape and
free-tier telemetry retention (bank evidence same-day).

## TKT-021 interaction

Retro passes `intermediary: null` into `applyParserFields`, so the intermediary-corroborated
content match, the single-candidate fallback (TKT-065), and the intermediary Held wording never
apply on the retro path; Box VRM-only corroboration can never succeed for an intermediary sender.
TKT-219 threads the match through. Note the TKT-021 D8 seed (Connexus → {PCH, SBL}) is deployed
code but the data delta is not applied live, so candidates do not flow anywhere yet.
