# Azure + AI/Document Capabilities — What Would Actually Help (Research Lane 2)

> **Question:** for the Collision Engineers case-intake workflow on the Microsoft stack, which **Azure +
> AI/document** capabilities give real value, and which do not? Recommendation doc, grounded in the
> _current_ architecture (CURRENT_STATUS.md / ROADMAP.md / `functions/parser/` / `functions/enrichment/`)
> and verified against Microsoft Learn + Azure pricing (June 2026).
>
> **Scope:** Azure + AI/document only. **Out of scope here:** Power Platform-native AI (AI Builder,
> Copilot Studio — lane covering Power Platform), and the domain integrations (EVA Sentry, DVSA/DVLA,
> Box — their own lanes). Where those touch an Azure decision, they are named but not re-litigated.
>
> **Two hard constraints carried from the repo:** (1) **all-Microsoft** — no new Google Cloud, no
> non-MS SaaS; (2) **offline build vs operator activation** + **no mock/seed data** — Claude builds and
> verifies offline; injecting real secrets and running live tests is the operator's step.

---

## 0. What already exists (so we don't recommend rebuilding it)

The spike is **not greenfield**. The relevant Azure surface today:

| Piece | State | Bears on this lane |
|---|---|---|
| **Parser Function** (`functions/parser/`) | **Live** on **Flex Consumption (FC1)**, UK South, function-level auth, ≈£0 idle. Wraps the vendored `cedocumentmapper_v2` engine; returns the **12-field EVA contract** deterministically. | The regex/deterministic parser **works** for text PDF/DOCX/DOC/EML/MSG. Don't replace it without cause. |
| **OCR gap ("B-full")** | **Deferred.** FC1 cannot run a custom container, so the `tesseract` binary can't be provided → **scanned-image PDFs are not parsed today**. Decided host: **Azure Container Apps**. | This is the one genuine, already-scoped Azure gap. |
| **Enrichment Function** (`functions/enrichment/`) | Deployed **gated-OFF**. Calls **DVSA + DVLA directly** (Entra `client_credentials` + `X-API-Key`), Key Vault refs, managed identity, Bicep. **No Google Cloud gateway.** | The Azure security pattern (managed identity → Key Vault) is **already established** — reuse it, don't reinvent. |
| **Address policy** | Code App has a per-provider **address-policy gate**; `InspectionAddress`/`Repairer` reference tables modelled; `AZURE_MAPS_ENABLED=false` → postcode.io is the documented default. | The address-matching _service_ is unbuilt; the **gate and data model** are not. |
| **Provider/location analysis** | Done 2026-06-18. **57% of located cases carry only a part-postcode**; a handful of `(principal, district)` pairs dominate; shared storage yards identified. | This **reframes the address problem** (see §4) — it is a corpus lookup, not geocoding. |

**Principle for the whole doc:** the deterministic parser is a feature, not a stopgap — it mirrors
`collisioncc`'s "deterministic first, gate the expensive extractor" rule, costs £0/page, and is already
live-verified. Every AI recommendation below is **additive and gated**, never a rip-and-replace.

---

## 1. Azure AI Document Intelligence

Two distinct questions: (A) replace/augment the regex parser for **text** docs; (B) close the
**scanned-PDF OCR** gap.

### 1A. Replace/augment the regex parser (prebuilt or custom extraction) — **Value: LOW · Effort: M**

**Why it (mostly) doesn't help here.** The parser already emits the 12-field contract deterministically,
for free, and live-verified. Document Intelligence's value is when you _don't_ have structure or rules —
but Collision Engineers' instructions come from a **bounded, known set of providers** with stable layouts,
which is exactly the regime where a curated rules engine wins. A **custom extraction model** would need
**labelled training documents per layout** (min 5 samples/class; real provider PDFs) — which collides with
**"no mock data"** and adds a training+inference cost (**~$30/1,000 pages inference**, **$3/hr training**,
10 hrs free/mo) for fields we already get at £0.

- **Where it _does_ earn a place:** as the **deterministic parser's fallback** for documents the rules
  miss (new/odd provider layout, or low-confidence extraction). The flow already branches on
  `PDF_MAPPER_ENABLED`; a second gate `DOC_INTEL_ENABLED` could route _only the misses_ to **prebuilt
  Layout** (`features=keyValuePairs`) — keeping spend proportional to failures, not volume.
