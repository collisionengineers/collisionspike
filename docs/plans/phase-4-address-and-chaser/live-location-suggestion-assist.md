# Phase 4a — Live inspection-location suggestion assist (helper #3)

> **Status: BUILT OFFLINE, GATED-OFF 2026-06-24 (Function + connector + Code App built; tests green; activation pending the operator).** Human-in-the-loop, **ADR-0013-compliant**
> per its 2026-06-24 scope clarification: *live, human-confirmed candidate suggestions are permitted; only
> runtime AUTO-resolution is forbidden*. **Supersedes** the earlier "helper #3 = offline mining only" framing
> in [ADR-0016](../../adr/0016-inspection-address-corpus-eva-export.md) and
> [inspection-address-revamp.md](./inspection-address-revamp.md) — those must be reconciled to this (step 7).

## What this is

When a case is being reviewed and **neither the suggestion corpus nor the case documents identify the
inspection location**, the reviewer invokes an assist that **proposes candidate location(s)**. The reviewer
**confirms one** (→ becomes the inspection address, manual decision) **or** records **"Image Based Assessment"
with a reason**. **Nothing auto-applies** — this is an extension of the suggestion model, not a resolver.

**Explicitly NOT:** a batch job over a historical photo archive; an automatic intake-flow step; anything to
do with partial postcodes (those were only the `Loc` column of an EVA *export* spreadsheet — never a live
input; the app does not receive or handle them).

## Inputs (per case, at review time)

1. **Vision over the case's OWN inspection photos** — Azure AI Vision Image Analysis (tags/objects + Read
   OCR) to extract visible **signage / business names**, **landmarks**, **plate** region, and **EXIF GPS**
   when present (best-effort — EXIF is frequently stripped on upload).
2. **Geolocation of text clues** — geocode clues from the case via Azure Maps Search/Geocode:
   - **Accident location** — currently only inside the free-text `cr1bd_evaaccidentcircumstances` (EVA
     field 8); needs a best-effort parser extraction (sibling `cedocumentmapper_v2.0`) to pull a
     place/postcode.
   - **Claimant address** — **decided 2026-06-24: include it.** Not currently stored (the model holds
     claimant *name/phone/email* only), so this adds a new **`cr1bd_evaclaimantaddress`** field + intake
     capture, used as a geolocation text clue.

## Processing

- Run Vision (+ optional DI Read) on the case photos → candidate site names / textual clues.
- Geocode extracted + text clues via Azure Maps → candidate addresses / nearby known corpus sites.
- *(Optional, opt-in)* GPT-4o reasoning pass for hard cases — token-billed, **no free tier**; a cost lever,
  not the v1 default.
- Rank candidates (confidence + proximity + overlap with the existing corpus); return the top N.

## Output / human-in-the-loop (the ADR-0013 boundary)

- Code App **Address tab** gains a **"Suggest location"** action (reviewer-invoked).
- Returns candidates with **provenance** ("from photo signage 'Smith Recovery'", "near accident location",
  "EXIF 51.50,-0.12") and a confidence indicator.
- Reviewer **picks** one (→ manual decision mode, recorded) **or** falls back to **Image Based Assessment +
  reason**. **No auto-apply; candidate rows stay `decisionMode=Unknown` until a reviewer confirms.**

## Architecture

- **Standalone services — no Foundry model required** for the base path (Vision + Maps); GPT-4o optional.
- A **`location-suggest` Azure Function** (azure-integration-engineer), called by the Code App **on reviewer
  request** — **not** wired into the automatic intake flow (keeps it human-triggered *and* human-confirmed).
- **Gated:** `cr1bd_AZURE_MAPS_ENABLED` + the new **`cr1bd_LOCATION_ASSIST_ENABLED`**. Default off.
- **Secrets** (Maps key, Vision key) in Key Vault; the Function reads them. Free-tier-first — invoked only on
  can't-ID cases (a minority), so volume is low.

## Cost (live Azure Retail prices, GBP, UK South — gathered 2026-06-24)

| Component | Unit price | Free tier |
|---|---|---|
| Azure Maps Search/Geocode | £3.7259 / 1K | Gen2 free monthly grant |
| AI Vision Image Analysis | £0.7452–1.1178 / 1K | F0 ≤ ~5,000/mo (20/min, 1 resource/sub) |
| Document Intelligence Read | £1.1178 / 1K pages | F0 ≤ ~500/mo |
| GPT-4o *(optional reasoning)* | in £0.0019/1K · out £0.0075/1K (~£0.0047/image) | **none** |

Because it fires only when corpus + docs fail (a fraction of cases), expected spend is **~£0 within the free
tiers**; GPT-4o is the only path that always bills.

## Decisions (settled 2026-06-24)

1. **Photo byte source = Box.** All evidence is stored to **Box** long-term, so the Function fetches photo
   bytes from the Box archive. ⚠️ **Dependency:** this couples the *live* assist to the **Phase-7 Box
   integration** being active (`BOX_API_ENABLED=true`); Box is currently dormant, so helper #3 cannot go
   live before Box does (it can be built + tested against a stand-in image source meanwhile).
2. **Accident-location extraction = in scope** — best-effort parse of a place/postcode from
   `cr1bd_evaaccidentcircumstances` (sibling `cedocumentmapper_v2.0`; it already extracts the
   `accident_circumstances` free text — this adds a place/postcode pull from it).
3. **Claimant address = include** — add `cr1bd_evaclaimantaddress` + intake capture; use it as a text clue.
4. **Gate = new `cr1bd_LOCATION_ASSIST_ENABLED`** (not overloading `AZURE_VISION_ENABLED`).
5. **GPT-4o reasoning = deferred to a later phase** — researched + planned separately in
   [gpt4o-reasoning-escalation.md](./gpt4o-reasoning-escalation.md).

## Build steps (ordered)

1. **Schema** — add `cr1bd_evaclaimantaddress` (+ intake capture) and the `cr1bd_LOCATION_ASSIST_ENABLED`
   gate. *(dataverse-data-architect)*
2. **Provision** Azure Maps (Gen2) + Azure AI Vision (F0→S0); secrets → Key Vault. *(azure-integration-engineer)*
3. **Box read path** — the Function fetches case photos from the Box archive (depends on Phase-7 Box being
   active; stub/stand-in until then). *(azure-integration-engineer + box-integration-architect)*
4. **Build the `location-suggest` Function** — vision over the Box photos + Maps geocode of clues (accident
   location parsed from circumstances; claimant address) → ranked candidates with provenance/confidence.
   *(azure-integration-engineer)*
5. **Code App** — "Suggest location" action in the Address tab → calls the Function → renders candidates →
   reviewer confirm (manual) or Image-Based+reason. Reuse the existing suggestion/ordering UI.
   *(code-app-architect)*
6. **Provenance + audit** — record the suggestion source + the reviewer's confirmation (field-level
   provenance); assert nothing auto-applies. *(dataverse-data-architect)*
7. **Verify** — candidates stay Unknown until confirmed; no Case EVA address set without a reviewer decision.
8. **Docs reconciliation** — re-aim ADR-0016 helper #3 + `inspection-address-revamp.md` to this live-assist
   design (they currently say "offline mining only" — now superseded); mark this plan BUILT.

## ADR position

- **ADR-0013** — clarified 2026-06-24 (live human-confirmed suggestions permitted; auto-apply forbidden). Done.
- **ADR-0016 helper #3** — to be re-aimed from "offline mining only" to this live assist (step 7).
- Consider a short dedicated ADR if the team wants the live assist recorded as its own decision.
