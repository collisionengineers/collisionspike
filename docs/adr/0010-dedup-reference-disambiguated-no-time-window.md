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
