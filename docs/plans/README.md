# `docs/plans/` — index

> **⚠️ Historical band — Power Platform era (decommissioned).** These per-phase plans are the **build
> record of the now-decommissioned Power Platform implementation** (Code App + Dataverse + Power
> Automate). The **live system is the Azure PaaS stack** — see
> [../../CURRENT_STATUS.md](../../CURRENT_STATUS.md) and
> [../architecture/live-environment.md](../architecture/live-environment.md). Read these as prior-era
> context: **domain/EVA/provider rules remain authoritative; the platform mechanism is historical.**
> ("Dataverse schema applied live in Dev" etc. describe the prior era, not the current system.)

Planning + activation documents for **collisionspike** (originally the M1 case-intake spike for Collision
Engineers on Power Apps Code App + Dataverse + Power Automate + Azure Functions). Each plan is **read-only
research/planning** unless its own header says otherwise: the binding rule is **build offline, gated-OFF;
the operator activates** (memory `live-services-boundary`). Canonical context lives in
[../../ROADMAP.md](../../ROADMAP.md), [../../CURRENT_STATUS.md](../../CURRENT_STATUS.md),
[../../DEPLOY-RUNBOOK.md](../../DEPLOY-RUNBOOK.md), [../gated.md](../gated.md),
[../../AGENTS.md](../../AGENTS.md),
[../architecture/live-environment.md](../architecture/live-environment.md), and the ADRs.

Last updated **2026-06-25**.

## How this folder is organised

Plans are grouped into **one folder per ROADMAP phase**. Each phase folder has a **`README.md`** with
the phase goal, current status, and an **ordered implementation checklist**. Larger phases group their
plans into **feature subfolders** (e.g. Phase 1 → `parser/`, `code-app/`, `corpus/`); smaller phases
keep their plans at the phase-folder root. One cross-phase umbrella
([m2-umbrella-enrichment-to-scale.md](./m2-umbrella-enrichment-to-scale.md), the M2 dependency graph
spanning phases 3–5) sits at this folder's root because it belongs to no single phase.

> **Taxonomy — two axes.** **Phases** (ROADMAP 0–6, with sub-letters 1a–1d, 1b.1–1b.3, 3a–3e, 4a–4b,
> 5a–5c) are the **work-breakdown** axis (where code lives / build order). **Milestones** (M0/M1/M2/M3)
> are **capability slices that cut across phases** — the authoritative Phase→Milestone map is
> **[milestone-model.md](./milestone-model.md)**. Do **not** equate a Phase with a Milestone: the retired
> "M2 = Phases 3–5" shorthand was the precise source of the M1/M2 overlap (e.g. Phase 3 holds M1 EVA
> drag-drop **and** M2 EVA-REST). The file once named `phase-2-implementation.md` was the M2 umbrella,
> **not** live activation — it is now `m2-umbrella-enrichment-to-scale.md` to remove the "Phase 2" collision.

```
docs/plans/
  README.md                          this index
  milestone-model.md                 the Phase × Milestone map (authoritative)
  m2-umbrella-enrichment-to-scale.md M2 dependency graph (cross-phase 3–5)
  phase-0-foundations/               + code-audit-cleanup (findings)
  phase-1-intake-and-case-tracking/  parser/ · code-app/ · corpus/ + bridge (phase-1-operational)
  phase-2-live-activation/           multi-inbox-access · multi-inbox-feasibility · image-storage-backends (+ DEPLOY-RUNBOOK §7)
  phase-3-enrichment-and-eva/        eva-sentry-rest-submission (3c) · eva-validation-function (3c-Fn) · enrichment-activation (3a) · box-archival-pipeline (3d)
  phase-4-address-and-chaser/        README (4a inspection-address: offline corpus + manual confirm, ADR-0013 · chaser 4b)
  phase-5-ocr-and-scale/             ocr-strategy (5a) · image-classification-ai (5b) · valuation-and-copilot (5c) · copilot-studio-setup (M3)
  phase-6-handoff/                   boundary evidence (points to DEPLOY-RUNBOOK §8)
  phase-7-box-integration/           README (B0–B4 waves) · box-custom-connector-and-webhook (BUILD spec) · box-integration-activation (operator runbook)
  phase-8-inbox-management/          README (email triage; deterministic MVP → query queue → gated LLM; ADR-0015 Proposed) · junk-backlog-and-activation-evidence (live junk-case findings + cleanup + activation trigger)
  phase-9-data-governance/           README (UK-GDPR retention/erasure/PII lifecycle; ADR-0017 Proposed)
  phase-ux-design-lab/               README (cross-cutting UX lab; 8+ throwaway HTML/React directions → judge → port winner to Fluent v9; 9 UI/UX agents)
(docs/research/whatsapp-coexistence.md — M3 research, outside this tree)
(docs/open-questions.md — consolidated decisions register, outside this tree)
```

