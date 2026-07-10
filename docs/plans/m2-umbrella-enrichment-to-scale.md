# M2 umbrella — enrichment-to-scale implementation plan (collisionspike)

> Dependency-ordered, gated roadmap for the second milestone of the Collision Engineers case-intake
> spike (Power Apps **Code App** + Dataverse + Power Automate + Azure Functions, Sandbox
> `Collision Engineers - Dev` `b3090c42-…`). Companion to [PLAN.md](../HISTORICAL/PLAN.md),
> [ROADMAP.md](../../ROADMAP.md), [CURRENT_STATUS.md](../../CURRENT_STATUS.md),
> [AGENTS.md](../../AGENTS.md), [docs/architecture/live-environment.md](../../docs/architecture/live-environment.md),
> the ADRs in [docs/adr/](../../docs/adr/), and the **eva-sentry-api** skill. Sibling plans it depends on:
> [plans/ocr-strategy.md](./phase-5-ocr-and-scale/ocr-strategy.md) (image AI / OCR — M2 owns the classification half).
> Author date **2026-06-18**. Read-only research only; **no code/flows/Dataverse changed by this plan**.
>
> **Reconciliation note (2026-06-22):** the "net-new to **build**" framing for **M2.B EVA validation** and
> **M2.C EVA Sentry REST** (§§0, 2, 6, 7) is now superseded — both Functions + their OpenAPI connectors were
> authored gated-off (repo `functions/evavalidation/`, `functions/evasentry/`) and are **deployed live gated-off**
> (`cespkeval-fn-6c6fxd` `/api/validate-case`; `cespkeva-fn-ufa3ci`, `EVA_API_ENABLED=false`). Read "build" as
> **done offline**; the live-remaining M2 work for these is connector **import + bind + activation** ([RESERVED-FOR-USER]).
>
> **Box-timing supersession (Phase 7 / [ADR-0012](../adr/0012-box-centric-intake-additive-hybrid.md)).** Wherever
> this plan frames **M2.D Box** as "Box archival **at finalisation** / **in unison with EVA submit**" (§0, §3, §8,
> §15), that is the **older M2.D** model. Under the Box-centric intake pivot the per-Case/PO **UPPERCASE folder is
> minted at parse-confirm** (`box-folder-create`, gate `BOX_FOLDER_AT_INTAKE_ENABLED`) and `finalize-eva-box`
> **augments** the pre-existing folder (reads `cr1bd_BOX_FOLDER_ROOT_ID`); all non-byte Box ops run through the
> **custom `cr1bd_box_rest` connector** (CCG via the `box-webhook` Function), with first-party `shared_box` retained
> for the byte path only. Box is a **one-way mirror, Dataverse authoritative**; all `BOX_*` gates currently OFF. See
> [docs/plans/phase-7-box-integration/](./phase-7-box-integration/).

---

## 0. TL;DR — what M2 actually is

> **Milestone scope (per [milestone-model.md](./milestone-model.md)).** This umbrella is the **M2**
> dependency graph spanning **ROADMAP Phases 3–5** — *Phase ≠ Milestone*. M2 here = **3c** EVA Sentry
> REST + the **EVA-validation Function**, **3d** Box archival, **4b** chaser-send, **5b** image
> classification/reflection. **Enrichment (3a) is M1** (its activation runbook lives here for dependency
> context). **Valuation (M2.G below) is reconciled to M3** (ADR-0006, locked) — off the EVA/Box critical
> path, tracked here for dependency context only.

**M2 is mostly activation + connector-build + two genuinely net-new Functions, not greenfield flow
authoring.** Phase 1 already shipped, **imported `state=off`**, the full downstream chain:
`enrich`, `finalize-eva-box` (EVA submit + Box, with `EVA_API_ENABLED` transport gate, photo-order
foreach, idempotency latch), `status-evaluate`, `chaser-draft` (draft-only). The Dataverse gates
(`ENRICHMENT_ENABLED`, `EVA_API_ENABLED`, `VALUATION_ENABLED`, `AZURE_VISION_ENABLED`, …) **already
exist** in `dataverse/environment-variables.json`. So M2 is:

1. **Activate ENRICHMENT** — Function already deployed gated-OFF; inject DVSA/DVLA creds → Key Vault,
   set `DVSA_TENANT_ID` + `ENRICHMENT_API_BASE`, bind `cr1bd_dvsaenrich`, flip the gate, turn on
   `CS Enrich`. *Mostly operator.*
2. **EVA Sentry REST submission** — **build the net-new `cr1bd_evasentry` Function + connector**
   (token lifecycle lives **server-side in the Function**, because Power Platform custom connectors
   **do not support the OAuth2 client-credentials grant** — confirmed below). Also build the net-new
   `cr1bd_evavalidation` Function/connector that `status-evaluate` already calls. Then bind, flip
   `EVA_API_ENABLED` in **test**, gated prod cutover behind a parity test. *Claude-buildable Function/
   connector; operator activation + EVA creds.*
3. **Box archival at finalisation** — connector exists in the flow (`shared_box`, UPPERCASE Case/PO);
   bind `cr1bd_box`, set `BoxArchiveRootId`, confirm UPPERCASE folder casing (B5). *Operator.*
4. **Image AI classification (ADR-0009 M2 half)** — overview-vs-damage via **AI Builder image
   classification** (needs **AI Builder capacity**) + **Foundry vision** for person/reflection. Plate
   **OCR** (the M1 half) is owned by [ocr-strategy.md](./phase-5-ocr-and-scale/ocr-strategy.md); M2 coordinates with it and
   adds classification on top. *Claude-buildable model+flow; capacity is a licensing decision.*
5. **Valuation (`valuationbot`, `VALUATION_ENABLED`, on-demand)** — *M3 ([milestone-model](./milestone-model.md) §4)*; staff-triggered; build a
   **direct REST-wrapper Function** (same pattern as DVSA now the Cloud Run gateway is retired) +
   connector; Companion-Report PDF attached as Evidence. *Claude-buildable; operator activation.*
6. **Chasers send (currently draft-only)** — add an **outbound email-send flow behind a kill switch**
   (`CHASER_SEND_ENABLED`, net-new gate) leaving `chaser-draft` untouched; WhatsApp stays manual
   (ADR-0003). *Claude-buildable; operator activates the kill switch.*

The **single biggest design fact** in this plan: **the EVA 5-minute `/Connect/token` exchange cannot
be done by a Power Platform custom connector's OAuth security** — Microsoft Learn confirms *"client
credentials grant type is not supported by custom connectors"* and custom connectors use the
authorization-code flow (which EVA does not offer). The token MUST be minted and cached **inside an
Azure Function** that the `cr1bd_evasentry` connector fronts (function-key auth on the connector;
EVA creds as Key Vault refs in the Function). The repo's existing `cr1bd_evasentry` connection note
already says *"Token exchange + bearer live INSIDE the connector"* — this plan makes that an explicit
Function and explains why it is mandatory.

