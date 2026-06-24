# Over-length principal codes (>8 chars) — disposition

> **Generated 2026-06-24** from `raw/principalandrepairersheets/outputs/reports/provider_corpus_recommendation.csv`
> (440 rows). These are the **37** codes the WorkProvider seed (`dataverse/.build/10-seed-workprovider.ps1`,
> `$PRINCIPALCODE_MAX = 8`) skips because `principal_code` exceeds 8 chars and the row is not `EXCLUDE`/`REVIEW`.
> Tracked against **open-questions Q-H3**.

## What these actually are

They are **not canonical provider codes** — they are **EVA-export artifacts**: the principal field was filled with
a ~9–10 char truncation of the provider/claimant **name** (punctuation/spaces included — e.g. `SILVER 100`,
`T&KMOTORS`). Real provider codes are **2–6 chars** (longest genuine code in the corpus is `STALLION`, 8).

They fall into **two populations**, and the Collision Engineers process treats them differently:

- **Recurring businesses** → a real **provider** that simply needs a canonical short Principal code minted.
- **Individuals (private claimants)** → per CE process there is **no minted Principal code at all**: the
  **vehicle registration (VRM) is used as the Case/PO key**. So these should be reclassified as VRM-keyed
  individuals, **not** given a Principal code. (See the cross-cutting VRM-keying rule — ADR-0010 dedup link.)

**Q-H3 disposition:** keep `cr1bd_principalcode maxLength = 8` (widening would only push truncated names into
Box/Case-PO prefixes); fix the stale CURRENT_STATUS "widened 8→12" claim; canonicalise only the **active recurring
businesses below**; let individuals route via VRM; **disregard anything last used >24 months ago**.

## ACTIVE — recurring businesses, used within 24 months → mint a canonical short code (5)

| Raw code | Cases | Last used | Resolved name |
|---|---|---|---|
| `WHITELINE` | 41 | 2026-06-18 | Whiteline |
| `BLACKLINE` | 14 | 2026-02-17 | Blackline |
| `SILVERLINE` | 8 | 2025-05-14 | Silverline |
| `PROACTIVE` | 7 | 2024-12-04 | Proactive Hybrid Corporate Ltd |
| `WATERMANS` | 4 | 2025-07-22 | Watermans |

## DEFERRED — open question (1)

| Raw code | Cases | Last used | Resolved name | Note |
|---|---|---|---|---|
| `SILVER 100` | 12 | 2025-10-30 | Silverstone | Operator indicates a different/unclear Case/PO process here — **deferred pending clarification**. |

## INDIVIDUALS — within 24 months, key by VRM (no Principal code) — for reference

`CHERRAKCAS` (Amin Cherrak, 2 cases, 2024-09-27 — person name despite 2 cases), `SAMBASIVAN`, `ALIHUSSAIN`,
`SKOHESTANI`, `UPRICHARD`, `KOHESTANI`, `COCKERELL`, `KOHISTANI`, `CARRUTHERS`, `PATTERSON`, `LONGWORTH`
(all 1 case). `IHVEHICLE` (IH Vehicle Group, 1 case, 2024-07-31) is a one-off business — leave deferred.

## DISREGARDED — last used >24 months ago (19)

`CCLAABOURI` (2024-06-17), `GRIFFITHS` (2024-06-13), `THEBODYSHO`, `THECARHIRE`, `R1AMMCLASS`, `CCKIRKHAM`,
`MELISSAMUR`, `PIEKARSKI`, `SAKTHIVEL`, `ARKADIUSZ`, `CRITCHLEY`, `CARHIREUK`, `STREAMLINE`, `T&KMOTORS`,
`MILLENIUM`, `GRAHAMADAM`, `IHLASMARZO`, `MICHAELRHO`, `SHOYABKIYA`.

## Recommended actions

1. Keep `cr1bd_principalcode maxLength = 8`; fix the stale "widened 8→12" claim in `CURRENT_STATUS.md`.
2. Mint canonical short codes for the **5 active businesses** (operator/business input) — corpus/clarifying-info work.
3. **Clarify `SILVER 100`** (Silverstone) — its Case/PO process is reportedly different.
4. Reclassify the **individuals** as VRM-keyed (no Principal code), consistent with the CE individual-claimant rule.
5. Ignore the 19 codes last used >24 months ago unless one re-activates.
