---
name: ticket-distill
description: Distills operator drop-notes and sample emails/documents into new collisionspike tickets under the status-folder system (docs/tickets/backlog|blocked|next|now|verify|done/TKT-NNN folders with frontmatter, evidence/, changes.md, verification.md) and adds them to BOARD.md. Use when creating a ticket from raw operator material, a new work-todo-spike stub, or a small new work item.
disable-model-invocation: true
---

# Ticket distill

Workflow for **creating a new ticket** from operator material. The authoritative spec lives in
[docs/tickets/README.md](../../../docs/tickets/README.md); this skill encodes the agent procedure.

Invoke explicitly — do not create tickets unless the user asks.

## Quick checklist

```
- [ ] Confirm operator note + sample files (ask if sample required but missing)
- [ ] Allocate next TKT-NNN id by scanning ALL status folders
- [ ] Choose initial status folder (usually backlog; blocked if waiting on operator)
- [ ] Create ticket folder + evidence/ + stub artifacts
- [ ] Write ticket .md (frontmatter + body sections)
- [ ] Add BOARD.md row in matching section
- [ ] If multi-ticket programme, create/update a PLAN with ticket-plan
- [ ] node scripts/check-tickets.mjs && node scripts/check-doc-links.mjs
```

## When to distill vs elsewhere

| Material | Destination |
|----------|-------------|
| Atomic bug/feature with evidence | **Ticket** (this skill) |
| Multi-ticket operator plan/programme | `ticket-plan` skill + member tickets |
| Strategic phase / broad roadmap | [ROADMAP.md](../../../ROADMAP.md) |
| Pure operator action, no code | [docs/gated.md](../../../docs/gated.md) |
| Fan-out research before ticket exists | `docs/plans/work-todo-spike/` stub + research pack → then ticket links pack |

## Step 1 — Confirm material

Collect:
- Operator note text (problem, expected behaviour, what went wrong)
- Sample files: `.eml`, PDF, `.doc`/`.docx`, screenshots

If the ticket class **requires** a sample to specify acceptance (classifier rules, parsing edge cases) and
none exists, **stop and ask** — do not invent a placeholder ticket (pattern: TKT-035).

## Step 2 — Allocate id

1. Scan `docs/tickets/{backlog,now,next,verify,done,blocked}/TKT-*` folders and [README index](../../../docs/tickets/README.md).
2. Take `max(NNN) + 1`. Format: `TKT-NNN-<kebab-slug>`.
3. **Never reuse** a retired id. Do not scan top-level only; that will collide after the status-folder migration.

## Step 3 — Choose status + create folder scaffold

Normal new work starts in `backlog`; use `blocked` if it needs an operator sample/decision first, or `next` only
when the user explicitly queues it. `now`, `verify`, and `done` are unusual initial states and need clear evidence.

```
docs/tickets/<status>/TKT-NNN-<slug>/
  TKT-NNN-<slug>.md
  changes.md
  verification.md
  evidence/
    operator-note.md
    <sample files>
```

- `operator-note.md`: verbatim or lightly cleaned operator wording.
- Copy or reference sample files under `evidence/` with descriptive names.

## Step 4 — Write ticket .md

Use [templates.md](templates.md). Required frontmatter:

| Field | Guidance |
|-------|----------|
| `id` | `TKT-NNN` |
| `title` | Plain English, handler-facing, one line |
| `status` | `backlog`, `blocked`, `next`, `now`, `verify`, or `done` |
| `priority` | P0 prod-block · P1 important · P2 normal · P3 cosmetic |
| `area` | `parsing` · `evidence` · `box` · `intake` · `email` · `ui` · `dashboard` · `ai` · `platform` · `docs` |
| `tickets-it-relates-to` | Sibling ids, e.g. misclass cluster → `[TKT-006]` |
| `research-link` | `docs/tickets/<status>/TKT-NNN-<slug>/evidence/operator-note.md` |
| `plan` | Optional `PLAN-NNN` if the ticket belongs to a plan |

Body sections:
- **Problem** — what is wrong / wanted
- **Evidence** — paths to operator note + samples + current behaviour if known
- **Proposed change** — high-level fix; prefix `PROPOSED (not built):` if not designed
- **Acceptance** — testable done criteria
- **Research** — link stub/pack; note distill date
- **Artifacts** — links to `./changes.md`, `./verification.md`, `./evidence/`

Gold-standard example: [TKT-023](../../../docs/tickets/verify/TKT-023-follow-up-docs/TKT-023-follow-up-docs.md).

### Cohort A exception

When distilling from an existing `work-todo-spike` research pack, set `research-link` to the pack path and **do
not delete** the pack. Link operator stub from the Research section.

## Step 5 — Stub artifacts

**changes.md:**
```markdown
# Changes — TKT-NNN: <title>

## Status
not started
```

**verification.md:**
```markdown
# Verification — TKT-NNN: <title>

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
(acceptance criteria from ticket .md)
```

## Step 6 — BOARD.md

Add one row to the matching section in [BOARD.md](../../../docs/tickets/BOARD.md). The first cell must link to
the actual spec path, e.g.:

Use this literal row shape, replacing the placeholders with the real path:

```markdown
| [TKT-NNN](./backlog/TKT-NNN-slug/TKT-NNN-slug.md) | <title> | <one-line source note> |
```

## Step 7 — Index / plans

Regenerate or update the README index when adding tickets. If the material is a multi-ticket programme, use the
`ticket-plan` skill and add `plan: PLAN-NNN` to every member ticket.

## Finish

```bash
node scripts/check-tickets.mjs
node scripts/check-doc-links.mjs
```

All placement, frontmatter, BOARD, plan, manifest, and links must validate.

## Additional resources

- Templates: [templates.md](templates.md)
- Ticket system spec: [docs/tickets/README.md](../../../docs/tickets/README.md)