> **`to-integrate-into-phases/` is a drop-zone — distil, then remove.** `to-integrate-into-phases/` holds
> **shorthand operator notes** awaiting distillation into the phase structure. The standing convention: a note
> is distilled into the relevant `plans/`, ADR, and `docs/`, then the **note stub is removed** from the
> drop-zone once distilled (any **data file** dropped alongside is **retained** where still referenced — e.g.
> `inspection-address-revamp/fullevaexportinspectionaddresses.xlsx`, kept for Phase 4a + Phase 9).
>
> **Integrated 2026-06-24.** Items distilled from the drop-zone into the phase structure: **Phase 8 —
> Inbox/Triage Management** (additive, like Phase 7; ADR-0015 _Proposed_) and the **Phase 4a inspection-address
> corpus revamp** from the 2-year EVA full-address export (ADR-0016 _Proposed_; **ADR-0013 stays binding — no
> runtime matcher**; the offline pipeline is **built 2026-06-24**, and the live `-Apply` replace **ran
> 2026-06-24** (backup-first; 2,035 live, 503 removed, 174 preserved)). The whole-repo review additionally surfaced **Phase 9 — Data Governance, Retention & Erasure**
> (ADR-0017 _Proposed_) as the biggest substantive gap. Their note stubs (`e-mail-management.md`,
> `inspection-address-revamp/README.md`) have been removed now that they are distilled; consolidated decisions
> live in [../open-questions.md](../open-questions.md).

> **Phase 7 — Box-centric intake pivot (ADR-0012).** Added 2026-06-22 as a later **additive** phase
> (folder at parse-confirm, File-Request image chasers, webhook intake; **Dataverse-authoritative,
> one-way Box mirror**). Its **authoritative build order + cross-section reconciliations** live in
> [`docs/HISTORICAL/box-integration-pivot/plans/00-BUILD-PLAN.md`](../HISTORICAL/box-integration-pivot/plans/00-BUILD-PLAN.md)
> (which **wins over** the six section plans 01–06); the phase folder here is the in-tree spine. Status:
> **the Phase-7 Box Dataverse schema + `cr1bd_BOX_*` env-vars are APPLIED LIVE in Dev (all `BOX_*` gates
> OFF); the `box-webhook` Function is DEPLOYED to `rg-collisionspike-dev` (`cespkbox-fn-v76a47`, 9 functions,
> Gate-C-verified on the deployed host) but runs gated OFF and secret-free; the `cr1bd_box_rest` connector
> and the Box flows remain authored offline (`state=off`), not deployed/bound** — plus free-account REST-tested.

## Plans (one line each: purpose · ROADMAP item)

