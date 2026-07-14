# Parse-fed unified triage stage — intake pipeline reorder, validated by offline backtest

## Context

Today the intake orchestrator runs classify (Stage A) → rules engine (Stage B) → *then* parse — and parse only runs for `receiving_work` emails. Consequence: the rules engine (`decideTriage`) never sees document-derived data. A Case/PO or job-ref that lives only inside the PDF feeds the caseResolve dedup ladder but never the ref-gate (`suggest_attach`/`attach_case`); the classifier judges attachments by filename/extension heuristics it itself flags as its weakest signals (invoice/remittance PDFs read as `instruction`; photos-in-a-PDF read as a document); and the TKT-102 Tractable lane exists purely to re-invoke parse mid-pipeline because classification couldn't see inside the PDF.

Parse is local compute (PyMuPDF + bundled Tesseract — no cloud API cost), so the reorder cost is latency/outage-blast-radius, not money. The change is the documented forward direction: rules-engine-v2-build.md **Phase 3 "parse-fed triage"**.

**User's chosen design:** reorder to `fetchMessage → providerMatch → parse (early, doc-bearing only, best-effort) → ONE unified triage stage` (classifier + rules engine composed under one activity name — not a monolith file) that determines category, subtype, and routing action. **Validation: run the new branch against an existing set of real emails/attachments (offline A/B backtest) — NOT a live shadow period.** A default-off gate remains as a deploy kill-switch only.

## Verified facts that shape the design

