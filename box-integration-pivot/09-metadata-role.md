# 09 — What Box Metadata is actually doing for us (and is it worth the Business-Plus floor?)

> **The one question:** Box Metadata is the **single dependency** that lifts the plan floor from base
> **Business (~$15/user/mo)** to **Business Plus (~$25–33)**. Metadata is *only* available on **Business
> Plus, Enterprise, Enterprise Plus, Enterprise Advanced** (Box, verbatim) — base Business **does not
> have it**. So the question is narrow and answerable: is what metadata buys us worth ~$10/user/mo (~$360+/yr
> at the 3-seat floor)? This section enumerates every concrete job metadata does, what we'd lose without
> it, where it duplicates Dataverse, and gives an honest verdict.
>
> **Headline verdict:** of metadata's four jobs, **exactly one is load-bearing today** (structured,
> queryable **registration capture on the File-Request form**), and even that has a **base-Business
> fallback** (free-text description + Dataverse-side matching) that loses fidelity but not the outcome.
> The Box-native search/governance/AI jobs are all **deferred Phase-C** and **not yet built**.
> **Recommendation: (iii) defer metadata — start on base Business, add Business Plus when the reg field
> or Metadata-Query actually lands.** See §4 for the reasoning and the one caveat that would flip it.

---

## ⚠️ Verification update (2026-06-21) — the free-text fallback is VOID; the *defer* conclusion still stands

A targeted verification against primary Box sources (the `FILE.UPLOADED` webhook v2 payload, the File +
Comments APIs, and the whole File-Request API surface) found that the File-Request **free-text
*description* is NOT machine-readable at any tier** — it never rides the webhook, is **not** written to the
file's `description` or as a comment, and there is **no File-Request submissions API**. So the
"free-text description + Dataverse parse" fallback referenced in §1(a), §2.1 and §4 below is **not viable**
— and note **Business Plus would not fix this** (it buys the structured metadata *field*, not
description-readability).

**The recommendation is UNCHANGED — defer metadata, start on base Business — but for a cleaner reason:**
(i) most uploads are **case-bound** (the per-case File-Request link is tied to the Case/PO folder and the
Case already carries the parsed VRM → **no reg capture needed**); (ii) the orphaned **image-only / no-case**
path captures the reg via **filename-VRM** (rides on the webhook `source.name`, fully readable),
**uploader-emails-the-reg** (reuses the existing inbox parser), or **human triage**. Metadata (Business
Plus) is therefore a later **optional reliability upgrade** — a typed, validated, API-readable reg field for
the orphaned path — **not a blocker**. Treat the "free-text description" mentions in §1(a)/§2.1/§4 as
superseded by this note.

---

## 1. What metadata is actually doing for us, end to end

Four concrete uses appear across the dossier. Labelled **load-bearing / nice-to-have / speculative**,
each with its source.

### (a) File-Request reg-capture — registration as structured data on anonymous/image-only uploads · **LOAD-BEARING (today's only one), but with a base-Business fallback**

The File-Request form can carry **one enterprise metadata template**; the pivot bakes a
`vehicle_registration` field into the one hand-built template, so every anonymous, account-free upload
arrives **carrying the VRM as structured data** rather than only loose image bytes. The webhook Function
reads that captured VRM and **reg-merges** (ADR-0010) the upload to the right open case's folder; an
unmatched reg goes to **Held** rather than being guessed (`06 §A`, `06-enhancements §"Reg as the
universal join key"`, BUILD-PLAN Wave 2/3). This is the mechanism that turns an image-only drop-box from
"a pile of photos nobody can route" into "photos that self-identify to a case."

- **Why it needs metadata:** Box's File Request can capture **sender email + a free-text description +
  any *enterprise metadata-template* field**. The structured field is the only *typed, queryable* capture
  surface; and "**Metadata must already be turned on for your enterprise for you to request it**" (Box,
  *Using File Request*). So a *structured* reg field on the form forces Business Plus.
