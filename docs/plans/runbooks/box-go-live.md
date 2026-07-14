# Historical Power Platform Box cutover — non-executable pointer

> **DO NOT EXECUTE ANY COMMAND OR ACTION FROM THE FORMER VERSION OF THIS FILE.** It targeted the retired
> Power Platform/Dataverse/flow implementation, which was deprovisioned on 2026-06-27. Its production-root
> flips, scope-lock changes, webhook delete/create sequence, synthetic uploads and `[C]`/`[O]` authority labels
> were removed on 2026-07-14 so they cannot be mistaken for the live Azure cutover path. Git history retains
> the historical procedure if provenance is ever required.

The only maintained future-cutover sources are:

- [TKT-178 acceptance and hard blockers](../../tickets/blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md)
- [Current future cutover specification](../go-live/runbook.md)
- [Current readiness matrix](../go-live/readiness-matrix.md)
- [Current operator checklist](../go-live/operator-checklist.md)
- [Verified live registry](../../architecture/live-environment.md)
- [Historical remaining-steps source](../phase-7-box-integration/REMAINING-STEPS.md) — provenance only; do
  not execute it against the live stack

TKT-178 remains blocked. In addition to the signed/checksummed spreadsheet, authenticated production EVA API
and exact approved production Archive target/write authority, the current implementation still lacks the
signed-run exact-target webhook-staging operation, durable Box-event buffer/fence, source-bearing Graph renewal
telemetry, deterministic compiler, scoped write fence and other ticket prerequisites. No command text is
authorization; Outlook remains read-only and Archive writes remain inside the approved test scope outside a
separately approved future window.
