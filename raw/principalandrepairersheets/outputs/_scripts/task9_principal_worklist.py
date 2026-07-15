"""TASK 9 (follow-up) — per-principal address-resolution worklist.

For every principal that has PART-postcode Locs, list the districts to resolve to
full addresses, and — crucially — pre-fill the LIKELY full address from that
principal's OWN history (a repeated full postcode in the same district). Plus the
other things to obtain/clarify per principal that would help the Dataverse build.

Writes outputs/reports/principal_address_worklist.md.
"""
import _lib as L
from collections import defaultdict, Counter
import re

AREA = re.compile(r"^[A-Z]{1,2}")


def run():
    cmap = L.build_code_name_map()

    def ent(c):
        return cmap.get(L.norm_code(c))

    def nm(c):
        e = ent(c); return re.sub(r"\s+", " ", e["name"]).strip() if e else ""

    # everyrepairloc: per principal full + partial postcode counters
    full = defaultdict(Counter)
    part = defaultdict(Counter)
    erl_total = Counter()
    for row in L.load_cases("everyrepairloc.xlsx"):
        loc = row["loc"]
        if not loc:
            continue
        p = row["principal"] or "(blank)"
        erl_total[p] += 1
        f, o, kind = L.parse_postcode(loc)
        if kind == "full":
            full[p][f] += 1
        elif kind == "partial":
            part[p][o] += 1

    # fulllist recency
    last = {}
    cases = Counter()
    for row in L.load_cases("fulllist.xlsx"):
        p = row["principal"]
        if not p:
            continue
        cases[p] += 1
        d = row["date_created"]
        if d and (p not in last or d > last[p]):
            last[p] = d

    def band(p):
        lu = last.get(p)
        if lu is None:
            return "no-date"
        for m in (12, 24, 36, 48):
            if lu >= L.CUTOFFS[m]:
                return {12: "active (<12m)", 24: "dormant 12-24m", 36: "dormant 24-36m",
                        48: "dormant 36-48m"}[m]
        return "dormant >48m"

    # job sheet principals
    s1, _ = L.load_providers_jobsheet()
    princ_norm = {L.norm_code(p): p for p in cases}
    js = {}
    for prov in s1:
        for sc in [s for s in re.split(r"[/,&]| or ", prov["code"] or "") if s.strip()]:
            k = princ_norm.get(L.norm_code(sc))
            if k:
                js[k] = prov
        if not any(princ_norm.get(L.norm_code(sc)) for sc in
                   re.split(r"[/,&]| or ", prov["code"] or "")):
            psq = L.squash_name(prov["name"]).upper()
            if psq in princ_norm:
                js[princ_norm[psq]] = prov

    # principals with partials, ordered by total partial volume
    principals = sorted(part, key=lambda p: -sum(part[p].values()))

    lines = []
    lines.append("# Per-principal address-resolution worklist\n")
    lines.append("Everywhere a **part postcode** (district only) appears in the Loc "
                 "(inspection-location) field, grouped by principal and ordered by "
                 "volume. For each district, the **Likely full address** column is "
                 "pre-filled from that principal's *own* repeated full postcodes in the "
                 "same district — in most cases that is the storage yard the district "
                 "refers to, so you only need to confirm it. Blank = no full-postcode "
                 "history in that district yet; supply the address.\n")
    lines.append(f"Source: `everyrepairloc.xlsx` (authoritative Loc), {L.TODAY.isoformat()}. "
                 f"{len(principals)} principals have part-only Locs.\n")
    lines.append("Legend for **Clarify**: ⚠name = EVA name was a placeholder, firm "
                 "derived from address (confirm it); ◇offsheet = active but not on the "
                 "job-sheet register (add to corpus?); ⏳dormant = verify still trading; "
                 "📷image-based = <20% of cases carry a Loc (partials likely storage yards).\n")
    lines.append("---\n")

    for p in principals:
        pname = nm(p) or "(no contact record)"
        e = ent(p)
        tot_part = sum(part[p].values())
        tot_full = sum(full[p].values())
        tot_loc = erl_total.get(p, 0)
        ppct = round(100 * tot_part / tot_loc, 1) if tot_loc else 0
        loc_rate = round(100 * tot_loc / cases[p], 1) if cases.get(p) else 0
        flags = []
        if e and e.get("derived"):
            flags.append("⚠name")
        if p not in js and band(p) == "active (<12m)":
            flags.append("◇offsheet")
        if band(p).startswith("dormant"):
            flags.append("⏳dormant")
        if loc_rate < 20:
            flags.append("📷image-based")
        flagstr = (" · " + " ".join(flags)) if flags else ""

        lines.append(f"## {p} — {pname}")
        lines.append(f"_{tot_part} partial · {tot_full} full · {ppct}% of located cases "
                     f"are partial · {band(p)} · "
                     f"{'on job sheet' if p in js else 'not on job sheet'}{flagstr}_\n")

        # district resolution table
        rows = []
        for d, c in part[p].most_common():
            # likely full = principal's most-common full pc whose outward == district
            cand = [(pc, n) for pc, n in full[p].items()
                    if AREA.match(pc) and pc.split(" ")[0] == d]
            cand.sort(key=lambda x: -x[1])
            likely = f"{cand[0][0]} (seen {cand[0][1]}×)" if cand else ""
            rows.append((d, c, likely))
        lines.append("| District | Cases | Likely full address (from own history) | Your confirmed full address |")
        lines.append("|---|---|---|---|")
        for d, c, likely in rows:
            lines.append(f"| {d} | {c} | {likely} | |")
        lines.append("")

    # global clarifications
    lines.append("---\n")
    lines.append("## Global items to obtain / clarify (help the Dataverse build)\n")
    lines.append("These apply across principals — resolve once:\n")
    lines.append("1. **Shared storage yards — register once, link to many.** Several full "
                 "postcodes are used by many principals (they are storage/recovery yards, "
                 "not the provider). Model each as one `Repairer`/`ImageSource` and link "
                 "the principals to it rather than copying the address per principal. See "
                 "`reports/loc_locations_multi_principal.csv` (e.g. **CH46 4TP** = Shaun "
                 "Marnell, 11 principals; **OL1/OL2** = Oldham hub, 27-28 principals; "
                 "**M12 5FX** = HS Recovery; **B5 6JX** = Somstar).")
    lines.append("2. **Confirm the firm names flagged ⚠name** — these came from the EVA "
                 "address line because the EVA *Name* was the placeholder \"FAO The Court\". "
                 "Confirm the real trading name before it becomes the `WorkProvider.name`.")
    lines.append("3. **Code drift** — e.g. job-sheet `ZEN` vs EVA principal `ZENITH` "
                 "(6 cases). Confirm the canonical principal code per provider so the "
                 "Box/EVA Case-PO prefix is stable.")
    lines.append("4. **Split slash-codes** — `R1AM/MOTORX` is two principals (89 + 30 "
                 "cases). Confirm they are distinct providers.")
    lines.append("5. **Per-VRM / non-standard coding** — Arianna Autos (coded per-VRM) and "
                 "\"Questgates or Brownsword\" have no stable principal code. Decide a "
                 "routing rule rather than a `WorkProvider` row.")
    lines.append("6. **Intermediary vs provider** — confirm which senders are "
                 "intermediaries (route to several providers) vs the provider itself, so "
                 "image-sourcing and the chaser target the right party (see ADR-0011).")
    lines.append("7. **Inspection policy per provider** — for 📷image-based principals, "
                 "confirm whether a physical inspection address is ever expected or whether "
                 "it is always image-based (drives `inspectionAddress` derivation).")

    out = L.out_path("reports", "principal_address_worklist.md")
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    n_districts = sum(len(part[p]) for p in principals)
    n_prefilled = 0
    for p in principals:
        for d in part[p]:
            if any(pc.split(" ")[0] == d for pc in full[p]):
                n_prefilled += 1
    print(f"TASK9: principals_with_partials={len(principals)} district_rows={n_districts} "
          f"prefilled_from_own_history={n_prefilled} ({round(100*n_prefilled/n_districts,1)}%)")
    print("  wrote", out.split("outputs")[-1])
    if L.LOCKED_WRITES:
        print("  NOTE locked -> .new:", [x.split('outputs')[-1] for x in L.LOCKED_WRITES])


if __name__ == "__main__":
    run()
