---
id: TKT-195
title: Manage staff access with Microsoft work accounts
status: backlog
priority: P1
area: platform
tickets-it-relates-to: [TKT-063, TKT-134, TKT-138, TKT-149]
research-link: docs/tickets/backlog/TKT-195-entra-staff-access-management/evidence/logins-system.md
plan: PLAN-004
---

# Manage staff access with Microsoft work accounts

## Problem
Most staff still need explicit access to the live application, and action history needs stable, recognizable staff names. The dropped proposal suggested local usernames, one shared default password and in-app password reset/deletion, but that would duplicate and weaken the existing Microsoft workforce sign-in. Access should remain attached to named Microsoft work accounts and explicit application-role assignments.

## Evidence
- [Operator login note](./evidence/logins-system.md) — lists the required staff display names, asks for administrator-only management and named action logs, and contains the superseded local default-password proposal.
- The live stack already validates Microsoft work-account tokens and enforces `CollisionSpike.User` / `CollisionSpike.Superuser`; AGENTS.md records that staff app-role assignment is incomplete and that the legacy `.Admin` claim is accepted only for compatibility.
- TKT-138 reconciles the role rename, and TKT-134 humanizes action-log copy; neither provides safe staff assignment/revocation or a durable display-identity map.

## Proposed change
PROPOSED (not built): keep Entra/MSAL as the only interactive staff authentication path. Add a Superuser-only “Staff access” settings page backed by server-side management of explicit `CollisionSpike.User` and `CollisionSpike.Superuser` app-role assignments, plus a trusted mapping from immutable Microsoft principal ID to the approved short display name used in the application and audit views.

The short names are display identities, not local login accounts. Microsoft owns invitation, password change, password reset, multi-factor authentication and account deletion. Suitable handler copy is “Staff access”, “Standard access”, “Full access”, “Remove access” and “Manage account in Microsoft”; rendered copy must not expose Entra, MSAL, JWT, app-role IDs or tenant internals.

## Acceptance
- **A1.** Interactive sign-in remains Microsoft workforce sign-in end to end; the application introduces no local username/password table, shared/default credential, first-login password flow, password reset token or password-management endpoint, and no application source, configuration, build artifact or deployed setting contains or uses the dropped default credential. Its immutable operator-source occurrence may remain as evidence only.
- **A2.** Staff identity is keyed by immutable Microsoft principal/object ID and explicitly mapped to the approved display names `andy`, `alex`, `ben`, `lisa`, `fee`, `ed`, `pat`, `jake` and `neil`. Email address or display text is not used as the durable key, and the mapping is confirmed before assignment rather than guessed.
- **A3.** Initial intended access is recorded as `andy` → `CollisionSpike.Superuser`; `alex`, `ben`, `lisa`, `fee`, `ed`, `pat`, `jake` and `neil` → `CollisionSpike.User` unless the operator approves a different named assignment. `alex` maps to the already approved existing principal instead of creating a duplicate identity.
- **A4.** A Superuser-only “Staff access” page lists approved staff name, Microsoft account, current access level and confirmed assignment state, and supports grant/change/remove application access. It does not create/delete a tenant account or claim success until Microsoft Graph confirms the exact assignment result.
- **A5.** The page and API manage only the canonical `CollisionSpike.User` and `CollisionSpike.Superuser` assignments. New assignment does not emit legacy `CollisionSpike.Admin`, and the currently unenforced Engineer role is neither presented nor used as a substitute.
- **A6.** Page visibility and every read/write operation are enforced server-side for Superusers. A normal User receives no management data and a direct API attempt is denied; Graph permissions are least-privilege and constrained to the intended enterprise application/tenant.
- **A7.** Removing application access revokes only this application's role assignment and never deletes/disables the Microsoft account, mailbox or other tenant access. The UI states when a fresh sign-in/token refresh is required, and signed-in verification proves removed staff receive 403 after that refresh.
- **A8.** Self-removal, removal/demotion of the last confirmed Superuser, duplicate assignments, stale concurrent edits and unconfirmed principal mappings fail safely. High-impact changes show the named person and old/new access in a confirmation step and remain retryable without duplicate assignment.
- **A9.** Every grant, change, removal, refusal and Graph failure records immutable actor/target principal IDs, trusted display snapshots, old/new role, assignment ID where available, operation/correlation ID, time and outcome. Staff-facing history shows approved names and plain actions, while automated activity remains “System”.
- **A10.** Display-name changes affect future presentation without changing durable ownership or rewriting historical snapshots. A staff member cannot spoof another display name through token/client input, and raw object IDs or email addresses appear only in authorized administration/detail surfaces where needed.
- **A11.** Credential lifecycle actions are handed off to the Microsoft account-management route; application copy never asks staff or administrators to disclose, set or reset a password. Secret scans and API/storage tests prove no credential material is accepted, logged or persisted.
- **A12.** Offline tests cover mapping, role grant/change/remove, idempotent retry, last-Superuser/self guard, stale assignment, Graph failures, User denial, spoofed display claims and audit output; signed-in live proof uses controlled approved principals to show User/Superuser access and revocation without disrupting unrelated staff.

## Validation
- **Offline:** test the domain/API authorization and assignment-operation idempotency with Graph fakes; inspect built SPA strings and network contracts; run secret scanning specifically for the dropped default and password-shaped fields, allowing only the immutable operator-source evidence; verify immutable-principal audit attribution.
- **Signed-in/live:** first capture the approved alias-to-principal mapping and enterprise-app IDs; grant controlled User and Superuser assignments, sign in as each to prove permitted/denied settings access, revoke the controlled User assignment, refresh sign-in and prove 403. Reconcile Graph assignments, application response and audit records.
- **Safety:** make no role change for a real staff principal until the mapping and dry-run are approved; preserve at least one independently verified Superuser throughout and retain the exact rollback assignment IDs.

## Research
Distilled 2026-07-13 from the [login-system note](./evidence/logins-system.md) and the operator's clarification to retain Microsoft workforce authentication. The note's shared default password, local first-login reset and tenant-account deletion ideas are explicitly superseded.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator login note](./evidence/logins-system.md)
