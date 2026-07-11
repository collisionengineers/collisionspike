# Regression follow-up — 2026-07-11

PR 55 review found that `INSERT ... WHERE NOT EXISTS` can create duplicate overview-chase drafts
under concurrent status evaluation. The draft also records/surfaces an activity equivalent to a
sent chase, which can mislead staff into believing the request has already gone out.

## Acceptance

- Concurrent evaluations create at most one active overview-chase draft per case.
- Draft suggestions are presented as drafted, never as sent/chased.
- A sent chase continues to present as chased.
- Database and API regression tests cover concurrency/idempotency and status-aware activity wording.

## Implementation

- Suggested overview chases have a dedicated `suggested` flag, audit action and exact partial unique
  index; staff-created/sent chasers retain their distinct wording (`77d0478`).
- The detector locks and re-reads the case, merge marker, evidence counts and provider immediately
  before insertion, so a concurrent finalise/merge or evidence decision cannot use the caller's stale
  snapshot (`057f7a0`).
- The Chasers tab now surfaces the existing Overview photo request draft even when ordinary missing-
  instruction/image templates are no longer eligible. Drafted and sent states retain distinct,
  truthful wording (`070a0bf`).
