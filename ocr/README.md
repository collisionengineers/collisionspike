# OCR host (`ce-ocr`) — scanned-PDF OCR + registration-plate OCR

The **OCR fallback host** for collisionspike (ROADMAP **5a / "B-full"**, task #9). An
Azure Functions (Python v2) app packaged as a **container** and run on **Azure
Container Apps** (scale-to-zero), exposing two HTTP routes:

| Route | In | Out | Engine |
|---|---|---|---|
| `POST /api/ocr-pdf` | `{document(base64 PDF), filename, provider_hint?}` | OCR `ocr_text` + (when the engine is present) the **12-field EVA extraction** + Case-identity `vrm`/`reference` | **Tesseract** in-container, or **Document Intelligence Read** (`OCR_PROVIDER=docintel`) |
| `POST /api/plate-ocr` | `{image(base64 photo), filename, case_vrm?}` | `{plate_text, registration_visible, vrm_match, raw_candidates, …}` | **`fast-alpr`** in-container, or **Document Intelligence Read** (`PLATE_PROVIDER=docintel`) |

> Built **OFFLINE**, gated **OFF**. No real secrets — the only outbound secret (the
> Document Intelligence Read key, needed solely for the `docintel` provider) is a
> Key Vault reference resolved by the host's managed identity. Decision rationale +
> engine comparison live in **[`docs/plans/phase-5-ocr-and-scale/ocr-strategy.md`](../docs/plans/phase-5-ocr-and-scale/ocr-strategy.md)**.

## Why this is a SEPARATE host (not the FC1 parser)

The live parser `cespike-parser-dev-x7xt3d5ovhi7y` runs on **Flex Consumption
(FC1)** — a Microsoft-managed runtime that ships your *code*, not your *OS image*,
so it **cannot supply the `tesseract` binary**. The parser engine's OCR fallback
(`readers/pdf.py::should_ocr` → `pytesseract.image_to_string`) is therefore a
graceful no-op on FC1: image-only PDFs come back empty.

This host fixes exactly that one gap. It is a **container**, so the Dockerfile
`apt-get install tesseract-ocr` makes the missing binary present, and the engine's
already-written, already-tested OCR branch lights up with **zero engine-code
change**. It is invoked **only as a fallback** — text PDFs / DOCX / DOC / EML / MSG
keep running on FC1 and never reach here. Running the **Functions** programming
model on Container Apps (`kind=functionapp`, `min-replicas 0`) keeps scale-to-zero
(≈£0 idle) and reuses the same connector/gating shape as the parser.

## Is Tesseract the best engine, or is there a better/cheaper managed option?

**For scanned documents: Tesseract is the right *primary*, with Document
Intelligence Read as the managed *fallback*.** Provider instruction scans are
flat, printed, A4 English — the easy case, where Tesseract is accurate and the
*fastest on CPU*, and (critically) it is **already wired into the engine** so the
primary path is a zero-rewrite, ≈£0-idle container. The cheaper/better *managed*
alternative is **Azure AI Document Intelligence Read** (`prebuilt-read`, GA
`2024-11-30`): no infra, **$1.50/1k pages** (F0 free 500 pages/mo — likely covers
the entire scanned-PDF volume), and Microsoft's highest-accuracy document OCR. It
is selected by flipping `OCR_PROVIDER=docintel` with **no code change**. So the
honest answer: Tesseract wins on *cost + zero-rewrite*; DI Read wins on *accuracy +
zero-ops* — we ship Tesseract primary and keep DI Read one app-setting away.

> **Do NOT use Azure AI Vision Image Analysis 4.0 Read.** Microsoft Learn (verified
> 2026-06) confirms Image Analysis 4.0 — including its v4.0 Read OCR — is
> **deprecated and retires 2028-09-25**. The surviving managed OCR Microsoft points
> you to is **Document Intelligence Read**. This corrects PLAN.md Phase-4 / ADR-0009,
> which still name Azure AI Vision Read.

## Can OCR share ONE host with the vehicle/registration OCR?

**Yes — and it should.** One Container App, one image (Python + Tesseract + ONNX
Runtime + `fast-alpr`), two routes, one connector (two operations), one cold-start
to amortise, one thing to operate. Two containers would double the idle footprint,
the deployment surface and the connector bookkeeping for no benefit at this volume.

But note they are **different engines for different problems**, co-hosted — not one
engine doing both. Document OCR reads a *page*; the plate route must **find and
read a small plate region in a cluttered vehicle scene**, which is an ALPR
problem, so it uses `fast-alpr` (detector + plate-OCR, ONNX, CPU, MIT). Running a
page-OCR engine over the whole photo reads lots of irrelevant text and mangles the
plate. The DI Read fallback *can* serve both (it reads all text and we
substring-match the VRM), which is adequate for the **M1 semantics** — we only need
"does the image's OCR text contain the case VRM?" — but `fast-alpr` is materially
more precise for plates.

## Parser-integration contract (the fallback handshake)

`/api/ocr-pdf` is **contract-compatible with the FC1 parser** when the engine is
present: its `extraction` / `vrm` / `reference` cells are byte-identical in shape
to `POST /api/parse` (same 12 keys, same order, same `{value, confidence, source,
warnings?}`). Two integration shapes, both supported:

1. **Engine baked in (recommended).** Copy the vendored `cedocumentmapper_v2/`
   (the parser's exact vendored engine) into this image. Then for an image-only
   PDF the OCR host returns the **full 12-field EVA extraction directly** (because
   Tesseract is now present, the engine OCRs then runs its rules/normalisers). The
   calling flow treats `/api/ocr-pdf`'s response exactly like `/api/parse`'s.

2. **Text-only (lean image).** Without the vendored engine, `/api/ocr-pdf` returns
   `extraction: null` + `ocr_text`. The **parser Function** then runs its own
   rules over the returned text, or the flow persists `ocr_text` for staff review.

**Routing (decided UPSTREAM, in the flow / Code App — never in the Function):**

```
parse a document
  └─ POST /api/parse (FC1)                       ← text PDF/DOCX/DOC/EML/MSG: always
        └─ extraction empty AND filename is .pdf  ← image-only PDF detected
              └─ if Dataverse OCR_SCANNED_PDF_ENABLED:
                    POST /api/ocr-pdf (this host)  ← OCR fallback (Tesseract/DI Read)
```

```
an overview photo arrives (manual intake / WhatsApp bulk / image flow)
  └─ if Dataverse PLATE_OCR_ENABLED:
        POST /api/plate-ocr  →  write registration_visible → Evidence.registrationVisible
                                use vrm_match for image-to-Case correlation (ADR-0002/0007)
```

`registration_visible` populates the canonical Evidence `registrationVisible`
field that **`mockup-app/src/contracts/image-rules.ts`** already consumes
(`evaluateEvaImageRules` requires ≥1 accepted `overview` with
`registrationVisible === true`). **No contract drift** — we merely *populate* an
existing field from M1, exactly as `data-model.md` specifies. The image rules,
status machine, and EVA contract are all **unchanged**.

## Gating (three Dataverse environment variables + one app setting)

Enforced **UPSTREAM** (flow / Code App reads the Dataverse env var and only calls
the route when enabled). The Function does **not** read these gates — it just works
when called. Add to the `CollisionSpike` solution (prefix `cr1bd`), **default OFF**:

| Variable | Default | Gates | Read by |
|---|---|---|---|
| `OCR_SCANNED_PDF_ENABLED` | `false` | whether image-only PDFs route to `/api/ocr-pdf` | flow / Code App |
| `PLATE_OCR_ENABLED` | `false` | whether photos route to `/api/plate-ocr` | flow / Code App |
| `OCR_PROVIDER` | `tesseract` | container-side doc-OCR engine (`tesseract` \| `docintel`) | the **container** (app setting) |

`PLATE_PROVIDER` (`fast_alpr` \| `docintel`) is the analogous container-side switch
for plates. `PDF_MAPPER_ENABLED` (existing) still gates the parser overall; these
add finer control without touching it.

## Auth boundary (CSP-safe)

Both routes use **FUNCTION-level auth** (`auth_level=func.AuthLevel.FUNCTION`). The
Power Platform **custom connector** (`openapi/ocr-connector.json`, two operations,
one connection) carries the function key as `x-functions-key` on the **connection**
(never in the connector definition). The Code App **cannot** `fetch()` this host
directly (Code Apps enforce CSP `connect-src 'none'`) — it must go through the
connector or a Power Automate HTTP action. A request without a valid key → **401**.
When `OCR_PROVIDER=docintel`, the container calls DI Read **server-side**
(Function → DI Read over HTTPS, key from a Key Vault reference); the Code App / flows
only ever see **our** connector, so DI Read needs no Power Platform connector.

## Files

| File | Purpose |
|---|---|
| `function_app.py` | Two HTTP routes (`/ocr-pdf`, `/plate-ocr`); input validation, provider selection, error envelopes. |
| `ocr_pdf_adapter.py` | The only seam for doc OCR. Lazy imports. Full-engine path (vendored `cedocumentmapper_v2` → 12-field extraction) or raw-text path; `OCR_PROVIDER` switch; the server-side **Document Intelligence Read** client (async analyze → poll). |
| `plate_adapter.py` | The only seam for plate OCR. `fast-alpr` (lazy singleton) or DI Read; **UK VRM normalisation** + match logic (`_build_result`, pure/testable). |
| `Dockerfile` | Azure Functions Python 4 base image **+ the `tesseract-ocr` binary** (the one thing FC1 cannot give) + Python deps. Pin + update the base image monthly. |
| `host.json` | Functions host config (10-min timeout for OCR). |
| `requirements.txt` | Container runtime deps (PyMuPDF, Pillow, pytesseract, fast-alpr, onnxruntime, numpy, requests). |
| `requirements-dev.txt` | `pytest` (tests need none of the heavy deps). |
| `.dockerignore` / `.funcignore` / `.gitignore` | Keep the image/zip lean; never commit models or real samples. |
| `local.settings.json.TEMPLATE` | App-setting **names** only; the DI Read key shown as a Key Vault reference. **No secret values.** |
| `infra/main.bicep` | Functions-on-Container-Apps deployment: Log Analytics + App Insights + ACR (new or existing) + managed environment + Storage + `Microsoft.Web/sites` (`kind=functionapp,linux,container,azurecontainerapps`, `minReplicas:0`), MI-based ACR pull + identity storage + optional Key Vault reference. Parameterized; no secret literals. |
| `openapi/ocr-connector.json` | Power Platform custom-connector OpenAPI 2.0, two operations (`OcrPdf`, `PlateOcr`), one connection, function-key auth. |
| `tests/` | Offline pytest (handlers called directly; both seams monkeypatched). |

## Offline test + validation commands (what was run here)

```powershell
# from ocr/
python -m pytest                                 # 20 passed
az bicep build --file infra/main.bicep --stdout  # exit 0, no warnings
python -c "import json; json.load(open('openapi/ocr-connector.json'))"  # valid
python -m py_compile function_app.py ocr_pdf_adapter.py plate_adapter.py
```

Tests monkeypatch `ocr_pdf_adapter.run_ocr` / `plate_adapter.read_plate`, so
Tesseract / `fast-alpr` / ONNX / PyMuPDF / `requests` are **not** required to run
them. No network, no `func start`, no tenant.

## Build / Deploy / Reserved boundary

- **[BUILD]** (done here, fully offline) — all host code, `Dockerfile`,
  `infra/main.bicep`, `openapi/ocr-connector.json`. Verified by `pytest` +
  `az bicep build` + JSON parse + `py_compile`.
- **[DEPLOY-WITH-LOGIN]** (operator, live env — see below) — build/push the image,
  deploy the Bicep, add the Dataverse env vars, import/bind the connector, wire the
  gated flow branches.
- **[RESERVED-FOR-USER]** — inject the real Document Intelligence Read key VALUE
  into Key Vault (only if you enable the `docintel` provider). No literal secret
  exists in code, Bicep, app settings, tests, or fixtures.

### Operator deploy steps (run under interactive `az` login; NOT done here)

```bash
# 0. Vars (UK South, the live spike RG)
RG=rg-collisionspike-dev ; LOC=uksouth ; ACR=<acr-name-or-new>

# 1. (recommended) bake the parser engine for full extraction
#    cp -r ../functions/parser/cedocumentmapper_v2 ./cedocumentmapper_v2

# 2. Build + push the image (creates the ACR on first deploy via Bicep, or use an existing one)
az acr build -r $ACR -t ce-ocr:latest .            # from ocr/ (uses the Dockerfile)

# 3. Deploy the infra (Functions on Container Apps, scale-to-zero, MI-based pull)
az deployment group create -g $RG -f infra/main.bicep \
   -p namePrefix=cespkocr environmentName=dev imageName=ce-ocr:latest existingAcrName=$ACR \
      minReplicas=0 maxReplicas=5 ocrProvider=tesseract plateProvider=fast_alpr
# (to enable the managed fallback: add keyVaultName=<kv> docintelEndpoint=https://<di>.cognitiveservices.azure.com
#  ocrProvider=docintel — then inject the docintel-read-key secret VALUE: [RESERVED-FOR-USER])

# 4. CORS — platform setting (NOT host.json). Allow the Code App origin for preflight.
az functionapp cors add -g $RG -n <ocr-host-name> --allowed-origins https://apps.powerapps.com

# 5. Dataverse env vars (CollisionSpike solution, default OFF)
#    OCR_SCANNED_PDF_ENABLED=false ; PLATE_OCR_ENABLED=false ; OCR_PROVIDER=tesseract

# 6. Import + bind the custom connector (set host to the ACA FQDN; one connection, key on the connection)
#    openapi/ocr-connector.json  ->  Power Platform custom connector (2 operations)

# 7. Wire the gated branches in the flows / Code App (see "Parser-integration contract").
#    Republish any connection-webhook trigger via the DESIGNER (AGENTS.md truth #2).
```

### Operator read-only verification (Claude may run these as GETs)

```bash
# auth boundary: no key -> 401 ; bad input + key -> 400 ; valid -> 200
curl.exe -i -X POST "https://<aca-fqdn>/api/plate-ocr"                      # 401 (no key)
# CORS preflight allows the Code App origin
curl.exe -i -X OPTIONS "https://<aca-fqdn>/api/ocr-pdf" \
   -H "Origin: https://apps.powerapps.com" -H "Access-Control-Request-Method: POST"
# Dataverse gates exist + default OFF
#   GET <org>/api/data/v9.2/environmentvariabledefinitions?$select=schemaname
# scale-to-zero proven: after idle, first call cold-starts then warms; replicas return to 0
```

## Known calibration items (verify on real data — see `docs/plans/phase-5-ocr-and-scale/ocr-strategy.md` §10)

- **Tesseract accuracy on *real* provider instruction scans** is unverified (the
  fallback has only ever no-op'd on FC1) and capped at ≤2 pages (`OCR_PAGE_LIMIT`).
  Run the last ~20 real image-only PDFs through `/api/ocr-pdf`; if poor, flip
  `OCR_PROVIDER=docintel` and/or raise `OCR_PAGE_LIMIT`.
- **`fast-alpr` on UK plates** (esp. 2021+ styles / private plates) isn't
  benchmarked. Run ~30–50 labelled overview photos through `/api/plate-ocr`; if the
  VRM-match rate is weak, fall back to `PLATE_PROVIDER=docintel` (DI Read + VRM
  substring) or fine-tune `fast-plate-ocr` on a UK set.
- **Cold start** on synchronous Code App plate calls: bake the ONNX models into the
  image (see the commented `COPY models/` in the Dockerfile) or set `minReplicas:1`
  during business hours.
- **Reflection exclusion stays M2** (manual `excluded` flag in M1). Plate OCR cannot
  infer it; nothing here changes that.
