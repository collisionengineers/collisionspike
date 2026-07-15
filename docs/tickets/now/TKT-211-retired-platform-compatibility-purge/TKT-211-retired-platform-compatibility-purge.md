---
id: TKT-211
title: Purge retired-platform compatibility and identifiers
status: now
priority: P0
area: platform
tickets-it-relates-to: [TKT-020, TKT-207, TKT-209, TKT-210, TKT-214, TKT-215, TKT-216]
research-link: docs/tickets/now/TKT-211-retired-platform-compatibility-purge/evidence/operator-note.md
plan: PLAN-006
---

# Purge retired-platform compatibility and identifiers

## Problem
The repository still carries implementation references, paths, identifiers, compatibility code and explanatory history from an early pre-release platform pivot. Retaining those remnants as past context leaves two apparent systems for an agent to reason about and violates the operator's requirement for a clean current-only tree.

## Evidence
The planning scan found retired-platform material across active documentation and source-adjacent surfaces. The operator required complete removal rather than banners, archives or preservation in the current tree.

## Proposed change
Delete or rewrite every retired-platform remnant in source, configuration, schemas, scripts, docs, tickets, skills, agent instructions, fixtures and binary material. Remove compatibility behavior and inherited identifiers at their source, retain current domain meaning, and rely on Git history for the retired implementation.

## Acceptance
- **A1.** A deterministic inventory enumerates all retired-platform technology names, product names, implementation labels, tenant/resource identifiers, URLs, commands, path fragments, aliases, environment keys and old cr-prefixed logical names before removal.
- **A2.** Final scans report zero matches across tracked paths, filenames, text content, source comments, configuration, manifests, lockfiles, schemas, generated adapters, fixture metadata and extracted/rendered text from retained images and documents.
- **A3.** Retired compatibility branches, adapters, aliases, fallback routes, packages, configuration keys and top-level folders are deleted rather than renamed into past-state, archive or deprecated stubs.
- **A4.** Current business terms, evidence, domain rules and operator decisions are retained in platform-neutral or current-stack form. Deletion of retired implementation prose does not delete the underlying current requirement.
- **A5.** Old prefix-based aliases are removed from application and schema-generation surfaces without changing canonical Postgres columns, current API DTOs, numeric codes or deployed resource names.
- **A6.** Negative fixtures prove the scan catches case, punctuation, spacing, URL-encoding, filename, identifier, command and rendered-document variants. Any narrow false-positive exclusion is cited, test-covered and cannot hide a real remnant.
- **A7.** Active ticket acceptance and research links are rewritten or replaced when their only source is retired material; completed evidence that is no longer retained remains available through Git history, not an in-tree archive.
- **A8.** The retained EVA Sentry and EVA validation services are not removed merely because their ancestry or call sites are unclear. TKT-215 owns read-only use evidence and TKT-216 owns the route/body mismatch.
- **A9.** Complete package, Python, schema, vendored-source, evaluation, documentation, ticket and skill checks pass after removal, with no runtime contract change attributable to cleanup.
- **A10.** No purge step deploys, changes cloud configuration or writes live data.

## Validation
- Run the full path/text/metadata/rendered-binary scan against the repository and controlled positive/negative fixtures.
- Review every deleted requirement-bearing file against the disposition ledger and confirm current requirements were retained once.
- Compare route, DTO, auth, resource, schema and numeric-code baselines before and after.

## Research
Distilled from the operator's binding requirement to remove all traces of the retired pre-release platform rather than preserve an explanatory narrative.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
