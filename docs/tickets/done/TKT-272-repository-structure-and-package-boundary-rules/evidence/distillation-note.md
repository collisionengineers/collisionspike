# Distillation note — TKT-272

**Source:** PLAN-007 boundary (ADR-0031) + PLAN-010 repo-shape consolidation + reconciled review structure
prescriptions. **Plan:** PLAN-012. Extends PLAN-006's locked structure.

**Package boundary to record + enforce:** `@cs/domain` (browser-safe, SDK-free — README forbids
runtime-adapter / DB-client / cloud-SDK imports) vs `@cs/server-runtime` (server-only, SDK-allowed). The two
never merge. The existing production-dependency scanner currently enforces the artificial-data boundary, not
this package boundary, so it must gain two independent assertions:

1. the `apps/web` production graph cannot reach `@cs/server-runtime`; and
2. the `@cs/domain` source graph and production manifest cannot directly or transitively reach server runtime,
   runtime adapters, database clients, Node-only packages, or cloud SDKs.

Separate negative fixtures are necessary because a domain SDK dependency can violate the second assertion
without being reachable from the current SPA entry point.

**Single-source repo-shape policy:** PLAN-010 consolidates the file-enumeration (`repository-files.mjs`) and
the generated-directory set into one definition imported by `check-repository-layout.mjs` +
`check-tracked-outputs.mjs`. This ticket records that as a standing rule (no second copy permitted).

**Precedent:** PLAN-006's `## Locked structure` + `docs/governance/` structure page. This ticket extends, does
not replace, that structure. TKT-247 and TKT-259 must be complete before this ticket certifies their final
paths.
