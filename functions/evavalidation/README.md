# EVA validation surface (`Func_EvaValidation`)

A thin Azure Function (Python v2) that exposes the **EVA readiness contract** —
`{ fieldsValid, imagesValid, openIssues[] }` — as plain REST. It is the **ONE
shared implementation** so the Power Automate status machine
(`status-evaluate.definition.json` → `ValidateCase`) and the Code App
`computeReadiness()` agree byte-for-byte (Phase-1 §5.4 drift mitigation). The
`cr1bd_evavalidation` custom connector (function-key auth) fronts it. Plan
reference: phase-2 §6 (M2.B). The Function is DEPLOYED + Running
(`cespkeval-fn-6c6fxd`, `/api/validate-case` live) and `CS Status Evaluate` is
already ON — it runs today via the caseId-only safe-negative path. What remains
on the critical path is the connector **repoint/bind** so the flow does REAL
validation instead of the safe-negative.

**Pure domain logic — NO gate (always on), NO secrets, NO upstream call.** The
logic in `validation.py` is a faithful Python port of the canonical TypeScript
contracts:

- `mockup-app/src/contracts/image-rules.ts` → `evaluate_image_rules`
- `mockup-app/src/contracts/case-status.ts` → required-field + open-issue checks

A parity test (`tests/test_validation.py`) mirrors the **same fixtures** as the TS
`image-rules.test.ts`, so flow and Code App stay in lock-step. **The TS contracts
are the authority; this Function must track them.**

## Boundary tags

| Activity | Tag |
|---|---|
| Function **code** (`function_app.py`, `validation.py`), `infra/main.bicep`, `openapi/evavalidation-connector.json` | **[BUILD]** — authored offline, verified by local `pytest`. Zero tenant/Azure/Dataverse contact. (The Function has since been **deployed live** as `cespkeval-fn-6c6fxd`, FC1, Running.) |
| Deploy the Function | **[DONE]** — `cespkeval-fn-6c6fxd` deployed + Running (FC1). |
| Import the custom connector | **[DEPLOY-WITH-LOGIN]** — pending. |
| Bind `cr1bd_evavalidation` + repoint `CS Status Evaluate` to it | **[RESERVED-FOR-USER]** — flow is already ON; this is the connector repoint to do real validation. |

No Key Vault, no secret values — this Function holds none.

## Endpoint

```
POST /api/validate-case
```

Two accepted body shapes:

**1. body-in (preferred, stateless)** — the flow passes the Case fields + Evidence
so the Function never reads Dataverse and the flow remains the single Dataverse
caller:

```json
{
  "case": { "work_provider": "Acme", "vehicle_model": "FOCUS", ...,
            "reviewStates": { "mileage": 100000003 } },
  "evidence": [ { "cr1bd_kind": 100000000, "cr1bd_imagerole": 100000000,
                  "cr1bd_registrationvisible": true, "cr1bd_acceptedforeva": true,
                  "cr1bd_excluded": false }, ... ]
}
```

**2. caseId-only (compat)** — the current `status-evaluate` sends only
`{ "caseId": "..." }`. This Function has **no Dataverse identity by design**, so it
returns a **safe-negative** (`fieldsValid=false, imagesValid=false`) plus an
advisory in `openIssues`. A safe-negative keeps a Case OUT of `ready_for_eva`
until it can actually be validated.

> **Decision for the operator (plan §6 / §13 Q4):** to make this Function do real
> validation, **either** (recommended) apply the small `status-evaluate` edit so
> `Validate_readiness` passes `{ case, evidence }` instead of just `caseId` (keeps
> the Function stateless and the flow the sole Dataverse reader), **or** grant the
> Function a Dataverse managed identity and let it read the Case+Evidence. The
> parity test (TS vs this Function) is the drift gate regardless of which shape is
> chosen. NOTE: editing `status-evaluate.definition.json` is **out of this task's
> scope** — it is flagged here for the flow-owner / operator.

Response (HTTP 200):

```json
{ "fieldsValid": true, "imagesValid": true, "openIssues": [] }
```

`openIssues` aggregates every gap: missing required fields, each image-rule
failure, and any field left `needs_review` / `conflict`.

## Field & evidence shapes accepted

To let the flow pass **raw Dataverse rows** without re-mapping, both the Case
fields and the Evidence rows accept either the snake_case **contract keys**
(`work_provider`, `imageRole`, …) **or** the Dataverse **column names**
(`cr1bd_evaworkprovider`, `cr1bd_imagerole`, …), and a Case field may be an
embedded `{ value, reviewState }` object (the Code App's shape). Choice values
(image role, review state, evidence kind) match `dataverse/choicesets/*.json`.

## Offline test command

No `func start` needed — handlers are exercised directly with a fake `HttpRequest`;
there is no network at all:

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt   # Windows
python -m pytest -q
```

Tests assert the SAME image-rule branches as `image-rules.test.ts` (min_count,
missing_overview, missing_damage_closeup, excluded-overview, empty-set order) via
both the contract-key and Dataverse-column shapes, the required-field + open-issue
aggregation, the `{ fieldsValid, imagesValid, openIssues }` contract, and the
handler's body-in vs caseId-only dispatch.

## Files

| File | Purpose |
|---|---|
| `function_app.py` | HTTP trigger + dispatch (body-in vs caseId-only safe-negative) |
| `validation.py` | the ported image-rules + required-field/open-issue logic (pure) |
| `host.json` | Functions host config (extension bundle, App Insights) |
| `requirements.txt` / `requirements-dev.txt` | runtime / test deps (no httpx) |
| `local.settings.json.TEMPLATE` | setting names only; NO secrets |
| `infra/main.bicep` | Flex Consumption Function + Storage (NO Key Vault) |
| `openapi/evavalidation-connector.json` | custom-connector OpenAPI 2.0 (function-key) |
| `tests/` | pytest parity with `image-rules.test.ts` |
