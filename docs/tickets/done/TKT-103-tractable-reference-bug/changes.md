# Changes — TKT-103: Tractable "768.00" wrongly captured as reference

## Status
not started

## PLAN-003 classifier wave — 2026-07-09

**Root cause (confirmed):** `_job_reference`'s structured tier
(`[A-Z]{0,5}\d{3,}(?:[_./]\d{1,4}){1,3}`) is exactly the shape of a currency amount — the Tractable
"AI Quote: £768.00" line surfaced `768.00` as `body_jobref` (and `168.12` / `487.32` on the sibling
samples; reproduced on all three TKT-102 evidence .emls).

**Shipped (sibling-first, engine-v2.10, re-vendored):**
- `rules/email_classifier.py` `_job_reference` — a **money guard**: a token whose dotted tail is
  exactly two decimals (`768.00`, comma-grouped `1,234.56`) is never a reference; a currency marker
  immediately before the token (`£`/`$`/`€`/GBP/EUR/USD) or AS the captured head (`GBP 487.32` →
  `GBP487`) also disqualifies. The structured tier now ITERATES so an early money token cannot mask a
  genuine later ref (`Quote: £768.00 for claim SAB/46286/1` → `SAB/46286/1`). The labelled tier keeps
  first-match-only semantics (+ the guard). Genuine dotted refs (`206848.001`, `45391_1`) pinned
  unchanged.
- Sibling unit tests: 3 money rejections + 3 ref-survival pins. Eval pin: manifest item
  `tkt103-tractable-lead` (the Jenosampaul sample — label stays the honest `other/other` abstain
  until TKT-102 defines the Tractable lane; the token pin lives in the unit suites since the eval
  scorer asserts labels only).

**Deploys/probes:** parser engine-v2.10 live; classifier pytest + eval `--check` clean (87.9%, all 7
mismatches pre-existing known misses).

**Remainders:** the /parse-side `_fallback_reference` has the SAME family bug (the live
`RIGERANT R1234YF` case_ref, found during TKT-085 root-causing) — new-ticket candidate, out of this
ticket's classifier scope. Live rows carrying a money `body_jobref`: none found (the three samples
were never live intakes).
