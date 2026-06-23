---
name: junk-case-cleanup
description: Safely find and hard-delete BLANK / junk Case rows from live Dataverse — empty cases with no identity (no VRM, Case/PO, work provider, claimant or ref) that arrive when an email has nothing parseable and land in the error/Held bucket. Use when the Held queue (or the "error" cases) fills with empty rows and an operator asks to clear them. Dry-run-first, blank-guarded.
---

# Junk-case cleanup

Empty Cases accumulate in the **Held** queue: an email arrives with nothing the
parser can identify, so it is stamped `error` (the Held exception bucket) with
**no identity at all** — blank VRM, Case/PO, work provider, claimant name and
provider ref. These are junk: no value, and they clutter the queue.

> Routing context: the `error` → Held split is **intended** (a case carrying an
> unparseable attachment is a genuine exception, ADR/queue model). This skill does
> **not** change routing — it only removes the *verifiably empty* rows. A case with
> ANY identity is never touched.

## The script

`dataverse/.build/delete-junk-cases.ps1` (dot-sources `_corpus-common.ps1` for the
`az` token + Web-API helpers + transient retry). It is **DRY RUN by default** and
**blank-guarded** — it deletes a case only if every identity field is empty,
re-checked live immediately before the delete.

```powershell
# from dataverse/.build  (requires: az login to the Dev tenant)
pwsh ./delete-junk-cases.ps1                       # DRY RUN — list what WOULD be deleted
pwsh ./delete-junk-cases.ps1 -Execute              # delete the blank error-status cases (+ children)
pwsh ./delete-junk-cases.ps1 -Ids 'guid1','guid2' -Execute   # only these ids (still blank-guarded)
pwsh ./delete-junk-cases.ps1 -StatusInt 100000009 -Execute   # a different status bucket
```

Status integers (`cr1bd_casestatus`): **error = 100000010**, duplicate_risk = 100000009.
Resolve any other live with `Resolve-Choice "cr1bd_casestatus" "<Label>"`.

## Process

1. **Authenticate**: `az login` (or confirm `az account get-access-token` works) for
   the Dev environment — `_corpus-common.ps1` acquires the token from `az`.
2. **Dry run**: run with no flags. Confirm the TARGET list is the empty cases you
   expect and `with identity (skipped)` is what you want left alone. The operator's
   reported count may differ from live (more blanks can arrive between observation
   and run) — reconcile the difference with the operator before deleting if it
   matters.
3. **Execute**: re-run with `-Execute`. Each case is re-verified blank, then deleted
   (the case→child relationships cascade, so evidence/audit/notes go automatically;
   on a restrict-delete the script clears children first, then retries).
4. **Verify**: the script reports `deleted N`; confirm zero remain, e.g.
   `Get-Count -EntitySet 'cr1bd_cases' -Filter 'cr1bd_status eq 100000010' -IdField 'cr1bd_caseid'`.

## Safety rules (do not relax)

- **Never delete a case with identity.** The blank-guard (`Test-Blank`) is the
  load-bearing safety; only an all-empty case qualifies. If an operator wants to
  delete a non-empty case, that is a different, deliberate action — not this skill.
- **Dry run first, every time.** Show the operator the TARGET list before `-Execute`.
- **Hard delete is irreversible.** Live Dataverse rows are gone (no recycle bin).
  Confirm scope with the operator when the live count differs from what they asked for.
- This is a **maintenance** action on case data, distinct from the corpus scripts'
  "archive never hard-delete" rule (which is about provider/corpus reference rows).

## History

First used 2026-06-23 to clear 4 blank `error` cases (all created that day, no
identity) from the Held queue.
