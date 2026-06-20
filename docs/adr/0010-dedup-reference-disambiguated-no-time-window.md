# Deduplication: reference-disambiguated, human-confirmed; no time-window auto-merge

The same VRM can legitimately have multiple distinct claims — **even two accidents on the same day**
— so **time/recency cannot decide whether two arrivals are the same case.** Rules:

- Exact `Message-ID` / payload-hash repeat → true duplicate, **drop**.
- New arrival carries a **claim/reference** matching an open Case's reference → **attach** (same case).
- Reference **differs** from the open Case(s) for that VRM → treat as a **new Case** (flag the VRM
  collision so staff are aware).
- **No reference** (e.g. an images-only arrival) and the VRM matches an open Case → **propose attach,
  staff confirm** (could be the missing images for that case, or a second incident).
- **Never** auto-merge on VRM + time, and **never** across different Work Providers.

Ambiguous matches always go to the review queue for an **attach-vs-new** decision; merges are
human-confirmed and reversible. Refines ADR-0002.

## Status — M1 implementation (2026-06-20): dedup ladder DEFERRED

Only the **first rung is live in M1**: exact `Message-ID` / payload-hash repeats are dropped as
true duplicates (in `CS Intake`, via the `cr1bd_payloadhash` dedup probe). The **reference-vs-VRM
disambiguation ladder** above (reference-match → attach; reference-differs → new + collision flag;
no-reference + VRM-match → propose-attach/staff-confirm) is **not yet implemented**. The
`CS Case Resolve (ADR-0010 dedup)` flow that was to host this ladder was built but left
**orphaned** (a `Request`-triggered child flow nothing called); it has been **turned OFF**
(`statecode=0`) on 2026-06-20 to stop it presenting as live capability.

**Known M1 limit:** a second arrival for an already-open VRM is **not** auto-attached or
collision-flagged — it lands as an independent Case for manual triage. This is acceptable for the
spike (merges were always human-confirmed anyway) and is the planned M2/M3 work to re-activate the
ladder behind `CS Case Resolve`. No data is lost; the conservative failure mode is "two Cases a
human reconciles," never a wrong auto-merge.
