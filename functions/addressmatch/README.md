# Inspection-address matching service (`Func_AddressMatch`)

A thin Azure Function (Python v2) that implements **ROADMAP 4a** — resolve a
Case's **part-postcode `Loc`** (a district / outward code such as `CH5`; ~57% of
located cases per `loc_principal_analysis.md`) to the linked yard's **full
address**, and serialise it to the **EVA inspection-address field** (field 9 —
six newline-separated lines). The `cr1bd_addressmatch` custom connector
(function-key auth) fronts it for the Power Automate finalisation / review flow.

**No secrets.** Postcode normalisation uses **postcode.io**, which is keyless and
unauthenticated — so, like `functions/evavalidation`, this Function holds no
credentials and needs **no Key Vault**.

## What it does

```
POST /api/match-address
```

Given a Case `Loc` + `principalCode` and the candidate corpus rows
(`InspectionAddress` + `Repairer`, passed IN the body), it:

1. **Parses** the `Loc` with the shared UK-postcode parser (`full` vs `part` vs
   non-postcode), mirroring the corpus analysis dialect.
2. For a **part** postcode, finds known corpus sites whose postcode district
   **`startswith(outwardCode)`** (the ROADMAP-4a rule) and **ranks** them —
   principal-linked first, then exact-district, then `Repairer` over a bare
   `InspectionAddress` reference row.
3. **Auto-fills** the EVA address only when there is a *unique* principal-linked
   site (resolving the shared-yard ambiguity — a district is frequently shared by
   many principals, e.g. `M12` by 11). Otherwise it returns the ranked
   `candidates` + `needsReviewerDecision` and leaves field 9 unset.
4. For a **full** postcode it returns it directly as `confirmed_physical`.
5. **Normalises** the chosen postcode via **postcode.io** when
   `AZURE_MAPS_ENABLED=false` (the M1 default); when `true`, it defers to a future
   Azure Maps path and uses the corpus postcode as-is (with a note).

### The inviolable rule (mirrors `mockup-app/src/domain/address-policy.ts`)

> No path yields **`Image Based Assessment`** without an explicit reviewer
> decision carrying a **non-empty reason**.

This service never silently emits the image-based literal. It only does so when
the caller passes `reviewerDecision = { "choice": "image_based", "reason": "…" }`
with a non-empty reason; otherwise it gates (`needsReviewerDecision: true`). This
is the Python mirror of the Code App's policy gate, so flow and app agree.

## Why stateless (the flow owns Dataverse)

Like `functions/evavalidation`, this Function does **not** read Dataverse. The
Power Automate flow does the cheap district `$filter`
(`startswith(cr1bd_postcode, '<outward>')` over `cr1bd_repairers` /
`cr1bd_inspectionaddresses`, expanding the N:N to `cr1bd_workprovider` for the
principal link) and passes the rows in the body. The Function does the ranking,
the EVA 6-line serialisation, the no-silent-image-based policy, and the optional
postcode.io normalisation. This keeps the **flow the single Dataverse caller**
(no drift, no second identity) and lets the matcher be unit-tested offline.

## Request / response

**Request**

```json
{
  "caseLoc": "CH41",
  "principalCode": "DFD",
  "inspectionAddresses": [ { "cr1bd_name": "...", "cr1bd_postcode": "CH46 4TP", "principalCode": "DFD" } ],
  "repairers":           [ { "cr1bd_name": "...", "cr1bd_postcode": "CH41 1DT", "cr1bd_addressline1": "...", "principalCodes": ["DFD"] } ],
  "reviewerDecision":    { "choice": "use_candidate", "candidateIndex": 0 }
}
```

Rows accept **Dataverse column names** (`cr1bd_addressline1..6`, `cr1bd_postcode`,
`cr1bd_name`, `cr1bd_repairerid`) **or** bare contract keys (`addressLine1..6` /
`line1..6`, `postcode`, `name`/`label`). Linked provider code(s) come in as
`principalCode` (single) and/or `principalCodes` (list).

`reviewerDecision` (optional) is one of:
- `{ "choice": "image_based", "reason": "<non-empty>" }` — the literal (reason **required**).
- `{ "choice": "use_candidate", "candidateIndex": <int> }` — pick a ranked candidate.
- `{ "choice": "manual_address", "addressLines": [...], "postcode": "..." }`.

**Response (HTTP 200 always — matching is advisory, never blocks intake)**

