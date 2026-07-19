# Distillation note — TKT-251

**Source:** `01-server-runtime-foundation.md` ticket 5 (drift guard) + reconciled review Gate 0 item 12.
**Plan:** PLAN-007.

**Requirement:** the guard must be **import/AST-aware, not lexical**, and **scoped to production TypeScript**.
A naive `grep IDENTITY_ENDPOINT` would falsely flag the Python function services (which legitimately mint
their own tokens under their own doctrine, deferred to a later series plan reserved as PLAN-011), the `/tests`
tree, and documentation that mentions the variable. So the guard must parse TypeScript imports/identifiers and
assert the token-mint surface lives only in `packages/server-runtime`.

**Two-pronged surface (Microsoft Learn):** because TKT-248 may prefer the `@azure/identity` SDK, the guard
must catch **both** the raw-endpoint mint (`IDENTITY_ENDPOINT` / storage-audience acquisition) **and** the SDK
mint (`ManagedIdentityCredential` / `DefaultAzureCredential` construction/import, or MI-token acquisition)
outside the package. A `new ManagedIdentityCredential()` mints an MI token without the app code referencing
`IDENTITY_ENDPOINT` at all (the SDK discovers the endpoint internally), so an `IDENTITY_ENDPOINT`-only guard
would let an SDK reintroduction pass. Negative fixtures cover both forms.

**Sequencing:** ship this last (after TKT-248–250 remove the nine copies) so it passes on merge; a negative
fixture proves it fails on a synthetic re-introduction. Wire into `verify-all.mjs` (the aggregate offline
runner) and CI.

**Generalisation:** a later anti-drift plan in this series (reserved as PLAN-012, not yet authored) is
intended to harvest this guard, the authority/route guard (reserved PLAN-008), and the inventory/repo-shape
guards (reserved PLAN-010) into a standing anti-drift rule set so the pattern is enforced repository-wide, not
per plan. These IDs are series reservations, not existing authorities.
