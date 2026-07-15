# Task 1 — garagesJOBSHEET vs REPAIRER.xls

**Question:** which of the 38 job-sheet garages also exist in the EVA
`REPAIRER` contact list (`REPAIRER.xls`, 70 records)?

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
| matches | 15 |
| potential | 4 |
| no match | 19 |

`potential_matches.csv` lists up to the top-3 candidate repairers per garage with
the raw signals, so a human can adjudicate. Postcode equality alone is kept as
*potential* (two firms can share a trading estate). The job sheet is the source of
truth for "garages we use"; a `no match` means that garage is **not yet an EVA
REPAIRER contact** and is a candidate to add.
