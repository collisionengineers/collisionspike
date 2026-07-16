# Operator note — TKT-218

Deferred from the PR #73 / TKT-154 review (2026-07-15).

The MCP image-ingest Box test-root `392761581105` is asserted in ~5 uncoordinated places and the
orchestration `requiredWriteRootId` literal is gated by nothing. Consolidate to one shared constant and
capture the Python `BOX_ALLOWED_ROOT_ID` gap in `docs/operations/box-activation.md`. Fail-closed today, so
this is coherence/maintainability, not a live defect. See the "Operational notes" section of
`docs/architecture/mcp-image-ingestion.md`.
