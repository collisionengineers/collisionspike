---
id: TKT-175
title: Investigate resilience to direct Archive changes
status: backlog
priority: P1
area: box
tickets-it-relates-to: [TKT-003, TKT-004, TKT-087, TKT-133, TKT-146, TKT-160, TKT-162, TKT-174]
research-link: docs/tickets/backlog/TKT-175-archive-deletion-resilience-investigation/evidence/operator-ruling-2026-07-13.md
plan: PLAN-004
---

# Investigate resilience to direct Archive changes

## Problem
Files and folders can be deleted, renamed or moved directly in the Archive, outside the application. The project does not yet have an evidence-backed account of what each operation does to database evidence, case links, readiness, retries or archive jobs. Implementing a recovery policy before establishing those facts could hide missing evidence or cascade an external deletion into further data loss.

## Evidence
- [Operator ruling](./evidence/operator-ruling-2026-07-13.md) and [empty source placeholder](./evidence/operator-source-original/issue.md) — this must be an investigation-first ticket covering direct Archive-side delete, rename and move behavior.
- TKT-003 established the canonical archive mirror, TKT-133 covers duplicate evidence identities, TKT-146 covers upload-event classification, and TKT-160 covers an intentional in-app image deletion. None is an evidence-backed failure matrix for out-of-band Archive changes.

## Proposed change
PROPOSED (not built): conduct a read-only architecture trace plus controlled experiments in an approved non-production/test folder. Produce a reproducible threat/failure matrix for direct file and folder deletion, rename and move operations, then recommend narrowly scoped follow-up tickets for detection and safe reconciliation. Do not alter production data or ship speculative cascade behavior in this investigation.

The safe default to evaluate is that an Archive-side absence marks a mirror/source discrepancy for review; it must not automatically delete database evidence, case history, notes, readiness inputs or other files.

## Acceptance
- **A1.** A versioned baseline maps the current identity and lifecycle of an archived file and folder across provider item/folder IDs, database evidence, content hashes, case/pre-case links, readiness inputs, archive outbox/jobs, webhook/event handling, retries and audit records, with source locations and deployed configuration recorded.
- **A2.** An evidence-backed matrix separately covers direct file delete, folder delete (including descendants), file rename, folder rename, file move and folder move both within and outside the configured root; restore/recreate with the same name is included where the provider permits it.
- **A3.** Every matrix row records the observed provider event/API state, application event receipt or absence, database changes, evidence-content availability, case/readiness effect, job retry/dead-letter effect, UI behavior, detection latency and whether stable provider identity survives the operation.
- **A4.** Controlled mutation experiments run only in an explicitly approved non-production/test folder with synthetic records. Production validation is read-only and is limited to configuration, logs, subscription/webhook health and already-existing discrepancies; no production file, folder, case or evidence row is changed.
- **A5.** The investigation proves whether any current path deletes or detaches database evidence, notes, email links, case links, accepted image decisions or readiness history in response to an Archive-side operation. Any demonstrated cascade-loss path is reported immediately as a named P0/P1 follow-up rather than normalized as expected behavior.
- **A6.** Detection gaps are enumerated, including missed/duplicated/out-of-order events, permission loss, webhook outage, retry exhaustion, moves across watched scope and races with upload/classification/merge. “Not observed” is distinguished from “proved safe”.
- **A7.** Reconciliation options are compared against a default-deny policy: preserve application records and audit history, distinguish moved/renamed items by stable ID where possible, mark genuinely missing bytes explicitly, recompute readiness without erasing the prior decision, and require confirmation before any destructive cleanup.
- **A8.** Proposed remediation is split into atomic follow-up tickets with priority, owner area, dependencies, precise acceptance and live-proof boundary. This investigation itself implements no production watcher, cascade, repair job or data mutation.
- **A9.** The final report includes sanitized before/after inventories, timestamps, correlation/event IDs, commands or queries needed to reproduce each observation, known provider retention/restore limits, and a 100% accounting of matrix rows as observed, unavailable with reason, or blocked by a named external prerequisite.
- **A10.** An independent reviewer can rerun the controlled matrix and obtain the same classifications, and can verify from signed-in read-only production evidence that the investigation did not mutate production state.

## Validation
- **Offline/controlled:** build synthetic case/evidence fixtures under the approved test boundary; snapshot provider tree and database state before and after one operation at a time; replay duplicate, missing and out-of-order events; compare hashes, stable IDs, jobs, readiness and audit rows.
- **Signed-in/live:** use authenticated read-only provider/API, database and telemetry views to confirm deployed wiring and inspect pre-existing discrepancies only. Capture a before/after production inventory proving zero mutation during the investigation.
- **Review gate:** require a second reviewer to challenge every “safe” conclusion, confirm that absence of an event was not treated as success, and check that each recommended implementation is represented by an atomic follow-up ticket.

## Research
Distilled 2026-07-13 from the empty `box-side-edit` placeholder and the operator's explicit investigation scope. Provider behavior and current deployed wiring must be observed rather than inferred from source code.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator ruling](./evidence/operator-ruling-2026-07-13.md)
- [Original empty placeholder](./evidence/operator-source-original/issue.md)
