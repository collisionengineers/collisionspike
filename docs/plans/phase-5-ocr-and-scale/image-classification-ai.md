# Image classification AI — overview-vs-damage + person/reflection detection (ROADMAP 5b, ADR-0009 M2+)

> **Status:** planning / decision document. Read-only research (Microsoft Learn MCP). No code, infra,
> flows, or Dataverse changed. Deep dive behind **ROADMAP §5b "Image classification AI (ADR-0009 — M2+)"**
> — the two model checkboxes (AI Builder overview-vs-`damage_closeup`; Foundry vision person/reflection),
> the image-ordering UI, and the WhatsApp media bulk-import (ADR-0007). Pairs with
> [plans/ocr-strategy.md](./ocr-strategy.md) (the **M1** plate-OCR half — owns `registrationVisible`),
> [m2-umbrella-enrichment-to-scale.md](../m2-umbrella-enrichment-to-scale.md) §9 (M2.E), ADR-0009, ADR-0007.
> Author date **2026-06-18**. Facts cited inline; verified-live facts from GROUND TRUTH +
> [live-environment.md](../../../docs/architecture/live-environment.md).

---

## 0. TL;DR decision

**Two image-AI needs, two right engines — and a hard licensing fact that reshapes the M2 choice.**

1. **Role classification (overview vs `damage_closeup`):** a small, well-bounded **2-class image
   classification** problem. **Recommended: Azure OpenAI / Foundry vision (a vision-enabled chat model)
   with a strict prompt + JSON-mode output, fronted by a thin Azure Function**, in preference to AI
   Builder image classification. *Why not AI Builder?* Microsoft Learn (verified 2026-06-18): **AI Builder
   credits seeded in licences are removed 2026-11-01, and new customers can no longer buy the AI Builder
   capacity add-on — they must purchase Copilot Credits**
   ([AI Builder licensing overview](https://learn.microsoft.com/ai-builder/administer-licensing);
   [credit management](https://learn.microsoft.com/ai-builder/credit-management#get-entitlement-to-ai-builder-credits)).
   For an M2+ greenfield spike that is **not** today licensed for AI Builder, standing on a credit model
   in active sunset is the wrong foundation. A vision chat model needs **only** an Azure OpenAI resource
   (which the enrichment/parser Azure footprint already neighbours) and reuses the **exact** "thin
   Function → custom connector → Dataverse env-var gate" pattern the repo uses five times already. **If
   the tenant already owns AI Builder/Copilot Credits**, AI Builder *object detection* (≥15 images/tag,
   in-product training) is a perfectly good no-code alternative for this 2-class task — keep it as the
   documented fallback.

2. **Person / reflection detection (exclusion):** *"any photo showing a person's reflection is
   unusable."* This is a **safety/quality filter**, not a class label, and it is genuinely hard (a
   reflection is subtle). **Recommended: Azure OpenAI / Foundry vision** — same model, a second prompt
   asking "is a person or a human reflection visible?". ADR-0009 already names **Foundry vision** here;
   this plan confirms it and rejects Custom Vision.

**Hard rejection (both needs):** **do NOT build on Azure AI Custom Vision or Azure AI Vision Image
Analysis 4.0 — both retire 2028-09-25.** Microsoft's own Custom Vision page now carries the retirement
notice and points migrators at **Azure ML AutoML**, the **Foundry model catalog (generative vision)**,
and **Azure AI Content Understanding** — *not* at a like-for-like classifier
([What is Custom Vision?](https://learn.microsoft.com/azure/ai-services/custom-vision-service/overview)).
This matches the OCR plan's identical rejection of Image Analysis 4.0.

**Scope discipline (ADR-0009):** **all of §5b is M2+.** **M1 ships with manual role tagging + manual
exclusion** (`Evidence.imageRole` set by staff; `excluded` ticked by staff); the **only** M1 image-AI is
plate **OCR** (`ocr-strategy.md`, sets `registrationVisible`). This plan does **not** pull any of it into
M1, and it changes **no canonical contract** — `image-rules.ts` already consumes `imageRole`,
`registrationVisible`, `excluded`; §5b merely **populates** them automatically.

---

## 1. What is already true (so §5b stays additive, not a rewrite)

| Asset | State | Why it bounds §5b |
|---|---|---|
| `mockup-app/src/contracts/image-rules.ts` | **Canonical** | Needs ≥2 accepted images, ≥1 `overview` with `registrationVisible===true`, ≥1 `damage_closeup`. **`imageRole` and `excluded` are the two fields §5b automates.** `registrationVisible` is **OCR's** job (M1), not classification's. |
| `Evidence` (`cr1bd_evidences`) | **Live** | Carries `imageRole` (overview/damage_closeup/additional/unknown), `registrationVisible`, `acceptedForEva`, `excluded`. §5b writes `imageRole` (classifier) + `excluded` (reflection filter). No schema change. |
| Plate OCR (`ocr-strategy.md`, M1) | **Planned/partly built** | Owns `registrationVisible` + VRM-match (incl. WhatsApp bulk import). §5b builds **on top** — classification + reflection, not OCR. |
| The "thin Function → connector → env-var gate" precedent | **Live** (parser, enrichment, evasentry, evavalidation) | §5b's Function reuses this shape verbatim — function-key connector, gate enforced **upstream** in the flow/Code App, secrets as Key Vault refs. |
| Env-vars `AZURE_VISION_ENABLED`, `COPILOT_ENABLED`; phase-2 names `AIBUILDER_CLASSIFY_ENABLED` | **Exist / proposed** | §5b is gated by a Dataverse env-var (default OFF), like everything non-trivial. |
| ADR-0009 / ADR-0007 | **Binding** | M1 = OCR-for-registration only; **classification + reflection = M2**; WhatsApp media = manual bulk import, OCR-match by VRM. |

---

## 2. Engine comparison — role classification (overview vs damage_closeup)

| Engine | Fit for 2-class role | Licensing reality (2026-06) | Footprint / ops | Verdict |
|---|---|---|---|---|
| **Azure OpenAI / Foundry vision chat model** (GPT-4o / GPT-4.1 series) via Chat Completions (image input, base-64 or URL; ≤10 images/request) | **Strong** — zero training; a strict prompt ("classify as overview \| damage_closeup \| additional; return JSON") + low `max_tokens`; same call also does reflection (§3). [GPT-with-vision](https://learn.microsoft.com/azure/foundry/openai/how-to/gpt-with-vision) | Pay-per-token; **no** sunsetting credit pool; needs an Azure OpenAI resource (Entra/keyless auth recommended). | Thin Function + connector; one resource. Reuses the repo's pattern. | **CHOSEN.** No training set to curate, no credit sunset, one engine for both needs. |
| **AI Builder image/object detection** (no-code; ≥15 images/tag, in-product train) | **Good** for a 2-class task; point-and-click; `Predict`/object-detection action returns tag + confidence. [Object detection](https://learn.microsoft.com/ai-builder/object-detection-model-in-flow) | **Sunset risk:** seeded credits removed **2026-11-01**; **new customers can't buy the add-on** — must use Copilot Credits ([overview](https://learn.microsoft.com/ai-builder/administer-licensing)). Fine **iff** the tenant already holds capacity. | No infra (Power Platform native); needs AI Builder/Copilot capacity allocated to the env. | **FALLBACK** — only if the tenant already owns AI Builder/Copilot Credits and prefers no-code. |
| **Azure AI Content Understanding** (Foundry; custom classification workflows, preview) | Managed custom classification; Microsoft's named Custom Vision successor for classification. | Pay-per-use; not sunsetting. Preview maturity. | Managed; minimal infra. | **WATCH** — strong future option for a managed classifier once GA; revisit at M3. |
| **Azure ML AutoML (image classification)** | The classic-ML migration path Microsoft names. | Pay-per-use; not sunsetting. | **Heaviest** — training pipelines, compute, MLOps. Overkill for 2 classes. | **No** for a spike. |
| **Azure AI Custom Vision** / **Image Analysis 4.0** | (n/a) | **Retire 2028-09-25.** | — | **REJECTED.** Do not build new work on either. |

**Decision (classification):** **Foundry vision chat model behind a thin Function (primary); AI Builder
object detection as the no-code fallback where capacity already exists.** Both write `Evidence.imageRole`;
neither touches `image-rules.ts`.

---

## 3. Engine comparison — person/reflection detection (exclusion)

A reflection is **not** a tidy class — it's "is there a human/reflection anywhere in this photo?", which
rewards a model that *reasons about a scene*. A purpose-trained classifier would need a large, awkward
positive set of reflection photos; a generative vision model handles it zero-shot with a good prompt.

| Engine | Fit | Verdict |
|---|---|---|
| **Azure OpenAI / Foundry vision** (same model as §2) | Zero-shot prompt: "Is a person, or a person's reflection (in glass/paint/chrome), visible? Answer JSON {personVisible, reflectionVisible, confidence}." Reuses the §2 call (one request can carry the image once and ask both questions). | **CHOSEN** (matches ADR-0009). |
| AI Builder | No prebuilt "reflection" model; a custom one needs a hard, large training set. | No. |
| Custom Vision / Image Analysis | Retiring 2028-09-25; person detection exists but reflection is bespoke. | **REJECTED.** |

**Decision (reflection):** **Foundry vision**, second prompt, writes `Evidence.excluded=true` **as a
recommendation** the reviewer can confirm/override (never silently bins a photo). Because the prompt is
advisory, a miss is caught by the existing **manual** `excluded` path — §5b *augments* the human filter,
it doesn't replace it.

---

## 4. One vision Function, two routes (the recommended build)

Mirror `functions/evasentry` / `functions/enrichment`: a thin Azure Function, function-key auth, two
routes, one custom connector, Dataverse env-var gate enforced **upstream**.

| Route | In | Out | Engine |
|---|---|---|---|
| `POST /api/image/classify` | `{ image(base64), filename }` | `{ imageRole: overview\|damage_closeup\|additional\|unknown, confidence }` | Foundry vision (prompt + JSON mode) |
| `POST /api/image/screen` | `{ image(base64), filename }` | `{ personVisible, reflectionVisible, recommendExclude, confidence }` | Foundry vision (second prompt) |

- The two can collapse into **one** `/api/image/analyze` call returning both blocks (one image upload,
  one round-trip, lower cost) — recommended; split only if latency/cost profiling says so.
- **Auth to Azure OpenAI:** Entra **keyless** (managed identity, `Cognitive Services User`) is the
  Microsoft-recommended path ([GPT-with-vision prerequisites](https://learn.microsoft.com/azure/foundry/openai/how-to/gpt-with-vision)); 
  if a key is used it is a **Key Vault reference** app setting, never a literal.
- **Image input:** **base-64 in the request body** (the Case's Evidence blob), **not** a public URL —
  Microsoft Learn warns vision image **URLs must be publicly accessible** (private endpoints fail), and
  CE evidence is private. Base-64 sidesteps that entirely.
- **CSP (AGENTS.md truth #1):** the Code App calls **only** the `cr1bd_imageai` connector (or the flow
  calls it server-side); the Function calls Azure OpenAI **server-side**. **No raw `fetch()`.**
- **Gate (Dataverse env-var, default OFF):** add `cr1bd_IMAGE_AI_ENABLED` (or reuse the proposed
  `AIBUILDER_CLASSIFY_ENABLED` if AI Builder is chosen) **plus** the existing `AZURE_VISION_ENABLED`.
  Enforce **upstream** in the flow/Code App; the Function may also gate-at-edge (defence in depth, like
  evasentry). Per-provider `cr1bd_aiallowed` (modelled, deferred) can later refine this.

---

## 5. Image-ordering UI (the third §5b checkbox)

Independent of the models — **drag to set the two preview images** (the EVA photo-order rule: overview +
main-damage closeup go first, then all photos including those two again). This is **Code App** work
(Fluent v9 drag-reorder over the Evidence list), writing a `sequenceIndex`/preview flag onto Evidence; it
**consumes** the classifier's `imageRole` (to pre-suggest the overview + a damage closeup as previews) but
does not require it — a reviewer can order manually. The ordering is what `payload.py::order_impact_images`
(already built, `functions/evasentry`) serialises for EVA. **No new dependency** — Fluent v9 is already in
`mockup-app`. Keep it a thin, deterministic UI layer; the AI only *pre-fills* the suggested previews.

---

## 6. WhatsApp media bulk import (ADR-0007 — the fourth §5b checkbox)

Per ADR-0007 this is a **manual bulk import**, then **OCR each image for the registration and auto-match
to the open Case by VRM**. The **OCR + VRM-match is `ocr-strategy.md`'s `/plate-ocr` route (M1
semantics)** — §5b adds nothing new to the matching; it simply **runs the same classify/screen routes
over the imported set** so WhatsApp photos get `imageRole` + reflection screening like emailed ones. The
import UX (staff drop a folder of WhatsApp media) is Code App work; the correlation key is the **VRM**
(ADR-0002/0007), resolved by plate OCR, not by classification. Flagged here only so the two plans don't
double-claim the OCR/VRM mechanism: **OCR/VRM = `ocr-strategy.md`; role+reflection = this plan.**

---

## 7. Rough cost at expected volume

> Volume assumption (FLAG — not in requirements; confirm): ≤ ~2,000 cases/month, ~2–6 photos each ⇒
> ≤ ~12,000 image analyses/month.

- **Foundry vision (chosen):** vision chat is billed per token; a single small image + a terse
  classify+screen prompt + a tiny JSON answer is a low-token call. At ≤ ~12k calls/month this is
  **single-digit-to-low-tens of £/month** (confirm against the live Azure OpenAI rate card — pricing not
  pinned here on purpose). No idle cost beyond the neighbouring Function plumbing.
- **AI Builder fallback:** billed in AI Builder/Copilot **Credits** per image at the capability rate
  (rate card in the Power Platform Licensing Guide); only viable if capacity is already owned — and the
  seeded-credit pool disappears 2026-11-01, so treat any AI Builder cost as **capacity you must
  separately fund** going forward.

**Conclusion:** at spike volume cost is **not** the deciding factor; the deciding factors are **(a)** not
standing on a sunsetting credit model, **(b)** one engine for both classification + reflection, and
**(c)** reuse of the repo's Function/connector/gate pattern — all of which favour **Foundry vision**.

---

## 8. Implementation steps (concrete)

**[BUILD] (offline, no tenant):**
1. `functions/imageai/` — `function_app.py` (routes §4), `vision_client.py` (Azure OpenAI Chat
   Completions image call; lazy import; mockable like `dvsa_client.py`/`eva_client.py`), `prompts.py`
   (the classify + screen prompts + JSON schema), `tests/` (mock the OpenAI HTTP with `respx`; assert the
   role enum, the JSON-mode parse, gate-at-edge, no secret/image-bytes in logs).
2. `functions/imageai/infra/main.bicep` — Flex Consumption Function + Storage + App Insights +
   system-assigned MI granted `Cognitive Services User` on the Azure OpenAI resource (keyless); any key as
   a **KV ref**. Mirror `functions/evasentry/infra/main.bicep` security.
3. `functions/imageai/openapi/imageai-connector.json` — OpenAPI 2.0, `Classify` + `Screen` (or one
   `Analyze`), `x-functions-key`, **no OAuth**.
4. **Code App:** image-ordering drag UI (§5) + a "review AI suggestions" affordance on the Evidence list
   (confirm/override `imageRole` + `excluded`). Pure React/Fluent v9; no new dep.
5. Offline validation: `pytest`, `az bicep build`, OpenAPI JSON-parse, `vitest` for the UI ordering
   reducer.

**[DEPLOY-WITH-LOGIN] (operator):**
6. Provision the Azure OpenAI resource + deploy a vision-enabled model (GPT-4o/4.1) in
   `rg-collisionspike-dev` (region with model availability); grant the Function MI `Cognitive Services
   User`; deploy the Function; import the `cr1bd_imageai` connector; add the Dataverse env-var(s) default
   **OFF**.

**[RESERVED-FOR-USER]:**
7. Any real key VALUE → Key Vault (only if not keyless); **flip the gate true in a test env**; bind the
   connection; run live classification/screening on real Cases.

---

## 9. Verification

**Offline (Claude):**
- `cd functions/imageai && python -m pytest -q` — green: role enum constrained; reflection block parses;
  gate-at-edge returns a no-op when the env-var is false; **no image bytes / key / token in logs**;
  malformed image → 400 (no model call).
- `az bicep build functions/imageai/infra/main.bicep` → no errors; no secret literals.
- `node -e "require('./functions/imageai/openapi/imageai-connector.json')"` → `swagger:2.0`, function-key,
  no OAuth.
- `vitest` for the ordering reducer (two previews first, then full sequence — mirrors
  `order_impact_images`).

**Live (operator; Claude read-only GETs):**
- Drop a known **overview+damage** set on a test Case → `image/classify` tags them correctly →
  `image-rules.ts` passes `hasOverview` (with OCR's `registrationVisible`) + `hasDamageCloseup`; status
  advances toward `ready_for_eva`. (Mirrors phase-2 "Image AI" verification.)
- A photo with a visible **person/reflection** → `image/screen` recommends `excluded`; reviewer confirms;
  the image drops out of the accepted set per `isAcceptedEvaImage`.
- Gate proof: with the env-var **false**, no Azure OpenAI call is made; roles/exclusion stay **manual**.
- Cost reality check: Azure OpenAI spend in Cost Management within the modelled band.

---

## 10. Open questions / uncertainties

1. **AI Builder vs Foundry — confirm the tenant's licensing.** The recommendation flips to "AI Builder is
   fine" **iff** the tenant already owns AI Builder/Copilot Credits and prefers no-code. **Verify**
   current entitlement in PPAC (`Licensing → Capacity add-ons`) before committing; otherwise Foundry.
2. **Classifier accuracy on real CE photos** — overview vs damage_closeup is easy in the clean case but
   ambiguous photos exist (a wide shot that also shows damage). **Verify:** label ~50 real Evidence images,
   score the prompt; tune the prompt or add an `additional` bias before trusting auto-advance.
3. **Reflection-detection precision/recall is unknown** — a missed reflection ships an unusable photo; a
   false-positive bins a good one. **Keep it advisory** (reviewer confirms) until measured on a real set.
   Never auto-exclude without the human in M2.
4. **Model availability + region** — vision-enabled models are region-gated; confirm a model is available
   in (or near) UK South for `rg-collisionspike-dev`, else pick the nearest region (data-residency note).
5. **Content Understanding (preview) timing** — if it reaches GA with solid image classification, it may
   beat a raw chat prompt for the *role* task (managed, structured). Revisit at M3.
6. **Per-provider `aiallowed`** — modelled but deferred; decide at M2 whether the gate is global-only or
   honours the per-provider toggle.

---

## 11. Decision summary (one line)

**Use one thin Azure Function over an Azure OpenAI / Foundry vision chat model for BOTH §5b needs —
overview-vs-`damage_closeup` role classification and person/reflection screening — gated by a Dataverse
env-var (default OFF), reached only via a CSP-safe custom connector, writing `imageRole` + a *advisory*
`excluded` straight into the canonical `image-rules` contract; prefer this over AI Builder because AI
Builder's seeded credits are removed 2026-11-01 and new add-on purchase is closed (AI Builder remains a
valid no-code fallback only where capacity is already owned); and **reject Azure Custom Vision and Image
Analysis 4.0 outright (both retire 2028-09-25)**. All of §5b is M2+ — M1 keeps role tagging and exclusion
manual; the only M1 image-AI is plate OCR.**
