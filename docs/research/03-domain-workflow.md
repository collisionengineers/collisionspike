# Research Lane 3 — What domain features would *actually* help Collision Engineers

_Recommendation doc. Generated 2026-06-18. Scope: domain / workflow / integration value for **this**
case-intake operation, leveraging the provider-corpus data now in hand. **Not** a generic Power
Platform or Azure feature survey._

Grounded in: `CURRENT_STATUS.md`, `ROADMAP.md`, `docs/architecture/integrations.md`, ADRs
0001/0002/0003/0005/0006/0008/0009/0010/0011, the data analysis
(`raw/principalandrepairersheets/outputs/reports/` — `report.md`, `loc_principal_analysis.md`,
`principal_address_worklist.md`, `headline_metrics.csv`, plus `outputs/claudeschoice/top_inspection_locations.csv`),
and the two forward plans (`docs/plans/phase-1-intake-and-case-tracking/corpus/dataverse-corpus-incorporation.md`,
`docs/plans/phase-1-intake-and-case-tracking/corpus/clarifying-info-ingestion.md`).

---

## 0. The operating reality the data exposes (read this first)

The analysis changed what "helps" means here. Five facts drive every recommendation below:

1. **The EVA principal *code* is the join key, not the name.** 52/58 job-sheet providers resolve to a
   real EVA code with case volume; LEGAL names are "FAO The Court" placeholders (firm is in the
   address). Every matcher, dedup rule, and chaser must key on `principalCode`, never the display name.
2. **The corpus is wider than the job sheet.** 176 principals active <12m, but only ~39 on the job
   sheet → **137 active principals instructing us are invisible to a job-sheet-only system** (PCH
   1,725 cases, HVL 422, TL 263). The corpus is the difference between matching ~22% and ~100% of live
   senders.
3. **57% of located cases carry only a part postcode** (7,474 / 13,217) — a district, not an address.
   EVA field 9 needs a full 6-line address. The corpus already pre-computes the *likely* full address
   for ~35% of those district rows from each principal's own repeat-postcode history.
4. **Where inspections physically happen ≠ the REPAIRER list.** Real volume is at a handful of
   **shared storage/recovery yards** (Shaun Marnell CH46 4TP 867 cases; Somstar B5 6JX; HS Recovery
   M12 5FX; Accident Specialists RH10 9NT) — corroborated by **two independent sources** (the Loc data
   *and* the job-sheet image-source notes). These yards are the spine of the Repairer/ImageSource
   corpus and of chaser targeting.
5. **264/440 principals are dormant >12m** (68 >48m). A clean matcher considers only the live set;
   dormant rows are kept as history (`active=false`) for Case/PO reconciliation, never matched.

The corpus is therefore not "nice metadata." It is the substrate that makes provider-matching,
address-resolution, dedup disambiguation, and chaser-targeting *work* rather than *guess*. The two
plans in `docs/plans/` already specify how it lands in Dataverse idempotently — this doc assesses what to
*build on top of it* and in what order.

---

## 1. EVA Sentry REST API path (replace/augment JSON drag-drop)

**Value: Med · Effort: L · ADR-0005, integrations.md**

**Why it helps here:** drag-drop JSON is the M1 path *and* the permanent fallback (ADR-0005) — it
already works offline and is built (12-field serializer done, B3 resolved). The REST API's real payoff
is **volume + idempotency**: at QDOS's 13,031-case scale, hand-dragging a JSON file per case is the
bottleneck, and `POST /Instruction/Inspection` keyed by **payload hash** gives true
submit-once-exactly idempotency that drag-drop cannot (a re-dropped file double-creates). It also
unlocks the back-channel endpoints the spike will want later (`/Claim/LocationUpdate` for a
resolved inspection address, `/Note/SubmitNote`, `/Report/GetAvailableReports`).

**Photo-order automation (the 2-preview-then-all rule):** this is the highest-value *sub-feature* and
is REST-specific. The rule (overview with legible plate + main-damage closeup first, then **all** photos
including those two again) is mechanical and error-prone by hand. Sentry's likely two-request shape
(confirm on test) maps directly: request 1 = the 2 previews, request 2 = the full ordered sequence.
Automating it removes a recurring manual-ordering mistake and enforces the `image-rules` contract at
submit time, not just at review.

