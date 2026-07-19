---
id: TKT-213
title: Reconcile tickets, indexes, plans and research links
status: done
priority: P1
area: docs
tickets-it-relates-to: [TKT-020, TKT-207, TKT-208, TKT-209, TKT-211, TKT-214]
research-link: docs/tickets/done/TKT-213-ticket-index-research-link-reconciliation/evidence/operator-note.md
plan: PLAN-006
---

# Reconcile tickets, indexes, plans and research links

## Problem
Repository cleanup changes paths used by ticket specs, evidence, evaluation manifests, plans and indexes. The current ticket tree also contains heading/status drift, missing artifacts, known-absent links and research links into stale planning material.

## Evidence
The planning audit found:
- 33 ticket rows under the wrong status heading.
- 32 ticket directories missing one or more expected close-out artifacts.
- 26 non-failing known-absent documentation links.
- 26 ticket research links into the broad planning tree.
- Plan membership and index text that require reconciliation when PLAN-006 and TKT-216 are added.

## Proposed change
Reconcile every ticket folder, frontmatter record, board row, README/index entry, plan member, research link, evidence link and evaluation-manifest path after structural moves. Replace stale research dependencies with ticket-local evidence or current canonical docs.

## Acceptance
- **A1.** Every TKT spec exists in exactly one valid status folder whose name, frontmatter status, id and slug agree; no empty or duplicate ticket shell remains.
- **A2.** Every ticket has valid required frontmatter, a resolving research link, changes.md and verification.md, plus cited evidence required by its acceptance.
- **A3.** BOARD contains every ticket exactly once under the matching status with the exact resolving path; ticket README/index counts and status sections match the filesystem and BOARD exactly.
- **A4.** Every plan has valid frontmatter, every listed member exists, and plan/member links are bidirectional. PLAN-006 contains exactly TKT-020 and TKT-207 through TKT-215; PLAN-004 includes TKT-216.
- **A5.** Research links no longer depend on retired or deleted planning trees. Required source context is moved into ticket-local evidence or a single current canonical document with preserved hash/source citation.
- **A6.** Ticket links in evaluation manifests, review checklists, ADRs, docs indexes and source comments resolve after path migration.
- **A7.** Documentation validation reports zero broken, orphan or known-absent links; no allowlist hides a link merely because its target was deleted during cleanup.
- **A8.** Ticket validation reports zero failures and zero membership/status warnings, and controlled fixtures prove duplicate ids, wrong folders, missing artifacts, stale research links and plan drift fail.
- **A9.** Completed-ticket evidence is not silently rewritten to claim new proof. Corrections use explicit current follow-up artifacts or Git history while active acceptance points only to current authority.
- **A10.** Reconciliation changes repository artifacts only and performs no live write or deployment.

## Validation
- Run ticket and documentation checks from a clean checkout with no ignored local ticket shells.
- Compare filesystem, BOARD, README/index and plan membership sets programmatically.
- Sample every research-link destination and every evaluation-manifest ticket path.

## Research
Distilled from the repository ticket-system audit and the operator's requirement to remedy every affected documentation ticket.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
