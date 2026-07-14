# Phase 4a-v2 — GPT-4o multimodal ESCALATION layer for the live inspection-location suggestion assist (helper #3)

> **Status: PROPOSED 2026-06-24 (design only; build deferred — gated/offline; depends on Phase 4a-v1 shipping first and Box being live for photo bytes).** Human-in-the-loop, **ADR-0013-compliant** — the GPT-4o pass returns **human-confirmed candidate SUGGESTIONS only; nothing auto-applies**. Extends [`live-location-suggestion-assist.md`](./live-location-suggestion-assist.md) (the v1 it escalates from). Re-affirms [ADR-0013](../../adr/0013-loc-export-artifact-no-runtime-address-matching.md) and aligns to [ADR-0017](../../adr/0017-data-retention-erasure-pii-lifecycle.md) (the AI-data-protection prerequisite).
>
> ✅ **AI-drafted (Plan agent), fact-checked (claude agent) 2026-06-24 — verdict: accurate & well-grounded; ADR-0013/0017 readings verified, all named files/env-vars/CSP-connector/Box/milestone claims confirmed, no invented references. Corrections + added considerations folded in (see *Fact-check verdict & corrections* before §10).**

---

## Summary

When v1's **deterministic** extraction (Azure AI Vision Image Analysis + Read OCR over the case's own inspection photos, plus Azure Maps geocoding of text clues) **fails to produce a confident candidate**, the reviewer may **optionally** escalate to a **GPT-4o multimodal reasoning pass** that looks at the same photos + text clues and **infers** candidate inspection location(s). The result is returned exactly like a v1 candidate — a ranked SUGGESTION with provenance and confidence — that the reviewer **confirms** (→ becomes the inspection address, manual decision) **or** discards in favour of "Image Based Assessment + reason". **Nothing auto-applies.** It is a **cost lever**, not the default path: it fires only on the minority of hard "can't-ID" cases, behind its own env-var gate, default-off.

This is an **escalation tier inside the existing `location-suggest` Function** (not a new Function), so v1's human-in-the-loop boundary, provenance recording, and Address-tab UI are reused unchanged. The only net-new surface is: one Azure OpenAI (Foundry Models) resource + deployment, one env-var gate (+ config/secrets), a GPT-4o branch in the Function with a structured-output contract, a "this candidate came from AI reasoning" provenance label, and cost-control plumbing.

---

## 1. Trigger criteria — exactly when v2 escalates

v2 must **never** run on every case. It escalates only when **all** of these hold:

1. **Gate ON.** `cr1bd_LOCATION_ASSIST_GPT4O_ENABLED = true` (default false; operator-flipped per environment).
2. **v1 ran and failed to clear the confidence bar.** Within the same `location-suggest` invocation, the deterministic tier (Vision + Read OCR + Maps geocode of accident-circumstances + claimant address) returned **either no candidate, or only candidates below a configured confidence floor** (e.g. top candidate score `< 0.5` on the v1 scale). The escalation decision is made **server-side, inside the Function**, from the v1 result — not by the Code App.
3. **There are usable photo bytes to reason over.** At least one inspection photo is fetchable from Box (the LLM pass is multimodal; with zero images it degrades to a weak text-only guess and should be skipped). Text-only escalation is **out of scope for v1-of-v2**.
4. **Reviewer explicitly asks for it.** Because there is a per-call cost with no free tier, the Address-tab action is **two-step**: "Suggest location" runs v1 (free-tier); if v1 is weak, the UI surfaces a second, clearly-labelled **"Try a deeper photo-based suggestion"** action that the reviewer presses to authorise the billed pass. (Operator may later choose "auto-escalate within the same click" via a config flag — see Open Questions — but the **default is reviewer-pressed** to keep spend deliberate.)
5. **Budget caps not exceeded.** Per-case call cap and per-day spend cap (see §4) both pass.

If 1–5 hold, the Function runs the GPT-4o branch; otherwise it returns v1's result (or an empty/"no confident suggestion — record Image Based Assessment" state). **Escalation is the exception, expected on roughly 10–20% of can't-ID cases.**

---

## 2. Model choice + trade-offs

**Catalog options considered (Azure AI Foundry Models, UK South, multimodal):** `gpt-4o`, `gpt-4o-mini`, `gpt-4.1` / `gpt-4.1-mini`, and the o-series reasoning models which also accept image input.

