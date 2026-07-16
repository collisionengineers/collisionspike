"""TASK 5 — per-principal Loc postcode profiles.

For each principal code, from everyrepairloc.xlsx (authoritative Loc), build:
  * confirmed FULL postcodes appearing MORE THAN ONCE, with exact counts
  * confirmed FULL postcodes appearing exactly ONCE
  * PARTIAL postcodes (district only), with counts

Rather than hundreds of per-principal files, results are tall tables keyed by
principal_code (filter by principal in a spreadsheet). A per-principal summary
gives the headline shape.

Outputs (outputs/task5_principal_postcode_profiles/):
  full_postcodes_repeated.csv   principal, postcode, count   (count >= 2)
  full_postcodes_once.csv       principal, postcode          (count == 1)
  partial_postcodes.csv         principal, district, count
  per_principal_summary.csv     principal, distinct/total tallies, top location
  README.md
"""
import _lib as L
from collections import defaultdict, Counter


def run():
    cmap = L.build_code_name_map()
    full = defaultdict(Counter)     # principal -> Counter(full_pc)
    partial = defaultdict(Counter)  # principal -> Counter(outward)

    for row in L.load_cases("everyrepairloc.xlsx"):
        p = row["principal"] or "(blank)"
        loc = row["loc"]
        if not loc:
            continue
        f, o, kind = L.parse_postcode(loc)
        if kind == "full":
            full[p][f] += 1
        elif kind == "partial":
            partial[p][o] += 1

    def nm(code):
        e = cmap.get(L.norm_code(code))
        return e["name"] if e else ""

    principals = sorted(set(full) | set(partial))

    rep_rows, once_rows, part_rows, summ_rows = [], [], [], []
    for p in principals:
        fc = full[p]
        pc = partial[p]
        repeated = sorted([(k, v) for k, v in fc.items() if v >= 2], key=lambda x: -x[1])
        once = sorted([k for k, v in fc.items() if v == 1])
        parts = sorted(pc.items(), key=lambda x: -x[1])
        for k, v in repeated:
            rep_rows.append([p, nm(p), k, v])
        for k in once:
            once_rows.append([p, nm(p), k])
        for k, v in parts:
            part_rows.append([p, nm(p), k, v])
        top_full = repeated[0] if repeated else (once[0], 1) if once else ("", 0)
        top_part = parts[0] if parts else ("", 0)
        summ_rows.append([
            p, nm(p),
            len(fc), sum(fc.values()), len(repeated), len(once),
            len(pc), sum(pc.values()),
            (f"{top_full[0]}({top_full[1]})" if top_full[0] else ""),
            (f"{top_part[0]}({top_part[1]})" if top_part[0] else ""),
        ])

    d5 = "task5_principal_postcode_profiles"
    L.write_csv(L.out_path(d5, "full_postcodes_repeated.csv"),
        ["principal_code", "resolved_name", "full_postcode", "count"], rep_rows)
    L.write_csv(L.out_path(d5, "full_postcodes_once.csv"),
        ["principal_code", "resolved_name", "full_postcode"], once_rows)
    L.write_csv(L.out_path(d5, "partial_postcodes.csv"),
        ["principal_code", "resolved_name", "partial_district", "count"], part_rows)
    summ_rows.sort(key=lambda r: -r[3])  # by total full-postcode cases
    L.write_csv(L.out_path(d5, "per_principal_summary.csv"),
        ["principal_code", "resolved_name", "distinct_full_pc", "total_full_cases",
         "full_pc_repeated", "full_pc_once", "distinct_partial_districts",
         "total_partial_cases", "top_full_postcode", "top_partial_district"], summ_rows)

    readme = f"""# Task 5 — per-principal Loc postcode profiles

For every principal, the **inspection-location footprint** drawn from
`everyrepairloc.xlsx` (authoritative Loc). Three views, each a tall table keyed by
`principal_code` (filter by principal in your spreadsheet):

| File | Contents |
|---|---|
| `full_postcodes_repeated.csv` | confirmed **full** postcodes a principal used **>1×**, with exact counts |
| `full_postcodes_once.csv` | confirmed **full** postcodes a principal used exactly **once** |
| `partial_postcodes.csv` | **partial** (district-only) Loc values, with counts |
| `per_principal_summary.csv` | one row per principal: distinct/total tallies + top location |

## Scale
- Principals with at least one Loc postcode: **{len(principals)}**
- Repeated full-postcode rows: **{len(rep_rows)}**
- Single-occurrence full-postcode rows: **{len(once_rows)}**
- Partial-district rows: **{len(part_rows)}**

A *full* postcode is a complete unit (e.g. `OL1 3QR`); a *partial* is a district/
outward code only (e.g. `CH5`). Repeated full postcodes are the strongest signal of
a principal's habitual inspection sites (recovery yards, regular bodyshops); the
single-occurrence list is the long tail of one-off claimant/residential addresses.
"""
    with open(L.out_path(d5, "README.md"), "w", encoding="utf-8") as f:
        f.write(readme)

    print(f"TASK5: principals_with_loc={len(principals)} repeated_rows={len(rep_rows)} "
          f"once_rows={len(once_rows)} partial_rows={len(part_rows)}")
    print("  top principals by total full-pc cases:")
    for r in summ_rows[:10]:
        print(f"    {r[0][:10]:10} {(r[1][:22] or ''):22} distinctFull={r[2]:3} "
              f"repeated={r[4]:3} once={r[5]:4} topFull={r[8]}")


if __name__ == "__main__":
    run()
