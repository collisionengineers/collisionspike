# Verification — TKT-044: Mileage calculations look ~10,000 over expected values

## Verdict
PENDING — solely on the operator confirming the expectation source.

Verified by: ticket-verifier dispatch, 10-07-26. The technical work is complete and independently
corroborated:
- **Live re-runs exist (acceptance's first branch):** 4 real case VRMs (SD66CVW, Y40SJL, AC14ACE,
  PK20FWT) re-run via POST /api/dvsa-mot/enrich with document_has_mileage:false — deltas
  +890…+3,592, all HIGH confidence, **no ~10k systematic overshoot on any real case**;
  ENRICHMENT_ENABLED=true both apps (the probed path is the live one).
- **No calculation bug (second branch's substance):** verified against source —
  functions/enrichment/analysis.py:326-442 (MOT-anchored projection,
  last_known + annual_rate × days_since/365.25, rounded to 100) and the ADR-0006 guard intact
  (document_has_mileage defaults True → estimate skipped).
- **Pin test re-run by the verifier:** 30/30 passed incl.
  test_estimate_projects_forward_from_last_mot_by_design_tkt044.
- **Independent arithmetic spot-check by the verifier:** the pinned inputs reproduce exactly 8,800
  overshoot — the "~10k over" arises only when a last-MOT anchor is ~13+ months stale at ~8k mi/yr,
  i.e. the designed projection-to-today, not a double-count.
- Expected absence: no enrichment-sourced mileage has ever overwritten a document value (all sampled
  stored mileages pdf_extraction-sourced — ADR-0006 working).

**The single open item (operator, not code):** confirm which "expected value" the original ~10k-over
observation compared against (last-MOT figure vs photographed odometer vs document value). The
original instance was never located; the assessment is a strong arithmetically-consistent explanation
rather than a confirmed reproduction. On the operator's confirmation this closes with no further
technical work (follow-up candidates 1/2/3 in changes.md — surface the estimate basis in UI;
damaged-vehicle as_of cap; prefer photographed odometer — remain optional).

Queued SQL (informational, next data pass): mileage provenance distribution (expect only
pdf_extraction); the stored-mileage comparison set (newest 20).

## Evidence (so far)
- Code audit of `functions/enrichment/analysis.py` `current_mileage_estimate` (see changes.md):
  no arithmetic bug found; the "~10,000 over" is the DESIGNED projection-to-today term
  (annual_rate × time-since-last-MOT) sitting on top of the last MOT odometer reading.
- Pin test `test_estimate_projects_forward_from_last_mot_by_design_tkt044` green
  (functions/enrichment: 30 passed) — reproduces the overshoot exactly and would fail on any
  future double-count/rate regression.
- ADR-0006 precedence confirmed intact: a document-extracted mileage suppresses the estimate
  (`document_has_mileage` default true; guard tests pre-existing + green).

## Pending / gaps
- Real-case comparison: SELECT enrichment-sourced mileage cases (provenance = enrichment) with
  VRM + stored mileage; re-run `POST /api/dvsa-mot/enrich {vrm, document_has_mileage:false}`
  (read-only DVSA/DB) and tabulate stored vs fresh estimate vs last-MOT anchor.
- Operator confirmation of which "expected value" the report compared against (last MOT figure
  vs photographed odometer) — determines whether follow-up 1/2/3 in changes.md is raised.

## How to re-verify
- `cd functions/enrichment && python -m pytest tests/test_enrich.py -q` → 30 passed.
- Live (read-only): call the enrichment Function for one known VRM with MOT history and check
  `current_mileage ≈ last MOT reading + annual_rate × years-since-MOT` (basis via DVSA MOT
  history for that VRM).

## Live comparison — 2026-07-09 (read-only; verdict stays PENDING on operator confirmation)

Four real case VRMs re-run through `POST /api/dvsa-mot/enrich` (`document_has_mileage:false`,
i.e. forcing the MOT estimate) against the case's STORED document-extracted mileage:

| VRM | stored (document, authoritative) | fresh MOT estimate (projected to today) | delta | confidence |
|---|---|---|---|---|
| SD66CVW | 87,908 | 91,500 | +3,592 | HIGH |
| Y40SJL | 88,491 | 89,800 | +1,309 | HIGH |
| AC14ACE | 81,000 | 84,500 | +3,500 | HIGH |
| PK20FWT | 31,310 | 32,200 | +890 | HIGH |

Reading: deltas of +0.9k…+3.6k are exactly the projection-to-today term (document mileage was
captured at instruction time; the estimate accrues the annual rate since the last MOT) — the
arithmetic behaves, no double-count. A "~10,000 over" reading arises when the last MOT is
much staler (~12–18 months at ~8–10k mi/yr) and the expectation is anchored on the last-MOT
figure or a photographed odometer of a car that stopped being driven — the design-vs-expectation
mismatch documented in changes.md, not a calculation bug.

Also noted from the provenance audit: every stored case mileage sampled live is
`pdf_extraction`-sourced — ADR-0006 suppression is working (the MOT estimate has not overwritten
any document value). Remaining before done: operator confirms which "expected value" the report
compared against, and whether follow-up 1/2/3 (changes.md) should be raised as a ticket.

## Verdict update — 2026-07-14 (independent PLAN-005 sweep; transcribed verbatim)

## Verdict

PENDING

## Evidence

- Acceptance lines 27–28 require either a handful of real cases matching a **manual expectation**, or an
  identified calculation bug fixed with a unit test. The recorded read-only rerun covers four real VRMs
  (SD66CVW, Y40SJL, AC14ACE, PK20FWT); fresh estimates differed from stored values by +3,592 / +1,309 /
  +3,500 / +890 and independently recomputed consistently with the documented projection formula. That
  proves arithmetic consistency, not the required operator/manual expectation.
- Fresh offline regression run: `python -B -m pytest -p no:cacheprovider
  functions/enrichment/tests/test_enrich.py -q` → **31 passed**. This includes the TKT-044 projection pin;
  no calculation defect was found to satisfy the ticket's alternate "bug identified and fixed" branch.
- Repository-wide targeted search found no later operator clarification. The sole operator evidence remains
  `evidence/operator-note.md:1` ("potentially 10,000 over expected values"), while
  `verification.md:24–25,48–49,78` still records the unanswered expectation source (last MOT vs photographed
  odometer vs document value).

## Pending / gaps

- One operator answer is still required: what value was treated as "expected" in the original report, and
  which case exhibited it? Without that, the four arithmetic-consistent reruns cannot be certified as
  matching manual expectation.
- No bug was identified, so the alternative acceptance branch is not met merely because a test pins the
  existing behavior.

## How to re-verify

- Obtain the original case/VRM and expected-value source from the operator; rerun enrichment read-only and
  compare the estimate against that stated expectation.
- If it should match a photographed/document odometer rather than a projection from the last MOT, raise/fix
  the resulting design or calculation defect and rerun the focused suite.

## Confidence + unread surfaces

High confidence in PENDING. Current tests and all ticket/review/plan references were read; the missing
surface is the operator's original comparison datum, not another code or arithmetic check.
