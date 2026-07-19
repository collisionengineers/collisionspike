# Distillation note — TKT-272

**Source:** PLAN-007 boundary (ADR-0031) + PLAN-010 repo-shape consolidation + reconciled review structure
prescriptions. **Plan:** PLAN-012. Extends PLAN-006's locked structure.

**Package boundary to record + enforce:** `@cs/domain` (browser-safe, SDK-free — README forbids
runtime-adapter / DB-client / cloud-SDK imports) vs `@cs/server-runtime` (server-only, SDK-allowed). The two
never merge; `check:production-dependencies` asserts the server package never reaches the `apps/web` bundle
(bundle-poisoning guard).

**Single-source repo-shape policy:** PLAN-010 consolidates the file-enumeration (`repository-files.mjs`) and
the generated-directory set into one definition imported by `check-repository-layout.mjs` +
`check-tracked-outputs.mjs`. This ticket records that as a standing rule (no second copy permitted).

**Precedent:** PLAN-006's `## Locked structure` + `docs/governance/` structure page. This ticket extends, does
not replace, that structure.
