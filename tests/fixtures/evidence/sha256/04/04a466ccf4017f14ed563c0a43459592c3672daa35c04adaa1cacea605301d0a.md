# Task 3 — principal recency (dormancy bands)

**Question:** which principals have not instructed us within the last
12 / 24 / 36 / 48 months?

## Method
- **Source:** `fulllist.xlsx` (near-complete EVA case list, the most complete
  recency signal — the CSV "date last used us" column is 100% empty).
- Grouped by `Principal`; **last used = max(Date Created)**, first used =
  min(Date Created), with a per-principal case count.
- **Pinned TODAY = 2026-06-18.** Cutoffs: 12m→2025-06-18, 24m→2024-06-18,
  36m→2023-06-18, 48m→2022-06-18. Each list is **cumulative** ("not used since
  the cutoff"), so the 48-month list ⊆ 36 ⊆ 24 ⊆ 12.

## Results — 440 distinct principals in the case data
| Band | Principals |
|---|---|
| active (used within 12m) | 176 |
| **not used in last 12m** | **264** |
| not used in last 24m | 165 |
| not used in last 36m | 101 |
| not used in last 48m | 68 |
| principals with no dated cases | 0 |

`all_principals_recency.csv` is the master (every principal, its band and
metrics). Names/groups are resolved from the EVA contact + job-sheet sources;
a blank name = a principal code with no contact record (see Task 6 red-herring
analysis). `contact_group` of ENGINEER/STAFF flags an internal code that is
**not** a real work provider.
