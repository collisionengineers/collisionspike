# Distillation note — TKT-271

**Source:** the four plans' terminal-guard tickets + reconciled review Gate 0 item 12. **Plan:** PLAN-012.

**The four terminal guards to register + generalise:**
- TKT-251 (PLAN-007) — `IDENTITY_ENDPOINT` / storage-mint only in `packages/server-runtime`.
- TKT-261 (PLAN-010) — inventory core + generated-directory set stay single-source.
- TKT-266 (PLAN-008) — one registered path per capability; one authoritative writer; no second auth helper.
- TKT-269 (PLAN-011) — cross-language behavioural parity (parser rules vs `@cs/domain`).

**Doctrine to record (ADR + governance page):** guards are import/AST-aware (never lexical — a lexical
`IDENTITY_ENDPOINT` ban false-flags the Python services + docs), production-scoped, language-aware, pin
observable behaviour not internals, and are wired into `verify-all.mjs` with a negative fixture.

**Meta-guard:** a check that fails if a distilled consolidation plan lacks a registered terminal guard wired
into `verify-all.mjs`. This is what makes "every plan ends in a guard" enforceable rather than aspirational.
