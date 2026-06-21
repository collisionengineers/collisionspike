# Phase 3 — Enrichment & EVA Sentry

**Goal:** enrich a Case (DVSA/DVLA: make/model/mileage — **no VAT route**), export to EVA (JSON
drag-drop now; Sentry REST later), archive to Box, and drive the readiness gate.

> **Milestones in this phase** ([milestone-model](../milestone-model.md)): **3a** enrichment, **3b** EVA
> JSON drag-drop, **3e** readiness gate = **M1**; **3c** EVA Sentry REST, **3c-Fn** EVA-validation
> Function, **3d** Box archival = **M2**.

**Status:** enrichment Function **deployed gated-OFF**; EVA JSON serializer built; EVA Sentry REST
built (pytest 42/42, **deploy pending**); Box step built (off). See
[../../../ROADMAP.md](../../../ROADMAP.md) Phase 3 and the M2 graph
([../m2-umbrella-enrichment-to-scale.md](../m2-umbrella-enrichment-to-scale.md)).

## Implementation checklist (by feature)

**3a · Enrichment (DVSA/DVLA)**
1. [x] Function deployed **gated-OFF**; direct DVSA + DVLA (gateway retired, B1 obviated); connector + Bicep + mocked tests
2. [ ] 🔒 Inject DVSA/DVLA creds into Key Vault + set `DVSA_TENANT_ID`; register/consent the Entra app
3. [ ] 🔒 Flip `ENRICHMENT_ENABLED=true` in a **test** env; verify mileage (only when the doc lacks it — ADR-0006) + make/model

**3b · EVA — JSON drag-drop (M1 path)**
4. [x] 12-field JSON serializer (exact order, 6-line address, enums)
5. [ ] 🔒 Export + drag-drop into the EVA **test** environment; confirm acceptance

**3c · EVA — Sentry REST API (later)** — [eva-sentry-rest-submission.md](./eva-sentry-rest-submission.md)
6. [x] Sentry REST v1.2 submit path built (`functions/evasentry`, pytest 42/42)
7. [ ] Deploy the Function; [ ] 🔒 B5 EVA test creds → Key Vault + flip `EVA_API_ENABLED` in test; [ ] 🔒 prod cutover (parity-gated)

**3d · Box archival**
8. [x] `finalize-eva-box` builds the folder + photo-order step (imported off)
9. [ ] **soft:** fix the Box upload passing a path string instead of file content (see [../../gated.md](../../gated.md))
10. [ ] 🔒 Confirm Box honours the UPPERCASE Case/PO folder name; activate in unison with EVA submit

**3e · EVA readiness gate**
11. [x] Image-rules / readiness checklist in the Code App
12. [ ] 🔒 Drive readiness to green on a live Case; Address decision gate; confirm AuditEvent rows

## Plans in this phase

- [eva-sentry-rest-submission.md](./eva-sentry-rest-submission.md) — the 3c activation runbook.
- Cross-phase umbrella: [../m2-umbrella-enrichment-to-scale.md](../m2-umbrella-enrichment-to-scale.md) (§5 enrichment, §6 readiness, §8 EVA/Box).

## Needs the operator

Creds injection, Entra consent, gate flips, EVA test drag-drop, and Box activation are hard blockers;
the Box-content fix is a soft blocker. All in [../../gated.md](../../gated.md).
