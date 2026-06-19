# Clarifying-Info Ingestion Plan (Phase 1b)

_How the clarifying information the operator is about to gather flows into Dataverse, once provided. Companion to [CURRENT_STATUS.md](../../../../CURRENT_STATUS.md), [ADR-0011](../../../../docs/adr/0011-work-provider-intermediary-garage-roles.md), and the corpus seed (`WorkProvider` 45 / `Repairer` 38 / `ImageSource` 4, already live in Sandbox `Collision Engineers - Dev`). Last updated 2026-06-18._

## Purpose & scope

Phase 1 seeded **only confirmed data** (job-sheet Principals, garages, four image sources). This plan is the **second-phase ingestion**: the operator is filling in / confirming five worklists derived from the EVA data analysis (`raw/principalandrepairersheets/outputs/reports/`). For **each** input type below this document states, concretely and parameterised: **Input → Dataverse target (table.column / relationship) → transformation → idempotency key → who/when.** "When the operator gives me X, here is exactly what happens in Dataverse."

It is read-only planning. No rows are written by this document; it defines the writers.

## Ground rules (apply to every input)

- **No mock data.** Every row originates in a confirmed/operator-supplied value or in real EVA evidence already on file. Blank stays blank.
- **Idempotent upserts only.** Every writer is a get-or-create-or-update keyed on a natural key. Re-running an input file changes nothing already correct (the established pattern — `flows/definitions/jobsheet-import.definition.json`: `ListRecords` filter on the alternate key → `If exists` → audit-skip-active **else** create-draft).
- **Map to ACTUAL columns/keys** — every field below is a real `cr1bd_*` logical name from `dataverse/schema/*.json`; every relationship is a real intersect from `dataverse/relationships.json`.
- **Governance (never silently overwrite an active corpus row).** Re-import updates **draft/inactive** rows freely; an **active** row is only changed via an explicit change-reason path, and every change writes an `AuditEvent` (`cr1bd_auditaction = corpus_record_changed` 100000017, or `jobsheet_imported` 100000014 for additive imports). Corpus rows are deactivated/archived/merged, never hard-deleted.
- **ADR-0011 is binding.** `WorkProvider.knownEmailDomains` holds only the provider's **own** domains. Any sender domain that resolves to >1 provider is an **intermediary** (`ImageSource.kind=intermediary`, N:N to WorkProvider), never a WorkProvider domain.
- **All-Microsoft mechanism.** Two interchangeable writers, same semantics:
  - **(A) Operator-gated Power Automate flow** — the `jobsheet-import` idiom, extended per input. Read source from **Excel Online (Business)** / **SharePoint list** (operator binds drive/file/table as flow parameters), upsert to Dataverse via the CDS connector. This is the live path.
  - **(B) PowerShell + Dataverse Web API** (`dataverse/.build/` idiom: `az account get-access-token` → `PATCH …/api/data/v9.2/<set>(<altkey>)` with `Prefer: return=representation`). Useful for a one-shot back-fill from a CSV the operator returns. Web-API **upsert-by-alternate-key** does the get-or-create atomically — preferred where an alternate key exists.

**Recommended input format the operator returns:** the same worklist/CSV files, with the "Your confirmed …" column filled (address worklist) or a short decision token added (intermediary / code-drift / coverage / CONSIDER). Each file maps 1:1 to a writer below.

## Natural keys (idempotency) reference

| Table | Alternate key (schema) | Upsert key used here |
|---|---|---|
| `cr1bd_workprovider` | `cr1bd_workprovider_principalcode_key` → `cr1bd_principalcode` | **principalCode** (UPPERCASE canonical) |
| `cr1bd_repairer` | `cr1bd_repairer_name_postcode_key` → `cr1bd_name` + `cr1bd_postcode` | **name + full postcode** |
| `cr1bd_imagesource` | _none defined_ | **synthetic deterministic `cr1bd_name`** (see §2) → match by `$filter`, then create |
| `cr1bd_inspectionaddress` | _none defined_ | not corpus; per-case, keyed by parent Case (see §1) |
| N:N `cr1bd_repairer_workprovider` | intersect | (repairerId, workProviderId) pair — `GET` associaterefs before `Associate` |
| N:N `cr1bd_imagesource_workprovider` | intersect | (imageSourceId, workProviderId) pair — idem |

