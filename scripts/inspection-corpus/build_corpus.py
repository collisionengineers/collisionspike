#!/usr/bin/env python3
"""Rebuild the inspection-address suggestions corpus from the EVA full-address export (TKT-075).

Reads the git-tracked EVA export `docs/reference/fullevaexportinspectionaddresses.xlsx` and emits a
**PII-free**, deterministic suggestions CSV plus a per-provider run report. This is the reproducible
in-repo replacement for the retired `dataverse/.build` preprocessor (ADR-0013 / ADR-0016).

Design rules (binding):
  - Marker-aware provider parse: strip a leading `a.` / `ap.` / `d.` marker, then take the leading
    alpha of the Case ID, uppercased (`a.qdos25448` -> QDOS, `qdos24731` -> QDOS, `fw24126` -> FW).
  - Exclude VRM-shaped Case IDs (individual/private claimant — no provider code).
  - Drop "Image Based Assessment" site rows (typo-tolerant: also `Asessment`) and rows with no
    locatable site. KEEP name+postcode-only sites.
  - Deterministic UK-postcode normalisation, then dedup per (provider, normalised full site).
    Recompute frequency / last-seen / rank per provider.
  - Output is PII-free: NO insured name, vehicle reg, claim number, or inspection contact. Only the
    provider code, site name, street lines, postcode, and aggregate stats.
  - `always_image_based` is OPERATOR-DESIGNATED: the run report gives image-based % per provider for a
    HUMAN to decide from; this script NEVER sets policy (ADR-0016 helper #1).

Usage:
  python scripts/inspection-corpus/build_corpus.py \
     [--xlsx docs/reference/fullevaexportinspectionaddresses.xlsx] \
     [--out migration/assets/schema/seed/data/inspection-suggestions.csv] \
     [--report scripts/inspection-corpus/reports/provider-report.csv]

Stdlib only (zipfile + xml.etree) — no third-party deps, so it runs anywhere.
"""
from __future__ import annotations

import argparse
import csv
import os
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

# ---- xlsx reading (stdlib) ------------------------------------------------------------------

def _cell_letters(ref: str) -> str:
    return "".join(c for c in ref if c.isalpha())


def read_xlsx_rows(path: str):
    """Yield each sheet row as a dict keyed by column letter (A, B, ...). First row is the header."""
    z = zipfile.ZipFile(path)
    shared = [
        "".join(t.text or "" for t in si.iter(f"{NS}t"))
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(f"{NS}si")
    ]
    sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    for r in sheet.find(f"{NS}sheetData").findall(f"{NS}row"):
        cells = {}
        for c in r.findall(f"{NS}c"):
            v = c.find(f"{NS}v")
            t = c.get("t")
            val = None
            if v is not None:
                val = shared[int(v.text)] if t == "s" else v.text
            else:
                inline = c.find(f"{NS}is")
                if inline is not None:
                    val = "".join(x.text or "" for x in inline.iter(f"{NS}t"))
            cells[_cell_letters(c.get("r"))] = val
        yield cells


# ---- parsing helpers ------------------------------------------------------------------------

_MARKER = re.compile(r"^(?:a|ap|d)\.(.*)$", re.I)
_LEAD_ALPHA = re.compile(r"^([A-Za-z]+)")
# VRM shapes: current AB12CDE, and older prefix/suffix forms.
_VRM = re.compile(r"^[A-Z]{2}\d{2}\s?[A-Z]{3}$|^[A-Z]\d{1,3}\s?[A-Z]{3}$|^[A-Z]{3}\s?\d{1,3}[A-Z]$", re.I)
_UK_PC = re.compile(r"^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$", re.I)
# Tolerates: hyphen ("Image-based"), no-space ("Imagebased"), the 'Asessment' typo, plural, and a
# bare "Image Based" with no "Assessment". The marker leaks into BOTH the name (H) and address (F/J).
_IMAGE_BASED = re.compile(r"image[\s\-]*bas+ed(?:\s*ass?ess?ments?)?", re.I)
_CLAIM_JUNK = re.compile(r"^claim\s*\d+$", re.I)


