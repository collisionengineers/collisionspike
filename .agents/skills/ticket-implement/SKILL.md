---
name: ticket-implement
description: Implements and closes collisionspike tickets (TKT-NNN) — reads the ticket spec and research pack, verifies live facts against the registry, routes work by area, records changes.md and verification.md, and syncs BOARD.md status. Use when picking up, finishing, or verifying a ticket, or when the user references TKT-NNN or docs/tickets/.
---

# Ticket implement

Workflow for **working an existing ticket** to completion. The authoritative spec lives in
[docs/tickets/README.md](../../../docs/tickets/README.md); this skill encodes the agent procedure.

## Quick checklist

```
- [ ] Read ticket .md + research-link + related tickets
- [ ] Verify live facts against LIVE_FACTS.json (not the research pack)
- [ ] Check binding reviews if UI/domain
- [ ] Set status: now + move BOARD row to Now
- [ ] Implement (route by area)
- [ ] Write changes.md + verification.md
- [ ] Set final status + sync BOARD.md
- [ ] node scripts/check-tickets.mjs && node verify-all.mjs
```

## Pick-up (before coding)

1. Open `docs/tickets/TKT-NNN-<slug>/TKT-NNN-<slug>.md` — read frontmatter and every body section.
2. Follow `research-link`:
   - Cohort A (TKT-001…020): `docs/plans/work-todo-spike/<area>/research/<name>.md`
   - Cohort B (TKT-021+): `docs/tickets/TKT-NNN-<slug>/evidence/operator-note.md` plus any sample files in `evidence/`
3. Read every ticket in `tickets-it-relates-to` — do not duplicate or contradict sibling work.
4. **Verify live facts** against [`LIVE_FACTS.json`](../../../LIVE_FACTS.json) and
   [live-environment.md](../../../docs/architecture/live-environment.md). Research packs are
   advisory point-in-time snapshots — never trust counts, gates, mailbox sets, or function names
   from a pack without checking the registry.
5. If the ticket touches UI or domain behaviour, scan [docs/reviews/](../../../docs/reviews/) —
   binding reviews outrank older docs, plans, ADRs, and code.
6. Set ticket `status: now`. Move the row to **Now** in [BOARD.md](../../../docs/tickets/BOARD.md).
   If resuming partially-done work, add a one-line "why not done" column entry.

## Route by `area`

| area | Route |
|------|-------|
| `parsing` | Edit sibling `cedocumentmapper_v2.0` first, re-vendor into parser Function, deploy — ADR-0018 |
| `box` / `intake` / `email` / `platform` | [docs/azure/README.md](../../../docs/azure/README.md) playbooks + `azure:*` skills |
| `ui` / `dashboard` | `.cursor/rules/ui-user-language.mdc` — no engineering strings on screen |
| `docs` | [docs/MAINTENANCE.md](../../../docs/MAINTENANCE.md) — no live-number leakage outside registry |
| `evidence` / `ai` | Follow ticket research; gate reads from registry |

Parser regressions need a fixture in `cedocumentmapper_v2.0/tests/fixtures/` before re-vendor.
Intake/orch fixes need an offline test where one exists; live intake needs a re-verify path in
`verification.md`.

## Implement

- Scope to the ticket's **Acceptance** section — do not expand into unrelated ROADMAP items.
- If blocked on operator action, stop coding and move to **blocked** (see Close-out).
- Record sample emails/docs used under `evidence/` if new material arrives mid-work.

## Close-out (mandatory audit trail)

Update both artifacts linked from the ticket's **Artifacts** footer.

**`changes.md`** — what was written (see [templates.md](templates.md)):
- Status line, commits (hash + one-line why), files touched, short summary.

**`verification.md`** — how it was proven:
- Verdict: `VERIFIED-LIVE` | `TESTED (offline)` | `PENDING`
- Evidence: case ids, test file names, App Insights/KQL hints, DB query notes
- Honest gaps (expected absences vs real bugs)
- How to re-verify

Gold-standard examples: [TKT-001/changes.md](../../../docs/tickets/TKT-001-document-parsing/changes.md),
[TKT-001/verification.md](../../../docs/tickets/TKT-001-document-parsing/verification.md).

### Status rules (BOARD truth standard)

| Outcome | `status` | BOARD column |
|---------|----------|--------------|
| Live-proven, recorded in verification.md | `done` | Done |
| Code merged but not live-confirmed | `now` | Now (state gap honestly) |
| Needs operator / dependency | `blocked` | Blocked (record what unblocks) |
| Queued for next slice | `next` | Next |

**`done` means live and proven**, not merely code-correct. Offline-only proof → verdict
`TESTED (offline)`; keep `now` unless the ticket acceptance explicitly allows offline-only.

### Follow-up / regression on a done ticket

Add a dated follow-up doc (pattern:
[TKT-003/changes-regression-01-07-26.md](../../../docs/tickets/TKT-003-box-sync/changes-regression-01-07-26.md)).
Reopen ticket to `now` until re-verified. Link the follow-up from `changes.md`.

Operator gates belong in [docs/gated.md](../../../docs/gated.md) **and** ticket `blocked` status.

## Finish

```bash
node scripts/check-tickets.mjs
node verify-all.mjs
```

Fix any frontmatter or link errors before handing off.

## Additional resources

- Artifact templates: [templates.md](templates.md)
- Ticket system spec: [docs/tickets/README.md](../../../docs/tickets/README.md)
- Board tracker: [docs/tickets/BOARD.md](../../../docs/tickets/BOARD.md)
