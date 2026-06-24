# Location-suggest Function (`Func_LocationSuggest`)

A thin Azure Function (Python v2) that proposes **candidate inspection locations**
for a Case under review. Given the case's own inspection-photo references and the
two verbatim text clues, it runs **Azure AI Vision** (Image Analysis + Read OCR)
over the photos and **Azure Maps** geocode over the textual clues, ranks the
geocoded hits, and returns ranked **candidates** with plain-language provenance.

Phase reference: `docs/plans/phase-4-address-and-chaser/live-location-suggestion-assist.md`.

## ADR-0013 — this is a SUGGESTER, not a resolver

Every candidate is a **suggestion a human reviewer confirms**. This Function:

- **never reads or writes a Case row** — `case_id` is correlation only;
- returns **candidates only** — `confidence` drives **ordering**, never auto-selection;
- emits only **plain business language** in human-visible strings (`label`,
  `evidence[].detail`). The `evidence[].kind` enum is internal; the Code App maps
  it to plain phrases ("Suggested from the photos", "Near the accident location",
  "Near the claimant address").

A raw candidate is **never persisted** on its own. On the Code App "Use this
address" action the reviewer copies it into the manual 6-line draft and the
InspectionAddress row is written `decisionMode=manual`, `sourceLabel=suggested:assist`.

## Wire contract (`ce_location_suggest_v1`)

`POST /api/location-suggest` — **FUNCTION** auth (`x-functions-key` on the
connection). Request is **snake_case** (matches the parser Function); the response
body is **camelCase** so it threads straight into the Code App domain types.

Request:

```json
{
  "case_id": "GUID (correlation only)",
  "case_po": "CCPY26050 (log + Box-folder hint)",
  "photo_refs": [{ "evidence_id": "GUID", "box_file_id": "…?", "filename": "…?", "image_role": "overview|damage_closeup|…?" }],
  "text_clues": { "accident_circumstances": "…?", "claimant_address": "…?" },
  "max_candidates": 5,
  "contract_version": "…?"
}
```

Response (200 envelope; soft failures in-band, `contract_version` always stamped):

```json
{
  "candidates": [
    { "label": "Smith Recovery, Acton",
      "addressLines": ["…"],
      "postcode": "W3 7QE",
      "confidence": 0.91,
      "evidence": [{ "kind": "photo_sign", "detail": "sign reads 'Smith Recovery'", "sourcePhotoRef": "GUID" }],
      "sourcePhotoRef": "GUID" }
  ],
  "noConfidentLocation": false,
  "issues": [{ "field": "…", "severity": "warning|error", "code": "…", "message": "…" }],
  "contract_version": "ce_location_suggest_v1"
}
```

