#!/usr/bin/env python3
"""TKT-144 spot-check: byte-verify collapsed groups — download every member blob,
confirm (a) each stored sha256 matches the actual bytes, (b) the group is byte-identical."""
import csv, hashlib, os, sys, urllib.parse, urllib.request

SP, EV = sys.argv[1], sys.argv[2]
sas = os.environ["SAS"].lstrip("?")
prows = {r["id"]: r for r in csv.DictReader(open(f"{SP}/pair-rows.csv", newline="", encoding="utf-8"))}
outcomes = list(csv.DictReader(open(f"{EV}/pair-outcomes.csv", newline="", encoding="utf-8")))

members = {}
for r in prows.values():
    members.setdefault((r["case_id"], r["file_name"]), []).append(r)

def fetch_sha(path):
    url = f"https://cespkevidstdev01.blob.core.windows.net/evidence/{urllib.parse.quote(path, safe='/')}?{sas}"
    h = hashlib.sha256()
    with urllib.request.urlopen(url, timeout=120) as resp:
        while True:
            c = resp.read(1048576)
            if not c:
                break
            h.update(c)
    return h.hexdigest()

by_case, picked = {}, []
for o in outcomes:
    if o["outcome"] != "collapsed_same_hash":
        continue
    k = o["case_id"]
    if by_case.get(k, 0) < 2:
        by_case[k] = by_case.get(k, 0) + 1
        picked.append(o)

print(f"spot-checking {len(picked)} collapsed groups (every member, byte-level)")
allok = True
for o in picked:
    grp = members[(o["case_id"], o["file_name"])]
    shas = set()
    for m in grp:
        s = fetch_sha(m["storage_path"])
        shas.add(s)
        ok = s == m["sha256"].lower()
        allok &= ok
        role = "survivor" if m["id"] == o["survivor_id"] else "twin"
        print(f"{o['case_po'] or o['case_id'][:8]} | {o['file_name']} | {m['id'][:8]} ({role}) | bytes={s[:16]}.. | stored_match={ok}")
    same = len(shas) == 1
    allok &= same
    print(f"  -> group byte-identical: {same}")
print("SPOT-CHECK", "PASS" if allok else "FAIL")
sys.exit(0 if allok else 1)
