# Verification — TKT-289: Investigate whether Document Intelligence is a safe plate-OCR fallback

## Verdict
PENDING

## Evidence
(not yet verified — implementation not started; the ticket body's "current state" findings were
confirmed by direct code inspection of `services/functions/ocr/plate_adapter.py` on 2026-07-20, not by
running a test)

## Pending / gaps
Implementation not started. F1 (UK plate-grammar tightening) is not wired in; the TIER B real-accuracy
benchmark has not been run for either engine.

## How to re-verify
- `_looks_like_plate` rejects TKT-017's F1 counterexample (or an equivalent regression fixture), with a
  passing test.
- A recorded decision on whether the unused `_CURRENT_UK_RE` pattern is the right final shape.
- Either the TIER B benchmark is run, or an explicit decision to accept the fallback's unverified
  real-world accuracy is recorded.
- No change to the `fast-alpr` primary path or its live gate.
