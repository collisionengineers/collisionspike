# Task 5 — per-principal Loc postcode profiles

For every principal, the **inspection-location footprint** drawn from
`everyrepairloc.xlsx` (authoritative Loc). Three views, each a tall table keyed by
`principal_code` (filter by principal in your spreadsheet):

| File | Contents |
|---|---|
| `full_postcodes_repeated.csv` | confirmed **full** postcodes a principal used **>1×**, with exact counts |
| `full_postcodes_once.csv` | confirmed **full** postcodes a principal used exactly **once** |
| `partial_postcodes.csv` | **partial** (district-only) Loc values, with counts |
| `per_principal_summary.csv` | one row per principal: distinct/total tallies + top location |

## Scale
- Principals with at least one Loc postcode: **265**
- Repeated full-postcode rows: **312**
- Single-occurrence full-postcode rows: **2208**
- Partial-district rows: **1327**

A *full* postcode is a complete unit (e.g. `OL1 3QR`); a *partial* is a district/
outward code only (e.g. `CH5`). Repeated full postcodes are the strongest signal of
a principal's habitual inspection sites (recovery yards, regular bodyshops); the
single-occurrence list is the long tail of one-off claimant/residential addresses.