def norm_ws(s):
    return re.sub(r"\s+", " ", (s or "")).strip()


def parse_provider(case_id: str) -> str | None:
    cid = norm_ws(case_id)
    if not cid:
        return None
    if _VRM.match(cid.replace(" ", "")) or _VRM.match(cid):
        return None  # VRM-shaped -> individual claimant, no provider code
    m = _MARKER.match(cid)
    body = m.group(1) if m else cid
    lead = _LEAD_ALPHA.match(body)
    if not lead:
        return None
    return lead.group(1).upper()


def normalise_postcode(pc: str) -> str:
    raw = norm_ws(pc).upper().replace(" ", "")
    m = _UK_PC.match(raw)
    if not m:
        return ""  # not a full UK postcode -> not usable as a postcode (ADR: no bare/partial)
    return f"{m.group(1)} {m.group(2)}"


def parse_date_iso(s: str) -> str:
    """EVA export uses DD/MM/YYYY. Return YYYY-MM-DD or '' if unparseable."""
    s = norm_ws(s)
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", s)
    if not m:
        return ""
    d, mo, y = m.groups()
    return f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"


def clean_name(h: str) -> str:
    n = norm_ws(h)
    if not n or _IMAGE_BASED.search(n) or _CLAIM_JUNK.match(n):
        return ""
    return n


