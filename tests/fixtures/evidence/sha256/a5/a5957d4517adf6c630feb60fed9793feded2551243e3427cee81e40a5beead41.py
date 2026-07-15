"""TASK 2 — providersJOBSHEET vs legal.xls + contactseva_combined.csv.

Match the job-sheet work-providers (solicitors / instructing principals) against
the EVA contact universe: legal.xls (the LEGAL group export) UNION
contactseva_combined.csv (all groups). The decisive signal is the **EVA code**
(providersJOBSHEET carries "EVA + Box Code"; both contact sources have "Code");
provider name is the secondary signal, matched against the contact name AND its
address blob (many LEGAL rows are named "FAO The Court" with the firm in address).

Outputs (outputs/task2_providers_vs_legal_contacts/):
  matches.csv, potential_matches.csv, no_matches.csv, README.md
Also reports Sheet2 (providers found in mailbox, absent from Sheet1).
"""
import _lib as L


def build_contacts():
    """Union legal.xls + CSV, keyed by normalised code.

    Returns (by_code: dict, all_contacts: list). Each contact:
    {code, name, group, search, src}.
    """
    by_code, all_c = {}, []

    def add(code, name, group, search, src):
        nc = L.norm_code(code)
        rec = {"code": str(code).strip(), "norm": nc, "name": name or "",
               "group": group or "", "search": L.norm_text(search), "src": src}
        all_c.append(rec)
        if nc and nc not in by_code:
            by_code[nc] = rec

    for r in L.load_xls_contacts("legal.xls"):
        add(r["code"], r["name"], r["group"],
            f"{r['name']} {r['address_blob']}", "legal.xls")
    for r in L.load_contacts_csv():
        add(r.get("Code"), r.get("Name"), r.get("Group"),
            f"{r.get('Name','')} {r.get('Address','')} {r.get('City','')} {r.get('County','')}",
            "csv")
    return by_code, all_c


def best_name_match(prov, all_c):
    ptok = L.name_tokens(prov["name"])
    psq = L.squash_name(prov["name"])
    pn = L.norm_text(prov["name"])
    best = None
    for c in all_c:
        ctok = L.name_tokens(c["name"])
        nj = L.jaccard(ptok, ctok)
        csq = L.squash_name(c["name"])
        sq_equal = bool(psq and csq and psq == csq)
        sq_sub = bool(psq and csq and len(min(psq, csq, key=len)) >= 5
                      and (psq in csq or csq in psq))
        # provider name appearing inside the contact search blob (name+address)
        in_blob = bool(pn and len(pn) >= 5 and pn in c["search"])
        score = (3 if sq_equal else 0) + (2 if (sq_sub or in_blob) else 0) + nj
        cand = {"code": c["code"], "name": c["name"], "group": c["group"],
                "src": c["src"], "nj": round(nj, 2), "sq_equal": sq_equal,
                "sq_sub": sq_sub, "in_blob": in_blob, "score": round(score, 2)}
        if best is None or cand["score"] > best["score"]:
            best = cand
    return best


