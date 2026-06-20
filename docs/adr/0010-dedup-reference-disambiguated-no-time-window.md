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

## Status — M1 implementation (2026-06-20): registration auto-merge LIVE

The first rung remains live: exact `Message-ID` / payload-hash repeats are dropped as true
duplicates (in `CS Intake`, via the `cr1bd_payloadhash` dedup probe).

**NEW (2026-06-20, LIVE):** the `CS Case Resolve` flow — previously the orphaned, OFF dedup-ladder
host — has been **repurposed and turned ON** (`statecode=1`) to run **instructions↔images
auto-merge by registration**. When an **instructions** case (it carries a Case/PO) and an **images**
case (no Case/PO, identified by registration) share the **same non-empty registration (VRM)** and
are the **only** complementary pair open for that registration, they are **auto-merged into the
instructions case** (the survivor): the image case's Evidence is re-pointed to the survivor, the
survivor is marked Linked (`cr1bd_caselinkstate = Linked`), the image case is set
`linked_to_instruction` and **deactivated** (retained + reversible), and `CS Status Evaluate`
re-runs on the survivor so a now-complete case lands in **Review** (the human is the safety net).
`CS Intake` calls `CS Case Resolve` as a non-blocking child after `Run_parse`
(`Run_case_resolve`, passing `caseId`).

This honors the no-wrong-auto-merge invariant: if a registration has **more than one** complementary
open candidate, the flow does **NOT** auto-merge — it sets the arrival to
`duplicate_risk` (→ **Held**) for a person, because one registration can legitimately carry two
separate claims (the core ADR-0010 rule). Zero matches → no-op. The merge is **idempotent** (an
already-Linked / inactive / terminal case is skipped) and **failure-isolated** (a merge hiccup never
stalls intake).

**Implementation note on linkage storage:** there is **no case→case lookup column** in the schema
(`cr1bd_imagesourceid` is a lookup to the `cr1bd_imagesource` *master* table, **not** a case), so the
absorbed image-case id is recorded as merge provenance in `cr1bd_caselinkstate = Linked` plus a JSON
blob in the `cr1bd_duplicatekeys` Memo — **not** in `cr1bd_imagesourceid`.

**Still deferred (M2/M3):** the *reference-vs-VRM* disambiguation rungs for **same-channel**
arrivals (reference-match → attach; reference-differs → new + collision flag; no-reference +
VRM-match → propose-attach/staff-confirm) are **not yet implemented** for the general case; the live
behaviour is specifically the instructions↔images registration merge above. No data is lost; the
conservative failure mode remains "two Cases a human reconciles," never a wrong auto-merge.