**Dependencies / gotchas:**
- 🔒 **B5 — EVA *test* credentials in Key Vault** (operator). Token lifetime is **5 minutes**
  (`expires_in`), so the flow must mint per-submission, not cache long.
- Base URL is identical for test/prod; **credentials route** to the server (ADR-0005). Production
  cutover is gated behind a **parity test** (API submission == drag-drop result) — keep drag-drop as
  the fallback permanently.
- Build behind `EVA_API_ENABLED` (default `false`); the drag-drop path must remain shippable.
- **Do not** build prod submission first; the test environment is the only sanctioned target now.

**Recommendation:** build the REST submit + photo-order automation against EVA **test** *after* the
drag-drop path is driven end-to-end once (ROADMAP "Later"). The photo-order automation is worth
pulling forward within that work — it is the part that removes daily manual error.

---

## 2. Box archival (folder per Case/PO, UPPERCASE, evidence copy)

**Value: High · Effort: S · integrations.md, ADR-0008**

**Why it helps here:** Box archival is the **terminal step of the spike's whole responsibility**
(ADR-0008: scope ends at the EVA handoff + Box archive; terminal status `box_synced`). It is the
audit-trail backstop the predecessor tool lacked. Low effort because the `finalize-eva-box` flow is
already built and imported `off` — the folder-build + photo-order step exist; this is activation +
one casing confirmation, not new construction.

**Dependencies / gotchas:**
- 🔒 **B5 — confirm Box honours the UPPERCASE Case/PO folder name** (EVA uses lowercase `test26001`
  → Box `TEST26001`). One operator check; everything keys off the Case/PO (`Principal`+YY+NNN).
- Must fire **in unison with EVA submit** as one finalisation step (drag-drop *or* REST) — not a
  separate stage that can half-complete. Copy evidence: images, `.eml`, PDFs, EVA JSON.
- Box connector runs in Power Automate; no Azure work needed.

**Recommendation:** activate alongside the EVA drag-drop path (ROADMAP "Next"). This is the
cheapest high-value item on the board — it makes every submitted case auditable and reversible.

---

## 3. Chaser automation (channel-aware, draft-only — ADR-0003)

**Value: High · Effort: M · ADR-0003, ADR-0011, clarifying-info plan Input 4**

**Why it helps here:** partial/late arrivals are the operation's core friction — cases arrive as
instructions-without-images or images-without-instructions and must be held and chased until complete.
The corpus makes chasing **target the right party** instead of guessing: ADR-0011 says the chaser
targets the **garage/repairer** when images come from there, or the intermediary/provider otherwise,
driven by `WorkProvider.imagesSourceNotes` + the `Repairer`/`ImageSource` N:N coverage. The data
already names the yards to chase (QCL → "HS Recovery … M12 5FX"; FW → "Somstar … B5 6JX"), so a
"chase the garage holding the images" draft can be pre-addressed to the correct yard.

**The draft-only constraint is a feature, not a limitation.** Email chasers are drafted (later sent
via Outlook); **WhatsApp Business has no programmatic send** so WhatsApp chasers are drafted for a
human to paste-and-send, with the contact/group surfaced and the chase logged as a `Note`. Both stay
behind the global outbound kill switch. This matches how CE already works and avoids a compliance
problem (no rogue automated WhatsApp).

**Dependencies / gotchas:**
- **Targeting depends on Phase-1b.3 Input 4** (garage↔provider coverage N:N). Until that loads, a
  chaser can draft but can't always pick the right garage — wire targeting to the N:N once coverage
  lands (ROADMAP 4b explicitly defers this).
- Escalation ladder (chase → re-chase → escalate) must be **time-scheduled but draft-only** — the
  schedule fires a draft for a human, it does not send.
- 🔒 Activation (confirm a chaser *drafts*, never sends) is operator-gated.
- **Do not** auto-send anything in any channel in the spike. **Do not** build Audatex chasers (out of
  scope, await-only).

**Recommendation:** activate draft-only email chasers early (the flow exists); hold WhatsApp drafts +
garage-targeted escalation until Input 4 coverage is loaded. High value because it attacks the
partial-case backlog directly, and the corpus is what makes the targeting correct.