- **Cost/gotcha:** `prebuilt-read` $1.50/1k pages, `prebuilt-layout` $10/1k pages, **500 pages/mo free
  (F0)**. Custom **extraction** also accepts **image input**, so the same model could in principle do OCR —
  but for our shape that's an over-engineered path vs §1B. **Do not build a custom extraction model in M1.**

### 1B. Close the scanned-PDF OCR gap (the "B-full" path) — **Value: HIGH · Effort: M**

**Why it helps here.** This is the **real gap**: image-only PDFs (faxed/scanned instructions) silently fail
today. The decided host is Azure Container Apps (§6) bundling **Tesseract** — but **Document Intelligence
`prebuilt-read` is the lower-effort, higher-accuracy alternative** for the OCR step and needs **no container
at all**: call it over HTTP from the existing FC1 Function (or the flow), feed the extracted text back into
the _same_ `cedocumentmapper_v2` rules. That reuses the entire downstream contract path and avoids standing
up a container image just to host an OCR binary.

- **Recommendation:** make **Doc-Intelligence `prebuilt-read` the default OCR engine for scanned PDFs**, and
  keep **Tesseract-in-ACA** as the all-in-house fallback (and for the WhatsApp-image plate OCR, ADR-0007).
  ADR-0009's "Tesseract _or_ Document Intelligence Read" already anticipates this — this lane recommends
  **Read first** for scanned _documents_ on accuracy + zero-infra grounds.
- **Cost/gotcha:** at ~hundreds of scanned docs/mo, Read is **single-digit £/mo** and the first 500 pages
  are free. Gotcha: 15 req/s default throttle (irrelevant at this volume); and the SKU sits under the
  "Foundry Tools" rebrand — provision via the Document Intelligence resource, region **UK South** (data
  residency, co-locate with FC1).

---

## 2. Azure OpenAI / GPT (Azure AI Foundry)

Three candidate jobs: (a) field extraction, (b) email triage/classification, (c) provider/intermediary
disambiguation.

### 2a. Field extraction — **Value: LOW–MED · Effort: M**

The deterministic parser owns this. GPT with **structured outputs** (strict JSON-schema, GA on `gpt-4o`
2024-08-06+ and `gpt-4.1`; **key order preserved**, `additionalProperties:false`) could emit the **exact
12-field EVA shape** in one call — genuinely attractive as a **fallback extractor** for unstructured/odd
documents where both the rules _and_ Doc-Intelligence layout underperform (e.g. free-text email bodies
carrying instructions). But as a _primary_ path it is non-deterministic, costs tokens per case, and
duplicates working code. **Keep as a last-resort branch, not the default.**

- **Gotcha:** the two empty EVA fields (`claimant_telephone`, `claimant_email`, blocker **B2**) are a
  tempting GPT target — but they're better fixed in the sibling parser (deterministic, free) than by paying
  a model to guess. Don't paper over B2 with an LLM.

### 2b. Email triage / classification — **Value: MED · Effort: S–M**

Intake must decide: instruction vs images-only vs noise; which provider; is this a chaser/reply on an open
case. Today that's deterministic (sender domain → provider; attachment classify). A **GPT classifier** adds
real value on the **messy fringe** — forwarded chains, ambiguous subjects, body-only instructions — where
domain rules are brittle. **But** the cheaper, native option (**AI Builder prompts / Power Automate
AI**) likely covers this without leaving Power Platform, and that's the other lane's call. From the **Azure**
side: only reach for Azure OpenAI here if you need schema-strict, higher-reasoning triage the native tools
can't do. **Recommendation: defer to the Power Platform lane; Azure OpenAI is the escalation, not the
default.**

### 2c. Provider / intermediary disambiguation — **Value: MED–HIGH (but not an LLM job) · Effort: S**

The data analysis is blunt: the **EVA principal _code_ is the join key**, legal names are "FAO The Court"
placeholders, and intermediaries share email domains with providers. This is a **deterministic
reconciliation** problem (canonical `principalCode`, the ADR-0011 WorkProvider/intermediary/garage roles,
the dedup ladder ADR-0010) — **not** a fuzzy-LLM problem. An LLM would _add_ non-determinism to a space the
corpus already resolves exactly.

- **Where GPT _could_ help:** a **one-off, offline** assist to **propose** code↔name↔address matches for a
  human worklist during corpus incorporation (Phase 1b) — suggestions a person confirms, never an
  auto-match at runtime. That's a **batch tooling** use, gated behind human review, and must not touch live
  intake routing.
- **Cost/gotcha:** runtime auto-matching by LLM would violate the "providers must be matched
  deterministically" intent and risks an intermediary domain silently auto-matching. **Do not** put GPT in
  the live provider-match path.

