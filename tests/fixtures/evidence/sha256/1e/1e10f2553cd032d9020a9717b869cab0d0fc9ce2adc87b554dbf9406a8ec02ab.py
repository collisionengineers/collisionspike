"""TASK 4 — everyrepairloc Loc postcodes vs REPAIRER.xls.

everyrepairloc.xlsx is the authoritative inspection-location export: any row whose
Loc carries a postcode (full or partial) DID have an inspection location. We match
those Loc postcodes against the 67 REPAIRER records that carry a postcode.

NOTE (limitation, stated up front): a postcode identifies a *place*, not a firm.
Where two repairers share a postcode (duplicate records / same trading estate),
both are credited for the same Loc hits. Duplicates are flagged in the output.

Outputs (outputs/task4_everyrepairloc_vs_repairer/):
  exact_matches_by_repairer.csv   full Loc postcode == repairer postcode, +count/first/last
  exact_matches_detail.csv        one row per matching case
  potential_matches.csv           Loc is a PART postcode whose district == a repairer's
  repairers_not_seen_12_months.csv .. _48_months.csv  (by exact appearance)
  loc_quality_summary.csv         full / partial / junk / empty breakdown of Loc
  README.md
"""
import _lib as L
from collections import defaultdict


def run():
    repairers = [r for r in L.load_repairer()]
    # indexes
    full_idx = defaultdict(list)     # full pc -> [repairer,...]
    out_idx = defaultdict(list)      # outward -> [repairer,...] (only those whose pc is FULL? use outward of any)
    for r in repairers:
        if r["full_pc"]:
            full_idx[r["full_pc"]].append(r)
        if r["outward"]:
            out_idx[r["outward"]].append(r)

    # duplicate full postcodes among repairers (same place, >1 record)
    dup_full = {pc: [x["code"] for x in v] for pc, v in full_idx.items() if len(v) > 1}

    # per-repairer exact appearance stats
    exact_stat = {r["code"]: {"rep": r, "count": 0, "first": None, "last": None}
                  for r in repairers}
    # per (repairer, outward) partial stats
    partial_stat = defaultdict(lambda: {"count": 0, "first": None, "last": None})

    detail = []
    locq = {"full": 0, "partial": 0, "junk": 0, "empty": 0}
    n_exact_cases = 0
    n_partial_cases = 0

    for row in L.load_cases("everyrepairloc.xlsx"):
        loc = row["loc"]
        if not loc:
            locq["empty"] += 1
            continue
        full, out, kind = L.parse_postcode(loc)
        if kind == "none":
            locq["junk"] += 1
            continue
        d = row["date_created"]
        if kind == "full":
            locq["full"] += 1
            hits = full_idx.get(full, [])
            if hits:
                n_exact_cases += 1
                for r in hits:
                    s = exact_stat[r["code"]]
                    s["count"] += 1
                    if d:
                        if s["first"] is None or d < s["first"]:
                            s["first"] = d
                        if s["last"] is None or d > s["last"]:
                            s["last"] = d
                    detail.append([r["code"], r["name"], full, row["principal"],
                                   (d.isoformat() if d else ""), row["registration"],
                                   row["reference"], row["inspection_type"]])
        else:  # partial
            locq["partial"] += 1
            hits = out_idx.get(out, [])
            if hits:
                n_partial_cases += 1
                for r in hits:
                    key = (r["code"], out)
                    s = partial_stat[key]
                    s["count"] += 1
                    if d:
                        if s["first"] is None or d < s["first"]:
                            s["first"] = d
                        if s["last"] is None or d > s["last"]:
                            s["last"] = d

    d4 = "task4_everyrepairloc_vs_repairer"

    # exact by repairer (only those with >=1 hit), sorted by count desc
    exact_rows = sorted([s for s in exact_stat.values() if s["count"] > 0],
                        key=lambda s: -s["count"])
    L.write_csv(L.out_path(d4, "exact_matches_by_repairer.csv"),
        ["repairer_code", "repairer_name", "repairer_postcode", "exact_case_count",
         "first_seen", "last_seen", "shares_postcode_with"],
        [[s["rep"]["code"], s["rep"]["name"], s["rep"]["full_pc"], s["count"],
          (s["first"].isoformat() if s["first"] else ""),
          (s["last"].isoformat() if s["last"] else ""),
          ",".join(c for c in dup_full.get(s["rep"]["full_pc"], []) if c != s["rep"]["code"])]
         for s in exact_rows])

    L.write_csv(L.out_path(d4, "exact_matches_detail.csv"),
        ["repairer_code", "repairer_name", "postcode", "principal", "date_created",
         "registration", "reference", "inspection_type"], detail)

    # partial / potential
    prows = []
    for (code, out), s in sorted(partial_stat.items(), key=lambda kv: -kv[1]["count"]):
        rep = exact_stat[code]["rep"]
        prows.append([code, rep["name"], rep["full_pc"] or rep["outward"], out, s["count"],
                      (s["first"].isoformat() if s["first"] else ""),
                      (s["last"].isoformat() if s["last"] else ""),
                      ",".join(x["code"] for x in out_idx[out] if x["code"] != code)])
    L.write_csv(L.out_path(d4, "potential_matches.csv"),
        ["repairer_code", "repairer_name", "repairer_postcode", "loc_part_district",
         "partial_case_count", "first_seen", "last_seen", "other_repairers_same_district"],
        prows)

    # not-seen lists (by exact appearance). never-seen => last=None => in every list.
    counts = {}
    for months in (12, 24, 36, 48):
        cut = L.CUTOFFS[months]
        sub = []
        for r in repairers:
            s = exact_stat[r["code"]]
            last = s["last"]
            if last is None or last < cut:
                sub.append((r, s))
        # sort: never-seen first, then oldest
        sub.sort(key=lambda rs: (rs[1]["last"] or L.date(1900, 1, 1)))
        counts[months] = len(sub)
        L.write_csv(L.out_path(d4, f"repairers_not_seen_{months}_months.csv"),
            ["repairer_code", "repairer_name", "repairer_postcode",
             "last_seen", "exact_case_count", "status"],
            [[r["code"], r["name"], r["full_pc"] or r["outward"] or "",
              (s["last"].isoformat() if s["last"] else ""), s["count"],
              ("NEVER appeared" if s["last"] is None else "dormant")]
             for r, s in sub])

    L.write_csv(L.out_path(d4, "loc_quality_summary.csv"),
        ["loc_class", "case_count"],
        [["full_postcode", locq["full"]], ["partial_postcode", locq["partial"]],
         ["non_postcode_text", locq["junk"]], ["empty (no location)", locq["empty"]]])

    seen_any = sum(1 for s in exact_stat.values() if s["count"] > 0)
    never = sum(1 for s in exact_stat.values() if s["count"] == 0)
    total_loc = locq["full"] + locq["partial"] + locq["junk"]

    readme = f"""# Task 4 — everyrepairloc Loc postcodes vs REPAIRER

**Question:** how do the inspection-location postcodes in `everyrepairloc.xlsx`
(authoritative Loc) line up with the {len(repairers)} REPAIRER records
({sum(1 for r in repairers if r['full_pc'])} have a full postcode)?

## Loc quality (22,634 rows)
| Loc class | Cases |
|---|---|
| full postcode | {locq['full']} |
| partial postcode (district only) | {locq['partial']} |
| non-postcode text | {locq['junk']} |
| empty (no location — desktop/image-based) | {locq['empty']} |

## Matches
- **Exact** (full Loc postcode == a repairer's full postcode):
  **{n_exact_cases} cases** across **{seen_any} repairers**. See
  `exact_matches_by_repairer.csv` (counts, first/last seen) and
  `exact_matches_detail.csv` (one row per case).
- **Potential** (Loc is only a *part* postcode whose district matches a repairer's
  district): **{n_partial_cases} cases** — `potential_matches.csv`. These are
  district-level only, so inherently ambiguous (several repairers can share a
  district; the column `other_repairers_same_district` lists them).

## Repairers not seen (by exact appearance)
| Window | Repairers not seen |
|---|---|
| 12 months | {counts[12]} |
| 24 months | {counts[24]} |
| 36 months | {counts[36]} |
| 48 months | {counts[48]} |

`NEVER appeared` = that repairer's postcode never shows up in any Loc (it may still
receive work that is desktop/image-based, where Loc is blank). Lists are cumulative.

**Caveats:** a postcode is a place, not a firm — where repairers share a postcode
(duplicate records / same estate) both are credited (`shares_postcode_with`).
{len(dup_full)} postcodes are shared by >1 repairer record.
"""
    with open(L.out_path(d4, "README.md"), "w", encoding="utf-8") as f:
        f.write(readme)

    print(f"TASK4: loc full={locq['full']} partial={locq['partial']} junk={locq['junk']} "
          f"empty={locq['empty']}")
    print(f"  exact: {n_exact_cases} cases over {seen_any} repairers; never-seen={never}")
    print(f"  partial: {n_partial_cases} cases; dup_full_postcodes={len(dup_full)} {dup_full}")
    print(f"  not_seen 12/24/36/48 = {counts[12]}/{counts[24]}/{counts[36]}/{counts[48]}")
    print("  top exact repairers:")
    for s in exact_rows[:10]:
        print(f"    {s['rep']['code']:10} {s['rep']['name'][:26]:26} {s['rep']['full_pc']:9} "
              f"n={s['count']:4} last={s['last']}")


if __name__ == "__main__":
    run()