- `email_classifier.py` **already accepts `open_case_ref_match`** (`one|none|ambiguous`) as an input — but neither the `/classify-email` route (`functions/parser/function_app.py`) nor `buildClassifyRequest` (`orchestration/src/functions/activities/classifyInbound.ts`) wires it. The engine seam exists; only route + TS client wiring is missing.
- The unified stage's ingredients are already **pure exported helpers**: `buildClassifyRequest`, `resolveActingClassification`, `attachmentKindsOf` (classifyInbound.ts); `buildTriageContextRequest`, `deriveAttachmentSignals` (triagePolicy.ts). The new activity is composition, not rewrite.
- `TriageContextRequest` (`orchestration/src/lib/data-api.ts`) is single-string-per-key — parser refs enter as **precedence fallback** (parser value fills only an empty text slot): **zero Data API contract change**. `decideTriage` (`packages/domain/src/domain/triage-policy.ts`) needs **no change at all**.
- **The backtest corpus exists**: `scripts/eval-email/manifest.json` — 44 hand-labelled real `.eml`/`.msg` files (ticket evidence + real `.msg` cases), with per-item `context` overrides for flow-derived inputs (`provider_match_state`), plus a gitignored local overlay (`test-cases-and-data/e-mail-examinations/eval-overlay.json`) for operator-exported live emails. `run_eval.py` calls `classify_email()` directly (no HTTP/Azure); `run_ab.py` is the established A/B-harness pattern (imports run_eval's loader machinery, never copies it). PII rules in `scripts/eval-email/README.md` govern all outputs (aggregate numbers + closed-vocabulary labels only).
- Sibling engine pin: `engine-v2.16` (`VENDOR_LOCK.json`, verified inside `verify-all.mjs`). Highest existing ticket: TKT-200. All five live `TRIAGE_*` gates are `true` on cespk-orch-dev.

## Design decisions

### D1 — Context lookup lives INSIDE the unified stage, twice-keyed
The classifier both *extracts* body refs and *consumes* `open_case_ref_match` (chicken-and-egg). Resolution — two context reads inside the one activity, both idempotent and best-effort (existing EMPTY_CONTEXT degrade):
- **Lookup A (pre-classify):** keyed on subject-sniffed + parser refs (`candidateRef || parserRef-if-casepo-shaped`, `parserRef` → jobref slot, `candidateVrm || parserVrm`, internetMessageId, conversationId). Its open-case cardinality becomes `open_case_ref_match` for the classify call.
- **Lookup B (post-classify):** today's `buildTriageContextRequest` widened with body refs the classifier just extracted plus parser fallback (`bodyJobref || parserRef`, `candidateVrm || bodyVrm || parserVrm`). Skipped when its keys equal Lookup A's.

### D2 — One new Durable activity `triage`
New `orchestration/src/functions/activities/triage.ts`, composed from the existing exported helpers. Steps (all idempotent):
1. **Classify** — `/classify-email` with the parse-enriched request when `TRIAGE_PARSE_FED_ENABLED=true` (adds `open_case_ref_match` + `attachment_content_typings`); the legacy byte-identical request when off (kill-switch = today's behaviour). Gate read inside the activity only.
2. `recordInboundEmail` + `recordAudit` on the classification (always-on, unchanged — including for later-dropped duplicates).
3. Lookup B.
4. **`decideTriage`** — the existing acting + GATES_ALL_ON-shadow pair, unchanged pattern; when the gate is on, inputs are the parse-fed classification + widened context.
5. Existing `triage_decision` telemetry event (add `parseFedApplied`, `parseSkipped`/`parseReason` fields) + best-effort `triageSuggestLink` from the acting decision.

Returns `{ classification, decision }`; every existing orchestrator branch (drop_duplicate, attach_case, `shouldAttemptTriageAssist`, `categoryMintsCase`, retro, receiving_work) reads the same shapes as today. No triple-decide/shadow plumbing — offline backtest replaces it. Keep old `classifyInbound`/`triagePolicy` activity registrations for one release (in-flight replay safety at deploy).

### D3 — Parse moves early, unchanged internally
Move the existing step-4 parse block — including its best-effort try/catch + empty-result-on-outage fallback — to immediately after providerMatch, scheduled only when `orderParseCandidates(inbound.attachments).length > 0` (pure over checkpointed values). `PDF_MAPPER_ENABLED` stays inside the activity. **TKT-102 lane collapses:** delete its mid-lane `parse` call; feed the checkpointed `parseResult.vrm` straight into `imagesReceivedVrmMatch`. All downstream consumers (`parserVrm`/`parserRef`/`parserEvaFields`/`decideCaseType`/`classifyPersist` attachmentTypings) read the same checkpointed variable, declared earlier. Accepted cost: FC1 parser latency/cold-starts now hit every doc-bearing email.

### D4 — Classifier contract change (sibling-first, ADR-0018, backward-compatible)
Sibling `email_classifier.py`: one new optional param `attachment_content_typings` (sparse list of `{filename, doc_type}`, `instruction|report|junk|unknown`). Refinement rule: content `report` overrides that filename's extension-derived `instruction` kind; `junk`/`unknown` withdraws the instruction-doc promotion for that file; **absent/empty = today's output bit-for-bit** (engine tag may deploy ahead of orchestration). `open_case_ref_match` needs no engine change — only route + TS client wiring. Deploy order: engine tag `engine-v2.17` → re-vendor → parser deploy → orchestration deploy.

### D5 — Validation: offline A/B backtest over the existing corpus (replaces any shadow period)
Two-part harness, following the `run_ab.py` pattern (import `run_eval.py` machinery, never copy):

**Part 1 — Python: `scripts/eval-email/run_ab_parsefed.py`.** For each manifest item (44 real emails + local overlay):
- **OLD path:** `classify_email()` with today's inputs (as `run_eval.py` does).
- **NEW path:** extract the item's real attachments from the `.eml`/`.msg`, run the vendored **parse/extraction engine directly as Python** (same in-process approach as classify — no HTTP, no Azure) to get parser VRM/ref/content_typing, derive `attachment_content_typings` + `open_case_ref_match` (from manifest `context` — a labeling judgment like `provider_match_state`, since a raw file can't know live open cases; add `context.open_case_ref_match` entries where relevant), then `classify_email()` with the enriched inputs.
- Emit a per-item JSON (`--json-out`, local-only) of both classifications + extracted-ref deltas, and a committed-safe aggregate report (PII rules: ids, labels, counts only).

**Part 2 — Node: `scripts/eval-email/run_ab_parsefed_decide.mjs`** (or a vitest suite in `packages/domain`): loads Part 1's JSON + manifest context, runs `decideTriage` over OLD inputs vs NEW inputs (live gate values), reports the **action delta table** (proceed_default→suggest_attach etc.), category/subtype delta table, and flags any ADR-0010 violation (a vrm-only match reaching attach_case = hard fail).

**Acceptance to merge/flip:** zero regressions on currently-correct corpus items (checked via `--check` against a new pre-change baseline), every changed outcome individually justified against the item's hand-labelled expectation, no ADR-0010 violations. Known-miss items the change is *supposed* to fix (photos-in-a-PDF, doc-only refs, report-vs-instruction) should flip to correct — that's the payoff evidence.

## Phased implementation

**Phase 1 — Sibling engine** (`../cedocumentmapper_v2.0`; `git fetch origin --tags` + ff main first — checkout can be stale): add `attachment_content_typings` + refinement; pytest regression proving absent-input parity; tag `engine-v2.17`.

**Phase 2 — Vendored redeploy:** re-vendor `functions/parser/cedocumentmapper_v2/` to the tag; regenerate `VENDOR_LOCK.json`; extend the `/classify-email` route to accept + validate + pass through `open_case_ref_match` and `attachment_content_typings`. Live behaviour identical.

**Phase 3 — Backtest harness + report (the go/no-go gate):** build D5's two scripts; regenerate the pre-change baseline; run OLD-vs-NEW over the corpus (+ overlay if the operator exports one); write the aggregate report into the ticket's `evidence/`. Iterate on the D4 refinement rules here until acceptance passes — **before** any orchestration change ships.

**Phase 4 — Domain + orchestration:** `gates.triageParseFed()` in `packages/domain/src/gates.ts`; optional fields on `callClassifyEmail` (`orchestration/src/lib/functions-client.ts`); new `activities/triage.ts` (export pure builders `buildParseFedClassifyRequest`, `buildWidenedTriageContextRequest`, `deriveContentTypings`, `resolveOpenCaseRefMatchState` for unit tests); `intakeOrchestrator.ts` reorder + single `triage` call replacing steps 1.5/1.55 + TKT-102 parse collapse.

**Phase 5 — Deploy + flip:** deploy orchestration; set `TRIAGE_PARSE_FED_ENABLED=true` at (or immediately after) deploy — the backtest already carried the burden of proof; the gate remains purely a kill-switch (unset → byte-identical legacy path). Update LIVE_FACTS.json + registry mirror; spot-check the first live doc-bearing intakes via the existing `triage_decision` KQL.

## Docs/tickets (repo discipline)

- **ADR-0026** — amends ADR-0019: Stage A gains parse-derived inputs; Stages A+B compose under one unified activity; parse precedes triage; corpus-backtest validation model.
- Tickets: **TKT-201** (sibling engine contract + parity tests), **TKT-202** (parser route + re-vendor + deploy), **TKT-203** (backtest harness + report — the go/no-go), **TKT-204** (domain gate + unified activity + orchestrator reorder + deploy/flip; gated.md entry for the operator flip).
- rules-engine-v2-build.md: record the unified stage under Phase 3.

## What NOT to change

- `decideTriage` and its kill-switch-by-construction; the orchestrator never reads `process.env`.
- **ADR-0010:** VRM-only (including parserVrm-only) never auto-attaches — parserVrm feeds only the `vrm` context key (`matchedOn:'vrm'`); the backtest hard-fails on any violation.
- `recordInboundEmail`/`recordAudit` always-on; no backtest artifact ever commits subjects/bodies/refs (PII rules in `scripts/eval-email/README.md`); corpus labels are never tuned to make the new branch pass (README's "ground truth, not a pass/fail gate" rule).
- The downstream chain (caseResolve→…→enrich), Stage C `triageClassify`, linkReply lane, retro fallback, Data API `/triage/context` contract, and the vendored copy (never hand-edited).

## Tests + verification

- Sibling: pytest parity + new-input tests. (NB: Windows parser env failures drift — diff vs a same-day baseline.)
- **Backtest (primary verification):** Phase 3's OLD-vs-NEW report meets the D5 acceptance; baseline `--check` green.
- `classifyInbound.test.ts` untouched (legacy-parity proof); new builder tests for the parse-fed request. New `triage.test.ts`: widened-context precedence (parser fills only empty text slots); `open_case_ref_match` derivation (one/none/ambiguous; lookup failure → 'none'); gate-off parity with a rich parse result present. `triage-policy.test.ts` (domain) + `parse.test.ts`: zero diff.
- Orchestrator tests (intake-*.test.ts style): parse scheduled before triage for doc-bearing emails, not scheduled for bare emails; TKT-102 consumes the checkpointed parse (no second call); drop_duplicate still short-circuits.
- Offline gate at each phase: `node verify-all.mjs` (vendor-pin verifier + tsc/vitest + optional `EVAL_EMAILS=1`).

## Critical files

- `../cedocumentmapper_v2.0/src/cedocumentmapper_v2/rules/email_classifier.py` (sibling — authoring source)
- `functions/parser/function_app.py` (`/classify-email` route)
- `scripts/eval-email/run_ab_parsefed.py` + `run_ab_parsefed_decide.mjs` (new — the backtest)
- `orchestration/src/functions/intakeOrchestrator.ts`
- `orchestration/src/functions/activities/triage.ts` (new; composes helpers from `classifyInbound.ts` + `triagePolicy.ts`)
- `orchestration/src/lib/functions-client.ts`, `packages/domain/src/gates.ts`
