"""TASK 3 — principals that have NOT used us within the last 12/24/36/48 months.

Source of truth for recency: fulllist.xlsx (the near-complete EVA case list,
33,834 rows), grouped by the Principal code. "Last used us" = the most recent
`Date Created`. Bands are computed against TODAY = 2026-06-18 (pinned).

The CSV's "date last used us" column is 0% populated, so case data is the only
recency signal available — fulllist is the right (most complete) source.

Outputs (outputs/task3_principal_recency/):
  not_used_12_months.csv  last use before 2025-06-18
  not_used_24_months.csv  last use before 2024-06-18
  not_used_36_months.csv  last use before 2023-06-18
  not_used_48_months.csv  last use before 2022-06-18   (each list is cumulative)
  all_principals_recency.csv   master: every principal + band + metrics
  README.md
"""
import _lib as L


def run():
    cmap = L.build_code_name_map()
    agg = {}  # code -> {first,last,count,nodate}
    skipped_nodate = 0
    for row in L.load_cases("fulllist.xlsx"):
        code = row["principal"]
        if not code:
            continue
        d = row["date_created"]
        a = agg.setdefault(code, {"first": None, "last": None, "count": 0, "nodate": 0})
        a["count"] += 1
        if d is None:
            a["nodate"] += 1
            skipped_nodate += 1
            continue
        if a["first"] is None or d < a["first"]:
            a["first"] = d
        if a["last"] is None or d > a["last"]:
            a["last"] = d

    def info(code):
        ent = cmap.get(L.norm_code(code))
        return (ent["name"] if ent else ""), (ent["group"] if ent else "")

    def band(last):
        if last is None:
            return "no-dated-cases"
        if last >= L.CUTOFFS[12]:
            return "active (<12m)"
        if last >= L.CUTOFFS[24]:
            return "dormant 12-24m"
        if last >= L.CUTOFFS[36]:
            return "dormant 24-36m"
        if last >= L.CUTOFFS[48]:
            return "dormant 36-48m"
        return "dormant >48m"

    rows = []
    for code, a in agg.items():
        name, group = info(code)
        last, first = a["last"], a["first"]
        days = (L.TODAY - last).days if last else ""
        rows.append({
            "code": code, "name": name, "group": group,
            "last": last, "first": first, "count": a["count"],
            "days": days, "band": band(last),
        })
    rows.sort(key=lambda r: (r["last"] or L.date(1900, 1, 1), -r["count"]))

    # master
    L.write_csv(L.out_path("task3_principal_recency", "all_principals_recency.csv"),
        ["principal_code", "resolved_name", "contact_group", "band",
         "last_used", "first_used", "total_cases", "days_since_last_use"],
        [[r["code"], r["name"], r["group"], r["band"],
          (r["last"].isoformat() if r["last"] else ""),
          (r["first"].isoformat() if r["first"] else ""),
          r["count"], r["days"]] for r in rows])

    # the four cumulative dormancy lists
    counts = {}
    for months in (12, 24, 36, 48):
        cut = L.CUTOFFS[months]
        sub = [r for r in rows if r["last"] is not None and r["last"] < cut]
        counts[months] = len(sub)
        L.write_csv(L.out_path("task3_principal_recency", f"not_used_{months}_months.csv"),
            ["principal_code", "resolved_name", "contact_group", "last_used",
             "first_used", "total_cases", "days_since_last_use"],
            [[r["code"], r["name"], r["group"], r["last"].isoformat(),
              r["first"].isoformat() if r["first"] else "", r["count"], r["days"]]
             for r in sub])

    active = sum(1 for r in rows if r["band"].startswith("active"))
    nodate = sum(1 for r in rows if r["last"] is None)

    readme = f"""# Task 3 — principal recency (dormancy bands)

**Question:** which principals have not instructed us within the last
12 / 24 / 36 / 48 months?

## Method
- **Source:** `fulllist.xlsx` (near-complete EVA case list, the most complete
  recency signal — the CSV "date last used us" column is 100% empty).
- Grouped by `Principal`; **last used = max(Date Created)**, first used =
  min(Date Created), with a per-principal case count.
- **Pinned TODAY = 2026-06-18.** Cutoffs: 12m→2025-06-18, 24m→2024-06-18,
  36m→2023-06-18, 48m→2022-06-18. Each list is **cumulative** ("not used since
  the cutoff"), so the 48-month list ⊆ 36 ⊆ 24 ⊆ 12.

## Results — {len(rows)} distinct principals in the case data
| Band | Principals |
|---|---|
| active (used within 12m) | {active} |
| **not used in last 12m** | **{counts[12]}** |
| not used in last 24m | {counts[24]} |
| not used in last 36m | {counts[36]} |
| not used in last 48m | {counts[48]} |
| principals with no dated cases | {nodate} |

`all_principals_recency.csv` is the master (every principal, its band and
metrics). Names/groups are resolved from the EVA contact + job-sheet sources;
a blank name = a principal code with no contact record (see Task 6 red-herring
analysis). `contact_group` of ENGINEER/STAFF flags an internal code that is
**not** a real work provider.
"""
    with open(L.out_path("task3_principal_recency", "README.md"), "w", encoding="utf-8") as f:
        f.write(readme)

    print(f"TASK3: principals={len(rows)} active<12m={active} "
          f"not12={counts[12]} not24={counts[24]} not36={counts[36]} not48={counts[48]} "
          f"nodate={nodate} (skipped_nodate_rows={skipped_nodate})")
    print("  most-dormant 12 (sample):")
    for r in [x for x in rows if x['last'] and x['last'] < L.CUTOFFS[12]][:12]:
        print(f"    {r['code'][:12]:12} {(r['name'][:26] or '(no contact)'):26} "
              f"last={r['last']} cases={r['count']} {r['band']}")


if __name__ == "__main__":
    run()
