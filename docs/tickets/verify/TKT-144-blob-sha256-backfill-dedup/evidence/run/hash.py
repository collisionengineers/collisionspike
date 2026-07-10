#!/usr/bin/env python3
"""TKT-144 blob hasher — read-only. Streams each worklist blob via a user-delegation
SAS and computes sha256 (lowercase hex). Skip-and-record semantics: a missing or
oversized blob records an outcome row; it never fails the run.

Usage: SAS="<token>" python3 tkt144-hash.py <worklist.csv> <out.csv> [limit]
Worklist columns: id,case_id,case_po,file_name,kind_code,excluded,size_bytes,storage_path
Output columns:   id,storage_path,outcome,sha256,bytes,note
Outcomes: hashed | skip_missing | skip_oversize | error
"""
import csv, hashlib, os, sys, time, urllib.parse, urllib.request, urllib.error

ACCOUNT = "cespkevidstdev01"
CONTAINER = "evidence"
SIZE_CAP = 100 * 1024 * 1024        # skip if DB size_bytes over this
STREAM_CAP = 150 * 1024 * 1024      # hard stop while streaming (defensive)
CHUNK = 1024 * 1024
THROTTLE_S = 0.05                   # gentle pacing between blobs
RETRIES = 2                         # per-blob attempts for transient faults

def blob_url(path: str, sas: str) -> str:
    quoted = urllib.parse.quote(path, safe="/")
    return f"https://{ACCOUNT}.blob.core.windows.net/{CONTAINER}/{quoted}?{sas}"

def hash_one(path: str, sas: str):
    """returns (outcome, sha256hex|'', bytes, note)"""
    url = blob_url(path, sas)
    last_note = ""
    for attempt in range(1, RETRIES + 1):
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=120) as resp:
                h = hashlib.sha256()
                total = 0
                while True:
                    chunk = resp.read(CHUNK)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > STREAM_CAP:
                        return ("skip_oversize", "", total, "stream exceeded 150MiB cap")
                    h.update(chunk)
                return ("hashed", h.hexdigest(), total, "")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return ("skip_missing", "", 0, "HTTP 404 BlobNotFound")
            last_note = f"HTTP {e.code}"
            if e.code in (403, 401):
                return ("error", "", 0, last_note)  # auth problem: not transient
        except Exception as e:  # URLError, timeout, connection reset
            last_note = f"{type(e).__name__}: {e}"
        if attempt < RETRIES:
            time.sleep(2 * attempt)
    return ("error", "", 0, last_note)

def main():
    worklist, outpath = sys.argv[1], sys.argv[2]
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else None
    sas = os.environ["SAS"].lstrip("?")
    rows = list(csv.DictReader(open(worklist, newline="", encoding="utf-8")))
    if limit:
        rows = rows[:limit]
    counts = {}
    with open(outpath, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "storage_path", "outcome", "sha256", "bytes", "note"])
        for i, r in enumerate(rows, 1):
            size = r.get("size_bytes") or ""
            if size and int(size) > SIZE_CAP:
                out = ("skip_oversize", "", 0, f"db size_bytes {size} over 100MiB cap")
            else:
                out = hash_one(r["storage_path"], sas)
            w.writerow([r["id"], r["storage_path"], *out])
            counts[out[0]] = counts.get(out[0], 0) + 1
            if i % 50 == 0:
                print(f"progress {i}/{len(rows)} {counts}", flush=True)
            time.sleep(THROTTLE_S)
    print(f"DONE {len(rows)} rows: {counts}", flush=True)

if __name__ == "__main__":
    main()
