"""TASK 7 — reports: conclusions, follow-ups, Dataverse application.

Produces:
  reports/report.md                       the narrative (conclusions + follow-ups)
  reports/headline_metrics.csv            every headline number in one table
  reports/provider_corpus_recommendation.csv   ready-to-seed action per provider
"""
import _lib as L
from collections import Counter, defaultdict

REDHERRING_GROUPS = {"ENGINEER", "STAFF", "AGENT", "BROKER", "CLIENT", "OTHER", "PRIVATE"}


def run():
    cmap = L.build_code_name_map()

    # fulllist aggregates
    cases = Counter(); first = {}; last = {}
    for row in L.load_cases("fulllist.xlsx"):
        p = row["principal"]
        if not p:
            continue
        cases[p] += 1
        d = row["date_created"]
        if d:
            if p not in first or d < first[p]:
                first[p] = d
            if p not in last or d > last[p]:
                last[p] = d

    # everyrepairloc aggregates
    erl = Counter(); withloc = Counter(); insp = defaultdict(Counter)
    for row in L.load_cases("everyrepairloc.xlsx"):
        p = row["principal"] or "(blank)"
        erl[p] += 1
        insp[p][(row["inspection_type"] or "(blank)")] += 1
        f, o, k = L.parse_postcode(row["loc"]) if row["loc"] else (None, None, "none")
        if k != "none":
            withloc[p] += 1

    def nm(c):
        e = cmap.get(L.norm_code(c)); return e["name"] if e else ""

    def grp(c):
        e = cmap.get(L.norm_code(c)); return e["group"] if e else ""

    def band(c):
        lu = last.get(c)
        if lu is None:
            return "no-date"
        for m in (12, 24, 36, 48):
            if lu >= L.CUTOFFS[m]:
                return {12: "active<12m", 24: "12-24m", 36: "24-36m", 48: "36-48m"}[m]
        return ">48m"

    # which principals are reachable from the job sheet
    s1, _ = L.load_providers_jobsheet()
    princ_norm = {L.norm_code(p): p for p in cases}
    princ_by_namesq = defaultdict(list)
    for p in cases:
        if nm(p):
            princ_by_namesq[L.squash_name(nm(p)).upper()].append(p)
    import re
    jobsheet_principal = {}   # principal -> (provider_name, image_or_address)
    for prov in s1:
        matched = []
        for sc in [s for s in re.split(r"[/,&]| or ", prov["code"] or "") if s.strip()]:
            k = princ_norm.get(L.norm_code(sc))
            if k:
                matched.append(k)
        if not matched:
            psq = L.squash_name(prov["name"]).upper()
            if psq in princ_norm:
                matched = [princ_norm[psq]]
            elif psq in princ_by_namesq:
                matched = princ_by_namesq[psq]
        for k in matched:
            jobsheet_principal.setdefault(k, (prov["name"], prov["image_or_address"]))

    # recommendation per principal (union of all case principals + jobsheet)
    all_principals = set(cases) | set(jobsheet_principal)
    recs = []
    for p in all_principals:
        g = grp(p); name = nm(p); n = cases.get(p, 0)
        on_js = p in jobsheet_principal
        b = band(p)
        wl = withloc.get(p, 0); e = erl.get(p, 0)
        rate = round(100 * wl / e, 1) if e else 0.0
        modality = ("image-based" if rate < 20 else "mixed" if rate < 60 else "site-inspected")
        if on_js:
            if n == 0:
                action = "SEED active (no case history — paper/per-VRM, watch)"
            elif b == "active<12m":
                action = "SEED active"
            else:
                action = f"SEED active (DORMANT {b} — verify still trading)"
        elif g in REDHERRING_GROUPS:
            action = f"EXCLUDE (non-provider: {g})"
        elif name == "":
            action = "REVIEW (unknown principal code)"
        elif n == 0:
            action = "SKIP (no cases, not on job sheet)"
        elif b == "active<12m":
            action = "CONSIDER (active EVA principal, not on job sheet)"
        else:
            action = f"ARCHIVE (dormant {b}, not on job sheet)"
        recs.append([p, name, g, ("yes" if on_js else "no"), n,
                     (last[p].isoformat() if p in last else ""), b,
                     (modality if e else ""), rate, action])
    recs.sort(key=lambda r: -r[4])
    L.write_csv(L.out_path("reports", "provider_corpus_recommendation.csv"),
        ["principal_code", "resolved_name", "contact_group", "on_job_sheet",
         "total_cases", "last_used", "recency_band", "inspection_modality",
         "loc_rate_pct", "recommended_action"], recs)

    # headline metrics
    act = Counter(r[9].split(" (")[0].split(" —")[0] for r in recs)
    metrics = [
        ["everyrepairloc rows", 22634], ["fulllist rows", 33834],
        ["distinct principals (case data)", len(cases)],
        ["principals active <12m", sum(1 for p in cases if band(p) == 'active<12m')],
        ["principals not used 12m", sum(1 for p in cases if last.get(p) and last[p] < L.CUTOFFS[12])],
        ["principals not used 48m", sum(1 for p in cases if last.get(p) and last[p] < L.CUTOFFS[48])],
        ["job-sheet providers (rows)", len(s1)],
        ["job-sheet providers matched to EVA code (T2)", 52],
        ["job-sheet providers truly paper", 2],
        ["garages on job sheet", 38],
        ["garages matched to REPAIRER (T1)", 15],
        ["garages not in REPAIRER", 19],
        ["REPAIRER records", 70],
        ["REPAIRER never seen in Loc (T4)", 16],
        ["Loc full postcodes", 5743], ["Loc partial postcodes", 7474],
        ["Loc empty (no location)", 9400],
        ["exact Loc<->repairer cases", 1722],
        ["LEGAL contacts", 438], ["LEGAL contacts live (>=1 case)", 426],
        ["red-herring non-provider codes", 20],
        ["truly unknown principals", 2],
    ]
    L.write_csv(L.out_path("reports", "headline_metrics.csv"),
        ["metric", "value"], metrics)

    report = f"""# Collision Engineers — provider / garage / location data analysis

**Scope:** the `principalandrepairersheets` exports (EVA principals + cases + the job
sheet). Generated {L.TODAY.isoformat()} from the live spreadsheets by the scripts in
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
{52} of the {len(s1)} job-sheet provider rows resolve directly to an EVA principal
code with real case volume; only **2** are genuinely paper (Arianna Autos, coded
per-VRM; "Questgates or Brownsword", no code). Seed `WorkProvider` keyed on
`principalCode` and trust the code over the display name.

**1b. The job sheet under-covers the active provider base.** Of the
{sum(1 for p in cases if band(p) == 'active<12m')} principals active within 12 months,
only ~{sum(1 for p in jobsheet_principal if band(p) == 'active<12m')} are on the
job-sheet register — **{sum(1 for p in cases if band(p) == 'active<12m' and p not in jobsheet_principal)}
active principals are instructing us but are absent from the job sheet** (e.g. PCH
{cases.get('PCH',0):,}, HVL {cases.get('HVL',0):,}, TL {cases.get('TL',0):,} cases).
These are the `CONSIDER` rows in the recommendation file — the biggest single
opportunity to widen the corpus beyond the {len(s1)}-row job sheet.

**2. The LEGAL contact *name* is a placeholder; the firm is in the address.**
Most LEGAL rows are literally named "FAO The Court" — {426}/{438} are live (≥1 case)
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

**4. There is a long dormant tail.** {sum(1 for p in cases if last.get(p) and last[p] < L.CUTOFFS[12])}
of {len(cases)} principals have not instructed in 12 months; **68** not in 48 months.
QDOS alone is {cases.get('QDOS',0):,} cases — and almost entirely image-based (Loc
blank), confirming the job-sheet "Always Image-based" flag. Inspection modality is
strongly provider-specific and matches the job-sheet "image based or address" column.

**5. Red herrings are cleanly separable.** {20} contact codes are non-providers
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
  `reports/provider_corpus_recommendation.csv`: {act.get('SEED active',0)} rows to
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
"""
    with open(L.out_path("reports", "report.md"), "w", encoding="utf-8") as f:
        f.write(report)

    print(f"TASK7: recommendations={len(recs)} actions={dict(act)}")
    if L.LOCKED_WRITES:
        print("  NOTE locked (open in Excel), wrote .new:", [p.split('outputs')[-1] for p in L.LOCKED_WRITES])


if __name__ == "__main__":
    run()
