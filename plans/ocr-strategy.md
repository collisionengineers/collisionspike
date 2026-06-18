# OCR Strategy — scanned instruction PDFs + registration-plate OCR

> **Status:** planning / decision document. Read-only research (Microsoft Learn MCP + web). No code,
> infra, flows, or Dataverse changed. Pairs with task **#9 "B-full: OCR for scanned PDFs via Azure
> Container Apps (deferred)"**, ADR-0009 (image-AI phasing), ADR-0007 (WhatsApp bulk OCR-match), and
> [docs/architecture/integrations.md](../docs/architecture/integrations.md).
> Author date: 2026-06-18. Verified-live facts come from GROUND TRUTH + the repo's
> [live-environment.md](../docs/architecture/live-environment.md); external facts are cited inline.

---

## 0. TL;DR decision

**Two OCR needs, two right answers — and they are NOT the same engine.**

1. **Scanned / image-only instruction PDFs ("B-full"): self-host the *existing* parser engine on
   **Azure Container Apps** with `--kind functionapp` + `--min-replicas 0` (scale-to-zero), bundling
   the **Tesseract** binary into the image.** The engine's OCR fallback is already written and tested
   (`readers/pdf.py`, `pytesseract.image_to_string`, 300 dpi render, `OCR_PAGE_LIMIT=2`); it is a
   pure-Python no-op today **only because FC1 cannot supply the `tesseract` binary**. Containerising
   makes that one missing binary present, with **zero engine-code change** and near-£0 idle cost.
   *Fallback:* if Tesseract accuracy on real provider scans is poor, swap the OCR call for **Azure AI
   Document Intelligence Read** (`prebuilt-read`, $1.50/1k pages, managed, no infra) behind the same
   `OCR_PROVIDER` switch — keep FC1 for text PDFs and only route image-only PDFs to Read.

2. **Registration-plate OCR from the overview photo: use a dedicated ALPR — `fast-alpr`
   (detector + plate-OCR, MIT, ONNX, CPU)** running in the **same** Container App as need (1), exposed
   as a second route (`POST /plate-ocr`). A document OCR engine (Tesseract / DI Read) reads a *page*;
   it does not *find and read a plate in a cluttered vehicle photo*. The plate is a small region in a
   wide scene — a detector-then-OCR pipeline is materially more accurate here.
   *Fallback:* if a dedicated ALPR is unacceptable (model-quality or all-Microsoft concerns), use
   **Document Intelligence Read** over the whole photo and substring-match the case VRM in the
   returned text — lower precision but managed and adequate for the **M1 semantics** (we only need
   "does the image's OCR text contain the case VRM?", per `image-rules.ts` + data-model.md).

**Can ONE container serve BOTH? YES, and it is cheaper and simpler than two.** One Container App,
one image (Python + Tesseract + ONNX Runtime + `fast-alpr`), two HTTP routes, one custom connector
group, one cold-start to amortise, one thing to operate. Two containers would double idle footprint,
deployment surface, and connector bookkeeping for no benefit at this volume.

**All-Microsoft posture note (important correction):** PLAN.md and ADR-0009 still name **Azure AI
Vision Image Analysis 4.0 Read** as the plate-OCR option. **Do not build on it.** Microsoft Learn
(June 2026) confirms **Image Analysis 4.0 — including its v4.0 Read OCR — is *deprecated* and
*retires 2028-09-25*** (same date as Custom Vision). The surviving managed OCR is **Document
Intelligence Read** (`prebuilt-read`), which is **not** on any retirement list and is the service
Microsoft's own migration guidance points OCR users toward. Wherever this plan needs a managed OCR
fallback it uses **Document Intelligence Read**, never Image Analysis. This supersedes the
"Azure AI Vision Read for plate OCR" line in PLAN.md Phase-4 and the parenthetical in ADR-0009.

---

## 1. What we already have (verified in-repo)

