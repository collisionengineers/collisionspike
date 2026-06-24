#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""preprocess-eva-inspection-export.py — OFFLINE pre-processor for the Phase-4a
inspection-address corpus revamp (ADR-0016, realising it; ADR-0013 RE-AFFIRMED).

WHAT THIS IS
------------
A standalone, deterministic, OFFLINE pre-processor that turns the 2-year EVA
full-address export (`fullevaexportinspectionaddresses.xlsx`, ~17,737 inspection
rows) into the SEED CSV that `dataverse/.build/16-seed-suggested-addresses.ps1`
consumes. It dedups raw inspections into UNIQUE PHYSICAL SITES per provider and
computes frequency + recency ranking metadata.

ADR-0013 STAYS BINDING (re-affirmed by ADR-0016): there is NO runtime
inspection-address matcher/resolver. EVERYTHING here is offline corpus-build +
suggestion-ORDERING metadata. Every emitted row is a SUGGESTION the operator
must pick/confirm per case; nothing auto-confirms, nothing is mirrored onto a
Case. See:
  - docs/adr/0013-loc-export-artifact-no-runtime-address-matching.md  (binding)
  - docs/adr/0016-inspection-address-corpus-eva-export.md    (the decision realised here)

NO NETWORK / NO TENANT. stdlib + openpyxl only. Reads an .xlsx, writes a CSV.
The output CSV carries BUSINESS-SITE suggestions only (no claimant PII): the
PII columns from the export (Insured Name, Claim No, Vehicle Reg) are dropped
and NEVER written.

KEY DOMAIN RULES (verified against the live export 2026-06-24)
-------------------------------------------------------------
* Principal / provider_code = the LEADING [A-Za-z]+ run of `Case ID`, uppercased
  (e.g. 'fw24126' -> 'FW', 'qdos24731' -> 'QDOS', 'r1am24022' -> 'R'). Prefix
  length VARIES (1-5). 'A' is a valid prefix.
* A VRM-shaped `Case ID` (UK plate, spaces ignored, e.g. 'AB12CDE', 'yl19 tup',
  'aa02com') is an INDIVIDUAL / private-claimant case keyed by VRM, with NO
  Principal code. These are RECOGNISED + COUNTED but EXCLUDED from the output
  (a one-off individual site is not a reusable per-provider suggestion).
