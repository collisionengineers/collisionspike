---
name: ticket-implement
description: Implements and closes collisionspike tickets (TKT-NNN) in the status-folder ticket system — reads the ticket spec/research/plan, verifies live facts against the registry, routes work by area, records changes.md and verification.md, and changes status with scripts/ticket-move.mjs. Use when picking up, finishing, verifying, or moving a ticket, or when the user references TKT-NNN or docs/tickets/.
---

# Ticket implement

Workflow for **working an existing ticket** to completion. The authoritative spec lives in
[docs/tickets/README.md](../../../docs/tickets/README.md); this skill encodes the agent procedure.

## Quick checklist

```
- [ ] Locate ticket under docs/tickets/<status>/TKT-NNN-<slug>/
- [ ] Read ticket .md + research-link + related tickets + plan (if set)
- [ ] Verify live facts against LIVE_FACTS.json (not the research pack)
- [ ] Check binding reviews if UI/domain
- [ ] Pick up with: node scripts/ticket-move.mjs TKT-NNN now
- [ ] Implement (route by area)
- [ ] Write changes.md + verification.md
- [ ] Move to verify/done/blocked/next with ticket-move.mjs
- [ ] node scripts/check-tickets.mjs && node scripts/check-doc-links.mjs
```

## Pick-up (before coding)

1. Find the ticket with `find docs/tickets -path '*TKT-NNN-*'` or use the BOARD link. Tickets live at
   `docs/tickets/<status>/TKT-NNN-<slug>/TKT-NNN-<slug>.md`.
2. Open the ticket spec and read frontmatter plus every body section.
3. Follow `research-link`:
   - Cohort A (TKT-001…020): `docs/plans/work-todo-spike/<area>/research/<name>.md`
   - Drop-note tickets: `docs/tickets/<status>/TKT-NNN-<slug>/evidence/operator-note.md` plus samples.
4. Read every ticket in `tickets-it-relates-to` — do not duplicate or contradict sibling work.
5. If frontmatter has `plan: PLAN-NNN`, read `docs/tickets/plans/PLAN-NNN-*.md` and keep the plan's progress accurate.
6. **Verify live facts** against [`LIVE_FACTS.json`](../../../LIVE_FACTS.json) and
   [live-environment.md](../../../docs/architecture/live-environment.md). Research packs are advisory
   point-in-time snapshots.
7. Pick up with `node scripts/ticket-move.mjs TKT-NNN now`. Do not hand-edit the folder path or BOARD row.

## Route by `area`

| area | Route |
|------|-------|
| `parsing` | Edit sibling `cedocumentmapper_v2.0` first, re-vendor into parser Function, deploy — ADR-0018 |
| `box` / `intake` / `email` / `platform` | [docs/azure/README.md](../../../docs/azure/README.md) playbooks + `azure:*` skills |
| `ui` / `dashboard` | `.cursor/rules/ui-user-language.mdc` — no engineering strings on screen |
| `docs` | [docs/MAINTENANCE.md](../../../docs/MAINTENANCE.md) — no live-number leakage outside registry |
| `evidence` / `ai` | Follow ticket research; gate reads from registry |

Parser regressions need a fixture in `cedocumentmapper_v2.0/tests/fixtures/` before re-vendor. Intake/orch
fixes need an offline test where one exists; live intake needs a re-verify path in `verification.md`.

## Implement

- Scope to the ticket's **Acceptance** section — do not expand into unrelated ROADMAP items.
- If blocked on operator action, stop coding and move to `blocked` with `ticket-move.mjs`.
- Record sample emails/docs used under `evidence/` if new material arrives mid-work.
- If the ticket belongs to a plan, update the plan body/progress notes when the change materially advances it.

## Close-out (mandatory audit trail)

Update both artifacts linked from the ticket's **Artifacts** footer.

**`changes.md`** — what was written (see [templates.md](templates.md)):
- Status line, commits (hash + one-line why), files touched, short summary.

**`verification.md`** — how it was proven:
- Verdict: `VERIFIED-LIVE` | `TESTED (offline)` | `PENDING`
- Evidence: case ids, test file names, App Insights/KQL hints, DB query notes
- Honest gaps (expected absences vs real bugs)
- How to re-verify

Gold-standard examples: [TKT-001/changes.md](../../../docs/tickets/verify/TKT-001-document-parsing/changes.md),
[TKT-001/verification.md](../../../docs/tickets/verify/TKT-001-document-parsing/verification.md).

### Status rules (BOARD truth standard)

| Outcome | `status` | BOARD column |
|---------|----------|--------------|
| In active implementation | `now` | Now |
| Code/deploy complete but awaiting live proof | `verify` | Verify |
| Live-proven or acceptance allows offline-only proof, recorded in verification.md | `done` | Done |
| Needs operator / dependency | `blocked` | Blocked |
| Queued for next slice | `next` | Next |
| Not started | `backlog` | Backlog |

**`done` means live and proven**, not merely code-correct. Offline-only proof → verdict `TESTED (offline)`;
use `done` only when the ticket acceptance explicitly allows offline-only proof. Otherwise move to `verify`.

### Follow-up / regression on a done ticket

Add a dated follow-up doc (pattern:
[TKT-003/changes-regression-01-07-26.md](../../../docs/tickets/done/TKT-003-box-sync/changes-regression-01-07-26.md)).
Reopen with `node scripts/ticket-move.mjs TKT-003 now` until re-verified. Link the follow-up from `changes.md`.

Operator gates belong in [docs/gated.md](../../../docs/gated.md) **and** ticket `blocked` status.

## Finish

```bash
node scripts/check-tickets.mjs
node scripts/check-doc-links.mjs
node scripts/check-skills-sync.mjs
```

Fix any frontmatter, board, plan, manifest, skill-sync, or link errors before handing off. If all tickets in
a plan are done, close the plan (`status: done`) and run the gates again.

## Additional resources

- Artifact templates: [templates.md](templates.md)
- Ticket system spec: [docs/tickets/README.md](../../../docs/tickets/README.md)
- Board tracker: [docs/tickets/BOARD.md](../../../docs/tickets/BOARD.md)