| Asset | State | Relevance |
|---|---|---|
| Parser Function `cespike-parser-dev-x7xt3d5ovhi7y` | **Live**, FC1 (Flex Consumption), Linux, Python 3.12, 2048 MB, `POST /api/parse`, `authLevel=function` | The thing we extend/migrate. Bicep at `functions/parser/infra/main.bicep`. |
| Engine OCR fallback | **Written + tested, dormant** | `functions/parser/cedocumentmapper_v2/readers/pdf.py`: `configure_tesseract()` probes `shutil.which("tesseract")`; `should_ocr` fires when selectable text is empty and the PDF is ≤2 single-image pages; renders each page at 300 dpi (`fitz.Matrix(300/72,…)`) and calls `pytesseract.image_to_string(img, lang="eng")`. **No binary on FC1 ⇒ graceful no-op** (README "OCR on FC1"). |
| `pytesseract` dep | Installed (`functions/parser/requirements.txt`) | Wrapper only; needs the OS binary. |
| Evidence table | **Live** in Dataverse (`cr1bd_evidences`) | Carries `imageRole` (overview/damage_closeup/additional/unknown), **`registrationVisible`** ("OCR-assisted from M1"), `acceptedForEva`, `excluded`. Plate OCR writes `registrationVisible`. (data-model.md §Evidence) |
| `image-rules.ts` | **Canonical contract** (`mockup-app/src/contracts/image-rules.ts`) | Needs ≥2 accepted images, ≥1 `overview` with `registrationVisible === true`, ≥1 `damage_closeup`. The overview's `registrationVisible` is the field plate-OCR sets. |
| Matching model | ADR-0002 / ADR-0007 | Images correlate to the open Case **by VRM**. Plate OCR's job in M1 = "read the plate well enough to (a) tick registration-visible and (b) VRM-match images (incl. WhatsApp bulk import)." Role tagging + reflection detection stay **M2**. |
| Enrichment Function `cespkenrich-fn-gi62sd` | Live, gated OFF | Precedent for "thin Azure Function → custom connector, Dataverse env-var gate" — the exact shape this plan reuses. |

**Implication:** need (1) is **90% done** — it is fundamentally "give the engine its binary," which FC1
structurally cannot do (Flex Consumption runs a managed runtime, not your container — confirmed by
GROUND TRUTH "FC1 — CANNOT run custom binaries / Tesseract"). Containerisation is the unlock.

---

## 2. The runtime constraints that shape the design

1. **FC1 cannot run a custom binary/container.** Flex Consumption = Microsoft-managed runtime; you ship
   code, not an OS image. So Tesseract can never live there. This is *the* reason B-full was deferred
   to Azure Container Apps. (GROUND TRUTH; repo README "OCR on FC1".)