| Plan | Purpose | ROADMAP item |
|---|---|---|
| [phase-0-foundations/phase-0-foundations-orchestrated-build.md](./phase-0-foundations/phase-0-foundations-orchestrated-build.md) | Orchestrated multi-agent build of the foundations (Code App scaffold, typed contracts, Dataverse schema-as-code, env-var gates, offline gate). **Executed.** | **Phase 0** (Foundations) |
| [phase-0-foundations/code-audit-cleanup.md](./phase-0-foundations/code-audit-cleanup.md) | Read-only audit of `mockup-app/`, `functions/`, `flows/`, `dataverse/.build/` with prioritised fixes (committed function key, dead `fetch()` path, bundled mock case data, SDK bootstrap). _Findings._ | **Phase 0/6** (boundary hygiene + quality) |
| [phase-1-…/phase-1-intake-and-case-tracking-implementation.md](./phase-1-intake-and-case-tracking/phase-1-intake-and-case-tracking-implementation.md) | Authors + sequences the M1 vertical slice (parser Function, Dataverse schema, Code App, flows); re-implements `collisioncc` contracts, never calls them. | **Phase 1** (Intake & Case Tracking, M1) |
| [phase-1-…/phase-1-operational.md](./phase-1-intake-and-case-tracking/phase-1-operational.md) | Gap analysis + dependency-ordered activation checklist to take the pipeline from "email → bare Case" to `ready_for_eva`; the three structural wiring fixes. _Bridge 1→2._ | **Phase 1 / 1d** (flows operational) + **Phase 2** |
| [phase-1-…/parser/fix-parser-and-provider-match.md](./phase-1-intake-and-case-tracking/parser/fix-parser-and-provider-match.md) | Two separable fixes: route Code App manual-intake parse through the CE Parser connector (CSP), and anchor the intake provider-domain match. | **Phase 1a/1c/1d** |
| [phase-1-…/code-app/ui-redesign.md](./phase-1-intake-and-case-tracking/code-app/ui-redesign.md) | Code App (`mockup-app/`) UI/UX redesign applying `frontend-design` + the Collision Engineers brand; plain React + Fluent v9, no new deps. | **Phase 1c** (Code App polish) |
| [phase-1-…/code-app/logo-fix-findings.md](./phase-1-intake-and-case-tracking/code-app/logo-fix-findings.md) | Live root-cause of the broken deployed logo (200 OK but undecodable PNG bytes on deploy). _Findings._ | **Phase 1c** (logo fix) |
| [phase-1-…/corpus/dataverse-corpus-incorporation.md](./phase-1-intake-and-case-tracking/corpus/dataverse-corpus-incorporation.md) | Idempotent upsert of the CONFIRMED provider-corpus analysis into Sandbox Dataverse (WorkProvider/Repairer/InspectionAddress/N:N); excludes stale data. | **Phase 1b.2** (corpus incorporation) |
| [phase-1-…/corpus/clarifying-info-ingestion.md](./phase-1-intake-and-case-tracking/corpus/clarifying-info-ingestion.md) | How the five operator clarifying worklists (code reconciliation, CONSIDER seeding, addresses→known-sites, garage↔provider coverage, intermediaries) flow into Dataverse. | **Phase 1b.3** (clarifying-info ingestion) |
| [phase-2-live-activation/multi-inbox-access.md](./phase-2-live-activation/multi-inbox-access.md) | Whether/how to add the other two of the three Outlook shared inboxes (shared-mailbox vs licensed-user, Full Access, the V2 trigger); password question answered. | **Phase 2** (scale to all three inboxes) |
| [m2-umbrella-enrichment-to-scale.md](./m2-umbrella-enrichment-to-scale.md) | The M2 dependency graph + sub-phase runbook (ENRICHMENT activation, EVA validation surface, EVA Sentry REST, Box finalisation, image AI, chaser-send, valuation) — the umbrella the §3/§4/§5 deep-dive plans sit under. | **Phase 3 + 4 + 5** (M2 umbrella) |
| [phase-3-enrichment-and-eva/eva-sentry-rest-submission.md](./phase-3-enrichment-and-eva/eva-sentry-rest-submission.md) | Activation runbook for the **already-built** `functions/evasentry/` Sentry REST v1.2 submit path: token-lives-in-Function, deploy→bind→test-flip→**parity-gated prod cutover**; resolves the Impact-Image open question. | **Phase 3c** (EVA Sentry REST API) |
| [../architecture/inspection-address-corpus.md](../architecture/inspection-address-corpus.md) | The inspection-address model ([ADR-0013](../adr/0013-loc-export-artifact-no-runtime-address-matching.md)): `Loc` is an EVA-EXPORT artifact, **not** a runtime input — the full inspection address is derived **offline** from case history into a static, full-addresses-only suggestions corpus (`cr1bd_inspectionaddress`) → staff **manual** pick → "Image Based Assessment" with a reason. **No** runtime matcher; partials are a future-investigation backlog. | **Phase 4a** (inspection-address corpus) |
| [phase-5-ocr-and-scale/ocr-strategy.md](./phase-5-ocr-and-scale/ocr-strategy.md) | Two OCR needs, two engines: Tesseract-in-container for scanned PDFs (B-full) + `fast-alpr` for plate OCR (`registrationVisible`); one Azure Container App, two routes; DI Read fallback; rejects Image Analysis 4.0 (retires 2028). | **Phase 5a** (OCR host, "B-full") + the **M1 plate-OCR** half |
| [phase-5-ocr-and-scale/image-classification-ai.md](./phase-5-ocr-and-scale/image-classification-ai.md) | overview-vs-`damage_closeup` + person/reflection screening: **recommends Azure OpenAI/Foundry vision over AI Builder** (AI Builder credits sunset 2026-11-01); rejects Custom Vision (retires 2028); image-ordering UI; WhatsApp bulk import. | **Phase 5b** (image classification AI, ADR-0009 M2+) |
| [phase-5-ocr-and-scale/valuation-and-copilot.md](./phase-5-ocr-and-scale/valuation-and-copilot.md) | Staff-triggered valuation (direct-REST-wrapper Function → Companion PDF as `Evidence(kind=valuation)`, gated `VALUATION_ENABLED`) + optional Copilot Studio agent over Dataverse (gated `COPILOT_ENABLED`). | **Phase 5c** (Valuation & Copilot) |
| [milestone-model.md](./milestone-model.md) | **Authoritative** Phase×Milestone map (M0/M1/M2/M3 as capability slices) + entry/exit criteria + precedence; CLAUDE.md points here. | **cross-cutting** (taxonomy) |
| [phase-3-…/eva-validation-function.md](./phase-3-enrichment-and-eva/eva-validation-function.md) | The already-built `functions/evavalidation/` readiness Function (ports image-rules + case-status; one impl for flow ＝ Code App); connector + parity drift-gate + the `status-evaluate` repoint. | **Phase 3e/3c-Fn** (M2.B) |
| [phase-3-…/enrichment-activation.md](./phase-3-enrichment-and-eva/enrichment-activation.md) | Standalone DVSA/DVLA enrichment activation runbook (Entra consent, KV creds, gate flip in TEST) + contract verification + ADR-0006 mileage acceptance tests. | **Phase 3a** (M1) |
| [phase-3-…/box-archival-pipeline.md](./phase-3-enrichment-and-eva/box-archival-pipeline.md) | Full Box pipeline design + M2.D activation runbook; the S2 content-bind + the fictional-`CreateFolder` rewrite; UPPERCASE folder + EVA photo-order. **Reconciled DOWN to ADR-0012** (supersession banner). | **Phase 3d** (M2.D) → superseded by **Phase 7** |
| [phase-7-box-integration/README.md](./phase-7-box-integration/README.md) | Phase-7 goal + the B0–B4 wave checklist for the Box-centric intake pivot (folder at parse-confirm, File-Request chasers, webhook intake); the connection-ref PIN; the two-phase (free vs Business) live-test split. Defers build order to `box-integration-pivot/plans/00-BUILD-PLAN.md`. | **Phase 7** (Box pivot, ADR-0012) |
| [phase-7-…/box-custom-connector-and-webhook.md](./phase-7-box-integration/box-custom-connector-and-webhook.md) | The BUILD spec the azure section implements: the custom Box REST connector OpenAPI (`api_key` param), the CCG token-mint inside the Function, the `box-webhook` receiver, the FC1 bicep, and the `finalize-eva-box` rewrite contract. | **Phase 7 B0** |
| [phase-7-…/box-integration-activation.md](./phase-7-box-integration/box-integration-activation.md) | The operator runbook: Box Platform-app registration on a Business-or-higher tenant, the `BOX_*` gate-flip choreography, and the BUSINESS second test phase (CCG + File Requests + the `FILE.UPLOADED` live-test). | **Phase 7** (operator) |
| [phase-2-…/multi-inbox-feasibility.md](./phase-2-live-activation/multi-inbox-feasibility.md) | **Investigate-only** feasibility companion to `multi-inbox-access` for the other two inboxes (V2/V3 trigger, webhook re-arm, dedup). Do **not** proceed. | **Phase 2** (operator) |
| [phase-2-…/image-storage-backends.md](./phase-2-live-activation/image-storage-backends.md) | Swappable, env-var-gated images-only storage abstraction (Azure Blob / SharePoint / local SMB / File Sync) + ready-to-enable connection-ref scaffolds. | **Phase 2** (M1 storage) |
| [phase-5-…/copilot-studio-setup.md](./phase-5-ocr-and-scale/copilot-studio-setup.md) | M3 Copilot Studio staff-assistant grounded on Dataverse (gate `COPILOT_ENABLED`): pre-reqs, grounding model, Code-App seam, use-cases. | **Phase 5c** (M3) |
| [../research/whatsapp-coexistence.md](../research/whatsapp-coexistence.md) | M3 research + phased plan for WhatsApp coexistence (ACS Advanced Messaging; thread→Case correlation by VRM/phone; the hard tracking problems). | **Phase 5b** (M3, ADR-0003/0007) |
| [../architecture/architecture-audit-2026-06-20.md](../architecture/architecture-audit-2026-06-20.md) | Dated architecture-audit findings register (F1–F11) across Functions/IaC/Dataverse/flows/connectors/Code App, each CLAUDE-fixable vs operator. | **cross-cutting** (audit) |
| [phase-4-address-and-chaser/inspection-address-revamp.md](./phase-4-address-and-chaser/inspection-address-revamp.md) | Revamp the inspection-address **suggestion** corpus from the 2-year EVA full-address export (~17,737 rows); offline profile→provider-map→dedup→regenerate; helpers are offline-only. **ADR-0013 stays binding.** | **Phase 4a** (ADR-0016 _Proposed_) |
| [phase-8-inbox-management/README.md](./phase-8-inbox-management/README.md) | Classify **every** inbox email into the operator taxonomy (receiving-work / query / other); deterministic `/classify-email` MVP + `cr1bd_inboundemail` triage table → query-queue UI → gated LLM. | **Phase 8** (ADR-0015 _Proposed_) |
| [phase-8-…/junk-backlog-and-activation-evidence.md](./phase-8-inbox-management/junk-backlog-and-activation-evidence.md) | Live evidence (2026-06-25) that `digital@` is the team's working inbox cased by `fetchOnlyWithAttachment=false` → 50 blank junk Cases; the blank-guarded cleanup runbook; and why content-based triage keeps test extraction working (`new_client_work`). _Findings + activation trigger._ | **Phase 8** (ADR-0015 _Proposed_) |
| [phase-9-data-governance/README.md](./phase-9-data-governance/README.md) | UK-GDPR retention/erasure/PII lifecycle across Dataverse + Blob + Box; two competing clocks (minimisation vs litigation hold); DSAR runbook + DPIA + AI-data-protection gate. | **Phase 9** (ADR-0017 _Proposed_) |
| [phase-ux-design-lab/README.md](./phase-ux-design-lab/README.md) | Cross-cutting UX lab: explore 8+ **throwaway** HTML/React UI directions covering the whole product (main-page inbox cockpit + queues + all Phase 1–9 features), judge them, converge, then **port the winner to the Fluent v9 Code App**. Run by a dynamic **ultracode** workflow over 9 new UI/UX subagents. | **cross-cutting** (UI/UX) |
| [../open-questions.md](../open-questions.md) | Consolidated **decisions** register (distinct from the operator-action registry gated.md) for Phases 4a/8/9 + cross-cutting + doc-hygiene. | **cross-cutting** (decisions) |

