# Inspection-address matching service — part-postcode `Loc` → known site → EVA field 9 (ROADMAP 4a)

> **Status:** planning + completion runbook. The **pure helpers are already built** in
> `functions/addressmatch/` (`postcode.py`, `postcode_client.py`, **offline** [BUILD]); this plan
> specifies the **remaining build** (the `matching.py` ranker + `function_app.py` HTTP handler + infra +
> OpenAPI), how it consumes the Phase-1b corpus, and the postcode.io→Azure-Maps gating. It is the deep
> dive behind **ROADMAP §4a "Inspection-address matching"** (the third checkbox) that
> [phase-1-operational.md](./phase-1-operational.md) and [dataverse-corpus-incorporation.md](./dataverse-corpus-incorporation.md)
> reference. Companion to ADR-0001 (Repairer first-class), the **`eva-sentry-api`** skill,
> [docs/architecture/integrations.md](../docs/architecture/integrations.md), AGENTS.md. Author date
> **2026-06-18**. Read-only research; **no code/flows/Dataverse changed by this plan**.

---

## 0. TL;DR decision

**The matcher is a thin Azure Function that turns a Case's district-only `Loc` into a confirmed
inspection address by looking up the linked yard in the Phase-1b corpus — never by guessing.** The
domain rule is fixed (ROADMAP §4a): *resolve a Case's part-postcode `Loc` (**57 % of cases**) → the
linked yard's full address via **district `startswith(outwardCode)`** over the corpus → an
`InspectionAddress` row → EVA field 9.* The hard helpers for this — UK postcode parse (`full|part|none`),
the `district_matches` rule, the **exact 6-line EVA serializer**, and the fail-soft **postcode.io** seam
gated by `AZURE_MAPS_ENABLED` — **already exist and are unit-test-shaped** in `functions/addressmatch/`.
What remains is the **candidate ranker** (`matching.py`) and the **HTTP/connector surface**
(`function_app.py` + `infra/main.bicep` + `openapi/`), then wiring it into the pipeline and the Code App's
address gate.

**Three invariants that constrain every choice:**
1. **No silent "Image Based Assessment".** A physical address is only ever produced from a **confirmed
   corpus site**; the image-based literal is produced **only** by the policy layer with
   `decisionMode=image_based` **and a non-empty reason** (`address-policy.ts` `IMAGE_BASED_LITERAL`;
   `inspection-address.json` notes). The matcher **proposes**; the policy gate **decides**.
2. **postcode.io now, Azure Maps later.** `AZURE_MAPS_ENABLED=false` (the M1 default) → postcode.io
   (free, UK-only, no key); `true` (M3) → Azure Maps Search. The matcher routes through one client seam
   so the flip needs no matcher change.
3. **The matcher never invents an address.** If no linked, confirmed site matches the district, it
   returns **no candidate** and the Case falls to the policy gate (operator decision / image-based with
   reason). Matching is a **lookup over confirmed corpus rows**, not geocoding free text.

---

## 1. What is already built (verified in-repo, 2026-06-18)

