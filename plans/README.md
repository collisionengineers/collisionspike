# `plans/` — index

Planning + activation documents for **collisionspike** (the M1 case-intake spike for Collision Engineers
on Power Apps Code App + Dataverse + Power Automate + Azure Functions). Each plan is **read-only
research/planning** unless its own header says otherwise: the binding rule is **build offline, gated-OFF;
the operator activates** (memory `live-services-boundary`). Canonical context lives in
[../ROADMAP.md](../ROADMAP.md), [../CURRENT_STATUS.md](../CURRENT_STATUS.md),
[../DEPLOY-RUNBOOK.md](../DEPLOY-RUNBOOK.md), [../AGENTS.md](../AGENTS.md),
[../docs/architecture/live-environment.md](../docs/architecture/live-environment.md), and the ADRs.

This index maps **every** plan to the ROADMAP item(s) it covers. Last updated **2026-06-19**.

## Plans (one line each: purpose · ROADMAP item)

| Plan | Purpose | ROADMAP item |
|---|---|---|
| [phase-0-foundations-orchestrated-build.md](./phase-0-foundations-orchestrated-build.md) | Orchestrated multi-agent build of the foundations (Code App scaffold, typed contracts, Dataverse schema-as-code, env-var gates, offline gate). **Executed.** | **Phase 0** (Foundations) |
| [phase-1-intake-and-case-tracking-implementation.md](./phase-1-intake-and-case-tracking-implementation.md) | Authors + sequences the M1 vertical slice (parser Function, Dataverse schema, Code App, flows); re-implements `collisioncc` contracts, never calls them. | **Phase 1** (Intake & Case Tracking, M1) |
| [phase-1-operational.md](./phase-1-operational.md) | Gap analysis + dependency-ordered activation checklist to take the pipeline from "email → bare Case" to `ready_for_eva`; the three structural wiring fixes. | **Phase 1 / 1d** (flows operational) + **Phase 2** (activation) |
| [fix-parser-and-provider-match.md](./fix-parser-and-provider-match.md) | Two separable fixes: route Code App manual-intake parse through the CE Parser connector (CSP), and anchor the intake provider-domain match. | **Phase 1a/1c/1d** (parser connector + provider-match) |
| [multi-inbox-access.md](./multi-inbox-access.md) | Whether/how to add the other two of the three Outlook shared inboxes (shared-mailbox vs licensed-user, Full Access, the V2 trigger); password question answered. | **Phase 2** (scale to all three inboxes) |
| [dataverse-corpus-incorporation.md](./dataverse-corpus-incorporation.md) | Idempotent upsert of the CONFIRMED provider-corpus analysis into Sandbox Dataverse (WorkProvider/Repairer/InspectionAddress/N:N); excludes stale data. | **Phase 1b.2** (corpus incorporation) |
| [clarifying-info-ingestion.md](./clarifying-info-ingestion.md) | How the five operator clarifying worklists (code reconciliation, CONSIDER seeding, addresses→known-sites, garage↔provider coverage, intermediaries) flow into Dataverse. | **Phase 1b.3** (clarifying-info ingestion) |
| [eva-sentry-rest-submission.md](./eva-sentry-rest-submission.md) | Activation runbook for the **already-built** `functions/evasentry/` Sentry REST v1.2 submit path: token-lives-in-Function (custom connectors can't do client-credentials), deploy→bind→test-flip→**parity-gated prod cutover**; resolves the Impact-Image open question. | **Phase 3c** (EVA Sentry REST API) |
| [inspection-address-matching.md](./inspection-address-matching.md) | The matcher service: part-postcode `Loc` → linked corpus yard via `district startswith(outwardCode)` → `InspectionAddress` → EVA field 9; postcode.io now (`AZURE_MAPS_ENABLED=false`), Azure Maps later. Pure helpers already built in `functions/addressmatch/`. | **Phase 4a** (inspection-address matching) |
| [ocr-strategy.md](./ocr-strategy.md) | Two OCR needs, two engines: Tesseract-in-container for scanned PDFs (B-full) + `fast-alpr` for plate OCR (`registrationVisible`); one Azure Container App, two routes; DI Read fallback; rejects Image Analysis 4.0 (retires 2028). | **Phase 5a** (OCR host, "B-full") + the **M1 plate-OCR** half |
| [image-classification-ai.md](./image-classification-ai.md) | overview-vs-`damage_closeup` + person/reflection screening: **recommends Azure OpenAI/Foundry vision over AI Builder** (AI Builder credits sunset 2026-11-01); rejects Custom Vision (retires 2028); image-ordering UI; WhatsApp bulk import. | **Phase 5b** (image classification AI, ADR-0009 M2+) |
| [valuation-and-copilot.md](./valuation-and-copilot.md) | Staff-triggered valuation (direct-REST-wrapper Function → Companion PDF as `Evidence(kind=valuation)`, gated `VALUATION_ENABLED`) + optional Copilot Studio agent over Dataverse (gated `COPILOT_ENABLED`, requires Dataverse search + Entra auth). | **Phase 5c** (Valuation & Copilot) |
| [phase-2-implementation.md](./phase-2-implementation.md) | The M2 dependency graph + sub-phase runbook (ENRICHMENT activation, EVA validation surface, EVA Sentry REST, Box finalisation, image AI, chaser-send, valuation) — the umbrella the §3/§4/§5 deep-dive plans sit under. | **Phase 3 + 4 + 5** (M2 umbrella) |
| [ui-redesign.md](./ui-redesign.md) | Code App (`mockup-app/`) UI/UX redesign applying `frontend-design` + the Collision Engineers brand; plain React + Fluent v9, no new deps. | **Phase 1c** (Code App polish) |
| [logo-fix-findings.md](./logo-fix-findings.md) | Live root-cause of the broken deployed logo (200 OK but undecodable PNG bytes on deploy). | **Phase 1c** (logo fix) |
| [code-audit-cleanup.md](./code-audit-cleanup.md) | Read-only audit of `mockup-app/`, `functions/`, `flows/`, `dataverse/.build/` with prioritised fixes (committed function key, dead `fetch()` path, bundled mock case data, SDK bootstrap). | **Phase 0/6** (boundary hygiene + quality) |

## ROADMAP coverage check (every phase/feature has a plan)

| ROADMAP phase / feature | Plan(s) |
|---|---|
| **Phase 0** — Foundations | phase-0-foundations-orchestrated-build; code-audit-cleanup |
| **Phase 1a** — Parser | phase-1-intake-and-case-tracking-implementation; fix-parser-and-provider-match |
| **Phase 1b** — Dataverse schema | phase-1-intake-and-case-tracking-implementation |
| **Phase 1c** — Code App (live) | phase-1-operational; ui-redesign; logo-fix-findings; fix-parser-and-provider-match |
| **Phase 1d** — Flows (imported OFF) | phase-1-operational; fix-parser-and-provider-match |
| **Phase 1b.1** — Initial seed + analysis | _(done; analysis under `raw/principalandrepairersheets/outputs/`)_ |
| **Phase 1b.2** — Corpus incorporation | dataverse-corpus-incorporation |
| **Phase 1b.3** — Clarifying-info ingestion | clarifying-info-ingestion |
| **Phase 2** — Live activation (operator) | phase-1-operational; multi-inbox-access (+ DEPLOY-RUNBOOK §7) |
| **Phase 3a** — Enrichment (DVSA/DVLA) | phase-2-implementation §5 (M2.A) |
| **Phase 3b** — EVA JSON drag-drop | phase-2-implementation §8 (M2.D); contracts already built |
| **Phase 3c** — EVA Sentry REST API | **eva-sentry-rest-submission** |
| **Phase 3d** — Box archival | phase-2-implementation §8 (M2.D) |
| **Phase 3e** — EVA readiness gate | phase-1-operational; phase-2-implementation §6 (M2.B) |
| **Phase 4a** — Inspection-address matching | **inspection-address-matching** |
| **Phase 4b** — Chaser automation | phase-2-implementation §10 (M2.F) |
| **Phase 5a** — OCR ("B-full") | ocr-strategy |
| **Phase 5b** — Image classification AI | **image-classification-ai** (+ ocr-strategy for the OCR half) |
| **Phase 5c** — Valuation & Copilot | **valuation-and-copilot** |
| **Phase 6** — Boundary evidence & handoff | code-audit-cleanup (+ `verify-all.mjs` gates; operator evidence in DEPLOY-RUNBOOK) |

**Status:** every ROADMAP phase/feature has at least one plan. Phases **3a/3b/3d/3e** and **4b** are
covered by the **phase-2-implementation** umbrella (their sub-phase runbooks); §3c/§4a/§5a/§5b/§5c have
**dedicated** deep-dive plans. The only items intentionally **without** a standalone plan are the
**already-done** Phase-1b.1 seed/analysis (lives in `raw/.../outputs/`) and the pure operator-activation
checklists that live in **DEPLOY-RUNBOOK.md** rather than `plans/`.
