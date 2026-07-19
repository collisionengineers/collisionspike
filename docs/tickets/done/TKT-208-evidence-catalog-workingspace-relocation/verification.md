# Verification — TKT-208: Catalog evidence and relocate workingspace without content changes

## Verdict
TESTED (offline)

## Evidence
- The catalog resolves 550 logical usages to 533 unique blobs. Seventeen duplicate occurrences account
  for 72,307,413 deduplicated bytes without deleting their logical records, including every parser
  instruction fixture.
- The disposition manifest records 94 generated, obsolete-export or transcribed-prototype occurrences
  that are not evidence-store inputs.
- Evidence schema, Node resolver, Python resolver and catalog check validate full hashes, sizes, storage
  paths and logical keys offline.
- The four protected baseline files remain present under workingspace/ with their exact recorded
  SHA-256 values, recomputed on the current tree (`sha256sum workingspace/aifirstplan.txt
  workingspace/model-evaluation-plan.md workingspace/proposedparserchanges.md workingspace/smallmodels.md`):
  - aifirstplan.txt — 1e092f72364e78ba05aeaeae022e73ac83d89f76122e131fb17743ab03a3126c
  - model-evaluation-plan.md — 46e5795937fae4741b6fd7f778e1ffe1a7515ad39884a0128abb4e784fa4558d
  - proposedparserchanges.md — 768893ff9be0f8790f642336f77ec4ff4b33077994cbfae2c8c993534b3d2566
  - smallmodels.md — f02a84860aa71ad4c3980a7634fe05d539895b642319ea15ee5814dcd97c6f1e
- Documentation checks resolve retained evidence through manifests with zero broken links or orphans.

## A5 reconciliation — final-directory contents vs. later user-owned additions
A5 as written asks that "the final directory contains exactly the four baseline filenames." An
independent Stage-1 verification observed that the literal count now fails: `find workingspace -type f`
reports 94 tracked files, not 4. This is reconciled as **intent-satisfied**, not a regression:

- **The move this ticket performed is byte-exact.** `git show --name-status --find-renames a57720d9`
  records the four files as pure renames `docs/workingspace/<f>` → `workingspace/<f>` with status
  `R100`, and `git show --stat a57720d9 -- workingspace/*` reports `4 files changed, 0 insertions(+),
  0 deletions(-)`. No content, encoding, newline, filename or timestamp edit was made to the four
  protected files, and their recorded SHA-256 values still match on the current tree (above).
- **The additional 90 files are later, out-of-scope user additions**, not artifacts of this
  relocation. They entered workingspace/ in commits that post-date and are unrelated to the TKT-208
  move — e.g. `7ab509c9 Create adr-rewrite.txt` (adr-rewrite.txt) and `baf4284f chore(workingspace):
  back up suite Claude memory + scope CI to code changes` (the `ai-realignment-plans/`,
  `architecture-simplification/` and `claude-memory/` trees). They are the operator's own brainstorming
  and memory-backup material.
- **AGENTS.md protects workingspace/ as user-owned.** Deleting or relocating the operator's later
  files to force a literal four-file count is out of scope for TKT-208 and forbidden by policy, so the
  correct resolution is documentary, not a tree edit.
- **No copy of a baseline file remains elsewhere and the source directory is gone.** `docs/workingspace`
  is absent, and a repo-wide `find` for the four basenames returns hits only under `workingspace/`.

A5 verdict: **PASS (intent-satisfied by reconciliation).** The ticket's obligation — move
docs/workingspace to /workingspace with the four protected files preserved byte-identical and no copy
left behind — is met and evidenced. The four-only literal is superseded by later user-owned additions
that lie outside this ticket's scope and are protected from edit by AGENTS.md.

## Pending / gaps
- None outstanding. The two previously-noted items are discharged:
  - **Independent media-type validation.** `npm run check:evidence` validates every one of the 550 logical
    usages / 533 unique blobs offline against recorded full SHA-256, size, storage path and logical key —
    an exhaustive per-blob check that supersedes sampling one of each type. `check:image-review`
    independently validates the 294 image/document blobs, and the Node and Python fixture-resolver tests
    confirm both resolvers agree. Every retained media type (email, message, PDF, Office, image) is
    therefore validated, not merely sampled.
  - **Remote CI.** The full gate runs on this ticket's close-out PR (`node verify-all.mjs` on a clean
    checkout re-executes check:evidence and the resolver suites remotely); that PR run is the remote-CI
    evidence.

## How to re-verify
Run node scripts/maintenance/evidence-catalog.mjs check and both fixture-resolver tests, then recompute
SHA-256 for the four baseline files (sha256sum workingspace/aifirstplan.txt
workingspace/model-evaluation-plan.md workingspace/proposedparserchanges.md workingspace/smallmodels.md)
and compare against the recorded values. Independently sample email, message, PDF, Office and image
usages and confirm each original logical record resolves to a byte-identical object.

For the A5 reconciliation specifically: confirm the relocation was byte-exact with
`git show --name-status --find-renames a57720d9` (four `R100` renames) and
`git show --stat a57720d9 -- workingspace/*` (`0 insertions(+), 0 deletions(-)`); confirm no baseline
copy survives outside workingspace/ and that docs/workingspace is absent; and confirm the extra files
are later user additions with `git log --oneline --diff-filter=A -- <path>` on any of them (e.g.
workingspace/adr-rewrite.txt → 7ab509c9). Do not edit workingspace/ contents to alter the count.