def dedup_key(name: str, line: str, pc: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", f"{name}|{line}|{pc}".lower())


# ---- main pipeline --------------------------------------------------------------------------

def build(xlsx: str):
    rows = list(read_xlsx_rows(xlsx))
    header, data = rows[0], rows[1:]
    # column letters: A CaseID, B Reg, C Insured, D Claim, E Created, F InspLocAdd, G PCode,
    # H InspLocName, I Contact, J InspLocAdd1
    sites: dict[tuple, dict] = {}
    stats = defaultdict(lambda: {"cases": 0, "image_based": 0, "vrm": 0, "no_site": 0, "sites": set()})

    for r in data:
        provider = parse_provider(r.get("A"))
        # The "Image Based Assessment" marker leaks into the name (H) AND the address columns (F/J),
        # in several spellings — treat the row as image-based (no physical site) if any carry it.
        is_image = bool(_IMAGE_BASED.search(" ".join(norm_ws(r.get(c)) for c in ("H", "F", "J"))))
        if provider is None:
            # count VRM-shaped separately for the report, then skip
            if norm_ws(r.get("A")):
                stats["(individual/VRM)"]["cases"] += 1
                stats["(individual/VRM)"]["vrm"] += 1
            continue
        st = stats[provider]
        st["cases"] += 1
        if is_image:
            st["image_based"] += 1
            continue  # image-based -> no physical site
        name = clean_name(r.get("H"))
        f_line = norm_ws(r.get("F"))
        j_line = norm_ws(r.get("J"))
        line = f_line or j_line
        pc = normalise_postcode(r.get("G"))
        # usable site: a street line, OR a (name AND postcode). Bare postcode / bare name -> drop.
        if not (line or (name and pc)):
            st["no_site"] += 1
            continue
        key = (provider, dedup_key(name, line, pc))
        st["sites"].add(key[1])
        date_iso = parse_date_iso(r.get("E"))
        site = sites.get(key)
        if site is None:
            sites[key] = {
                "provider": provider,
                "name": name,
                "line": line,
                "line2": (j_line if (j_line and j_line != f_line) else ""),
                "postcode": pc,
                "frequency": 1,
                "last_seen": date_iso,
            }
        else:
            site["frequency"] += 1
            if date_iso and date_iso > site["last_seen"]:
                site["last_seen"] = date_iso
            # prefer a non-empty name/postcode if a later row supplies one
            if not site["name"] and name:
                site["name"] = name
            if not site["postcode"] and pc:
                site["postcode"] = pc

    # rank per provider: frequency desc, last_seen desc, label asc (stable/deterministic)
    by_provider = defaultdict(list)
    for site in sites.values():
        by_provider[site["provider"]].append(site)
    out = []
    for provider in sorted(by_provider):
        group = by_provider[provider]
        # frequency desc, last_seen DESC (newest sighting first), label asc. Mixed sort
        # directions => stable multi-pass, least-significant key first (Python sort is
        # stable). A single (-freq, last_seen, label) key left last_seen ASCENDING, which
        # ranked STALE sites above newer ones on a frequency tie (the API sorts by this rank
        # when there is no proximity signal, and as the tiebreaker otherwise).
        group.sort(key=label_for)                                    # tertiary: label asc
        group.sort(key=lambda s: s["last_seen"] or "", reverse=True)  # secondary: last_seen desc
        group.sort(key=lambda s: s["frequency"], reverse=True)        # primary: frequency desc
        for i, s in enumerate(group, start=1):
            s["rank"] = i
            out.append(s)
    # Assign globally-unique, deterministic labels: `label` is the reseed upsert key
    # (UNIQUE(label)). Two sites on the same street at different postcodes share a display, so
    # the postcode is part of the label; a residual collision gets a stable rank suffix.
    seen: set[str] = set()
    for s in out:
        lab = label_for(s)
        if lab in seen:
            lab = f"{lab} [{s['rank']}]"[:200]
            k = 2
            while lab in seen:
                lab = f"{label_for(s)} [{s['rank']}.{k}]"[:200]
                k += 1
        seen.add(lab)
        s["label"] = lab
    return out, stats


def label_for(s: dict) -> str:
    parts = [p for p in (s["name"], s["line"]) if p]
    display = ", ".join(parts) or "(no address)"
    base = f"{s['provider']} · {display}"
    if s["postcode"]:
        base = f"{base} · {s['postcode']}"
    return base[:200]


def write_csv(sites: list, out_path: str):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    # deterministic order: provider, rank
    sites = sorted(sites, key=lambda s: (s["provider"], s["rank"]))
    with open(out_path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow([
            "provider_code", "label", "address_line1", "address_line2", "postcode",
            "latitude", "longitude", "suggestion_frequency", "last_seen_on", "suggestion_rank",
        ])
        for s in sites:
            line1 = s["name"] or s["line"]
            line2 = s["line"] if s["name"] else s["line2"]
            w.writerow([
                s["provider"], s["label"], line1, line2, s["postcode"],
                "", "", s["frequency"], s["last_seen"], s["rank"],
            ])


def write_report(stats: dict, report_path: str):
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    rows = []
    for provider, st in stats.items():
        cases = st["cases"]
        ib = st["image_based"]
        rows.append({
            "provider_code": provider,
            "total_cases": cases,
            "image_based": ib,
            "image_based_pct": (round(100.0 * ib / cases, 1) if cases else 0.0),
            "dropped_no_site": st["no_site"],
            "unique_sites": len(st["sites"]),
        })
    rows.sort(key=lambda r: (-r["total_cases"], r["provider_code"]))
    with open(report_path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=[
            "provider_code", "total_cases", "image_based", "image_based_pct",
            "dropped_no_site", "unique_sites",
        ], lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Rebuild the inspection-address suggestions corpus.")
    ap.add_argument("--xlsx", default="docs/reference/fullevaexportinspectionaddresses.xlsx")
    ap.add_argument("--out", default="migration/assets/schema/seed/data/inspection-suggestions.csv")
    ap.add_argument("--report", default="scripts/inspection-corpus/reports/provider-report.csv")
    args = ap.parse_args(argv)

    if not os.path.exists(args.xlsx):
        print(f"FATAL: source xlsx not found: {args.xlsx}", file=sys.stderr)
        return 2

    sites, stats = build(args.xlsx)
    write_csv(sites, args.out)
    write_report(stats, args.report)

    providers = sorted({s["provider"] for s in sites})
    print(f"sites emitted: {len(sites)} across {len(providers)} providers -> {args.out}")
    print(f"run report -> {args.report}")
    # quick top-provider echo
    counts = defaultdict(int)
    for s in sites:
        counts[s["provider"]] += 1
    top = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:12]
    print("top providers by unique sites:", ", ".join(f"{p}:{n}" for p, n in top))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