Status codes (mirror the parser's classification):

| Code | Meaning |
|---|---|
| 200 | OK — including zero candidates (`noConfidentLocation=true`) |
| 400 | Bad request (non-JSON body, malformed `photo_refs`/`text_clues`, bad types) |
| 422 | Photos unreadable — **every** supplied photo unavailable **and** no text clue |
| 500 | Unexpected internal error (defensive; never lets a raw 502 escape) |
| 502 | A required location service (Vision/Maps) is not configured / unreachable |

`candidates` is ordered by `confidence` desc (ties → more evidence first). When
`candidates` is non-empty, `noConfidentLocation` is false (mutually consistent).

## Gating (enforced UPSTREAM, never by this Function)

`cr1bd_LOCATION_ASSIST_ENABLED` (paired with `cr1bd_AZURE_MAPS_ENABLED`) is read by
the **Code App / flow** as the outer guard — exactly like `PDF_MAPPER_ENABLED` for
the parser. Live assist requires **both** gates true **and**
`cr1bd_LOCATION_ASSIST_API_BASE` set (the connector host base). All default
off/empty so v1 ships **dark**. *(These Dataverse env-vars are owned by
dataverse-data-architect; this Function just works when called.)*

## Auth wiring (explicit)

- **Function ← connector:** FUNCTION-level auth. The **CE Location Assist** custom
  connector sends the Function key as `x-functions-key`, stored on the
  **connection** (`api_key` connection parameter), never in code or the bundle.
  Connector defs: `connectors/location-suggest/apiDefinition.swagger.json`
  (+ `apiProperties.json`).
- **Function → Azure AI Vision / Azure Maps:** the **system-assigned managed
  identity** is granted **Key Vault Secrets User** (via RBAC in `infra/main.bicep`)
  and resolves the two **Key Vault references**:
  - `AZURE_VISION_KEY` → KV secret `azure-vision-key`
  - `AZURE_MAPS_KEY` → KV secret `azure-maps-key`

  Endpoints/versions/country (`AZURE_VISION_ENDPOINT`, `AZURE_MAPS_ENDPOINT`, …)
  are **non-secret** app settings. No literal secret appears anywhere in code,
  config, or fixtures (values injected out-of-band — **[RESERVED-FOR-USER]**).
- **No Azure OpenAI / Foundry** secret in v1 — GPT-4o is the **deferred**
  escalation (`gpt4o-reasoning-escalation.md`), out of scope.

## Box stays dormant — the photo seam

Photo bytes are read **only** through the `PhotoSource` adapter (`photo_source.py`),
the single Box seam:

- **`StubPhotoSource`** is the **default** while Box is dormant
  (`BOX_API_ENABLED=false`, KV empty). It serves bytes from an in-memory fixture
  map keyed by `evidence_id` and **never calls Box**. This is what ships in v1, and
  what the whole offline test suite uses.
- **`BoxPhotoSource`** is a **marked ACTIVATION step** — present but **not wired**.
  At activation it fetches bytes via the Box content endpoint using a **CCG token
  minted INSIDE the Function** (never the connector), the same
  `functions/box-webhook/box_client.py` pattern. `get_photo_source()` selects it
  only when `BOX_API_ENABLED` is true. It currently raises (loud, not a silent
  no-op) so a premature flip is caught.

A per-photo fetch/analysis failure is a **warning**, not a stop; only
**all-photos-unavailable + no text clue** → 422. An empty `photo_refs`
(text-clue-only run) is fully supported.

## How the Power Platform side calls it

On the CaseDetail **Address tab**, the reviewer clicks **"Suggest location"**
(enabled only when `LOCATION_ASSIST_ENABLED && AZURE_MAPS_ENABLED`). The Code App
builds the request from already-loaded data (`imagesForCase` → `photo_refs`; the
case's accident-circumstances + the new claimant-address → `text_clues`), calls
the **CE Location Assist** connector operation **`SuggestLocation`** through the
CSP-safe transport (`mockup-app/src/data/location-assist-connector-transport.ts`),
and renders each candidate with the existing `SuggestedLocationRow` component
("Suggested" badge, evidence tooltip, "Use this address"). Nothing is preselected;
confirmation runs the same `resolveInspectionDecision` path as a corpus suggestion.
*(The Code App transport/client + UI are owned by code-app-architect; this README
documents the contract they consume.)*

## Boundary tags

| Activity | Tag |
|---|---|
| Function **code** (`function_app.py`, `location_suggest.py`, `vision_client.py`, `maps_client.py`, `photo_source.py`, `clue_extraction.py`), `infra/main.bicep`, the connector defs | **[BUILD]** — authored offline, verified by local `pytest`. Zero tenant/Azure/Box contact. |
| Deploy the Function + Key Vault + import the custom connector | **[DEPLOY-WITH-LOGIN]** |
| Inject the Vision/Maps key VALUES into Key Vault; flip the gates; set `LOCATION_ASSIST_API_BASE`; implement + wire `BoxPhotoSource` | **[RESERVED-FOR-USER]** |

## Run the offline tests

```
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m pytest
```

Vision / Maps / the Box photo seam are all faked (`tests/fakes.py`) — no Azure
key, no Box, no network, no `func start`.
