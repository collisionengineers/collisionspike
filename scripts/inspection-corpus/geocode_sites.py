#!/usr/bin/env python3
"""Geocode the inspection-suggestions corpus postcodes -> lat/lon (TKT-075, Phase A).

Reads the suggestions CSV emitted by build_corpus.py, resolves each distinct postcode to a
centroid via the free postcodes.io **bulk** endpoint, and writes latitude/longitude back into the
CSV. Results are pinned in a committed cache (`reports/postcode-geocache.json`) so re-runs are
offline-reproducible and deterministic (the verification standard requires a stable hash).

Runtime proximity ordering (TKT-076) uses in-tenant Azure Maps, NOT postcodes.io — this offline
bulk step is only for the static corpus lat/lon.

Stdlib only (urllib + json). Usage:
  python scripts/inspection-corpus/geocode_sites.py \
     [--csv migration/assets/schema/seed/data/inspection-suggestions.csv] \
     [--cache scripts/inspection-corpus/reports/postcode-geocache.json] \
     [--offline]   # only use the cache; never hit the network (CI/verify)
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
import urllib.request

BULK_URL = "https://api.postcodes.io/postcodes"
BATCH = 100


def load_cache(path: str) -> dict:
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    return {}


def save_cache(path: str, cache: dict):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # sort keys for a deterministic, diff-friendly file
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(cache, fh, indent=2, sort_keys=True)
        fh.write("\n")


def bulk_lookup(postcodes: list[str]) -> dict:
    body = json.dumps({"postcodes": postcodes}).encode("utf-8")
    req = urllib.request.Request(BULK_URL, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    out = {}
    for item in payload.get("result", []):
        q = item.get("query")
        res = item.get("result")
        if q is None:
            continue
        if res and res.get("latitude") is not None and res.get("longitude") is not None:
            out[q] = {"latitude": res["latitude"], "longitude": res["longitude"]}
        else:
            out[q] = None  # pin the miss so we don't re-query a known-invalid postcode
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="migration/assets/schema/seed/data/inspection-suggestions.csv")
    ap.add_argument("--cache", default="scripts/inspection-corpus/reports/postcode-geocache.json")
    ap.add_argument("--offline", action="store_true", help="use cache only, never hit the network")
    args = ap.parse_args(argv)

    with open(args.csv, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    fieldnames = list(rows[0].keys()) if rows else []

    postcodes = sorted({r["postcode"].strip() for r in rows if r.get("postcode", "").strip()})
    cache = load_cache(args.cache)
    missing = [pc for pc in postcodes if pc not in cache]
    print(f"{len(postcodes)} distinct postcodes; {len(cache)} cached; {len(missing)} to look up")

    if missing and not args.offline:
        for i in range(0, len(missing), BATCH):
            chunk = missing[i:i + BATCH]
            try:
                cache.update(bulk_lookup(chunk))
            except Exception as e:  # noqa: BLE001 - network best-effort; leave uncached -> blank lat/lon
                print(f"  batch {i // BATCH} failed ({e}); leaving uncached", file=sys.stderr)
            time.sleep(0.2)  # be polite to the free API
        save_cache(args.cache, cache)
    elif missing and args.offline:
        print(f"OFFLINE: {len(missing)} postcodes have no cached geocode -> blank lat/lon", file=sys.stderr)

    hits = 0
    for r in rows:
        pc = r.get("postcode", "").strip()
        geo = cache.get(pc)
        if geo:
            r["latitude"] = f"{geo['latitude']:.6f}"
            r["longitude"] = f"{geo['longitude']:.6f}"
            hits += 1
        else:
            r["latitude"] = ""
            r["longitude"] = ""

    with open(args.csv, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=fieldnames, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)

    resolved_pc = sum(1 for pc in postcodes if cache.get(pc))
    print(f"geocoded {hits}/{len(rows)} rows ({resolved_pc}/{len(postcodes)} postcodes resolved) -> {args.csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