> `ImageSource` and `InspectionAddress` have no alternate key. For idempotency the writer first does a `ListRecords`/`$filter` existence probe on the deterministic match field, then creates only if absent. N:N links are made idempotent by reading the navigation collection before issuing `Associate`, so a re-run never double-links.

---

## Input 1 — Confirmed full addresses for part-postcode districts (the address worklist)

**Source:** `reports/principal_address_worklist.md` — one section per principal; rows are `(district, cases, Likely full address [from own history], Your confirmed full address)`. ~35% of rows carry a pre-filled "Likely full address" the operator only needs to confirm; the rest need a supplied full address. 201 principals, 638 districts.

**What these are:** a `(principal, district)` part-postcode resolves to the **full address of the storage/recovery yard** that district refers to. The target is therefore **not** a free-text blob on WorkProvider — it is a first-class **`Repairer`** ("known site") row, linked to the principal's `WorkProvider`, and used to **resolve a Case's inspection address** when that case's Loc is district-only.

| | Input → Dataverse target → transformation → idempotency key |
|---|---|
| **Primary target** | `cr1bd_repairer` (the yard as a known site). `cr1bd_name` = confirmed site/yard name (require a name or skip; no placeholder); `cr1bd_addressline1..6` = parsed 6-line address; `cr1bd_postcode` = the confirmed **full** postcode (normalised via postcode.io, `AZURE_MAPS_ENABLED=false`); `cr1bd_active = true`. `cr1bd_figuresexpected` left null. |
| **Link** | N:N `cr1bd_repairer_workprovider` (ADR-0001) — associate this Repairer to the principal's `WorkProvider` (resolved by `principalCode`). Read-before-associate for idempotency. |
| **Per-case use** | When a Case's parsed Loc is the matching district for a linked principal, the resolver creates/sets a `cr1bd_inspectionaddress` row with `cr1bd_repairerid` → this Repairer, `cr1bd_decisionmode = confirmed_physical` (100000000) — no `decisionReason` required. It then serialises the 6-line address into `Case.cr1bd_evainspectionaddress` (EVA field 9) and mirrors `Case.cr1bd_inspectiondecision = confirmed_physical`. Case link = `cr1bd_inspectionaddress_case`. |
| **Transformation** | Parse the confirmed address string into 6 lines + postcode; `UPPER`/trim postcode; postcode.io normalise. Carry the district→postcode mapping into a lookup the resolver consults (district match = `startswith(outwardCode)`). |
| **Idempotency key** | **Repairer** = `cr1bd_name + cr1bd_postcode` (alternate key) — re-confirming the same yard updates in place. **Shared yards register once** and fan out via N:N to all principals that use them. **InspectionAddress** is per-Case (not corpus). **N:N** = (repairerId, workProviderId) pair, read-before-link. |

### Fast-confirm path (the pre-filled "Likely full address" suggestions)

For the ~35% of rows where "Likely full address (from own history)" is populated, the operator's action is a **yes/no confirm**, not data entry:

1. **Surface** these as a single review queue showing `principal · district · suggested full postcode (seen N×) · [Confirm] [Edit] [Reject]`.
2. **Confirm (default, one click / `y` token):** the writer takes the suggested full postcode as the confirmed value — it expands to the full address from the same own-history evidence that produced the suggestion. Upserts the `Repairer` row + N:N link, with audit `cr1bd_after = "fast-confirm: own-history full postcode <pc> seen <N>x, operator-confirmed <date>"`.
3. **Edit:** operator overrides; same upsert with the edited value.
4. **Reject:** no Repairer written; row flagged for the supply-an-address path.
5. **Blank suggestion** (no own-history): requires a supplied full address before any Repairer row is created — never invent one.
6. **Ordering:** process by `cases` desc, so confirming the top rows converts the largest blocks of district-only Cases first (e.g. confirming `M12 5FX` for QCL resolves 814 cases).

