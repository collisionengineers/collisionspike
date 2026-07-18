# ADR review decision register — 16 July 2026

Rulings distilled from the operator's 2026-07-16 ADR review, the four scoping answers given the same
day, and the second-opinion session's endorsed additions. Per the [review method](../README.md), a
later review supersedes an earlier one for the area it covers; this register governs the ADR corpus
reconciliation. Contradiction numbers C1–C17 from the working plan map to D1–D17 here.

| # | Decision | Ruling | Provenance |
|---|---|---|---|
| D1 | **Case/PO numbering is per-marker, not shared** | The operator's "shared numbering" reading is rejected: the allocator bakes the marker into prefix, lock, and regex, with per-marker floors and tests; the operator's own corpus shows independent sequences. "Shared" fits only the QDOS dual shape, where one standard mint exists and the audit identifier is *derived*. ADR-0021 stands (plus the D1b clause). | `services/data-api/src/features/cases/case-po.ts:83-104`; derived audit id in `derivedMarkerCasePo` |
| D1b | **`A.`/`AP.` decided by the original engineer's verdict** | `A.` marks an audit of a **repairable** verdict; `AP.` an audit of a **total-loss** verdict. The deciding fact is the original engineer's verdict as stated in the source material, not our audit's outcome. Review-time refinement remains as the correction mechanism. Recorded for blocked TKT-057; code-comment corrections ticketed (T6). | **operator** (scoping answer 1; [review comment](./review.md), ADR-0014) |
| D1c | **Audit filing: same folder tree, nested child pending** | Not a real conflict: audit output lands in the same Box folder *tree*; the nested `A.<Case/PO>` child folder is the pending refinement (backlog). Recorded in ADR-0014. | TKT-162 |
| D1d | **PCH cannot mint `AP.`** | Confirmed coverage gap (`MARKERED_PRINCIPALS`); folded into hygiene ticket T6 and noted in ADR-0014. | `packages/domain/src/domain/case-type.ts:55-58` |
| D2 | **ADR-0011 rewritten around the role overlap matrix** | The internal contradiction ("intermediary domains belong to the Image Source" vs distinct-roles title) is resolved by rewriting with the operator's overlap matrix and an explicit caution that "the client" is ambiguous. | **operator** (supplied matrix) |
| D3 | **ADR-0022 untouched — operator amended it directly** | The operator's own 2026-07-16 amendment resolves the retro contradiction (TKT-119/219 eligibility, parallel + combined ladder, adoption gate, `$search` semantics, TKT-222). The rewrite skips 0022 entirely, including style. Knock-ons only: CONTEXT "Retroactive Case" wording and an ADR-0004 cross-link. The amendment is on main via merge commits `e5e8f6cd` (TKT-219) and `58d7ca09` (TKT-225/226) — the branch-only caution in the working plan predates that merge. | **operator** (direct amendment); commits `e5e8f6cd`, `58d7ca09` |
| D4 | **ADR-0008 boundary extended to confirmed report delivery** | Post-EVA delivery tracking shipped (the `done` terminal with sent-email, Box-PDF, and EVA-poll detectors), so "ends at EVA handoff" is rewritten to the delivered boundary. Assessment/authoring remain out of scope. Mis-citations of ADR-0023 in the detectors are ticketed (T6). | `services/data-api/src/features/cases/case-status.ts:32-34`; `services/orchestration/src/workflows/eva/eva-report-poll.ts:1` |
| D5 | **ADR-0010 reworded** | Two unique provider references on the same VRM are distinct cases — never a "collision". The Case/PO rung is deprioritised (providers do not quote our numbers). Time is asymmetric: an incident-date mismatch may *eliminate* a candidate, never merge one. | **operator** |
| D6 | **Registration is a temporary identity for image-first cases** | "VRM is not identity" is refined, not reversed: for image-first cases the registration is the *temporary* identity until instruction arrival (TKT-118 built). New decision: `-002`/`-003` suffixes for concurrent active same-registration image cases (closes the VRM-folder collision gap) — decided 2026-07-16, not built (T2). Subsumption anchors to archive-holding adoption. | `services/orchestration/src/workflows/images/imagesUnmatched.ts:112`; `archive-holding.ts` |
| D7 | **ADR-0023 rewritten as a tiered model** | The shipped MCP image-ingest write lane (idempotency key, registration resolution, pinned test root, gates) supersedes the unbuilt signed-commit-token design. ADR-0025's invariant rescopes to the delegated staff surface; app-only lanes are governed by 0023. Network-folder/drive write is the intended expansion pattern (not built). Provider API and MCP are deliberately separate surfaces with separate auth (answers the 0020 question). | TKT-154; `services/data-api/src/features/cases/mcp-image-ingestion.ts` |
| D8 | **ADR-0017 withdrawn** | Deleted in line with TKT-206 (dropping the retention columns and jobs). The README keeps an unlinked Withdrawn row; the Archive no-automated-deletion rule survives in ADR-0012. Dangling number citations in code, bicep, and ticket records are transcribed as TKT-206 riders, not edited here. | TKT-206; riders in [`checklist.md`](./checklist.md) |
| D9 | **File Request template is required and enforced** | Doubt resolved against the comment: the template is required, gate-enforced, and configured live. ADR-0012 gains the gate citation. | `BOX_FILE_REQUEST_TEMPLATE_ID`; `missing_template_identity` gate; TKT-156 |
| D10 | **ADR-0004 gains a retro cross-link** | The parser also runs during retroactive reconstruction; one clause plus a link to ADR-0022. | operator observation; ADR-0022 |
| D11 | **ADR-0013 rewritten address-policy-first; Loc retired** | Loc is inert: no writer emits `loc=` and the stored value has no consumers. The ADR is rewritten around the address policy; Loc shrinks to a retirement note. The 2026-07-08 image-based pre-fill amendment is preserved in full (150726 M3 precedence). `locValue` residue removal is ticketed (T6). | code sweep: no `loc=` writer, `locValue` unconsumed |
| D12 | **`dedup.ts` header is false and must not seed rewrites** | The file header ("merge-by-registration", "test-only") misdescribes live code, which implements the ADR-0010 ladder. Header fix ticketed (T6). | `packages/domain/src/domain/dedup.ts:6-24`; `caseResolve.ts:13,128` |
| D13 | **Eliminator set recorded as decided, mostly unbuilt** | Only the provider-reference eliminator is built (rung 3); the incident-date eliminator is proposed-only and the principal is never compared at intake. Recorded as decided 2026-07-16, not built — ticketed (T3). | realignment R5; `caseResolve.ts` |
| D14 | **ADR-0016 subset rows are to be merged** | The code key is the exact `(provider, name\|line\|postcode)` tuple with no subset merge — hence the operator's 2+2-vs-4 split. Operator ruling: merge them — some export rows missed the first address line, leaving only road name + postcode, yet where the full address also appears they are the same place. Amendment records the merge rule; implementation ticketed (T1). | **operator** ([review comment](./review.md), ADR-0016); `scripts/evaluation/address/build_corpus.py:134-135,173` |
| D15 | **ADR-0015 corrected to the live vocabulary; draft additions adopted** | The seven-category list is stale. The ADR is corrected to the live vocabulary and the draft additions (post_report family, payment_received, autoreply/OOO/undeliverable) are **adopted now** as append-only decisions; corpus-count gating is an implementation constraint, not a decision gate. The named taxonomy corpus authority is ticketed (T7). | **operator** (scoping answer 3); `emailevals/` |
| D16 | **ADR-0009 names its engines; presence flag answered** | Engine of record: local fast-alpr ALPR with Document Intelligence Read fallback; Foundry vision for roles. Cost question answered: the registration-presence flag is a byproduct of the same ALPR pass — cheaper than vision. Exact prices stay out of the ADR (benchmark cited instead). | TKT-017 benchmark |
| D17 | **ADR-0006 gains the mileage precedence amendment** | Staff > instruction > odometer image > MOT estimator, per TKT-152. The vision odometer reader is not built; the DVSA cross-check discrepancy flag is a new decision — ticketed (T4). Vision use defers to 0009's model-change gate. | TKT-152 |

