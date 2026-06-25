# Phases 1–7 SDLC Sweep — Consolidated Report

**Date:** 2026-06-26 · **Scope:** Phases 1–7 (M1 intake → live activation → enrichment/EVA →
address/chaser → OCR/scale → handoff boundary → Box pivot) · **Method:** seven per-phase as-built
audits consolidated against the precedence chain (binding review > ADR > architecture/requirements >
plans; `CURRENT_STATUS.md` = live now, `docs/gated.md` = what needs the operator,
`OPEN_ITEMS.md` = flat worklist).

## How to read this report

A prior SDLC sweep (commit #24) already implemented the outstanding buildable items across phases 0–9
**offline and gated-off**. Most integrations are switched **OFF behind Dataverse env-var gates on
purpose**, because they await operator credentials or activation:

> **An intentionally-gated-off integration is NOT a defect.** EVA Sentry REST (needs Sentry creds +
> Minotaur's one-principal-code patch), Box (needs a Business-tier tenant + CCG auth + KV secrets),
> OCR / Document Intelligence (needs a DI-Read key + the vendored engine baked in), valuation/Copilot
> (M3, needs Azure OpenAI/Foundry), and the chaser send-path (crosses the live email boundary) are all
> **built and correctly dark**. They appear below only under "Gated — not a defect" so the operator can
> see they are accounted for.

A **real gap** is something that is **unfinished offline, regressed, internally inconsistent, or a
doc/contract drift** — never "a gate is false."

Net result of the sweep: **no regressions, no live breakage.** One genuinely consequential as-built
**schema-as-code drift** (the staff-Hold column missing from `case.json` — a re-provision would
silently break the Hold feature), a handful of safe manifest/contract/doc inconsistencies, several
deferred-build real gaps that need an owner decision (not a mechanical fix), and the expected body of
operator-gated activation work.

---

## Per-phase summary (built / correctly-gated)

| Phase | Built & live-green offline | Correctly gated-off (not a defect) |
|---|---|---|
| **1 — Intake & case tracking** | Parser Function, Dataverse schema/choicesets/corpus, Code App (queues, CaseDetail, readiness, Hold/Release, action logs); `digital@` intake webhook live; `case-resolve` repurposed to merge-by-registration (ON). Status machine reconciled 1:1 with the 11-value `cr1bd_casestatus`. | classify-persist, parse, status-evaluate, enrich, provider-match, both intake variants + jobsheet/finalize/chasers/Box flows — all `state=off` awaiting activation. |
| **2 — Live activation (M1 exit)** | `digital@` intake + full M1 downstream chain deployed ON (per canonical `live-environment.md`); Outlook/Dataverse/parser conn-refs bound for `digital@`. Multi-inbox V2 design + runbook authored offline. | Info/Engineers/Desk scale-out; finalize-eva-box, chasers, jobsheet-import, all Box flows. |
| **3 — Enrichment & EVA** | DVSA/DVLA enrichment **LIVE in Dev** (`ENRICHMENT_ENABLED=true`); 12-field drag-drop serializer; EVA Sentry REST Function (deployed, gated); EVA-validation Function + `status-evaluate` repointed onto `ValidateCase`; readiness parity gates. Flow linter 181/181. | EVA Sentry REST (`EVA_API_ENABLED=false`); `cr1bd_evavalidation` connector bind; drag-drop test; readiness-to-green. |
| **4 — Address & chaser** | ADR-0013 manual-pick inspection-address model + EVA-export corpus revamp + ranking surface; location-suggest Function + connector + Code App seam (dark); chaser-draft (draft-only) + kill-switched chaser-send. Runtime matcher genuinely removed. | location-assist gates; chaser-send (`CHASER_SEND_ENABLED=false`); proximity ordering (#2b, M3). |
| **5 — OCR & scale** | OCR host deployed (`cespkocr-fn-dev-glju3v`) with `/ocr-pdf` + `/plate-ocr`; `cr1bd_ocr` connector authored; gated empty-extraction fallback wired into `parse`; `ImageOrderList` built+tested. | both OCR gates false; connector not imported; 5b image-AI (M2) + 5c valuation/Copilot (M3) plan-only by design. |
| **6 — Boundary evidence & handoff** | `verify-all.mjs` aggregates tsc+vite+vitest + schema parity + flow linter (181/181) + pytest + the boundary grep-gate + the `uploadFileToRecord` guard — all green. `functions/addressmatch/` fully removed. | items 3–5 (live `pac connection list` inventory, deploy log, §7 three-mailbox live-validation) = the operator-only M1 "done" definition. |
| **7 — Box integration (ADR-0012)** | Schema (5 BOX_* gates + columns + audit actions), `cr1bd_box_rest` connector OpenAPI, `box-webhook` Function (pytest 79), 3 Box flows + finalize augment + survivor-folder ensure, Code App deep-link. Parity/linter/vitest all green. | every BOX_* gate false; connector + Box flows `state=off`; `box-webhook` deployed inert (KV empty). |

---

## Gap register (prioritized)

Disposition key: **Auto-fix** = safe offline reconciliation queued now · **Operator** = needs
operator action/decision · **Deferred build** = real gap, but a feature build / design decision (not a
mechanical fix) · **Gated** = intentionally off, not a defect · **Docs hygiene** = safe but low-value /
cross-file / re-drifts, deferred to a single pass.

| # | Phase | Area | Kind | Sev | Disposition |
|---|---|---|---|---|---|
| 1 | 1 | `cr1bd_onhold` not in `case.json` though live + Code App depends on it (Held queue, Hold/Release) | inconsistency | **major** | **Auto-fix** (T1) |
| 2 | 4 | `cr1bd_LOCATION_ASSIST_ENABLED` not frozen in `verify-parity` expect-map (siblings are) | inconsistency | minor | **Auto-fix** (T1) |
| 3 | 1 | `cr1bd_payloadhash` description describes SHA256-over-attachments behaviour that doesn't exist (Message-ID is the real key) | inconsistency | minor | **Auto-fix** (T1) |
| 4 | 7 | `cr1bd_boxsyncedat` description names action `Stamp_case_box_fields` (flow has `Stamp_boxsyncedat`) | doc-drift | minor | **Auto-fix** (T1) |
| 5 | 1 | `flow-state.json` provider-match trigger/reservedReason stale ("called inside case-resolve" / "Part of the live intake chain" — it is inlined, not invoked) | inconsistency | minor | **Auto-fix** (T2) |
| 6 | 2 | `flow-state.json` enrich reservedReason still says "via the gateway" (gateway retired, B1 obviated) | doc-drift | minor | **Auto-fix** (T2) |
| 7 | 3 | `shared_evasentry` is the only custom connector ref missing the `openapi` pointer | inconsistency | minor | **Auto-fix** (T2) |
| 8 | 5 | `ocr-connector.json` references the parser's `_decode_document` (host fn is `_peel_double_base64`) | doc-drift | minor | **Auto-fix** (T3) |
| 9 | 5 | `ocr/README.md` stale pytest count + "three env-vars" heading (only two are Dataverse vars) | doc-drift | minor | **Auto-fix** (T3) |
| 10 | 3 | `enrichment-activation.md` self-inconsistent test count (18 vs 29) + stale "gate-default drift" (resolved) | inconsistency/doc-drift | minor | **Auto-fix** (T3) |
| 11 | 1 | Phase-1 README: duplicate "12.", "10 cloud flows" (now 17), "dedup ladder" (now merge-by-reg), InspectionAddress 174 vs 871 | doc-drift | minor | **Auto-fix** (T4) |
| 12 | 2 | `multi-inbox-access.md` §3 tells operator to import `intake.definition.json` ×3, contradicting its own §1/§5 (V2 = `intake-shared-mailbox.definition.json`) | inconsistency | minor | **Auto-fix** (T4) |
| 13 | 1 | `domain/dedup.ts` header claims 1:1 parity with `Flow_CaseResolve` Switch — no longer true (flow is merge-by-registration) | doc-drift | minor | **Auto-fix** (T5) |
| 14 | 2 | Repo-vs-live intake drift **now INVERTED**: repo `intake.definition.json` LEADS live (un-activated Phase-8 triage); registry/runbook still say "repo trails live" | doc-drift | major | **Operator** (needs live export) |
| 15 | 3 | Activation ORDER: bind `cr1bd_evavalidation` BEFORE re-activating repointed `status-evaluate`, else no case reaches `ready_for_eva` | needs-operator | major | **Operator** |
| 16 | 2 | Exchange mailbox-type + the two other inbox addresses unknown (decides the whole multi-inbox build) | needs-operator | major | **Operator** |
| 17 | 4 | Phase-4a corpus FULL REPLACE: ADR/architecture say RAN 2026-06-24; ROADMAP/CURRENT_STATUS say not-yet-run | doc-drift | minor | **Operator** (confirm live rows) |
| 18 | 6 | Live boundary evidence (items 3–5): connection inventory, deploy log, §7 three-mailbox validation | needs-operator | major | **Operator** |
| 19 | 1 | Confirmed-delete Case action (UI + cascade Evidence + `case_disposed` audit + Box-archival prompt) unbuilt | real-gap | minor | **Deferred build** |
| 20 | 2 | Multi-inbox V2 flow body lacks the M1 downstream chain (carries triage only) | real-gap | major | **Deferred build** |
| 21 | 4 | `location_assist_confirmed=100000022` forward-declared with NO emitter | real-gap | minor | **Deferred build** |
| 22 | 5 | Plate-OCR producer built, no consumer wires it to `Evidence.registrationVisible` (M1 claim unmet end-to-end) | real-gap | minor | **Deferred build** |
| 23 | 4 | chaser-draft (whatsapp-only, no channel input) and chaser-send (email-only) don't compose | inconsistency | minor | **Deferred build** (design) |
| 24 | 5 | OCR field-prefill needs the vendored engine baked into the image; README says "(recommended)" | inconsistency | minor | **Deferred build** |
| 25 | 5 | `AIBUILDER_CLASSIFY_ENABLED` seeded by `22-envvars-m2.ps1` but absent from manifest + parity | inconsistency | minor | **Deferred build** (decision) |
| 26 | 5 | `ImageOrderList` reorder not persisted / doesn't affect EVA order (README item 7 overstates) | inconsistency | minor | **Deferred build** (design) |
| 27 | 6 | `DEPLOY-RUNBOOK §8.3` "no secrets in the repo" claim broader than the gate (flows-only scan); once-committed parser key in git history | inconsistency | minor | **Operator** (judgment) |
| 28 | 2/6/7 | Stale pinned counts: flow linter "154/154" (now 181/181, ~8 docs) + "Cloud flows ×15" (17 authored / 10 live) | doc-drift | minor | **Docs hygiene** |
| 29 | 2/3/6 | `OPEN_ITEMS.md` worklist: several [DRIFT]/[BUILD] entries already resolved but listed open | doc-drift | minor | **Docs hygiene** |
| 30 | 1/3/4/5/7 | EVA Sentry REST · Box pivot · OCR host · valuation/Copilot/image-AI · chaser-send — built & correctly switched OFF | intentional-gate | — | **Gated — not a defect** |

---

## (A) Auto-fixing now — safe real offline gaps

These are mechanical, additive, offline reconciliations with no gate flip, no live touch, no scope
change. File sets are **disjoint** so the five tasks run in parallel. Each maps to a `fixTask` in the
structured output.

- **T1 (dataverse-data-architect) — `dataverse/schema/case.json`, `dataverse/verify-parity.mjs`**
  - Add the additive `cr1bd_onhold` Boolean column declaration to `case.json` so schema-as-code matches
    the live column the Code App depends on (Hold/Release + Held-queue routing). **This is the one
    consequential drift** — without it, a fresh provision from schema-as-code silently drops the Hold
    feature.
  - Reconcile the `cr1bd_payloadhash` description to as-built (subject|from token seed; Message-ID is
    the dedup key; payloadHash is advisory) and the `cr1bd_boxsyncedat` description (`Stamp_case_box_fields`
    → `Stamp_boxsyncedat`, decoupled from `Stamp_boxfolderid`).
  - Add `"cr1bd_LOCATION_ASSIST_ENABLED": "false"` to the `verify-parity.mjs` expect-map (parity lock,
    consistent with its default-OFF siblings).
- **T2 (power-automate-flow-builder) — `flows/flow-state.json`, `flows/connection-references.json`**
  - Correct the provider-match manifest entry to "standalone returnable child, retained for ALM/reuse —
    intake inlines the same anchored-domain logic; not currently invoked."
  - Reword the enrich reservedReason off "via the gateway" to "directly (Entra client_credentials to
    DVSA MOT + DVLA); secret inject is [RESERVED-FOR-USER]."
  - Add the `"openapi": "functions/evasentry/openapi/evasentry-connector.json"` pointer to the
    `shared_evasentry` connector reference (parity with the other custom connectors).
- **T3 (azure-integration-engineer) — `ocr/README.md`, `ocr/openapi/ocr-connector.json`, `docs/plans/phase-3-enrichment-and-eva/enrichment-activation.md`**
  - Replace `_decode_document` with `_peel_double_base64` in the two OCR connector request-field
    descriptions; reword the README gating heading to "two Dataverse env-vars + the OCR_PROVIDER/PLATE_PROVIDER
    app settings" and de-pin the stale pytest count.
  - Update the two stale "18" test-count references to "29"; mark the gate-default-reconciliation bullet
    done and note both manifest and Bicep now express OFF-by-default.
- **T4 (claude) — `docs/plans/phase-1-intake-and-case-tracking/README.md`, `docs/plans/phase-2-live-activation/multi-inbox-access.md`**
  - Phase-1 README: renumber the duplicate "12.", change "10 cloud flows" → "17 flows (state=off except
    case-resolve)", reword "dedup ladder encoded" → "Message-ID dedup + merge-by-registration case-resolve
    (ADR-0010)", and cite InspectionAddress 871 (174 confirmed + 697 suggested).
  - multi-inbox-access.md §3: point the per-inbox import instruction at `intake-shared-mailbox.definition.json`
    (the V2 file), consistent with the doc's own §1/§5.
- **T5 (claude) — `mockup-app/src/domain/dedup.ts`**
  - Rewrite the header to state `resolveCase` is a **reference contract** for the ADR-0010 ladder
    semantics and that the LIVE `Flow_CaseResolve` implements merge-by-registration (only the
    ">1 candidate → Held/duplicate_risk" rule is shared); note it is test-only / not wired into a screen.

**Deliberately excluded from auto-fix** (kept off the queue to stay conservative): anything that edits
the import-sensitive `intake.definition.json` (its live-vs-repo drift is unresolved — item 14); any
checklist `[ ]→[x]` that asserts live-activation status; the `OPEN_ITEMS.md` worklist ticks and the
"154/154"/"×15" count sweep (cross-file, re-drifts every phase, several files carry unsafe-adjacent
live wording); and every real-gap that is a feature build or design decision.

---

## (B) For the operator — gated / needs-operator / deferred-build

> Reminder: the **Gated** items are built and correct; they are listed so activation is tracked, not
> because anything is broken.

### Gated — not a defect (confirm + activate)
- **EVA Sentry REST** (`functions/evasentry`, `cespkeva-fn-ufa3ci`) — deployed, `EVA_API_ENABLED=false`,
  `cr1bd_evasentry` unbound; awaits EVA creds and Minotaur's one-principal-code patch (ADR-0005).
- **Box pivot** — all 5 `BOX_*` gates false; `cr1bd_box_rest` + 3 Box flows authored `state=off`;
  `box-webhook` deployed inert (KV empty). Unlock = Box Business CCG app + Admin authorize, KV secret
  inject, the one template File Request, archive-root designation, connector import/bind (BOTH
  `cr1bd_box_rest` custom and first-party `cr1bd_box` for bytes), the **blocking** FILE.UPLOADED
  live-test, and the live-only intake `Run_box_folder_create` edit.
- **OCR + plate-OCR** — `cespkocr-fn-dev-glju3v` deployed, both gates false, `OCR_PROVIDER=tesseract`,
  DI-Read key not injected, `cr1bd_ocr` not imported. Activation also requires baking the vendored
  `cedocumentmapper_v2` engine into the OCR image (else field-prefill is a no-op).
- **Valuation (5c) + Copilot (M3) + image-AI (5b, M2)** — plan-only by design (need Azure
  OpenAI/Foundry / Copilot Studio).
- **chaser-send** — built, `CHASER_SEND_ENABLED=false`, `state=off`, WhatsApp hard-skipped; sending real
  email crosses the live boundary.
- **Enrichment (3a)** — LIVE in Dev (`ENRICHMENT_ENABLED=true`); only the test/prod cutover + DVSA Entra
  admin-consent remain.

### Needs-operator (order / decision / live)
- **Activation ORDER** — bind `cr1bd_evavalidation` BEFORE re-activating the repointed `status-evaluate`
  (else every `Validate_readiness` call fails and no case reaches `ready_for_eva`); same pattern for
  `cr1bd_ocr` before flipping the OCR gate. (`docs/gated.md` §8.)
- **Repo-vs-live intake drift (NOW INVERTED)** — after the Phase-8 merge, repo `intake.definition.json`
  **leads** live (carries the un-activated triage-first restructure: `fetchOnlyWithAttachment` flip +
  Switch routing). A naive solution re-import would PUSH that onto the live `digital@` intake. Operator
  must export the live CS Intake and reconcile before any re-import, then correct
  `live-environment.md` / `DEPLOY-RUNBOOK §8.6` / the `CURRENT_STATUS` callout, which still describe the
  old "repo trails live" direction. **Not an offline reword — needs a live export.**
- **Exchange decision** — are the Info/Engineers/Desk inboxes shared mailboxes `digital@` can hold Full
  Access to (reuse the V2 trigger) or licensed user mailboxes (new OAuth each)? The two inbox addresses
  are also undocumented. Lives in M365 admin; blocks finishing Phase 2.
- **Phase-4a corpus FULL REPLACE** — ADR-0016/architecture record the destructive `16-seed -Apply` as
  RAN 2026-06-24 (~2,035 `suggested:eva_export` + 174 confirmed; backup `inspectionaddress-20260624.json`),
  but ROADMAP/CURRENT_STATUS still read not-yet-run. Confirm the live row count, then reconcile up to the
  ADR (destructive live action — confirm before editing docs).
- **Phase-6 live boundary evidence (items 3–5)** — `pac connection list` inventory, the deploy log of
  every `[DEPLOY-WITH-LOGIN]`/`[RESERVED-FOR-USER]` action, and the §7 three-mailbox live-validation
  checklist. The M1 "done" definition; only the operator can produce them.

### Deferred build (real gaps — a feature build or design decision, NOT a mechanical fix)
- **Confirmed-delete Case action** (Phase-1 item 12) — UI on CaseDetail that cascades Evidence, writes a
  `case_disposed` AuditEvent, and (if Box live) prompts manual Box-folder archival (ADR-0017).
- **Multi-inbox V2 flow body** — port the receiving_work downstream chain
  (`Run_classify_persist`→`Run_parse`→`Run_status_evaluate`→`Run_case_resolve`→`Run_enrich` + the
  Case/PO + .eml scopes) into `intake-shared-mailbox.definition.json` (keep `state=off`).
- **location_assist_confirmed emitter** — emit an AuditEvent (`cr1bd_action=100000022`) inside
  `saveInspectionDecision` for assist-sourced confirms only (not corpus/IBA).
- **Plate-OCR consumer** — wire `PlateOcr` → `Evidence.registrationVisible` / VRM-match behind
  `cr1bd_PLATE_OCR_ENABLED`, or downgrade the M1 framing to "host built, consumer deferred."
- **chaser-draft ↔ chaser-send composition** — give chaser-draft a channel input (default per ADR-0003)
  so an email chaser can be drafted then sent, or document chaser-draft as intentionally WhatsApp-only.
- **OCR engine-bake** — firm up `ocr/README.md` from "(recommended)" to "required for field extraction"
  and make baking `cedocumentmapper_v2` into the OCR image a hard deploy step.
- **`AIBUILDER_CLASSIFY_ENABLED` reconciliation** — drop it from `22-envvars-m2.ps1` (the Foundry-vision
  path reuses `AZURE_VISION_ENABLED`) or add it to the manifest as an explicit M2 gate.
- **`ImageOrderList` persistence** — wire `onOrderChange` to persist a preview/sequence selection onto
  Evidence (and feed the EVA order), or relabel as a preview-order visualisation.

### Docs hygiene (safe but deferred — single pass)
- **Stale pinned counts** — flow linter "154/154" (actual 181/181) across ~8 docs; "Cloud flows ×15"
  (17 authored / 10 live) in `CURRENT_STATUS` + `DEPLOY-RUNBOOK`. Repo convention is "say all gates
  green, not a pinned number." Left for one pass (re-drifts each phase; several files carry
  unsafe-adjacent live wording).
