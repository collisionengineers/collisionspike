# EVA Sentry REST v1.2 submission — activation, parity, prod cutover (ROADMAP 3c)

> **Status:** planning + activation runbook. The Function **is already built offline**
> (`functions/evasentry/`, task #34, **42 pytest green** via the project venv 2026-06-19); this plan documents that artifact,
> specifies the deploy → connector-bind → **test** flip → **parity-gated production cutover** sequence,
> and resolves the **one** unconfirmed contract question (Impact-Image shape). It is the deep dive behind
> **ROADMAP §3c "EVA — Sentry REST API (later)"** that [m2-umbrella-enrichment-to-scale.md](../m2-umbrella-enrichment-to-scale.md)
> §7 (M2.C) only sketches. Companion to the **`eva-sentry-api`** skill,
> [docs/architecture/eva-sentry-api.md](../../../docs/architecture/eva-sentry-api.md), ADR-0005, AGENTS.md.
> Author date **2026-06-18**. Read-only research; **no code/flows/Dataverse changed by this plan**.

---

## 0. TL;DR decision

**The EVA Sentry REST submit path is code-complete offline; what remains is operator activation gated
behind a parity test — not new engineering.** The single decisive design fact (Microsoft Learn, verified
2026-06-18) is that **EVA auth cannot live on the Power Platform custom connector**, because *"client
credentials grant type isn't supported"* by custom connectors
([Custom connector FAQ](https://learn.microsoft.com/connectors/custom-connectors/faq#requirements)) and
*"custom connectors use the authorization code flow"*
([Verify OAuth configuration](https://learn.microsoft.com/troubleshoot/power-platform/power-automate/connections/verify-oauth-configuration#verify-oauth-flow)).
EVA's `POST /Connect/token` is a `Client_Id`/`Client_Secret` body exchange returning a **5-minute** JWT
with no authorization-code/refresh story. Therefore the token is minted, cached, and attached **inside
`functions/evasentry/eva_client.py`**; the `cr1bd_evasentry` connector is **function-key only, no OAuth
security definition**. This is already how the built Function works — this plan does not re-litigate it.

**`EVA_API_ENABLED` stays `false` in M1.** The **JSON drag-drop export is the M1 path and the permanent
fallback** (ADR-0005). The REST path is a *later* enhancement that an operator switches on **in a test
env first**, proves at parity with the drag-drop body, then cuts over to production behind an
operator-confirmed gate. Nothing here is on the M1 critical path.

---

## 1. What is already built (verified in-repo, 2026-06-18)

| Asset | State | Evidence |
|---|---|---|
| `functions/evasentry/function_app.py` | **Built** — HTTP trigger `POST /api/eva/instruction-inspection`; **gate-at-edge** (`EVA_API_ENABLED` re-checked server-side); validate-before-token; soft-fail → `submitted:false` (flow falls back to drag-drop) vs `400` on a malformed payload. | read 2026-06-18 |
| `functions/evasentry/eva_client.py` | **Built** — `POST {EVA_BASE_URL}Connect/token` (`x-www-form-urlencoded`, `Client_Id`+`Client_Secret`), `expires_in` **minutes → seconds** with a **30 s** skew cache, **401 → refresh once → retry**; patterned on `functions/enrichment/dvsa_client.py`. | README §"The modules" |
| `functions/evasentry/payload.py` | **Built, pure** — `validate_core_payload` (12-field membership/format, **parity-tested** against `contracts/eva-payload.schema.json`), `order_impact_images` (**2 previews then full sequence incl. those two again**), `build_instruction_inspection` (12-field core **byte-identical** to the drag-drop body + ordered images). | README §"payload.py" |
| `functions/evasentry/openapi/evasentry-connector.json` | **Built** — OpenAPI **2.0**, one operation on `/eva/instruction-inspection`, **function-key (`x-functions-key`), NO OAuth**. (Verified: `node` parse OK; `swagger=2.0`.) | this plan §9 |
| `functions/evasentry/infra/main.bicep` | **Built** — Flex Consumption Function + Storage + Key Vault + system-assigned MI granted *Key Vault Secrets User*; `EVA_CLIENT_ID/SECRET` as `@Microsoft.KeyVault(SecretUri=…)` refs; `EVA_BASE_URL` plain. | README §"Secret handling" |
| `functions/evasentry/tests/` | **Green** — **42 pass** (validate-before-mint; minutes→seconds TTL+skew; 401 self-heal; image ordering; `EVA_PAYLOAD_KEYS`==schema; no secret/token in logs). Use the project venv (`.venv` has `httpx`/`respx`/`azure-functions`); bare `python` errors on the missing `httpx` import only. | `.venv/Scripts/python -m pytest -q` 2026-06-19 |
| `flows/definitions/finalize-eva-box.definition.json` | **Imported `state=off`** — calls connector operation `InstructionInspection` under the `EVA_API_ENABLED` transport gate; **Box archival runs regardless** of transport; `cr1bd_finalizedpayloadhash` idempotency latch. | phase-2 §2 |
| `cr1bd_evasentry` connection reference | **Unbound** (connector exists; connection `None`). | phase-2 §2 table |
| Dataverse env-vars `EVA_API_ENABLED` / `EVA_BASE_URL` / `EVA_CLIENT_ID` / `EVA_CLIENT_SECRET` | **Exist**; `EVA_API_ENABLED` default **false**; the two secrets are **Key-Vault-reference-only, no values**. | `dataverse/environment-variables.json` |

**Implication:** §3c is **~90 % an activation task.** The only genuine *build* uncertainty is the
Impact-Image field shape (§5), which can only be resolved against the EVA **test** server and is already
isolated behind a single, clearly-named `impact_images` key with a TODO.

---

## 2. Boundary legend (per AGENTS.md + memory `live-services-boundary`)

| Tag | Meaning | Who |
|---|---|---|
| **[BUILD]** | Authored + verified **offline** (Function code, Bicep, OpenAPI, pytest). Zero tenant/Azure/EVA contact. **Done.** | Claude |
| **[DEPLOY-WITH-LOGIN]** | Deploy the Function / Key Vault, import the connector, set the **non-secret** `EVA_BASE_URL`, read-only `az`/`pac` GETs. Touches the tenant; **no** secret values; **no** prod gate flip. | Operator (Claude may draft exact commands + run read-only GETs) |
| **[RESERVED-FOR-USER]** | Inject the real EVA **test** `Client_Id`/`Client_Secret` into Key Vault, bind `cr1bd_evasentry`, **flip `EVA_API_ENABLED=true` (test)**, run a live submit, and the **production cutover**. | **Operator only** |

**CSP (AGENTS.md truth #1):** the Code App never calls EVA directly. `finalize-eva-box` (a cloud flow,
server-side HTTP, CSP-exempt) calls the `cr1bd_evasentry` connector. **Flow-webhook rule (truth #2):**
`finalize-eva-box` is `Request`/child-triggered, **not** a connection-webhook trigger, so turning it on
is a state toggle — no designer re-publish dance (memory `flow-webhook-trigger-provisioning`).

---

## 3. The submission flow (end-to-end)

```
finalize-eva-box (flow, OFF→ON)
  │  reads EVA_API_ENABLED (transport gate) + EVA_BASE_URL
  │  ├─ EVA_API_ENABLED=false → DRAG-DROP path: emit 12-field JSON (eva-export.ts) for staff drag-drop
  │  └─ EVA_API_ENABLED=true  → REST path:
  │        POST cr1bd_evasentry / InstructionInspection
  │             { evaPayload12, casePo(lowercase), images[], payloadHash }
  ▼
Func_EvaSentry  (functions/evasentry, function-key)
  │  gate-at-edge re-check (defence in depth)
  │  validate_core_payload(12 fields)  ── invalid ─▶ 400 (never contacts EVA)
  │  EvaClient: mint/cache JWT (POST {EVA_BASE_URL}Connect/token, KV creds)
  │  build_instruction_inspection: 12-field core verbatim + order_impact_images
  │  POST {EVA_BASE_URL}Instruction/Inspection  (Authorization: Bearer)
  │       ├─ 200 → { submitted:true, evaRef, transport:"sentry_rest" }
  │       └─ 401/5xx/cred-missing → { submitted:false, warnings:[…] }  (SOFT-FAIL)
  ▼
finalize-eva-box continues:
  • Box archival ALWAYS (UPPERCASE Case/PO folder; photo-order step) — unison with submit
  • on submitted:false → leave Case for manual review / drag-drop (no hard error)
  • AuditEvent: eva_submitted (or eva_submit_skipped) with transport + payloadHash
```

Two invariants this preserves: **(a)** the REST 12-field core is **byte-identical** to the drag-drop body
for those 12 fields (the parity test, §6); **(b)** **Box always runs** — the EVA transport choice never
gates archival (integrations.md §Box; ADR-0008 tool boundary ends at the EVA handoff).

---

## 4. The two-request photo question (the one real protocol unknown)

The `eva-sentry-api` skill and the architecture doc both flag that image submission is **"likely two
requests" — previews first, then the remaining images — confirm on the test env.** The built
`payload.py::order_impact_images` already produces the correct **order** (2 previews, then the full
sequence including those two again). What is **not** confirmed is *transport*:

| Option | Shape | Where it's handled today |
|---|---|---|
| **(a) Inline** | base-64 `impact_images[]` entries on the **single** `POST /Instruction/Inspection` body. | `build_instruction_inspection` attaches under `impact_images` (clearly-named, easily renamed). |
| **(b) Two-call** | `/Instruction/Inspection` (the 12-field core) **then** a separate previews/images submission call. | Not built — would add a second `EvaClient` method + a `SubmitPreviews`/equivalent connector op. |

**Resolution path (operator, against EVA test):** re-read `docs/reference/Sentry API Documentation 1.2
Amended.pdf` for the exact Impact-Image field name(s); submit one real overview+damage set to the EVA
**test** server; capture the accepted shape. If **(a)**, rename the `impact_images` key to EVA's field
name in `payload.py` (one-line `[BUILD]` change + a fixture). If **(b)**, add the second `EvaClient`
method and a second connector operation, and split the flow action into previews-then-rest. **Do not
finalise the connector until this is captured from the test env.** (Tracked as §10 Q1.)

---

## 5. EVA `Instruction/Inspection` payload is richer than the 12-field core

The 12-field core is the **drag-drop** contract. The REST `Instruction/Inspection` body additionally
carries vehicle/claim identity, multiple postcodes (repairer / inspection / salvage),
`DamageType`/`DamageType2`/`DamageType3`, claim type, estimate/cost fields, and the base-64 Impact Images
(`eva-sentry-api` skill §"Implementation notes"). **M1/3c scope = submit the 12-field core + ordered
images**; the richer optional fields are populated **only** where the parser/Dataverse already holds them
(no new capture UI in 3c). Anything EVA marks *required* beyond the 12 that we cannot source is a **§10
open question** to confirm on the test server before prod cutover — never invented.

---

## 6. Parity test — the gate that authorises the production cutover (ADR-0005)

ROADMAP §3c: *"Production cutover — gated behind a parity test; operator-confirmed."* Concretely:

- **Offline parity (already green, keep green):** `payload.py::EVA_PAYLOAD_KEYS` **equals**
  `contracts/eva-payload.schema.json` `propertyNames.enum` (a pytest asserts this). The REST core and the
  drag-drop core are the **same 12 keys in the same order**.
- **Cross-transport parity (the cutover gate — author as `[BUILD]`):** a test that takes one canonical
  Case, builds **both** the drag-drop JSON (`mockup-app/src/contracts/eva-export.ts`) **and**
  `build_instruction_inspection`'s 12-field core, and asserts they are **byte-identical for the 12
  fields** (dates `DD/MM/YYYY`; `VAT Status` ∈ {"",Yes,No}; `Mileage Unit` ∈ {"",Miles,Km}; Inspection
  Address 6 newline-separated lines; `Work Provider` non-empty). This proves "REST submit == drag-drop"
  so the cutover changes *transport only*, never *content*.
- **Live parity (operator, EVA test):** submit the same Case via REST to EVA **test**; confirm the EVA
  record matches what a drag-drop of the identical JSON would produce. Capture the `evaRef`.

The production gate is flipped **only after** all three pass and the operator confirms (B5).

---

## 7. Idempotency

Primary guard is the **flow's `cr1bd_finalizedpayloadhash` latch** (a Case already finalised for a given
payload hash is not re-submitted). The Function is **stateless** and simply **echoes `payloadHash`** back
for caller correlation (a server-side hash cache is intentionally omitted — `function_app.py` docstring;
phase-2 §7.2). EVA's own claim-matching (claim ref + postcode) is the backstop at the EVA side. This is
the `eva-sentry-api` skill's "idempotency by payload hash" realised at the flow layer.

---

## 8. Activation runbook (dependency-ordered)

> Prerequisite: **M2.B EVA validation surface** live (so `status-evaluate` can drive a Case to
> `ready_for_eva`) and a real `ready_for_eva` Case exists (phase-2 §6). The drag-drop transport
> (`EVA_API_ENABLED=false`) can finalise into Box **before** any of this (phase-2 M2.D).

| # | Step | Tag | Command / artifact |
|---|---|---|---|
| 1 | Confirm offline green. | [BUILD] (done) | `cd functions/evasentry && .venv/Scripts/python -m pytest -q` → 42 passed. |
| 2 | **Resolve the Impact-Image shape** against EVA test (§4); apply the one-line rename or the two-call addition; re-run pytest. | [BUILD] + [RESERVED-FOR-USER] to read test env | `payload.py` (+ fixture); `pdf` re-read. |
| 3 | Deploy the Function + Key Vault. | [DEPLOY-WITH-LOGIN] | `az bicep build functions/evasentry/infra/main.bicep`; `func azure functionapp publish <evasentry-host>` (rg-collisionspike-dev, UK South). |
| 4 | Set **non-secret** `EVA_BASE_URL=https://sentry.evasoftware.co.uk/api/` as a Function app setting **and** as the Dataverse env-var current value. | [DEPLOY-WITH-LOGIN] | `az functionapp config appsettings set …`; solution env-var. |
| 5 | **Inject EVA test creds** `eva-client-id` / `eva-client-secret` into Key Vault (the secret **names** already match the Dataverse refs). | [RESERVED-FOR-USER] | `az keyvault secret set …` (values from Infisical). |
| 6 | **Import the `cr1bd_evasentry` connector** from `openapi/evasentry-connector.json`; create its connection (function-key); **bind** `cr1bd_evasentry`. | [DEPLOY-WITH-LOGIN] (import) + [RESERVED-FOR-USER] (bind) | `pac connector create …`; `pac connection …`. |
| 7 | **Flip `EVA_API_ENABLED=true` in the TEST env only** (per-env current value — **never** the shipped default). | [RESERVED-FOR-USER] | solution env-var current value / `pac` env-var update. |
| 8 | **Turn ON `finalize-eva-box`**; run a real `ready_for_eva` Case end-to-end; confirm `submitted:true`, `evaRef`, **Box folder created (UPPERCASE)**, photo order, `eva_submitted` AuditEvent. | [RESERVED-FOR-USER] | flow state On; EVA test + Box test. |
| 9 | Run the **cross-transport + live parity** checks (§6). | [BUILD] + [RESERVED-FOR-USER] | parity pytest + EVA-test record compare. |
| 10 | **Production cutover** — repeat 5–8 with **prod** EVA creds (same `EVA_BASE_URL`; creds route the env), gated on §6 green + operator sign-off (B5). | [RESERVED-FOR-USER] | prod env-var flip; operator-confirmed. |

---

## 9. Verification

**Offline (pre-deploy, Claude):**
- `cd functions/evasentry && .venv/Scripts/python -m pytest -q` → **42 passed** (re-verified 2026-06-19; use the venv — bare `python` lacks `httpx`).
- `node -e "require('./functions/evasentry/openapi/evasentry-connector.json')"` parses; `swagger:2.0`;
  one path `/eva/instruction-inspection`; security `x-functions-key`, **no `securityDefinitions` OAuth**.
- `az bicep build functions/evasentry/infra/main.bicep` → no errors; no secret literals (KV refs only).
- New **cross-transport parity** pytest (§6) green.

**Live (operator; Claude may run read-only GETs):**
- Auth boundary: `POST /api/eva/instruction-inspection` **without** a function key → `401`; with key +
  malformed `evaPayload12` → `400` (never contacts EVA); valid + `EVA_API_ENABLED=false` → `200
  submitted:false`.
- CORS preflight from a flow context is N/A (server-side); but `curl.exe -X OPTIONS` with
  `Origin: https://apps.powerapps.com` should still answer if the connector is ever called from the app.
- Gate proof: with `EVA_API_ENABLED=false`, a finalise emits drag-drop JSON + Box, **no** EVA call.
- Secret hygiene: Function logs/App Insights show **no** `Client_Id`/`Client_Secret`/bearer (the client
  redacts; `EvaConfig.__repr__` masks). `GET` Key Vault → only references resolve at runtime.
- Token lifecycle: an integration trace on EVA test shows **one** token mint reused across submits within
  ~4.5 min, and a **single** refresh after a forced 401.

---

## 10. Open questions / uncertainties (resolve on the EVA test server)

1. **(BIGGEST) Impact-Image transport + field name(s)** — inline `impact_images[]` on
   `/Instruction/Inspection` vs a separate previews call (§4). Decides a one-line rename vs a second
   connector op. **Capture from EVA test before finalising the connector.**
2. **Required `Instruction/Inspection` fields beyond the 12 core** (§5) — confirm EVA's mandatory set on
   test; map only from data we hold; flag any gap (never invent).
3. **`evaRef` acknowledgement field name** — `function_app.py::_extract_ref` tries several
   (`evaRef`/`reference`/`claimRef`/`id`…); confirm the real key on test and pin it.
4. **Claim-matching keys for re-submit/update** — which field combo (claim ref + postcode?) EVA uses to
   match an existing claim, so a re-run updates rather than duplicates (interacts with §7).
5. **`expires_in` units sanity** — the skill says **minutes**; confirm against a live token response (the
   client assumes minutes→seconds + 30 s skew; a wrong unit would over/under-refresh).

---

## 11. Decision summary (one line)

**The EVA Sentry REST submit path is code-complete and 42-test-green offline (`functions/evasentry/`),
with the token lifecycle correctly server-side because custom connectors can't do client-credentials;
§3c is therefore an operator activation — deploy, inject EVA test creds, bind `cr1bd_evasentry`, flip
`EVA_API_ENABLED` in test, prove drag-drop↔REST parity, then cut over to production behind that parity
gate — with the sole remaining build question (Impact-Image shape) isolated behind one renamable key to
be captured from the EVA test server. `EVA_API_ENABLED` stays false in M1; drag-drop is the path and the
permanent fallback.**
