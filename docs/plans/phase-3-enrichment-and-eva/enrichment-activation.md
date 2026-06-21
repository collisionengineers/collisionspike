# DVSA/DVLA enrichment — activation runbook (ROADMAP 3a · M1 slice, lifted from M2.A)

> **Status:** activation runbook. The enrichment Function **is already built and deployed gated-OFF**
> (`functions/enrichment/`, live app `cespkenrich-fn-gi62sd`, **Running**, `ENRICHMENT_ENABLED=false`).
> This plan is the **standalone DVSA/DVLA go-live runbook** for ROADMAP §3a — the dependency-ordered
> sequence to take it from "deployed, dark" to "one real VRM enriched end-to-end in a **test** env",
> plus the **document-authoritative-mileage** acceptance tests (ADR-0006). It deepens the M2-graph
> sketch in [m2-umbrella-enrichment-to-scale.md §5 (M2.A)](../m2-umbrella-enrichment-to-scale.md) and is
> the §3a counterpart to the §3c runbook [eva-sentry-rest-submission.md](./eva-sentry-rest-submission.md).
> Author date **2026-06-20**. **Read-only research — no code, flows, Dataverse, or live resource changed
> by this plan.** Companion to the `azure-integration-engineer` + `power-automate-flow-builder` agents,
> ADR-0006, AGENTS.md, and [docs/gated.md](../../gated.md) (blocker **H4**).

---

## 0. Milestone placement (read this first)