---

## 4. Dedup + provider-matching using the corpus

**Value: High · Effort: M · ADR-0010, ADR-0011, ADR-0002, Input 5**

**Why it helps here:** dedup logic (ADR-0010) is already encoded in `case-resolve`, but its quality is
bounded by *who it can recognise*. Two corpus-driven improvements matter:

- **Provider-matching breadth (the 137 off-jobsheet principals).** Sender-domain + document-content
  matching can only resolve a provider that exists as a `WorkProvider` row. Loading the 137 active
  CONSIDER principals (Input 5) takes recognition from ~39 job-sheet providers to ~176 live ones — the
  single biggest correctness win for intake. PCH alone (1,725 cases) is currently unmatchable.
- **Intermediary de-collision (ADR-0011).** The killer subtlety: a sender domain mapping to >1
  provider (`hackneysolutions.co.uk` → LEX + QCL) is **not** an ambiguous collision — it's an
  **intermediary** (`ImageSource.kind=intermediary`, N:N to providers). Without this model the matcher
  either mis-assigns or dead-ends on every intermediary-routed case. The provider is resolved
  **primarily from document content** (parser `detect_phrases`); the sender domain is *secondary*
  confirmation, authoritative only for direct providers. This is correct and must be preserved.

**Dedup disambiguation** stays human-confirmed and reference-keyed (ADR-0010): exact Message-ID/hash →
drop; matching reference → attach; differing reference → new Case (flag VRM collision); no
reference + VRM match → propose-attach, staff confirm. **Never** auto-merge on VRM+time, **never**
across different Work Providers. The corpus strengthens the "across different Work Providers" guard
because providers are now reliably identified by code.

**Dependencies / gotchas:**
- Needs **Input 5** (CONSIDER decisions → seed) and **Input 2** (intermediary confirmations →
  de-collide `knownEmailDomains`). Both are operator-gated worklists (🔒) but pure Dataverse data.
- **Input 3** (canonical `principalCode`, code-drift `ZEN`/`ZENITH`, slash-codes `R1AM/MOTORX`) must
  run first so codes are canonical before linking.
- **Do not** assert unconfirmed code-drift as fact (`GGP`→`GG` is an audited operator key-change,
  deferred); **do not** fold intermediary/garage domains into `WorkProvider.knownEmailDomains`.

**Recommendation:** prioritise loading Input 5 (corpus-widen) and Input 2 (intermediary
de-collision) — they convert the existing dedup/match code from "works for the job sheet" to "works
for the live book of business" with no new logic, only data.

---

## 5. The offline inspection-address suggestions corpus ⭐ (the headline)

**Value: High · Effort: M · ROADMAP 4a, ADR-0013, plans Input 1, ADR-0001, ADR-0006 (postcode.io)**

**Why it helps here — this is the single highest-leverage thing the data analysis unlocks.** 57% of
located cases (7,474) carry only a part-postcode; EVA field 9 needs a full address; the manual fallback
is the "Image Based Assessment" marker. The analysis already did the hard part: for each
`(principal, district)` it **derived the likely full address** from that principal's own repeat-postcode
history (`principal_address_worklist.md`). The win is therefore not "geocode a district at runtime" —
it is **mine those full addresses offline into provider-scoped suggestions the staff pick from**, so
the human does a one-click pick rather than per-case research. There is **no runtime resolver**: the
EVA-export `Loc` is an export artifact, not an intake input, and is never resolved on the fly
(ADR-0013).

**Concretely (the offline derivation → manual pick):**
1. Offline, Collision Engineers' Box/EVA case history is mined per provider into a master sheet mapping
   `(provider, Loc) → full address`.
2. Only rows with a **real full address** are loaded (`dataverse/.build/16-seed-suggested-addresses.ps1`)
   into `cr1bd_inspectionaddress` as suggestions (`decisionMode=Unknown`, `sourceLabel='suggested:…'`).
   e.g. for QCL in the `M12` district the corpus holds **M12 5FX (HS Recovery)**, seen 97×.