2. **Code App CSP `connect-src 'none'`.** The Code App may **only** reach external services via a Power
   Platform **connector** (`@microsoft/power-apps` SDK) — **never raw `fetch()`**. (AGENTS.md truth #1.)
   So both OCR routes are reached **via custom connectors** (and/or Power Automate HTTP actions in
   flows), exactly like the parser today (`cr1bd_ceparser`).
3. **Everything non-trivial is feature-gated by a Dataverse environment variable**, enforced **upstream
   in the flow / Code App**, not inside the Function. (CLAUDE.md; parser README "Gating".)
4. **Phasing is already decided (ADR-0009):** M1 = OCR-for-registration only + scanned-PDF OCR;
   classification (overview vs damage) and person/reflection detection = M2. **This plan implements
   the M1 OCR scope; it does not pull M2 vision forward.**

---

## 3. Engine comparison — scanned documents

**Need:** convert the rare *image-only* instruction PDF (a scan/photo of an instruction sheet, no text
layer) into text so the existing rules/normalisers can map the 12 EVA fields. These are flat,
A4, mostly printed English documents — the *easy* case for any OCR engine.

| Engine | Doc-scan accuracy | Footprint / deploy | Ops burden | Verdict for docs |
|---|---|---|---|---|
| **Tesseract 5** (current code path) | Strong on clean printed A4 English; the literature notes it competitive and *fastest on CPU* (~0.45–0.8 s/page CPU) and integrates cleanly into post-processing pipelines. Weaker on stylised fonts/complex layout — not our doc profile. | ~few-MB binary; `apt-get install tesseract-ocr` in a Dockerfile. **Already wired in the engine.** | Low. One binary; no model server. | **Chosen.** Zero code change; lowest cost; good enough for printed instruction scans. |
| **PaddleOCR** | Often fewer recognition errors than Tesseract on hard cases; heavier (bigger models, slower on CPU, GPU-leaning). | Hundreds of MB of models; larger image; slower cold start. | Medium. | Overkill for clean A4; only consider if Tesseract underperforms on real scans **and** DI Read is rejected. |
| **EasyOCR / docTR** | Good general accuracy; like Paddle, heavier and GPU-leaning; EasyOCR noted to struggle with complex layouts/script switching. | Large; deep-learning runtime. | Medium. | Not justified vs Tesseract+DI-Read fallback. |
| **Azure Document Intelligence Read** (`prebuilt-read`) — **MANAGED** | Microsoft's document-optimised Read engine; **higher-resolution** scanning than Azure Vision Read; handles print + handwriting, multi-page. Best managed accuracy on documents. | Zero infra (SaaS). $1.50/1k pages (S0); **F0 free 500 pages/mo**; drops to ~$0.60/1k above 1M pages/mo. NOT deprecated. | Lowest (no servers); just a connector + key in Key Vault. | **Chosen FALLBACK** for image-only PDFs if Tesseract quality disappoints. Pay-per-use; volume here is tiny. |

**Decision (docs):** **Tesseract in the container (primary); Document Intelligence Read as a drop-in
fallback** selected by an `OCR_PROVIDER` setting. Text-based PDFs/DOCX/DOC/EML/MSG keep running on FC1
untouched — they never needed OCR. Only **image-only PDFs** route to the container (and only those
route onward to DI Read if the fallback is enabled).

Sources: [PaddleOCR vs Tesseract (Koncile)](https://www.koncile.ai/en/ressources/paddleocr-analyse-avantages-alternatives-open-source) ·
[PaddleOCR vs Tesseract vs EasyOCR speed/accuracy (CodeSOTA)](https://www.codesota.com/ocr/paddleocr-vs-tesseract) ·
[ALPR accuracy study (Scientific Reports 2025)](https://www.nature.com/articles/s41598-025-24967-9) ·
[DI Read model (Microsoft Learn)](https://learn.microsoft.com/azure/ai-services/document-intelligence/prebuilt/read?view=doc-intel-4.0.0) ·
[DI pricing](https://azure.microsoft.com/pricing/details/ai-document-intelligence/) ·
[DI Read $1.50/1k (MS Q&A)](https://learn.microsoft.com/en-us/answers/questions/1684935/pricing-azure-document-intelligence-service).

---

## 4. Engine comparison — registration-plate OCR (the overview photo)

**Need:** in a full vehicle photo (wide scene, plate is a small region, varied angle/light), read the
**UK number plate** well enough to set `registrationVisible` and VRM-match. This is a *scene-text /
ALPR* problem, **not** a document-OCR problem. A page-OCR engine run over the whole photo will read
lots of irrelevant text and often miss or mangle the plate.

| Engine | Plate accuracy (UK/Latin) | All-MS? | Footprint | Verdict |
|---|---|---|---|---|
| **`fast-alpr`** (ankandrew) — detector **YOLO-v9-t** + OCR **CCT-xs-v2** (from `fast-plate-ocr`) | Purpose-built ALPR; detect-then-read beats whole-image OCR on plates. Default OCR is the **`cct-*-global-model`** trained across multinational plates incl. European/Latin formats (UK plates are standard Latin `AA00 AAA`). Pluggable. | No (OSS, runs in our container) | Small; **ONNX Runtime, CPU, no GPU**; `pip install fast-alpr onnxruntime`. **MIT.** | **Chosen.** Right tool for plates; cheap; co-locates with the doc engine. |
| **fast-plate-ocr** (OCR only) | Same OCR core, but you'd supply your own plate-crop detector. | No | Tiny | Use only if we already have crops; `fast-alpr` bundles the detector, so prefer it. |
| **Tesseract over whole photo** | Poor — not built for scene text / small rotated plates amid scene clutter. | No | (already present) | **No.** Only viable if first cropped to the plate; not worth a bespoke detector when `fast-alpr` exists. |
| **PaddleOCR/EasyOCR over photo** | Better scene text than Tesseract but still whole-image; heavier; needs a detector or post-filter to isolate the plate. | No | Large | Not justified vs `fast-alpr`. |
| **Azure Document Intelligence Read over photo** — **MANAGED** | Reads all text in the image; you then regex/substring the VRM. Works (it's an image-OCR engine) but no plate localisation ⇒ lower precision, and a stray sticker/lorry text could false-positive. Managed, no infra. | **Yes** | Zero | **Chosen FALLBACK** if a dedicated ALPR is rejected. Adequate for M1's "OCR text contains VRM" check. $1.50/1k images. |
| **Azure AI Vision Image Analysis 4.0 Read** | (n/a) | (Yes) | Zero | **REJECTED — deprecated, retires 2028-09-25.** Do not build new work on it. |
| **OpenALPR** | Mature ALPR but the open-source project is stale/commercialised (Rekor); UK plate model licensing/maintenance risk. | No | Medium | Not preferred vs the actively-maintained, MIT `fast-alpr`. |

**Decision (plates):** **`fast-alpr` in the container (primary); Document Intelligence Read as the
managed fallback.** This honours the M1 semantics exactly (we only need the VRM to be readable, not a
classifier). Role/reflection detection remain **M2** per ADR-0009 and are out of scope here.

Sources: [fast-alpr (GitHub)](https://github.com/ankandrew/fast-alpr) ·
[fast-plate-ocr (GitHub)](https://github.com/ankandrew/fast-plate-ocr) ·
[fast-plate-ocr (PyPI 0.3.0)](https://pypi.org/project/fast-plate-ocr/0.3.0/) ·
[Image Analysis 4.0 deprecation + 2028-09-25 retirement (MS Learn)](https://learn.microsoft.com/azure/ai-services/computer-vision/overview-image-analysis) ·
[Custom Vision retirement 2028-09-25 (MS Learn)](https://learn.microsoft.com/azure/ai-services/custom-vision-service/migration-options).

---

## 5. One container, two routes — the recommended build

### 5.1 Why one container (cost + ops)

- **Azure Container Apps, Consumption, scale-to-zero**: *"No usage charges apply when an application is
  scaled to zero."* Free grant per subscription per month: **180,000 vCPU-seconds, 360,000 GiB-seconds,
  2,000,000 requests**. ([ACA billing](https://learn.microsoft.com/azure/container-apps/billing),
  [ACA pricing](https://azure.microsoft.com/en-us/pricing/details/container-apps/).)
- Both needs are **bursty and low-volume** (a handful of scanned PDFs + a handful of overview photos
  per case). One image amortises one cold start and one idle-cost line. Two containers double the idle
  surface and the deployment/connector bookkeeping for zero benefit.
- **Keep the existing Python Functions programming model.** Azure Functions runs natively on Container
  Apps via `--kind functionapp`; `--min-replicas 0` keeps scale-to-zero. So we **containerise the
  function app we already have** (add a `/plate-ocr` route) rather than rewrite anything. (MS Learn:
  [Functions on Container Apps](https://learn.microsoft.com/azure/container-apps/functions-overview),
  [GPU/min-replicas example](https://learn.microsoft.com/azure/container-apps/functions-gpu-container-apps) — we use **CPU, no GPU**.)

### 5.2 Routes

| Route | In | Out | Engine |
|---|---|---|---|
| `POST /api/parse` (unchanged contract) | `{document(base64), filename, provider_hint?}` | the existing 12-field EVA envelope | engine; **now image-only PDFs actually OCR** because Tesseract is present |
| `POST /api/plate-ocr` (new) | `{image(base64), filename, case_vrm?}` | `{plate_text, confidence, registration_visible: bool, vrm_match: bool, raw_candidates:[…]}` | `fast-alpr`; if `case_vrm` supplied, normalise (strip spaces/upper) and set `vrm_match` |

`registration_visible` is the boolean the flow / Code App writes to Evidence `registrationVisible`;
`vrm_match` drives the ADR-0007 WhatsApp bulk-match and image-to-Case correlation.

### 5.3 Container image (sketch — `functions/parser/Dockerfile`, new)

```dockerfile
FROM mcr.microsoft.com/azure-functions/python:4-python3.12
ENV AzureWebJobsScriptRoot=/home/site/wwwroot \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true \
    OCR_PROVIDER=tesseract        # tesseract | docintel  (doc-OCR fallback switch)
# Tesseract for scanned-PDF OCR (the one binary FC1 could not provide)
RUN apt-get update && apt-get install -y --no-install-recommends \
        tesseract-ocr tesseract-ocr-eng && rm -rf /var/lib/apt/lists/*
COPY requirements.txt /
# + onnxruntime + fast-alpr appended to requirements.txt for the plate route
RUN pip install --no-cache-dir -r /requirements.txt
COPY . /home/site/wwwroot
```

`configure_tesseract()` already finds `/usr/bin/tesseract` via `shutil.which` — **no engine edit**; the
`should_ocr` path lights up automatically. `fast-alpr` models download on first use or are baked in
(prefer baking for cold-start: copy ONNX into the image or an Azure Storage mount, per
[ACA cold-start guidance](https://learn.microsoft.com/azure/container-apps/cold-start)).

### 5.4 Auth + connectors (CSP-safe)

- Keep **function-key auth** (`authLevel=function`) on both routes; the connector carries the key as
  `x-functions-key` on the **connection** (never in the connector definition) — same boundary as the
  parser today (parser README "Auth boundary").
- **Parser route:** the connection reference **`cr1bd_ceparser`** (apiId suffix
  `new_collision-20engineers-20parser`) already exists, currently **unbound**; after the container is
  live, point its connection at the new container FQDN (or keep the FQDN stable behind a custom domain
  so the connector definition never changes).
- **Plate route:** add operation `PlateOcr` to the **same** connector's OpenAPI
  (`functions/parser/openapi/parser-connector.json`) — one connector, two operations, one connection.
  No new connection reference needed.
- **If DI Read fallback is enabled:** the container calls DI Read **server-side** (Function → DI Read
  over HTTPS with a Key Vault-sourced key). The Code App/flows still see only **our** connector — DI
  Read is never called from the Code App (CSP) and needs no Power Platform connector of its own.

### 5.5 Feature gates (Dataverse environment variables)

Add to the `CollisionSpike` solution (prefix `cr1bd`), enforced **upstream** (flow + Code App), never
read by the Function:

| Variable | Default | Gates |
|---|---|---|
| `OCR_SCANNED_PDF_ENABLED` | `false` | Whether image-only PDFs are routed to the container's OCR path at all. (Text PDFs are unaffected.) |
| `PLATE_OCR_ENABLED` | `false` | Whether the Code App / flow calls `/plate-ocr` to set `registrationVisible` / VRM-match. |
| `OCR_PROVIDER` | `tesseract` | Container-side doc-OCR engine: `tesseract` (in-container) or `docintel` (DI Read fallback). *(This one is read by the container as an app setting, mirroring the engine-side selection; the two Dataverse gates above stay flow-side.)* |

`PDF_MAPPER_ENABLED` (existing) still gates the parser overall. These add **finer** control without
touching it.

---

## 6. Rough cost at expected volume

> **Volume assumption (FLAG — not in requirements; confirm with the user).** No documented case volume
> exists in `docs/requirements/`. Model a deliberately generous spike/early-prod band:
> **≤ ~2,000 cases/month**, of which **scanned/image-only instructions are a small minority (~10–20 %,
> say ≤ 400 docs)** and overview photos number **~1–2 per case (≤ ~4,000 images)**.

**A) Self-host on ACA (chosen).**
- Per request: ~1–3 s CPU at ~0.5 vCPU / 1 GiB ⇒ ~1.5 vCPU-s + ~3 GiB-s per call. For ≤ ~8,400
  calls/month that is **well under the free grant** (180k vCPU-s, 360k GiB-s, 2M requests).
- **Idle = £0** (scale-to-zero). Realistic monthly bill: **≈ £0** beyond the always-present plumbing
  (the Log Analytics workspace + a little ACR storage), order **a few £/month**.
- One-off: ACR for the image (Basic ~£4/mo) — or reuse an existing registry.

**B) Managed DI Read (only the fallback path, image-only PDFs + any photo OCR).**
- At $1.50/1k pages: **400 scanned docs ⇒ ~$0.60/mo**; if every overview photo also went through Read,
  4,000 images ⇒ ~$6/mo. **F0 free tier (500 pages/mo)** likely covers the scanned-PDF case entirely.
- So even "all managed" is **a few $/month** at this volume — cost is **not** the deciding factor;
  **plate accuracy, ops simplicity, and the all-Microsoft posture are.**

**Conclusion:** at spike volume both options are pocket change. **One self-hosted ACA container is the
better default** (right plate engine via `fast-alpr`, zero engine rewrite, scale-to-zero ≈ £0), with
**DI Read as a managed safety valve** that costs cents if we ever need it.

---

## 7. Integration with the existing parser Function + image-rules

```
                         ┌─────────────────────────────────────────────┐
  email/Code App ──▶ Power Automate / Code App (connector SDK, CSP-safe)│
                         └───────────────┬─────────────────────────────┘
                                         │  (gates checked HERE: OCR_SCANNED_PDF_ENABLED / PLATE_OCR_ENABLED)
                          ┌──────────────┴───────────────┐
                          ▼                               ▼
                 POST /api/parse                 POST /api/plate-ocr
        (text PDF/DOCX/DOC/EML/MSG +      (overview photo + case_vrm)
         image-only PDF via Tesseract)            fast-alpr
                          │                               │
            12-field EVA envelope            {plate_text, registration_visible, vrm_match}
                          │                               │
                          ▼                               ▼
        Dataverse: cr1bd_cases (12 fields)   Dataverse: cr1bd_evidences.registrationVisible/imageRole
                                                          │
                                                          ▼
                                  image-rules.ts: ≥2 accepted, ≥1 overview w/ registrationVisible,
                                                  ≥1 damage_closeup  →  status gate (ready_for_eva)
```

- **Parser side:** *contract-preserving*. `/api/parse` keeps the exact request/response shape
  (`functions/parser/function_app.py`); the only behavioural change is that **image-only PDFs now
  return real text** instead of empty. Existing tests (which monkeypatch `run_parser`) are unaffected;
  add a fixture that exercises the OCR branch with a tiny scanned-PDF sample.
- **Plate side:** the flow / Code App calls `/api/plate-ocr` per overview image, writes
  `registrationVisible` (+ uses `vrm_match` for correlation). `image-rules.ts` is **unchanged** — it
  already consumes `registrationVisible`; we are merely *populating* it from M1 as data-model.md
  specifies. No Power Fx parsing, no contract drift.
- **Status machine:** unchanged. `registrationVisible=true` on an accepted overview lets
  `evaluateEvaImageRules` pass `hasOverview`, advancing toward `ready_for_eva`. (`image-rules.ts`.)

---

## 8. Implementation steps (concrete)

**[BUILD] (offline, no tenant):**
1. `functions/parser/Dockerfile` (§5.3). Append `onnxruntime` + `fast-alpr` to
   `functions/parser/requirements.txt` (CPU wheels; pin versions).
2. New route `plate_ocr` in `functions/parser/function_app.py` (mirror the input-validation +
   envelope style of `parse`); new `plate_adapter.py` seam wrapping `fast_alpr.ALPR(...)` (lazy import,
   same pattern as `parser_adapter.py` so tests run without ONNX installed).
3. Optional `OCR_PROVIDER=docintel` branch in `readers/pdf.py`'s OCR fallback **via a small adapter**
   (do **not** edit vendored engine logic in place if avoidable — prefer a wrapper hook that, when
   `OCR_PROVIDER=docintel`, calls DI Read on the rendered page image instead of `pytesseract`). Keep
   `tesseract` the default so the no-edit path stays primary.
4. New Bicep `functions/parser/infra/main-aca.bicep` (or extend existing): ACA **Environment** +
   Container App (`--kind functionapp`, `minReplicas: 0`, `maxReplicas` small, 0.5 vCPU/1 GiB),
   system-assigned MI, App Insights/Log Analytics reuse, ACR reference, app setting `OCR_PROVIDER`,
   and (if fallback) a `@Microsoft.KeyVault(...)` ref for the DI Read key. Mirror the security
   principles already in `main.bicep` (no secret literals, identity-based, MI → ACR pull).
5. Extend `functions/parser/openapi/parser-connector.json` with the `PlateOcr` operation.
6. Offline tests: `pytest` for `/plate-ocr` (monkeypatch the ALPR seam) + an OCR-branch parser fixture.
   `az bicep build` the new template; OpenAPI lint.

**[DEPLOY-WITH-LOGIN] (operator / live env — NOT in this planning task):**
7. `az acr build` the image; `az containerapp create … --kind functionapp --min-replicas 0` in
   `rg-collisionspike-dev` (UK South); confirm `OPTIONS`/CORS allows `https://apps.powerapps.com`
   (platform CORS — `az functionapp cors`/ACA ingress, not `host.json`; AGENTS.md truth #4).
8. Add the three Dataverse env vars to `CollisionSpike` (default OFF).
9. Bind/repoint **`cr1bd_ceparser`** connection to the container FQDN; import the updated connector
   (now 2 operations).
10. Wire the gated branches: `CS Parse` flow (image-only PDFs → container), and the Code App / image
    flow (overview photo → `/plate-ocr` → write `registrationVisible`). Republish any **connection-
    webhook** flow trigger through the **designer** (not just the clientdata API — AGENTS.md truth #2,
    memory `flow-webhook-trigger-provisioning`).

**[RESERVED-FOR-USER]:** any real secret VALUE (DI Read key) into Key Vault; live activation of inbox/
EVA/Box (per memory `live-services-boundary`).

---

## 9. Verification

**Local / offline (pre-deploy):**
- `cd functions/parser && python -m pip install -r requirements.txt -r requirements-dev.txt && python -m pytest`
  → all green, incl. new `/plate-ocr` and OCR-branch tests.
- Build the image locally (`docker build`), `func start` in-container, then:
  - `POST /api/parse` with a **scanned-image PDF** sample → expect non-empty `extraction` + a note
    "Read PDF using OCR fallback" (proves Tesseract is present and firing).
  - `POST /api/plate-ocr` with a sample overview photo (+ `case_vrm`) → expect `plate_text`,
    `registration_visible:true`, correct `vrm_match`.
- `az bicep build functions/parser/infra/main-aca.bicep` → no errors.

**Live (operator, read-only checks Claude may run as GETs):**
- Container reachable + CORS preflight:
  `curl.exe -i -X OPTIONS "https://<aca-fqdn>/api/plate-ocr" -H "Origin: https://apps.powerapps.com" -H "Access-Control-Request-Method: POST"` → `200` with `Access-Control-Allow-Origin`.
- Auth boundary intact: call `/api/parse` **without** a key → `401`; with key + bad input → `400`;
  valid → `200` (matches parser README's verified behaviour).
- Scale-to-zero proven: after idle, first call shows cold-start latency then warms; ACA metrics show
  replicas returning to 0. (Confirms ≈£0 idle.)
- Dataverse gates exist + default OFF:
  `GET <org>/api/data/v9.2/environmentvariabledefinitions?$select=schemaname` includes the three new
  vars; values default `false`.
- End-to-end: drop a known **overview+damage** set on a test Case → assert `image-rules` passes
  (`hasOverview` true via `registrationVisible`, `hasDamageCloseup` true) and status advances. (Mirrors
  PLAN.md "Image AI" verification.)
- Cost reality check: ACA monthly cost in Cost Management ≈ £0–few £; DI Read (if enabled) within F0
  free tier at this volume.

---

## 10. Open questions / uncertainties (and how to verify live)

1. **(BIGGEST) Real-world Tesseract accuracy on *actual* provider instruction scans is unverified.**
   The OCR fallback has never run on a real scanned instruction (it's been a no-op on FC1). It is also
   **capped at ≤2 single-image pages** (`OCR_PAGE_LIMIT=2`) — a longer multi-page scan silently won't
   OCR. **Verify:** containerise, run the **last ~20 real image-only instruction PDFs** through
   `/api/parse`, score field-extraction vs ground truth. If poor, flip `OCR_PROVIDER=docintel` (DI
   Read) and/or raise/remove `OCR_PAGE_LIMIT`. *This is the call that decides primary-vs-fallback for
   need (1).*
2. **`fast-alpr` accuracy on UK plates specifically is not benchmarked here.** The default
   `cct-*-global-model` is multinational; UK plates are standard Latin but the *new-style 2021+ green
   flash / fonts / private plates* warrant a check. **Verify:** run a labelled set of ~30–50 real CE
   overview photos through `/plate-ocr`; measure VRM-match rate. If weak, options: (a) fine-tune
   `fast-plate-ocr` on a UK set (repo provides a training notebook), or (b) fall back to DI Read +
   VRM substring. Because **M1 only needs "OCR text contains the VRM,"** the bar is *recognition*, not
   perfect plate parsing — relatively forgiving.
3. **PLAN.md / ADR-0009 name Azure AI Vision Read for plates — now contradicted by its 2028-09-25
   retirement.** This plan substitutes **DI Read** as the managed fallback. **Action:** update PLAN.md
   Phase-4 + ADR-0009's parenthetical (a docs change, outside this planning task) so the canon stops
   pointing at a deprecated service.
4. **Container vs FC1 split for the parser:** options are (a) **move all parsing** to the container
   (one home, but loses FC1's proven text-PDF path), or (b) **keep FC1 for text, container only for
   image-only PDFs + plates** (two homes, more routing). **Recommend (a)** once the container is proven
   (single surface, simpler connector story), but **stage via (b)** to de-risk — verify the container's
   text-PDF parity against FC1 on the existing corpus before retiring the FC1 app.
5. **Cold-start UX for synchronous Code App calls.** Scale-to-zero adds tens-of-seconds on first call
   after idle. For manual-intake plate OCR in the Code App that's a visible wait. **Verify/mitigate:**
   measure real cold start with the baked model; if intrusive, either bake ONNX into the image + use a
   storage mount, or set `minReplicas: 1` during business hours (small cost) — both per
   [ACA cold-start guidance](https://learn.microsoft.com/azure/container-apps/cold-start).
6. **Reflection exclusion is M2.** Per the image rules, a photo with a person's reflection is
   *excluded*, but reflection **detection** is deferred (ADR-0009 → Foundry vision in M2). In M1 the
   exclusion stays **manual** (`excluded` flag). This plan does **not** add reflection detection;
   plate OCR alone cannot infer it. Flagged so no one assumes "OCR = reflection handled."

---

## 11. Decision summary (one line)

**One Azure Container App (Functions runtime, scale-to-zero) serving two routes — Tesseract for
scanned instruction PDFs (zero engine rewrite; DI Read fallback) and `fast-alpr` for registration-plate
OCR (DI Read fallback) — gated by three Dataverse env vars, reached only via the existing CSP-safe
custom connector, writing `registrationVisible` straight into the canonical `image-rules` contract.
Do NOT use Azure AI Vision Image Analysis (retires 2028-09-25); the managed survivor is Document
Intelligence Read.**
