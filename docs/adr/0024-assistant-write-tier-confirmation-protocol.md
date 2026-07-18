# ADR-0024 — Assistant writes use propose, confirm, execute

**Status:** Accepted 2026-07-16 per [Review 160726](../reviews/160726/decisions.md).

## Decision

The model never sends a mutation directly.

1. **Propose:** the model names one proposable capability and parameters. The server validates the
   descriptor and schema but performs no write.
2. **Confirm:** the web app independently re-reads the target, shows a structured current-versus-proposed
   change, and asks the staff member to confirm. Model prose is not the execution source.
3. **Execute:** after confirmation, the app calls the existing staff-authorized route with the current
   version. A stale version fails instead of overwriting newer work.

Destructive, human-only, forced-status, and byte-upload actions are not model-proposable by default; a
capability may be promoted out of this set once proven safe (see the capability registry, ADR-0025). Authorization,
validation, and row-level policy run again on execute, and the change is recorded in the activity log.
("Audit" is reserved for the Audit case type of [ADR-0014](./0014-audit-case-type-second-inspection.md);
the tamper-evident record of what changed is the activity log.)

## Rationale

A person, not model prose, is the execution source for every assistant-initiated mutation.

## Consequences

This protocol applies only where a person is present in the app. It does not authorize autonomous agent
writes. Each capability also requires the relevant data-protection and product approval. This protocol
is the in-app expression of the write tier in
[ADR-0023](./0023-mcp-server-hosting-and-auth.md)'s tiered access model.
