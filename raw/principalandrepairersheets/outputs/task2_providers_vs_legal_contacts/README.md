# Task 2 — providersJOBSHEET vs legal.xls + contactseva CSV

**Question:** which of the 58 job-sheet work-providers exist in the EVA
contact universe — `legal.xls` (the LEGAL group) ∪ `contactseva_combined.csv`
(all groups, 966 contact rows, 527 distinct codes)?

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
| matches | 52 |
| potential | 1 |
| no match | 5 |

- `matches.csv` shows whether each was matched **via code or via name**.
- `sheet2_mailbox_providers.csv` checks the 10 Sheet2 providers (firms seen
  in the mailbox but absent from the job-sheet Sheet1) against the contact universe.

A `no match` provider is on the job sheet but has **no EVA contact record** under
that code or name — a gap to create in EVA, or a code mismatch to reconcile.
