---
name: ticket-distill
description: Distills operator drop-notes and sample emails/documents into new collisionspike tickets (TKT-NNN folders with frontmatter, evidence/, changes.md, verification.md) and adds them to BOARD.md backlog. Use when creating a ticket from raw operator material or a new work-todo-spike stub.
disable-model-invocation: true
---

# Ticket distill

Workflow for **creating a new ticket** from operator material. The authoritative spec lives in
[docs/tickets/README.md](../../../docs/tickets/README.md); this skill encodes the agent procedure.

Invoke explicitly — do not create tickets unless the user asks.

## Quick checklist

```
- [ ] Confirm operator note + sample files (ask if sample required but missing)
- [ ] Allocate next TKT-NNN id (never reuse)
- [ ] Create ticket folder + evidence/ + stub artifacts
- [ ] Write ticket .md (frontmatter + body sections)
- [ ] Add BOARD.md row (Backlog or Blocked)
- [ ] Optional: README index row for new cluster
- [ ] node scripts/check-tickets.mjs
```

## When to distill vs elsewhere

| Material | Destination |
|----------|-------------|
| Atomic bug/feature with evidence | **Ticket** (this skill) |
| Strategic phase / multi-ticket programme | [ROADMAP.md](../../../ROADMAP.md) |
| Pure operator action, no code | [docs/gated.md](../../../docs/gated.md) |
| Fan-out research before ticket exists | `docs/plans/work-todo-spike/` stub + research pack → then ticket links pack (cohort A) |

## Step 1 — Confirm material

Collect:
- Operator note text (problem, expected behaviour, what went wrong)
- Sample files: `.eml`, PDF, `.doc`/`.docx`, screenshots

If the ticket class **requires** a sample to specify acceptance (classifier rules, parsing edge
cases) and none exists, **stop and ask** — do not invent a placeholder ticket (pattern: TKT-035).

## Step 2 — Allocate id

1. List `docs/tickets/TKT-*` folders and scan [README index](../../../docs/tickets/README.md).
2. Take `max(NNN) + 1`. Format: `TKT-NNN-<kebab-slug>`.
3. **Never reuse** a retired id.

## Step 3 — Create folder scaffold

```
docs/tickets/TKT-NNN-<slug>/
  TKT-NNN-<slug>.md
  changes.md          # stub — not started
  verification.md     # stub — not started
  evidence/
    operator-note.md
    <sample files>    # descriptive names, as placed by operator
```

- `operator-note.md`: verbatim or lightly cleaned operator wording.
- Copy or reference sample files under `evidence/` with descriptive names (see
  [TKT-023 evidence layout](../../../docs/tickets/TKT-023-follow-up-docs/TKT-023-follow-up-docs.md)).

## Step 4 — Write ticket .md

Use [templates.md](templates.md). Required frontmatter:

| Field | Guidance |
|-------|----------|
| `id` | `TKT-NNN` |
| `title` | Plain English, handler-facing, one line |
| `status` | `backlog` (or `blocked` if operator decision needed first) |
| `priority` | P0 prod-block · P1 important · P2 normal · P3 cosmetic |
| `area` | `parsing` · `evidence` · `box` · `intake` · `email` · `ui` · `dashboard` · `ai` · `platform` · `docs` |
| `tickets-it-relates-to` | Sibling ids, e.g. misclass cluster → `[TKT-006]` |
| `research-link` | `docs/tickets/TKT-NNN-<slug>/evidence/operator-note.md` |

Body sections (keep ticket short; depth stays in evidence/research):
- **Problem** — what is wrong / wanted
- **Evidence** — paths to operator note + samples + current behaviour if known
- **Proposed change** — high-level fix; prefix `PROPOSED (not built):` if und designed
- **Acceptance** — testable done criteria
- **Research** — link stub/pack; note distill date
- **Artifacts** — links to `./changes.md`, `./verification.md`, `./evidence/`

Gold-standard example: [TKT-023](../../../docs/tickets/TKT-023-follow-up-docs/TKT-023-follow-up-docs.md).

### Cohort A exception

When distilling from an existing `work-todo-spike` research pack (first 20 tickets pattern), set
`research-link` to the pack path and **do not delete** the pack. Link operator stub from Research
section.

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

Add one row to the matching section in [BOARD.md](../../../docs/tickets/BOARD.md):

| Section | When |
|---------|------|
| **Backlog** | Normal new work |
| **Blocked** | Needs operator sample, routing decision, or secret/id |
| **Next** | Only if user explicitly queues for imminent pickup |

Columns: ID (link), Title, Source/note (one line).

## Step 7 — Index (optional)

Add a row to the README **Index** table if this starts a new cluster (e.g. a new misclass subtype
batch). Existing clusters (TKT-029…040 misclass) only need a BOARD row.

## Finish

```bash
node scripts/check-tickets.mjs
```

All frontmatter fields must validate; `research-link` must resolve.

## Additional resources

- Templates: [templates.md](templates.md)
- Ticket system spec: [docs/tickets/README.md](../../../docs/tickets/README.md)