**Azure OpenAI verdict:** keep it as a **gated fallback/escalation** (extraction misses, fringe triage) and
an **offline batch assistant** (corpus worklists) — never the primary path for anything already
deterministic. Provision in **UK South**, managed-identity auth, reuse the enrichment Function's Key Vault
pattern.

---

## 3. Azure AI Search over the corpus / cases — **Value: LOW (M1) · Effort: M–L**

**Why it doesn't help _yet_.** Azure AI Search shines for **full-text/vector/semantic retrieval over a
large, unstructured corpus** (RAG, knowledge bases). The spike's working store is **Dataverse** — already
relational, filterable, and the system of record. Case lookup, dedup, and provider matching are **exact-key
/ structured-query** operations Dataverse does natively. There is no large unstructured corpus to search in
M1.

- **The only plausible future fit:** if a **Copilot Studio staff assistant** (gated `COPILOT_ENABLED`,
  M3+) needs to ground answers over historic case notes / EVA exports / guidance docs, Azure AI Search
  becomes the retrieval layer behind it. That's an **M3 RAG** decision, not an M1 intake one.
- **Cost/gotcha:** Dedicated pricing is **always-on** (no scale-to-zero): **Free** tier exists (50 MB,
  shared, **no semantic ranker, no managed identity**, may be reaped when idle — unsuitable for anything
  real); **Basic ≈ $75/mo**, **S1 ≈ $250/mo** — a standing monthly cost that breaks the **≈£0-idle**
  posture for zero M1 benefit. Semantic ranker has a 1,000-query/mo free allowance but needs Basic+.
  **Do not provision for M1.**

---

## 4. Azure Maps vs postcode.io for address-matching — **postcode.io (or pure corpus). Azure Maps: LOW · Effort to add Maps: M**

This is the most important "don't be seduced by the shiny service" call in the lane, and the data analysis
settles it.

**The problem is not geocoding — it's a curated part-postcode → known-yard lookup.** The analysis
(`loc_principal_analysis.md`) shows:

- **57% of located cases carry only a part-postcode** (outward district, e.g. `CH5`, `M12`).
- The volume is **concentrated**: a few `(principal, district)` pairs dominate — **M12 → QCL (814 cases)**,
  **CH65 → Savas & Savage (495)**, **B5 → Fairway (355)** — and shared **full**-postcode yards recur
  heavily (**CH46 4TP, 867 cases across 11 principals**).
- A district is shared by **many** principals (OL2: 28 principals) — so **the location alone cannot identify
  the provider**, and conversely the **provider + district** usually pins one known yard.

What actually resolves a part-postcode to a usable inspection address is **the corpus**: map the
high-frequency `(principal, district)` pairs to the **real full yard address you already know**, store them
as `Repairer`/`InspectionAddress` reference rows (Phase 1b.2/1b.3), and resolve at runtime by
`district startswith(outwardCode)` over that corpus → EVA field 9. **No external geocoder is in that loop.**

- **postcode.io** does the _supporting_ job (validate/normalise a UK postcode, expand a full unit, sanity
  the outward code) — **free, open-source, UK-only**, exactly the coverage we need. It carries **no SLA**,
  but the commercial **Ideal Postcodes** product is the drop-in upgrade if an SLA is later required
  (still not Azure Maps).
- **Azure Maps adds little here:** it bills per transaction (~$4.50/1,000; **5,000 free/mo**) and earns its
  keep for **reverse geocoding, autocomplete, routing, or non-UK** — **none of which this workflow needs.**
  Geocoding a _part_ postcode returns a district centroid, which is **less** useful than the known yard
  address the corpus already holds. Keep `AZURE_MAPS_ENABLED=false` as the design intends; revisit only if a
  genuine map-on-screen or autocomplete requirement appears.

**Recommendation:** build the address-matching service as a **corpus lookup with postcode.io
normalisation**; treat Azure Maps as a **later, gated, optional** convenience, not a dependency.

---

## 5. Service Bus / Durable Functions for orchestration vs Power Automate — **Value: LOW (not yet) · Effort: L**

**Why it isn't warranted now.** The pipeline orchestration (inbox intake → classify/persist → parse →
dedup → status machine → enrichment → EVA+Box finalize → chasers) is **already built as 10 Power Automate
cloud flows** (imported, `state=off`). Power Automate is the _right altitude_ for this: it owns the
**connectors** (Outlook shared mailbox, Dataverse, Box) that Service Bus/Durable would have to re-plumb, and
it's where the operator activation story lives. Swapping in Service Bus + Durable Functions would **discard
working orchestration** and **re-introduce the connector problem** the flows solve — for throughput the
spike doesn't have (single-mailbox-first, ~1,000 cases/mo).

