---
id: TKT-072
title: The search box doesn't search — global search across cases, emails, providers
status: verify
priority: P1
area: ui
tickets-it-relates-to: [TKT-066, TKT-071, TKT-009]
research-link: docs/tickets/verify/TKT-072-global-search/evidence/operator-note.md
plan: PLAN-001
---

# The search box doesn't search — global search across cases, emails, providers

## Problem

The top-bar search box is decorative: on Enter it just navigates home
(`mockup-app/src/components/AppShell.tsx` ~lines 438–444, `navigate('/')`). There is no search
endpoint at all, so a handler cannot find a case by registration, Case/PO, claimant, or
reference — and when several open cases share one VRM ("3 same VRM"), nothing shows them
side-by-side. The twin query already exists (`openVrmTwins`, `GET /api/cases?vrm=`) but has no
search surface.

## Evidence

- `evidence/operator-note.md` — plan § 7 + diagnostic (2026-07-06 planning session, verified
  06/07).
- `mockup-app/src/components/AppShell.tsx` ~lines 438–444 — the Enter handler.
- No `api/src/functions/search.ts` exists; `openVrmTwins` returns open same-VRM cases.
- Same-VRM matching depends on the space-insensitive normalization defined in TKT-066 and on
  clean VRM data (TKT-071).

## Proposed change

PROPOSED (not built):

- **New endpoint `GET /api/search?q=`** (staff role) in a new `api/src/functions/search.ts`:
  one normalized query across `case_` (Case/PO, VRM space-insensitive, ref, claimant),
  `inbound_email` (subject, sender), and `work_provider` (name/code). Returns
  `{ cases[], emails[], providers[] }` capped per group.
- **SPA results view** at `/search?q=`: the AppShell SearchBox submits to it; every case
  sharing the searched VRM is listed with provider/status/age (so "3 same VRM" shows all
  three); case rows link to case detail, email rows to the inbox item.
- **Same-VRM grouping header**: reuse the twin logic for a "N other cases share this
  registration" header on the results view (and case rows).
- All rendered strings in handler language (no engineering terms).

## Acceptance

- [ ] Typing a spaced or compact VRM and pressing Enter shows every matching case (all
      same-VRM cases listed with provider/status/age).
- [ ] Case/PO, claimant-name, provider-name, and email-subject/sender searches each return
      their matches, grouped, capped per group.
- [ ] Case rows navigate to case detail; email rows navigate to the inbox item.
- [ ] The "N other cases share this registration" grouping header appears when >1 case shares
      the searched VRM.
- [ ] The endpoint requires a staff-role token (401/403 otherwise) and returns an honest empty
      result set on no match (never an error page).
- [ ] An empty/too-short query is handled gracefully (no firehose of all rows).

## Verification requirements (proof standard)

1. **Offline tests** — api unit tests for `search.ts`: per-entity matching, VRM
   space-insensitivity, group caps, short-query guard, auth fail-closed. SPA build green.
2. **Gate** — `node verify-all.mjs` green; api + SPA deploys recorded in
   [changes.md](./changes.md).
3. **Live click-through** — on the deployed SPA: search a real VRM shared by multiple cases and
   screenshot the results view showing all of them + the grouping header; click through a case
   row and an email row and record both destinations in [verification.md](./verification.md).
4. **Live endpoint probes** — deployed `GET /api/search?q=` with (a) a valid token + spaced VRM
   (capture the JSON), (b) no token (capture the 401).
5. **Cross-check** — the case count in the results view equals a direct Postgres count for the
   same VRM.

## Research

Distilled 2026-07-06 from the operator planning session `PLAN-assistant-intake-search-fixes.md`
(§ 7); excerpt in [evidence/](./evidence).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note (excerpt)](./evidence/operator-note.md)
