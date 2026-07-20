# Distillation note — TKT-266

**Source:** `workingspace/architecture-simplification/02-canonical-service-routes.md` step 5
(route-inventory guard) plus the reconciled review's authority/route-graph prescription and Gate 0 item 12.
**Plan:** PLAN-008.

**What the guard models:** capability · owner · caller lane · downstream · auth mode · action class · write
authority · delegation · gate · public/dark. It fails on two authoritative writers for one transition in the
same lane, an unowned route, a broken/cyclic delegation, or a second local auth helper claiming the same policy.

**Why lane and delegation matter:** the second `withServiceAuth` is real drift, but the staff BFF delegating to
a focused Function is legitimate, and the three outbox stacks own distinct protocols. Import/AST awareness
must distinguish those cases. Ship last with negative fixtures for a second auth helper and duplicate authority,
plus a positive explicit-delegation fixture; wire it into `verify-all.mjs`.