## Scoping answers (operator, 2026-07-16)

1. **`A.`/`AP.` semantics** — from source material (D1b).
2. **Guided capture** — open evaluation: File Request now; tractable/ravin commercial interest and the
   in-house CollisionCapture contender (built dark, TKT-200) both live; criteria stated, selection
   deferred. Recorded in the 0007 rewrite's Direction paragraph.
3. **ADR-0015 draft additions** — adopt now, append-only (D15).
4. **Follow-up tickets** — mint now (T1–T7; the second-opinion session added T8–T9). IDs in
   [`checklist.md`](./checklist.md).

## Second-opinion rulings (operator, 2026-07-16)

- Modify the working plan file rather than execute immediately.
- Cite the TKT-219 commit for the 0022 amendment (updated 2026-07-17: the commit is now merged —
  see D3).
- Mint the platform-ADR backfill as one follow-up ticket (T9), reserving ADR numbers 0026–0030;
  the operator drafts/approves those decisions separately.
- Promote 0024 and 0025 to Accepted alongside 0023 — all three AI ADRs shipped, so Proposed
  misstates the corpus.

## Execution-time operator comments (2026-07-17)

While the rewrite executed, the operator added three comments to [`review.md`](./review.md):

- **ADR-0007 is renamed "Receipt of images", not "image acquisition channels".** "WhatsApp intake"
  means receiving a whole *case* via WhatsApp (added manually today, there being no facility to handle
  it); using "intake" for the image channels would cause confusion. The file is
  `0007-receipt-of-images.md` and the rewrite avoids the word "intake" for image receipt. Supersedes
  the working plan's proposed filename.
