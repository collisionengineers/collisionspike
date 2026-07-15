"""TASK 1 — garagesJOBSHEET vs REPAIRER.xls overlap.

Match the job-sheet garages (physical bodyshops/repairers Collision Engineers
works with) against the REPAIRER group of the EVA contacts (REPAIRER.xls).
Signals: significant-token name similarity + UK-postcode (full / outward).

Outputs (outputs/task1_garages_vs_repairer/):
  matches.csv            confident garage<->repairer pairs
  potential_matches.csv  plausible but unconfirmed (top candidates + why)
  no_matches.csv         job-sheet garages with no REPAIRER counterpart
  README.md
"""
import _lib as L


def classify(nj, nc, pc_full, pc_out, exact, sq_equal, sq_sub):
    if sq_equal or exact or nj >= 0.6 or (pc_full and (nj >= 0.34 or nc >= 0.67 or sq_sub)):
        return "match"
    if nj >= 0.34 or pc_full or (pc_out and nj >= 0.2) or nc >= 0.6 or sq_sub:
        return "potential"
    return "none"


TIER = {"match": 2, "potential": 1, "none": 0}


def best_candidates(garage, repairers):
    gtok = L.name_tokens(garage["name"])
    gnorm = L.norm_text(garage["name"])
    scored = []
    for r in repairers:
        rtok = L.name_tokens(r["name"])
        rnorm = L.norm_text(r["name"])
        nj = L.jaccard(gtok, rtok)
        nc = L.containment(gtok, rtok)
        pc_full = bool(garage["full_pc"] and r["full_pc"] and garage["full_pc"] == r["full_pc"])
        pc_out = bool(garage["outward"] and r["outward"] and garage["outward"] == r["outward"])
        exact = gnorm == rnorm or (
            gnorm and rnorm and (gnorm in rnorm or rnorm in gnorm)
            and min(len(gtok), len(rtok)) >= 2)
        gsq, rsq = L.squash_name(garage["name"]), L.squash_name(r["name"])
        sq_equal = bool(gsq and rsq and gsq == rsq)
        sq_sub = bool(gsq and rsq and len(min(gsq, rsq, key=len)) >= 5
                      and (gsq in rsq or rsq in gsq))
        tier = classify(nj, nc, pc_full, pc_out, exact, sq_equal, sq_sub)
        if tier != "none":
            scored.append({
                "repairer_code": r["code"], "repairer_name": r["name"],
                "repairer_pc": r["full_pc"] or r["outward"] or "",
                "name_jaccard": round(nj, 2), "name_contain": round(nc, 2),
                "pc_full_match": pc_full, "pc_outward_match": pc_out,
                "tier": tier,
            })
    scored.sort(key=lambda d: (TIER[d["tier"]], d["name_jaccard"],
                               d["pc_full_match"], d["name_contain"]), reverse=True)
    return scored


def run():
    garages = L.load_garages_jobsheet()
    repairers = L.load_repairer()

    matches, potentials, nomatch = [], [], []
    for g in garages:
        cands = best_candidates(g, repairers)
        top = cands[0] if cands else None
        if top and top["tier"] == "match":
            matches.append((g, top))
        elif top and top["tier"] == "potential":
            potentials.append((g, cands[:3]))
        else:
            nomatch.append(g)

    base = L.out_path("task1_garages_vs_repairer")

    L.write_csv(L.out_path("task1_garages_vs_repairer", "matches.csv"),
        ["garage_name", "garage_postcode", "garage_email", "garage_phone",
         "repairer_code", "repairer_name", "repairer_postcode",
         "name_jaccard", "pc_full_match", "pc_outward_match"],
        [[g["name"], g["full_pc"] or g["outward"] or "", g["email"], g["phone"],
          t["repairer_code"], t["repairer_name"], t["repairer_pc"],
          t["name_jaccard"], t["pc_full_match"], t["pc_outward_match"]]
         for g, t in matches])

    prow = []
    for g, cands in potentials:
        for t in cands:
            prow.append([g["name"], g["full_pc"] or g["outward"] or "", g["email"],
                         t["repairer_code"], t["repairer_name"], t["repairer_pc"],
                         t["name_jaccard"], t["name_contain"],
                         t["pc_full_match"], t["pc_outward_match"], t["tier"]])
    L.write_csv(L.out_path("task1_garages_vs_repairer", "potential_matches.csv"),
        ["garage_name", "garage_postcode", "garage_email", "candidate_code",
         "candidate_name", "candidate_postcode", "name_jaccard", "name_contain",
         "pc_full_match", "pc_outward_match", "tier"], prow)

    L.write_csv(L.out_path("task1_garages_vs_repairer", "no_matches.csv"),
        ["garage_name", "garage_address", "garage_postcode", "garage_email",
         "garage_phone", "figures"],
        [[g["name"], g["address"], g["full_pc"] or g["outward"] or "", g["email"],
          g["phone"], g["figures"]] for g in nomatch])

    readme = f"""# Task 1 — garagesJOBSHEET vs REPAIRER.xls

**Question:** which of the {len(garages)} job-sheet garages also exist in the EVA
`REPAIRER` contact list (`REPAIRER.xls`, {len(repairers)} records)?

## Method
Each garage is scored against every REPAIRER record on two independent signals:
- **Name** — Jaccard + containment over *significant* tokens (company stop-words
  like *ltd / accident / repair / centre / bodyshop* removed so "BN1 Body Repairs"
  ~ "BN1 Bodyshop").
- **Postcode** — full postcode equality and outward-district equality, parsed from
  the garage address and the repairer record.

Bucketing (best candidate per garage):
- **match** — exact/near-exact name (Jaccard ≥ 0.6), *or* same full postcode with a
  shared distinctive name token.
- **potential** — partial name overlap, same outward district, or same full postcode
  with weak name overlap (could be the same site under a different trading name).
- **no match** — nothing above threshold.

## Results
| Bucket | Garages |
|---|---|
| matches | {len(matches)} |
| potential | {len(potentials)} |
| no match | {len(nomatch)} |

`potential_matches.csv` lists up to the top-3 candidate repairers per garage with
the raw signals, so a human can adjudicate. Postcode equality alone is kept as
*potential* (two firms can share a trading estate). The job sheet is the source of
truth for "garages we use"; a `no match` means that garage is **not yet an EVA
REPAIRER contact** and is a candidate to add.
"""
    with open(L.out_path("task1_garages_vs_repairer", "README.md"), "w", encoding="utf-8") as f:
        f.write(readme)

    print(f"TASK1: garages={len(garages)} repairers={len(repairers)} "
          f"-> match={len(matches)} potential={len(potentials)} none={len(nomatch)}")
    print("  matches:")
    for g, t in matches:
        print(f"    {g['name'][:34]:34} ~ {t['repairer_code']:9} {t['repairer_name'][:28]:28} "
              f"nj={t['name_jaccard']} pcF={t['pc_full_match']}")
    print("  no-match garages:", [g["name"] for g in nomatch])


if __name__ == "__main__":
    run()
