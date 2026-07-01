# Ticket implement — artifact templates

Copy and fill. Match the voice of existing tickets (concise, factual, honest about gaps).

## changes.md

```markdown
# Changes — TKT-NNN: <title>

## Status
<now | done | blocked> — one-line summary of implementation state.

## Commits
- `<hash>` — <area>: <what this commit did and why>
- `<hash>` — ...

## Files touched
- `path/to/file.ts` (+ `file.test.ts` if applicable)
- ...

## Summary
<2–4 sentences: root cause, fix approach, what now works. Link follow-up doc if regression.>
```

## verification.md

```markdown
# Verification — TKT-NNN: <title>

## Verdict
VERIFIED-LIVE | TESTED (offline) | PENDING

## Evidence
<Concrete proof: case ids / Case-PO, Postgres column counts, test file + pass count,
orchestration trace, App Insights custom events, manual SPA steps performed.>

## Pending / gaps
<Honest list. Distinguish "field absent in source" (expected) from "bug remains".>

## How to re-verify
<Steps an operator or agent can repeat: intake mailbox, query, test command, KQL snippet.>
```

## Follow-up regression doc (optional)

Name: `changes-regression-DD-MM-YY.md` or `changes-<short-topic>.md` in the ticket folder.

```markdown
# TKT-NNN follow-up — <date> <short topic>

## What broke / what was found
...

## Fix
...

## Files touched
...

## Status of this follow-up
<code deployed | pending live confirm | blocked on …>
```
