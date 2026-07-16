# TKT-065 — changes

This file summarizes the implementation already recorded in the ticket and
[verification.md](./verification.md).

- Resolved provider signals across parsed document candidates rather than relying only on the
  selected extraction envelope.
- Prevented an engineer-report candidate from outranking a usable instruction candidate.
- Added the single-candidate intermediary fallback while leaving ambiguous matches held for staff.
- Applied the recorded data corrections for affected cases and the Performance Car Hire display
  name.
- Added selection, provider-resolution, and parser-field tests for the fixed paths.

No database or live-service mutation was performed during PLAN-006.