---

## 1. Boundary legend (used on every item)

Mirrors `flows/flow-state.json` + [AGENTS.md](../../AGENTS.md) + memory `live-services-boundary`:

| Tag | Meaning | Who |
|---|---|---|
| **[BUILD]** | Authored + verified **offline** (Function code, Bicep, OpenAPI, flow JSON, TS, AI-model design, pytest/vitest, `az bicep build`, OpenAPI lint). Zero tenant/Azure/DVSA/EVA/Box contact. | **Claude** |
| **[DEPLOY-WITH-LOGIN]** | Deploy a Function / Key Vault / import a connector / add a Dataverse env-var / set a non-secret env-var value / **read-only** `az`/`pac`/Dataverse GETs. Touches the tenant but **not** live inbox/EVA/Box/SharePoint and injects **no secret values**. | Operator (Claude may draft exact commands + run read-only GETs) |
| **[RESERVED-FOR-USER]** | Crosses the **live-services boundary**: inject a real secret **value** into Key Vault, bind a connection to a **live** Box/EVA/mailbox account, **flip a production gate**, turn a flow **ON**, or run a **live** end-to-end test. | **Operator only** |

**Two hard principles (unchanged):** (1) offline build vs operator activation; (2) **no mock/seed
case data** — the Code App renders real Dataverse rows only.