- **`OPEN_ITEMS.md` worklist ticks** — multi-inbox attribution (fixed 2026-06-24), eva
  `core_to_instruction` rename, `addressmatch` deletion, verify-all "7/7" reconciliation are all done but
  still listed open. Verify each, then tick.
- **Phase-2/ROADMAP checklist** — `[x]` vs `[ ]` disagree on what `digital@` activation reached;
  reconcile to canonical `live-environment.md` (refs bound + chain ON; other two inboxes pending).
- **`intake.definition.json` inline comments** — `Run_status_evaluate` ("inline image-rules") and
  `Init_payloadHash` ("SHA-aware probe downstream") are stale; defer to the same flow-builder pass that
  reconciles the intake live-vs-repo drift (the file is import-sensitive).
- **`mockup-app/src/data` comments** — assert a non-existent "no @microsoft/power-apps grep gate" /
  "mock-backed src" (runtime is Dataverse-backed); coordinate with the OPEN_ITEMS Phase-0 [DRIFT] entry.
- **`00-BUILD-PLAN.md`** (historical synthesis, lowest precedence) — `cr1bd_box` vs `cr1bd_box_rest`
  binding wording + Wave-2 metadata-field steps not reconciled to the locked base-Business decision.
  Shipped phase-7 docs are already correct.
- **`verify-all.mjs` pytest SKIP** — location-suggest/box-webhook/ocr suites SKIP locally for want of a
  per-dir `.venv` (they pass when a venv exists). Dev-environment setup, not an unbuilt gap.

---

## Verification performed for this report

- Read `dataverse/schema/case.json` (65 columns) — confirmed `cr1bd_onhold` is **absent**, and the
  `cr1bd_payloadhash` (line 26) and `cr1bd_boxsyncedat` (line 53) descriptions are stale as reported.
- Read `dataverse/verify-parity.mjs` — confirmed the expect-map (lines 78–101) locks every default-OFF
  gate **except** `cr1bd_LOCATION_ASSIST_ENABLED`.
- Read `flows/flow-state.json` — confirmed `totalFlows: 17`, the stale provider-match (line 99) and
  enrich "via the gateway" (line 87) wordings.
- Read `flows/connection-references.json` — confirmed `shared_evasentry` is the only custom connector
  reference missing the `openapi` field.