def run():
    s1, s2 = L.load_providers_jobsheet()
    by_code, all_c = build_contacts()

    matches, potentials, nomatch = [], [], []
    for p in s1:
        pcode = L.norm_code(p["code"])
        code_hit = by_code.get(pcode) if pcode else None
        nm = best_name_match(p, all_c)

        if code_hit:
            matches.append((p, "code", {
                "code": code_hit["code"], "name": code_hit["name"],
                "group": code_hit["group"], "src": code_hit["src"],
                "nj": nm["nj"] if nm else 0}))
        elif nm and (nm["sq_equal"] or nm["nj"] >= 0.7):
            matches.append((p, "name", nm))
        elif nm and (nm["nj"] >= 0.4 or nm["sq_sub"] or nm["in_blob"]):
            potentials.append((p, nm))
        else:
            nomatch.append((p, nm))

    d = "task2_providers_vs_legal_contacts"
    L.write_csv(L.out_path(d, "matches.csv"),
        ["provider_name", "provider_eva_code", "matched_via", "contact_code",
         "contact_name", "contact_group", "contact_source", "name_jaccard"],
        [[p["name"], p["code"], via, m["code"], m["name"], m["group"],
          m.get("src", ""), m.get("nj", "")] for p, via, m in matches])

    L.write_csv(L.out_path(d, "potential_matches.csv"),
        ["provider_name", "provider_eva_code", "candidate_code", "candidate_name",
         "candidate_group", "candidate_source", "name_jaccard", "sq_substr",
         "name_in_address"],
        [[p["name"], p["code"], m["code"], m["name"], m["group"], m["src"],
          m["nj"], m["sq_sub"], m["in_blob"]] for p, m in potentials])

    L.write_csv(L.out_path(d, "no_matches.csv"),
        ["provider_name", "provider_eva_code", "inbox", "instructions",
         "closest_candidate_code", "closest_candidate_name", "closest_name_jaccard"],
        [[p["name"], p["code"], p["inbox"], p["instructions"],
          (nm["code"] if nm else ""), (nm["name"] if nm else ""),
          (nm["nj"] if nm else "")] for p, nm in nomatch])

    # Sheet2 — providers found in mailbox, not on Sheet1: check if any exist as contacts
    s2_rows = []
    for p in s2:
        nm = best_name_match({"name": p["name"]}, all_c)
        hit = nm and (nm["sq_equal"] or nm["nj"] >= 0.6 or nm["in_blob"])
        s2_rows.append([p["name"], "yes" if hit else "no",
                        (nm["code"] if nm else ""), (nm["name"] if nm else ""),
                        (nm["nj"] if nm else "")])
    L.write_csv(L.out_path(d, "sheet2_mailbox_providers.csv"),
        ["sheet2_provider", "found_in_contacts", "contact_code", "contact_name",
         "name_jaccard"], s2_rows)

    readme = f"""# Task 2 — providersJOBSHEET vs legal.xls + contactseva CSV

**Question:** which of the {len(s1)} job-sheet work-providers exist in the EVA
contact universe — `legal.xls` (the LEGAL group) ∪ `contactseva_combined.csv`
(all groups, {len(all_c)} contact rows, {len(by_code)} distinct codes)?

## Method
1. **Code match (decisive).** providersJOBSHEET carries the "EVA + Box Code"; both
   contact sources have a "Code". A normalised-code hit = **match** (this is the
   same key EVA/Box use, so it is authoritative).
2. **Name match (secondary).** Where the code does not resolve, the provider name
   is compared by squashed-name equality + token Jaccard, and is also searched
   *inside the contact address blob* — many LEGAL rows are named "FAO The Court"
   with the firm in the address line.

Buckets: **match** = code hit, squashed-name equality, or Jaccard ≥ 0.7.
**potential** = Jaccard ≥ 0.4, squashed substring, or provider-name-in-address.
**no match** = none of the above (closest candidate still shown for review).

## Results
| Bucket | Providers |
|---|---|
| matches | {len(matches)} |
| potential | {len(potentials)} |
| no match | {len(nomatch)} |

- `matches.csv` shows whether each was matched **via code or via name**.
- `sheet2_mailbox_providers.csv` checks the {len(s2)} Sheet2 providers (firms seen
  in the mailbox but absent from the job-sheet Sheet1) against the contact universe.

A `no match` provider is on the job sheet but has **no EVA contact record** under
that code or name — a gap to create in EVA, or a code mismatch to reconcile.
"""
    with open(L.out_path(d, "README.md"), "w", encoding="utf-8") as f:
        f.write(readme)

    print(f"TASK2: providers(Sheet1)={len(s1)} contacts={len(all_c)} codes={len(by_code)} "
          f"-> match={len(matches)} potential={len(potentials)} none={len(nomatch)}")
    print("  via code:", sum(1 for _, v, _ in matches if v == "code"),
          " via name:", sum(1 for _, v, _ in matches if v == "name"))
    print("  POTENTIAL:")
    for p, m in potentials:
        print(f"    {p['name'][:30]:30} [{p['code']:9}] ~ {m['code']:9} {m['name'][:26]:26} nj={m['nj']}")
    print("  NO MATCH:")
    for p, nm in nomatch:
        print(f"    {p['name'][:30]:30} [{p['code']:9}] closest={nm['code'] if nm else '-':9} "
              f"{(nm['name'][:24] if nm else ''):24} nj={nm['nj'] if nm else '-'}")


if __name__ == "__main__":
    run()