**Who/when:** operator confirms/supplies (the live-services boundary owns address truth); writer is the **address-import flow** (variant A) over the returned worklist, runnable per-principal section. Idempotent → confirm in batches across sessions.

---

## Input 2 — Intermediary confirmations (senders that route to multiple providers)

**Source:** `report.md` "Global items to obtain" item 6 + the multi-principal evidence in `loc_principal_analysis.md` Q2 (the **`hackneysolutions.co.uk` → LEX + QCL** collision is the worked example). The operator confirms, per candidate sender domain, **"intermediary (routes to providers A, B, …)"** vs **"this provider's own domain."**

**ADR-0011 mapping:** an intermediary is **not** a WorkProvider domain. It is an `ImageSource` with `kind=intermediary` carrying its own `emailDomain`, **N:N to WorkProvider**.

| | Input → Dataverse target → transformation → idempotency key |
|---|---|
| **Target** | `cr1bd_imagesource`: `cr1bd_name` = intermediary trading name (deterministic); `cr1bd_kind = intermediary` (100000002); `cr1bd_channel = email` (100000000); `cr1bd_emaildomain` = the routing domain (lowercased, after `@`); `cr1bd_repairerid` null; `cr1bd_defaultinspectionaddressid` null unless the operator names a default yard. |
| **Link** | N:N `cr1bd_imagesource_workprovider` — associate to **each** confirmed downstream `WorkProvider` (by `principalCode`). E.g. `hackneysolutions.co.uk` → LEX and QCL. |
| **De-collision on WorkProvider** | For every provider that previously carried the now-confirmed intermediary domain in `cr1bd_knownemaildomains`, **remove** that domain from the WorkProvider memo. Clears the ADR-0011 ">1 active provider blocks auto-match" condition. Each removal is an active-row change → `corpus_record_changed` audit with before/after. |
| **Idempotency key** | **ImageSource** = deterministic `cr1bd_name` (e.g. `"Intermediary: hackneysolutions.co.uk"`) probed by `$filter=cr1bd_kind eq 100000002 and cr1bd_emaildomain eq '<domain>'`; create only if absent. **N:N** = (imageSourceId, workProviderId), read-before-link. WorkProvider memo edit is naturally idempotent. |

