"""TASK 6 — claudeschoice: cross-references not covered by T1-T5.

Seven analyses chosen to feed the Dataverse corpus + address-matching work:

 1 unknown_principals.csv        principal codes in case data with NO contact
                                 record, or resolving to ENGINEER/STAFF -> the
                                 "red herrings" the brief warns about.
 2 jobsheet_provider_activity.csv each job-sheet provider's REAL case volume +
                                 recency (paper providers vs live earners).
 3 top_inspection_locations.csv  the postcodes where inspections actually happen,
                                 dominant principal + whether it's a known repairer.
 4 principal_loc_rate.csv        share of a principal's cases that carry a Loc ->
                                 image-based (desktop) vs site-inspected.
 5 inspection_type_by_principal.csv  Desktop vs physical mix per principal.
 6 legal_contacts_activity.csv   which of the 438 LEGAL contacts are live vs dead.
 7 postcode_area_geography.csv   business geography by postcode area (G/ML/EH/B...).
"""
import _lib as L
from collections import defaultdict, Counter
import re

AREA = re.compile(r"^[A-Z]{1,2}")


def run():
    cmap = L.build_code_name_map()
    d6 = "claudeschoice"

    # ---- pass over fulllist: per-principal cases + recency ----
    full_cases = Counter()
    full_last = {}
    full_first = {}
    for row in L.load_cases("fulllist.xlsx"):
        p = row["principal"]
        if not p:
            continue
        full_cases[p] += 1
        d = row["date_created"]
        if d:
            if p not in full_last or d > full_last[p]:
                full_last[p] = d
            if p not in full_first or d < full_first[p]:
                full_first[p] = d

    # ---- pass over everyrepairloc: loc presence, inspection type, locations ----
    erl_cases = Counter()
    erl_withloc = Counter()
    insp_type = defaultdict(Counter)        # principal -> Counter(inspection_type)
    pc_total = Counter()                    # full pc -> count
    pc_principal = defaultdict(Counter)     # full pc -> Counter(principal)
    area_count = Counter()                  # postcode area -> count
    for row in L.load_cases("everyrepairloc.xlsx"):
        p = row["principal"] or "(blank)"
        erl_cases[p] += 1
        it = row["inspection_type"] or "(blank)"
        insp_type[p][it] += 1
        loc = row["loc"]
        if not loc:
            continue
        f, o, kind = L.parse_postcode(loc)
        if kind == "none":
            continue
        erl_withloc[p] += 1
        if o:
            m = AREA.match(o)
            if m:
                area_count[m.group(0)] += 1
        if kind == "full":
            pc_total[f] += 1
            pc_principal[f][p] += 1

    def nm(code):
        e = cmap.get(L.norm_code(code))
        return e["name"] if e else ""

    def grp(code):
        e = cmap.get(L.norm_code(code))
        return e["group"] if e else ""

    def band(last):
        if last is None:
            return "no-date"
        for m in (12, 24, 36, 48):
            if last >= L.CUTOFFS[m]:
                return {12: "active<12m", 24: "12-24m", 36: "24-36m", 48: "36-48m"}[m]
        return ">48m"

    # 1 unknown principals (red herrings)
    rep_pc = {r["full_pc"]: r["name"] for r in L.load_repairer() if r["full_pc"]}
    rows = []
    for p, c in full_cases.most_common():
        g = grp(p)
        name = nm(p)
        if name == "" or g in ("ENGINEER", "STAFF"):
            cls = ("ENGINEER/STAFF code" if g in ("ENGINEER", "STAFF")
                   else "UNKNOWN (no contact record)")
            rows.append([p, name, g, cls, c,
                         (full_last[p].isoformat() if p in full_last else ""), band(full_last.get(p))])
    L.write_csv(L.out_path(d6, "unknown_principals.csv"),
        ["principal_code", "resolved_name", "contact_group", "classification",
         "total_cases", "last_used", "band"], rows)
    n_unknown = sum(1 for r in rows if r[3].startswith("UNKNOWN"))

    # 2 jobsheet provider activity — robust provider->principal resolution:
    #   (a) exact/normalised code, incl. slash-codes "R1AM/MOTORX" (sum both)
    #   (b) name fallback: provider-name squash == a principal code, or ==
    #       a principal's resolved-name squash (catches GG=Graham Coffey, ZEN->ZENITH)
    s1, _ = L.load_providers_jobsheet()
    princ_norm = {L.norm_code(p): p for p in full_cases}      # normcode -> real principal key
    princ_by_namesq = defaultdict(list)
    for p in full_cases:
        rn = nm(p)
        if rn:
            princ_by_namesq[L.squash_name(rn).upper()].append(p)

    def resolve_provider(prov):
        matched, via = [], ""
        # (a) code(s)
        raw = prov["code"] or ""
        subcodes = [s for s in re.split(r"[/,&]| or ", raw) if s.strip()]
        for sc in subcodes:
            k = princ_norm.get(L.norm_code(sc))
            if k and k not in matched:
                matched.append(k)
        if matched:
            via = "code" + ("(split)" if len(matched) > 1 else "")
        # (b) name fallback
        if not matched:
            psq = L.squash_name(prov["name"]).upper()
            if psq and psq in princ_norm:
                matched.append(princ_norm[psq]); via = "name=code"
            elif psq and psq in princ_by_namesq:
                matched.extend(princ_by_namesq[psq]); via = "name=name"
        return matched, via

    # dedup by matched principal (Sheet1 has duplicate provider lines)
    agg = {}
    for prov in s1:
        matched, via = resolve_provider(prov)
        key = "+".join(matched) if matched else "NAME:" + L.norm_text(prov["name"])
        cases = sum(full_cases.get(k, 0) for k in matched)
        last = max((full_last[k] for k in matched if k in full_last), default=None)
        if key not in agg:
            agg[key] = {"name": prov["name"], "code": prov["code"],
                        "matched": "+".join(matched), "via": via, "cases": cases,
                        "last": last, "ioa": prov["image_or_address"],
                        "inbox": prov["inbox"], "rows": 0}
        agg[key]["rows"] += 1
    jrows = [[a["name"], a["code"], a["matched"], a["via"], a["cases"],
              (a["last"].isoformat() if a["last"] else ""), band(a["last"]),
              a["rows"], a["ioa"], a["inbox"]] for a in agg.values()]
    jrows.sort(key=lambda r: -r[4])
    L.write_csv(L.out_path(d6, "jobsheet_provider_activity.csv"),
        ["provider_name", "jobsheet_code", "matched_principal", "matched_via",
         "total_cases", "last_used", "band", "jobsheet_row_count",
         "jobsheet_image_or_address", "inbox"], jrows)
    paper = sum(1 for r in jrows if r[4] == 0)
    dup_rows = sum(r[7] - 1 for r in jrows if r[7] > 1)

    # 8 contact-group red herrings (known NON-provider codes per the brief)
    rh = []
    for row in L.load_contacts_csv():
        g = (row.get("Group") or "").upper()
        if g in ("ENGINEER", "STAFF", "AGENT", "BROKER", "CLIENT", "OTHER", "PRIVATE"):
            code = row.get("Code")
            rh.append([code, row.get("Name"), g, full_cases.get(code, 0),
                       (full_last[code].isoformat() if code in full_last else "")])
    rh.sort(key=lambda r: (r[2], -r[3]))
    L.write_csv(L.out_path(d6, "contact_group_redherrings.csv"),
        ["code", "name", "group", "cases_as_principal", "last_used"], rh)

    # 3 top inspection locations
    trows = []
    for pc, tot in pc_total.most_common(80):
        dom = pc_principal[pc].most_common(1)[0]
        trows.append([pc, tot, len(pc_principal[pc]), dom[0], nm(dom[0]), dom[1],
                      rep_pc.get(pc, "")])
    L.write_csv(L.out_path(d6, "top_inspection_locations.csv"),
        ["full_postcode", "total_cases", "distinct_principals", "dominant_principal",
         "dominant_principal_name", "dominant_principal_cases", "known_repairer_at_pc"], trows)

    # 4 principal loc-rate (image-based vs site)
    lrows = []
    for p in sorted(full_cases, key=lambda x: -full_cases[x]):
        total = full_cases[p]
        wl = erl_withloc.get(p, 0)
        erl = erl_cases.get(p, 0)
        rate = round(100 * wl / erl, 1) if erl else 0.0
        cls = ("mostly image-based" if rate < 20 else
               "mixed" if rate < 60 else "mostly site-inspected")
        lrows.append([p, nm(p), total, erl, wl, rate, cls])
    L.write_csv(L.out_path(d6, "principal_loc_rate.csv"),
        ["principal_code", "resolved_name", "fulllist_cases", "everyrepairloc_cases",
         "cases_with_loc", "loc_rate_pct", "classification"], lrows)

    # 5 inspection type by principal
    irows = []
    for p in sorted(insp_type, key=lambda x: -sum(insp_type[x].values())):
        c = insp_type[p]
        tot = sum(c.values())
        desktop = sum(v for k, v in c.items() if "desktop" in k.lower())
        irows.append([p, nm(p), tot, desktop, tot - desktop,
                      round(100 * desktop / tot, 1) if tot else 0,
                      "; ".join(f"{k}={v}" for k, v in c.most_common(4))])
    L.write_csv(L.out_path(d6, "inspection_type_by_principal.csv"),
        ["principal_code", "resolved_name", "everyrepairloc_cases", "desktop",
         "non_desktop", "desktop_pct", "top_types"], irows)

    # 6 legal contact activity (which LEGAL contacts are live)
    legal = L.load_xls_contacts("legal.xls")
    grows = []
    live = 0
    for c in legal:
        ncode = L.norm_code(c["code"])
        cases = 0
        last = None
        for pc, cnt in full_cases.items():
            if L.norm_code(pc) == ncode:
                cases = cnt
                last = full_last.get(pc)
                break
        if cases > 0:
            live += 1
        grows.append([c["code"], c["name"], cases,
                      (last.isoformat() if last else ""), band(last) if cases else "no-cases"])
    grows.sort(key=lambda r: -r[2])
    L.write_csv(L.out_path(d6, "legal_contacts_activity.csv"),
        ["contact_code", "contact_name", "total_cases", "last_used", "band"], grows)

    # 7 postcode area geography
    arows = [[a, c] for a, c in area_count.most_common()]
    L.write_csv(L.out_path(d6, "postcode_area_geography.csv"),
        ["postcode_area", "loc_case_count"], arows)

    readme = f"""# Task 6 — claudeschoice (additional cross-references)

Seven analyses beyond the prescribed T1-T5, chosen to feed the Dataverse corpus and
the address-matching service.

| File | What it answers | Headline |
|---|---|---|
| `unknown_principals.csv` | principal codes in case data with no contact record | {n_unknown} truly unknown codes |
| `contact_group_redherrings.csv` | known NON-provider codes (engineer/staff/agent/broker/client/other/private) | {len(rh)} red-herring contacts the brief warns about |
| `jobsheet_provider_activity.csv` | real case volume + recency per job-sheet provider (slash-code + name resolution, deduped) | {len(jrows)} distinct providers ({dup_rows} duplicate job-sheet lines collapsed); only {paper} truly have **0** cases |
| `top_inspection_locations.csv` | the postcodes where inspections actually cluster | top-80 sites, with dominant principal + known-repairer flag |
| `principal_loc_rate.csv` | what share of a principal's cases have a location | image-based vs site-inspected split |
| `inspection_type_by_principal.csv` | Desktop vs physical mix per principal | validates the job-sheet "image based or address" column |
| `legal_contacts_activity.csv` | which of the {len(legal)} LEGAL contacts are live | {live} have ≥1 case; the rest are dead weight |
| `postcode_area_geography.csv` | business geography by postcode area | where the work physically is |

**Why these matter for Dataverse**
- *unknown_principals* + *legal_contacts_activity* tell you how much of the EVA
  contact list is noise before you import it into `WorkProvider`.
- *jobsheet_provider_activity* separates real earners from paper rows — seed/prioritise
  accordingly, and set `active=false` on dead ones.
- *top_inspection_locations* + *principal_loc_rate* + *inspection_type* drive the
  per-provider `imagesSourceNotes` / inspection policy and the address-matching
  service (which postcodes to pre-resolve, which principals are image-only).
- *postcode_area_geography* shows the inspector catchment (Scotland-heavy: G/ML/EH/PA).
"""
    with open(L.out_path(d6, "README.md"), "w", encoding="utf-8") as f:
        f.write(readme)

    print(f"TASK6: trulyUnknown_principals={n_unknown} redherring_contacts={len(rh)} "
          f"distinct_providers={len(jrows)} (dupLines={dup_rows}) paper={paper} "
          f"live_legal={live}/{len(legal)}")
    print("  top postcode areas:", area_count.most_common(12))
    print("  paper (0-case) job-sheet providers:",
          [r[0] for r in jrows if r[4] == 0])
    print("  resolved high-volume providers (sample):")
    for r in jrows[:8]:
        print(f"    {r[0][:26]:26} code={r[1][:14]:14} -> {r[2][:12]:12} via={r[3]:11} cases={r[4]}")


if __name__ == "__main__":
    run()