**Recommendation: `gpt-4o` as the primary escalation model, with `gpt-4o-mini` as a configurable cheaper-first option.**

| Factor | `gpt-4o` | `gpt-4o-mini` | Notes |
|---|---|---|---|
| Multimodal reasoning over signage/landmarks/plates | Strong | Weaker on fine OCR-from-scene + spatial reasoning | The task is hard *because* v1's deterministic OCR already failed; mini is more likely to repeat the failure. |
| Cost (UK South, GBP ex VAT, 2026-06-24) | in **£0.0019/1K**, out **£0.0075/1K**, ~**£0.0047/call** | materially cheaper per 1K | mini's lower quality on the hard residual cases can erase the saving. |
| Free tier | **none** | none | GPT-4o family always bills — unlike Maps free grant / Vision F0 / DI Read F0. |

Treat **`gpt-4o` as the contract model**, with a `cr1bd_LOCATION_ASSIST_MODEL` config string so the operator can fall back to `gpt-4o-mini` for cost or try `gpt-4.1` later without redeploying the Function.

**Deployment type — Global Standard vs Batch:**
- **Global Standard (synchronous, default for the reviewer-pressed path).** The reviewer is waiting; a real-time response is required. Standard pricing applies.
- **Batch API (~50% off, ~24h SLA).** **Not suitable for the live reviewer-pressed flow.** Keep Batch in mind only for a **possible future offline re-run / corpus-mining job** over a backlog of historically can't-ID cases (an offline corpus-build use — ADR-0016 helper #3 "offline mining" — not this live escalation). Note as a future lever; do **not** build it in v2.
- Use a **regional / data-zone deployment pinned to UK / EU** for residency (see §7).