- **`A.`/`AP.` semantics sharpened** — folded into D1b above.
- **ADR-0016 merge confirmed with its cause** — folded into D14 above.

## PR #108 review clarifications (operator, 2026-07-17)

Reviewing the rewrite on PR #108, the operator left nine inline clarifications. Each is applied to the
named ADR/doc and recorded here as binding review input (a later review wins for its area):

- **A./AP. verdict source (CONTEXT, 0014, 0021 — sharpens D1/D1b).** The original engineer's report
  **always** states repairable versus total loss — it is a core purpose of the report — so the marker is
  read from the report, not merely refined when a source is ambiguous. The "when the source cannot
  distinguish" hedge is removed.
- **Pre-intake triage requests (0008).** The product also tracks work before a case exists — chiefly a
  *triage request*: a provider asking for an initial call on repairable/total-loss and
  roadworthy/unroadworthy. Recorded work in its own right. New CONTEXT term added, distinguished from
  message triage.
- **Incident date, not arrival time (0010 — sharpens D5, TKT-240).** The rule is about the **incident
  date**: a different date is a different incident (eliminate); the same date is not proof of the same
  incident (a vehicle can crash twice in a day), so it needs a corroborating signal — provider
  reference, accident circumstances, or third-party details — and never merges on its own.
- **Desktop-only inspections (0013).** Collision Engineers work desktop-only; nobody is dispatched, so a
  wrong inspection address is a **report-correctness** problem, not a misdirected engineer. Rationale
  reworded.
- **Future matcher consolidation (0016, TKT-238).** Matching postcodes will be examined in a future PR
  to condense the matchers; the explicit subset-merge may then become unnecessary. Noted, not blocking.
- **Network-drive expansion is MCP, not provider API (0023).** The network-drive attach expansion is an
  MCP write-tier matter and is moved into the write-tier bullet, away from the provider-API separation
  note.
- **"Audit" is reserved for the case type (0024, sweep in TKT-243).** The logging sense is reworded to
  "activity log" in the AI-ADR cluster; a corpus-and-code terminology sweep is added to TKT-243.
- **"The EVA API submission path" (eva-sentry-api.md).** Disambiguated from other API paths.
- **Destructive defined; within-case writes allowed (integrations.md).** A destructive action is one
  that cannot be undone or reaches beyond the single case (deletion/purge, cross-case merge); those plus
  forced-status and byte-upload stay human-only. Within a single case the assistant is **not** read-only
  — it performs non-destructive writes through the confirm protocol (ADR-0024). The precise per-capability
  boundary remains owned by the capability registry (ADR-0025) and operator approval.

## Accepted slug staleness (recorded, not fixed)

ADR-0008's filename keeps its pre-rewrite slug by design (number citations bind; tickets cite the
path). ADR-0013's filename is likewise kept: the "no-runtime-address-matching" half remains accurate
and TKT-129 records cite it.
