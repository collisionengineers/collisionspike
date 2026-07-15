---
id: TKT-218
title: Consolidate the MCP image-ingest Box test-root to a single source of truth
status: backlog
priority: P2
area: integration
tickets-it-relates-to: [TKT-154]
research-link: docs/tickets/backlog/TKT-218-mcp-box-root-single-source/evidence/operator-note.md
plan: PLAN-004
---

# Consolidate the MCP image-ingest Box test-root to a single source of truth

## Problem

The MCP image-ingest programme test-root (`392761581105`) is currently asserted in ~5 uncoordinated
places:

- two hard-coded TypeScript constants (`MCP_IMAGE_INGEST_TEST_ROOT_ID` in
  `services/data-api/src/features/cases/mcp-image-ingestion.ts` and the literal in
  `services/orchestration/src/workflows/archive/boxArchive.ts`),
- the `BOX_FOLDER_ROOT_ID` and `MCP_IMAGE_INGEST_BOX_ROOT_ID` app-settings (cross-checked only on the
  API side in `mcpImageIngestConfigured()`),
- the Python `box-webhook` `BOX_ALLOWED_ROOT_ID`.

The orchestration literal that decides `requiredWriteRootId` is validated by **no** gate, and the
API-side `mcpImageIngestConfigured()` cannot see the Python `BOX_ALLOWED_ROOT_ID`. A future move to a
new root that updates some but not all of these silently breaks the lane (fail-closed —
`BoxScopeError` / `archive_target_unavailable` — but hard to diagnose as a config split).

This is a maintainability / configuration-coherence follow-up deferred from the PR #73 review; the lane
is fail-closed today (the Box façade independently descendant-locks to `BOX_ALLOWED_ROOT_ID`).

## Acceptance

- The test-root is defined once (e.g. a shared `@cs/domain` constant) and consumed by domain, api and
  orchestration, so the orchestration `requiredWriteRootId` is derived from — or asserted equal to — the
  single source rather than a private literal.
- The Python `box-webhook` `BOX_ALLOWED_ROOT_ID` gap is captured in the Box activation checklist
  (`docs/operations/box-activation.md`) so an operator cannot enable the gate with the façade root unset/wrong.
- The API-before-orchestration deploy-order requirement (orchestration's `data-api` `sourceLabel` is now
  required-typed) is enforced or documented in the deploy runbook.
- No behavioural change to the fail-closed root attestation; proven by the existing offline suites.

## References

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
- Source: the PR #73 / TKT-154 review (PLAN-004 production-readiness programme).
