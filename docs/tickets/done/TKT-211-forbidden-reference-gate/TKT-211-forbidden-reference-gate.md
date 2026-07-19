---
id: TKT-211
title: Enforce the forbidden-reference zero state
status: done
priority: P0
area: platform
tickets-it-relates-to: [TKT-020, TKT-207, TKT-209, TKT-210, TKT-214, TKT-215, TKT-216]
research-link: docs/tickets/done/TKT-211-forbidden-reference-gate/evidence/operator-note.md
plan: PLAN-006
---

# Enforce the forbidden-reference zero state

## Problem
Repository guidance, source-adjacent material and generated surfaces must contain only approved current
terminology, contracts, identifiers and paths. Any prohibited reference makes navigation ambiguous and
violates the current-only repository policy.

## Evidence
The repository-wide inventory defines the surfaces and deterministic scan coverage required by PLAN-006.
The operator requires a clean current-only tree, with Git history as the recovery source.

## Change
Delete or rewrite every prohibited reference in source, configuration, schemas, scripts, docs, tickets,
skills, agent instructions, fixtures and binary material. Remove noncanonical behavior and identifiers at
their source, retain current domain meaning, and rely on Git history for recovery.

## Acceptance
- **A1.** A deterministic scan definition covers every prohibited technology or product name, implementation label, tenant/resource identifier, URL, command, path fragment, alias, environment key and noncanonical prefix-based logical name.
- **A2.** Final scans report zero matches across tracked paths, filenames, text content, source comments, configuration, manifests, lockfiles, schemas, generated adapters, fixture metadata and extracted/rendered text from retained images and documents.
- **A3.** Disallowed branches, adapters, aliases, fallback routes, packages, configuration keys and top-level folders are deleted rather than retained as archive or pointer stubs.
- **A4.** Current business terms, evidence, domain rules and operator decisions are retained in current-stack form. Reference removal does not delete the underlying current requirement.
- **A5.** Noncanonical prefix-based aliases are removed from application and schema-generation surfaces without changing canonical Postgres columns, current API DTOs, numeric codes or deployed resource names.
- **A6.** Negative fixtures prove the scan catches case, punctuation, spacing, URL-encoding, filename, identifier, command and rendered-document variants. Any narrow false-positive exclusion is cited, test-covered and cannot hide a real remnant.
- **A7.** Active ticket acceptance and research links are rewritten or replaced when their only source is prohibited material; completed evidence that is no longer retained remains available through Git history, not an in-tree archive.
- **A8.** EVA Sentry remains current and TKT-216 owns its route/body mismatch. The separate validation-service source is removed only because TKT-215's read-only use audit found no repository caller, configuration or observed traffic; its live resource is separate production work.
- **A9.** Complete package, Python, schema, vendored-source, evaluation, documentation, ticket and skill checks pass after removal, with no runtime contract change attributable to cleanup.
- **A10.** No purge step deploys, changes cloud configuration or writes live data.

## Validation
- Run the full path/text/metadata/rendered-binary scan against the repository and controlled positive/negative fixtures.
- Review every deleted requirement-bearing file against the disposition ledger and confirm current requirements were retained once.
- Compare route, DTO, auth, resource, schema and numeric-code baselines before and after.

## Research
Distilled from the operator's binding zero-reference requirement and the PLAN-006 repository reset.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
