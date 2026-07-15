---
id: TKT-020
title: Repository structure and documentation reset
status: verify
priority: P0
area: docs
tickets-it-relates-to: [TKT-019, TKT-207, TKT-208, TKT-209, TKT-210, TKT-211, TKT-212, TKT-213, TKT-214, TKT-215]
research-link: docs/tickets/verify/TKT-020-docs-cleanup/evidence/operator-note-2026-07-15.md
plan: PLAN-006
---

# Repository structure and documentation reset

## Problem
The repository has overlapping source, evidence, documentation, planning and agent-authority roots. Stale paths and duplicate narratives force an agent to infer which source is current and allow noncanonical material to conflict with current product and architecture documentation.

## Evidence
- The 2026-07-15 planning snapshot contains 3,268 tracked files across 775 directory paths; docs contains 1,587 files across 537 directory paths.
- Ticket and documentation checks currently tolerate known-absent links and contain index, status-heading, artifact and research-link drift.
- The operator supplied a locked target structure, authorized deletion and movement across the repository, required a zero-reference current tree, and protected the four workingspace files from content edits.

## Proposed change
Execute PLAN-006 as one evidence-preserving repository reset: inventory every item, relocate source and evidence into the locked structure, remove stale and generated material, establish one documentation and agent authority, repair the ticket system, and make the final shape enforceable from a clean checkout.

## Acceptance
- **A1.** [PLAN-006](../../plans/PLAN-006-repository-structure-documentation-reset.md) lists TKT-020 and TKT-207 through TKT-215, and every member points back to PLAN-006.
- **A2.** The repository matches PLAN-006's locked target structure and TKT-207 supplies an exact pre-change/final disposition ledger for every file and directory.
- **A3.** The final tracked tree contains zero prohibited technology names, implementation names, identifiers, URLs, commands, noncanonical prefix-based logical names, disallowed paths or explanatory narratives.
- **A4.** The four workingspace files are moved only to /workingspace and retain their exact names, bytes and SHA-256 hashes; evidence manifests preserve every retained artifact hash and logical occurrence.
- **A5.** Runtime routes, DTOs, authentication behavior, Azure resource names, Postgres columns and numeric codes are unchanged by cleanup, and production source has no mock, sample, demo, seed, fixture or evaluation imports.
- **A6.** Documentation links, ticket/board/plan/index parity and agent/skill generation are exact, with zero hidden exceptions or independent copies.
- **A7.** Clean package, Python, schema, vendored-source and evaluation validation passes locally and in CI through TKT-214.
- **A8.** No implementation step performs a live write or deployment. TKT-215 is read-only, and TKT-216 remains separate under PLAN-004.

## Validation
- Compare the final tree and hashes with TKT-207 and TKT-208 artifacts.
- Run the complete local gate documented by TKT-214 from a clean checkout and inspect the matching CI run.
- Independently sample source, evidence, docs, tickets, agent adapters and every deletion class against the disposition ledger.

## Research
This ticket applies the operator's 2026-07-15 repository-organization and hygiene direction to canonical documentation under PLAN-006.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator direction](./evidence/operator-note-2026-07-15.md)
- [Earlier whole-repository follow-up](./evidence/operator-followup-12-07-26.md)
- [Regression record](./changes-regression-12-07-26.md)