## Per-phase READMEs & loose plans

Each phase folder's **`README.md`** carries that phase's goal, current status, and ordered build
checklist:
[phase-0](./phase-0-foundations/README.md) ·
[phase-1](./phase-1-intake-and-case-tracking/README.md) ·
[phase-2](./phase-2-live-activation/README.md) ·
[phase-3](./phase-3-enrichment-and-eva/README.md) ·
[phase-4](./phase-4-address-and-chaser/README.md) ·
[phase-5](./phase-5-ocr-and-scale/README.md) ·
[phase-6](./phase-6-handoff/README.md) ·
[phase-7](./phase-7-box-integration/README.md) ·
[phase-8](./phase-8-inbox-management/README.md) ·
[phase-9](./phase-9-data-governance/README.md) ·
[phase-ux-design-lab](./phase-ux-design-lab/README.md).

Loose / cross-cutting plans and runbooks under this tree:

- [phase-4-address-and-chaser/location-suggest-v1-BUILD.md](./phase-4-address-and-chaser/location-suggest-v1-BUILD.md) — Phase 4a live location-suggestion assist (helper #3): v1 BUILD report + activation runbook.
- [phase-8-inbox-management/intake-restructure-notes.md](./phase-8-inbox-management/intake-restructure-notes.md) — operator reconcile-up-to-live note for the Phase 8 intake restructure (slice A).
- [phase-ux-design-lab/design-brief.md](./phase-ux-design-lab/design-brief.md) — the UX Design Lab **shared design brief + rubric** (Stage A); the real index for the `directions*/` exploration files.
- [phases-1-7-sweep-report.md](./phases-1-7-sweep-report.md) — the consolidated Phases 1–7 SDLC sweep report.
- [user-accounts-and-permissions.md](./user-accounts-and-permissions.md) — plan for staff user accounts & permission levels (personas).
- [runbooks/box-business-test.md](./runbooks/box-business-test.md) — runbook for the Box Business-account test against the test folder.
- [runbooks/live-email-linking.md](./runbooks/live-email-linking.md) — runbook for live email linking (`digital@` → all three shared inboxes).

## ROADMAP coverage check (every phase/feature has a plan)

| ROADMAP phase / feature | Plan(s) |
|---|---|
| **Phase 0** — Foundations | phase-0-foundations-orchestrated-build; code-audit-cleanup |
| **Phase 1a** — Parser | phase-1-intake-and-case-tracking-implementation; parser/fix-parser-and-provider-match |
| **Phase 1b** — Dataverse schema | phase-1-intake-and-case-tracking-implementation |
| **Phase 1c** — Code App (live) | phase-1-operational; code-app/ui-redesign; code-app/logo-fix-findings; parser/fix-parser-and-provider-match |
| **Phase 1d** — Flows (imported OFF) | phase-1-operational; parser/fix-parser-and-provider-match |
| **Phase 1b.1** — Initial seed + analysis | _(done; analysis under `raw/principalandrepairersheets/outputs/`)_ |
| **Phase 1b.2** — Corpus incorporation | corpus/dataverse-corpus-incorporation |
| **Phase 1b.3** — Clarifying-info ingestion | corpus/clarifying-info-ingestion |
| **Phase 2** — Live activation (operator) | phase-1-operational; multi-inbox-access; **multi-inbox-feasibility**; **image-storage-backends** (+ DEPLOY-RUNBOOK §7) |
| **Phase 3a** — Enrichment (DVSA/DVLA) — **M1** | **enrichment-activation**; m2-umbrella §5 |
| **Phase 3b** — EVA JSON drag-drop — **M1** | contracts already built (`mockup-app`); milestone-model |
| **Phase 3c** — EVA Sentry REST API — **M2** | **eva-sentry-rest-submission** |
| **Phase 3c-Fn** — EVA-validation Function — **M2** | **eva-validation-function** (M2.B) |
| **Phase 3d** — Box archival — **M2** | **box-archival-pipeline**; m2-umbrella §8 |
| **Phase 3e** — EVA readiness gate — **M1** | phase-1-operational; eva-validation-function |
| **Phase 4a** — Inspection address (offline corpus + manual confirm) — **M1** | **inspection-address-corpus** (architecture); ADR-0013 — no runtime matcher |
| **Phase 4b** — Chaser automation | m2-umbrella §10 (M2.F) |
| **Phase 5a** — OCR ("B-full") | ocr-strategy (plate-OCR=M1, scanned-PDF host) |
| **Phase 5b** — Image classification AI — **M2** | **image-classification-ai**; research/whatsapp-coexistence (WhatsApp=M3) |
| **Phase 5c** — Valuation & Copilot — **M3** | **valuation-and-copilot**; **copilot-studio-setup** |
| **Phase 6** — Boundary evidence & handoff | code-audit-cleanup (+ `verify-all.mjs` gates; operator evidence in DEPLOY-RUNBOOK) |
| **Phase 7** — Box-centric intake pivot (ADR-0012) | phase-7-box-integration/README; box-custom-connector-and-webhook; box-integration-activation (+ the authoritative `box-integration-pivot/plans/00-BUILD-PLAN.md`) |
| **Phase 4a (revamp)** — Inspection-address corpus from EVA export (ADR-0016 _Proposed_) | phase-4-address-and-chaser/inspection-address-revamp |
| **Phase 8** — Inbox/Triage Management (ADR-0015 _Proposed_) | phase-8-inbox-management/README |
| **Phase 9** — Data Governance, Retention & Erasure (ADR-0017 _Proposed_) | phase-9-data-governance/README |

**Status:** every ROADMAP phase/feature has at least one plan, and (2026-06-20) **3a, 3c-Fn, 3d** were
promoted to **dedicated** plans (enrichment-activation, eva-validation-function, box-archival-pipeline);
only **4b** still relies on the **m2-umbrella** sub-phase runbook. §3c/§4a/§5a/§5b/§5c keep their
deep-dives. Milestone tags follow **[milestone-model.md](./milestone-model.md)** (valuation reconciled to
**M3**). The only items intentionally **without** a standalone plan are the **already-done**
Phase-1b.1 seed/analysis (lives in `raw/.../outputs/`) and the pure operator-activation checklists that
live in **DEPLOY-RUNBOOK.md** + [../gated.md](../gated.md) rather than here. Per-phase status and the
ordered build checklist live in each phase folder's `README.md`; everything needing the operator is
consolidated in [../gated.md](../gated.md).

**Deferred research — no phase plan yet:** the **API intake channel** (allow providers to POST work directly to an HTTP endpoint, bypassing email) is recorded in the ROADMAP "Later" section and in [../architecture/integrations.md](../architecture/integrations.md). A phase plan will be authored once the operator confirms scope (auth model, payload contract, provider onboarding).
