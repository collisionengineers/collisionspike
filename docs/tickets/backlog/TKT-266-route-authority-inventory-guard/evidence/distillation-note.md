# Distillation note — TKT-266

**Source:** `02-canonical-service-routes.md` step 5 (route-inventory guard) + reconciled review §5
authority/route-graph prescription + Gate 0 item 12. **Plan:** PLAN-008.

**What the guard models** (from the reconciled review): capability · owner · caller · downstream · auth mode ·
action class · write authority · gate · public/dark. It **fails** on: two authoritative writers for one
transition, an unowned route, or a second local auth helper claiming the same policy.

**Why it's needed** — this plan's three defects are exactly what it catches: the second `withServiceAuth`
(`mirror-outbox-routes.ts:42`), the BFF proxy re-exposing parser + location-suggest, and the three outbox
drains. Import/AST-aware, not lexical (must not false-flag the single shared seam). Ship last; negative
fixtures for a re-introduced second auth helper and a duplicate capability path. Wire into `verify-all.mjs`.

**Generalisation:** PLAN-012 harvests this guard, PLAN-007's `IDENTITY_ENDPOINT` guard, PLAN-010's
single-source guard, and PLAN-011's parity guards into the standing repository-wide anti-drift rule set.
