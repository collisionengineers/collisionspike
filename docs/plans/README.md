# `docs/plans/` — index

Planning + activation documents for **collisionspike** (the M1 case-intake spike for Collision Engineers
on Power Apps Code App + Dataverse + Power Automate + Azure Functions). Each plan is **read-only
research/planning** unless its own header says otherwise: the binding rule is **build offline, gated-OFF;
the operator activates** (memory `live-services-boundary`). Canonical context lives in
[../../ROADMAP.md](../../ROADMAP.md), [../../CURRENT_STATUS.md](../../CURRENT_STATUS.md),
[../../DEPLOY-RUNBOOK.md](../../DEPLOY-RUNBOOK.md), [../gated.md](../gated.md),
[../../AGENTS.md](../../AGENTS.md),
[../architecture/live-environment.md](../architecture/live-environment.md), and the ADRs.

Last updated **2026-06-19**.

## How this folder is organised

Plans are grouped into **one folder per ROADMAP phase**. Each phase folder has a **`README.md`** with
the phase goal, current status, and an **ordered implementation checklist**. Larger phases group their
plans into **feature subfolders** (e.g. Phase 1 → `parser/`, `code-app/`, `corpus/`); smaller phases
keep their plans at the phase-folder root. One cross-phase umbrella
([m2-umbrella-enrichment-to-scale.md](./m2-umbrella-enrichment-to-scale.md), the M2 dependency graph
spanning phases 3–5) sits at this folder's root because it belongs to no single phase.

> **Taxonomy.** The canonical phase numbering is **ROADMAP Phase 0–6** (with sub-letters 1a–1d,
> 1b.1–1b.3, 3a–3e, 4a–4b, 5a–5c). "M1" = Phase 1; "M2" = Phases 3–5. The file once named
> `phase-2-implementation.md` was the M2 umbrella, **not** live activation — it is now
> `m2-umbrella-enrichment-to-scale.md` to remove the "Phase 2" collision.

```
docs/plans/
  README.md                          this index
  m2-umbrella-enrichment-to-scale.md M2 dependency graph (cross-phase 3–5)
  phase-0-foundations/               + code-audit-cleanup (findings)
  phase-1-intake-and-case-tracking/  parser/ · code-app/ · corpus/ + bridge (phase-1-operational)
  phase-2-live-activation/           multi-inbox-access (+ DEPLOY-RUNBOOK §7)
  phase-3-enrichment-and-eva/        eva-sentry-rest-submission (3c)
  phase-4-address-and-chaser/        inspection-address-matching (4a)
  phase-5-ocr-and-scale/             ocr-strategy (5a) · image-classification-ai (5b) · valuation-and-copilot (5c)
  phase-6-handoff/                   boundary evidence (points to DEPLOY-RUNBOOK §8)
```

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
| [phase-4-address-and-chaser/inspection-address-matching.md](./phase-4-address-and-chaser/inspection-address-matching.md) | The matcher service: part-postcode `Loc` → linked corpus yard via `district startswith(outwardCode)` → `InspectionAddress` → EVA field 9; postcode.io now (`AZURE_MAPS_ENABLED=false`), Azure Maps later. Pure helpers already built in `functions/addressmatch/`. | **Phase 4a** (inspection-address matching) |
| [phase-5-ocr-and-scale/ocr-strategy.md](./phase-5-ocr-and-scale/ocr-strategy.md) | Two OCR needs, two engines: Tesseract-in-container for scanned PDFs (B-full) + `fast-alpr` for plate OCR (`registrationVisible`); one Azure Container App, two routes; DI Read fallback; rejects Image Analysis 4.0 (retires 2028). | **Phase 5a** (OCR host, "B-full") + the **M1 plate-OCR** half |
| [phase-5-ocr-and-scale/image-classification-ai.md](./phase-5-ocr-and-scale/image-classification-ai.md) | overview-vs-`damage_closeup` + person/reflection screening: **recommends Azure OpenAI/Foundry vision over AI Builder** (AI Builder credits sunset 2026-11-01); rejects Custom Vision (retires 2028); image-ordering UI; WhatsApp bulk import. | **Phase 5b** (image classification AI, ADR-0009 M2+) |
| [phase-5-ocr-and-scale/valuation-and-copilot.md](./phase-5-ocr-and-scale/valuation-and-copilot.md) | Staff-triggered valuation (direct-REST-wrapper Function → Companion PDF as `Evidence(kind=valuation)`, gated `VALUATION_ENABLED`) + optional Copilot Studio agent over Dataverse (gated `COPILOT_ENABLED`). | **Phase 5c** (Valuation & Copilot) |

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
| **Phase 2** — Live activation (operator) | phase-1-operational; multi-inbox-access (+ DEPLOY-RUNBOOK §7) |
| **Phase 3a** — Enrichment (DVSA/DVLA) | m2-umbrella §5 (M2.A) |
| **Phase 3b** — EVA JSON drag-drop | m2-umbrella §8 (M2.D); contracts already built |
| **Phase 3c** — EVA Sentry REST API | **eva-sentry-rest-submission** |
| **Phase 3d** — Box archival | m2-umbrella §8 (M2.D) |
| **Phase 3e** — EVA readiness gate | phase-1-operational; m2-umbrella §6 (M2.B) |
| **Phase 4a** — Inspection-address matching | **inspection-address-matching** |
| **Phase 4b** — Chaser automation | m2-umbrella §10 (M2.F) |
| **Phase 5a** — OCR ("B-full") | ocr-strategy |
| **Phase 5b** — Image classification AI | **image-classification-ai** (+ ocr-strategy for the OCR half) |
| **Phase 5c** — Valuation & Copilot | **valuation-and-copilot** |
| **Phase 6** — Boundary evidence & handoff | code-audit-cleanup (+ `verify-all.mjs` gates; operator evidence in DEPLOY-RUNBOOK) |

**Status:** every ROADMAP phase/feature has at least one plan. Phases **3a/3b/3d/3e** and **4b** are
covered by the **m2-umbrella** (their sub-phase runbooks); §3c/§4a/§5a/§5b/§5c have **dedicated**
deep-dive plans. The only items intentionally **without** a standalone plan are the **already-done**
Phase-1b.1 seed/analysis (lives in `raw/.../outputs/`) and the pure operator-activation checklists that
live in **DEPLOY-RUNBOOK.md** + [../gated.md](../gated.md) rather than here. Per-phase status and the
ordered build checklist live in each phase folder's `README.md`; everything needing the operator is
consolidated in [../gated.md](../gated.md).
