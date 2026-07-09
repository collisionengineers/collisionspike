# Verification — TKT-139: Retro Outlook $search misses spaced-ref variants (Graph tokenization: PHA5007 vs PHA 5007)

## Verdict
PENDING

## Evidence
- Offline: `retro-envelope.test.ts` `refSearchVariants` suite pins both measured miss
  directions (compact→spaced and spaced→compact) plus VRM/Case-PO shapes; orch suite 234
  passed. Deployed to `cespk-orch-dev` 2026-07-09 (71 functions re-verified).

## Pending / gaps
- Acceptance line 1 needs a LIVE drain or a recorded Graph query pair: a retro locate for
  a ref stored spaced, requested compact (or vice versa), returning the message via the
  variant union. No live Outlook mutation was made this wave (hard rule) — the proof
  rides the next natural retro drain (`POST /api/retro-case` keyed starter) or a
  verifier-run read-only query pair.

## How to re-verify
Trigger the keyed retro drain for a known spaced-form ref citing it compact (e.g. the
PHA5007 family) and check the `retroOutlookLocate` App Insights event (`found: true`,
`matchedKey`) on the orch component; or record the two raw `$search` responses
(compact + spaced) showing the union covers what the single form missed.
