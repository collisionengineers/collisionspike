# Ticket orchestrate — dispatch templates

Copy and fill. The brief goes to the implementing agent verbatim; the verdict block comes back from
ticket-verifier and is transcribed into `verification.md` 1:1.

## Delegation brief (implementing dispatch)

```markdown
# Delegation brief — TKT-NNN: <title>

## Ticket
- id: TKT-NNN · priority: <P0–P3> · area: <area> · status: now
- Spec: docs/tickets/now/TKT-NNN-<slug>/TKT-NNN-<slug>.md

## Acceptance (the full section, pasted — your entire scope)
<paste the ticket's Acceptance section verbatim>

## Context
- Research: <one-paragraph summary of the research-link content + its path>
- Related tickets: <ids + one line each on what they constrain>
- Plan: <PLAN-NNN + where this ticket sits in it, or "none">

## Live facts
Verify every live fact (gates, counts, mailbox set, function/route names) against LIVE_FACTS.json /
docs/architecture/live-environment.md before acting. Research packs and the ticket body are advisory
point-in-time snapshots.

## Area hard rules
<paste the routing-table row's hard rules for this area, expanded — e.g. for ui: "HARD RULE: no
engineering language in rendered strings (AGENTS.md); Fluent v9 + CE tokens; build before deploy +
hard refresh">

## Obligations
- Scope strictly to the Acceptance above — no unrelated ROADMAP work.
- Draft `docs/tickets/now/TKT-NNN-<slug>/changes.md` per the ticket-implement template
  (status line, commits hash + why, files touched, summary).
- Record any new sample material under the ticket's `evidence/`.
- Commit as work progresses; the pre-commit doc gate must pass — fix, don't bypass.

## Prohibitions
- Never run scripts/ticket-move.mjs or hand-edit ticket status/folders/BOARD/index.
- Never write a verification.md verdict beyond PENDING.
- Never dispatch other agents — return unmet needs to me instead.
- Two identical failures → stop and consult the matching skill/docs; no third identical attempt.

## Return contract
Report: (1) outcome — complete / blocked-on-<what> / partial (<what remains>); (2) commits made
(hash + why); (3) files touched; (4) the concrete live checks a verifier should run; (5) anything
discovered out of scope (candidate follow-ups), not acted on.
```

## Verifier brief (ticket-verifier dispatch)

```markdown
# Verify — TKT-NNN: <title>

Ticket folder: docs/tickets/verify/TKT-NNN-<slug>/
Read the spec, changes.md, verification.md, and evidence/. The Acceptance section is your checklist —
one concrete evidence artifact per acceptance line. Registry (LIVE_FACTS.json /
docs/architecture/live-environment.md) over research packs. Read-only throughout; return the verdict
block below — do not write any file.

<optional: known context — what changes.md claims, what verification.md already lists as pending>
```

## Verdict block (what ticket-verifier returns — transcribe 1:1 into verification.md)

```markdown
## Verdict
VERIFIED-LIVE | TESTED (offline) | PENDING | FAILED

## Evidence
<one artifact per acceptance line: query + result, case ids / Case-PO, KQL rows, SPA steps observed,
Box listing>

## Pending / gaps
<honest list; expected absences vs real bugs, explicitly separated>

## How to re-verify
<repeatable steps: mailbox, query, test command, KQL snippet>

## Confidence + unread surfaces
<what could not be read and why>
```

When transcribing, append: `Verified by: ticket-verifier dispatch, <DD-MM-YY>`.

## Sweep / batch report (returned to the user per tranche)

```markdown
| Ticket | Dispatched to | Verdict / outcome | Transition | Gaps |
|---|---|---|---|---|
| TKT-NNN | ticket-verifier | VERIFIED-LIVE | verify → done | — |
| TKT-NNN | ticket-verifier | FAILED (<line>) | verify → now + follow-up doc | <what broke> |
| TKT-NNN | azure-integration-engineer | complete | now → verify | awaiting live proof |
```
