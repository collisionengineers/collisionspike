# Regression follow-up — 2026-07-11

PR 55 review found that the re-retire data delta casts legacy `duplicate_keys` text to JSON behind
an `AND` guard. PostgreSQL may evaluate the cast first, aborting the migration on invalid legacy
text. The delta also treats non-string JSON values as merge markers although runtime accepts only
nonblank strings.

## Acceptance

- Invalid legacy `duplicate_keys` values never abort the delta.
- Only a nonblank JSON string `mergedInto` marker retires a case.
- SQL and runtime use the same marker contract, with regression coverage.

## Implementation

- The re-retire delta now parses legacy text with a guarded JSON conversion instead of relying on
  PostgreSQL expression order.
- Only a nonblank JSON string `mergedInto` value is accepted, matching the runtime marker helper.
- Added a semantic SQL/runtime parity regression (`56161d3`).