- **Tier facts (verified):** the **File-Request form itself needs only Business** (Box, *Using/Administering
  File Request*); the **reg *metadata field* needs Business Plus** (`02-plans-and-cost §"Why the floor is
  Business Plus"`, `01 §1`, `01 §4`). These two are distinct and the dossier is careful to keep them so.
- **The honest caveat (this is why it's not unconditionally load-bearing):** the *outcome* — "route an
  image-only upload to a case by its reg" — does **not strictly require** a Box metadata field. The File
  Request also offers a **free-text description**; an operator/uploader can type the VRM there, and the
  webhook Function can parse/normalise it and reg-merge in **Dataverse** exactly as it would from a typed
  field. So this job is load-bearing *for fidelity and UX*, **degradable** for *function* (see §2).

> **Verdict on (a):** the **highest-value** metadata use and the **only one that touches the live
> build path** — but it is a *quality* dependency, not an *existence* one. Worth Business Plus **if** the
> reg field is going in soon; deferrable if it isn't.

### (b) Per-Case/PO-folder mirror + Metadata-Query — a Box-native search index ("find the folder for VRM X", "all RJS cases 2025") · **NICE-TO-HAVE (and deferred Phase-C, not yet built)**

The proposal stores key case attributes (Principal, **VRM**, status, dates, inspection modality, dedup
hash) as a **metadata instance cascaded onto each Case/PO folder**, then queries Box directly with
`POST /2.0/metadata_queries/execute_read` — answering *"find the case folder for VRM X," "all RJS cases
`ready_for_eva` in 2025"* **from Box itself**, without round-tripping to Dataverse (`06 §A`).

Verified mechanics of the Metadata Query API (primary sources — Box developer OpenAPI + *Understanding
the Metadata Query API and Search API*):

- **Endpoint:** `POST /2.0/metadata_queries/execute_read`; **SQL-like** syntax with boolean
  (`AND`/`OR`/`NOT`), comparison and range operators (Box OpenAPI `post_metadata_queries_execute_read`;
  doc 553).
- **Single template, NO JOINS:** the request's `from` field "**Specifies *the* template used in the
  query**" (singular) — one template per query; you **cannot join** two templates, and you cannot mix
  fuzzy text search with the metadata boolean (doc 553's third scenario: *"This is not supported"*).
  (Box OpenAPI `MetadataQuery.from`; doc 553.)
- **Scope:** **Collaborator-access only** — *"does not support the `enterprise_content` scope. A metadata
  query returns results only for content to which you have Collaborator access"* (doc 553). And
  `ancestor_folder_id` is required to scope the subtree (Box reference for the endpoint).
- **Pagination / page size:** **max `limit` = 100** results per request (default 100), `marker`-paginated
  (Box reference; matches the dossier's "≤100 results/page" in `06 §A`).
- **The one genuine *advantage* over the Search API:** results are **instant** — they "**immediately
  reflect creates, updates, and deletes to metadata values**" with **no indexing delay**, whereas the
  Search API indexes within ~10 min (often longer) and supports only simple fuzzy `field=value` filters
  (doc 553). This is the real reason to prefer Metadata-Query over plain search *if* you query Box at all.
- **Cost/tier:** standard API (no AI Units) — but the underlying metadata feature still needs **Business
  Plus** (`06 §A`). Template limits: **500 templates/enterprise, 250 fields/template, 100 templates/item,
  512 KB/item** (doc 047).

**Why only nice-to-have:** every one of those queries is **already answerable from Dataverse**, which is
the **system of record** and *is* relational (it can join, filter on the 11-value status machine, dedup
keys, Case/PO sequencing — none of which Metadata-Query can do). Box-native search is a **convenience
for the human browsing Box directly**, not a capability the pipeline needs. The BUILD-PLAN puts the whole
of it in **Phase C** behind `BOX_METADATA_ENABLED`, **inert until then** (BUILD-PLAN Wave 5; `plans/05 §1`
"`cr1bd_BOX_METADATA_ENABLED` … Inert until Phase C"). **It is not in the base pivot and not yet built.**

### (c) Metadata-driven retention later (Box Governance) · **SPECULATIVE (and a *separate, higher* add-on, not what Business Plus buys)**

A retention policy can be **keyed on a metadata template** (folder/classification/**metadata**-triggered;
Box, *Adding Metadata to a Retention Policy*), so each Case/PO folder auto-retains for its statutory
period then disposes, and a legal hold can pin a disputed case (`06 §D`). For evidentiary
insurance/engineering records this is the dossier's "**most defensible 'buy a higher tier'
justification**."

**But:** **Box Governance is a separate paid add-on (Enterprise; *bundled* only at Enterprise Plus)** —
**not** included in Business Plus (`02-plans-and-cost §"Consumption add-ons"`, `06 §D`). So metadata
*enables* metadata-triggered retention, but you cannot *use* that path on the Business-Plus floor anyway:
it needs an **Enterprise-tier jump on top**. As a justification for *Business Plus specifically* it is
**moot** — you'd be paying for metadata now for a capability you can't switch on until two tiers up.

### (d) Box AI Extract auto-fill later · **SPECULATIVE (and *also* gated above Business Plus)**

Box AI can **autofill a metadata template** from a PDF/image via `extract_structured` (auto-OCR), mapped
to a template mirroring the EVA 12-field contract — a fallback/cross-check for the deterministic
`cedocumentmapper` parser (`06 §B`, `01 §8`). It *consumes* metadata templates, so metadata is a
prerequisite.

**But the gating is brutal for this as a Business-Plus justification:**
- The **in-web-app Autofill** feature (the one in *Using Metadata*) is **Enterprise Advanced (E-Advanced)
  only** (doc 357, *"Box account holders in E-Advanced accounts"*).
- The **API path** (`extract_structured`) runs on Business/Business Plus **but** is metered in **purchased
  "AI Units" — Business/Business Plus include *zero*** (~$10/1,000, annual commitment) (`01 §8`,
  `02-plans-and-cost`). And it's **1 file per call** — loop per doc.

So Box AI Extract is real, but it's a **separate, metered, mostly higher-tier** decision (BUILD-PLAN Wave
5 Phase C; `06 §B`). It does **not** make metadata-on-Business-Plus pay for itself.

### Roll-up

| # | Metadata use | Label | In the base pivot? | Tier reality |
|---|---|---|---|---|
| (a) | File-Request reg-capture (structured VRM) | **Load-bearing** (but degradable) | **Yes, Wave 2/3** | **Business Plus** (the actual floor driver) |
| (b) | Folder mirror + Metadata-Query search | **Nice-to-have** | No — Phase C, gated, **not built** | Business Plus (feature), standard API |
| (c) | Metadata-triggered retention (Governance) | **Speculative** | No — Phase C | **Enterprise+** add-on (above the floor) |
| (d) | Box AI Extract autofill | **Speculative** | No — Phase C | **E-Advanced** (web) / metered AI Units (API) |

**Only (a) is in the live build path, and only (a) actually exercises the Business-Plus entitlement.**
(b)–(d) are deferred and/or need tiers *above* Business Plus anyway.

---

## 2. What we'd lose without Box Metadata (dropping to base Business)

If we drop to **base Business (~$15)** — File Requests and webhooks/Platform-API are still included
(every Business tier; `01 §3`, `02-plans-and-cost`) — the **only** thing we lose is the **metadata
feature** (doc 357 FAQ). Concretely:

1. **No structured/queryable reg field on the File-Request form.** The form can still capture **sender
   email + a free-text description** (Box, *Content Fields to add* in *Using File Request*) — but **not**
   a typed `vehicle_registration` field. The reg would be **shoved into free text**.
   - *What breaks:* the upload no longer self-describes in a typed field. The webhook Function must
     **parse the VRM out of the free-text description** (regex/normalise against the DVLA reg format),
     which is noisier — uploaders mistype, omit, or annotate ("reg AB12 CDE, front wing"). A typed
     required field would have *forced* a value; free text can't be type-validated.
   - *What still works:* the **reg-merge itself happens in Dataverse regardless** — Dataverse is the
     system of record and already does ADR-0010 reg-merge. So a parsed-from-free-text VRM routes to a
     case **just as well as a typed one, once parsed**. The degradation is **capture fidelity**, not the
     matching capability.
2. **No Box-native search over Case/PO folders.** No metadata template → **no Metadata-Query** (use (b)
   is gone). "Find the folder for VRM X" must be answered **from Dataverse** (which holds `cr1bd_vrm`,
   `cr1bd_casepo`, `cr1bd_boxfolderid`) and then deep-link into Box via the stored folder id — i.e.
   **Dataverse is the index, Box is the drawer**. The plain Box **Search API still works** on base
   Business (file/folder names + document text, fuzzy, ~10-min index), so a human typing a reg into Box's
   search box would still surface the Case/PO folder *by its name* (the Case/PO string) and any text in
   the docs — just not by a structured boolean metadata query and not instantly. This is a **convenience
   loss for direct-in-Box browsing**, fully covered by the app's Dataverse-driven "Open in Box" deep link.
3. **No metadata-keyed retention or AI-autofill *foundation* later.** You'd need to add metadata (i.e.
   move to Business Plus) **before** Phase-C Governance/AI could key on a template. But since those also
   need **Enterprise+/E-Advanced/AI-Units** on top (§1c, §1d), the metadata feature is **necessary but
   nowhere near sufficient** for them — deferring it costs nothing until those tier decisions are actually
   taken.

**The crisp version:** dropping to base Business costs us **(i) a typed reg field → reg goes into free
text and must be parsed**, and **(ii) Box-native structured/instant search → search moves to Dataverse +
deep-link**. It costs us **nothing functional** that Dataverse can't carry, because **Dataverse is
already the system of record and already does the reg-merge**. The dossier itself concedes the fallback:
*"If structured capture were dropped, **Business (~$15) would suffice** for File Request + webhooks. That
is a real fallback if budget is tight — but it forfeits the metadata-driven matching/search that makes
the 'central reference' idea powerful"* (`02-plans-and-cost`).

---

## 3. Where metadata DUPLICATES Dataverse (and why Dataverse stays authoritative)

The Box metadata mirror (use (b)) stores **the same attributes Dataverse already holds** — Principal,
VRM, status, dates, inspection modality, dedup hash. This is **deliberate duplication**, and the dossier
is explicit that it must stay a **one-way, read-only-for-logic mirror**:

- **The one-way rule (settled, not negotiable):** *"Dataverse stays the **system of record**; Box is a
  content + intake + archival **mirror**, written **one-way** (Dataverse→Box). **Box Metadata has no
  joins → dedup / status / Case-PO sequencing never run off Box**"* (BUILD-PLAN "Settled facts #1";
  `plans/05` Overview; `06 §A` "Keep Dataverse authoritative … Box metadata is a convenience mirror, not
  the case DB").
- **Why Dataverse must stay authoritative — the capability gap is structural, not a preference:**
  - **No joins (verified):** Metadata-Query is **single-template** (`from` = *the* template; §1b). The
    domain logic is inherently **relational** — Case ↔ WorkProvider/Repairer, Case ↔ Evidence, the 11/12-
    value status machine, Case/PO sequencing, **field-level provenance**. None of that can be expressed
    in a join-less attribute store. Dataverse can; Box metadata structurally cannot.
  - **No transactional guarantees / instant relational consistency for *writes*:** dedup must be exact and
    atomic; Box metadata is a per-item key-value bag with **eventually-consistent cascade** (cascade
    "applies metadata via an **offline process**… may take some time"; doc 345). You cannot run a dedup
    ladder on that.
  - **Collaborator-scope, not enterprise-scope** (§1b) — a query only sees content you collaborate on;
    Dataverse has no such visibility quirk for the pipeline's own reads.
- **The risk of the second store — named honestly:** a Box metadata mirror is **a second, join-less,
  drift-prone attribute store**. If anything ever wrote case logic *off* the Box copy, the two stores
  could diverge (Box cascade is offline/delayed; a missed cascade or a hand-edit in the Box UI by an
  external collaborator — *"external collaborators are able to see and edit metadata instances"*, doc 345 —
  would silently desync). The dossier's mitigations: **write Box metadata one-way from Dataverse only**,
  **never read it back for logic**, and treat it strictly as **the operator's read/search convenience**
  ("Box as the operator's read view, Dataverse as the machine's write model", `06-enhancements`). Drift is
  listed as a **Med risk** ("Dual-store drift") in the BUILD-PLAN risk roll-up — accepted *because* the
  mirror is logic-inert.

**Net:** use (b) is **100% duplication of data Dataverse already owns**, justified only as a Box-side
search convenience, and explicitly fenced so it can never become a competing source of truth. That makes
it **easy to defer** (you lose a convenience, not a capability) and **never** a reason to let Box drive
logic.

---

## 4. Honest verdict — is metadata pulling its weight as the Business-Plus cost driver?

**Marginal today; potentially worth it soon — so defer, don't commit.**

The arithmetic: metadata is the **sole** reason for Business Plus over base Business — **~$10/user/mo**,
**~$360+/yr at the 3-seat floor** (`02-plans-and-cost`: Business ~$15 → Business Plus ~$25–33; 3-seat
minimum). Against that single line item, what does metadata deliver **in the base pivot (Waves 0–4)**?
**One** thing: a *typed* reg field on the File-Request form (use (a)) — and even that has a
**free-text-+-Dataverse fallback** that preserves the routing outcome and loses only capture fidelity
(§2). Uses (b), (c), (d) are all **Phase-C, gated-off, and not built**, and (c)/(d) need tiers *above*
Business Plus to actually run (§1). So on the **current** build, Business Plus is buying **~$360/yr for a
nicer reg field** — the textbook definition of marginal.

But the picture changes the moment the **File-Request reg chaser (Wave 2/3) actually ships**, because
that is *the* high-value piece of the whole pivot (account-free image collection that self-routes), and a
**required, type-validated reg field** is materially better there than a free-text box an uploader can
fumble. Metadata earns its keep **exactly when (a) goes live**, not before.

### Recommendation: **(iii) defer metadata to a later phase — start on base Business, add Business Plus when the reg field / Metadata-Query actually lands**

This is the dossier's own logic taken to its conclusion: *"Don't over-buy… AI/Hubs/Doc Gen/Governance are
each separate, later, tier-gated decisions — adopt on **evidence of need, not up front**"* (`06-enhancements`),
and the BUILD-PLAN already isolates everything metadata-shaped behind `BOX_METADATA_ENABLED` in **Wave 5
/ Phase C**. Concretely:

- **Waves 0–1 run on base Business unchanged.** Folder-at-intake + archival (B1) need **storage + folders
  + Platform API/webhooks** — **all included from base Business** (`01 §3`). **Nothing in Wave 0/1 needs
  metadata.** So the pivot can **start, deploy, and prove its core archival value on ~$15/user/mo.**
- **Flip to Business Plus precisely at Wave 2** (the File-Request reg chaser), where the typed field first
  pays. This is a **one-click plan upgrade in the Box Admin Console**, not a re-architecture — the connector,
  Functions, flows, schema gates (`cr1bd_BOX_METADATA_ENABLED`, the template-id config var) are all built
  regardless; only the **Box tenant tier** and the **hand-built template's metadata field** wait.
- **As a hedge, Wave 2 can even ship on base Business first** using the **free-text description** capture
  + Dataverse-side VRM parse/normalise/reg-merge (§2), then upgrade to the typed field if free-text proves
  too noisy in practice. This makes the Business-Plus spend **evidence-driven**: pay when the free-text
  fallback demonstrably hurts, not on spec.

**Cost/UX trade of deferring:**
- **Cost win:** save **~$360+/yr** for as long as the firm runs Waves 0–1 only (the core archival value),
  and avoid paying for metadata during the months when (b)/(c)/(d) are unbuilt.
- **UX cost while deferred:** reg arrives as **free text** (parse-dependent, no type validation) and
  there's **no Box-native structured search** (search lives in Dataverse + "Open in Box" deep-link). Both
  are **tolerable** because Dataverse carries the matching and the app carries the navigation.
- **Switching cost:** **near-zero** — Business→Business Plus is an admin-console upgrade; the build
  artefacts don't change. There is no lock-in penalty to starting low.

**The one caveat that would flip the recommendation to (i) keep metadata (Business Plus) from day one:**
if the operator intends to **ship the File-Request reg chaser (Wave 2) immediately** as part of the first
cutover (not a later phase), then provision **Business Plus up front** and build the typed
`vehicle_registration` field straight away — the ~$360/yr is then buying the marquee feature on day one,
not a deferred nice-to-have, and the free-text detour isn't worth the rework. In that scenario metadata
**is** pulling its weight. (Note: option **(ii) — permanently drop to base Business + free-text +
Dataverse matching — is the right call only if the firm decides the typed reg field is never worth
~$360/yr**; given the chaser is the pivot's highest-value piece, that's a harder line to defend than
simply *deferring*.)

**Bottom line:** Box Metadata is **not** carrying the Business-Plus cost on the *current* build — it's
one degradable feature and three deferred/higher-tier ones. **Start on base Business; upgrade to Business
Plus the moment the File-Request reg chaser ships** (or up front *iff* that chaser is in the first
cutover). Keep Dataverse authoritative throughout; the Box metadata mirror, if/when added, stays a
one-way, logic-inert search convenience.

---

### Sources

**Box primary (local mirror `automationsresearch/box/markdown/` + developer.box.com):**
- Metadata tier gate (Business Plus+): doc 357 *Using Metadata* FAQ ("reserved for Business Plus,
  Enterprise, Enterprise Plus, and Enterprise Advanced").
- File Request needs Business; metadata must be on to request it; capture = email + free-text description
  + metadata-template field: docs 315 / 317 / 289 *About / Using / Administering Box File Request*.
- Metadata Query API — `POST /2.0/metadata_queries/execute_read`, SQL-like, **single template / no
  joins** (`MetadataQuery.from` = "the template"), Collaborator-scope (no `enterprise_content`),
  **`limit` max 100** + `marker`, `ancestor_folder_id` scope, **instant / no index delay** vs Search API:
  doc 553 *Understanding the Metadata Query API and Search API* + Box developer OpenAPI
  `post_metadata_queries_execute_read` (local doc 703, line ~12520) + developer.box.com
  `/reference/post-metadata-queries-execute-read/`.
- Template limits (500/enterprise, 250 fields, 100/item, 512 KB): doc 047 *How to Create the Right
  Metadata Structure*. Cascade is an **offline/eventually-consistent** process, external collaborators
  can edit instances: doc 345 *Cascading metadata in folders*.
- Metadata-triggered retention = **Box Governance** add-on: doc 417 *Adding Metadata to a Retention
  Policy*. Box AI Autofill = **E-Advanced** (web) / metered AI Units (API): doc 357 *Autofilling Metadata*.

**Pivot dossier (this folder):**
- The Business-Plus floor and the free-text fallback: `02-plans-and-cost.md` ("Why the floor is Business
  Plus"). The File-Request reg-capture mechanism + tier split: `01-box-capabilities-verified.md` §1, §4.
- Metadata + Metadata-Query as a Box-native index, deferred Phase C: `06-enhancements-unconsidered.md` §A
  (+ §B/§D for AI/Governance; "Don't over-buy"). One-way mirror / no-joins / Dataverse-authoritative:
  `plans/05-dataverse.md` (Overview, gate `cr1bd_BOX_METADATA_ENABLED` "inert until Phase C"),
  `plans/00-BUILD-PLAN.md` (Settled facts #1, #4; Wave 5 Phase C; Dual-store-drift risk).
