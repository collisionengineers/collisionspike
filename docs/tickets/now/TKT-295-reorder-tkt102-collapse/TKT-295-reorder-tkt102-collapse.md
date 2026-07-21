---
id: TKT-295
title: Atomic parse→triage reorder + TKT-102 inline-parse collapse (PLAN-014 Slice 4b)
status: now
priority: P1
area: intake
tickets-it-relates-to: [TKT-290, TKT-291, TKT-292, TKT-293, TKT-294, TKT-102, TKT-277, TKT-145]
research-link: workingspace/proposedparserchanges.md
plan: PLAN-014
---

# Atomic parse→triage reorder + TKT-102 inline-parse collapse (PLAN-014 Slice 4b)

## Problem

Slice 4a introduced `triageUnified` but left it called from the SAME position the two-call
`classifyInbound`+`triagePolicy` sequence occupied — i.e. still BEFORE `parse`, so its `parsed`
inputs were always empty. This slice performs the actual reorder: `parse` moves ABOVE triage so the
extracted PDF VRM/reference + per-attachment content typings can feed the unified classify call
(D1 `open_case_ref_match` + D4 `attachment_content_typings`), and the duplicate parse that TKT-102's
image-delivery lane runs inline is collapsed into that single hoisted call.

This is deliberately ONE atomic PR (not splittable): shipping the global early-parse before deleting
TKT-102's inline call would create a real window where `parse` runs twice for the same email (cost
paid twice; two independently-fetched results that could disagree across retries).

## Proposed change (built)

`services/orchestration/src/workflows/intake/intakeOrchestrator.ts`:

- **Parse hoisted** to immediately after `providerMatch`, gated on
  `orderParseCandidates(inbound.attachments).length > 0` — the SAME predicate `parse.ts` skips on, so
  a no-document email never pays an activity round-trip that could only skip. The reposition is
  PERMANENT and NOT gated by any `TRIAGE_*` flag; `parse.ts` still reads `PDF_MAPPER_ENABLED` and
  degrades internally. Wrapped in try/catch → empty parse result on total parser outage (unchanged
  resilience #95 behaviour, just relocated).
- **`classifyInbound`+`triagePolicy` → one `triageUnified` call**, fed
  `parsed = { parserVrm, parserRef, attachmentTypings }`. `triageUnified` consumes them ONLY when
  `TRIAGE_PARSE_FED_ENABLED` is on (decided INSIDE the activity — the orchestrator never reads
  `process.env`). Returns `{ classification, decision, parseFedApplied }`.
- **TKT-102 collapse**: the image-delivery lane's dedicated inline `parse` call is DELETED; the rung
  reads the single hoisted `parserVrm`. Ungated / behaviour-preserving (this lane already parsed a
  PDF pre-4b). `triedVrm` stays `candidateVrm || bodyVrm` WITHOUT `parserVrm` (it means "what the
  subject/body machinery already tried and failed on", never "best current guess").
- **Lane VRM/ref upgrades**, each gated on the checkpointed `triageResult.parseFedApplied` via
  `laneParserVrm`/`laneParserRef` (undefined when off → candidate/body only, byte-identical):
  - `attach_case` evidence `caseVrm` — prefers the PDF VRM on the evidence stamp (evidence metadata
    only; the attach DECISION already happened in triage);
  - `route_images_unmatched` `vrm` — a mixed image+PDF email can flag with the PDF VRM;
  - reply-link `ref`/`vrm` — **a reply whose Case-ref/VRM lives ONLY inside an attached PDF can now
    link** (the headline upgrade; parserRef/parserVrm are in scope before this lane for the first
    time).
- **Kill-switch invariant comment rewritten** — it is now about VALUES + the gate, not code position
  (which the hoist deliberately changed). Old "runs FIRST now" header and the TKT-102 module doc in
  `imagesReceivedVrmMatch.ts` (which described the now-deleted inline parse) are corrected.

`services/orchestration/src/workflows/intake/parse-candidates.ts` (**new**): the pure
`orderParseCandidates` + `ParseAttachment` + doc/pdf/email predicates + `MAX_PARSE_DOCS`, extracted
from `parse.ts` so the orchestrator can value-import the gate WITHOUT pulling `parse.ts`'s
`df.app.activity` registration / blob / OCR clients into its module graph. `parse.ts` re-exports them
— one definition, no duplication; `parse.test.ts` and `classifyPersist.ts` are unchanged.

`services/orchestration/src/workflows/intake/triageUnified.ts`: accepts the `parsed` bag, threads it
into the three D1/D4 builders ONLY when parse-fed (gate-off stays byte-identical), and returns
`parseFedApplied`.

## Accepted costs (named explicitly, per plan)

1. Parser latency/cold-start now hits **every doc-bearing email**, not just `receiving_work` — paired
   with the Slice 5 post-flip latency/error-rate watch.
2. A `drop_duplicate` arrival now pays the parse cost, because parse runs before triage decides the
   arrival is a duplicate.

## Acceptance

- Orchestrator-level test proves parse runs BEFORE triageUnified for doc-bearing mail, is skipped for
  no-doc mail, threads the `parsed` bag, and — the gate proof — the reply-link lane uses the parser
  ref/VRM ONLY when `parseFedApplied` (byte-identical candidate/body when off).
- TKT-102 collapse test proves exactly ONE `parse` per email and the hoisted `parserVrm` reaches the
  rung with `triedVrm` unchanged.
- Full `services/orchestration` vitest green; `tsc -b` clean; `packages/domain` green.

## Review-gate lineage

Slice 4a's gate-off-parity test (`triageUnified.test.ts`) is green and cited by path in Slice 4a's
`verification.md`; this slice's orchestrator-level reorder proof is authored here as 4b's own test
(`intake-parse-hoist-slice4b.test.ts`), per the Slice 4a→4b review gate. Slice 0's centralized
helpers are used with `parserVrm`/`parserRef` now genuinely in scope earlier — the 4b-forward
"prefers the parser value" assertions live in this slice's tests, not a re-open of Slice 0.

## Per-ticket impact touched here

- **TKT-102** — its collapse is implemented exactly as its evidence trail anticipated; its still-open
  "auto-attach" acceptance item is NOT attempted (correctly still suggest-only per ADR-0010).
- **TKT-277** — the `_delivered_images_only` parity guard tests a function this reorder does not touch;
  re-run unchanged as a regression gate (see verification.md).
- **TKT-145** — NOT resolved here: the collapse changes where the VRM comes from, not whether evidence
  persists on the non-minting path (TKT-145's own separate fix).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