**Who/when:** operator classifies; writer is the **intermediary-reclassify flow** (extends Phase-1 task #16). Run after Input 3 so provider codes are canonical first.

---

## Input 3 — Code-drift / slash-code / per-VRM / paper-routing resolutions

**Source:** `report.md` "Follow-ups" 1 & 4 + "Global items" 3–5. The **WorkProvider reconciliation rules**: confirm one canonical `principalCode` per provider so the Box/EVA Case-PO prefix is stable. Five sub-cases:

| Sub-case | Operator confirms | Input → Dataverse action → idempotency |
|---|---|---|
| **3a Code drift** (`ZEN` vs `ZENITH`) | the canonical principalCode | Keep the canonical `WorkProvider`. If the variant exists, **deactivate** it (`active=false`) and record the redirect in `instructionnotes` / audit (`corpus_record_changed`, old→new code) — never hard-delete. Upsert by `principalCode`. |
| **3b Slash-codes = two providers** (`R1AM/MOTORX`) | two distinct providers | Ensure **two** rows: `R1AM` and `MOTORX`, each upserted by its own `principalCode`, each `active=true`. If a merged `"R1AM/MOTORX"` row exists, deactivate it (audit redirect). |
| **3c Per-VRM coding** (Arianna Autos) | the routing rule (no fixed code) | **No standard seed.** One **sentinel** `WorkProvider` `principalCode="ARIANNA"`, `providerautomationmode=manual`, per-VRM Case-PO rule in `instructionnotes`. The Case-PO generator special-cases this provider. |
| **3d "Questgates or Brownsword"** (no code) | which firm / routing | Until a stable code is confirmed, **do not** seed a WorkProvider. Hold as an open routing rule. |
| **3e FRAZ** (`SEARCH CASE ID NOT PRINCIPAL`) | match-by-Case-ID rule | Keep the row, but record `instructionnotes="route/match by Case ID, not principal"` so the matcher does not key Case-PO off the principal. Upsert by `principalCode="FRAZ"`. |

**Cross-cutting transformations:** canonical principalCode = **UPPERCASE**, trim trailing spaces; placeholder names derive `displayname` from the EVA address firm (never write literal "FAO The Court"); every active-row reconciliation writes `AuditEvent corpus_record_changed` with before/after.

**Idempotency key:** `WorkProvider.cr1bd_principalcode`. Deactivations idempotent. **Who/when:** operator decides; writer = corpus-reconcile flow (A) or Web-API `PATCH`-by-principalcode (B).

---

## Input 4 — Garage ↔ provider coverage (which garages serve which providers)

**Source:** `report.md` "Follow-ups" 2 — the garages sheet **lacks a provider column**. Coverage must come from the operator (or from mining the job-sheet image-source notes, which name yards + postcodes in free text).

| | Input → Dataverse target → transformation → idempotency key |
|---|---|
| **Target relationship** | N:N `cr1bd_repairer_workprovider` (ADR-0001) — the single source of provider↔garage coverage. |
| **Repairer side** | Garage must exist as `cr1bd_repairer` (38 seeded; high-volume yards from Input 1 add the rest). Upsert by `name + postcode`; set `cr1bd_figuresexpected` from the "Figures" column if supplied. |
| **WorkProvider side** | Resolve each named provider → `principalCode` → `workProviderId`. |
| **Action** | For each confirmed (garage, provider) pair, `Associate` across the N:N. Read existing links first; link only missing pairs. |
| **Drives** | This coverage is what the **chaser** uses to target the right garage for images (ADR-0011 + ADR-0001), and what the inspection-address policy gate offers as candidate physical locations. |
| **Idempotency key** | **N:N pair** (repairerId, workProviderId), read-before-link. Repairer upsert by name+postcode. |

**Who/when:** operator supplies coverage; writer is the **coverage-link flow**, ideally fed by **mining `WorkProvider.imagessourcenotes`** for the yard postcodes already named there (QCL → "HS Recovery … M12 5FX", FW → "Somstar … B5 6JX") — mining proposes pairs, operator confirms, writer associates. Run after Inputs 1 & 3.

---

## Input 5 — The 137 active-but-off-jobsheet principals (CONSIDER rows) → decision + seeding

**Source:** `reports/provider_corpus_recommendation.csv` `recommended_action`. Big CONSIDER names: **PCH** (1,725 cases), **HVL** (422), **Matrix** (173), **SWADE** (82), the **Oldham hub cluster** (FOCUS/EXPRESS/WHITELINE/SKY/VOGUE). Operator returns a per-row decision token. Writer = a **switch on the confirmed action**, all upserting `WorkProvider` by `principalCode`:

| Confirmed action | Input → Dataverse action → idempotency |
|---|---|
| **SEED active** (incl. operator-promoted CONSIDER) | Upsert by `principalCode`; `active=true`; `providerautomationmode=manual`; `displayname` from confirmed/address-derived name; `inspectionlocationpolicy` from modality (image-based → `always_image_based`; site → `prefer_address`; mixed → `prefer_address`); `knownemaildomains` blank unless a real domain is on file (ADR-0011). New CONSIDER rows **staged `active=false`** first, activated on approval. Audit `jobsheet_imported`. |
| **SEED active (DORMANT — verify trading)** | Same upsert, `active` set only after the operator's verification token; until then staged inactive. |
| **CONSIDER (no decision yet)** | Stage as **draft `active=false`** (visible, never auto-matches); policy from modality; audit `jobsheet_imported` with `after="CONSIDER — awaiting decision"`. |
| **ARCHIVE (dormant, not on job sheet)** | Upsert with `active=false` (history-only redirect; matcher ignores inactive). Never hard-delete. |
| **EXCLUDE (non-provider: PRIVATE/CLIENT)** | **No row.** Record the exclusion as an `AuditEvent` only; never seed. |
| **REVIEW (unknown principal code)** (DEMO, DEE) | No seed; hold for operator. DEMO is test data. |

**Transformations:** parse the action token; map modality → `inspectionlocationpolicy`; derive `displayname` from address for placeholders; UPPERCASE principalCode; `loc_rate_pct` may seed `imagessourcenotes` context.

**Idempotency key:** `WorkProvider.cr1bd_principalcode` for every branch; EXCLUDE/REVIEW write no provider row. **Who/when:** operator decides per row; writer = corpus-seed flow (A) or Web-API batch (B). The single biggest corpus-widening step (137 active principals).

---

## Sequencing (dependencies)

1. **Input 3** (code reconciliation) — establishes **canonical `principalCode`s** the others resolve against.
2. **Input 5** (CONSIDER decisions + seeding) — creates/activates the `WorkProvider` rows later links attach to.
3. **Input 1** (addresses → Repairer known-sites) — creates the **Repairer** yard rows.
4. **Input 4** (garage↔provider coverage) — needs providers (1,3,5) and garages/yards (1).
5. **Input 2** (intermediaries) — needs canonical providers (3); last to touch `knownEmailDomains` (de-collision).

All five are independently idempotent → partial/iterative operator returns are safe to re-run.

## Mechanism summary (all-Microsoft, no new schema)

- **Tables touched:** `cr1bd_workprovider`, `cr1bd_repairer`, `cr1bd_imagesource`, `cr1bd_inspectionaddress` (per-case, via the resolver), `cr1bd_auditevent`. **No new tables or columns.** (Consider adding a `cr1bd_imagesource_emaildomain_key` later if intermediary volume grows.)
- **Relationships touched:** `cr1bd_repairer_workprovider`, `cr1bd_imagesource_workprovider` (read-before-`Associate`); `cr1bd_repairer_inspectionaddress` + `cr1bd_inspectionaddress_case` (per-case).
- **Writers:** extend `flows/definitions/jobsheet-import.definition.json` — one operator-gated flow per input (Excel/SharePoint read → upsert by alternate key → `AuditEvent`) — or a one-shot PowerShell `PATCH`-by-alt-key back-fill for a returned CSV. Source ids are flow parameters bound by the operator (live-services boundary).
- **Gates:** address normalisation honours `AZURE_MAPS_ENABLED=false` → postcode.io. No EVA/Box/enrichment writes here.
- **Auditing:** every create/update/deactivate writes a `cr1bd_auditevent` (`jobsheet_imported` 100000014 additive; `corpus_record_changed` 100000017 active-row change; `inspection_override` 100000018 only if a resolution forces `image_based`), with before/after and `actor="Flow_<name>"`.

### Critical files for implementation
- `flows/definitions/jobsheet-import.definition.json` (the canonical upsert/audit flow idiom every writer extends)
- `dataverse/schema/work-provider.json` (principalCode key, knownEmailDomains, inspectionLocationPolicy, instructionnotes/imagessourcenotes)
- `dataverse/schema/repairer.json` + `inspection-address.json` (known-site target + per-case resolution, name+postcode alt key, decisionMode)
- `dataverse/relationships.json` (exact N:N intersects + address↔case links)
- `dataverse/schema/image-source.json` + `dataverse/choicesets/image-source.json` (intermediary kind=100000002, emailDomain, N:N per ADR-0011)