3. In the Code App Address tab staff **pick/edit** a suggestion; the chosen **6-line address** is
   serialised into `Case.cr1bd_evainspectionaddress` (EVA field 9), postcode.io-normalised.
4. No silent "Image Based Assessment" — the address-policy gate already enforces a per-provider policy
   and an override-with-reason (ROADMAP 4a, built).

**The volume multiplier:** the ~35% of worklist rows with a derived full address load as suggestions
**ordered by case volume**, so picking the *top* suggestion resolves the *largest* block of
district-only cases first (`M12 5FX` for QCL covers 814 cases; `B5 6JX` for FW covers 355; `CH46 4TP`
covers 991 across the district). This is the fastest route from "57% incomplete" to "mostly resolved"
that exists, and it costs the staff clicks, not research.

**Dependencies / gotchas:**
- Honours `AZURE_MAPS_ENABLED=false` → **postcode.io** for normalisation (free, UK-only). Azure Maps
  stays gated/later (ADR-0006 pattern; ~$5/1,000 geocodes only if non-UK/autocomplete needed).
- A shared **full postcode** is one site (register once in `Repairer`, fan out N:N); a shared
  **district** is a catchment, **not** one building — **only full addresses are loaded as
  suggestions**; a bare district/part-postcode is **never** loaded or suggested (it stays a
  future-investigation backlog — ADR-0013), never collapsed to a guess.
- 🔒 Address truth is operator-owned (Input 1 worklist confirmation) — Claude mines the corpus and
  loads the suggestions offline; the operator confirms the addresses.
- **No own-history full address → require a supplied full address; never invent one** ("no mock data").
- The corpus-incorporation plan already seeds repeated full postcodes (`count>=3`) as
  `InspectionAddress` reference rows — the suggestions ride on that surface.

**Recommendation:** **derive this corpus next after the corpus loads.** It is the feature with the
largest case-coverage impact per unit of effort, and the data analysis is what makes it a
pick-not-research task — a static offline snapshot of suggestions, **not** a runtime service
(ADR-0013). See [`../architecture/inspection-address-corpus.md`](../architecture/inspection-address-corpus.md).

---

## 6. Enrichment (DVSA mileage, DVLA, valuation, Experian-via-EVA)

**Value: Med · Effort: S (activation) / M (valuation later) · ADR-0006, integrations.md**

**Why it helps here:** the enrichment Function is **already deployed gated-OFF**, calling **DVSA +
DVLA directly** (gateway retired, B1 obviated). The domain rule is the valuable part and is correct:
**DVSA `current_mileage_estimate` fills the EVA mileage field ONLY when the instruction/parser has no
mileage — the document is authoritative** (ADR-0006). This prevents enrichment from overwriting a
solicitor-supplied figure with an estimate. `get_vehicle_summary` suggests make/model (staff-reviewed,
never silently applied).

- **Experian adverse-history is EVA-built-in** — not something the spike calls; it arrives via EVA.
  Nothing to build.
- **Valuation / Companion Report (`valuationbot`)** is M2/M3, **staff-triggered** on total-loss/disputed
  cases only, PDF attached as Evidence, gated `VALUATION_ENABLED`. Correctly deferred.

**Dependencies / gotchas:**
- 🔒 Inject DVSA/DVLA creds → Key Vault; set `DVSA_TENANT_ID`; register/consent the Entra app; flip
  `ENRICHMENT_ENABLED=true` in a **test** env (operator).
- Enrichment keys on **VRM** — depends on the parser/OCR extracting a clean registration first.
- **Do not** let enrichment overwrite document-supplied mileage (ADR-0006 is explicit). **Do not**
  pull valuation into M1.