| Asset | State | What it gives 4a |
|---|---|---|
| `functions/addressmatch/postcode.py` | **Built, pure** ([BUILD]) | `parse_postcode` → `full|part|none` + outward/inward (mirrors the corpus parser `outputs/_scripts/_lib.py`); `district_matches(case_outward, candidate_postcode)` = **the ROADMAP-4a `startswith(outwardCode)` rule**; `serialize_six_lines(...)` = **EXACTLY six newline-separated lines** for EVA field 9; `IMAGE_BASED_LITERAL` constant (mirrors `address-policy.ts`). |
| `functions/addressmatch/postcode_client.py` | **Built, fail-soft** ([BUILD]) | `PostcodeIoClient` over `api.postcodes.io` (`/postcodes/{pc}`, `/outcodes/{oc}`), retry/backoff on 429/5xx, **every failure → `None`** (never blocks the decision), **no secrets** (postcode.io is open). `POSTCODE_IO_BASE` overridable; this is the single seam the `AZURE_MAPS_ENABLED` gate flips. |
| `functions/addressmatch/{infra,openapi,tests}/` | **Dirs exist; `tests/fixtures/` present; infra+openapi EMPTY** | The Bicep + connector OpenAPI are **still to author** (§4). |
| **Corpus data** (Phase 1b) | **Seeded + plan'd** | `Repairer` (38 + Input-1 known-sites) carry full address + postcode; N:N `cr1bd_repairer_workprovider` links yards↔providers; `InspectionAddress` reference rows for repeated full postcodes (`confirmed_physical`). The matcher reads these. |
| `mockup-app/src/domain/address-policy.ts` | **Built** | `resolveInspectionDecision(policy, …)` over `always_image_based | prefer_address | required_address` (default `prefer_address`); owns `IMAGE_BASED_LITERAL`. The matcher **feeds** this gate a candidate; the gate is unchanged. |
| Dataverse columns (all real) | **Exist** | `Case.cr1bd_evainspectionaddress` (**evaField 9**, Memo), `Case.cr1bd_inspectiondecision` (mirror of decisionMode), `Case.cr1bd_workproviderid`; `InspectionAddress.cr1bd_repairerid` / `cr1bd_decisionmode` / `cr1bd_decisionreason` / 6 address lines + postcode; `Repairer.cr1bd_addressline1..6` + `cr1bd_postcode`; `WorkProvider.cr1bd_inspectionlocationpolicy`. |
| `cr1bd_AZURE_MAPS_ENABLED` env-var | **Exists**, default **false** | "When false, postcode.io is the address-normalisation path (M1). When true (M3), Azure Maps." (`environment-variables.json`.) |

**Implication:** §4a is **~55 % built** — the deterministic core (parse + match rule + 6-line serializer
+ postcode.io seam) is done; the **ranker + HTTP/connector surface + pipeline wiring** remain.

---

## 2. Boundary legend

| Tag | Meaning | Who |
|---|---|---|
| **[BUILD]** | Authored + verified **offline** (`matching.py`, `function_app.py`, Bicep, OpenAPI, pytest with postcode.io mocked via `respx`). Zero tenant/Azure/postcode.io contact. | Claude |
| **[DEPLOY-WITH-LOGIN]** | Deploy the Function, import the connector, set `cr1bd_addressmatch` + non-secret app settings, read-only GETs. (Corpus seeding itself is [DEPLOY-WITH-LOGIN] — `dataverse-corpus-incorporation.md`.) | Operator (Claude may draft commands + run read-only GETs) |
| **[RESERVED-FOR-USER]** | Bind the connection, turn the matcher into the live pipeline, run live address decisions on real Cases, confirm operator-supplied addresses (the live-services boundary owns address truth — `clarifying-info-ingestion.md` Input 1). | **Operator only** |

