# OPEN_ITEMS.md — everything not done yet, by phase

_Consolidated, **code-verified** list of outstanding items across **every** phase. Generated from the
16-agent SDLC audit on **2026-06-24** (each claim re-checked against the actual tree), then maintained as
the live worklist for the ongoing SDLC sweep._

**How this differs from the other status docs** (precedence unchanged — a binding review > ADRs >
architecture/requirements > plans):
- [ROADMAP.md](./ROADMAP.md) — forward phased checklist (`[x]`/`[ ]`), no running detail.
- [CURRENT_STATUS.md](./CURRENT_STATUS.md) — what is **live now**.
- [docs/gated.md](./docs/gated.md) — the operator hard/soft blocker registry.
- **OPEN_ITEMS.md (this file)** — the **single flat list of every not-done item**, by phase, each tagged
  with who can do it. Cross-checked against code, not the docs' self-report.

### Legend
- **[BUILD]** — buildable offline **now**, gated-OFF, no operator/secret/live-service/Azure-deploy dependency.
- **[OPERATOR]** — needs the operator: binds a live connection, injects a secret, flips a gate ON, touches
  live Outlook/SharePoint/Box/EVA, or supplies business data. _Claude builds offline; the operator activates._
- **[DEFERRED]** — deferred by design to a later milestone (M2/M3) or behind another phase.
- **[DRIFT]** — doc-vs-code mismatch to reconcile (no functional change).
- **[DONE 2026-06-24]** — completed in the current sweep (see git log).

> ⚠️ **Live gate is currently RED.** `verify-all.mjs` fails today on one gate: the parser **vendored-engine
> drift guard** (`test_engine_vendored_in_sync.py`) — 8 engine-core modules differ from the sibling. This is
> the #1 build item (Phase 1a). All other verify gates pass (Dataverse parity, flow linter 154/154, Code App
> tsc+vite+vitest, enrichment pytest).

---

## Phase 0 — Foundations
- **[DRIFT]** `verify-all.mjs` is described as "7/7 (7 gates)" in Phase-0/Phase-6 READMEs + ROADMAP +
  milestone-model, but it runs 8 labelled gates and the pytest loop omits 5 Function suites — reword to
  "all gates green" and reconcile CURRENT_STATUS' per-suite counts.
- **[DRIFT]** Phase-0 README claims the parser-key rotation is logged in `docs/gated.md` — no such entry; add it or fix the pointer.
- **[DRIFT]** Stale in-code comments (`dataverse-source.ts`, `types.ts`, `generated-services.ts`, `vite.config.ts`)
  assert a non-existent "no @microsoft/power-apps grep gate" and a false "mock-backed / SDK-free src" posture — correct them.

