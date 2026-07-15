"""TASK 8 (follow-up) — Loc (inspection location) vs Principal.

Loc = where the vehicle is inspected; we want it complete wherever possible.
Source: everyrepairloc.xlsx (authoritative Loc).

Q1. Which principals have a PART postcode (district only) in Loc, ordered by the
    frequency of the part loc postcode? -> the incomplete locations to resolve to
    full addresses; highest-frequency first = biggest win.

Q2. For any full or part location, which ones are used by MULTIPLE principals?
    -> shared inspection sites (storage yards / image hubs); a location alone does
    not identify the principal. Shown at exact-token level AND district level.

Writes a document + supporting CSVs into outputs/reports/.
"""
import _lib as L
from collections import defaultdict, Counter
import re

AREA = re.compile(r"^[A-Z]{1,2}")


def run():
    cmap = L.build_code_name_map()

    def nm(c):
        e = cmap.get(L.norm_code(c))
        return re.sub(r"\s+", " ", e["name"]).strip() if e else ""

    part_by_pp = Counter()             # (principal, district) -> count   (PART only)
    part_principal_tot = Counter()     # principal -> part cases
    full_principal_tot = Counter()     # principal -> full cases
    loc_token_principals = defaultdict(Counter)   # ("full"/"part", token) -> Counter(principal)
    district_principals = defaultdict(Counter)    # outward district -> Counter(principal)  (full+part merged)
    district_full_part = defaultdict(lambda: [0, 0])  # district -> [full_cases, part_cases]

    rows = 0
    for row in L.load_cases("everyrepairloc.xlsx"):
        loc = row["loc"]
        if not loc:
            continue
        p = row["principal"] or "(blank)"
        f, o, kind = L.parse_postcode(loc)
        if kind == "none":
            continue
        rows += 1
        if kind == "full":
            full_principal_tot[p] += 1
            loc_token_principals[("full", f)][p] += 1
            district_principals[o][p] += 1
            district_full_part[o][0] += 1
        else:  # partial
            part_by_pp[(p, o)] += 1
            part_principal_tot[p] += 1
            loc_token_principals[("part", o)][p] += 1
            district_principals[o][p] += 1
            district_full_part[o][1] += 1

    # ---------- Q1 outputs ----------
    # full (principal, district, count) ordered by count desc (freq of the part postcode)
    q1_rows = sorted(part_by_pp.items(), key=lambda kv: (-kv[1], kv[0][0], kv[0][1]))
    L.write_csv(L.out_path("reports", "loc_part_postcodes_by_principal.csv"),
        ["principal_code", "resolved_name", "part_district", "part_case_count"],
        [[p, nm(p), d, c] for (p, d), c in q1_rows])

    # per-principal rollup
    roll = []
    for p in sorted(set(part_principal_tot) | set(full_principal_tot),
                    key=lambda x: -part_principal_tot.get(x, 0)):
        part = part_principal_tot.get(p, 0)
        full = full_principal_tot.get(p, 0)
        tot = part + full
        if part == 0:
            continue
        # this principal's distinct districts + top district
        dists = [(d, c) for (pp, d), c in part_by_pp.items() if pp == p]
        dists.sort(key=lambda x: -x[1])
        roll.append([p, nm(p), part, full, tot,
                     round(100 * part / tot, 1) if tot else 0,
                     len(dists), (f"{dists[0][0]}({dists[0][1]})" if dists else "")])
    L.write_csv(L.out_path("reports", "loc_part_postcodes_by_principal_rollup.csv"),
        ["principal_code", "resolved_name", "part_cases", "full_cases", "total_loc_cases",
         "part_pct", "distinct_part_districts", "top_part_district"], roll)

    # ---------- Q2 outputs ----------
    def breakdown(counter, cap=None):
        items = counter.most_common()
        shown = items if cap is None else items[:cap]
        s = "; ".join(f"{nm(p) or p}:{c}" for p, c in shown)
        if cap and len(items) > cap:
            s += f"; (+{len(items) - cap} more)"
        return s

    # exact-token multi-principal (full postcodes and part districts that >1 principal uses)
    q2_exact = []
    for (typ, token), counter in loc_token_principals.items():
        if len(counter) > 1:
            q2_exact.append([token, typ, len(counter), sum(counter.values()),
                             breakdown(counter)])
    q2_exact.sort(key=lambda r: (-r[2], -r[3]))
    L.write_csv(L.out_path("reports", "loc_locations_multi_principal.csv"),
        ["location", "type", "distinct_principals", "total_cases",
         "principal_breakdown"], q2_exact)

    # district-level multi-principal (full+part merged by outward)
    q2_dist = []
    for d, counter in district_principals.items():
        if len(counter) > 1:
            fp = district_full_part[d]
            q2_dist.append([d, len(counter), sum(counter.values()), fp[0], fp[1],
                            breakdown(counter)])
    q2_dist.sort(key=lambda r: (-r[1], -r[2]))
    L.write_csv(L.out_path("reports", "loc_districts_multi_principal.csv"),
        ["district", "distinct_principals", "total_cases", "full_loc_cases",
         "part_loc_cases", "principal_breakdown"], q2_dist)

    # ---------- the document ----------
    total_part = sum(part_principal_tot.values())
    total_full = sum(full_principal_tot.values())
    n_principals_with_part = len(part_principal_tot)
    n_distinct_part_districts = len(set(d for (_, d) in part_by_pp))

    def md_table(header, rows):
        out = ["| " + " | ".join(header) + " |",
               "|" + "|".join("---" for _ in header) + "|"]
        for r in rows:
            out.append("| " + " | ".join(
                re.sub(r"\s+", " ", str(x)).replace("|", "/") for x in r) + " |")
        return "\n".join(out)

    q1a = md_table(["#", "Part district", "Principal", "Name", "Cases"],
                   [[i + 1, d, p, (nm(p)[:28] or ""), c]
                    for i, ((p, d), c) in enumerate(q1_rows[:25])])
    q1b = md_table(["#", "Principal", "Name", "Part cases", "Full cases", "% part", "Top district"],
                   [[i + 1, r[0], (r[1][:26] or ""), r[2], r[3], r[5], r[7]]
                    for i, r in enumerate(roll[:25])])
    q2a = md_table(["#", "Location", "Type", "#Principals", "Cases", "Principals (top)"],
                   [[i + 1, r[0], r[1], r[2], r[3], breakdown(loc_token_principals[(r[1], r[0])], cap=6)]
                    for i, r in enumerate(q2_exact[:25])])
    q2b = md_table(["#", "District", "#Principals", "Cases", "full/part", "Principals (top)"],
                   [[i + 1, r[0], r[1], r[2], f"{r[3]}/{r[4]}",
                     breakdown(district_principals[r[0]], cap=6)]
                    for i, r in enumerate(q2_dist[:25])])

    doc = f"""# Inspection-location (Loc) vs Principal

**Loc = where the vehicle is being inspected** — we want it complete wherever
possible. This document answers two questions from `everyrepairloc.xlsx` (the
authoritative-Loc export). Generated {L.TODAY.isoformat()}; reproducible via
`python outputs/_scripts/task8_loc_principals.py`.

Of the located cases: **{total_full:,} carry a full postcode** and **{total_part:,}
carry only a part postcode** (district/outward code). Partial = an incomplete
inspection location we would want to resolve to a full address.

---

## Q1 — Principals with a PART postcode in Loc (by frequency)

{n_principals_with_part} principals have at least one part-only Loc, spread over
{n_distinct_part_districts} distinct districts and {total_part:,} cases. Resolving the
**highest-frequency** part postcodes to full addresses gives the biggest coverage win.

### A. By part-postcode frequency — every `(principal, district)` ranked by count
Full data: **`loc_part_postcodes_by_principal.csv`**. Top 25:

{q1a}

### B. By principal — who has the most incomplete locations
Full data: **`loc_part_postcodes_by_principal_rollup.csv`** (with each principal's
full-vs-part split). Top 25 by part-case volume:

{q1b}

> How to use: take the top rows of table A, map each `(principal, district)` to the
> real full address you know, and feed those back as known sites — they will convert
> the largest blocks of district-only cases to full locations first.

---

## Q2 — Locations used by MULTIPLE principals

A location used by several principals is a **shared site** — almost always a storage/
recovery yard or an image-sourcing hub — which is exactly why the location alone can't
identify the work provider. Two views.

### A. Exact location (full postcode or part district) shared by >1 principal
Full data: **`loc_locations_multi_principal.csv`**. Top 25 by number of principals:

{q2a}

### B. District-level overlap (full + part merged by outward code)
Full data: **`loc_districts_multi_principal.csv`**. Top 25 by number of principals:

{q2b}

> Reading it: the multi-principal full postcodes (e.g. storage yards) are the sites to
> register once in `Repairer`/`ImageSource` and link to all the principals that use
> them. The district view shows the broader catchment overlap (useful for the
> address-matching service and for spotting yards that appear as both full and part).

---

### Method & caveats
- Loc parsed with the shared UK-postcode parser: **full** = complete unit
  (`OL1 3QR`); **part** = outward district only (`CH5`). Non-postcode Loc text and
  empty Loc are excluded.
- Counts are case occurrences in `everyrepairloc.xlsx`. Principal names are resolved
  from the EVA contact/job-sheet sources (firm derived from address where the EVA
  name is the "FAO The Court" placeholder).
- A shared *full postcode* is a genuine single site; a shared *district* may span
  several nearby addresses — treat the district view as catchment, not one building.
"""
    with open(L.out_path("reports", "loc_principal_analysis.md"), "w", encoding="utf-8") as f:
        f.write(doc)

    print(f"TASK8: located_cases full={total_full} part={total_part}")
    print(f"  Q1: principals_with_part={n_principals_with_part} distinct_part_districts={n_distinct_part_districts} "
          f"(rows={len(q1_rows)})")
    print(f"  Q2: multi-principal exact_locations={len(q2_exact)} multi-principal_districts={len(q2_dist)}")
    print("  Q1 top (part district, principal, count):")
    for (p, d), c in q1_rows[:8]:
        print(f"    {d:8} {p:10} {(nm(p)[:24] or ''):24} {c}")
    print("  Q2 top shared exact locations:")
    for r in q2_exact[:8]:
        print(f"    {r[0]:10} {r[1]:4} #princ={r[2]:3} cases={r[3]:4}  {r[4][:60]}")
    if L.LOCKED_WRITES:
        print("  NOTE locked (open in Excel) -> wrote .new:", [p.split('outputs')[-1] for p in L.LOCKED_WRITES])


if __name__ == "__main__":
    run()
