# ADR-0024 — Assistant writes use propose, confirm, execute

**Status:** Proposed (2026-07-07); implementation exists for approved capabilities.

## Decision

The model never sends a mutation directly.

1. **Propose:** the model names one proposable capability and parameters. The server validates the
   descriptor and schema but performs no write.
2. **Confirm:** the web app independently re-reads the target, shows a structured current-versus-proposed
   change, and asks the staff member to confirm. Model prose is not the execution source.
3. **Execute:** after confirmation, the app calls the existing staff-authorized route with the current
   version. A stale version fails instead of overwriting newer work.

Destructive, human-only, forced-status, and byte-upload actions are not model-proposable. Authorization,
validation, row-level policy, and audit run again on execute.

## Consequences

This protocol applies only where a person is present in the app. It does not authorize autonomous agent
writes. Each capability also requires the relevant data-protection and product approval.