## Phase 1a — Parser Function
- **[BUILD]** _(★ #1, unblocks the RED gate)_ **Re-vendor the parser engine** — re-cut the 8 drifted engine-core
  modules (`config/__init__.py`, `config/migration.py`, `detection/__init__.py`, `domain/__init__.py`,
  `exporters/eva_json.py`, `readers/{doc,email,pdf}.py`) from a **committed** sibling ref, re-apply the
  vendored-only B2 reconciliation, get `test_engine_vendored_in_sync.py` green. _Authorized 2026-06-24: commit+push the sibling first to create the ref (ADR-0018)._
- **[BUILD]** Re-vendor blocker: vendor the new `cedocumentmapper_v2.resources` package `eva_json.py` now
  imports (or keep the old file-path schema resolution) — else `import cedocumentmapper_v2.exporters` raises ImportError → 502.
- **[DONE 2026-06-24]** Add the missing `audit` field to the parser custom-connector OpenAPI (`parser-connector.json`).
- **[OPERATOR]** Rotate the parser function-key in Azure (the literal is in git history → burned).
- **[OPERATOR]** Live `.doc`/`.msg` parse test on the FC1 host; trim the ManualIntake ACCEPT list if either fails.
- **[DRIFT]** `test_double_encoding.py` comment says "double → 422 (surfaced, not repaired)" but code+test recover to 200 — fix comment.
- **[DRIFT]** Committed parser function-key literal still in `docs/activation/email-intake-activation.md` line 30 — scrub to `<set at activation>`.

## Phase 1b — Provider corpus & inspection-address data
- **[BUILD]** Add Pester unit tests for the corpus seed/verify PowerShell pure-functions (postcode normalise,
  placeholder-name, disposition switch, confirmed-match filter, Split-AddressLines/Get-RowRanking, domain-ambiguity guard).
- **[OPERATOR]** Phase-1b.3 clarifying-info writers (Inputs 1–5): address worklist, intermediary reclassify,
  garage↔provider coverage N:N, code reconciliation, CONSIDER seeding — all await operator-returned worklists.
- **[OPERATOR]** Supply real sender domains for the ~360 providers with blank `knownEmailDomains`; re-run `15-seed -Apply`.
- **[OPERATOR]** Mint canonical short principal codes for the 5 active over-length businesses.
- **[DRIFT]** `clarifying-info-ingestion.md` mandates an AuditEvent on every corpus create/update, but the
  incorporation scripts 10–14 wrote none (provenance-marked instead) — reconcile the doc to as-built.
- **[DRIFT]** InspectionAddress count drift — phase-1 README + Provider card cite 174; CURRENT_STATUS authoritative is 871 (174 confirmed + 697 volatile suggested).

## Phase 1c / 1d — Code App + Flows
- **[BUILD]** Build the shared `<Panel>` primitive; consolidate the duplicated card/panel/hero blocks (Admin, CaseDetail, ManualIntake, Skeletons, AppErrorBoundary).
- **[BUILD]** Extract a shared `<EvaFields>` module (FIELD_CLUSTERS/LABEL_FOR/FieldRow) — defined verbatim in BOTH CaseDetail and ManualIntake (drift risk).
- **[BUILD]** Add theme utility classes (`.ce-overline/.ce-stat/.ce-stat-lg`) + amber CSS vars; route Dashboard/CaseList through the shared `<EmptyState>`.
- **[BUILD]** Wire or remove the dead `FieldsSkeleton`; resolve the dead `logoWhite` export; upgrade `ActionLogs` loading/error seam; add a favicon.
- **[BUILD]** Remove or wire the dead dedup-decision dialog (superseded by MergeCaseDialog); scrub the `(mock)` UI copy + console no-op.
- **[OPERATOR]** Reconcile repo `intake.definition.json` UP to live (`Run_enrich` + `Run_case_resolve` + `Run_box_folder_create`) — needs a live flow EXPORT.
- **[OPERATOR]** Live verify of the C5 `React.createElement` console error on the deployed player.
- **[DRIFT]** `power.config.json logoPath='Default'` maker-portal tile (operator `pac push`).

## Phase 2 — Live Activation
- **[BUILD]** Images-storage **swappable backend abstraction** (B1–B5), default `azureblob` (byte-identical
  behaviour), gated OFF — env-vars + 2 unbound connection refs + Switch-per-backend refactor of classify-persist + linter assertion.
- **[OPERATOR]** Bind the Outlook shared-mailbox + Dataverse + parser connection references (digital@ already bound).
- **[OPERATOR]** Turn ON intake/classify-persist/parse for ONE inbox; send a test email; confirm Case/categories/dedup/intermediary-no-automatch.
- **[OPERATOR]** Scale live intake to Info/Engineers/Desk inboxes (M1 exit gate).
- **[DRIFT]** `multi-inbox-access.md`/`-feasibility.md` attribute the V2 SharedMailbox trigger to `intake.definition.json` (actually `OnNewEmailV3`); the V2 flow is `intake-shared-mailbox.definition.json`.
- **[DRIFT]** The V2 multi-inbox flow is claimed "logic IDENTICAL to intake" but lacks the downstream chain — reconcile up or downgrade the claim.

## Phase 3 — Enrichment & EVA
- **[BUILD]** Repoint `status-evaluate` onto `shared_evavalidation/ValidateCase` (M2.B) — delete the 5 inline
  readiness actions, add the connection call, set usedBy + boundAtActivation (Function already deployed; flow stays off).
- **[BUILD]** Build the **TS-side EVA-readiness parity vitest** (consume `parity_fixtures.json` through computeReadiness/statusForReviewCase/evaluateEvaImageRules) — only the Python half exists.
- **[BUILD]** Build the **cross-transport drag-drop ↔ REST byte-identity parity test** (the cutover gate) against `core_to_instruction`/`validate_core_payload`.
- **[BUILD]** Wire **body/images photo streaming** into `finalize-eva-box`'s EVA-REST branch (Function/connector already support `images[]`; flow only passes the 12-field core).
- **[OPERATOR]** Enrichment test/prod cutover (Dev is ON + live-verified).
- **[OPERATOR]** Export 12-field JSON, drag-drop into EVA **test**; confirm acceptance.
- **[OPERATOR]** EVA Sentry REST: inject test creds → KV, bind `cr1bd_evasentry`, flip `EVA_API_ENABLED` (after Minotaur one-principal-code patch + parity test); prod cutover.
- **[OPERATOR]** Import the EVA-validation custom connector + bind `cr1bd_evavalidation` (Function deployed; import+repoint remain).
- **[OPERATOR]** Drive EVA readiness to green on a live Case; confirm AuditEvent rows.
- **[DRIFT]** `eva-sentry-rest-submission.md` understates built code (two-request photo flow is BUILT; rename `build_instruction_inspection`→`core_to_instruction`); Phase-3 README 3c/3d + `box-archival-pipeline.md` stale.

## Phase 4 — Inspection Address & Chaser
- **[DONE 2026-06-24]** Fix audit-action value COLLISION — `chaser-send` wrote `100000019` (box_folder_created); added `chaser_sent`=100000023.
- **[DONE 2026-06-24]** Add the missing `cr1bd_CHASER_SEND_ENABLED` gate to the env-var manifest + verify-parity.
- **[OPERATOR]** Run the destructive `16-seed -ReplaceSuggestions -Apply` corpus FULL REPLACE (backup-first); accept ADR-0016 (Proposed→Accepted). _(Already RAN 2026-06-24 per CURRENT_STATUS — confirm/record.)_
- **[OPERATOR]** Chaser-send activation (flip `CHASER_SEND_ENABLED`, turn flow on — crosses the live email boundary).
- **[OPERATOR]** Location-assist activation: deploy the Function + KV, import the CE Location Assist connector, inject Vision+Maps keys, set `LOCATION_ASSIST_API_BASE`, flip the gates, wire `BoxPhotoSource`.
- **[OPERATOR]** Wire chaser garage-targeting to the garage↔provider N:N (blocked on Phase-1b.3 Input 4).
- **[DEFERRED]** **#2b proximity** (closest-to-accident / claimant-home) suggestion-ordering — needs two sibling extractions + gated geocoding (M3); ordering-only, ADR-0013 intact.

## Phase 5 — OCR & Scale
- **[BUILD]** Add the OCR connection-reference + gated OCR-fallback branch in `parse.definition.json` + OCR/valuation gates to `environment-variables.json` + verify-parity (they live only in `22-envvars-m2.ps1`).
- **[DONE 2026-06-24]** Add the `ImageOrderList` ordering-reducer vitest.
- **[DONE 2026-06-24]** Add the docintel OCR-hook unit test (`_install_docintel_ocr_hook`).
- **[OPERATOR]** Import/bind the OCR connector + flip OCR gates; calibrate on real scans.
- **[DEFERRED]** 5b person/reflection detection + overview-vs-damage classifier (M2; needs Azure OpenAI/Foundry).
- **[DEFERRED]** 5b WhatsApp media bulk-import (ADR-0007, M3).
- **[DEFERRED]** 5c Valuation Function + flow (M3); Copilot Studio offline build pack (M3).
- **[DRIFT]** Phase-5 README line 19 "add two B2 fields to ocr_pdf_adapter EVA map" — already present + parity-guarded; remove. `ImageOrderList.tsx` is built+wired but marked `[ ]` — tick it.

## Phase 6 — Boundary Evidence & Handoff
- **[BUILD]** Add the **static boundary grep gate** (no raw EVA/Box/Graph/SharePoint calls outside the seam) to `verify-all.mjs` — claimed `[x]` but does not exist.
- **[BUILD]** Extend the `verify-all.mjs` pytest loop to all built Function suites (evasentry, evavalidation, location-suggest, box-webhook, ocr) — ~245 tracked tests never run by the global gate.
- **[BUILD]** Delete the untracked `functions/addressmatch/` working-tree remnant (removed-matcher residue; no tracked files).
- **[OPERATOR]** Capture the connection inventory (`pac connection list`), the deploy log, and the §7 three-mailbox live-validation checklist.

## Phase 7 — Box-centric intake pivot
- **[BUILD]** Resolve the `main.tsx` template-id getter TODO — expose the resolved `cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID` value via a box-gates getter + unit test.
- **[OPERATOR]** Box Platform-app registration + Admin-Console authorization (Business tier) — THE hard unlock for everything Box-live.
- **[OPERATOR]** Inject Box secrets to KV; hand-build the one template File Request + designate the archive root.
- **[OPERATOR]** BLOCKING B2 live-test: File-Request → `FILE.UPLOADED` webhook firing on the live Business tenant; gate-flip choreography + B1 live archive confirm.
- **[OPERATOR]** Grant the box-webhook Function MI a Dataverse Application User; `pac code add-data-source` for the Box connector + bind `cr1bd_box_rest`.
- **[DEFERRED]** Wave-3 (B3) drop-box reg-merge; timed `ListFolder` reconciliation sweep; Phase-C tier-gated items (Metadata-Query, Governance, Box AI).
- **[DRIFT]** "vitest 256 passed" stale (actual 325+); ALM tag inconsistency `[C]` vs `[DEPLOY-WITH-LOGIN]` for the add-data-source wiring.

## Phase 8 — Inbox / Triage Management _(planned; full build authorized 2026-06-24)_
- **[BUILD]** Phase-A **deterministic email classifier** — `rules/email_classifier.py` (pure fn) + `/classify-email`
  route + `_WORK_/_QUERY_` keyword tuples + `test_email_classifier.py`. _Caveat: the "both copies" rule needs a sibling edit (ADR-0018) — handle via edit-in-sibling-then-revendor; keep `test_engine_vendored_in_sync` green._
- **[BUILD]** Phase-8 Dataverse schema — `inbound-email.json` table + 2 choicesets + `inbound_*` audit actions
  (start at **100000024** after `chaser_sent`) + `26-inbound-email.ps1` + `triage-classify` flow (state=off) + verify-parity.
- **[BUILD]** Phase-8 **labelled triage corpus** — relabel the 12 fixtures + author synthetic query/enquiry/OOO/bounce `.eml`; wire into the classifier test.
- **[OPERATOR]** Intake restructure (flip `fetchOnlyWithAttachment`, generalise dedup, Switch-on-category) — live designer, one inbox first.
- **[OPERATOR]** Operator drops real PII-scrubbed sample emails for precision tuning.
- **[DEFERRED]** Phase-B Code App Inbox/Triage screen + query queue (needs the live table with real rows).
- **[DEFERRED]** Phase-C gated LLM assist (`cr1bd_EMAIL_AI_ENABLED`) — behind the Phase-9 G5 AI sign-off.
- **[DRIFT]** Plan + ROADMAP say "next free audit-action = 100000022" — wrong (taken). Reconcile `intake.definition.json` to live before any triage edit.

## Phase 9 — Data Governance, Retention & Erasure _(planned; offline authoring authorized 2026-06-24)_
- **[BUILD]** Author the retention-clock schema (`cr1bd_closedat/retentionexpiresat/legalhold` on Case) + apply
  script + the scheduled **`case-disposition`** flow (gated-off, two-clock guard, NO Box deletion) + verify-parity.
- **[BUILD]** Author the **3-role least-privilege security model** (User + Admin) as real role artefacts + apply script, gated-OFF (Engineer deferred).
- **[BUILD]** Add KV **purge-protection** + Blob **soft-delete/versioning** to the function bicep (authoring only — operator applies; purge-protection is irreversible).
- **[BUILD]** Author the governance docs — `data-protection.md` (controller/processor map, lawful bases),
  the DSAR/erasure cross-store runbook (Box-folder-name / File-Request-URL / Outlook-category blind spots), and a unit-tested PII pre-scrub helper.
- **[OPERATOR]** Promote ADR-0017 Proposed→Accepted (needs retention period + lawful basis + litigation-hold rule + ICO/DPIA sign-off).
- **[DRIFT]** README + ADR-0017 list table-native auditing + cascade as "to-build" — both already in code (narrow to org-level enablement). Add the G1–G8 entries to `docs/gated.md` so the cross-links resolve.

## Cross-cutting
- **[DONE 2026-06-24]** Add the missing `enrichment-client.ts` vitest.
- **[BUILD]** Build the InspectionAddress provenance upsert save-path (capture `suggested:assist` sourceLabel/sourceNote
  behind the data-access seam, honest-off until the table is wired). _ADR-0013-compliant: persists a human-confirmed pick, not a resolver._
- **[DRIFT]** The whole Phase-4a location-suggest subsystem (PR #23) + the ADR-0016 offline corpus build are
  absent from CURRENT_STATUS/gated.md — add offline-built/deploy-pending entries.
- **[DRIFT]** `chaser-send` + location-assist activations are absent from `docs/gated.md` — add both.

---

_Last updated 2026-06-24 (post PR #23 merge; SDLC sweep wave 1 done). Maintained as items are completed —
tick `[DONE]` with the date as work lands._
