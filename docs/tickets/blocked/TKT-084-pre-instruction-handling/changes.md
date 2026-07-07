# Changes — TKT-084: Pre-instruction directions email unidentified — define a handling lane

## Status
**Reclassified `backlog` → `blocked` (2026-07-07)** — blocked on an operator design sign-off. This is a
status correction, not a build.

## Commits
- No code changes — status reclassification only.

## Summary
The ticket's own acceptance and proof standard **gate the build on the operator**: Acceptance item 1 is
`[ ] Operator has signed off the proposed handling (recorded in this folder)`, and Verification
requirement 1 is "Operator sign-off — the handling-options note + the operator's choice recorded in
evidence/ **before the build**." A `pre_instruction` taxonomy lane (queue placement, hold/correlate
behaviour, retention) cannot be designed and shipped until that decision exists. No sign-off file is
present in `evidence/`, so the correct state is **blocked-on-operator** (same class as TKT-088), not
`backlog`. Unblocks when the operator signs off the proposed handling.