**Image detail level — `low` vs `high`:**
- `high` detail tiles the image and costs **many more tokens per image** than `low`.
- **Recommendation: send each photo at `low` detail first** (gist-level scene reasoning; v1's high-fidelity Read OCR already tried the fine-text route).
- **Optionally allow one `high`-detail pass on a single best candidate photo** when `low` yields nothing — configurable, off by default.
- **Cap the number of images sent** (e.g. **max 3–4 photos** chosen by v1's Vision signal) — the single biggest token/cost lever after escalate-only.

---

## 3. Prompt + structured-output design

- **Use Azure OpenAI Structured Outputs (`response_format` = `json_schema`, `strict: true`)** — do not parse free text.
- **JSON schema (returned object):**
  ```
  {
    "candidates": [
      {
        "label": string,                 // human-readable site/place
        "addressGuess": string|null,     // best-effort partial address text (NOT a resolved address)
        "postcodeArea": string|null,     // area/town only if visible; never a fabricated full postcode
        "confidence": number,            // 0..1
        "evidence": [string],            // provenance: what in the image/text drove this
        "sourcePhotoRef": string|null    // which supplied photo id
      }
    ],
    "noConfidentLocation": boolean,      // true => fall back to Image Based Assessment
    "reasoningSummary": string           // short, for the reviewer + audit
  }
  ```
- **System prompt rules (load-bearing):** "You SUGGEST candidate inspection locations from photo + text evidence for a human reviewer to confirm. You do NOT decide. Only report what is **visibly evidenced**. **Do not invent** street numbers or full postcodes. If you cannot evidence a location, set `noConfidentLocation: true`."
- **User content:** ≤3–4 photos (`low` detail) + a compact text block of v1 clues (accident-circumstances place text, claimant address, Vision/OCR strings, the provider's known corpus site names as context to match against).
- **`max_tokens` cap:** 400–600 completion tokens. **`temperature: 0`** for repeatability/auditability.
- **Map model output back through v1's ranker** (tagged `source: 'ai_reasoning'`); optionally re-geocode `postcodeArea`/`addressGuess` via Azure Maps for a pin — still a suggestion, never applied.

---

## 4. Cost controls

In order of leverage: (1) **escalate-only**; (2) **image budget** (≤3–4 photos, `low` detail, optional single `high` retry); (3) **output cap** (`max_tokens` 400–600); (4) **prompt caching** of the static system prompt + schema + per-provider corpus context (cached input £0.0009/1K ≈ 50% off input); (5) **per-case cap** (1 call/case/action); (6) **per-day spend cap** (`cr1bd_LOCATION_ASSIST_DAILY_CAP`); (7) **spend telemetry** to App Insights + an **Azure Cost Management budget + alert** on the Azure OpenAI resource.

**Estimated monthly cost range** (UK South, GBP ex VAT). **Per-call ~£0.0047 is a floor** (one low-detail image + small output); with 3–4 images + the per-provider corpus context in the prompt, a realistic call is **~£0.006–0.008**. The table uses the floor; even at the higher figure the monthly total stays sub-£1 at these volumes. Escalation fires only on can't-ID cases the reviewer then chooses to deepen:

| Volume | Cases reaching v1 assist (~20%) | Escalation rate | GPT-4o calls/mo | Est. cost/mo |
|---|---|---|---|---|
| 500/mo (dev) | ~100 | 10% | ~10 | **~£0.05** |
| 500/mo (dev) | ~100 | 20% | ~20 | **~£0.09** |
| 1,000/mo (pilot) | ~200 | 10% | ~20 | **~£0.09** |
| 1,000/mo (pilot) | ~200 | 20% | ~40 | **~£0.19** |

Even with a generous `high`-detail retry on a third of escalations, spend stays **sub-£1 to low-single-digit-£/month** at these volumes. The dominant *risk* is a **runaway** (mis-gated auto-escalation, uncapped loop, whole-gallery at `high` detail) — which controls 1/2/5/6 prevent. **Headline: budget < £5/month at pilot volume; set the Azure budget alert at ~£20/month as a tripwire.**

---

## 5. Gating + config

**New Dataverse environment variables** (`dataverse/environment-variables.json`, all default **false**/empty, Code App READS them):

- `cr1bd_LOCATION_ASSIST_GPT4O_ENABLED` (Boolean, default `false`) — master gate for the escalation tier; sibling to `cr1bd_LOCATION_ASSIST_ENABLED` (v1).
- `cr1bd_LOCATION_ASSIST_MODEL` (String, default `gpt-4o`) — switch to `gpt-4o-mini` without redeploy.
- `cr1bd_LOCATION_ASSIST_DAILY_CAP` (Int/String, default e.g. `50`) — per-day call cap.
- `cr1bd_AZURE_OPENAI_ENDPOINT` (String, default empty) — the Azure OpenAI endpoint, set per-environment at activation (mirrors `ENRICHMENT_API_BASE` / `BOX_FOLDER_ROOT_ID` — not a secret).

**Secrets (Key Vault, read by the Function — never Dataverse env-vars):** prefer **managed identity + RBAC (`Cognitive Services OpenAI User`)** on the Function → Azure OpenAI (no key); else a `location-assist-openai-key` secret reference. Grant the MI role via **ARM template** (the CLI `az role assignment` returns `MissingSubscription` in this env — see AGENTS.md).

**Azure resource:** one **Azure OpenAI (Foundry Models)** resource in `rg-collisionspike-dev`, **UK South / pinned UK-or-EU data zone**, with a **`gpt-4o` deployment**. Provisioned offline, gated off; activation is `[RESERVED-FOR-USER]`.

---

## 6. Human-in-the-loop + provenance/audit (the ADR-0013 guarantee)

Identical boundary to v1 — v2 only adds a new candidate *source*:

- **Surfacing.** GPT-4o candidates render in the Code App **Address tab** as the same candidate rows as v1, ordered by confidence, each with **provenance** in plain user language ("from a photo: sign reading 'Smith Recovery'"). Marked as AI-suggested in **plain terms** ("suggested from the photos") — honouring the no-engineering-language rule (no "GPT-4o"/"LLM"/"model"/"API" in any rendered string).
- **Confirmation.** Reviewer **picks** a candidate → flows through the existing confirmation path in `address-policy.ts` → inspection address as a **manual decision** (`decisionMode = 'manual'`); **or** records **"Image Based Assessment" + reason** (`decisionMode = 'image_based'`, reason required).
- **Nothing auto-applies.** Candidate rows stay `decisionMode = unknown` until a reviewer confirms. The Function **never writes the Case's EVA inspection address**.
- **Field-level provenance / audit.** Per confirmed address record: the **source** (`suggested:ai_reasoning` `sourceLabel`, distinct from `suggested:eva_export` and v1's `suggested:vision`/`suggested:geocode`), the candidate's evidence string, the model + deployment used, the reviewer + timestamp — via existing provenance fields + an `cr1bd_auditevent` row.

---

## 7. Privacy / governance

This tier **sends third-party claimant PII (vehicle photos, registration plates, possibly people/reflections) to a generative model** — the highest-sensitivity data flow in the project, governed by ADR-0017.

- **ADR-0017 alignment (the gating decision).** ADR-0017 **defers the production data-protection sign-off** for AI over PII but grants authority to run **AI testing on repo data now** (dev). Therefore: **build + test now (dev), gated off; the *production* flip is blocked on the ADR-0017 production sign-off** (PII pre-scrub posture + in-tenant Azure OpenAI confirmed). Record this hard activation gate in `docs/gated.md`.
- **In-tenant, no-train, regional.** Use **Azure OpenAI in our own tenant** (not public OpenAI). Azure OpenAI does **not** train on prompt/image data and supports **regional deployment**; pin to **UK / EU data zone** for residency.
- **Abuse-monitoring / retention.** Azure OpenAI's default abuse-monitoring retains prompts up to 30 days for human review. For PII images, **apply for the Limited Access "no human review / no retention" exemption**, or document acceptance.
- **Task-focused request shaping.** Send the photos and case context needed for the requested analysis (normally ≤3–4 photos) to control cost and quality. This is not a PII-only processing ban: full authorised project evidence may be included when the task requires it. Plates are intrinsic to the image — note in the DPIA.
- **DPIA / governance step (flagged).** Record this flow in the **DPIA / controller-processor map** (`docs/architecture/data-protection.md`, to be authored): Microsoft as processor, lawful basis, data categories, residency, retention, the human-in-the-loop control. **No production activation without this artefact.**
- **No new persistent PII store.** Box already holds the photo bytes (ADR-0012 one-way mirror); v2 reads them transiently and forwards to in-tenant Azure OpenAI.

---

## 8. Where it fits — phase / milestone + dependencies

- **Phase:** **Phase 4a**, as **helper #3, v2** — the escalation tier of the live location-suggestion assist.
- **Milestone:** **M3** (assistive + optional; gated-off, off the EVA/Box critical path — same bucket as 4a Azure Maps, valuation, Copilot). Not an M1/M2 gate. Confirm against `milestone-model.md` when adopted.
- **Hard dependencies (build order):**
  1. **v1 must ship first** — v2 is an escalation inside v1's `location-suggest` Function and reuses its candidate/provenance/UI machinery + confidence scores.
  2. **Box must be live for photo bytes** (Phase 7 Box active) — until then, stubbed/offline like v1's Box read path.
  3. **`cr1bd_evaclaimantaddress` + accident-circumstances parse** (added by v1) — reused as the text clues.
  4. **ADR-0017 production sign-off** — for *production* activation only; dev testing authorised now.

---

## 9. Critical files / components + agent-roster owners

**Azure Function (azure-integration-engineer):** the existing **`location-suggest` Function** gains a GPT-4o escalation branch (trigger check, Azure OpenAI client via managed identity, structured-output schema, image selection/encoding, prompt assembly, response→v1-candidate mapping, per-case/per-day caps, spend telemetry). **No new Function.** Plus Key Vault / RBAC (MI grant via ARM).

**Dataverse (dataverse-data-architect):** `dataverse/environment-variables.json` — add the four `LOCATION_ASSIST_*` / `AZURE_OPENAI_ENDPOINT` entries (defaults off/empty). Provenance — `suggested:ai_reasoning` `sourceLabel` + audit-event recording.

**Code App (code-app-architect):** Address-tab assist UI — the second, clearly-labelled "deeper photo-based suggestion" action (shown only when v1 is weak and the gate is on); render AI candidates with plain-language provenance + an AI-suggested marker; route confirmation through the existing decision path; honour no-engineering-language. Gate reads alongside v1. Domain glue in `mockup-app/src/domain/address-policy.ts` (confirm AI candidates resolve as `manual`) and `mockup-app/src/data/types.ts` (`SuggestedAddress` may gain `source`/AI-flag + `evidence`).

**Docs:** `docs/architecture/data-protection.md` (the DPIA artefact); `docs/gated.md` (production-activation blocker); a short dedicated ADR (or ADR-0016 helper-#3 update) recording the live GPT-4o escalation, re-affirming ADR-0013.

---

## Fact-check verdict & corrections (claude agent, 2026-06-24)

**Verdict: largely accurate and well-grounded.** ADR-0013 + ADR-0017 readings verified and not over-claimed; all named files, env-vars, conventions, the CSP/connector path, Box status, and M3 placement confirmed against the repo; no invented references. Corrections + additions:

- **Per-call cost** — £0.0047 is a *floor*; realistic ~£0.006–0.008 with 3–4 images + corpus context (headline sub-£1/mo unchanged).
- **Audit action** — `cr1bd_auditaction` is a controlled, additive-only enum with **no** AI/location option today; this needs a **new additive option** (don't assume one exists). Field-level provenance is already supported: `cr1bd_fieldprovenancesourcetype` already has `ai` and `azure_vision` values.
- **Provenance field reuse** — `SuggestedAddress` already has `evidenceNote?`; reuse/extend it rather than adding a parallel `evidence` field.
- **Residency** — for strict UK residency use a **regional UK South Standard** deployment; Azure OpenAI **Data Zone** is EU/US-scoped (use the EU data zone only if UK-regional capacity is unavailable). Don't conflate the two.
- **Milestone** — M3 is by analogy to 4a Azure Maps; mark **provisional pending the dedicated ADR** (the binding source).

**Missing considerations now in scope:**
- **Photo selection (business rule, not PII)** — the domain rule *"any photo showing a person's reflection is unusable"* is a **business/quality** requirement (such photos simply aren't usable), **not** a data-protection rule: prefer usable (reflection-free) photos when selecting the ≤3–4 to send. *(Registration plates / claimant identifiers in the images are the genuine data-protection concern — those stay in §7 / the DPIA.)*
- **EVA photo-order — no impact** — this feature only *reads* photos for location reasoning; it never selects or reorders EVA-submission photos.
- **Synchronous latency UX** — set a request timeout + a plain-language "still working…" affordance + graceful fallback to "no confident suggestion — record Image Based Assessment" on timeout; verify the connector's request-timeout ceiling.
- **Rate-limit (429) handling** — a TPM/RPM throttle surfaces to a waiting reviewer; degrade to the same friendly fallback, not an error.
- **Box-fetch failure** — when Box is live but a photo fetch fails, degrade to "no deeper suggestion available right now," not an error.
- **Structured-output strict mode** — `json_schema strict:true` support is model/api-version dependent; re-verify when `cr1bd_LOCATION_ASSIST_MODEL` is switched (gpt-4o-mini / gpt-4.1).

---

## 10. Risks + open questions

**Risks:** (1) **ADR-0013 drift** — anyone auto-setting the address; mitigated by the Function never writing the Case address, candidates stay `unknown`, confirm only via the decision path, verify step asserts no auto-set. (2) **Cost runaway** — mitigated by escalate-only + image budget + per-case/per-day caps + Azure budget alert. (3) **PII exposure** — mitigated by in-tenant Azure OpenAI, UK/EU residency, abuse-monitoring exemption, minimisation, the production gate. (4) **Hallucinated addresses** — mitigated by "report only visibly-evidenced; do not invent postcodes", schema `addressGuess`/`postcodeArea` (not "resolved address"), `temperature 0`, human confirm. (5) **Engineering language leaking to UI** — mitigated by plain-language strings. (6) **CSP / connector path** — the Code App calls the Function via the existing connector, not direct fetch; reuse v1's pattern.

**Open questions (operator):** (1) auto-escalate vs reviewer-pressed (default reviewer-pressed)? (2) allow the `high`-detail retry, or `low`-only? (3) `gpt-4o` only, or a `gpt-4o-mini`→`gpt-4o` ladder? (4) apply for the no-retain abuse-monitoring exemption, or accept 30-day retention with justification? (5) daily-cap value + Azure budget-alert threshold (proposed 50/day, £20/mo)? (6) appetite for a future offline Batch backlog re-run (ADR-0016 offline mining) — out of scope for v2?
