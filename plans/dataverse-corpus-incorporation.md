# Dataverse Corpus Incorporation — CONFIRMED provider-corpus analysis → live Sandbox Dataverse

**Status:** Ready for implementation by `dataverse-data-architect`
**Target:** Sandbox `Collision Engineers - Dev` (`https://collisionengineers-dev.crm11.dynamics.com`), solution `CollisionSpike`, publisher prefix `cr1bd`
**Date:** 2026-06-18
**Boundary:** `[DEPLOY-WITH-LOGIN]` — non-inbox Dataverse data work, performed under the operator's interactive login. **No** flow activation, **no** inbox/SharePoint/Box/EVA contact. This is allowed under the build-offline / operator-activation boundary (it is pure Dataverse data, like the Phase-1b seed).

## 1. Purpose & scope

This loads the **CONFIRMED** (non-stale) outputs of the 2026-06-18 provider-corpus analysis (`raw/principalandrepairersheets/outputs/`) into the existing Sandbox tables, **idempotently**, as a **refresh/extend of the prior seed** (tasks #15/#16, which loaded 45 `WorkProvider`, 38 `Repairer`, 4 `ImageSource` rows).

It is **not** a fresh seed. Every write is an UPSERT keyed on a stable alternate key, safe to re-run. The plan covers four work items:

1. **Refresh/extend `WorkProvider`** from `reports/provider_corpus_recommendation.csv` — set active/archived/excluded per `recommended_action`; derive `name` from address for "FAO The Court" placeholders.
2. **Register confirmed shared storage yards** (multi-principal full postcodes) as `Repairer` + `ImageSource`, modelled **once** and linked **N:N** to the principals that use them.
3. **Seed each principal's confirmed repeated full postcodes** as known inspection sites (`InspectionAddress` reference rows) to bootstrap the address-matching surface.
4. **Fold in the confirmed garage↔REPAIRER matches** (`task1_garages_vs_repairer/matches.csv`).

## 2. Hard constraints (apply to every step)

- **No mock/sample data.** Only the real analysed CSVs under `outputs/` are sources. No placeholder rows, no invented domains, no invented postcodes.
- **Exclude stale/uncertain data** (see §8): partial-postcode resolutions, dormant-beyond-threshold providers (do not activate), the 2 paper providers, red-herrings, and unconfirmed code-drift asserted as fact.
- **Idempotent upserts on stable keys.** Mechanism = Dataverse Web API **`PATCH` to an alternate-key URL** (`Upsert`), which creates-or-updates. Re-running changes nothing on already-correct rows.
- **Map to ACTUAL columns/keys only** (verified against `dataverse/schema/*.json` + `dataverse/relationships.json`). No invented fields anywhere in this plan.
- **Governance:** corpus records are **never hard-deleted** — archive via `cr1bd_active=false` (per `work-provider.md` safety rules + `relationships.json` notes). EXCLUDE rows are simply **not written**.

## 3. Mechanism & conventions (reuse the existing build pattern)

Follow the exact pattern already established in `dataverse/.build/*.ps1`:

- **Auth/host:** `az account get-access-token --resource $envUrl`, `$envUrl = "https://collisionengineers-dev.crm11.dynamics.com"`, base `"$envUrl/api/data/v9.2"`.
- **Headers:** `Authorization: Bearer`, `OData-MaxVersion/Version: 4.0`, `Content-Type: application/json; charset=utf-8`, `Prefer: return=representation`, **`MSCRM.SolutionUniqueName=CollisionSpike`** (so new rows/relationships land in the unmanaged solution).
- **Idempotent upsert (records):** `PATCH {base}/cr1bd_workproviders(cr1bd_principalcode='QDOS')` with the row body. Alternate-key upsert creates if absent, updates if present. The required keys already exist and are verified live (`06-verify-live.ps1`): `cr1bd_workprovider_principalcode_key` on `cr1bd_principalcode`; `cr1bd_repairer_name_postcode_key` on `(cr1bd_name, cr1bd_postcode)`.
  - **Guard for accidental insert-on-typo:** send header `If-Match: *` on the PATCH so it only **updates or inserts via the key** (standard Dataverse upsert) — never a blind create at a random GUID.
- **N:N associate (idempotent):** `POST {base}/cr1bd_workproviders(<guid>)/cr1bd_imagesource_workprovider/$ref` with `{"@odata.id": "{base}/cr1bd_imagesources(<guid>)"}`. A duplicate associate returns an error that must be **caught and treated as success** (the link already exists) — that is how N:N is made re-runnable.
- **Lookups on upsert:** bind with `@odata.bind`, e.g. `"cr1bd_RepairerId@odata.bind": "/cr1bd_repairers(<guid>)"`.
- **Recommendation:** author these as **new ordered scripts** alongside the schema build, e.g. `dataverse/.build/10-seed-workprovider.ps1` … `13-seed-garage-matches.ps1`, each reading its CSV from `raw/principalandrepairersheets/outputs/` and each skip/upsert idempotent. Driving them from the CSVs (not hand-transcribed values) keeps them reproducible and honours "no mock data."

> **Read-only note for the planner:** this document does not create those scripts; it specifies them for `dataverse-data-architect`.

## 4. Step 1 — Refresh/extend `WorkProvider` (`cr1bd_workprovider`)

**Source:** `reports/provider_corpus_recommendation.csv` (one row per EVA principal; columns `principal_code, resolved_name, contact_group, on_job_sheet, total_cases, last_used, recency_band, inspection_modality, loc_rate_pct, recommended_action`).

**Key:** `cr1bd_principalcode` (alternate key). **One PATCH per included row.**

### 4.1 Column mapping (only real `cr1bd_workprovider` columns)

| CSV field | → `cr1bd_workprovider` column | Rule |
|---|---|---|
| `principal_code` | `cr1bd_principalcode` (upsert key) | Trim trailing spaces. UPPERCASE preserved (it is the Box/Case-PO prefix). |
| `resolved_name` | `cr1bd_displayname` (primary, required) | If value is a placeholder (`FAO The Court`, `FAO The Court C/o`, `FAO. The Court`, `.`, or empty) → derive from address (see §4.2). Otherwise use as-is. |
| `recommended_action` | `cr1bd_active` (Boolean) | `SEED active*` → `true`; `ARCHIVE *` → `false`. (EXCLUDE/REVIEW are not written — see §4.3.) |
| `inspection_modality` | `cr1bd_inspectionlocationpolicy` (Choice) | `image-based` → `always_image_based`; `site-inspected` → `prefer_address`; `mixed` → `prefer_address` (default). Do **not** invent `required_address` from this data. |
| `inspection_modality` (raw) + `recency_band` + `total_cases` + `last_used` | `cr1bd_imagessourcenotes` (Memo) | Append a single provenance line, e.g. `Corpus 2026-06-18: modality=image-based; recency=active<12m; cases=13031; last_used=2026-06-18; action=SEED active.` Append-only; do not clobber any existing notes. |
| — | `cr1bd_providerautomationmode` | Set `manual` on **insert only** (matches prior seed default). Do **not** overwrite on update. |

**Do not touch on update** (these are deferred-by-design / operator-owned and may already hold real values from the prior seed): `cr1bd_knownemaildomains`, `cr1bd_defaultmailbox`, `cr1bd_instructionnotes`, `cr1bd_reportreturnnotes`, the per-provider booleans (`cr1bd_aiallowed`, `cr1bd_evasubmitallowed`, `cr1bd_enrichmentallowed`, `cr1bd_outboundallowed`, `cr1bd_dragintoeva`). The upsert body for **existing** rows must contain only the columns in the table above, so domain data seeded in task #15 is preserved.

### 4.2 Deriving `name` for placeholder rows (the "FAO The Court" problem)

Report conclusion #2: most LEGAL rows are literally named `FAO The Court`; the real firm is in the address. For the recommendation CSV, `resolved_name` has **already** been resolved from the address for most rows (e.g. `Matrix Solicitors Station Approach Pasture`, `Fort Assist Digbeth Court Business`). The importer rule:

- If `resolved_name` is **non-placeholder** → use it directly.
- If `resolved_name` is still a placeholder (`FAO The Court` / `FAO The Court C/o` / `FAO. The Court` / `.` / blank) → the row's firm name was **not** address-derivable from the analysis. **Do not invent one.** Set `cr1bd_displayname = "<principal_code> (name pending)"` and add a `cr1bd_imagessourcenotes` flag `name unresolved — address-derive at clarifying-info phase`. This affects only the handful of still-placeholder rows and keeps the corpus free of bare "FAO The Court".

### 4.3 Action → disposition (exhaustive)

| `recommended_action` value | Disposition | `cr1bd_active` |
|---|---|---|
| `SEED active` | Upsert row | `true` |
| `SEED active (DORMANT 12-24m — verify still trading)` | Upsert row, **but flag** | `true` + note `dormant 12-24m — verify trading` (job-sheet providers kept active; they are the known book of business) |
| `SEED active (DORMANT 24-36m — verify still trading)` | Upsert row, **but flag** | `true` + same note |
| `ARCHIVE (dormant …, not on job sheet)` | Upsert row | `false` (archived/dormant; kept as history per governance, never active) |
| `EXCLUDE (non-provider: PRIVATE/CLIENT)` | **Not written** | — (red-herrings; see §8) |
| `REVIEW (unknown principal code)` | **Not written** | — (`DEMO` test data; see §8) |

> **Rationale for archiving rather than skipping dormant rows:** the schema explicitly keeps archived providers "as history redirects (Case/PO history depends on old principal codes)." Writing them `active=false` preserves the historic principal codes for any future Case/PO reconciliation while keeping the live matcher to active rows only (report follow-up #5). This is confirmed data (real EVA principals with real case history), so it is in-scope; only their **active** status is set false.

### 4.4 Code-drift reconciliation (prior seed used job-sheet codes; analysis uses EVA codes)

The prior seed keyed several rows on **job-sheet** codes that differ from the **EVA principal** codes in this analysis. Because the upsert key is `cr1bd_principalcode`, a naive load would create **duplicate** providers. The two confirmed drifts:

| Prior-seed code (job sheet) | EVA principal code (analysis) | Action |
|---|---|---|
| `GGP` (Graham Coffey) | `GG` | **Operator decision required.** EVA code `GG` is the join key. Recommended: keep the existing `GGP` row, set `cr1bd_principalcode='GG'` on it (a key update), and **do not** create a second `GG` row. Because this rewrites the Case/PO prefix, it must be an explicit, audited operator step — **defer to the clarifying-info phase** (flag in the hand-off), do not auto-rewrite in this pass. |
| `ZEN` (job sheet, prior seed) | `ZENITH` (EVA, 6 cases, 12-24m) | The analysis flags this as unconfirmed code-drift. **Do not** assert `ZEN`≡`ZENITH`. Upsert `ZENITH` as its own dormant-12-24m active row per §4.3; leave the existing `ZEN` row untouched. Reconciliation deferred (§8). |

For all **other** rows, the analysis `principal_code` is authoritative (EVA code = join key). Rows that already exist under the same code update in place — no duplication.

> **CONSIDER handling (decision):** `CONSIDER` rows are `active<12m` real EVA principals not yet on the job sheet. They are **confirmed active data**, so they are loaded **active=true** with a `cr1bd_imagessourcenotes` provenance flag `source=EVA-principal (not on job sheet); corpus-widen candidate`. This directly executes the report's single biggest recommendation (widen the corpus beyond the 58-row job sheet) using only real data. If the operator prefers to stage these for review first, the one-line alternative is to load them `active=false` — call this out in the hand-off so the operator chooses; default in this plan is **active=true** because they have recent real case volume.

## 5. Step 2 — Confirmed shared storage yards → `Repairer` + `ImageSource`, linked N:N

**Goal (per ADR-0011 + report conclusion #3):** model each confirmed shared yard **once** as a `Repairer`, expose it as an `ImageSource` of `kind=repairer`, and link it **N:N** to every principal that uses it. The yard is the spine of the ImageSource/Repairer corpus and is confirmed by **two independent sources** (the Loc data *and* the job-sheet image-source notes).

**Confirmed-yard selection (full postcodes only — no partials):** take the **named yards** from `claudeschoice/top_inspection_locations.csv` where `known_repairer_at_pc` is non-empty, restricted to rows whose postcode is a **full** UK postcode. Cross-check each against `reports/loc_locations_multi_principal.csv` `type=full` to obtain the **principal breakdown** (the list of principals to link).

> Link only principals that are themselves **written** in Step 1 (active or archived). Skip breakdown entries that are EXCLUDE/REVIEW/unknown or private individuals. Do not link a yard to a principal that has no `WorkProvider` row.

> **Why full-postcode-only and named-only:** partial-postcode yards (e.g. `B6` district) and uncorroborated locations are **deferred** (§8). The confirmed yards each have a full postcode **and** an independently-named repairer, satisfying the "confirmed" bar.

### 5.1 `Repairer` upsert (`cr1bd_repairer`)

Key: `cr1bd_repairer_name_postcode_key` = `(cr1bd_name, cr1bd_postcode)`. PATCH `…/cr1bd_repairers(cr1bd_name='Somstar Recovery and Storage',cr1bd_postcode='B5 6JX')`.

| Column | Value |
|---|---|
| `cr1bd_name` (primary, key) | the `known_repairer_at_pc` name |
| `cr1bd_postcode` (key) | the full postcode, space-normalised (e.g. `B5 6JX`) |
| `cr1bd_active` | `true` |
| `cr1bd_figuresexpected` | leave unset (no confirmed data) |
| `cr1bd_addressline1` | optional: yard name as line 1 (the rest of the 6-line address is not in the confirmed data — leave lines 2-6 blank; postcode carries the match) |

> **Dedup against the prior 38 Repairers:** the `(name, postcode)` key means any yard already present updates in place. Run Step 2 and Step 7 in either order; the shared key prevents duplicates.

### 5.2 `ImageSource` upsert (`cr1bd_imagesource`) — one per yard, `kind=repairer`

`ImageSource` has **no alternate key** in the schema. To stay idempotent, the importer must **get-or-create by query**: `GET …/cr1bd_imagesources?$filter=cr1bd_name eq '<yard>' and cr1bd_kind eq <repairer-value>&$select=cr1bd_imagesourceid`. If a row exists, reuse its id; else create.

| Column | Value |
|---|---|
| `cr1bd_name` (primary) | yard name (same as the Repairer) |
| `cr1bd_kind` (Choice `cr1bd_imagesourcekind`) | `repairer` |
| `cr1bd_repairerid` (Lookup → `cr1bd_repairer`) | `@odata.bind` to the Step-5.1 Repairer (relationship `cr1bd_repairer_imagesource`) — **don't duplicate the address** (schema note) |
| `cr1bd_defaultinspectionaddressid` | optional `@odata.bind` to the matching `InspectionAddress` reference row from Step 3 (same postcode), if present. Nullable; skip if not yet created. |

### 5.3 Link yards N:N to principals (`cr1bd_imagesource_workprovider`)

For each `(yard, principal)` pair where the principal has a `WorkProvider` row:

`POST …/cr1bd_imagesources(<imagesource-guid>)/cr1bd_imagesource_workprovider/$ref` with body `{"@odata.id":"…/cr1bd_workproviders(<workprovider-guid>)"}`.

Catch the "relationship already exists" error → treat as success (idempotent). This realises ADR-0011's "model the yard once, link many," and is exactly the provider→yard (ImageSource) link the garages sheet lacked (report follow-up #2).

> **Repairer↔WorkProvider N:N (`cr1bd_repairer_workprovider`):** also associate each yard's **Repairer** to the same principals (the schema defines this N:N for the inspection-address policy gate). Same idempotent associate pattern.

## 6. Step 3 — Confirmed repeated full postcodes → `InspectionAddress` known-site reference rows

**Decision (where these live):** **`InspectionAddress`**, not a new column on `Case` and not a new table. `InspectionAddress` already models exactly this shape: a location with `cr1bd_postcode`, a 6-line address, an optional `cr1bd_repairerid` lookup, a `cr1bd_decisionmode`, and `cr1bd_sourcelabel`/`cr1bd_sourcenote`. No new field is invented. We create **reference** rows (not yet attached to any Case) that the M1 address policy gate / future matcher can look up by postcode.

**Source:** `task5_principal_postcode_profiles/full_postcodes_repeated.csv` (`principal_code, resolved_name, full_postcode, count`), full postcodes only. **Threshold:** load rows with `count >= 3`. Skip rows whose `principal_code` is EXCLUDE/REVIEW/unknown or whose `resolved_name` is a bare placeholder with `count<5`.

### 6.1 Idempotency for `InspectionAddress` (no alternate key)

Make it idempotent via a **deterministic label** + get-or-create:
- `cr1bd_name` (primary, required) = `"<principal_code> — <full_postcode>"` (e.g. `"RJS — RH10 9NT"`).
- `GET …/cr1bd_inspectionaddresses?$filter=cr1bd_name eq 'RJS — RH10 9NT'&$select=cr1bd_inspectionaddressid` → reuse or create.

### 6.2 Column mapping (only real `cr1bd_inspectionaddress` columns)

| Column | Value |
|---|---|
| `cr1bd_name` (primary) | `"<principal_code> — <full_postcode>"` (dedup probe) |
| `cr1bd_postcode` | the full postcode (space-normalised) |
| `cr1bd_decisionmode` (Choice, **required**) | `confirmed_physical` (a repeated real inspection site is a confirmed physical location). **Not** `image_based`. |
| `cr1bd_sourcelabel` | `storage` if the postcode matches a Step-2 yard; else `repairer` if it matches a garage (§7); else blank |
| `cr1bd_sourcenote` (Memo) | provenance, e.g. `Corpus 2026-06-18 (Task5): repeated full postcode for <principal_code>, count=<count>.` |
| `cr1bd_repairerid` (Lookup → `cr1bd_repairer`) | `@odata.bind` **only when** the postcode matches a known `Repairer`. Otherwise null. |

> These rows are **catalogue/reference** entries: not linked to any `Case`, do not set `Case.cr1bd_evainspectionaddress`. They seed the lookup surface only. No path here produces the literal `Image Based Assessment`.

## 7. Step 4 — Confirmed garage↔REPAIRER matches → `Repairer`

**Source:** `task1_garages_vs_repairer/matches.csv` (confirmed matches: a job-sheet garage matched to an EVA REPAIRER contact).

**Confirmed-match filter:** load rows where `pc_full_match=True` **OR** (`pc_outward_match=True` AND `name_jaccard>=0.5`). Excludes the genuinely uncertain rows (deferred, §8).

**Key:** `cr1bd_repairer_name_postcode_key = (cr1bd_name, cr1bd_postcode)`. Use the **EVA `repairer_name`** as `cr1bd_name` and the **best-confirmed postcode** as `cr1bd_postcode`.

| Column | Value |
|---|---|
| `cr1bd_name` (primary, key) | `repairer_name` (EVA REPAIRER directory name) |
| `cr1bd_postcode` (key) | best-confirmed postcode |
| `cr1bd_email` (format Email) | `garage_email` if present |
| `cr1bd_phone` | `garage_phone` (keep the number, drop the `(name)` suffix) |
| `cr1bd_addressline1` | `garage_name` if it differs from `repairer_name` |
| `cr1bd_active` | `true` |

This **enriches/dedupes against the prior 38** Repairers via the shared `(name, postcode)` key.

> **No `WorkProvider` link is asserted here.** task1 is a garage↔EVA-REPAIRER identity reconciliation, not a provider→garage mapping — that comes from the yards (Step 2) and the deferred note-mining (§8).

## 8. What this deliberately excludes (stale / deferred to the clarifying-info phase)

1. **Partial-postcode resolutions.** All `type=part` rows; 57% of located cases. Await the user's clarifying input (separate plan). **Not** written.
2. **The 2 paper providers** (Arianna per-VRM; Questgates/Brownsword). Need a routing rule, not a row. **Skip.**
3. **Red-herrings (non-providers).** Every `EXCLUDE` row + the 20 non-provider codes in `contact_group_redherrings.csv`. **Never enter `WorkProvider`.**
4. **`REVIEW` unknowns** (DEMO test data, DEE). **Skip.**
5. **Unconfirmed code-drift asserted as fact** (`ZEN`≡`ZENITH`, `GGP`→`GG`). Load `ZENITH` as its own real row; the **merge** is an audited operator key-change deferred to clarifying-info.
6. **Free-text image-source-note mining** (the highest-value next step) — only **already-corroborated** yards loaded now.
7. **Dormant >12m providers are NOT activated** — written `active=false` where real principals; kept out of the active matching set.
8. **Email domains / mailbox / automation toggles** are **not** rewritten (the analysis carries no sender domains).

## 9. Pre-flight, validation & rollback

**Pre-flight (read-only):** confirm the four tables + keys + N:N exist live; resolve choice option integers from live `GlobalOptionSetDefinitions` (don't hard-code); snapshot current counts.

**Post-run validation:** WorkProvider active/archived counts; **zero** rows for any EXCLUDE/REVIEW code; no bare-placeholder display names; every yard present by `(name, postcode)`; spot-check 3 yards' N:N; every InspectionAddress has `decisionmode=confirmed_physical` + non-empty postcode; **re-run the whole batch once → expect all no-op** (proves idempotency).

**Rollback:** corpus rows never hard-deleted → rollback = set `active=false` on rows this batch activated (filter by the `Corpus 2026-06-18` provenance marker) and remove the N:N links added.

## 10. Sequencing

1. Pre-flight read-only checks + count snapshot.
2. **Step 1 — WorkProvider** upsert (must run first — links need the GUIDs).
3. **Step 4 — Repairer (garage matches)** + **Step 2 — Repairer (yards)** (shared key dedups).
4. **Step 3 — InspectionAddress** reference rows (bind `repairerid` where postcode matches).
5. **Step 2 — ImageSource** create + N:N links (bind `defaultinspectionaddressid` where present).
6. Post-run validation + idempotency re-run.

## 11. Hand-off to `dataverse-data-architect` (checklist)

- [ ] `dataverse/.build/10-seed-workprovider.ps1` ← `reports/provider_corpus_recommendation.csv`; upsert on `cr1bd_principalcode` per §4 (§4.1 columns only; insert-only defaults; placeholder-name rule §4.2; disposition §4.3). Do **not** overwrite `knownemaildomains`/mailbox/toggles on existing rows.
- [ ] `11-seed-repairers.ps1` ← **both** `claudeschoice/top_inspection_locations.csv` (named full-postcode yards) and `task1_garages_vs_repairer/matches.csv` (§7 filter); upsert on `(cr1bd_name, cr1bd_postcode)`.
- [ ] `12-seed-inspection-sites.ps1` ← `task5_principal_postcode_profiles/full_postcodes_repeated.csv` (`count>=3`); get-or-create `InspectionAddress` by `"<code> — <postcode>"`, `decisionmode=confirmed_physical`, bind `repairerid` where a Repairer exists at that postcode.
- [ ] `13-link-imagesources.ps1`: get-or-create one `ImageSource(kind=repairer)` per yard, bind `repairerid` (+ `defaultinspectionaddressid` if present), then idempotent-associate the yard's `ImageSource` **and** `Repairer` N:N to each linked `WorkProvider`. Principal lists from `loc_locations_multi_principal.csv` `type=full`; link only principals with a `WorkProvider` row.
- [ ] All scripts reuse the `.build/*.ps1` conventions (`az` token, `$envUrl`, `api/data/v9.2`, `MSCRM.SolutionUniqueName=CollisionSpike`, transient-500 retry, skip/no-op idempotency, `Prefer: return=representation`).
- [ ] Read choice integer values live before writing; hard-code none.
- [ ] Add `14-verify-corpus.ps1` post-run check (§9) and run the idempotency re-run (expect all no-op).
- [ ] **Do not load** anything in §8. Surface the deferred items to the operator as the "clarifying-info phase" backlog.
- [ ] Stay within the boundary: non-inbox Dataverse only; no flow activation; no inbox/SharePoint/Box/EVA contact.

### Critical files for implementation
- `dataverse/schema/work-provider.json` — `cr1bd_workprovider` columns + `principalcode` alternate key (Step 1).
- `dataverse/schema/inspection-address.json` — `cr1bd_inspectionaddress` columns + `repairerid` lookup + `decisionmode` (Step 3; chosen home for known sites).
- `dataverse/relationships.json` — the N:N (`cr1bd_imagesource_workprovider`, `cr1bd_repairer_workprovider`) + `cr1bd_repairer_imagesource` schema names used in Step 2.
- `dataverse/.build/02-tables.ps1` / `04-altkeys.ps1` / `06-verify-live.ps1` — the authoritative idempotent Web API pattern the new scripts must mirror.
- `raw/principalandrepairersheets/outputs/reports/provider_corpus_recommendation.csv` — the spine of Step 1.
