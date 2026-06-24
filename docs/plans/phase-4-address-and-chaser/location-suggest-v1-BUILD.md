# Phase 4a — Live location-suggestion assist (helper #3): v1 BUILD report + ACTIVATION RUNBOOK

> **Status: BUILT OFFLINE, GATED-OFF (2026-06-24).** All layers authored, unit-tested, and shipped
> **dark** — no Azure provisioned, no Function deployed, no connector bound, no gate flipped. Box is
> **dormant**, so live photo bytes are read behind a **stubbed seam**. The operator activates (see the
> [ACTIVATION RUNBOOK](#activation-runbook-reserved-for-user)).
>
> Design spec: [live-location-suggestion-assist.md](./live-location-suggestion-assist.md). Deferred
> GPT-4o escalation (out of scope for v1): [gpt4o-reasoning-escalation.md](./gpt4o-reasoning-escalation.md).
> Binding boundary: **ADR-0013** — the inspection address is **never auto-resolved**; this feature returns
> **candidate suggestions a human confirms**.

---

## 1. What this is (one paragraph)

When a case is under review and **neither the suggestion corpus nor the case documents identify the
inspection location**, a reviewer invokes a **"Suggest location"** action. A `location-suggest` Azure
Function runs **Azure AI Vision** (Image Analysis + Read OCR) over the case's **own** photos and **Azure
Maps** geocode over the case's text clues (accident circumstances + claimant address), ranks the results,
and returns **candidate locations with plain-language provenance + a confidence indicator**. The reviewer
**picks one** (→ manual decision) **or** records **"Image Based Assessment" + a reason**. **Nothing
auto-applies**; candidates stay `decisionMode=Unknown` until a reviewer confirms. The action is
**reviewer-invoked only** — never wired into the automatic intake flow.

---

## 2. What was built, per layer

### Layer A — Dataverse schema + gates (offline manifests; not applied live)

| File | What changed |
|---|---|
| `dataverse/schema/case.json` | New column **`cr1bd_evaclaimantaddress`** (Memo, 2000) — claimant postal address captured at intake; a **Case-identity/intake-capture clue** (like `vrm`/`caseRef`), **NOT** one of the 12 EVA payload fields, used **only** as a geolocation text clue; `mustNotDriveWorkflow`. |
| `dataverse/environment-variables.json` | New gate **`cr1bd_LOCATION_ASSIST_ENABLED`** (Boolean, default `false`) + new per-env config **`cr1bd_LOCATION_ASSIST_API_BASE`** (String, default `''`). Notes updated: live assist requires **both** this gate **and** the reused `cr1bd_AZURE_MAPS_ENABLED` true **and** the API base set; the Function never reads the gate (gated upstream, like `PDF_MAPPER_ENABLED`); Vision/Maps keys are **Key Vault**, never env-vars; no Azure OpenAI/Foundry secret in v1. |
| `dataverse/choicesets/audit-event.json` | New audit action **`location_assist_confirmed`** (100000022) — **reserved/forward-declared** (see finding F2/F4 below). |

### Layer B — `location-suggest` Azure Function (Python, Functions v2; authored offline)

Directory: `functions/location-suggest/`

| File | Role |
|---|---|
| `function_app.py` | HTTP trigger `POST /location-suggest`, FUNCTION auth (`x-functions-key`). Parses + validates body, builds deps (stubbed Box seam + lazy Vision/Maps), runs the orchestrator, returns the camelCase candidate envelope. Status codes mirror the parser: 200 (incl. zero-candidate), 400, 422 (all photos unreadable & no clue), 500, 502 (Vision/Maps not configured). **Never reads/writes a Case row** (`case_id` is correlation only). |
| `location_suggest.py` | Pure orchestration core: ranks geocoded candidates (confidence + proximity + corpus overlap), clamps `max_candidates`, raises `AllPhotosUnreadable`. |
| `vision_client.py` | Azure AI Vision (Image Analysis + Read OCR) client; key from a Key Vault reference, lazy; `VisionNotConfigured` when unwired. |
| `maps_client.py` | Azure Maps Search/Geocode client (UK-biased); key from a Key Vault reference, lazy; `MapsNotConfigured` when unwired. |
| `clue_extraction.py` | Best-effort place/postcode pull from the accident-circumstances + claimant-address text clues. |
| `photo_source.py` | **The only Box seam.** `PhotoSource` Protocol; **`StubPhotoSource`** (default while Box dormant — serves bytes from an in-memory fixture map, never calls Box); **`BoxPhotoSource`** (activation-only, present but **unimplemented** so a premature wire-up is loud); `get_photo_source()` factory selects the stub unless `BOX_API_ENABLED` is true. |
| `infra/main.bicep` | Linux Python Function on **Flex Consumption (FC1)** + Storage (identity-based, no account keys) + Key Vault (RBAC). Vision/Maps keys as **`@Microsoft.KeyVault(...)` references** (no literals); MI granted Key Vault Secrets User + Storage Blob Data Owner. `BOX_API_ENABLED` defaults `false` → stub photo source. Endpoints/versions are non-secret app settings. |
| `host.json`, `requirements.txt`, `requirements-dev.txt`, `.funcignore`, `local.settings.json.TEMPLATE`, `README.md` | Standard Function scaffolding + template (no secret literals). |
| `tests/` | `test_location_suggest.py`, `test_clue_extraction.py`, `test_photo_source.py`, `test_vision_maps_clients.py`, `conftest.py`, `fakes.py` — Vision/Maps/Box-seam all mocked. |

### Layer C — Custom connector (authored offline; NOT deployed/bound)

Directory: `connectors/location-suggest/`

| File | Role |
|---|---|
| `apiDefinition.swagger.json` | "CE Location Assist" connector OpenAPI — `SuggestLocation` operation; request/response bodies mirror the Function contract exactly (so the pac generator produces a matching service). |
| `apiProperties.json` | `api_key` connection parameter = the Function key, sent as **`x-functions-key`** (lives on the **connection**, never in the bundle). |

### Layer D — Code App (Power Apps Code App; React/Vite)

| File | Role |
|---|---|
| `mockup-app/src/data/location-assist-client.ts` | Pure, SDK-free client: `SuggestLocationRequest`/`Response` types, `buildSuggestLocationRequest(...)` (omits empty clues), `suggestLocations(req, transport)` over an injectable `LocationAssistTransport`. |
| `mockup-app/src/data/location-assist-connector-transport.ts` | **Structural** bridge from the pac-generated `CollisionEngineersLocationAssistService.SuggestLocation` to the client transport (no SDK/`generated/` import — injected at startup, like the dormant Box connector). |
| `mockup-app/src/data/location-assist-gate.test.ts`, `…-client.test.ts`, `…-connector-transport.test.ts` | Unit tests for the gate read, client builder/transport, and connector bridge. |
| `mockup-app/src/data/types.ts` | `LocationAssistGate` type + `LOCATION_ASSIST_GATE_ALL_OFF` + `LOCATION_ASSIST_ENV_VAR_SCHEMA_NAMES`; `CaseRecord.cr1bd_evaclaimantaddress`. |
| `mockup-app/src/data/dataverse-source.ts` | `getLocationAssistGate()` — reads the env-var table the **same** way `getBoxGates` does; `enabled` = AND of the three vars; **honest off** on any read failure. |
| `mockup-app/src/data/mock-source.ts` | `getLocationAssistGate()` resolves `LOCATION_ASSIST_GATE_ALL_OFF` (off until the live source is injected). |
| `mockup-app/src/data/hooks.ts` | `useLocationAssistGate()` React-Query hook. |
| `mockup-app/src/data/index.ts` | Re-exports + `configureLocationAssistTransport(...)` (active transport, not-connected default). |
| `mockup-app/src/data/adapter.ts` | Maps `cr1bd_evaclaimantaddress` ↔ domain `Case.claimantAddress` in `caseFromRecord`/`caseToRecord` (**finding F5 fix**). |
| `mockup-app/src/mock/types.ts` | `Case.claimantAddress?: string` (Case-identity clue) — **finding F5 fix**. |
| `mockup-app/src/main.tsx` | Inline operator wiring comment for `configureLocationAssistTransport(...)` after `pac code add-data-source`. |
| `mockup-app/src/screens/CaseDetail.tsx` | Address-tab **"Suggest location"** action (hidden unless gated on), `onSuggestLocation` (builds the request from already-loaded photos + clues, calls the injected transport, stores candidates in working-copy state), candidate render, and the **shared confirm path** (`useSuggestion` → `resolveInspectionDecision` → `decisionMode='manual'`). All plain-language UI strings. |

**UI-string compliance:** no engineering terms in any rendered string — "Suggest location", "Suggested from
the photos", "Couldn't suggest a location — try again", etc. (no GPT/LLM/model/API/Function/Azure/Vision/OCR).

---

## 3. Verify results

| Check | Result |
|---|---|
| Code App typecheck (`tsc -b`) | **PASS** (exit 0) |
| Code App tests (`vitest run`) | **PASS** — 19 files, **312 tests** |
| Function tests (`pytest -q`, `functions/location-suggest`) | **PASS** — **59 tests** |
| Edited JSON well-formed | **PASS** — `audit-event.json`, connector `apiDefinition.swagger.json` + `apiProperties.json` all parse |

**ADR-0013 behavioural verify (build-step 7):** confirmed in code + tests —
- the Function **never** reads/writes a Case row (`case_id` is correlation only);
- candidates surface **strictly as suggestions**; `useSuggestion` routes every pick through
  `resolveInspectionDecision('prefer_address', …, { choice: 'use_physical_address' })` and **bails** if the
  resolver returns image-based / needs-reviewer-decision — so a pick is always an explicit **manual** human
  decision, never an auto-apply;
- nothing fires on load — only the explicit button click calls out;
- the action is **hidden** unless `LOCATION_ASSIST_ENABLED && AZURE_MAPS_ENABLED` (+ API base) are on; the
  gate read returns **all-off** on any failure.

---

## 4. Confirmed review findings + resolution

| # | File / locus | Sev | Finding (summary) | Resolution |
|---|---|---|---|---|
| **F1** | `CaseDetail.tsx` (784/897/921/1347) | low | Comments said `confirmedProvenance` "is persisted for the save (`cr1bd_sourcelabel`+`cr1bd_sourcenote`)", but the screen has **no save/update path** — it is local working-copy state. Comment-accuracy issue, not a runtime regression. | **FIXED** — reworded all four comments to say the provenance is **captured for a FUTURE save path (not yet wired)**; this screen writes nothing today. No behavioural change. |
| **F2** | `dataverse/choicesets/audit-event.json` (33) | low | New audit choice `location_assist_confirmed` (100000022) has **no emitter** anywhere. Forward-declared. | **DEFERRED (intentional)** — kept as a **reserved/forward-declared** choice; added a `description` note marking it reserved for the Phase-4a confirm/save path and pointing here. Adding an emitter would require building the unwired save path + a flow (out of v1 scope); see [pending emitter](#pending-emitter-audit). |
| **F3** | `CaseDetail.tsx` (787/921/1347-1348) | low | `confirmedProvenance.sourceLabel` (`'suggested:assist'`) is **dead state** — only `.sourceNote` is read (caption); the label is never persisted/consumed. | **FIXED (comment)** — kept the field (it is the exact value the future save will write to `cr1bd_sourcelabel`) and **softened the comments** to state only `sourceNote` is consumed today and `sourceLabel` is held for the future save. Dropping the field was rejected to avoid re-adding it at activation; threading it into a write is part of the deferred save path (F2/F4). |
| **F4** | `dataverse/choicesets/audit-event.json` (34) | low | The `location_assist_confirmed` member is defined but **emitted by nothing** — the "Provenance + audit" build step is incomplete: vocabulary exists, never used. | **DEFERRED (intentional)** — same as F2; marked reserved-for-activation. The audit write is wired when the confirm/save path exists (see [pending emitter](#pending-emitter-audit)). |
| **F5** | `CaseDetail.tsx` (`onSuggestLocation`) | **medium** | The claimant-address clue was **dead in the live path**: `cr1bd_evaclaimantaddress` was in the schema + `CaseRecord` but **never threaded** through `adapter.ts`/`dataverse-source.ts`/the domain `Case`. CaseDetail read it via an unsafe cast `(c as unknown as { evaClaimantAddress?: string }).evaClaimantAddress` → **always `undefined`** at runtime, so one of the two designed geolocation clues never reached the Function from the live UI. | **FIXED** — added `Case.claimantAddress` to the domain type (`mock/types.ts`), mapped `cr1bd_evaclaimantaddress` ↔ `claimantAddress` in `caseFromRecord`/`caseToRecord` (`adapter.ts`), and replaced the unsafe cast in `CaseDetail.onSuggestLocation` with the typed `c.claimantAddress`. Stale comments referring to threading "via `overviewFacts.claimantAddress` once the domain type + adapter carry it" updated. All 312 TS tests + typecheck still green. |

<a id="pending-emitter-audit"></a>
**Pending emitter for `location_assist_confirmed` (F2/F4) + the provenance write (F1/F3).** The
`CaseDetail` review screen is a **non-persisting working copy** (no save/update mutation exists for the
inspection address). When the **InspectionAddress upsert** is wired (Code App mutation or a flow), it should:
1. write the confirmed inspection address with `cr1bd_sourcelabel = 'suggested:assist'` + `cr1bd_sourcenote`
   (the captured `confirmedProvenance`) on a live-assist pick; and
2. emit an `AuditEvent` with `cr1bd_action = location_assist_confirmed` (100000022).
This is a small, contained forward-work item; it does not block v1 (which ships dark).

---

## 5. Architecture invariants honoured (build constraints)

- **Built offline, gated-off** — no deploy, no `pac push`, no `az … create`, no live gate flip, no tenant call.
- **ADR-0013** — Function never writes a Case's EVA address; candidates stay `Unknown` until a human confirms;
  nothing auto-applies.
- **Plain business language** in every rendered string — no engineering terms.
- **Box dormant** — photo bytes read behind the stubbed `PhotoSource` seam; the real `BoxPhotoSource` is an
  explicit, marked activation step.
- **Standalone Azure only** — Azure AI Vision + Azure Maps; **no Azure OpenAI/Foundry** in v1 (GPT-4o is the
  deferred escalation). Secrets are **Key Vault references**, never literals.
- **Autogenerated files untouched** (`mockup-app/src/generated/**`); sibling `../cedocumentmapper_v2.0`
  untouched; surrounding code style matched.

---

<a id="activation-runbook-reserved-for-user"></a>
## 6. ACTIVATION RUNBOOK — [RESERVED-FOR-USER]

> Every step below requires the **operator** (live Azure / tenant credentials, deploy, gate flip). Nothing
> here is run during the build. Order matters: provision → deploy → connector → wire → gate.

**[RESERVED-FOR-USER] 1 — Provision Azure (Maps + AI Vision + Key Vault + Function host).**
- Deploy `functions/location-suggest/infra/main.bicep` to the target resource group (e.g. with
  `az deployment group create`). It provisions the FC1 Function host, Storage (identity-based), Key Vault
  (RBAC), and the MI role assignments. **Vision/Maps key VALUES are NOT in the template** — see step 2.
- Provision (or reuse) **Azure Maps** (Gen2 — free monthly grant) and **Azure AI Vision** (F0→S0). Keep
  them UK-biased (`AZURE_MAPS_COUNTRY_SET=GB` is the bicep default).

**[RESERVED-FOR-USER] 2 — Inject the Key Vault secret VALUES.**
- Put the Azure AI Vision key into the KV secret named **`azure-vision-key`** and the Azure Maps key into
  **`azure-maps-key`** (the bicep declares the `@Microsoft.KeyVault(...)` **references**; the Function MI
  already has Key Vault Secrets User). **Never** place a key literal in code or in a Dataverse env-var.

**[RESERVED-FOR-USER] 3 — Deploy the Function.**
- Publish `functions/location-suggest/` to the provisioned Function app (e.g. `func azure functionapp
  publish <name>`). Confirm `POST /location-suggest` responds and that Vision/Maps resolve from Key Vault
  (no 502 `dependency_not_configured`). With Box dormant, the **stub photo source** is in effect — Vision
  will have no bytes until Box is live (step 6), so expect text-clue-only suggestions until then.

**[RESERVED-FOR-USER] 4 — Create + bind the custom connector.**
- Add the **"CE Location Assist"** connector from `connectors/location-suggest/apiDefinition.swagger.json`
  + `apiProperties.json` to the environment (`pac code add-data-source`, or import the connector).
- Set the connector **host** to the deployed Function hostname; create a **connection** holding the Function
  key as **`x-functions-key`** (`api_key`). The key lives on the connection, never in the bundle.

**[RESERVED-FOR-USER] 5 — Wire the Code App transport + redeploy the app.**
- After the connector generates its service, uncomment the block in `mockup-app/src/main.tsx`:
  ```ts
  import { configureLocationAssistTransport } from './data';
  import { makeConnectorLocationAssistTransport } from './data/location-assist-connector-transport';
  import { CollisionEngineersLocationAssistService } from './generated/services/CollisionEngineersLocationAssistService';
  configureLocationAssistTransport(
    makeConnectorLocationAssistTransport(CollisionEngineersLocationAssistService),
  );
  ```
- Rebuild + deploy the Code App (`pac code push`).

**[RESERVED-FOR-USER] 6 — Box dependency for LIVE photo bytes.**
- The live assist's **Vision pass needs photo bytes from Box**, so it depends on the **Phase-7 Box
  integration being active** (`BOX_API_ENABLED=true`, Box CCG secrets in Key Vault). Until then the Function
  uses `StubPhotoSource` (no Box) and degrades to **text-clue-only** suggestions.
- **Activation work in `photo_source.py`:** implement `BoxPhotoSource.fetch_bytes` — mint a CCG token
  **inside the Function** (the `functions/box-webhook/box_client.py` pattern; `grant_type=client_credentials`,
  `box_subject_type=enterprise`, `client_secret` from a KV reference), `GET /2.0/files/{box_file_id}/content`,
  and map Box 404/403 to `PhotoUnavailableError` (per-photo warning). Then flip `BOX_API_ENABLED=true` so
  `get_photo_source()` selects it. The connector NEVER mints the token.

**[RESERVED-FOR-USER] 7 — Flip the gate(s).**
- Set, per environment (Dataverse env-var **currentValue**):
  - **`cr1bd_LOCATION_ASSIST_ENABLED = true`**,
  - **`cr1bd_AZURE_MAPS_ENABLED = true`** (reused), and
  - **`cr1bd_LOCATION_ASSIST_API_BASE = <deployed Function host base>`**.
- The "Suggest location" action appears only when **all three** are on; the gate read returns all-off (action
  hidden) on any failure.

**[RESERVED-FOR-USER] 8 — (Forward work) provenance write + audit emitter.**
- Wire the **InspectionAddress upsert** so a confirmed live-assist pick writes `cr1bd_sourcelabel =
  'suggested:assist'` + `cr1bd_sourcenote`, and emits an `AuditEvent` with `cr1bd_action =
  location_assist_confirmed` (100000022). See [pending emitter](#pending-emitter-audit). Not required to
  switch the feature on, but completes the "Provenance + audit" build step.

**[RESERVED-FOR-USER] 9 — Docs reconciliation (build-step 8).**
- Re-aim **ADR-0016 helper #3** + `inspection-address-revamp.md` from "offline mining only" to this live
  assist (they are superseded by the 2026-06-24 ADR-0013 clarification); mark
  `live-location-suggestion-assist.md` BUILT.

---

## 7. Deferred — GPT-4o reasoning escalation (separate later phase, OUT OF SCOPE for v1)

The optional **GPT-4o reasoning pass** for hard cases is **deferred to a later phase** and is **explicitly
out of scope** here. It is the only path that always bills (no free tier). v1 ships **standalone services
only** (Vision + Maps). When taken up it is a separate decision: a new `AZURE_OPENAI_*` secret set (Key
Vault), a `suggested:ai_reasoning` provenance label, and its own gate — researched + planned in
[gpt4o-reasoning-escalation.md](./gpt4o-reasoning-escalation.md). Do **not** wire it as part of activating v1.