- **The one defensible niche (later):** if a future step needs **high-volume fan-out, ordered processing,
  retry/dead-letter guarantees, or long-running stateful fan-in** that cloud flows handle awkwardly — e.g.
  **bulk WhatsApp media import** (ADR-0007: OCR each image, match by VRM) could justify a **Container Apps
  job + a queue** for the OCR fan-out. Even then it's a **localized** orchestration inside one step, not a
  pipeline rewrite.
- **Cost/gotcha:** Durable Functions on FC1/Consumption is cheap, but the real cost is **architectural
  churn** and a **second orchestration system** to reason about alongside the flows. **Do not migrate the
  pipeline.** Reach for a queue only inside a proven-bursty step.

---

## 6. Azure Container Apps as the OCR host (the decided B-full path) — **Value: HIGH (if not using DI Read) · Effort: M** — sketch

ACA is the **right** host for an OCR binary, and the decision to use it stands. Given §1B, the cleanest
shape is **belt-and-braces**: Doc-Intelligence Read as the default scanned-document OCR; **ACA hosts the
all-in-house Tesseract fallback** + the **WhatsApp-image plate-OCR** worker (ADR-0007/0009) that wants a
bundled binary anyway.

**Sketch (Consumption workload profile, UK South):**

```
                         ┌─────────────────────────────────────────────┐
  Flow / FC1 Function    │  Azure Container Apps environment (UK South) │
  needs OCR for a   ───▶ │  Consumption plan · scale-to-zero            │
  scanned PDF / image    │                                             │
                         │  ┌───────────────────────────────────────┐  │
                         │  │ ocr-app  (HTTP, internal ingress)      │  │
                         │  │  • python + tesseract-ocr binary       │  │
                         │  │  • POST /ocr {bytes} → {text, conf}    │  │
                         │  │  • reuses cedocumentmapper_v2 readers  │  │
                         │  │  • system-assigned managed identity    │  │
                         │  └───────────────────────────────────────┘  │
                         │     scales 0→N on request; N→0 when idle     │
                         └─────────────────────────────────────────────┘
                                    │ secrets via Key Vault refs (MI)
                                    ▼
                              Azure Key Vault  (same pattern as enrichment fn)
```

- **Why ACA over FC1:** FC1 **cannot bring a custom container**, so it cannot ship the Tesseract binary —
  the exact reason B-full was deferred. ACA Consumption **can** (bring-your-own image), **scales to zero**,
  and shares the Functions programming model if you want it (Functions-on-ACA).
- **Reuse, don't fork:** the container should import the **same `cedocumentmapper_v2` readers** so the OCR
  output flows into the identical contract path — OCR becomes a pre-step that hands text to the existing
  rules, not a parallel parser.
- **Cost/gotcha — effectively £0 at this volume:** ACA Consumption free grant per subscription per month is
  **180,000 vCPU-seconds + 360,000 GiB-seconds + 2,000,000 requests**; scaled-to-zero costs nothing.
  Hundreds of OCR calls/mo sit **well inside the free grant** → preserves the ≈£0-idle posture. Gotchas:
  **cold-start** on scale-from-zero (acceptable for an async intake step); pin **UK South**; **PyMuPDF AGPL
  is already resolved** (memory note — do not re-raise); build via Bicep mirroring the enrichment Function's
  identity/Key-Vault wiring.

---

## 7. Observability, Key Vault / managed identity, and cost posture

### 7a. Observability — App Insights + alerts — **Value: HIGH · Effort: S**

