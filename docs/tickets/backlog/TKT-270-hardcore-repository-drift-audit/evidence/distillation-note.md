# Distillation note — TKT-270

**Source:** operator requirement for a final "hardcore repository check" + reconciled review Gate 0. **Plan:**
PLAN-012.

**Why an audit is still needed after PLAN-007–011:** those plans each own one finding class (token/HTTP/retry
and storage; routes/clients; Python; scripts; estate). The findings register was point-in-time discovery, not
exhaustive proof. The audit records scoped coverage and names what remains; it does not claim that every
semantic risk is mechanically detectable.

**Audit categories (read-only queries, structural — not lexical):**
1. Three or more structurally equivalent mechanisms, after comparing contract, owner, lifecycle, security,
   and failure semantics.
2. Duplicate authority inside the same capability/caller/auth/action lane; declared delegation and distinct
   protocols remain valid.
3. Cross-language rule divergence (TypeScript `@cs/domain` vs Python vs vendored parser).
4. Tracked-doc live-state claims that disagree with `LIVE_FACTS.json`.
5. Governed `LIVE_FACTS.json` fields that disagree with their machine-readable evidence snapshot.

**Method:** subagent fan-out for independent repository slices and a read-only Azure diagnostician for live
claims. Use AST/import analysis where syntax is the contract, reference analysis for shared tooling,
behavioural fixtures for cross-language rules, and evidence comparison for live state. Each finding maps to
an exact existing owner, a new backlog ticket, or an intentional exception. Writes are limited to the report,
the audit ticket's changes/verification evidence, exact finding-to-owner references, new-ticket lifecycle
stubs, and the generated ticket/governance views needed to keep those artifacts in parity.
