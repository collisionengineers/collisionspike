---
id: TKT-138
title: Live staff tokens still carry the pre-rename "CollisionSpike.Admin" roles value — reconcile with the Superuser rename
status: now
priority: P3
area: platform
tickets-it-relates-to: [TKT-010]
research-link: docs/tickets/now/TKT-138-token-roles-claim-rename/evidence/operator-note.md
plan: PLAN-003
---

# TKT-138 — Live staff tokens still carry the pre-rename "CollisionSpike.Admin" roles value

## Problem

Two independent verifier passes (2026-07-09) observed the operator's live v2 access token carrying
roles: ["CollisionSpike.Admin"] — the pre-rename value — even though the API app registration's
appRoles read Engineer/User/Superuser (Superuser keeping role-id 5b356d4c per the 2026-06-27
rename record) and withRole('CollisionSpike.User') routes authorize the session fine. Either the
rename didn't change the role's value field at issuance, the assignment resolves an old value, or
the api role checks accept a legacy superset. Working today, but the directory record, the token
claim, and the code checks should agree.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — the two verifier sightings.
- az ad app show (2026-07-09): appRoles values = CollisionSpike.Engineer / .User / .Superuser.

## Proposed change

PROPOSED (not built): decode a fresh token, enumerate the role assignment + the appRole value at
the assignment's target, determine why the claim says Admin, and reconcile (directory value fix or
documented legacy-accept in api/src/lib/auth.ts). No behaviour change intended — hygiene.

## Acceptance

- The mismatch is root-caused and documented (token claim vs directory vs code).
- Either the fresh-token claim reads CollisionSpike.Superuser, or the legacy value is deliberately
  accepted and recorded in the auth lib + registry.
- No staff authorization regression.

## Research

Filed 2026-07-09 from two verify-sweep side-findings (PLAN-003 workflow finding).

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)