**CSP (AGENTS.md truth #1):** the Code App reaches the matcher **only via the `cr1bd_addressmatch`
custom connector** (or via the pipeline flow, server-side). **No raw `fetch()`** — and the Function calls
postcode.io **server-side** (postcode.io has no Power Platform connector, and CSP would block a browser
call anyway). **Flow-webhook (truth #2):** the matcher is invoked by a `Request`/child flow or the Code
App — not a connection-webhook trigger, so no designer re-publish.

---

## 3. The matching algorithm (what `matching.py` must implement)

**Input:** `{ caseLoc, workProviderId (or principalCode), inspectionLocationPolicy }`.
**Output:** a ranked candidate list + a recommended decision the **policy gate** will accept or override.

```
1. parse_postcode(caseLoc):
     • kind == "full"  → the Loc already names a unit postcode → use it directly:
         resolve the address (corpus Repairer/InspectionAddress with that postcode, else
         postcode.io to validate + label) → confirmed_physical candidate (score 1.0).
     • kind == "part"  → the 57% case → CANDIDATE SEARCH (step 2).
     • kind == "none"  → not a postcode (free text / "Image Based Assessment" / "storage yard")
                         → NO postcode candidate; hand straight to the policy gate.

2. CANDIDATE SEARCH for a part-postcode district `D = outward(caseLoc)`:
     • Resolve the Case's WorkProvider → its linked Repairers via N:N cr1bd_repairer_workprovider.
     • For each linked Repairer R with a full cr1bd_postcode:
           if district_matches(D, R.postcode)  →  candidate(R), score by specificity:
              exact outward match (R.outward == D)            → 0.9
              startswith (R.outward.startswith(D), longer)    → 0.7
     • Also consider InspectionAddress reference rows (confirmed_physical) for that provider
       whose postcode district matches D (these are the "seen >=3x" known sites, Phase 1b §1b.2).
     • Rank: confirmed_physical InspectionAddress > linked Repairer; exact-outward > startswith;
       higher case-volume site first (Phase 1b ordering by `cases` desc).

3. DECISION (recommendation only — the policy gate is authoritative):
     • >=1 candidate AND policy != always_image_based
            → recommend the top candidate, decisionMode = confirmed_physical (no reason needed).
     • 0 candidates OR policy == always_image_based
            → recommend image_based, decisionMode = image_based  (policy gate REQUIRES a reason;
              the matcher supplies the rationale string, e.g. "no linked confirmed site for district D").
     • policy == required_address with 0 candidates
            → recommend NO auto-resolution; flag for operator address entry (never image-based without
              Management override + audit — address-policy.ts).

4. SERIALIZE (only once the policy gate has accepted a physical candidate):
     serialize_six_lines([R.line1..R.line6], postcode = normalised(R.postcode)) → EVA field 9 string.
     (postcode normalisation via the AZURE_MAPS_ENABLED-gated client — §5.)
```

This is exactly `district_matches` + the corpus N:N, with `postcode.py` already supplying steps 1 and 4.
`matching.py` adds steps 2–3 (the Dataverse candidate read + ranking) and the **recommendation** the
policy gate consumes. It **must not** emit `IMAGE_BASED_LITERAL` itself — it returns a *recommendation*;
`address-policy.ts` / the flow writes the literal **with** the reason (invariant #1).

---

## 4. The HTTP + connector surface (what remains to build)

| Artifact | Shape | Notes |
|---|---|---|
| `functions/addressmatch/function_app.py` | `POST /api/address/match` body `{ loc, workProviderId?, principalCode?, policy? }` → `{ kind, candidates:[{label, line1..6, postcode, source:"repairer"|"inspection_site", score}], recommendation:{ decisionMode, reason?, evaInspectionAddress? } }`. Function-key auth (`AuthLevel.FUNCTION`), patterned on `functions/evasentry/function_app.py`. | Gate-at-edge optional (the matcher is read-only + safe even when `AZURE_MAPS_ENABLED` is false — it just uses postcode.io). |
| `functions/addressmatch/infra/main.bicep` | Flex Consumption Function + Storage + App Insights; **system-assigned MI**; app settings `POSTCODE_IO_BASE`, `AZURE_MAPS_ENABLED`, and (only when Maps is enabled) an `AZURE_MAPS_KEY` **Key Vault reference**. Mirror `functions/evasentry/infra/main.bicep` security (no secret literals; KV refs; MI). | postcode.io needs **no** secret; the KV ref only appears when Maps is wired (§5). |
| `functions/addressmatch/openapi/addressmatch-connector.json` | OpenAPI 2.0, one op `MatchAddress` on `/address/match`, `x-functions-key` security, **no OAuth**. Mirror `functions/evasentry/openapi/evasentry-connector.json`. | Imported as `cr1bd_addressmatch`. |
| **Dataverse read** | The Function reads `cr1bd_repairer` + the N:N + `cr1bd_inspectionaddress` for the provider. Two options: **(a)** the **flow** does the Dataverse `ListRecords` and passes candidates into the matcher (keeps the Function Dataverse-free); **(b)** the Function calls the Dataverse Web API with its MI. **Recommend (a)** — the Function stays pure string/rank logic over candidates the flow supplies, matching how `evavalidation`/`status-evaluate` already split work. | (a) avoids giving the Function Dataverse RBAC; simplest + most testable. |

> **Recommendation:** build option **(a)** — the flow (`status-evaluate` or a small `address-resolve`
> child) lists the linked Repairers/known-sites and posts `{ loc, policy, candidates[] }`; `matching.py`
> ranks + recommends; the flow writes `InspectionAddress` + `Case.cr1bd_evainspectionaddress` /
> `cr1bd_inspectiondecision`. This keeps the Function a **pure ranker** (no Dataverse creds, fully unit
> testable) and puts the governed writes where the audit pattern already lives.

---

## 5. postcode.io now, Azure Maps later (the gate)

- **M1 (`AZURE_MAPS_ENABLED=false`):** normalisation/validation via **postcode.io** — `PostcodeIoClient`
  is already built and fail-soft. The match itself is a **corpus lookup**, so postcode.io is used only to
  **normalise** the chosen site's postcode and (optionally) to **label** a district via `/outcodes/{oc}`
  for the audit trail. **postcode.io being down never blocks a decision** (returns `None`, matcher
  proceeds with the corpus address as-is).
- **M3 (`AZURE_MAPS_ENABLED=true`):** swap the client seam for **Azure Maps Search — Get Geocoding**
  (`GET https://atlas.microsoft.com/geocode?api-version=2026-01-01&query=…`, subscription-key/Entra
  auth). Use Maps' `confidence` + `matchCodes` (`Good`/`Ambiguous`/`UpHierarchy`) to grade a match and to
  reverse-geocode/structure non-UK or free-text addresses postcode.io can't (Microsoft Learn:
  [Azure Maps Search](https://learn.microsoft.com/azure/azure-maps/how-to-search-for-address),
  [best practices](https://learn.microsoft.com/azure/azure-maps/how-to-use-best-practices-for-search#best-practices-for-forward-geocoding)).
  Cost ≈ **$5 per 1,000 geocodes** (integrations.md) — trivial at spike volume but a reason to stay on
  free postcode.io until reverse-geocoding/autocomplete/non-UK is actually needed. The Maps key is a
  **Key Vault reference** app setting (never a literal). **Only the client seam changes; `matching.py`
  and `district_matches` do not.**

---

## 6. Pipeline + Code App wiring

- **Pipeline:** after `case-resolve` (Case has a `workProviderId` + parsed `Loc`), an `address-resolve`
  step (in `status-evaluate` or a child flow) lists the provider's linked sites, calls `cr1bd_addressmatch
  / MatchAddress`, then **writes** the `InspectionAddress` row (`decisionMode`, `repairerId` or 6 ad-hoc
  lines, `postcode`), mirrors `Case.cr1bd_inspectiondecision`, and serialises `Case.cr1bd_evainspectionaddress`
  (EVA field 9). An `AuditEvent` records the decision; `inspection_override` (100000018) is written **only**
  when a path forces `image_based` (matching the existing audit taxonomy, `clarifying-info-ingestion.md`).
- **Code App (address gate):** `address-policy.ts` already decides per provider; the Code App surfaces the
  matcher's **candidate list** so the reviewer can **Confirm / Edit / Override-with-reason** (the
  `prefer_address` flow). The gate UI is unchanged in shape — it now has *real candidates* to offer
  instead of an empty list. **The "override-with-reason" path that yields `Image Based Assessment` is the
  only route to that literal** (ROADMAP §3e/§4a; `inspection-address.json` note).

---

## 7. Activation runbook

| # | Step | Tag |
|---|---|---|
| 1 | **Build** `matching.py` (ranker, §3) + `function_app.py` (HTTP, §4) + `tests/` (mock postcode.io with `respx`; assert `district_matches` ranking, 6-line serialize, image-based recommendation-without-literal). | [BUILD] |
| 2 | **Build** `infra/main.bicep` + `openapi/addressmatch-connector.json` (mirror evasentry). `az bicep build`; `node` JSON-parse the OpenAPI. | [BUILD] |
| 3 | **Seed the corpus** (prereq): run the Phase-1b incorporation + Input-1 known sites so linked Repairers/`InspectionAddress` exist (`dataverse-corpus-incorporation.md`, `clarifying-info-ingestion.md`). | [DEPLOY-WITH-LOGIN] |
| 4 | **Deploy** the Function; set `POSTCODE_IO_BASE` (default fine), `AZURE_MAPS_ENABLED=false`. | [DEPLOY-WITH-LOGIN] |
| 5 | **Import** the `cr1bd_addressmatch` connector; create its connection (function-key). | [DEPLOY-WITH-LOGIN] |
| 6 | **Wire** the `address-resolve` flow step + bind the connection; **turn on**. | [RESERVED-FOR-USER] |
| 7 | **Live-validate** on real Cases (next section). | [RESERVED-FOR-USER] |
| 8 | **(Later, M3)** flip `AZURE_MAPS_ENABLED=true`, add the Maps key KV ref, swap the client seam. | [RESERVED-FOR-USER] |

---

## 8. Verification

**Offline (Claude):**
- `cd functions/addressmatch && python -m pytest -q` — assert: `parse_postcode` full/part/none;
  `district_matches('CH5','CH5 2AB')==True`, `district_matches('B5','B50 1AA')==False` (the `startswith`
  edge `postcode.py` documents); `serialize_six_lines` yields **exactly five `\n`** (six lines), pads and
  folds overflow; `matching.py` ranks a confirmed `InspectionAddress` above a linked `Repairer` and an
  exact-outward above a `startswith`; an **image-based recommendation carries a reason and does NOT emit
  `IMAGE_BASED_LITERAL`**; postcode.io 404/500 → `None` → decision still returned.
- `az bicep build functions/addressmatch/infra/main.bicep` → no errors; no secret literals.
- `node -e "require('./functions/addressmatch/openapi/addressmatch-connector.json')"` → `swagger:2.0`,
  one path, `x-functions-key`, no OAuth.

**Live (operator; Claude read-only GETs):**
- Take a real **part-postcode** Case for a provider with a linked yard → matcher returns the yard;
  reviewer Confirms → `InspectionAddress(confirmed_physical, repairerId)`,
  `Case.cr1bd_evainspectionaddress` is the **6-line** address, `Case.cr1bd_inspectiondecision=confirmed_physical`.
  (Phase-1b worked example: confirming `M12 5FX` for QCL resolves its district-only Cases.)
- A Case whose `Loc` district has **no linked site** → matcher returns image-based recommendation; the
  gate forces **override-with-reason**; the literal is written **only** with `decisionMode=image_based` +
  reason + an `inspection_override` audit. **Never** an empty/silent "Image Based Assessment".
- `always_image_based` provider → matcher recommends image-based regardless of candidates (policy wins).
- Gate proof: with `AZURE_MAPS_ENABLED=false`, no `atlas.microsoft.com` call appears; postcode.io is the
  only normalisation hop, and a forced postcode.io outage still returns a decision.

---

## 9. Open questions / uncertainties

1. **`Loc` provenance + cleanliness.** The 57 % part-postcode figure comes from the corpus analysis
   (`loc_principal_analysis.md`); confirm the parser actually populates a Case field the matcher can read
   (`Case.cr1bd_*loc*` — verify the exact column; the data-model calls it the inspection `Loc`). If the
   parser leaves it on a note rather than a typed field, add a small extraction step.
2. **Multiple linked yards for one district.** When a provider has >1 linked Repairer in the same
   district, ranking falls to case-volume then alphabetical — confirm that tie-break with the operator
   (it may want "the storage yard, not the bodyshop"). Surface all candidates so the reviewer chooses.
3. **Option (a) vs (b) for the Dataverse read** (§4) — recommend (a) (flow lists candidates). If the
   candidate set is ever large, revisit (b) with the Function's MI + a `$filter` on the N:N.
4. **Azure Maps necessity.** Nothing in M1 needs Maps; keep it gated off. Only revisit if non-UK
   addresses, reverse-geocoding from photo EXIF (M3, `inspection-address.json` lifecycle note), or
   autocomplete is required.
5. **EXIF / photo-derived location (M3).** The schema's lifecycle note anticipates "EXIF + Azure Maps"
   as a future candidate source. Out of scope for §4a (which is corpus-district matching); flagged so the
   ranker's candidate-source enum leaves room for an `exif` source later.

---

## 10. Decision summary (one line)

**A thin Azure Function turns a Case's district-only `Loc` into a confirmed inspection address by
ranking the provider's linked, confirmed corpus yards via the `district startswith(outwardCode)` rule —
with the postcode parse, the rule, and the exact 6-line EVA serializer already built in
`functions/addressmatch/postcode.py`, and postcode.io (fail-soft, `AZURE_MAPS_ENABLED`-gated, Azure Maps
deferred to M3) already built in `postcode_client.py`; what remains is the `matching.py` ranker + the
HTTP/connector surface + pipeline wiring, with the policy gate (`address-policy.ts`) — not the matcher —
remaining the sole authority that can ever write 'Image Based Assessment', and only with a recorded
reason.**