**Recommendation:** activate DVSA mileage + vehicle-summary in a test env (low effort, it's built);
hold valuation for M2. Value is Med not High because mileage is a single field and only fills when
absent — useful, but not a workflow-mover like the inspection-address suggestions corpus.

---

## 7. Data-quality / dormancy automation (keep the matcher clean)

**Value: Med · Effort: S · report follow-up #5, corpus plan §4.3/§8**

**Why it helps here:** 264/440 principals are dormant >12m. If the matcher considers them, it
mis-attributes and the operator wades through dead providers. The recency bands give a clean rule:
**active <12m = matched; dormant = `active=false` (kept as history, never matched)**. The job-sheet
providers stay active (known book of business) even if quiet; off-jobsheet dormant rows are archived.
This keeps the live matching set lean while preserving every historic principal code for Case/PO
reconciliation (codes are the Box/EVA prefix — they must never be lost).

**Corpus-refresh cadence:** the analysis is reproducible (`outputs/_scripts/run_all.py`). A periodic
re-run (quarterly, or on a visible drift signal) re-bands recency and surfaces newly-active principals
(new CONSIDER rows) and newly-dormant ones to archive. The incorporation scripts are **idempotent
upserts**, so a refresh is safe to re-run and changes only what moved.

**Dependencies / gotchas:**
- Archiving is `active=false`, **never** hard-delete (governance; Case/PO history depends on old
  codes). Every active-row change writes an `AuditEvent` (`corpus_record_changed`).
- The refresh reads EVA exports — those exports are an operator artefact; the re-run + load is
  `[DEPLOY-WITH-LOGIN]` pure-Dataverse, no inbox/EVA *runtime* contact.
- **Do not** activate dormant providers on import; **do not** delete them.

**Recommendation:** bake the active/dormant disposition into the Input-5 load (it's already specified
in the plan), and schedule a lightweight quarterly corpus refresh. Low effort, keeps every downstream
matcher honest.

---

## 8. Image rules / photo-order automation + reflection exclusion

**Value: High (readiness gate) / Med (automation) · Effort: S (gate, done) / L (vision, M2) · ADR-0009**

**Why it helps here:** the **image-rules readiness gate is already built** in the Code App (≥2 EVA
images incl. one `overview` with registration visible + one `damage_closeup`; status machine
`new_email → … → ready_for_eva`). That gate is the high-value, low-effort piece — it stops
under-evidenced cases reaching EVA. **Driving it green on a live case** is the remaining step
(operator).

**Photo-order automation** (2 previews then all, overview shows full registration) pairs with the EVA
REST path (§1) — best built there as the two-request submission.

**OCR-for-registration (M1)** is the cheapest useful image signal (ADR-0009): read the plate
(Tesseract via the parser, or Azure Document Intelligence Read) to (a) satisfy the registration-visible
check and (b) **match images to the open Case by VRM** — including the WhatsApp bulk-media import
(ADR-0007, manual export → folder drop → OCR → auto-match by VRM). Role-tagging (overview vs damage)
**stays manual in M1**.

**Reflection-of-a-person exclusion** and **overview/damage classification** are **M2** — explicitly an
**Azure OpenAI / Foundry vision** model for person/reflection and **AI Builder** for classification.
**Custom Vision / Image Analysis 4.0 are on the 2028 retirement path — do not use them** (ADR-0009).

**Dependencies / gotchas:**
- 🔒 Driving the readiness gate green on a live Case is operator-gated (needs real images).
- OCR for **scanned** PDFs ("B-full") needs Azure Container Apps (FC1 can't run Tesseract) — deferred.
- **Do not** build on Custom Vision / Image Analysis 4.0 (retiring). **Do not** auto-tag image roles
  in M1.

**Recommendation:** the readiness gate is done and high-value — drive it green on a live case.
Build registration-OCR in M1 (it serves both the readiness check and VRM matching). Defer
reflection/classification vision to M2 on Foundry/AI Builder only.

---

## Explicit "Do NOT do / not yet" list

**Never (out of scope or against a decision):**
- ❌ Call `collisioncc` (the Google Cloud reference build) at runtime — re-implement its contracts only.
- ❌ Auto-send **any** outbound (email or WhatsApp) in the spike — draft-only, behind the kill switch
  (ADR-0003). No automated WhatsApp send exists (Business app, no API).
- ❌ Fold intermediary or garage email domains into `WorkProvider.knownEmailDomains` (breaks EVA
  identity *and* sender-matching — ADR-0011).
- ❌ Auto-merge cases on VRM + time, or across different Work Providers (ADR-0010).
- ❌ Let DVSA enrichment overwrite document-supplied mileage (document is authoritative — ADR-0006).
- ❌ Build image AI on **Custom Vision / Image Analysis 4.0** (retiring 2028 — ADR-0009).
- ❌ Build the **Audatex** chaser path (deferred entirely).
- ❌ Track engineer assessment / report generation / return-to-client — scope ends at the EVA handoff
  (ADR-0008).
- ❌ Add **mock/seed case data** to make the app "look populated" — real Dataverse rows only.

**Not yet (right idea, wrong time / blocked):**
- ⏳ **EVA REST submission** — build against test after drag-drop runs end-to-end; prod cutover needs a
  parity test (ADR-0005). 🔒 B5 creds.
- ⏳ **Valuation (`valuationbot`)** — M2/M3, staff-triggered, gated `VALUATION_ENABLED`.
- ⏳ **Reflection/person detection + overview/damage classification** — M2 (Foundry vision + AI Builder).
- ⏳ **Azure Maps geocoding** — gated `AZURE_MAPS_ENABLED=false`; postcode.io until non-UK/autocomplete
  is genuinely needed.
- ⏳ **OCR for scanned PDFs ("B-full")** — Azure Container Apps; FC1 can't run Tesseract.
- ⏳ **Resolving partial postcodes from data alone** — never auto-collapse a district to an address;
  require operator confirmation of a full postcode (Input 1).
- ⏳ **Asserting code-drift merges** (`GGP`→`GG`) — audited operator key-change, deferred to
  clarifying-info; load `ZENITH` as its own row, don't assert `ZEN`≡`ZENITH`.

---

## Top-5 ranked shortlist (highest leverage first)

| # | Item | Value | Effort | Why it ranks here |
|---|---|---|---|---|
| **1** | **Offline inspection-address suggestions corpus** (§5) | High | M | Converts 57% district-only cases → EVA field-9 full addresses staff pick in one click; the data already pre-filled the answers offline (no runtime resolver — ADR-0013), so it's pick-not-research. Largest case-coverage win per unit effort. |
| **2** | **Corpus-widen + intermediary de-collision** (§4 / Inputs 5,2) | High | M | Takes provider-matching from ~39 to ~176 live providers and fixes the intermediary-domain collision — pure data, no new logic, unblocks intake correctness for PCH/HVL/etc. |
| **3** | **Box archival activation** (§2) | High | S | Terminal audit backstop; already built and `off`; one casing check. Cheapest High-value item. |
| **4** | **Draft-only chasers, corpus-targeted** (§3) | High | M | Attacks the partial-case backlog directly; corpus + Input-4 coverage make it chase the *right* yard; draft-only matches CE's compliance reality. |
| **5** | **Image-rules readiness gate green + registration-OCR** (§8) | High/Med | S/M | Gate (built) stops under-evidenced EVA submits; OCR serves both the readiness check and VRM image-matching cheaply in M1. |

_(EVA REST + photo-order automation (§1), enrichment activation (§6), and dormancy automation (§7) are
the next tier — valuable, but either deferred-by-design or lower workflow impact than the five above.)_

---

## The single highest-leverage thing the data analysis unlocks

**The offline-derived inspection-address suggestions corpus — full addresses mined from case history,
surfaced for a one-click manual pick.**

The analysis didn't just *count* the 57% part-postcode problem — it **pre-solved ~35% of it** by
deriving each `(principal, district)`'s likely full address from that principal's own repeat-postcode
history, and it identified the shared yards (with full postcodes and names) corroborated by two
independent sources. Those confirmed full addresses are loaded **once, offline** into
`cr1bd_inspectionaddress` as provider-scoped **suggestions** (full addresses only; partials stay a
backlog, never loaded). That turns the staff job from "research 638 districts" into "pick a
volume-ranked suggestion with one click" in the Code App Address tab — picking the *top* rows resolves
the *largest* blocks of cases first (e.g. 814 QCL cases at M12 5FX). There is **no runtime resolver**
(ADR-0013); the leverage is in the offline mining and the static snapshot, not a live service. No
other feature has that ratio of cases-resolved to effort, and none of it is possible without the
corpus the analysis produced. The same corpus simultaneously fixes provider-matching breadth, dedup's
cross-provider guard, and chaser targeting — so deriving these suggestions on top of the loaded corpus
is the move that cashes in the data analysis across the whole workflow at once.
