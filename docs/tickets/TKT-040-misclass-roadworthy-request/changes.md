# Changes — TKT-040: Informal roadworthy work-request misrouted to 'Other'
## Status
done — live-probed against the deployed engine 2026-07-02; locked in as an eval-corpus regression pin.
## Commits
- No code change required — the deterministic classifier already treats the RTA date + Our Ref + reg +
  damage-photo attachments as a `receiving_work`/`existing_provider_instruction` work signal, not 'Other'.
- 2026-07-02 — rules-engine-v2 Phase 0/1 evidence pass: live-probed the evidence email against the
  deployed `/classify-email` route; result recorded as an eval-corpus regression pin (manifest id
  `tkt040-roadworthy-informal`, `scripts/eval-email/`). See [verification.md](./verification.md).
## Summary
An informal work request (RTA, client, Our Ref, reg, damage photos — but no formal instructions doc) was
routed to 'Other'; the classifier needs to treat damage photos plus case/vehicle identifiers as a work signal.
Part of the email-classification cluster (relates TKT-006).