Both Functions already declare **Application Insights** (it's in `host.json` / Bicep). The cheap, high-value
add is to **use** it: a handful of **alerts** so failures surface without watching dashboards.

- **Recommend:** alert on **parser 5xx / 502** (parser dependency failed), **DVSA/DVLA auth failures** (401
  storms / token refresh loops — the enrichment client self-heals once but repeated failures mean a creds
  problem), **dependency latency** (DVSA backoff), and (once live) **failed flow runs**. Add a minimal
  **availability** ping on the parser `/parse` health.
- **Cost/gotcha:** App Insights is **ingestion-priced**; at this volume it's negligible, but set a
  **daily cap** and **sampling** to avoid surprise spikes. Alerts cost ~pennies. This is the single best
  effort:value ratio in the lane.

### 7b. Key Vault / managed identity hardening — **Value: HIGH · Effort: S (mostly done)**

The enrichment Function **already** does this right: secrets as **`@Microsoft.KeyVault(SecretUri=...)`**
references, resolved by the **system-assigned managed identity** (granted _Key Vault Secrets User_ via
Bicep), redacted `__repr__`, secrets never logged. **This is the template — apply it verbatim** to the EVA
credentials (B5) and the ACA OCR worker.

- **Recommend:** (1) keep **every** new secret (EVA `Client_Id`/`Client_Secret`, any future keys) as a KV
  reference + MI — never an app-setting literal; (2) prefer **managed identity over API keys** wherever the
  target supports Entra (DVSA already uses `client_credentials`); (3) enable **KV soft-delete + purge
  protection** and **diagnostic logging** on the vault; (4) keep the **no-secret-values-in-repo** gate green.
- **Cost/gotcha:** Key Vault transactions are ~free at this scale. Gotcha: **operator owns secret
  injection** (RESERVED-FOR-USER) — the build stays offline. Don't let an LLM or flow read a secret value.

### 7c. Cost posture — **Value: HIGH (preserve it) · Effort: S**

Today the estate is **≈£0 idle on FC1** (scale-to-zero Functions, gated-off enrichment). The recommendations
above **protect** that:

| Recommendation | Idle cost | Marginal cost | Posture |
|---|---|---|---|
| DI `prebuilt-read` for scanned PDFs (§1B) | £0 | $1.50/1k pages, 500 free/mo | per-use, tiny |
| ACA OCR fallback (§6) | **£0** (scale-to-zero) | within free grant at volume | per-use, ~£0 |
| Azure OpenAI gated fallback (§2) | £0 (no deployment cost) | tokens per escalation only | per-use |
| App Insights alerts (§7a) | ~pennies | ingestion (cap+sample) | negligible |
| **Azure AI Search (§3)** | **$75–250/mo standing** | — | **breaks ≈£0 idle → don't** |
| **Azure Maps (§4)** | $0 (5k free/mo) but unneeded | per-txn | avoid; corpus wins |

**Rule:** prefer **scale-to-zero / per-transaction / free-grant** services (DI, ACA, Azure OpenAI,
App Insights). **Avoid always-on** services (AI Search dedicated tiers) until a feature genuinely requires
them. Keep gates (`*_ENABLED`) on every paid path so cost is opt-in per environment.

---

## 8. Do NOT do / not yet (explicit)

1. **Do NOT rebuild the working deterministic parser** with Document Intelligence or GPT. It emits the
   12-field contract for £0 and is live-verified. AI is a **gated fallback for the misses**, never the
   primary path.
2. **Do NOT train a custom Document Intelligence extraction model in M1.** It needs labelled real-provider
   documents (collides with "no mock data") and pays per-page for fields already obtained free. Revisit only
   if prebuilt Layout + rules demonstrably can't cope with a high-volume provider.
3. **Do NOT put GPT/LLM in the live provider-match or dedup path.** Provider identity is a **deterministic**
   code/corpus reconciliation (ADR-0010/0011); an LLM adds non-determinism and risks an intermediary domain
   auto-matching. GPT here is **offline worklist assist only**, human-confirmed.
4. **Do NOT stand up Azure AI Search for M1.** No large unstructured corpus; Dataverse handles structured
   lookup; dedicated tiers are **always-on ($75–250/mo)** and break the ≈£0-idle posture. It's an **M3
   RAG/Copilot** decision if anything.
5. **Do NOT adopt Azure Maps as an address dependency.** The problem is a **part-postcode → known-yard
   corpus lookup**, not geocoding; postcode.io (free, UK) + the corpus resolve it. Keep
   `AZURE_MAPS_ENABLED=false`.
6. **Do NOT migrate the pipeline to Service Bus / Durable Functions.** 10 cloud flows already orchestrate it
   and own the connectors; a rewrite discards working code for throughput we don't have. Use a queue only
   _inside_ a proven-bursty step (e.g. WhatsApp bulk OCR).
7. **Do NOT build new image work on Azure Custom Vision or Image Analysis 4.0** — both retire
   **2028-09-25** (confirmed; ADR-0009). Use DI Read / Tesseract for OCR now; AI Builder + Foundry vision
   (other lane) for classification/reflection in M2.
8. **Do NOT inject any real secret value** (offline-build boundary). EVA/DVSA/DVLA creds and the live tests
   are the **operator's** step; the build wires Key Vault **references** only.
9. **Do NOT re-raise PyMuPDF AGPL** for the parser — resolved (memory note).

---

## 9. Top-5 ranked shortlist

| # | Recommendation | Value | Effort | One-line why |
|---|---|---|---|---|
| **1** | **Doc-Intelligence `prebuilt-read` as the default scanned-PDF OCR**, feeding the existing `cedocumentmapper_v2` rules; Tesseract-in-ACA as the all-in-house fallback. | **HIGH** | **M** | Closes the only real parsing gap (B-full) with **zero new infra**, ~£0 at volume, and reuses the whole 12-field contract path. |
| **2** | **App Insights alerts + Key Vault/managed-identity hardening** applied to every Function and the EVA creds (replicating the enrichment Function's pattern). | **HIGH** | **S** | Best effort:value ratio — failures surface, secrets stay safe, posture preserved; mostly wiring that already exists. |
| **3** | **Address-matching service as a corpus lookup + postcode.io normalisation** (not Azure Maps). | **HIGH** | **M** | The data proves it's a part-postcode→known-yard **join**, not geocoding; resolves 57%-part-postcode cases with free, UK-only tooling. |
| **4** | **Azure Container Apps OCR worker** (scale-to-zero) hosting Tesseract for the WhatsApp-image plate OCR + as the DI-Read fallback. | **MED–HIGH** | **M** | The decided B-full host; ACA can ship the binary FC1 can't, stays inside the free grant (~£0 idle), reuses the parser readers. |
| **5** | **Azure OpenAI (structured outputs) as a gated fallback** for extraction misses / fringe email triage, and an **offline** corpus-worklist assistant. | **MED** | **S–M** | Schema-strict last-resort for the messy fringe the rules/DI miss — per-token, opt-in, never the default and never in the live match path. |

**Explicitly ranked _out_:** Azure AI Search (no M1 corpus; always-on cost), Azure Maps (corpus beats
geocoding here), Service Bus/Durable Functions pipeline migration (flows already work), custom DI
extraction-model training in M1 (no-mock-data + cost), and any new Custom Vision / Image Analysis 4.0 work
(retiring 2028).

---

## Appendix — figures verified (Microsoft Learn + Azure pricing, June 2026)

- **Document Intelligence (UK South):** Read **$1.50 / 1,000 pages**; Layout **$10 / 1,000 pages**; custom
  **extraction** inference **$30 / 1,000 pages**; custom **neural training $3/hr** (first **10 hrs/mo
  free**); **500 free pages/mo (F0)**; custom extraction accepts **image** input; 15 req/s default throttle.
  Now under the "Foundry Tools" branding — provision the Document Intelligence resource in **UK South**.
- **Azure OpenAI structured outputs:** GA on `gpt-4o` (2024-08-06 / 2024-11-20) and `gpt-4.1`; strict
  JSON-schema adherence with `additionalProperties:false`; **key ordering follows the schema** → maps
  cleanly to the ordered 12-field EVA contract. Not supported with "bring-your-own-data"/Assistants.
- **Azure Container Apps (Consumption):** **scale-to-zero**; free grant **180,000 vCPU-s + 360,000 GiB-s +
  2,000,000 requests** per subscription per month; bring-your-own container image (the FC1 blocker);
  Functions-on-ACA available.
- **Azure Maps:** transaction-based (~**$4.50 / 1,000**), **5,000 free/mo**; earns value only for reverse
  geocoding / autocomplete / routing / non-UK — none required here. Gen1 retires 2026-09-15 (use Gen2).
- **postcode.io:** free, open-source, **UK-only**, no auth; **no SLA** (commercial Ideal Postcodes is the
  SLA-backed upgrade).
- **Azure AI Search:** **Free** tier (50 MB, shared, **no semantic ranker / no managed identity**);
  **Basic ≈ $75/mo**, **S1 ≈ $250/mo** (Dedicated = **always-on**, no scale-to-zero); semantic ranker
  **1,000 queries/mo free** then per-1,000, needs Basic+.
- **Azure AI Vision / Image Analysis 4.0** and **Custom Vision:** transaction-priced (~$1.50/1,000 Read) but
  **both retire 2028-09-25** (confirmed on Microsoft Learn) — no new work on them.
- _Approximate figures_ (Azure Maps $/1k, AI Vision Read $/1k, AI Search Basic/S1 monthly): corroborated
  across aggregators, not read off the live JS pricing page — **verify against the live pricing page before
  any commercial commitment.**
