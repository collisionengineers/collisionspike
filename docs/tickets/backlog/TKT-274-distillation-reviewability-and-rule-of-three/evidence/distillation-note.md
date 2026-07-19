# Distillation note — TKT-274

**Source:** reconciled review Gate 0 item 11 (reviewability) + the "Simplicity" perspective (rule-of-three).
**Plan:** PLAN-012.

**Reviewability gap (verified 2026-07-19):** `.gitattributes:24` — `workingspace/** text eol=crlf -diff` — so
the architecture-simplification drafts render as binary in PR diffs. The plan/ticket distillation boundary (the
exact place this series' quality is checked) is therefore not diff-visible. Fix without weakening the
`workingspace` content-immutability rule (drafts are user-owned, must not be edited/renamed): render for review
or require a per-PR derivation summary a check can confirm.

**Rule-of-three discipline to record:** a mechanism duplicated 3+ times earns a shared home; single-caller
wrappers are inlined; every consolidation PR reports a net file/LOC delta (net-negative overall). Record on the
governance pages as a standing expectation; add a presence/delta check where mechanical.

**Constraint:** `workingspace/` files are neither edited nor renamed by this ticket.