```json
{
  "decisionMode": "confirmed_physical",
  "inspectionAddress": "Unit 4 Riverside Industrial Estate\nDock Road\nBirkenhead\nCH41 1DT\n\n",
  "matched": true,
  "needsReviewerDecision": false,
  "candidates": [ { "label": "...", "addressLines": [...], "postcode": "CH41 1DT", "district": "CH41", "source": "repairer", "principalMatch": true, "exactDistrict": true } ],
  "locKind": "part",
  "district": "CH41",
  "warnings": []
}
```

`decisionMode` ∈ `confirmed_physical | manual | image_based | unknown` (matches
`dataverse/choicesets/inspection-decision-mode.json`). `inspectionAddress` is the
EVA field-9 value: exactly six `\n`-separated lines, **or** `Image Based
Assessment`, **or** `null` while a reviewer decision is pending. The flow writes
it to `Case.cr1bd_evainspectionaddress` and the chosen address back to the
`InspectionAddress` row.

## Boundary tags

| Activity | Tag |
|---|---|
| Function **code** (`function_app.py`, `matching.py`, `postcode.py`, `postcode_client.py`), `infra/main.bicep`, `openapi/addressmatch-connector.json` | **[BUILD]** — authored offline, verified by local `pytest` (postcode.io mocked). Zero tenant/Azure/Dataverse contact. |
| Deploy the Function + import the custom connector | **[DEPLOY-WITH-LOGIN]** |
| Bind `cr1bd_addressmatch` + wire it into the finalisation/review flow | **[RESERVED-FOR-USER]** |

No Key Vault, no secret values — postcode.io is keyless. `AZURE_MAPS_ENABLED` is
the only behavioural knob and ships **`false`** (postcode.io path) in M1.

## Offline test command

No `func start` needed — handlers are exercised directly with a fake
`HttpRequest`, and postcode.io is mocked with `respx` (zero network):

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt   # Windows
python -m pytest -q
```

Tests cover: UK postcode parse (full/part/none), the district
`startswith(outwardCode)` rule, the 6-line serializer, principal-scoped ranking +
the shared-yard ambiguity gate, the **no-silent-image-based** sweep, the
`AZURE_MAPS_ENABLED` gate, postcode.io fail-soft (404 / 5xx / network error), and
the HTTP handler edges. **41 tests, all green.**

## Deploy (operator — [DEPLOY-WITH-LOGIN])

```bash
# 1. Provision infra (FC1 Function + Storage; no Key Vault):
az deployment group create \
  -g rg-collisionspike-dev \
  -f functions/addressmatch/infra/main.bicep \
  -p namePrefix=cespkaddr azureMapsEnabled=false

# 2. Publish the code (FC1 remote Oryx build installs requirements.txt):
cd functions/addressmatch
func azure functionapp publish <functionAppName-from-output> --python

# 3. Smoke test (replace <key> with a function key):
curl -s -X POST "https://<host>/api/match-address?code=<key>" \
  -H "Content-Type: application/json" \
  -d '{"caseLoc":"CH41","principalCode":"DFD","repairers":[{"cr1bd_name":"Wirral Car Solutions","cr1bd_postcode":"CH41 1DT","cr1bd_addressline1":"Unit 4","principalCodes":["DFD"]}]}'

# 4. Import the custom connector openapi/addressmatch-connector.json into Power
#    Platform (set host to the deployed hostname; store the function key as the
#    connection secret). Connection reference: cr1bd_addressmatch.
```

## Files

| File | Purpose |
|---|---|
| `function_app.py` | HTTP trigger (`POST /api/match-address`) + gate read (`AZURE_MAPS_ENABLED`) + fail-soft 200 |
| `matching.py` | the resolver — ranking, the no-silent-image-based policy, EVA serialisation (pure; postcode.io injected) |
| `postcode.py` | UK postcode parse (full/part) + district `startswith` + the 6-line EVA serializer (pure) |
| `postcode_client.py` | postcode.io GET seam (lazy, mockable, fail-soft); **no secret** (keyless API) |
| `host.json` | Functions host config (extension bundle, App Insights) |
| `requirements.txt` / `requirements-dev.txt` | runtime (`azure-functions`, `httpx`) / test (`pytest`, `respx`) |
| `local.settings.json.TEMPLATE` | setting names only; NO secrets |
| `infra/main.bicep` | Flex Consumption Function + Storage (NO Key Vault) |
| `openapi/addressmatch-connector.json` | custom-connector OpenAPI 2.0 (function-key) |
| `tests/` | pytest (postcode.io mocked) + synthetic corpus fixtures |
