# Data Protection — controller/processor map, lawful basis & retention

> **Status:** authored as the **controller-facing data-protection artefact** for Phase 9 (data
> governance). The **structure** is concrete and accurate to the codebase; the **legal
> determinations** (statutory retention period, the formal lawful-basis sign-off, ICO registration,
> DPIA sign-off) are **operator/legal input** and are marked **[RESERVED-FOR-USER]** or
> **[DEFERRED — PENDING LEGAL]** below. Claude does **not** invent legal determinations.
>
> **Binding decision:** [ADR-0017 — Data retention, erasure & PII lifecycle](../adr/0017-data-retention-erasure-pii-lifecycle.md)
> (**Proposed**). Phase plan: [docs/plans/phase-9-data-governance/README.md](../plans/phase-9-data-governance/README.md).
> Operator-blocker registry: [docs/gated.md](../gated.md).

This document records **who controls the data, who processes it, why we are allowed to process it,
how long we keep it, and how a data subject exercises their rights**. It is the artefact a regulator
(the ICO) expects for systematic, large-scale processing of third-party personal data. It does **not**
replace the DPIA itself — it is the map the DPIA is written from, and the DPIA sign-off is
[DEFERRED — PENDING LEGAL] (see [§7](#7-dpia--ico-registration-operatorlegal)).

---

## 1. What personal data the pipeline holds

The automated intake pipeline processes **third-party claimant PII** — the data subject is usually
**not** Collision Engineers' own customer but a claimant in a motor-insurance claim. Categories:

| Category | Examples | Where it lives |
|---|---|---|
| Identity | claimant name, insured name, third-party name | Dataverse (`cr1bd_case` overview-only + EVA fields) |
| Vehicle | VRM (registration), make/model/year | Dataverse; VRM also on **Box folder names** and image OCR |
| Location | inspection address, claimant home / storage-yard address, postcode | Dataverse (`InspectionAddress`); the suggestions corpus is separate (`cr1bd_inspectionaddress`) |
| Accident detail | circumstances of the incident, claim/policy references | Dataverse (EVA + overview-only fields) |
| Contact | claimant telephone, claimant email | Dataverse (parser-extracted) |
| Raw correspondence | the **`.eml`** (email body + headers) — **retained only when a Case is extracted** | Azure Blob (`evidence` container); copied to Box at finalize |
| Images | vehicle / damage photos (may incidentally show people / reflections) | Azure Blob bytes; mirrored to Box; only image blobs are purged today |

**Special-category note.** Vehicle-damage photos can **incidentally** capture identifiable people
(bystanders, reflections). The "reflection photo is unusable" exclusion rule (CLAUDE.md domain model)
is an operational rule, **not** a data-protection control — it removes the photo from EVA submission
but the byte may still transit Blob/Box. Whether any incidental capture amounts to special-category
data, and what control that requires, is **[DEFERRED — PENDING LEGAL]**.

> **`.eml` retention is conditional.** A raw `.eml` is retained **only when a Case is extracted** from
> the email (ROADMAP Phase 9). Email that produces no Case is not persisted as evidence. This is the
> narrowest-footprint position and should be recorded as such in the DPIA.

---

## 2. Controller / processor map

**Collision Engineers (CE) is the data controller.** CE determines the purposes and means of the
processing (case intake, parsing, enrichment, EVA submission, archival). Every external party below
acts **for** CE, on CE's instructions, or is an **independent controller** for its own statutory
purpose — named explicitly because a DPIA must enumerate recipients.

| Party | Role | Basis of the relationship | Notes |
|---|---|---|---|
| **Collision Engineers** | **Controller** | — | Determines purposes & means. Owns retention, erasure, rights handling. |
| **Box** | **Processor** | one-way mirror (ADR-0012): Dataverse → Box, write/retain-only | Box stores claimant PII (`.eml`, images, EVA JSON) and **PII-adjacent folder names** (Case/PO). A **processor under the one-way mirror** — CE controls; Box stores on CE's instruction. **Processor agreement / Box DPA must be in place** — **[RESERVED-FOR-USER]**. |
| **Microsoft Azure** (Blob, Functions, Key Vault) | **Processor** | hosts transient bytes + compute | Azure Blob holds `.eml` + image bytes; Functions process them transiently. Covered by the Microsoft DPA / Online Services Terms. Residency = UK South (`rg-collisionspike-dev`). |
| **Microsoft / Dataverse + Power Platform** | **Processor** | system of record + orchestration | Dataverse is the authoritative PII store. Microsoft processes on CE's instruction under the same DPA. |
| **Microsoft Azure OpenAI** (when any AI gate flips in production) | **Processor** | in-tenant model inference | Prefer **in-tenant Azure OpenAI, no external retain/train**; abuse-monitoring exemption to be sought (see [§6](#6-ai-data-protection)). **Production sign-off [DEFERRED]**; testing on repo data is authorised now. |
| **EVA / Minotaur Software** (the "Sentry" case system) | **Processor or independent controller** — **[DEFERRED — PENDING LEGAL]** | CE submits the completed case to EVA | EVA receives the full 12-field case incl. claimant identity + inspection address. Whether Minotaur is CE's processor or an independent controller for its own platform is a **legal determination** — record it; do not assume. |
| **DVSA** (MOT history API) | **Independent controller** for its own register | enrichment lookup at intake | **VRM-only outbound** — no claimant identity leaves the tenant (see [§4](#4-lawful-basis-table) and [§5](#5-outbound-data-minimisation-dvsadvla)). |
| **DVLA** (vehicle enquiry API) | **Independent controller** for its own register | enrichment lookup at intake | **VRM-only outbound.** DVLA data-use terms apply and must be confirmed — **[RESERVED-FOR-USER]**. |
| **postcode.io** | **Processor / utility** | postcode validation (UK-only) | Receives a **postcode**, not a full identity. Azure Maps (gated `AZURE_MAPS_ENABLED`) would be the equivalent if enabled. |

> Box being a **processor** (not a joint or independent controller) follows directly from the ADR-0012
> one-way-mirror design: **Dataverse stays the system of record; Box is written one-way and case logic
> never runs off Box.** Box stores at CE's instruction and is never the source of truth — the textbook
> processor posture.

---

## 3. Recipients summary (who PII flows out to)

- **EVA (Minotaur)** — receives the **full case**: claimant name, VRM, inspection address, accident
  circumstances, dates. The largest outbound PII flow. Currently the **JSON drag-drop** path (staff
  hand off the export); the Sentry REST path is gated (`EVA_API_ENABLED=false`).
- **DVSA / DVLA** — receive **VRM only** (see [§5](#5-outbound-data-minimisation-dvsadvla)).
- **Box** — receives a **mirror copy** of case evidence (one-way). Processor.
- **postcode.io / Azure Maps** — receive a **postcode** for normalisation.
- **Azure OpenAI** — would receive **pre-scrubbed** text/image clues **only** once an AI gate is signed
  off for production ([§6](#6-ai-data-protection)).

There is **no runtime flow to `collisioncc`** (reference build only) and **no flow to Audatex**
(out of scope).

---

## 4. Lawful-basis table

> **[DEFERRED — PENDING LEGAL]** — the entries below record the **intended** lawful basis for each
> processing activity in plain terms, drawn from the codebase's actual data flows. They are **not** a
> legal determination. The controller/DPO must confirm or correct each before any production reliance,
> and the confirmed basis must appear in the privacy notice. ADR-0017 items G3/G5.

| Processing activity | Gate | Intended lawful basis (UK GDPR Art. 6) | Data minimisation in effect | Sign-off |
|---|---|---|---|---|
| **Intake** — receive email, parse, create Case, store `.eml` + images | live (email intake on `digital@`) | Legitimate interest (CE's, and the work-provider's, interest in handling the instructed claim) **or** performance of CE's contract with the work provider | `.eml` retained **only when a Case is extracted**; overview-only fields must not drive workflow | **[RESERVED-FOR-USER]** |
| **Enrichment** — DVSA MOT + DVLA vehicle lookup | `ENRICHMENT_ENABLED` (live) | **Legitimate interest** | **VRM-only outbound** — no claimant identity leaves the tenant ([§5](#5-outbound-data-minimisation-dvsadvla)) | **[RESERVED-FOR-USER]** |
| **EVA submission** — submit the completed case to the work-provider's case system | `EVA_API_ENABLED` (REST gated); drag-drop live | Performance of contract / legitimate interest (the case is **instructed** work) | Only the 12 contract fields submitted | **[RESERVED-FOR-USER]** |
| **Valuation** — on-demand valuation evidence (comparables / advert capture) | `VALUATION_ENABLED` (off) | To be recorded **before the gate is ever flipped** — likely legitimate interest | Staff-triggered (total-loss / disputed only); records the basis at activation | **[RESERVED-FOR-USER]** ([§5a](#5a-valuation-record-before-valuation_enabled)) |
| **AI assist** — LLM email triage / vision / geocode | `EMAIL_AI` / vision gates (off) | Legitimate interest, conditional on the AI prerequisite | PII **pre-scrub** before any model call; in-tenant Azure OpenAI ([§6](#6-ai-data-protection)) | **production [DEFERRED]; testing authorised now (G5)** |

---

## 5. Outbound data-minimisation (DVSA/DVLA)

The **DVSA MOT history** and **DVLA vehicle enquiry** enrichment lookups are **VRM-only outbound**:
the enrichment Azure Function (`cespkenrich-fn-…`) sends the **registration mark and nothing else** —
**no claimant name, no address, no claim/policy reference, no `.eml`** leaves the tenant on the
enrichment path. The recorded lawful basis is **legitimate interest**: CE has a legitimate interest in
establishing accurate vehicle facts (mileage, make/model/tax) for an instructed engineering
assessment, and a VRM lookup against a public register is a proportionate, low-impact means.

- A VRM is personal data when linked to an individual, but on the outbound call it travels **alone** —
  DVSA/DVLA cannot tie it to the claimant from what CE sends; they resolve it against their **own**
  register as **independent controllers**.
- **DVLA data-use terms** govern what CE may do with the returned vehicle data; the operator must
  confirm CE's registration/terms with DVLA — **[RESERVED-FOR-USER]** (ADR-0017 item G3, gated.md).
- The DVSA `current_mileage_estimate` runs **only when the document has no mileage** (ADR-0006) — a
  further minimisation: the lookup is skipped when the authoritative instruction already supplies it.

### 5a. Valuation — record before `VALUATION_ENABLED`

The valuation path (`valuationbot` → comparables + advert capture, gated `VALUATION_ENABLED`, default
off, M2/M3) is **staff-triggered** for total-loss / disputed cases and attaches a Companion-Report PDF
as Evidence. Its outbound footprint (what vehicle/market identifiers leave the tenant to comparable
sources) and its **lawful basis must be recorded before the gate is ever flipped** — likely legitimate
interest, but **[RESERVED-FOR-USER]**. Today the gate is off and no valuation processing occurs, so
this is a precondition, not a live gap.

---

## 6. AI data protection

> **ADR-0017 item G5 — the split decision.** The **production** data-protection sign-off for sending
> claimant PII to a model is **[DEFERRED — PENDING LEGAL]**, **but the operator holds FULL AUTHORITY
> to run AI testing on all repo data now** (dev). The deferral is on the **production** flip, not on
> development-time testing. This unblocks the Phase-8 LLM email classifier and the Phase-4a
> vision/geocode work for **build + test now (dev), gated off**.

The **production** preconditions before `EMAIL_AI` (Phase 8c), Box-AI, or vision
(Phase 5b / 4a v2) may flip on **live**, per gate:

1. **PII pre-scrub** of any text/image sent to a model — send only the minimum needed (e.g. ≤3–4
   photos and the required text clues), never a full case dump. Plates are intrinsic to the image and
   must be noted in the DPIA.
2. **Prefer in-tenant Azure OpenAI** (not public OpenAI), with **no external retain / no train** and
   **regional deployment** (UK / EU data zone). Azure OpenAI's default abuse-monitoring retains
   prompts up to 30 days — apply for the Limited Access **no-human-review / no-retention** exemption
   for PII images, or document acceptance.
3. **A `[RESERVED-FOR-USER]` sign-off per gate** before that specific model flow goes live.

The highest-sensitivity flow is the Phase-4a GPT-4o vision escalation (sends vehicle photos +
plates) — see [gpt4o-reasoning-escalation.md §7](../plans/phase-4-address-and-chaser/gpt4o-reasoning-escalation.md).
**No new persistent PII store** is created by AI: Box already holds the photo bytes (one-way mirror);
AI reads them transiently.

### 6a. Per-gate production sign-off — LOG

| Date | Gate(s) | Sign-off | Notes / residual risk |
|---|---|---|---|
| **2026-07-08** | **`AI_ASSIST_ENABLED`** (TKT-015 `ai_suggestion` generate/review + CaseDetail panel) · **`IMAGE_ANALYSIS_ENABLED`** (TKT-016 staged image-analysis producer) | **Operator (digital@collisionengineers.co.uk) confirmed the DPIA + accepted the `gpt-5` GlobalStandard processing/data-residency posture (NOT a UK-processing guarantee) and authorised the production flip**, recorded via the `/ticket-orchestrate` go-live. Both flipped `true` on `cespk-api-dev` same day. | Precondition 1 (PII pre-scrub): met for the **text** path (`scrubPii` before the AOAI call). The claimant address is **deliberately KEPT** as a scrubbed geolocation clue (feat/final-wave TKT-132; **operator-adjudicated at PR46 review 2026-07-09: keep it, accept the DPIA posture**) — the Codex P1 that `scrubPii` is precision-over-recall and can miss a free-form address is an **accepted residual** under this sign-off, NOT fixed by dropping the field. The **image** path sends vehicle photos + plates that bypass `scrubPii` (precision-over-recall, text-only) — this is the highest-sensitivity flow and is **within the operator's sign-off**. Precondition 2 (residency): the model is **`gpt-5` GlobalStandard** (verified live: `sku: GlobalStandard`) — inference may process **outside the UK** (at-rest stays uksouth; no UK data zone exists) — the operator **accepted this residency posture**; the earlier "UK data-residency sign-off" label was a misnomer (PR46 review) since GlobalStandard cannot guarantee UK processing. Precondition 3 (per-gate sign-off): satisfied by this attestation. **Suggestion-only** — no autonomous mutation; a human accepts every promotion. **[TO FILE]** the formal DPIA document reference for this attestation. |

> **Standing note:** the formal DPIA **document** itself is still tracked as [DEFERRED — PENDING LEGAL] in
> [§7](#7-dpia--ico-registration-operatorlegal); §6a records the operator's **per-gate production
> attestation** that authorised these two flips. The operator should file the DPIA document reference above.
>
> **Scope note (2026-07-09, TKT-132):** the `AI_ASSIST_ENABLED` suggestion-generate flow's text
> inputs were widened beyond accident circumstances + claimant address to: instruction email
> subject/body-preview (scrubbed), case overview facts (Case/PO, provider, claim type, insurer,
> repairer, loss/instruction dates), vehicle model + mileage, and value-free photo-stamp counts
> (never image bytes). Personal-name overview columns and claim/policy references are deliberately
> withheld. Assessed as **within** the 2026-07-08 attestation (same gate, same `scrubPii`
> pre-scrub, same suggestion-only posture, same deployment/residency; lower sensitivity than the
> already-signed classes). Recorded in TKT-132's changes.md; the operator may re-scope at the next
> review if they read the attestation more narrowly.

---

## 7. DPIA & ICO registration (operator/legal)

- **DPIA sign-off** — a DPIA is effectively mandatory for systematic, large-scale processing of
  third-party PII. This document is the controller-facing map the DPIA is built from; the **DPIA
  itself, and its sign-off, are [DEFERRED — PENDING LEGAL]**.
- **ICO registration** — CE's registration with the ICO as a data controller must be confirmed
  (registration number recorded in the privacy notice) — **[RESERVED-FOR-USER]**.
- **DVLA data-use terms** — confirm CE's terms with DVLA for the vehicle-enquiry data —
  **[RESERVED-FOR-USER]** ([§5](#5-outbound-data-minimisation-dvsadvla)).
- **Processor agreements** — confirm the **Box DPA** and the Microsoft DPA cover the processing above
  — **[RESERVED-FOR-USER]**.

---

## 8. Retention — the two-clock model

> **The central tension (ADR-0017 / Phase-9 plan).** Retention here is **not a single number.** Two
> clocks pull in opposite directions and the design must model **both**.

1. **GDPR data-minimisation clock** — claimant PII must not be kept longer than necessary. Default to
   **expiry + deletion/anonymisation** once the case is closed and the window lapses.
2. **Litigation / evidential-hold clock** — an engineer's report can become **evidence in an insurance
   or court dispute years later.** A case under (or potentially under) dispute must be **exempt** from
   the minimisation purge.

So the model is **a default minimisation expiry _plus_ a legal-hold exemption flag** — never one
expiry value. The disposition flow purges on the minimisation clock **only when no hold is set.**

**Schema footprint (ADR-0017 items G1; planned, not built):** on `cr1bd_case` —

- `cr1bd_closedat` — when the case reached a terminal state (starts the minimisation clock).
- `cr1bd_retentionexpiresat` — computed from `closedat` + the policy window.
- a **legal-hold flag** (boolean + optional reason / `heldby`) — the litigation-clock exemption.

**Disposition (planned, gated):** a scheduled `case-disposition` flow (sibling to `box-blob-purge`),
for cases where `cr1bd_retentionexpiresat < now` **AND no legal hold**: purge any retained transient
Blob bytes, then **anonymise or hard-delete** the case + its Evidence PII per policy, auditing every
branch. Anonymise-vs-hard-delete is an operator policy choice.

| Value | Source | Status |
|---|---|---|
| **Statutory minimisation window length** | legal / business | **[RESERVED-FOR-USER]** — the single number that drives `cr1bd_retentionexpiresat`. ADR-0017 G1. |
| **Litigation-hold rule** (what triggers a hold, who sets/clears it) | legal / operator | **[RESERVED-FOR-USER]** — ADR-0017 G2. |
| **Anonymise vs hard-delete** on disposition | operator | **[RESERVED-FOR-USER]** — drives the disposition flow's terminal action. |

### 8a. The absolute Box principle

**NO AUTOMATED RETENTION OR DISPOSITION DELETION FROM BOX, EVER.** The only automated retention delete in the system is `box-blob-purge`,
which removes **transient Azure Blob image bytes that have already been archived to Box** — it
**never** deletes anything in Box itself. Box content is removed by a **human only**; no flow,
schedule, or disposition job deletes from Box (consistent with the ADR-0012 one-way mirror). This
holds even for a DSAR erasure — see the [cross-store erasure runbook](../plans/runbooks/dsar-erasure-cross-store.md).
The sole operational exception is TKT-160: a human explicitly confirms deletion of one named case
image, after which the server may remove only that persisted Box file ID under the exact case folder
and configured read-write root. It does not delete a folder, source document, sibling evidence, or run
from a schedule/disposition job; durable intent, audit and retry state are required first. See
[`delete-case-image.md`](../runbooks/delete-case-image.md).

### 8b. Store-hardening pre-step (before any purge is armed)

Before **any** purge flow is armed (ADR-0017 item G6; the broader hardening is deferred but two
definitions + one principle are fixed now):

- **Key Vault purge-protection** on the enrichment / EVA / Box vaults — blocks permanent secret
  deletion during the soft-delete window, so an accidental/malicious wipe is recoverable.
- **Azure Blob `evidence` container soft-delete + versioning** — recoverable deletes; the **hard
  pre-step before `box-blob-purge` (or any disposition purge) is armed**.

---

## 9. Data-subject rights — path summary

A data subject (typically the claimant) may exercise UK-GDPR rights: **access (DSAR), rectification,
erasure ("right to be forgotten"), restriction, objection, portability.** The **operational, repeatable
procedure** for locating, exporting and erasing a subject's data across all three stores is the
[DSAR / right-to-erasure cross-store runbook](../plans/runbooks/dsar-erasure-cross-store.md). In summary:

| Right | Where the data is | How it is satisfied |
|---|---|---|
| **Access (DSAR)** | Dataverse + Blob + Box | locate by Case/VRM/claimant; export per the runbook |
| **Rectification** | Dataverse (system of record) | edit the authoritative record; the one-way mirror does not back-propagate, so corrections may need re-mirroring |
| **Erasure** | **all three stores + the blind spots** | follow the runbook; **erasure is incomplete unless the [blind spots](../plans/runbooks/dsar-erasure-cross-store.md) are covered** — PII-adjacent identifiers in Box folder names, File-Request URLs, and Outlook category strings live **outside** Dataverse |
| **Restriction / objection** | Dataverse | set a hold / suppress processing; note the legitimate-interest balancing |
| **Portability** | Dataverse | export the structured fields (the DSAR export covers this) |

**Erasure is subject to the litigation/evidential hold** ([§8](#8-retention--the-two-clock-model)):
an erasure request on a case under legal hold is **paused, not refused** — the hold is recorded and the
subject informed per the exemption. Whether a given case qualifies for the litigation exemption is an
operator/legal call — **[RESERVED-FOR-USER]**.

---

## 10. Cross-links

- [ADR-0017](../adr/0017-data-retention-erasure-pii-lifecycle.md) — the binding decision (two-clock
  retention model + cross-store erasure scope).
- [Phase 9 plan](../plans/phase-9-data-governance/README.md) — the implementation checklist.
- [DSAR / right-to-erasure cross-store runbook](../plans/runbooks/dsar-erasure-cross-store.md) — the
  operational erasure procedure (item 2 of this Phase-9 doc set).
- [docs/gated.md](../gated.md) — the operator-blocker registry.
- [Box mirror rule (data-model)](./data-model.md#box-mirror-rule-phase-7-adr-0012--one-way-dataverse-authoritative) ·
  [Integrations & gating](./integrations.md) — the one-way-mirror and gating mechanics this doc relies on.

---

## Reserved / deferred index (for the operator & legal)

- **[RESERVED-FOR-USER]** — statutory **minimisation retention window** length ([§8](#8-retention--the-two-clock-model)).
- **[RESERVED-FOR-USER]** — **litigation / legal-hold rule** (trigger, who sets/clears) ([§8](#8-retention--the-two-clock-model)).
- **[RESERVED-FOR-USER]** — **anonymise vs hard-delete** disposition policy ([§8](#8-retention--the-two-clock-model)).
- **[RESERVED-FOR-USER]** — confirmed **lawful basis** per processing activity ([§4](#4-lawful-basis-table)).
- **[RESERVED-FOR-USER]** — **valuation** lawful basis + outbound footprint, before `VALUATION_ENABLED` ([§5a](#5a-valuation-record-before-valuation_enabled)).
- **[RESERVED-FOR-USER]** — **ICO registration** confirmation / number ([§7](#7-dpia--ico-registration-operatorlegal)).
- **[RESERVED-FOR-USER]** — **DVLA data-use terms** confirmation ([§5](#5-outbound-data-minimisation-dvsadvla), [§7](#7-dpia--ico-registration-operatorlegal)).
- **[RESERVED-FOR-USER]** — **Box DPA** + Microsoft DPA coverage confirmation ([§2](#2-controller--processor-map), [§7](#7-dpia--ico-registration-operatorlegal)).
- **[RESERVED-FOR-USER]** — per-case **litigation-exemption** determination on an erasure request ([§9](#9-data-subject-rights--path-summary)).
- **[DEFERRED — PENDING LEGAL]** — **DPIA sign-off** ([§7](#7-dpia--ico-registration-operatorlegal)).
- **[DEFERRED — PENDING LEGAL]** — **EVA/Minotaur** processor-vs-independent-controller determination ([§2](#2-controller--processor-map)).
- **[DEFERRED — PENDING LEGAL]** — special-category treatment of **incidental people/reflections** in photos ([§1](#1-what-personal-data-the-pipeline-holds)).
- **[PARTIAL]** — **per-AI-gate** data-protection sign-off ([§6](#6-ai-data-protection)): `EMAIL_AI_ENABLED` (2026-07-03), **`AI_ASSIST_ENABLED` + `IMAGE_ANALYSIS_ENABLED` (operator sign-off 2026-07-08 — see [§6a](#6a-per-gate-production-sign-off--log))** are SIGNED; the formal DPIA **document** reference for the 2026-07-08 attestation is **[TO FILE]**; remaining gates (Box-AI, valuation, write-tier) still **[DEFERRED]** (testing authorised now).
