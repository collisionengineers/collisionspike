# Verification — TKT-095: Case `done` detectors

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started. Depends on TKT-094 (status model).

## How to re-verify
- Manual bridge flips an `eva_submitted` case to Done with a `report_delivered` audit row.
- Box report-PDF detector flips the case; webhook re-delivery is a no-op.
- Sent-email detector (gate on, test slot) flips only on a provider recipient.
