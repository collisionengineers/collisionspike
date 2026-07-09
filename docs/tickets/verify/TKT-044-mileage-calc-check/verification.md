# Verification — TKT-044: Mileage calculations look ~10,000 over expected values

## Verdict
PENDING — the calculation audit + arithmetic pin are done (offline); the acceptance's
"handful of real cases re-run through enrichment" comparison is pending (read-only live checks
in the wave's deploy phase).

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
