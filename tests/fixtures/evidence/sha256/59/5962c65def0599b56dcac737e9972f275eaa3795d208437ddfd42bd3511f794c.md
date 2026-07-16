# Collision Engineers — provider / garage / location data analysis

**Scope:** the `principalandrepairersheets` exports (EVA principals + cases + the job
sheet). Generated 2026-06-18 from the live spreadsheets by the scripts in
`outputs/_scripts/`. All numbers are reproducible (`python outputs/_scripts/run_all.py`).

## Source inventory
| File | Rows | Role |
|---|---|---|
| `fulllist.xlsx` | 33,834 | near-complete EVA case list — used for **recency** (Loc not authoritative) |
| `everyrepairloc.xlsx` | 22,634 | EVA cases with **authoritative Loc** — used for inspection-location analysis |
| `REPAIRER.xls` | 70 | EVA REPAIRER contacts (bodyshops / storage yards) |
| `legal.xls` | 438 | EVA LEGAL contacts (solicitor work providers) |
| `contactseva_combined.csv` | 528 | combined EVA contacts (all groups, has postcode) |
| `providersJOBSHEET.xlsx` | 58 (50 distinct) | the job sheet's work-provider register |
| `garagesJOBSHEET.xlsx` | 38 | the job sheet's garage register |
| `aALL/agent/broker/client/other/private.xls` | — | EVA contacts by group (red-herring screening) |

## Conclusions

**1. The EVA principal *code* is the reliable join key — not the name.**
52 of the 58 job-sheet provider rows resolve directly to an EVA principal
code with real case volume; only **2** are genuinely paper (Arianna Autos, coded
per-VRM; "Questgates or Brownsword", no code). Seed `WorkProvider` keyed on
`principalCode` and trust the code over the display name.

**1b. The job sheet under-covers the active provider base.** Of the
176 principals active within 12 months,
only ~39 are on the
job-sheet register — **137
active principals are instructing us but are absent from the job sheet** (e.g. PCH
1,725, HVL 422, TL 263 cases).
These are the `CONSIDER` rows in the recommendation file — the biggest single
opportunity to widen the corpus beyond the 58-row job sheet.

**2. The LEGAL contact *name* is a placeholder; the firm is in the address.**
Most LEGAL rows are literally named "FAO The Court" — 426/438 are live (≥1 case)
but their real firm name only appears in the address (`C/O Zenith Lawyers …`). The
analysis derives the firm from the address; the importer must do the same or the
corpus will be full of "FAO The Court".

**3. Where the work physically happens ≠ the REPAIRER list.** The REPAIRER contacts
are Scotland-heavy (G/KA/ML/EH/PA), but the actual inspection Locs are England-heavy
— **CH 2,377 · B 2,326 · M 1,518 · OL 943 · LU 880 · RH 602**. Only ~30 % of full
Locs match a listed repairer; **16** REPAIRER records never appear in any Loc. The
true high-volume inspection sites are **storage/recovery yards** — Shaun Marnell
(CH46 4TP, 867 cases), Accident Specialists (RH10 9NT), Somstar (B5 6JX), HS Recovery
(M12 5FX) — and these exact postcodes are **named in the job-sheet image-source
notes** (e.g. QCL → "HS Recovery … M12 5FX"; FW → "Somstar … B5 6JX"). Two
independent sources agree on the yards: that is the spine of the ImageSource/Repairer
corpus.

**4. There is a long dormant tail.** 264
of 440 principals have not instructed in 12 months; **68** not in 48 months.
QDOS alone is 13,031 cases — and almost entirely image-based (Loc
blank), confirming the job-sheet "Always Image-based" flag. Inspection modality is
strongly provider-specific and matches the job-sheet "image based or address" column.

**5. Red herrings are cleanly separable.** 20 contact codes are non-providers
(engineer/staff/agent/broker/client/other/private) and **2** principals are truly
unknown (DEMO test data, DEE). None should enter `WorkProvider`.

**6. Job-sheet hygiene.** 9 duplicate provider lines (Knightsbridge ×4, RJS ×3,
QCL/KMR/Graham Coffey ×2), trailing-space codes, and slash-codes that are actually
two principals (R1AM/MOTORX = 89 + 30 cases). Dedup on import.

## Follow-ups (recommended)
1. **Reconcile code drift:** `ZEN` (job sheet) vs `ZENITH` (EVA principal, 6 cases);
   confirm and standardise. Split `R1AM/MOTORX` into two providers.
2. **Mine the job-sheet image-source notes** — they name storage yards + postcodes in
   free text. Parsing them yields the **provider→yard (ImageSource) links** that the
   garages sheet lacks (the long-standing garage↔provider gap). This is the single
   highest-value next step for the corpus.
3. **Add the 19 unmatched garages and the high-volume storage yards** (top
   inspection locations) to `Repairer`/`ImageSource`.
4. **Decide routing for the 2 paper providers** (Arianna per-VRM; Questgates).
5. **Archive** the 12 dead LEGAL contacts and the 68 >48-month-dormant principals
   (set `active=false`), so the matcher only considers live providers.
6. **Address-matching service must accept outward-only postcodes** — 57 % of located
   cases (7,474 / 13,217) carry a district only; pre-load each principal's repeated
   full postcodes (Task 5) as known sites, and chase claimants for full postcodes.

## How this applies to the Dataverse build
- **`WorkProvider`** — refresh keyed on `principalCode` from
  `reports/provider_corpus_recommendation.csv`: 48 rows to
  seed active, the rest to archive/exclude per the `recommended_action` column.
  Derive `name` from address for placeholders; set `active` from the recency band;
  carry the inspection modality into `imagesSourceNotes` / inspection policy.
- **`Repairer` / `ImageSource`** — prioritise the **top inspection-location yards**
  (`claudeschoice/top_inspection_locations.csv`) over the Scottish bodyshop list;
  build provider→yard links from the mined image-source notes (follow-up 2).
- **Address-matching service** — seed known sites from Task 5 (repeated full
  postcodes per principal); handle partial Locs; catchment = CH/B/M/OL/LU/RH areas
  (`claudeschoice/postcode_area_geography.csv`).
- **Chaser / inspection policy** — drive per-provider expectation from
  `claudeschoice/principal_loc_rate.csv` + `inspection_type_by_principal.csv`, and
  reconcile against the job-sheet "image based or address" column.

## Where to look
`provider_corpus_recommendation.csv` is the actionable output — one row per principal
with a `recommended_action`. `headline_metrics.csv` has every number above. Each task
folder has its own README with method + caveats.
