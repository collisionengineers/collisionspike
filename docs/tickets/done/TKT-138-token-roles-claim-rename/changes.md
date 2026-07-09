# Changes — TKT-138: token roles-claim rename reconcile

## Status
root-caused + documented (2026-07-09, PLAN-003 final wave D1 — READ-ONLY directory
enumeration; no directory mutation performed or needed). Code-side record deployed with
the api republish. Uncommitted on `feat/final-wave`.

## Commits
(none yet — the wave's work is uncommitted on `feat/final-wave` per the dispatch instructions)

## Root-cause (read-only enumeration, 2026-07-09)
1. **App registration** `fa2fb28c-fef6-40a4-8d3b-ae6725891d72` (`az ad app show`):
   appRoles = `CollisionSpike.Engineer` (bd45e8ab…) / `CollisionSpike.User` (764d4c83…) /
   `CollisionSpike.Superuser` (**5b356d4c-32ef-496a-96e4-72ee848e6710**), all enabled.
2. **Service principal** `f5cf0eba-c8bf-4f2a-badd-049166ded3e7` (`az ad sp show` — the
   object whose appRoles actually mint the `roles` claim): **identical** — the SP copy is
   IN SYNC with the app manifest. No SP drift.
3. **The operator's assignments** (`az rest GET /users/{oid}/appRoleAssignments`, oid
   `06b65d89…`): exactly ONE assignment on the CollisionSpike API SP —
   `appRoleId 5b356d4c…` (created 2026-06-26, pre-rename; the id was deliberately kept by
   the 2026-06-27 rename so it carried over). The SPA assignment is the all-zeros
   default-access role, and the **CollisionSpike SPA app defines NO appRoles** — no other
   source of a `CollisionSpike.*` roles value exists in the tenant.

**Conclusion:** the directory can no longer mint `CollisionSpike.Admin` — a FRESH v2
access token for the API audience must carry `roles: ["CollisionSpike.Superuser"]`
(assignment 5b356d4c → SP appRole value `CollisionSpike.Superuser`). The two 2026-07-09
verifier sightings of `["CollisionSpike.Admin"]` were therefore **stale pre-rename token
artifacts** (a cached/recorded token, not a fresh mint) — Entra recomputes role values at
every issuance, so a 12-day-old value cannot appear on a genuinely fresh token.
**There is no directory fix to run**, hence **no gated.md operator entry is needed** for
this ticket (the parent instruction's "document what to run in gated.md" branch does not
apply — nothing is wrong in the directory).

## Files touched
- `api/src/lib/auth.ts` — the `SUPERUSER_VALUES` legacy-accept comment now carries the
  full TKT-138 root-cause record (app + SP + assignment enumeration, the stale-artifact
  conclusion, and that the legacy-accept is DELIBERATE belt-and-braces, kept).
- `LIVE_FACTS.json` `verifiedBy` + `docs/architecture/live-environment.md` header — the
  registry record of the finding (acceptance line: "recorded in the auth lib + registry").

## Summary
Mismatch root-caused as a stale-token observation, not directory or code drift; the
legacy-accept in `auth.ts` stays (no staff authorization regression — both values
authorize as superuser). The remaining proof is trivially operator-side: decode ONE fresh
token from the live SPA session and read `roles`.