**CSP rule (AGENTS.md truth #1):** the Code App reaches external services **only via Power Platform
connectors** (`@microsoft/power-apps` SDK), never raw `fetch()`. Every Azure Function in M2 is
reached **either** by a cloud flow (server-side HTTP, CSP-exempt) **or** by a custom connector from
the Code App — never a direct browser call.

**Flow-webhook rule (AGENTS.md truth #2, memory `flow-webhook-trigger-provisioning`):** M2 flows are
all `Request`-triggered (HTTP / child flows), **not** connection-webhook triggers, so they do **not**
need the designer re-publish dance that bit `CS Intake`. They are invoked by parent flows or the Code
App. Turning them `On` is a state toggle only. (The one exception to watch: if any M2 flow is later
reworked to a Dataverse-row trigger, it becomes webhook-provisioned and must be (re)published in the
designer.)

---

## 2. Where M2 starts (verified Phase-1 end-state)

| Asset | State (live-verified 2026-06-18) | M2 consequence |
|---|---|---|
| `CS Intake` / `CS Provider Match` / `CS Case Resolve` | **ON** | M2 builds **on top**; do not touch the intake trigger. |
| `CS Classify+Persist` / `CS Parse` / `CS Status Evaluate` | **OFF** | M2 depends on these being **on** for an end-to-end case (Sub-phase A prerequisite). |
| `CS Enrich` (`4e0f301f`) | **OFF**, gate `ENRICHMENT_ENABLED=false` (Sandbox) | **M2.A** activates. Flow + Function + connector already built. |
| `CS Finalize EVA+Box` (`8d70ba4c`) | **OFF**, gate `EVA_API_ENABLED=false` | **M2.C/D** activate; flow already encodes Box + EVA transport gate + idempotency. |
| `CS Chaser Draft` (`1f048996`) | **OFF**, draft-only by design | **M2.F** adds a *separate* send flow; chaser-draft stays as-is. |
| Enrichment Function `cespkenrich-fn-gi62sd` | **Deployed, gated-OFF**; direct DVSA+DVLA via Entra; KV `cespkenrichkv…` | M2.A = creds + gate, **no code change**. |
| Parser Function `cespike-parser-dev-x7xt3d5ovhi7y` | **Live** FC1; cannot run Tesseract/binaries | M2 image-AI plate OCR routes to the **ACA container** (ocr-strategy.md), not FC1. |
| Connection refs | `cr1bd_dataverse` + `cr1bd_sharedmailbox_office365` **bound**; `cr1bd_dvsaenrich`, `cr1bd_evasentry`, `cr1bd_evavalidation`, `cr1bd_box`, `cr1bd_evidenceblob`, `cr1bd_jobsheet_excel` **unbound** | M2 binds dvsaenrich, evasentry, evavalidation, box, evidenceblob. |
| Custom-connector OpenAPI on disk | **parser**, **enrichment**, **evasentry**, **evavalidation** all exist (`functions/*/openapi/*.json`); the EVA Functions were authored gated-off since this plan was written (git `5ca23df`) and are now DEPLOYED (evasentry `cespkeva-fn-ufa3ci`, evavalidation `cespkeval-fn-6c6fxd`, both Running, gated off). | M2 work for evasentry + evavalidation is now connector-**import** + bind + activate, not build. |
| Dataverse env-vars | All M2 gates exist incl. `VALUATION_ENABLED`, `AZURE_VISION_ENABLED`, `EVA_*` | M2 adds only: `CHASER_SEND_ENABLED`, `VALUATION_API_BASE`, the 3 OCR gates from ocr-strategy.md, and (if used) `AIBUILDER_CLASSIFY_ENABLED`. |

**Implication:** the heavy flow logic is done. M2's real engineering is **(a) the EVA Sentry Function
+ connector, (b) the EVA validation Function + connector, (c) the valuation Function + connector,
(d) the AI Builder classification model + a classify flow, (e) the chaser-send flow** — plus a lot of
**operator activation** (creds, gates, bindings, live tests).

---

## 3. Dependency graph (sub-phases)

```
        (prereq) M2.0  Pipeline-on: classify-persist, parse, status-evaluate ON
                        + provider email-domains seeded  (operator; ROADMAP Phase 2)
                                   │
        ┌──────────────────────────┼───────────────────────────────────────────────┐
        ▼                          ▼                                                ▼
  M2.A ENRICHMENT            M2.B EVA VALIDATION surface              M2.E IMAGE AI (classification)
  (creds→KV, gate,           (Func + connector;                      depends on ocr-strategy.md plate
   bind dvsaenrich,          status-evaluate already calls it)        OCR being live for registrationVisible
   turn on CS Enrich)               │                                  then adds AI Builder classify + Foundry
        │                           ▼                                          │
        │                    M2.C EVA SENTRY REST  ◄── needs M2.B validation    │
        │                    (Func with token lifecycle +                       │
        │                     connector; bind evasentry;                        │
        │                     EVA_API_ENABLED in TEST)                          │
        │                           │                                          │
        ▼                           ▼                                          ▼
  M2.D BOX + FINALIZE ──────────────┴───────────  (finalize-eva-box: Box always; EVA transport per gate)
        │                           │
        │                           ▼
        │                    M2.C-prod  EVA PRODUCTION cutover (parity test, gated)   [RESERVED-FOR-USER]
        ▼
  M2.F CHASER SEND (kill-switched email send; WhatsApp manual)   ─┐
  M2.G VALUATION (on-demand valuationbot wrapper, VALUATION_ENABLED) ─┴── independent, lowest priority
```

**Critical path:** `M2.0 → M2.B → M2.C → M2.D → (EVA prod cutover)`. EVA REST is the spine; Box
finalisation can go live on the **drag-drop JSON** transport (`EVA_API_ENABLED=false`) **before** the
Sentry REST path is built — so **M2.D can ship on the M1 transport ahead of M2.C**. Enrichment (M2.A)
is independent and can run first (highest value-per-effort). Image AI (M2.E), chasers (M2.F),
valuation (M2.G) are parallel and lower priority.

**Recommended execution order:** **M2.0 → M2.A → M2.D(drag-drop) → M2.B → M2.C(test) → M2.E → M2.F →
M2.G → M2.C(prod).**

---

## 4. Sub-phase M2.0 — Pipeline-on prerequisite (operator)

**Why first:** enrichment/EVA/Box all act on a Case that has parsed fields + classified Evidence.
Today only `intake/provider-match/case-resolve` are on, so a Case has no attachments/parse/status.
This is **ROADMAP Phase 2 + Phase 3a** glue and is largely the operator's M1 finish, repeated here as
M2's gate.

| # | Item | Tag | Verify |
|---|---|---|---|
| 0.1 | Seed provider email domains so auto-match works: `dataverse/.build/15-seed-emaildomains.ps1` (needs per-provider domains — see §11 open Q1). | [DEPLOY-WITH-LOGIN] | `GET …/cr1bd_workproviders?$select=cr1bd_knownemaildomains&$filter=cr1bd_knownemaildomains ne null` count rises from ~16. |
| 0.2 | Wire **CE Parser connector into the Code App** (CSP fix) + turn ON `CS Classify+Persist` + `CS Parse`. (Tasks #27/#28 already track this.) Bind `cr1bd_ceparser` (function-key) + `cr1bd_evidenceblob`. | [RESERVED-FOR-USER] | A test email with a PDF + 2 images → Case with 12 parsed fields (provenance `pdf_extraction`) + Evidence rows in Blob. |
| 0.3 | Build + turn ON `CS Status Evaluate` — **but it calls `cr1bd_evavalidation`, which does not exist yet** → either ship the validation Function first (**M2.B**) or temporarily inline the readiness check. **Recommend doing M2.B before flipping status-evaluate on.** | depends on M2.B | Case advances `ingested → needs_review → ready_for_eva` per `status-evaluate.definition.json` guard order. |

**Gate:** M2.0 done = one real email becomes a parsed, classified, status-evaluated `ready_for_eva`
Case. Everything below acts on that Case.

---

## 5. Sub-phase M2.A — ENRICHMENT activation (DVSA mileage + vehicle summary)

**Status:** Function `cespkenrich-fn-gi62sd` deployed gated-OFF; flow `CS Enrich` + connector
`enrichment-connector.json` built; `enrich.definition.json` encodes the `ENRICHMENT_ENABLED` read,
the **document-authoritative mileage guard** (ADR-0006), empty-field-only writes, and advisory
audit. **No code change required** — this is bind + creds + gate.

### Prerequisites
- M2.0 (a Case with a VRM and a known `document_has_mileage` signal).
- `functions/enrichment/infra/main.bicep` already provisions the Function + Storage + Key Vault + the
  managed-identity *Key Vault Secrets User* RBAC.

### Work items
| # | Item | Owner agent | Tag | Files / commands |
|---|---|---|---|---|
| A.1 | Confirm enrichment Function deployment is current (redeploy if drifted). | azure-integration-engineer | [DEPLOY-WITH-LOGIN] | `az functionapp show -g rg-collisionspike-dev -n cespkenrich-fn-gi62sd`; `func azure functionapp publish` if needed. |
| A.2 | **Register/consent the Entra app** for DVSA `client_credentials` (scope `https://tapi.dvsa.gov.uk/.default`). | azure-integration-engineer | [RESERVED-FOR-USER] (admin consent) | Entra app reg; record tenant id for `DVSA_TENANT_ID`. |
| A.3 | **Inject secrets** into KV `cespkenrichkv…`: `DVSA_CLIENT_ID`, `DVSA_CLIENT_SECRET`, `DVSA_API_KEY`, `DVLA_API_KEY`. | operator | [RESERVED-FOR-USER] | `az keyvault secret set …` (values from Infisical). Function reads via `@Microsoft.KeyVault(SecretUri=…)`. |
| A.4 | Set non-secret app settings: `DVSA_TENANT_ID`, `DVSA_SCOPE`, `DVSA_API_BASE`, `DVLA_API_BASE`. | operator | [DEPLOY-WITH-LOGIN] | `az functionapp config appsettings set …`. |
| A.5 | **Import the enrichment custom connector** + create its connection (function-key) → binds `cr1bd_dvsaenrich`. | azure-integration-engineer / operator | [DEPLOY-WITH-LOGIN] | `pac connector create` from `functions/enrichment/openapi/enrichment-connector.json`; set `ENRICHMENT_API_BASE` env-var to the Function host. |
| A.6 | **Flip `ENRICHMENT_ENABLED=true`** in a **test** environment (per-env current value, not the default). | operator | [RESERVED-FOR-USER] | Solution → env-var current value, OR `pac` env-var update. |
| A.7 | **Turn ON `CS Enrich`** (`4e0f301f`) and wire it into the pipeline after `CS Parse` (status-evaluate re-runs after). | power-automate-flow-builder / operator | [RESERVED-FOR-USER] | Flow state On; confirm it is invoked post-parse with `{caseId, vrm, reference}`. |

### Connections / secrets / gates
- **Connection:** `cr1bd_dvsaenrich` → `shared_dvsaenrich` (function-key on the connection).
- **Secrets (KV refs only):** `DVSA_CLIENT_ID/SECRET`, `DVSA_API_KEY`, `DVLA_API_KEY`.
- **Gates:** `ENRICHMENT_ENABLED` (flip true in test), `ENRICHMENT_API_BASE` (set to host).

### Acceptance tests
- **[BUILD] (already green):** `cd functions/enrichment && python -m pytest` — mileage computed only
  when `document_has_mileage=false`; DVSA make/model map; DVLA fallback fires only when DVSA has no
  make; 401 refreshes token once; no secret in logs/output.
- **[RESERVED-FOR-USER] live:** with a Case whose parsed mileage is **empty**, run `CS Enrich`; assert
  `cr1bd_evamileage` filled from MOT (`mileage_unit=Miles`), provenance `dvla_dvsa`, `reviewState`
  needs_review, and an `enrichment_called` AuditEvent. With a Case whose mileage is **present**, assert
  the estimate is **skipped** (document authoritative) and an audit records why.
- **Gate-off check:** with `ENRICHMENT_ENABLED=false`, `CS Enrich` writes a `enrichment_called
  (skipped)` audit and changes no fields.
- **Read-only health:** `curl.exe -X OPTIONS` the enrichment host with `Origin: https://apps.powerapps.com`
  → CORS allows; `/dvsa-mot/enrich` without key → 401, with bad body → 200 + warnings (advisory).

---

## 6. Sub-phase M2.B — EVA validation surface (net-new Function + connector)

**Why it exists / why now:** `status-evaluate.definition.json` already calls
`shared_evavalidation / ValidateCase` to get `{ fieldsValid, imagesValid, openIssues[] }` so the
**flow and the Code App `computeReadiness()` share ONE implementation** (Phase-1 §5.4 drift
mitigation). **No Function backs this connector yet.** It is on the critical path because turning
`CS Status Evaluate` on requires it, and EVA submit depends on a correct `ready_for_eva`.

### Build (Claude)
- **New Function** `functions/evavalidation/` (Python v2, FC1 — pure logic, no binaries): `POST
  /validate-case {caseId}` → reads the Case + Evidence from Dataverse (via the Function's own
  Dataverse SDK/managed identity **or** accept the Case+Evidence in the body to avoid a Dataverse
  round-trip — prefer **body-in** to keep the Function stateless and the flow the single Dataverse
  caller). Returns `{ fieldsValid, imagesValid, openIssues[] }` by **porting the existing TS**
  `mockup-app/src/contracts/image-rules.ts` + `case-status.ts` semantics (the canonical contract).
- **OpenAPI** `functions/evavalidation/openapi/evavalidation-connector.json` (operation `ValidateCase`).
- **Bicep** `functions/evavalidation/infra/main.bicep` (FC1 + Storage; no Key Vault needed — no
  secrets).
- **Decision to make:** body-in (stateless) vs caseId-in (Function reads Dataverse). Body-in is
  simpler, avoids a second Dataverse identity, and keeps `status-evaluate` as the sole reader — but
  requires the flow to pass the Case + Evidence set. **Recommend body-in;** update
  `status-evaluate.definition.json` `Validate_readiness` to send the Case + Evidence (small flow edit).

### Owner / tags
- **Owner:** eva-sentry-integration (semantics) + azure-integration-engineer (Function/Bicep/OpenAPI)
  + power-automate-flow-builder (flow wiring).
- **Build** = [BUILD]; deploy + connector import = [DEPLOY-WITH-LOGIN]; bind connection +
  turn on status-evaluate = [RESERVED-FOR-USER].

### Connections / gates
- **Connection:** `cr1bd_evavalidation` → `shared_evavalidation` (function-key). **No gate** (pure
  domain logic, always on — mirrors `status-evaluate` "Gating: none").

### Acceptance tests
- **[BUILD]:** pytest the port against the **same fixtures** as the TS `image-rules.test.ts` /
  `case-status` tests so flow and Code App agree byte-for-byte. Assert: `fieldsValid` false unless the
  12 required EVA fields validate against `contracts/eva-payload.schema.json`; `imagesValid` requires
  ≥2 accepted Evidence, ≥1 `overview` with `registrationVisible=true`, ≥1 `damage_closeup`;
  `openIssues` lists each gap. OpenAPI 2.0 lint; `az bicep build`.
- **Parity test:** a small harness feeds N Cases through **both** the TS `computeReadiness()` and the
  Function and asserts identical `{fieldsValid, imagesValid, openIssues}` — this *is* the drift gate.
- **[RESERVED-FOR-USER] live:** with `cr1bd_evavalidation` bound, run `CS Status Evaluate` on a Case
  missing a damage closeup → status lands `missing_images`; add the closeup → `ready_for_eva`.

---

## 7. Sub-phase M2.C — EVA Sentry REST submission (net-new Function + connector)

**The spine of M2 and the only item with a hard external-contract design constraint.** Reference:
**eva-sentry-api skill** + [docs/architecture/eva-sentry-api.md](../../docs/architecture/eva-sentry-api.md)
+ ADR-0005 + the field-level PDF `docs/reference/Sentry API Documentation 1.2 Amended.pdf` (re-read
for payload depth before wiring).

### 7.1 The token-lifecycle design constraint (decisive)

**Microsoft Learn (verified):** Power Platform custom connectors **do not support the OAuth2
client-credentials grant** (`connection-parameters`: *"Currently, client credentials grant type is
not supported by custom connectors"*; `verify-oauth-configuration`: *"Custom connectors use the
authorization code flow. The implicit and client credentials flows don't issue refresh tokens…"*).
EVA's `POST /Connect/token` is a **client-id/secret body exchange** returning a **5-minute** JWT — a
client-credentials-style flow with **no** authorization-code/refresh-token story.

**Therefore the connector CANNOT do EVA auth at the connector layer.** The token MUST be minted,
cached (~30s refresh buffer), and attached as `Authorization: Bearer` **inside an Azure Function**
that the `cr1bd_evasentry` connector fronts. This matches the repo's existing connection note
(*"Token exchange + bearer live INSIDE the connector (Key Vault refs)"*) and the
`finalize-eva-box` flow (which calls `shared_evasentry / InstructionInspection` with just the
payload). **This plan formalises that as `functions/evasentry/`.**

> Alternative considered & rejected: do the `/Connect/token` POST as a **Power Automate HTTP action**
> inside `finalize-eva-box` (server-side, CSP-exempt) and pass the bearer to a generic HTTP call.
> Rejected because (a) the premium **HTTP** action + raw EVA URL spreads the secret and token logic
> into flow JSON, (b) the Code App could never reuse it, and (c) idempotency/two-request photo logic
> is cleaner in one Function. **A Function wrapper is the chosen pattern** (consistent with
> parser/enrichment ADR-0004/0006).

### 7.2 Build (Claude) — `functions/evasentry/`
- **`function_app.py`** — operations the connector exposes:
  - `POST /eva/instruction-inspection` — body = the **richer Instruction/Inspection payload** (the
    12-field core + vehicle/claim identity, multiple postcodes, claim type, `DamageType[1..3]`,
    estimate/cost fields, and **base-64 Impact Image entries**). Internally: get/refresh token →
    POST `{EVA_BASE_URL}/Instruction/Inspection` → map response → return `{ submitted, evaRef?,
    warnings[] }`. **Idempotency by payload hash** (caller passes `payloadHash`; Function no-ops/echoes
    if the same hash already succeeded — or rely on the flow's `cr1bd_finalizedpayloadhash` latch as
    the primary guard and keep the Function stateless).
  - **Two-request photo submission** (eva-sentry-api skill, "likely two requests — confirm on test"):
    request 1 = the **2 preview images** (overview w/ full reg + main-damage closeup); request 2 = the
    **full sequence including those two again**. Expose either as one operation that takes the ordered
    image array, or two operations `SubmitPreviews` + `SubmitAllPhotos`. **Confirm the real two-call
    contract against the EVA test env before finalising** (§11 open Q3).
  - Optional later operations from the 8-endpoint surface: `Claim/LocationUpdate`,
    `Note/SubmitNote`, `Report/GetAvailableReports`, `Report/GetReport` (out of M2 core; stub in
    OpenAPI only if needed).
- **`eva_client.py`** — token cache (in-proc TTL = `expires_in` minutes − 30s), `/Connect/token`
  (`application/x-www-form-urlencoded`, `Client_Id`+`Client_Secret` from KV refs), bearer attach, 401
  → refresh-once-then-retry. **Never log the token/secret.**
- **`payload.py`** — build the Instruction/Inspection body from a Case + Evidence; the **12-field
  core** is produced by the **same serializer contract** as `mockup-app/src/contracts/eva-export.ts`
  (validate against `contracts/eva-payload.schema.json`) so drag-drop and API bodies are byte-identical
  for the 12 fields.
- **OpenAPI** `functions/evasentry/openapi/evasentry-connector.json` (operation(s) above;
  function-key security; **no OAuth security definition** — the connector is keyed, EVA auth is internal).
- **Bicep** `functions/evasentry/infra/main.bicep` — FC1 Function + Storage + **Key Vault** (refs:
  `eva-client-id`, `eva-client-secret`; `EVA_BASE_URL` as a non-secret app setting) + MI *Key Vault
  Secrets User*.

### 7.3 Wire-up (the `finalize-eva-box` flow already calls it)
`finalize-eva-box.definition.json` already has `Submit_to_EVA` → `EVA_instruction_inspection` on
`shared_evasentry` guarded by `gate_EVA_API_ENABLED`. M2.C makes that connector real and binds it.
The flow's drag-drop **else** branch (Stage_drag_drop_json to Box) is the permanent fallback.

### Owner / tags
- **Owner:** eva-sentry-integration (contract/payload/token) + azure-integration-engineer
  (Function/Bicep/OpenAPI/Key Vault).
- **Build** = [BUILD]; deploy + connector import = [DEPLOY-WITH-LOGIN]; **EVA test creds → KV (B5)**,
  bind `cr1bd_evasentry`, **flip `EVA_API_ENABLED=true` in test**, prod cutover = [RESERVED-FOR-USER].

### Connections / secrets / gates
- **Connection:** `cr1bd_evasentry` → `shared_evasentry` (function-key).
- **Secrets (KV refs only):** `cr1bd_EVA_CLIENT_ID`, `cr1bd_EVA_CLIENT_SECRET` (already declared as
  Secret env-vars pointing at KV; the Function reads its own KV refs). `EVA_BASE_URL` non-secret.
- **Gate:** `EVA_API_ENABLED` — flip **true in test only** (default false = permanent drag-drop
  fallback). Production cutover gated behind the parity test (§7.5).

### 7.4 Acceptance tests
- **[BUILD]:** pytest with **mocked** `/Connect/token` + `/Instruction/Inspection` (respx): token
  refresh fires within the 30s buffer; 401 → one refresh → retry; payload-hash idempotency no-ops a
  repeat; the 12-field core validates against `contracts/eva-payload.schema.json`; image ordering =
  2 previews then full sequence; **no secret/token in logs**. OpenAPI lint; `az bicep build`.
- **[RESERVED-FOR-USER] live (test env):** flip `EVA_API_ENABLED=true`; run `CS Finalize EVA+Box` on a
  `ready_for_eva` Case → assert EVA test accepts the Instruction; previews land first; full sequence
  includes them again; overview shows the full registration; an `eva_submitted` AuditEvent records
  `transport=sentry_rest`; `cr1bd_finalizedpayloadhash` stamped last; a re-run no-ops.

### 7.5 EVA **production** cutover (gated; [RESERVED-FOR-USER])
- Same URL, **prod credentials** select the prod server (ADR-0005). Cutover only after a **parity
  test**: the **same Case** submitted via drag-drop JSON and via the API produce the **same EVA
  result** (fields + photo order). Record the parity evidence; then swap KV to prod creds and confirm
  on one low-risk live case. **Operator-confirmed; Claude never flips prod.**

---

## 8. Sub-phase M2.D — Box archival at finalisation

> ⚠️ **Superseded by Phase 7 (ADR-0012, 2026-06-22).** This M2.D sketch (Box folder at **EVA-submit**, via
> the **first-party** Box connector) is the predecessor of the **Box-centric intake pivot**: the folder is
> now minted at **parse-confirm** by `box-folder-create`, `finalize-eva-box` **augments** the pre-existing
> folder and reads `cr1bd_BOX_FOLDER_ROOT_ID`, and all non-byte Box automation runs through the **custom
> `cr1bd_box_rest` connector** (CCG token minted inside the `box-webhook` Function) while first-party
> `shared_box` is retained for the byte (`CreateFile`) path only. The UPPERCASE-folder + EVA photo-order
> rules below stay correct. Current design + live state:
> [docs/plans/phase-7-box-integration/](./phase-7-box-integration/) and
> [phase-3-enrichment-and-eva/box-archival-pipeline.md](./phase-3-enrichment-and-eva/box-archival-pipeline.md).
> (Phase-7 Box Dataverse schema + env-vars are **applied live, gates OFF**; the **`box-webhook` Function
> `cespkbox-fn-v76a47` is DEPLOYED gated-off + Gate-C-verified 2026-06-22** (KV empty, CCG auth pending);
> the `cr1bd_box_rest` connector and the Box flows remain authored offline / unimported.)

**Status:** `finalize-eva-box.definition.json` already: orders Evidence (`sequenceindex asc`),
`Create_box_folder_UPPERCASE` (`toUpper(casepo)` under `BoxArchiveRootId`), `Upload_photos_in_eva_order`
(foreach, `repetitions:1` to preserve order), stages the `.eva.json`, audits `box_synced`, and
stamps the idempotency hash. **No flow build needed** — bind + confirm casing + activate. **Box can go
live on the drag-drop transport (`EVA_API_ENABLED=false`) before M2.C exists.**

### Work items
| # | Item | Tag | Verify |
|---|---|---|---|
| D.1 | Create the **Box connection** → bind `cr1bd_box` (`shared_box`, premium). | [RESERVED-FOR-USER] | Connection authorised against the live Box account. |
| D.2 | Set the **`BoxArchiveRootId`** flow parameter to the real parent archive folder id (never hardcoded — it's a parameter). | [RESERVED-FOR-USER] | Folder id resolves; flow parameter bound at activation. |
| D.3 | **Confirm Box honours the UPPERCASE Case/PO folder name** (B5) — e.g. EVA `test26001` → Box `TEST26001`. | [RESERVED-FOR-USER] | Created folder name is exactly `TOUPPER(casepo)`. |
| D.4 | **Large-file note:** the Box connector `CreateFile` uploads file content; verify behaviour on large image sets / multi-MB photos (some connectors don't chunk large files). If hit, stage via Blob + Box "copy from URL" or split. | [DEPLOY-WITH-LOGIN] (read docs) / [RESERVED-FOR-USER] (live size test) | A real case's photo set uploads without truncation/timeout. |
| D.5 | Turn ON `CS Finalize EVA+Box` (drag-drop transport first). | [RESERVED-FOR-USER] | A finalised Case yields a `TEST26001` Box folder with photos in EVA order + `test26001.eva.json`; `box_synced` status + audit. |

### Connections / gates
- **Connection:** `cr1bd_box` → `shared_box`.
- **Gate:** none for Box itself; `EVA_API_ENABLED` only chooses the EVA **transport** inside the same
  flow (Box runs either way). Box + EVA finalise **in unison** in one Scope (atomic-ish via the
  idempotency latch + Scope `runAfter`).

### Acceptance tests
- **[BUILD] (already):** flow linter (`flows/validate-flows.mjs`) confirms the definition's
  connectionNames ∈ the closed set and `state=off`.
- **Live:** the D.5 end-to-end; plus a **resume test** — fail mid-foreach, re-run, confirm the folder
  is reused (CreateFolder 409 handled) and no double-submit (hash latch).

---

## 9. Sub-phase M2.E — Image AI classification (ADR-0009 M2 half)

**Coordinates with [plans/ocr-strategy.md](./phase-5-ocr-and-scale/ocr-strategy.md).** That plan owns the **M1 half**
(plate **OCR** for `registrationVisible` + VRM-match, via `fast-alpr`/DI-Read on an **ACA container**).
**M2 adds the classification + reflection half on top.** Do not duplicate the OCR build here; treat
"plate OCR live → `registrationVisible` populated" as a **prerequisite** for the classification flow's
readiness payoff.

### What M2.E adds (ADR-0009)
1. **Overview-vs-damage_closeup classification** → **AI Builder image classification** (native,
   current — Custom Vision/Image-Analysis-4.0 are **retiring 2028-09-25**, do not use). A custom AI
   Builder **image classification model** trained on labelled CE overview/damage photos, consumed in a
   flow via the **`Predict`** action (Learn-confirmed path; `Asynchronous Pattern = On`).
2. **Person/reflection detection** → an **Azure OpenAI / Foundry vision model** (a Function wrapper
   the flow calls), to flag photos with a person's reflection as **unusable/excluded** (the manual
   `excluded` flag stays as the fallback). Reflection detection is **out of OCR scope** by design.

### Licensing reality (Learn-confirmed — flag)
**AI Builder capacity is NOT included in Power Apps licenses** (Power Automate licensing FAQ:
*"AI Builder capacity"* is explicitly excluded). M2.E's classification path needs an **AI Builder
capacity add-on** (or PAYG). This is a **cost/licensing decision for the operator** before building
the model. If declined, the fallback is **Foundry vision for both** classification and reflection
(one Function, one connector) — avoids AI Builder capacity entirely. **Recommend: prototype with
Foundry vision for both** (consistent with the reflection path, no new capacity SKU), and treat AI
Builder image classification as the "native, point-and-click" alternative if the operator buys
capacity.

### Build (Claude) — depending on the chosen path
- **AI Builder path:** design the model (label schema overview/damage/additional; training set from
  real CE photos in `raw/`), a **classify flow** (`CS Image Classify`, Request-triggered per Evidence
  image) that calls `Predict`, writes `cr1bd_imagerole` + provenance `ai`, then invokes
  `CS Status Evaluate`. **Model training is a maker-portal action [DEPLOY-WITH-LOGIN]; the flow JSON is
  [BUILD].**
- **Foundry vision path:** `functions/imageai/` Function (`POST /classify` → `{role, confidence}`;
  `POST /reflection-check` → `{has_person_reflection, confidence}`) calling a Foundry vision
  deployment with a KV-ref key; OpenAPI connector `cr1bd_imageai`; Bicep with Key Vault. Flow calls
  the connector. **Function/Bicep/OpenAPI = [BUILD]; deploy + Foundry deployment = [DEPLOY-WITH-LOGIN];
  Foundry key → KV = [RESERVED-FOR-USER].**
- **New gate:** `AIBUILDER_CLASSIFY_ENABLED` (or reuse `AZURE_VISION_ENABLED` for the Foundry path —
  the env-var manifest already maps `AZURE_VISION_ENABLED` to "image AI"). **Recommend** reusing
  `AZURE_VISION_ENABLED` for Foundry vision and adding `AIBUILDER_CLASSIFY_ENABLED` only if the AI
  Builder path is chosen, to keep gates honest.

### Owner / tags
- **Owner:** azure-integration-engineer (Foundry Function path) or dataverse/maker (AI Builder model);
  power-automate-flow-builder (classify flow); eva-sentry-integration (how role/reflection feed
  image-rules).
- **Build** = [BUILD] (flow JSON, Function code, model design); model train + Foundry deploy =
  [DEPLOY-WITH-LOGIN]; keys + activation = [RESERVED-FOR-USER].

### Connections / gates
- **Connection:** `cr1bd_imageai` (Foundry path, function-key) **or** AI Builder is in-platform (no
  connection). Plate-OCR connector reuse: `cr1bd_ceparser` per ocr-strategy.md.
- **Gate:** `AZURE_VISION_ENABLED` (Foundry) and/or `AIBUILDER_CLASSIFY_ENABLED`; plus
  ocr-strategy.md's `PLATE_OCR_ENABLED`.

### Acceptance tests
- **[BUILD]:** Function path — pytest the classify/reflection wrappers against fixtures (mock Foundry);
  assert mapping to `cr1bd_imagerole` choice values. Flow lint. Model path — a held-out labelled set
  scored offline (accuracy threshold agreed with operator).
- **Live:** upload a known **overview+damage** set → classification writes correct roles, plate OCR
  sets `registrationVisible`, `image-rules` passes (`hasOverview` via registrationVisible +
  `hasDamageCloseup`), status advances; a photo with a person's reflection is flagged
  `has_person_reflection` and excluded. (Mirrors PLAN.md "Image AI" verification.)

---

## 10. Sub-phase M2.F — Chasers send (kill-switched email; WhatsApp manual)

**Status:** `chaser-draft.definition.json` is **draft-only by design** — its boundary is "the ABSENCE
of any send action." ADR-0003 + integrations.md: **email** chasers may be *drafted then sent via
Outlook behind the outbound kill switch*; **WhatsApp is WhatsApp Business only → draft + manual send,
never automated.**

### Build (Claude) — a **separate** send flow (leave chaser-draft untouched)
- **New flow** `flows/definitions/chaser-send.definition.json` (`CS Chaser Send`, Request-triggered):
  reads a `drafted` Chaser (channel=**email** only), reads `CHASER_SEND_ENABLED` (new gate), and **if
  true** sends via the **Office 365 Outlook `Send an email`** action (the **already-bound**
  `cr1bd_sharedmailbox_office365` connection), then flips the Chaser `status` drafted→sent + stamps
  `sentBy/sentAt` + writes an AuditEvent. **WhatsApp-channel chasers are never auto-sent** — the flow
  hard-skips channel=whatsapp (keeps ADR-0003 invariant).
- **New gate** `cr1bd_CHASER_SEND_ENABLED` (Boolean, default **false**) added to
  `dataverse/environment-variables.json` — the global outbound kill switch.
- **AuditEvent vocabulary:** `chaser-draft` notes the `cr1bd_auditaction` set has **no chaser member**
  → **additively extend** the audit-action choice set (`chaser_sent`) in `dataverse/choicesets/` +
  the optionset build before writing the audit (do **not** reuse an unrelated action value).

### Owner / tags
- **Owner:** power-automate-flow-builder (flow) + dataverse-data-architect (the new gate + audit
  choice value).
- **Build** = [BUILD]; add gate/choice = [DEPLOY-WITH-LOGIN]; **flip `CHASER_SEND_ENABLED=true` +
  turn the flow on = [RESERVED-FOR-USER]** (sending real email is across the live boundary).

### Connections / gates
- **Connection:** `cr1bd_sharedmailbox_office365` (already bound; standard tier).
- **Gate:** `CHASER_SEND_ENABLED` (default false). Targeting uses garage↔provider coverage (N:N) once
  Phase-1b.3 Input 4 is loaded (ROADMAP 4b).

### Acceptance tests
- **[BUILD]:** flow lint; **static grep** asserts (a) `chaser-draft` still has **zero** send actions,
  (b) `chaser-send` skips channel=whatsapp, (c) the send action is gated by `CHASER_SEND_ENABLED`.
- **Live:** with the gate **false**, `CS Chaser Send` no-ops a drafted email chaser (audit "skipped").
  With it **true** (test recipient), the email sends to the correct garage, Chaser → `sent`, audit
  `chaser_sent`. A whatsapp-channel chaser is never sent (stays `drafted` for manual send).

---

## 11. Sub-phase M2.G → **M3.A** — Valuation (on-demand `valuationbot`, `VALUATION_ENABLED`)

> **Milestone:** reconciled to **M3** (ADR-0006, locked — see [milestone-model.md](./milestone-model.md) §4).
> Tracked under the M2.G node below for dependency context only; it is off the EVA/Box critical path.

**Scope (PLAN.md locked decisions; integrations.md):** **in scope at M2, on-demand** — staff-triggered
on total-loss/disputed cases; comparable search + **Companion Report PDF** attached as **Evidence**;
gated `VALUATION_ENABLED`; **same REST-wrapper pattern as DVSA**. Lowest M2 priority (additive to a
working pipeline; ROADMAP 5c lists it M2/M3).

### Design note (gateway retired)
`valuationbot` is a **collisionplugin Cloud Run MCP** service that sat behind the **now-retired**
`ce-mcp-gateway`. The DVSA precedent (ADR-0006) was to go **direct, all-Microsoft**. **Two options:**
- **(a) Direct REST-wrapper Function** `functions/valuation/` mirroring enrichment: authenticates to
  whatever `valuationbot` exposes (confirm — it may still be MCP-only on Cloud Run, in which case the
  wrapper speaks MCP server-side) and returns `{ valuation, comparables[], companion_report_pdf(base64) }`.
- **(b) If valuationbot has no non-MCP surface,** the wrapper performs the MCP handshake server-side
  (Function → Cloud Run MCP), keeping Power Platform on plain REST. **This is the one place a Cloud
  Run hop may legitimately remain** (valuation isn't Entra-native like DVSA). **Confirm the
  valuationbot contract before building** (§13 open Q5).

### Build (Claude)
- `functions/valuation/` Function + `valuation-connector.json` OpenAPI (`SearchComparables`,
  `CaptureAdvertPages`/`GetCompanionReport`) + Bicep + Key Vault (valuationbot creds as KV refs).
- **On-demand flow** `flows/definitions/valuation.definition.json` (`CS Valuation`, Request-triggered
  from the Code App "request valuation" button), gated `VALUATION_ENABLED`: calls the connector,
  writes the PDF as an **Evidence** row (`kind=valuation`), audits.
- **New env-var** `cr1bd_VALUATION_API_BASE` (String) alongside the existing `VALUATION_ENABLED`.

### Owner / tags
- **Owner:** azure-integration-engineer (Function/Bicep/OpenAPI) + power-automate-flow-builder (flow).
- **Build** = [BUILD]; deploy + connector = [DEPLOY-WITH-LOGIN]; valuationbot creds → KV + flip
  `VALUATION_ENABLED` = [RESERVED-FOR-USER].

### Connections / gates
- **Connection:** `cr1bd_valuation` (new custom connector, function-key).
- **Gate:** `VALUATION_ENABLED` (default false) + `VALUATION_API_BASE`.

### Acceptance tests
- **[BUILD]:** pytest the wrapper mapping against recorded fixtures (no live valuationbot); PDF passes
  through as base64; OpenAPI lint; `az bicep build`; no secret literal.
- **Live:** staff-trigger on a total-loss Case → a Companion Report PDF lands as `kind=valuation`
  Evidence; gate-off no-ops with an audit.

---

## 12. Cross-cutting: ALM, DLP, licensing, env-var deltas

### Dataverse env-var deltas (add to `dataverse/environment-variables.json`, all default OFF/empty)
| New var | Type | For |
|---|---|---|
| `cr1bd_CHASER_SEND_ENABLED` | Boolean=false | M2.F outbound kill switch |
| `cr1bd_VALUATION_API_BASE` | String="" | M2.G valuation Function host |
| `cr1bd_OCR_SCANNED_PDF_ENABLED` | Boolean=false | ocr-strategy.md (image-only PDFs → ACA) |
| `cr1bd_PLATE_OCR_ENABLED` | Boolean=false | ocr-strategy.md (registration OCR) |
| `cr1bd_AIBUILDER_CLASSIFY_ENABLED` | Boolean=false | M2.E **only if** AI Builder path chosen (else reuse `AZURE_VISION_ENABLED`) |

`EVA_API_ENABLED`, `EVA_BASE_URL`, `EVA_CLIENT_ID/SECRET`, `ENRICHMENT_*`, `VALUATION_ENABLED`,
`AZURE_VISION_ENABLED` **already exist** — do not re-add.

### Connection-reference deltas (add to `flows/connection-references.json` if not present)
`cr1bd_imageai` (Foundry path), `cr1bd_valuation` — both custom, function-key, premium.
Existing-but-unbound to bind in M2: `cr1bd_dvsaenrich`, `cr1bd_evasentry`, `cr1bd_evavalidation`,
`cr1bd_box`, `cr1bd_evidenceblob`.

### DLP (must-check before any activation)
Every connector in play (Dataverse, Box, Azure Blob, Office 365 Outlook, and the custom
parser/DVSA/EVA/validation/imageai/valuation) must sit in the **same DLP data group** in the target
env or import/run fails (`connection-references.json` note). **Verify the env DLP policy before M2
activation** (`pac` admin / Power Platform admin centre). [DEPLOY-WITH-LOGIN] read-only inventory.

### Premium licensing (open question, carried from Phase 1)
All custom connectors + Dataverse + Box + Blob are **premium**; AI Builder needs **AI Builder
capacity** (Learn-confirmed: not in Power Apps licenses). **Confirm Code Apps GA/licensing + premium
entitlement + AI Builder capacity** before relying on M2.E/M2.G in production. The Code App itself is
premium (custom APIs / Dataverse).

### ALM
M2 ships into `CollisionSpike` (schema/env-vars/connectors) + `CollisionSpikeFlows` (flows), both
unmanaged in Sandbox. Keep flows **`state=off`** on import (the `flow-state.json` global rule); add the
two new flows (`chaser-send`, `valuation`) + any classify flow to `flow-state.json` with `state=off`
+ boundary tags. **Commit each Function + flow as work progresses** (git on `main` — branch first per
the harness rules).

---

## 13. Open questions / uncertainties (and how to verify live)

1. **(BIGGEST) The EVA Sentry two-request photo contract is unconfirmed against the test env.** The
   skill + docs say "**likely** two requests" (previews, then full sequence incl. those two). The
   exact endpoint shape, whether images go on `/Instruction/Inspection` as base-64 "Impact Image"
   entries or via a separate call, and the precise field names live **only in
   `docs/reference/Sentry API Documentation 1.2 Amended.pdf`** and the **EVA test server**. **Verify:**
   re-read the PDF for the Instruction/Inspection payload, then once **EVA test creds (B5)** are in
   KV, POST a one-photo then full-set case to the **test** server and capture the accepted shape
   **before** finalising the connector + payload builder. This gates M2.C completion.
2. **EVA credentials + Box folder casing (B5) are operator-held and unconfirmed.** EVA **test**
   `Client_Id`/`Secret` (Infisical → KV) and the live confirmation that Box accepts the **UPPERCASE**
   Case/PO folder name. **Verify:** operator injects creds; D.3 live folder-name check.
3. **AI Builder capacity vs Foundry-vision-for-both (M2.E cost/licensing).** AI Builder image
   classification needs **AI Builder capacity** (not in Power Apps licenses — Learn-confirmed).
   **Decision needed from the operator:** buy capacity (native point-and-click) or use **Foundry
   vision for both** classification + reflection (one Function, no new SKU — **recommended default**).
4. **`cr1bd_evavalidation` body-in vs caseId-in.** Body-in keeps the Function stateless and the flow
   the sole Dataverse caller (recommended) but needs a small `status-evaluate` edit to pass Case +
   Evidence. **Verify:** parity test (TS vs Function) regardless of shape.
5. **valuationbot's current callable surface.** It was MCP-only behind the **retired** gateway. Is
   there a non-MCP REST surface, or must the wrapper speak MCP to Cloud Run server-side? **Verify:**
   inspect `active/connectors/valuation-adverts-connector` + the live Cloud Run service before building
   `functions/valuation/`. This may be the **only** legitimate remaining Cloud Run hop.
6. **Real-world OCR/plate accuracy (inherited from ocr-strategy.md §10).** Tesseract on real provider
   scans and `fast-alpr` on UK plates are unbenchmarked; M2.E's classification payoff assumes
   `registrationVisible` is reliably set. **Verify:** the score-against-real-corpus steps in
   ocr-strategy.md §9 before depending on the overview readiness gate.
7. **DLP single-group assumption.** If the env DLP policy splits these connectors across Business/
   Non-Business groups, flows won't run. **Verify:** read the env DLP policy [DEPLOY-WITH-LOGIN]
   before activation.

---

## 14. Per-item verification index (one-glance)

| Sub-phase | Item | [BUILD] verify | Live verify (operator) |
|---|---|---|---|
| M2.0 | pipeline-on | flow lint; provider-match exact-match unit test | email→parsed `ready_for_eva` Case |
| M2.A | enrichment | pytest (mileage guard, 401 refresh, no-secret) ✅ | mileage filled only when doc empty; gate-off no-op |
| M2.B | eva-validation Func | pytest **parity** vs TS image-rules/case-status; OpenAPI/bicep | status lands missing_images→ready_for_eva |
| M2.C | eva-sentry Func | pytest (token refresh, hash idempotency, photo order, no-secret); re-read PDF | EVA **test** accepts; previews first; audit transport=sentry_rest |
| M2.C-prod | cutover | n/a | **parity test** drag-drop==API, then prod creds |
| M2.D | Box finalise | flow lint ✅ | `TEST26001` folder, photos in order, `.eva.json`, resume no-double-submit |
| M2.E | image AI | pytest classify/reflection or held-out model score; flow lint | roles set, reflection flagged, status advances |
| M2.F | chaser send | grep: draft-only intact, whatsapp-skip, gated | gate-off no-op; gate-on sends to right garage; whatsapp never auto-sent |
| M2.G | valuation | pytest wrapper mapping; PDF passthrough | Companion PDF as Evidence; gate-off no-op |

**Global offline gate (must stay green through M2):** `node verify-all.mjs` (**all gates green** — began at 7, now runs more) +
`flows/validate-flows.mjs` (every definition listed in `flow-state.json` with `state=off`,
connectionNames ∈ closed set) + the no-credentials static grep. Add the new Functions to the pytest
sweep and the new flows/connectors to the linters.

---

## 15. "Done" definition for M2

> An enriched (DVSA mileage/make-model, document-authoritative), human-reviewed, **image-classified**
> `ready_for_eva` Case is **submitted to the EVA test environment via the Sentry REST API** (12-field
> core + Impact Images in the two-request photo order) **and archived to Box** (UPPERCASE Case/PO
> folder) in one idempotent finalisation — with the **drag-drop JSON path** as the proven permanent
> fallback, **on-demand valuation** attachable, **kill-switched email chasers** sendable, and the
> **EVA production cutover** staged behind a passing parity test. All integrations remain **gated**
> and default-off; nothing crosses the live-services boundary without the operator.