Per the locked milestone model, **enrichment is an M1 capability** (the working vertical slice fills
DVSA mileage/make/model on one case end-to-end). The M2-umbrella doc *labels* the activation **M2.A**
only because the umbrella collects all "activate the gated-OFF integrations" runbooks in one place — the
**capability is M1, the runbook lives near M2**. Do not equate the two: 🔒 **3a = M1**, and nothing in
this doc is on the M2/M3 critical path. (Valuation — the `valuationbot` Companion-Report enrichment the
umbrella sketches as "M2.G" — is **M3**, gated `VALUATION_ENABLED=false`, off the EVA/Box critical path;
it is **out of scope here** and reconciled to M3 by ADR-0006's "valuation follows in M3" line.)

---

## 1. TL;DR decision

**§3a is ~90 % an operator activation task, not engineering.** Every artifact is built and offline-green:
the Function (`function_app.py` + `dvsa_client.py` + `dvla_client.py` + `analysis.py`), the Bicep
(`infra/main.bicep`, FC1 Linux Python 3.11 + Key Vault + system-assigned MI), the custom connector
(`openapi/enrichment-connector.json`, swagger 2.0, `x-functions-key`), and the cloud flow
(`flows/definitions/enrich.definition.json`, `CS Enrich`, `4e0f301f-8b21-48cc-8f4f-00b062fc7463`,
state **OFF**). The request/response shapes were **independently re-verified** against the *current* DVSA
MOT History API and DVLA Vehicle Enquiry Service (§4). What remains is the **H4** operator work that
crosses the live-services boundary and injects secrets: **DVSA Entra admin-consent**, **secret injection
to Key Vault**, **set `DVSA_TENANT_ID`**, **import + bind `cr1bd_dvsaenrich`**, and **flip
`ENRICHMENT_ENABLED` in a TEST env**. "Works fully" **cannot be proven by Claude** — without real DVSA/DVLA
credentials the upstreams are unreachable; the strongest offline evidence is the mocked pytest suite plus
a **no-secrets dry-run self-check** (config-wiring only, not the live contract).

**Two gotchas this runbook resolves up front:**

1. **Double gate.** Enrichment is gated **twice** — the Function self-gates on its `ENRICHMENT_ENABLED`
   *app setting* (`function_app.py` edge re-check) **and** the flow gates on the Dataverse
   `cr1bd_ENRICHMENT_ENABLED` *env-var* (`enrich.definition.json` `Get_gate_definition`). Flipping only
   one leaves enrichment **silently off** (the Function returns the `"ENRICHMENT_ENABLED is false"`
   advisory), which mis-diagnoses as a creds failure. **Flip both, in the test env only.**
2. **Latent default drift.** The Dataverse manifest ships `cr1bd_ENRICHMENT_ENABLED` `defaultValue:"true"`
   (`dataverse/environment-variables.json`) while the Bicep ships `enrichmentEnabled` **`false`**
   (`infra/main.bicep`). Both should express **"OFF until creds injected"**. This inconsistency is flagged
   in §6 for reconciliation **before** activation; this read-only plan does not edit either file.

---

## 2. Boundary legend (per AGENTS.md + memory `live-services-boundary`)

| Tag | Meaning | Who |
|---|---|---|
| **[BUILD]** | Authored + verified **offline** (Function code, Bicep, OpenAPI, flow JSON, pytest). Zero tenant/Azure/DVSA/DVLA contact. **Done** unless noted. | Claude |
| **[DEPLOY-WITH-LOGIN]** | Deploy the Function / Key Vault, import the connector, set **non-secret** app settings + env-vars, run read-only `az`/`pac` GETs. Touches the tenant; **no** secret values; **no** gate flip. | Operator (Claude may draft exact commands + run read-only GETs) |
| **🔒 [RESERVED-FOR-USER]** | Inject real DVSA/DVLA **secret values** into Key Vault, grant **Entra admin consent**, set `DVSA_TENANT_ID`, bind `cr1bd_dvsaenrich`, **flip `ENRICHMENT_ENABLED` (test)**, turn on `CS Enrich`, run the live VRM. | **Operator only** (and an **Entra tenant admin** for consent) |

**CSP rule (AGENTS.md truth #1):** the Code App never calls the enrichment Function directly. `CS Enrich`
(a cloud flow, server-side HTTP, CSP-exempt) calls the `cr1bd_dvsaenrich` connector
(`shared_dvsaenrich`). The Code App's gated DVLA/DVSA "Look up vehicle" button
(`mockup-app/src/data/enrichment-client.ts`) is the on-demand counterpart — see §8 open questions.
**Flow rule (truth #2):** `CS Enrich` is `Request`/child-triggered (not a connection-webhook trigger), so
turning it on is a state toggle — no designer re-publish dance (memory
`flow-webhook-trigger-provisioning`).

---

## 3. What is already built (verified in-repo + live, 2026-06-20)

| Asset | State | Evidence |
|---|---|---|
| `functions/enrichment/function_app.py` | **Built** — `POST /api/dvsa-mot/enrich`; **gate-at-edge** (`ENRICHMENT_ENABLED` re-checked); orchestration `enrich()`; **ADR-0006 mileage guard** (estimate only when `document_has_mileage` is `False`); **fail-soft** — always HTTP **200** with `warnings[]`, never bubbles. | read 2026-06-20 |
| `functions/enrichment/dvsa_client.py` | **Built** — Entra `client_credentials` token (`POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`, form-encoded, cached w/ **60 s** skew); `GET {api_base}/v1/trade/vehicles/registration/{reg}` with `Authorization: Bearer` **+** `X-API-Key`; **one 401 → drop-token → refresh-once → retry**; bounded backoff w/ jitter on retry-safe `errorCode`s `MOTH-FB-02`/`MOTH-RL-02`/`MOTH-UN-01`; 404 → `DvsaNotFoundError`. `__repr__` redacts every credential. | read 2026-06-20 |
| `functions/enrichment/dvla_client.py` | **Built** — `POST {base}/v1/vehicles`, `x-api-key`, body `{"registrationNumber": reg}`; retries on **status** 429/500/502/503/504; make-only fallback; skipped silently when `DVLA_API_KEY` absent (`DvlaNotConfigured`). | read 2026-06-20 |
| `functions/enrichment/analysis.py` | **Built, pure** — ported `vehicle_summary` + `current_mileage_estimate` (KM→miles normalise, clocking suppression, confidence bands). No I/O. | read 2026-06-20 |
| `functions/enrichment/tests/test_enrich.py` | **Green offline** — **18 respx-mocked pytest, zero network**: ADR-0006 mileage guard, DVLA make-only fallback, 401 self-heal, secret hygiene, estimate fixture **62400 / MEDIUM**. | `python -m pytest -q` |
| `functions/enrichment/infra/main.bicep` | **Built** — FC1 Linux Python 3.11; system-assigned MI granted **Key Vault Secrets User** (`4633458b-17de-408a-b874-0445c86b69e6`) + **Storage Blob Data Owner** (`b7e6dc6d-…`); DVSA/DVLA secrets as `@Microsoft.KeyVault(SecretUri=…)` app settings; `enrichmentEnabled` **default false**; `dvsaTenantId` **default `''`**; workspace-based App Insights (classic retired). | read 2026-06-20 |
| `functions/enrichment/openapi/enrichment-connector.json` | **Built** — swagger 2.0; one op `POST /dvsa-mot/enrich`, `operationId: EnrichDvsaMot`; `x-functions-key` security; `host` kept `REPLACE_WITH_FUNCTION_HOSTNAME.azurewebsites.net`. | read 2026-06-20 |
| `flows/definitions/enrich.definition.json` (`CS Enrich`) | **Imported, state OFF** — reads `cr1bd_ENRICHMENT_ENABLED` (+ derives `documentHasMileage` from `cr1bd_evamileage` empty?), calls `EnrichDvsaMot`, writes make/model + mileage **into EMPTY Case fields only** (else conflict path), audits `enrichment_called`. `workflowid 4e0f301f-8b21-48cc-8f4f-00b062fc7463`. | read 2026-06-20 |
| Live Function | **`cespkenrich-fn-gi62sd`** (rg `rg-collisionspike-dev`, UK South), KV `cespkenrichkv…`, **status Running**, gated OFF. | live-environment.md |
| `cr1bd_dvsaenrich` connection (`shared_dvsaenrich`) | **Unbound** (connector exists; connection `None`). | live-environment.md |

**Two structural gaps (not bugs — design choices to confirm at activation):**

- **(a) `CS Enrich` is not auto-wired into the live M1 chain.** The live chain today is
  intake → provider-match → case-resolve only; `CS Enrich` is OFF and `cr1bd_dvsaenrich` is unbound.
  Whether enrich runs **in the automated flow** (Run-a-Child-Flow after parse + status-evaluate) or stays
  an **on-demand Code-App "Look up vehicle" action** is an open question (§8) that decides the §5 wiring
  target. This runbook documents the **automated-flow** wiring as the designer step; it does not arm it.
- **(b) DVSA 429 under-retries vs DVLA.** `dvsa_client._get_with_retry` retries only on a JSON `errorCode`
  in `_RETRY_SAFE_CODES`; a **bare HTTP 429** with no/`!=`errorCode body soft-fails **without** backoff,
  whereas `dvla_client` retries 429 by **status**. DVSA documents `429 Too Many Requests` (RPS 15 / burst
  10 / 500k-day quota), so a retry storm or per-case-at-scale calls can trip it. **Hardening this to parity
  is a [BUILD] item (§6) — small code change, not part of this read-only plan's edits.**

---

## 4. Contract verification — request/response shapes, token flow, idempotency, errors

> Re-verified against the **current** upstream specs + an independent SDK + Microsoft Learn. These are
> the load-bearing facts the operator must not let drift at activation.

### 4.1 DVSA MOT History API (primary — make/model + mileage)

- **Token (Entra `client_credentials`).** `POST https://login.microsoftonline.com/{DVSA_TENANT_ID}/oauth2/v2.0/token`,
  `Content-Type: application/x-www-form-urlencoded`, body
  `grant_type=client_credentials&client_id=…&client_secret=…&scope=https://tapi.dvsa.gov.uk/.default`
  → `{ "access_token": "…", "expires_in": 3599 }`. Cached in-process, refreshed `expires_in − 60 s`.
  Confirmed on Microsoft Learn: *"Client credentials requests … must include `scope={resource}/.default`
  … Issuing a client credentials request by using individual application permissions (roles) is not
  supported"* ([Scopes and permissions §the `.default` scope](https://learn.microsoft.com/entra/identity-platform/scopes-oidc#the-default-scope);
  [Client credentials grant flow](https://learn.microsoft.com/entra/identity-platform/v2-oauth2-client-creds-grant-flow#get-a-token)).
- **Lookup.** `GET {DVSA_API_BASE}/v1/trade/vehicles/registration/{reg}` with **both** `Authorization:
  Bearer {token}` **and** `X-API-Key: {api_key}`. `DVSA_API_BASE` default **`https://history.mot.api.gov.uk`**.
  Returns the vehicle JSON (`make`/`model`/`motTests[]` with `odometerValue`/`odometerUnit`/
  `odometerResultType`). Confirmed against DVSA docs (`documentation.history.mot.api.gov.uk`) and an
  independent SDK (`github.com/0xnu/mot-history-api-py-sdk`).
- **Errors.** `404` → `DvsaNotFoundError` → soft "no MOT record" warning (triggers the DVLA make-only
  fallback for brand-new vehicles). `429 Too Many Requests` documented (RPS 15 / burst 10 / 500k-day) —
  **retry-safe** (see §3 gap (b)). JSON `errorCode`s `MOTH-FB-02`/`MOTH-RL-02`/`MOTH-UN-01` → bounded
  backoff. **Response bodies are never echoed** in errors (can reflect the request).
- **Drift watch:** `odometerUnit` casing (`mi`/`km`?) and the exact `errorCode` strings can only be
  confirmed on the first **live** call — a subtle real-world casing difference would surface there, not in
  the mocked suite.

### 4.2 DVLA Vehicle Enquiry Service (make-only fallback, new vehicles)

- `POST {DVLA_API_BASE}/v1/vehicles`, header `x-api-key: {DVLA_API_KEY}`, `Content-Type: application/json`,
  body `{ "registrationNumber": "<reg>" }` → DVLA vehicle JSON (`make`, `colour`, `yearOfManufacture`,
  `fuelType`, `taxStatus`, `motStatus`, …). `DVLA_API_BASE` default
  **`https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry`**, the client appends `/v1/vehicles`
  → `…/vehicle-enquiry/v1/vehicles` (correct). Confirmed against
  `developer-portal.driver-vehicle-licensing.api.gov.uk`.
- **No model field** — DVLA fills `make` only, and **only when DVSA gave nothing**. Retries on **status**
  429/500/502/503/504. **Confirm the operator's key is the VES production base, not test/UAT,** at
  injection (§8).

### 4.3 Idempotency & advisory contract

- The Function is **stateless** — no server-side cache; one DVSA lookup serves both `get_vehicle_summary`
  and the mileage estimate. **Idempotency is at the flow/Dataverse layer:** `CS Enrich` writes make/model
  + mileage **into EMPTY Case fields only** (a differing non-empty value is left for the conflict path,
  `reviewState=conflict`; never silently overwritten). Re-running enrich on an already-filled Case is a
  no-op on those fields.
- **Advisory, never blocks intake:** every DVSA/DVLA/auth/parse failure is captured as a `warning`; the
  Function still returns **200**. The flow's `Audit_enrichment_failed` runs after on `Failed`/`TimedOut`
  and continues.

### 4.4 Key Vault references — managed-identity resolution

`DVSA_CLIENT_ID`/`DVSA_CLIENT_SECRET`/`DVSA_API_KEY`/`DVLA_API_KEY` are app settings whose **values are
Key Vault references** (`@Microsoft.KeyVault(SecretUri=…)`), resolved by the platform via the Function's
**system-assigned MI** granted **Key Vault Secrets User**. Confirmed on Microsoft Learn:
*"Assign the **Key Vault Secrets User** role to the managed identity"*
([Use Key Vault references as app settings](https://learn.microsoft.com/azure/app-service/app-service-key-vault-references#grant-your-app-access-to-a-key-vault)).
`DVSA_TENANT_ID`/`DVSA_SCOPE`/`DVSA_API_BASE`/`DVLA_API_BASE` are **non-secret** plain settings.

---

## 5. The enrichment flow (end-to-end)

```
CS Enrich (flow, 4e0f301f…, OFF→ON)   — Request/child-triggered { caseId, vrm, reference }
  │  Get_case (cr1bd_cases) → derive documentHasMileage = not(empty(cr1bd_evamileage))   ── ADR-0006
  │  Get_gate_definition → Set_gate_ENRICHMENT_ENABLED  (reads cr1bd_ENRICHMENT_ENABLED env-var)
  │  If gate == true:
  │     Call_dvsa_enrich → POST cr1bd_dvsaenrich / EnrichDvsaMot
  │          { vrm, reference, document_has_mileage }
  ▼
cespkenrich-fn-gi62sd  (functions/enrichment, function-key)
  │  gate-at-edge re-check on ENRICHMENT_ENABLED app setting (defence in depth) → 200 advisory if off
  │  enrich(): DvsaClient.get_vehicle_by_registration(vrm)   (Entra token + X-API-Key, KV creds)
  │     ├─ make/model from get_vehicle_summary
  │     ├─ make==None → DvlaClient.get_vehicle(vrm)  (make-only fallback; skipped if unconfigured)
  │     └─ mileage estimate ONLY when document_has_mileage is False (ADR-0006) → unit always "Miles"
  │  → 200 { vehicle_model?, make?, current_mileage?, mileage_unit?, mileage_confidence?, warnings[] }
  ▼
CS Enrich continues:
  • Set_vehicle_model_if_empty → Patch cr1bd_evavehiclemodel   (EMPTY field only)
  • Set_mileage_if_doc_empty   → Patch cr1bd_evamileage + cr1bd_evamileageunit   (doc-empty guard)
  • Audit_enrichment_called (cr1bd_auditevents, action 100000011) ; else branch audits "(skipped)"
```

**Wiring into the automated chain (designer step, §3 gap (a)).** If enrich runs automatically, invoke
`CS Enrich` via **Run-a-Child-Flow** *after* `CS Parse` (so `cr1bd_vrm` + `cr1bd_evamileage` are set) and
*after* `CS Status Evaluate`, passing `caseId` + the Case **VRM** (`cr1bd_vrm`) + `reference`. This is a
**[DEPLOY-WITH-LOGIN]/designer** change to the *parent* flow, **not auto-wired** here — like the rest of
the chain it touches the live pipeline and must be operator-armed in a **test** env first.

---

## 6. Buildable now (Claude) — pre-activation hardening [BUILD]

These are the offline items that strengthen the artifact **before** the operator flips the gate. They are
listed for the build agent; **this read-only plan produces findings, not edits.**

- [ ] **Re-run the offline suite** to re-establish green: `python -m pytest -q` in `functions/enrichment`
  (18 respx-mocked, zero network). Strongest pre-creds proof of orchestration + ADR-0006 + analysis.
- [ ] **Harden DVSA 429/5xx to DVLA parity** (§3 gap (b)): treat a bare HTTP `429` (and optionally
  `500/502/503/504`) from the DVSA history `GET` as retry-safe with the existing bounded backoff, not only
  the JSON `errorCode`s. Add a **429-then-200** mocked test mirroring the existing 401 self-heal test.
- [ ] **Add a no-secrets DRY-RUN / self-check** to the Function — a `GET /api/enrich-selfcheck` (or a
  `{"dry_run":true}` branch) returning **config-presence booleans** (`DVSA_TENANT_ID`/`DVSA_CLIENT_ID`/
  `DVSA_CLIENT_SECRET`/`DVSA_API_KEY`/`DVLA_API_KEY` present? `token_url` resolved? `api_base`?) **without**
  calling DVSA/DVLA and **without echoing any secret value**, reusing `DvsaConfig.from_env`'s missing-name
  list. Add a mocked **leak-assertion** test. This lets the operator confirm Key Vault wiring + MI
  resolution end-to-end (step S4 below) with **zero quota spend and zero secret exposure**.
  ([Grant your app access to a key vault](https://learn.microsoft.com/azure/app-service/app-service-key-vault-references#grant-your-app-access-to-a-key-vault))
- [ ] **Reconcile the gate default drift** (§1 gotcha 2): align `dataverse/environment-variables.json`
  `cr1bd_ENRICHMENT_ENABLED` and Bicep `enrichmentEnabled` so both read **"OFF until creds injected"**,
  and document the **double-gate** in the `enrich.definition.json` comment (both the Function app setting
  **and** the Dataverse env-var must be `true`). *(Cross-doc reconciliation is handled separately — see
  the precedence note in [CLAUDE.md](../../../CLAUDE.md); do not edit shared docs here.)*
- [ ] **Connector correctness check** — validate `openapi/enrichment-connector.json` (swagger 2.0
  well-formed, `operationId EnrichDvsaMot`, request/response schema matches the Function body in/out,
  `x-functions-key` security). The import copy sets `host` to
  `cespkenrich-fn-gi62sd.azurewebsites.net` (kept `REPLACE_WITH_…` in the repo). Confirm the
  `api_key`/`x-functions-key` lesson (memory `codeapp-apikey-connector-connection`) is satisfied so the
  **connection** can carry the function key.
  ([Function keys](https://learn.microsoft.com/azure/azure-functions/function-keys-how-to#manage-key-storage))

---

## 7. Activation runbook (dependency-ordered) — A.1–A.7

> Maps the umbrella's **M2.A A.1–A.7** to this slice. Operator steps cross the **live-services boundary**;
> Claude may draft the exact commands and run read-only GETs only. Blocker registry: **H4**
> ([docs/gated.md](../../gated.md)).

| # | Step | Tag | Command / artifact |
|---|---|---|---|
| **A.1** | Confirm the enrichment Function deployment is current; **redeploy from current Bicep if drifted** (clears the managed-LAW RG sprawl noted in gated **S7**; re-confirms FC1 + MI + KV-ref settings). Injects **no** secrets, leaves the gate OFF. | **[DEPLOY-WITH-LOGIN]** | `az functionapp show -g rg-collisionspike-dev -n cespkenrich-fn-gi62sd`; if needed `az bicep build functions/enrichment/infra/main.bicep` then `func azure functionapp publish cespkenrich-fn-gi62sd`. ([Functions IaC](https://learn.microsoft.com/azure/azure-functions/functions-infrastructure-as-code#create-the-hosting-plan)) |
| **A.2** | 🔒 **Register/grant the DVSA Entra app.** Complete DVSA developer registration to obtain `client_id`/`client_secret`/`api-key`/scope/**tenant**; a **tenant admin** grants **admin consent** for the app's application permission on the DVSA API (client_credentials requires the `{resource}/.default` app-role be admin-consented). | **🔒 [RESERVED-FOR-USER]** (operator + **Entra admin**) | Entra app reg; `az ad app permission admin-consent --id <app-id>`. Record the tenant GUID for `DVSA_TENANT_ID`. ([the `.default` scope](https://learn.microsoft.com/entra/identity-platform/scopes-oidc#the-default-scope)) |
| **A.3** | 🔒 **Inject the secret VALUES** into KV `cespkenrichkv…`: `dvsa-client-id`, `dvsa-client-secret`, `dvsa-api-key`, `dvla-api-key` (names already match the Bicep refs). | **🔒 [RESERVED-FOR-USER]** | `az keyvault secret set --vault-name cespkenrichkv… --name dvsa-client-id --value …` (×4; values from Infisical). Function reads via `@Microsoft.KeyVault(SecretUri=…)`. ([Grant app access](https://learn.microsoft.com/azure/app-service/app-service-key-vault-references#grant-your-app-access-to-a-key-vault)) |
| **A.4** | Set the **non-secret** app settings: `DVSA_TENANT_ID` (the GUID from A.2 — **non-secret**), and confirm `DVSA_SCOPE` (`https://tapi.dvsa.gov.uk/.default`), `DVSA_API_BASE` (`https://history.mot.api.gov.uk`), `DVLA_API_BASE` (`…/vehicle-enquiry`). | **[DEPLOY-WITH-LOGIN]** | `az functionapp config appsettings set -g rg-collisionspike-dev -n cespkenrich-fn-gi62sd --settings DVSA_TENANT_ID=<guid>`. |
| **A.5** | **Import the enrichment custom connector** from `functions/enrichment/openapi/enrichment-connector.json` (host → `cespkenrich-fn-gi62sd.azurewebsites.net`); create its **connection** (carries the **function key**); **bind** `cr1bd_dvsaenrich`. Set the `cr1bd_ENRICHMENT_API_BASE` env-var to `https://cespkenrich-fn-gi62sd.azurewebsites.net`. | **[DEPLOY-WITH-LOGIN]** (import) + **🔒** (bind) | `pac connector create …`; connection w/ `x-functions-key`; solution env-var current value. The key lives **on the connection** (memory `codeapp-apikey-connector-connection`). |
| **A.6** | 🔒 **Flip `ENRICHMENT_ENABLED=true` in a TEST env only** — **both** gates: the Function **app setting** *and* the Dataverse `cr1bd_ENRICHMENT_ENABLED` **per-env current value** (never the shipped default). Then turn `CS Enrich` **ON**. | **🔒 [RESERVED-FOR-USER]** | `az functionapp config appsettings set … --settings ENRICHMENT_ENABLED=true`; `pac` env-var current value; flow state On. |
| **A.7** | 🔒 **Run one real VRM end-to-end** (test env) — the live proof (see §9 acceptance tests). | **🔒 [RESERVED-FOR-USER]** | EVA/Dataverse test; capture the `cr1bd_auditevents` row + patched Case fields. |

**Pre-gate self-check (between A.5 and A.6):** 🔒 the operator runs the **§6 dry-run self-check** against
the live Function to confirm the Key Vault refs **resolve via the MI** (all config-present booleans
`true`) with **no** secret exposure and **no** DVSA/DVLA call — closing the **RBAC-propagation race** (the
same one that bit the OCR deploy) before any quota spend. If A.1 recreated the MI, the **Key Vault Secrets
User** assignment must re-propagate first.

---

## 8. Acceptance tests — ADR-0006 document-authoritative-mileage guard 🔒

> The live proof of "works fully" (A.7). **Operator-run** in the **test** env (post-secret-injection,
> both gates true, `CS Enrich` ON). Offline equivalents are already green (§6 pytest).

1. **Mileage filled ONLY when the document lacks it (the ADR-0006 guard — primary case).** Take a Case
   whose **`cr1bd_evamileage` is empty** with a VRM that has MOT history → run `CS Enrich` →
   `documentHasMileage=false` → `current_mileage` + `mileage_unit:"Miles"` (+ confidence) patched into the
   **empty** `cr1bd_evamileage`/`cr1bd_evamileageunit`; `cr1bd_evavehiclemodel`/make suggested with
   **`dvla_dvsa`** provenance; `enrichment_called` AuditEvent present.
2. **Document mileage is NEVER overwritten (the guard's negative case).** Take a Case whose
   **`cr1bd_evamileage` is already populated** (parser-sourced) → run `CS Enrich` → `documentHasMileage=true`
   → the DVSA estimate is **skipped** (Function warning *"Mileage present on the instruction; DVSA estimate
   skipped (document is authoritative)"*); the document mileage is **unchanged**. **This is the load-bearing
   ADR-0006 assertion — the parsed document wins.**
3. **DVLA make-only fallback (new vehicle, no MOT).** A VRM **too new to have an MOT** → DVSA 404 →
   `make` filled from DVLA, `vehicle_model` **absent** (DVLA has no model), an advisory warning recorded;
   intake **not** blocked (200).
4. **Make/model write into EMPTY fields only.** A Case with a **differing non-empty** `cr1bd_evavehiclemodel`
   → the suggestion is **not** written; the field is left for the **conflict** path (`reviewState=conflict`).
   *(Confirm this staff-review policy is the intended behaviour — §10 Q4 below.)*
5. **Gate-off no-op (double-gate proof).** With `ENRICHMENT_ENABLED=false` (either gate), `CS Enrich` takes
   the **else** branch → an `enrichment_called (skipped)` AuditEvent; make/model/mileage stay **as parsed**;
   the Function (if reached) returns the `"ENRICHMENT_ENABLED is false"` advisory. **Verifies flipping only
   one gate is silently off.**
6. **Advisory non-blocking.** Force a DVSA failure (e.g. bad key) → Function returns **200 + warnings**;
   `Audit_enrichment_failed` fires; the Case advances to review regardless.

**Read-only health (Claude may run):** `/dvsa-mot/enrich` **without** the function key → `401`; with key +
**non-JSON** body → `400`; with key + `{"vrm":"…"}` while `ENRICHMENT_ENABLED=false` → `200` +
`"ENRICHMENT_ENABLED is false"` warning. `curl.exe -X OPTIONS` the host with
`Origin: https://apps.powerapps.com` → platform CORS allows (CORS is a **platform** setting, not
`host.json`). **Secret hygiene:** App Insights / logs show **no** `client_id`/`client_secret`/`api_key`/
bearer (the clients redact; `DvsaConfig.__repr__`/`DvlaConfig.__repr__` mask).

---

## 9. Verification summary

**Offline (pre-deploy, Claude) [BUILD]:**
- `cd functions/enrichment && python -m pytest -q` → **18 passed** (respx-mocked, zero network; use the
  project venv — bare `python` errors only on a missing `httpx`).
- New **429-then-200** DVSA-retry test green (after §6 hardening).
- New **dry-run leak-assertion** test green (no secret in output).
- `node -e "require('./functions/enrichment/openapi/enrichment-connector.json')"` parses; `swagger:2.0`;
  one path `/dvsa-mot/enrich`; security `x-functions-key`, **no** OAuth `securityDefinitions`.
- `az bicep build functions/enrichment/infra/main.bicep` → no errors; **no** secret literals (KV refs only).

**Live (operator 🔒; Claude read-only GETs):** §7 pre-gate dry-run all-`true`; §8 acceptance tests 1–6;
the auth-boundary + secret-hygiene + CORS checks in §8.

---

## 10. Open questions / uncertainties (confirm at activation)

1. **DVSA tenant GUID + scope match.** The code defaults `scope=https://tapi.dvsa.gov.uk/.default` and
   reads `DVSA_TENANT_ID` from settings; the DVSA **registration email** supplies the real tenant + token
   URL + scope — **confirm they match the defaults** at A.2/A.4 (an SDK sample hardcoded tenant
   `a455b827-…`, but DVSA issues **per-registration**).
2. **Automated-flow vs on-demand-UI caller** (§3 gap (a) / §5). Is enrich meant to run in the **automated
   M1 chain** (Run-a-Child-Flow after parse) or stay the **Code-App "Look up vehicle"** action
   (`mockup-app/src/data/enrichment-client.ts`)? Decides the §5 wiring target. The live chain never invokes
   it today.
3. **DVLA production vs test base.** Confirm the operator's `DVLA_API_KEY` is for the **VES production
   base**, not test/UAT, when injecting at A.3.
4. **Overwrite policy.** Current design writes make/model + mileage **only into EMPTY fields** (else
   `reviewState=conflict`). Confirm that staff-review policy is the intended behaviour (acceptance test 4).
5. **Real-world field/casing drift** (§4.1). `odometerUnit` casing and `errorCode` strings can only be
   pinned on the first **live** DVSA call — watch the A.7 trace.

---

## 11. Decision summary (one line)

**The DVSA/DVLA enrichment Function is code-complete and 18-test-green offline (`functions/enrichment/`),
deployed dark as `cespkenrich-fn-gi62sd`, with request/response/token shapes re-verified against the
current DVSA MOT History + DVLA VES specs and Microsoft Learn; §3a is therefore an operator activation
(🔒 H4) — DVSA Entra admin-consent, inject the four secrets to Key Vault, set `DVSA_TENANT_ID`, bind
`cr1bd_dvsaenrich`, flip BOTH `ENRICHMENT_ENABLED` gates in a TEST env, then prove the ADR-0006
document-authoritative-mileage guard on one real VRM — preceded by three Claude-buildable hardenings
(DVSA-429 parity, a no-secrets dry-run self-check, and the gate-default reconciliation). Enrichment is an
M1 capability; valuation stays M3 and out of scope.**