* DROP rows where InspLocName OR InspLocAdd reads as 'Image Based Assessment'
  — no physical location. The export contains MANY spelling/punctuation
  variants (e.g. 'Image-based Assessment', 'image based asessment',
  'images based assessment', '(image based assessment)', 'image based
  inspection'), so the match is robust: normalise the field to lowercase
  letters-only, then drop when it starts with 'imag(e)…bas(e)d' followed by an
  'assess'/'inspection' stem (typo-tolerant). Verified 2026-06-24: catches all
  24 distinct image-based variants present, ~11,887 rows, with no observed
  legitimate-site false positives.
* DROP rows with NO usable site (InspLocName / InspLocAdd / InspLocAdd1 all blank).
  NOTE: an empty InspLocAdd alone is NOT a drop — ~68% of rows have an empty
  InspLocAdd but a real InspLocName + InspLocPCode (still a usable site).
* full_address = comma-join of [InspLocName, InspLocAdd, InspLocAdd1]
  (non-blank, trimmed, case-insensitively de-duped tokens, SITE NAME FIRST so
  16-seed's Split-AddressLines treats line 1 as the repairer-bind site name).
* Postcode normalisation is DETERMINISTIC and OFFLINE: UPPER, compact, then a
  single space before the final 3 chars when the compact form is 5-7 alnum.
  postcode.io is the GATED live-normalise step (AZURE_MAPS_ENABLED / out of
  scope here) — we do NOT call it.

AGGREGATION
-----------
Dedup to UNIQUE SITES keyed on (provider_code, full_address) [postcode is the
secondary key]. Per site:
  frequency = number of source inspections folded in
  last_seen = max(Created Date parsed as %d/%m/%Y) -> 'YYYY-MM-DD'
  loc_value = normalised postcode
  address_index_for_loc = 1-based index disambiguating distinct sites that share
                          (provider, loc_value)
  rank      = 1-based within the provider by (frequency desc, last_seen desc,
              full_address asc) for stable, deterministic ties.

OUTPUT CONTRACT (exact 12 columns, this order):
  provider_code, loc_value, address_index_for_loc, full_address,
  address_postcode, address_status, evidence_source, evidence_detail,
  frequency, last_seen, rank, case_key_kind

DEFERRED (OUT OF SCOPE this turn, documented per ADR-0016):
  the "closest-to-accident" / claimant-home PROXIMITY ordering signal needs two
  best-effort parser extractions (accident location, claimant home address) in
  the sibling cedocumentmapper_v2.0 plus GATED geocoding (AZURE_MAPS_ENABLED).
  This script does NOT emit a proximity signal; it emits frequency + recency only.

USAGE:
  python dataverse/.build/sources/preprocess-eva-inspection-export.py
  python dataverse/.build/sources/preprocess-eva-inspection-export.py --in <xlsx> --out <csv>
"""

from __future__ import annotations

import argparse
import csv
import datetime as _dt
import re
import sys
from pathlib import Path

try:
    import openpyxl  # type: ignore
except ImportError:  # pragma: no cover - environment guard
    sys.stderr.write(
        "ERROR: openpyxl is required (stdlib + openpyxl only). pip install openpyxl\n"
    )
    raise

# --- repo-relative defaults ------------------------------------------------
# This file lives at <repo>/dataverse/.build/sources/preprocess-eva-inspection-export.py
_HERE = Path(__file__).resolve()
_REPO_ROOT = _HERE.parents[3]  # sources -> .build -> dataverse -> <repo>

DEFAULT_IN = (
    _REPO_ROOT
    / "docs"
    / "plans"
    / "to-integrate-into-phases"
    / "inspection-address-revamp"
    / "fullevaexportinspectionaddresses.xlsx"
)
DEFAULT_OUT = _HERE.parent / "inspection-suggestions-from-eva-export.csv"

RUN_DATE = "2026-06-24"  # date stamp for evidence_source / notes (see task brief)

# Exact source header (sheet 0). We index by name, not position, but assert it.
EXPECTED_HEADER = [
    "Case ID",
    "Vehicle Reg",
    "Insured Name",
    "Claim No",
    "Created Date",
    "InspLocAdd",
    "InspLocPCode",
    "InspLocName",
    "InspLocCont",
    "InspLocAdd1",
]

# PII columns that MUST NOT appear in the output corpus.
PII_COLUMNS = ("Insured Name", "Claim No", "Vehicle Reg")

OUTPUT_HEADER = [
    "provider_code",
    "loc_value",
    "address_index_for_loc",
    "full_address",
    "address_postcode",
    "address_status",
    "evidence_source",
    "evidence_detail",
    "frequency",
    "last_seen",
    "rank",
    "case_key_kind",
]

# Robust "Image Based Assessment" detector. The export carries 24 distinct
# spellings/punctuations of this marker (hyphenation, plural, bracketed, and a
# long tail of typos like 'asessment', 'assesment', 'assessmnet', plus 'image
# based inspection'). Normalising to letters-only and matching an
# 'imag…bas…(assess|inspection)' signature drops them all deterministically
# without depending on a hand-maintained typo list. Verified offline 2026-06-24.
_LETTERS_ONLY = re.compile(r"[^a-z]")
_IMAGE_BASED_RE = re.compile(
    r"imag\w*?bas\w*?(?:asse|asss|ases|asess|inspe)"
)


def is_image_based(*fields: str) -> bool:
    """True if any field reads as an 'Image Based Assessment' marker (typo-tolerant)."""
    for f in fields:
        norm = _LETTERS_ONLY.sub("", (f or "").lower())
        if norm.startswith("imag") and _IMAGE_BASED_RE.match(norm):
            return True
    return False


ADDRESS_STATUS = "eva_export"  # 16-seed -> sourceLabel 'suggested:eva_export'
EVIDENCE_SOURCE = f"EVA full-address export {RUN_DATE}"

# --- UK VRM detection (compact, upper-cased, spaces ignored) ---------------
# These cover the formats actually present in the export plus the standard set.
# A provider Case ID is alpha-run + digits (and may carry embedded letters, e.g.
# 'r1am24022'); a VRM ENDS in letters / is a pure dateless plate. The provider
# guard below stops a short provider code being mis-read as a dateless plate.
_VRM_PATTERNS = [
    re.compile(r"^[A-Z]{2}[0-9]{2}[A-Z]{3}$"),  # current  AA00AAA  (e.g. AB12CDE, AA02COM)
    re.compile(r"^[A-Z][0-9]{1,3}[A-Z]{3}$"),   # prefix   A000AAA
    re.compile(r"^[A-Z]{3}[0-9]{1,3}[A-Z]$"),   # suffix   AAA000A
    re.compile(r"^[A-Z]{1,2}[0-9]{1,4}$"),      # dateless AA0000
    re.compile(r"^[0-9]{1,4}[A-Z]{1,3}$"),      # dateless 0000AA
]
# A clear provider Case ID: alpha run (>=2) then >=3 trailing digits as the case
# number (e.g. QDOS24731, FW24126). Used ONLY to veto a spurious VRM match. The
# >=3 digit floor matches the domain rule (a provider case number is 3 digits —
# see admin-overview.md / CLAUDE.md Case/PO format), so a 2-alpha value with a
# 1-2 digit tail (which a short provider code with a low case number COULD share
# with a dateless plate) reads as a plate. This is data-clean today (0 of 198
# VRM-classified IDs are short provider codes); to keep the exclusion auditable
# rather than silent, a sample of excluded VRM Case IDs is printed in the summary.
_PROVIDER_SHAPE = re.compile(r"^[A-Za-z]{2,5}[0-9]{3,}$")
_LEAD_ALPHA = re.compile(r"^[A-Za-z]+")


def is_vrm_shaped(case_id: str) -> bool:
    """True if Case ID looks like a UK VRM (individual claimant), not a provider case.

    Spaces are ignored. A value that clearly reads as a provider case (2-5 alpha
    then a 3+ digit case number) is NOT treated as a VRM even if it incidentally
    matches a dateless pattern.
    """
    compact = re.sub(r"\s+", "", case_id).upper()
    if not compact:
        return False
    if _PROVIDER_SHAPE.match(compact):
        return False
    # Also test the first whitespace-token (handles trailing words like 'hj64jno guard').
    first_token = case_id.upper().split()[0] if case_id.split() else ""
    first_compact = re.sub(r"\s+", "", first_token)
    return any(p.match(compact) for p in _VRM_PATTERNS) or any(
        p.match(first_compact) for p in _VRM_PATTERNS
    )


def leading_alpha_prefix(case_id: str) -> str:
    """The leading [A-Za-z]+ run, uppercased — the Principal / provider_code."""
    m = _LEAD_ALPHA.match(case_id.strip())
    return m.group(0).upper() if m else ""


def normalise_postcode(raw: str) -> str:
    """Deterministic, OFFLINE postcode normalisation — NO network.

    UPPER + compact, then a single space before the final 3 chars when the
    compact form is 5-7 alphanumerics (a full UK postcode). Outward-only
    fragments (3-4 chars, e.g. 'BL3', 'SW16') are returned compacted with no
    inserted space. postcode.io is the GATED live-normalise step and is NOT
    called here.
    """
    if not raw:
        return ""
    compact = re.sub(r"\s+", "", str(raw)).upper()
    if not compact.isalnum():
        # keep only alnum to form a deterministic key; tolerate stray punctuation
        compact = re.sub(r"[^A-Z0-9]", "", compact)
    if 5 <= len(compact) <= 7:
        return f"{compact[:-3]} {compact[-3:]}"
    return compact


def compose_full_address(name: str, add: str, add1: str) -> str:
    """Comma-join [InspLocName, InspLocAdd, InspLocAdd1], site name first.

    Tokens are trimmed; blanks omitted; case-insensitive duplicate tokens
    collapsed (the export frequently repeats a street in both InspLocAdd and
    InspLocAdd1). The site name is preserved as the FIRST part so 16-seed's
    Split-AddressLines / repairer-bind treats it as the site name.
    """
    out: list[str] = []
    seen: set[str] = set()
    for tok in (name, add, add1):
        t = (tok or "").strip()
        if not t:
            continue
        key = t.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(t)
    return ", ".join(out)


def parse_created(raw: str) -> _dt.date | None:
    """Parse the 'dd/mm/yyyy' STRING Created Date. Returns None if unparseable."""
    s = (raw or "").strip()
    if not s:
        return None
    try:
        return _dt.datetime.strptime(s, "%d/%m/%Y").date()
    except ValueError:
        # tolerate an already-datetime cell value or odd separators
        try:
            return _dt.datetime.strptime(s.split()[0], "%d/%m/%Y").date()
        except (ValueError, IndexError):
            return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="OFFLINE pre-processor: EVA full-address export -> 16-seed suggestion CSV (ADR-0016)."
    )
    parser.add_argument("--in", dest="in_path", default=str(DEFAULT_IN),
                        help="source .xlsx (default: the tracked EVA export)")
    parser.add_argument("--out", dest="out_path", default=str(DEFAULT_OUT),
                        help="output CSV (default: inspection-suggestions-from-eva-export.csv)")
    args = parser.parse_args(argv)

    in_path = Path(args.in_path)
    out_path = Path(args.out_path)
    if not in_path.is_file():
        sys.stderr.write(f"ERROR: source xlsx not found: {in_path}\n")
        return 2

    wb = openpyxl.load_workbook(in_path, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    row_iter = ws.iter_rows(values_only=True)

    header = list(next(row_iter))
    # Build a name->index map; assert the columns we depend on exist.
    col = {str(h).strip(): i for i, h in enumerate(header) if h is not None}
    missing = [c for c in EXPECTED_HEADER if c not in col]
    if missing:
        sys.stderr.write(
            f"ERROR: source header missing expected columns: {missing}\n"
            f"       got: {header}\n"
        )
        return 2

    i_caseid = col["Case ID"]
    i_created = col["Created Date"]
    i_add = col["InspLocAdd"]
    i_pc = col["InspLocPCode"]
    i_name = col["InspLocName"]
    i_add1 = col["InspLocAdd1"]

    # counters
    total = 0
    dropped_image = 0
    dropped_nosite = 0
    vrm_individuals = 0
    vrm_samples: list[str] = []  # excluded VRM-keyed Case IDs (sample, for audit)
    provider_kept = 0  # source rows folded into provider sites

    # site aggregation keyed on (provider_code, full_address)
    # value: dict(postcode, freq, last_seen:date|None)
    sites: dict[tuple[str, str], dict] = {}

    def _cell(row, idx) -> str:
        v = row[idx] if idx < len(row) else None
        return "" if v is None else str(v).strip()

    for row in row_iter:
        if row is None:
            continue
        case_id = _cell(row, i_caseid)
        if not case_id:
            continue
        total += 1

        name = _cell(row, i_name)
        add = _cell(row, i_add)
        add1 = _cell(row, i_add1)

        # DROP: image-based assessment in InspLocName OR InspLocAdd (typo-tolerant)
        if is_image_based(name, add):
            dropped_image += 1
            continue

        # DROP: no usable site (all three site fields blank)
        if not (name or add or add1):
            dropped_nosite += 1
            continue

        # BRANCH: VRM-shaped Case ID -> individual claimant, no provider code, EXCLUDE
        if is_vrm_shaped(case_id):
            vrm_individuals += 1
            if len(vrm_samples) < 15:
                vrm_samples.append(case_id)
            continue

        provider = leading_alpha_prefix(case_id)
        if not provider:
            # no leading alpha and not VRM-shaped — treat as unusable (defensive)
            dropped_nosite += 1
            continue

        full_address = compose_full_address(name, add, add1)
        if not full_address:
            dropped_nosite += 1
            continue

        postcode = normalise_postcode(_cell(row, i_pc))
        created = parse_created(_cell(row, i_created))

        provider_kept += 1
        key = (provider, full_address)
        site = sites.get(key)
        if site is None:
            sites[key] = {"postcode": postcode, "freq": 1, "last_seen": created}
        else:
            site["freq"] += 1
            # postcode secondary key: keep first non-empty seen for determinism
            if not site["postcode"] and postcode:
                site["postcode"] = postcode
            if created and (site["last_seen"] is None or created > site["last_seen"]):
                site["last_seen"] = created

    wb.close()

    # --- assemble rows; compute per-(provider,loc_value) index + per-provider rank ---
    # group sites by provider for ranking and by (provider, loc_value) for indexing
    by_provider: dict[str, list[tuple[str, dict]]] = {}
    for (provider, full_address), site in sites.items():
        by_provider.setdefault(provider, []).append((full_address, site))

    out_rows: list[list] = []
    provider_site_counts: dict[str, int] = {}

    for provider in sorted(by_provider):
        entries = by_provider[provider]
        provider_site_counts[provider] = len(entries)

        # address_index_for_loc: 1-based within (provider, loc_value).
        # Deterministic ordering inside a loc bucket: full_address asc.
        loc_counter: dict[str, int] = {}

        # rank: 1-based within provider by (frequency desc, last_seen desc,
        # full_address asc) — the trailing full_address asc makes ties stable
        # and the whole sort deterministic.
        ranked = sorted(
            entries,
            key=lambda it: (
                -it[1]["freq"],
                -(it[1]["last_seen"].toordinal() if it[1]["last_seen"] else 0),
                it[0],
            ),
        )
        rank_of: dict[str, int] = {fa: i + 1 for i, (fa, _s) in enumerate(ranked)}

        # index within loc buckets — process in deterministic full_address order
        for full_address, site in sorted(entries, key=lambda it: it[0]):
            loc_value = site["postcode"]
            loc_counter[loc_value] = loc_counter.get(loc_value, 0) + 1
            address_index_for_loc = loc_counter[loc_value]

            ls = site["last_seen"]
            last_seen_str = ls.strftime("%Y-%m-%d") if ls else ""
            last_seen_disp = ls.strftime("%d/%m/%Y") if ls else "unknown"
            freq = site["freq"]
            evidence_detail = f"seen {freq} time{'s' if freq != 1 else ''}; last {last_seen_disp}"

            out_rows.append([
                provider,                       # provider_code
                loc_value,                      # loc_value (normalised postcode)
                address_index_for_loc,          # address_index_for_loc
                full_address,                   # full_address (site name first)
                site["postcode"],               # address_postcode
                ADDRESS_STATUS,                 # address_status = 'eva_export'
                EVIDENCE_SOURCE,                # evidence_source
                evidence_detail,                # evidence_detail
                freq,                           # frequency
                last_seen_str,                  # last_seen 'YYYY-MM-DD'
                rank_of[full_address],          # rank (1=top within provider)
                "provider",                     # case_key_kind (always 'provider')
            ])

    # stable file order: provider asc, then rank asc
    out_rows.sort(key=lambda r: (r[0], r[10], r[3]))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(OUTPUT_HEADER)
        w.writerows(out_rows)

    distinct_providers = len(by_provider)
    distinct_sites = len(sites)
    top5 = sorted(provider_site_counts.items(), key=lambda kv: (-kv[1], kv[0]))[:5]

    # --- summary to stdout ---
    print("=" * 72)
    print("EVA inspection-address export pre-processor — ADR-0016 (ADR-0013 binding)")
    print("OFFLINE / deterministic / no network. Suggestions only; staff confirm per case.")
    print("=" * 72)
    print(f"source xlsx           : {in_path}")
    print(f"output csv            : {out_path}")
    print("-" * 72)
    print(f"total source rows     : {total}")
    print(f"dropped image-based   : {dropped_image}")
    print(f"dropped no-site       : {dropped_nosite}")
    print(f"vrm individuals (excl): {vrm_individuals}")
    if vrm_samples:
        print(f"  vrm excluded (sample): {', '.join(vrm_samples)}")
    print(f"provider rows kept    : {provider_kept}")
    print(f"distinct providers    : {distinct_providers}")
    print(f"distinct sites (rows) : {distinct_sites}")
    print("-" * 72)
    print("top-5 providers by site count:")
    for code, cnt in top5:
        print(f"  {code:<8} {cnt} sites")
    print("=" * 72)
    print(f"wrote {len(out_rows)} suggestion rows to {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
