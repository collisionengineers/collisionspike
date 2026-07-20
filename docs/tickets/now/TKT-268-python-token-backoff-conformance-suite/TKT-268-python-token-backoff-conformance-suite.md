---
id: TKT-268
title: Implement the Python authentication and retry doctrine outcome
status: now
priority: P2
area: platform
tickets-it-relates-to: [TKT-267, TKT-269]
research-link: docs/tickets/now/TKT-268-python-token-backoff-conformance-suite/evidence/distillation-note.md
plan: PLAN-011
---

# Implement the Python authentication and retry doctrine outcome

## Problem
The divergent per-client authentication and retry implementations can drift silently. A fix to one
expiry, refresh, or transient-response policy is not reflected in another, and current verification has no
explicit inventory proving that every applicable client is covered. Whichever way TKT-267 decides, that gap
must close.

## Evidence
Direct inspection found distinct policies within Box, EVA, vehicle enrichment, and location assistance;
some services contain multiple clients, and parser/OCR are not part of this duplication. The current minimum
client inventory and exact source paths are recorded in the [distillation note](./evidence/distillation-note.md).
No shared behavioural contract or shared runtime module owns these policies today.

## Proposed change
Implement exactly one outcome selected by TKT-267. On the affirm path, add a shared **test-only behavioural
conformance harness** and a checked per-client inventory; the harness asserts only the expiry, refresh, and
transient-retry behaviours each client claims. On the reverse path, replace the applicable duplication with a
minimal shared runtime module mirroring the accepted `@cs/server-runtime` boundary shape, migrate every
applicable inventory entry, and keep each service's deployment inputs complete. Pin observable behaviour,
never identical implementation.

## Acceptance
- **A1. Decision gate.** TKT-267's accepted ADR names the selected path; this ticket implements that path only.
- **A2. Affirm path.** A test-only conformance harness and explicit production-client inventory exist. The
  implementation rescans for token acquisition/reuse, 401 refresh, and bounded retry sites; every discovered
  client is either exercised for every claimed behaviour or marked not applicable with a concrete rationale.
- **A3. Affirm path.** Synthetic fixtures prove that ignoring token expiry, retrying a non-transient 4xx, or
  silently omitting an inventoried client fails the harness. The location reasoner's retained-but-not
  expiry-aware bearer is represented accurately.
- **A4. Reverse path.** A shared runtime module owns the behaviours selected by the ADR, every applicable
  inventoried client consumes it, service requirements/deployment manifests remain complete, and a guard
  rejects reintroduced local copies.
- **A5. Both paths.** `verify-all.mjs` invokes the new guard or harness and every existing per-service pytest
  suite passes. Observable runtime policies are preserved unless a separately accepted criterion explicitly
  corrects one; internal wiring may change on the reverse path.
- **A6.** No live write or deployment.

## Validation
- Affirm path: run the inventory-completeness check, conformance harness, and negative fixtures.
- Reverse path: run shared-module tests, migration/duplicate guards, and service deployment-package checks.
- Both paths: run full `node verify-all.mjs`, including every Python suite.

## Research
Distilled from `workingspace/architecture-simplification/05-python-doctrine-and-parity.md` ticket 2 and
reframed after direct source inspection from "copies-in-sync" to a conditional, per-client outcome. Follows
TKT-267's decision.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Distillation note](./evidence/distillation-note.md)
