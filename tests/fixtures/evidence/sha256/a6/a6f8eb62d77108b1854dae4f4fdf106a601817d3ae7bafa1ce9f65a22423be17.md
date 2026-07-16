# Task 4 — everyrepairloc Loc postcodes vs REPAIRER

**Question:** how do the inspection-location postcodes in `everyrepairloc.xlsx`
(authoritative Loc) line up with the 70 REPAIRER records
(67 have a full postcode)?

## Loc quality (22,634 rows)
| Loc class | Cases |
|---|---|
| full postcode | 5743 |
| partial postcode (district only) | 7474 |
| non-postcode text | 17 |
| empty (no location — desktop/image-based) | 9400 |

## Matches
- **Exact** (full Loc postcode == a repairer's full postcode):
  **1722 cases** across **54 repairers**. See
  `exact_matches_by_repairer.csv` (counts, first/last seen) and
  `exact_matches_detail.csv` (one row per case).
- **Potential** (Loc is only a *part* postcode whose district matches a repairer's
  district): **4765 cases** — `potential_matches.csv`. These are
  district-level only, so inherently ambiguous (several repairers can share a
  district; the column `other_repairers_same_district` lists them).

## Repairers not seen (by exact appearance)
| Window | Repairers not seen |
|---|---|
| 12 months | 48 |
| 24 months | 21 |
| 36 months | 19 |
| 48 months | 19 |

`NEVER appeared` = that repairer's postcode never shows up in any Loc (it may still
receive work that is desktop/image-based, where Loc is blank). Lists are cumulative.

**Caveats:** a postcode is a place, not a firm — where repairers share a postcode
(duplicate records / same estate) both are credited (`shares_postcode_with`).
3 postcodes are shared by >1 repairer record.
